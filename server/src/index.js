/**
 * GhostDOM — HTTP static server + WebSocket SDUI runtime.
 * Protocol: init | patch | error (→ client); UI messages (← client) use top-level type = DOM event (click, input, …).
 * Devtools WS: /ws?devtools=1 (non-production or GHOSTDOM_DEVTOOLS=1).
 */

const http = require("http");
const fs = require("fs");
const path = require("path");
const crypto = require("crypto");
const { WebSocketServer } = require("ws");
const { Session, setQueueUpdate } = require("./session");
const { createRenderLoop } = require("./renderLoop");
const { setupHotReload } = require("./hotReload");

const PORT = Number(process.env.PORT) || 3456;
const CLIENT_ROOT = path.join(__dirname, "..", "..", "client");

/** @type {Map<import('ws').WebSocket, import('./session').Session>} */
const sessions = new Map();
/** @type {Set<import('ws').WebSocket>} */
const devtoolsClients = new Set();

function devtoolsAllowed() {
  return (
    process.env.GHOSTDOM_DEVTOOLS === "1" ||
    (process.env.NODE_ENV !== "production" && process.env.GHOSTDOM_DEVTOOLS !== "0")
  );
}

function broadcastDevtools(msg) {
  if (!devtoolsAllowed()) return;
  const payload = JSON.stringify(msg);
  for (const ws of devtoolsClients) {
    if (ws.readyState === 1) ws.send(payload);
  }
}

function flushSession(session) {
  session.flush();
}

const { queueUpdate } = createRenderLoop(flushSession);
setQueueUpdate(queueUpdate);

const MIME = {
  ".html": "text/html; charset=utf-8",
  ".js": "text/javascript; charset=utf-8",
  ".css": "text/css; charset=utf-8",
};

function serveStatic(req, res) {
  const url = new URL(req.url || "/", `http://127.0.0.1:${PORT}`);
  let pathname = url.pathname === "/" ? "/index.html" : url.pathname;
  pathname = path.normalize(pathname).replace(/^(\.\.(\/|\\|$))+/, "");
  const filePath = path.join(CLIENT_ROOT, pathname);

  if (!filePath.startsWith(CLIENT_ROOT)) {
    res.writeHead(403).end("Forbidden");
    return;
  }

  fs.readFile(filePath, (err, data) => {
    if (err) {
      res.writeHead(404).end("Not found");
      return;
    }
    const ext = path.extname(filePath).toLowerCase();
    res.writeHead(200, { "Content-Type": MIME[ext] || "application/octet-stream" });
    res.end(data);
  });
}

const server = http.createServer(serveStatic);

const wss = new WebSocketServer({ noServer: true });

server.on("upgrade", (req, socket, head) => {
  const host = req.headers.host || `127.0.0.1:${PORT}`;
  const u = new URL(req.url || "/", `http://${host}`);
  if (u.pathname !== "/ws") {
    socket.destroy();
    return;
  }
  wss.handleUpgrade(req, socket, head, (ws) => {
    wss.emit("connection", ws, req);
  });
});

wss.on("connection", (ws, req) => {
  const host = req.headers.host || `127.0.0.1:${PORT}`;
  const u = new URL(req.url || "/", `http://${host}`);

  if (u.searchParams.get("devtools") === "1") {
    if (!devtoolsAllowed()) {
      ws.close(1008, "Devtools disabled");
      return;
    }
    devtoolsClients.add(ws);
    ws.on("close", () => devtoolsClients.delete(ws));
    return;
  }

  const sessionId = crypto.randomUUID();
  const session = new Session(ws, sessionId, broadcastDevtools);
  sessions.set(ws, session);

  ws.on("message", (raw) => {
    let msg;
    try {
      msg = JSON.parse(raw.toString());
    } catch {
      session.send({ type: "error", message: "Invalid JSON" });
      return;
    }

    // Client UI: { type: "click" | "input" | …, sessionId, targetId, detail? }
    if (
      typeof msg.type === "string" &&
      msg.type !== "" &&
      typeof msg.sessionId === "string" &&
      typeof msg.targetId === "string" &&
      msg.targetId !== ""
    ) {
      if (msg.sessionId !== session.id) return;
      session.handleEvent(msg.type, msg.targetId, msg.detail);
    }
  });

  ws.on("close", () => sessions.delete(ws));

  queueUpdate(session);
});

server.listen(PORT, () => {
  console.log(`[GhostDOM] http://127.0.0.1:${PORT}/`);
  console.log(`[GhostDOM] WebSocket: ws://127.0.0.1:${PORT}/ws`);
});

setupHotReload({
  viewPath: require.resolve("./view"),
  handlersPath: require.resolve("./handlers"),
  onModulesReloaded: () => {
    for (const s of sessions.values()) {
      s.prevTree = null;
      queueUpdate(s);
    }
  },
});
