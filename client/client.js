/**
 * Thin SDUI client: mount init tree, apply patches, forward DOM events.
 * No application logic — only DOM IO and optional devtools display.
 */

(function () {
  const root = document.getElementById("root");
  const devtoolsEl = document.getElementById("devtools");
  const devtoolsVdomEl = document.getElementById("devtools-vdom");
  const devtoolsPatchEl = document.getElementById("devtools-patch");

  const params = new URLSearchParams(window.location.search);
  const devtoolsOn = params.get("devtools") === "1";

  if (devtoolsOn) {
    devtoolsEl.classList.remove("devtools--hidden");
  }

  /** @type {Map<string, Node>} */
  const nodes = new Map();

  let sessionId = "";

  const proto = window.location.protocol === "https:" ? "wss" : "ws";
  const host = window.location.host;
  const wsUrl = `${proto}://${host}/ws`;
  const ws = new WebSocket(wsUrl);

  let devtoolsWs = null;
  if (devtoolsOn) {
    devtoolsWs = new WebSocket(`${wsUrl}?devtools=1`);
    devtoolsWs.addEventListener("message", (ev) => {
      try {
        const msg = JSON.parse(ev.data);
        if (msg.type === "devtoolsVdom") {
          devtoolsVdomEl.textContent = JSON.stringify(msg.tree, null, 2);
        }
        if (msg.type === "devtoolsPatch") {
          devtoolsPatchEl.textContent = JSON.stringify(msg.ops, null, 2);
        }
      } catch {
        /* ignore */
      }
    });
  }

  function resolveTargetId(target) {
    let el = target;
    while (el && el !== root) {
      if (el.dataset && el.dataset.sduiId) return el.dataset.sduiId;
      el = el.parentElement;
    }
    return "";
  }

  /** UI interaction: top-level `type` is the DOM event name (click, input, keydown, …). */
  function sendUiEvent(type, targetId, detail) {
    if (!sessionId || ws.readyState !== WebSocket.OPEN) return;
    ws.send(JSON.stringify({ type, sessionId, targetId, detail }));
  }

  root.addEventListener("click", (e) => {
    const targetId = resolveTargetId(e.target);
    if (!targetId) return;
    sendUiEvent("click", targetId, undefined);
  });

  root.addEventListener("input", (e) => {
    const t = e.target;
    const targetId = resolveTargetId(t);
    if (!targetId) return;
    const detail = { value: t.value };
    sendUiEvent("input", targetId, detail);
  });

  function unregisterDomNode(node) {
    if (node.nodeType === Node.TEXT_NODE) {
      const gid = node.__ghostId;
      if (gid) nodes.delete(gid);
      return;
    }
    if (node.nodeType === Node.ELEMENT_NODE) {
      const id = node.getAttribute("data-sdui-id");
      if (id) nodes.delete(id);
      for (const c of Array.from(node.childNodes)) unregisterDomNode(c);
    }
  }

  function applyAttrs(el, attrs) {
    if (!attrs) return;
    for (const [k, v] of Object.entries(attrs)) {
      if (v === false || v == null) el.removeAttribute(k);
      else if (v === true) el.setAttribute(k, "");
      else el.setAttribute(k, String(v));
    }
  }

  /** Full wire attr replace (so removed keys like disabled drop off the DOM). */
  function replaceWireAttrs(el, attrs) {
    const marker = el.getAttribute("data-sdui-id");
    for (let i = el.attributes.length - 1; i >= 0; i--) {
      const n = el.attributes[i].name;
      if (n !== "data-sdui-id") el.removeAttribute(n);
    }
    applyAttrs(el, attrs);
    if (marker) el.setAttribute("data-sdui-id", marker);
  }

  /**
   * @param {object} wire
   * @param {HTMLElement} parent
   */
  function mount(wire, parent) {
    if (wire.text != null && wire.tag == null) {
      const t = document.createTextNode(wire.text);
      t.__ghostId = wire.id;
      nodes.set(wire.id, t);
      parent.appendChild(t);
      return t;
    }

    const el = document.createElement(wire.tag);
    el.setAttribute("data-sdui-id", wire.id);
    nodes.set(wire.id, el);
    applyAttrs(el, wire.attrs);
    for (const c of wire.children || []) {
      mount(c, el);
    }
    parent.appendChild(el);
    return el;
  }

  function applyInit(tree) {
    root.innerHTML = "";
    nodes.clear();
    mount(tree, root);
  }

  function applyPatch(ops) {
    for (const op of ops) {
      if (op.op === "replaceRoot") {
        root.innerHTML = "";
        nodes.clear();
        mount(op.tree, root);
        continue;
      }
      if (op.op === "setText") {
        const n = nodes.get(op.id);
        if (n && n.nodeType === Node.TEXT_NODE) n.textContent = op.text;
        continue;
      }
      if (op.op === "setAttrs") {
        const n = nodes.get(op.id);
        if (n && n.nodeType === Node.ELEMENT_NODE) replaceWireAttrs(n, op.attrs);
        continue;
      }
      if (op.op === "replaceChildren") {
        const parent = nodes.get(op.parentId);
        if (!parent || parent.nodeType !== Node.ELEMENT_NODE) continue;
        for (const child of Array.from(parent.childNodes)) {
          unregisterDomNode(child);
          parent.removeChild(child);
        }
        for (const c of op.children || []) {
          mount(c, parent);
        }
        continue;
      }
    }
  }

  ws.addEventListener("message", (ev) => {
    let msg;
    try {
      msg = JSON.parse(ev.data);
    } catch {
      return;
    }

    if (msg.type === "init") {
      sessionId = msg.sessionId;
      applyInit(msg.tree);
      return;
    }
    if (msg.type === "patch") {
      applyPatch(msg.ops || []);
      return;
    }
    if (msg.type === "error") {
      console.warn("[GhostDOM]", msg.message);
    }
  });
})();
