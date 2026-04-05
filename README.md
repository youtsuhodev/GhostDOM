# GhostDOM

Experimental **Server-Driven UI Runtime** (MVP): the server owns state, builds a virtual DOM, diffs updates, and pushes minimal patches over a WebSocket. The browser is a thin layer that applies patches and forwards DOM events—**no application logic** on the client.

## Quick start

```bash
npm install
npm start
```

Open [http://127.0.0.1:3456/](http://127.0.0.1:3456/). Use two tabs to see **independent sessions** (each connection gets its own counter state).

### Environment

| Variable | Purpose |
|----------|---------|
| `PORT` | HTTP + WebSocket port (default `3456`) |
| `NODE_ENV=production` | Disables devtools WebSocket and default hot reload |
| `GHOSTDOM_DEVTOOLS=0` | Disables devtools even in development |
| `GHOSTDOM_DEVTOOLS=1` | Forces devtools WebSocket on |
| `GHOSTDOM_HOT_RELOAD=1` | Enables `fs.watch` reload of `view.js` / `handlers.js` |
| `GHOSTDOM_HOT_RELOAD=0` | Disables hot reload even in development |

In development (when `NODE_ENV` is not `production`), **hot reload** is on unless `GHOSTDOM_HOT_RELOAD=0`.

### Devtools UI

Open [http://127.0.0.1:3456/?devtools=1](http://127.0.0.1:3456/?devtools=1). The page opens a **second** WebSocket (`/ws?devtools=1`) that receives `devtoolsVdom` and `devtoolsPatch` messages (display only—still no client-side app logic).

## Architecture

```
client (vanilla)          server (Node.js)
     |                          |
     |------ WebSocket ---------|
     |  init / patch / error    |
     |  event (click, input)    |
     v                          v
 apply ops to DOM         view(state) -> VDOM
 + event delegation       diff(prev, next) -> ops
                          handlers[targetId:eventType]
```

## Virtual DOM (server)

- **Elements**: `{ id, tag, attrs, children }`
- **Text**: `{ id, text }` (no `tag`)
- **`server/src/vdom.js`** exposes `createRenderContext()` → `h(tag, attrs, children)` and `text(str)`.
- **Wire format**: `onClick` and `key` are **not** sent to the client; they are server-only hints for routing and stable IDs.

### Element identity (`id` / `key`) — **required**

**Rule:** every `h()` call **must** set **`attrs.id`** or **`attrs.key`** (non-empty). The runtime **throws** if neither is set. Auto-generated ids for **elements** are intentionally disabled: reordering a list without stable keys remaps node identity and breaks diffs and `targetId` routing.

- **`id`** — stable wire / DOM id (what the client sends back as `targetId` when applicable).
- **`key`** — server-only; becomes vnode id `k_${key}` on the wire (still stable across renders for that logical item). Stripped from HTML attributes in `serialize()`.

**Text leaves** from string children still get structural ids (`a_0_1_0` style) for patching. For **dynamic lists of text**, wrap segments in `h("span", { id: "…" })` or `{ key: "…" }` so reordering stays safe.

## Diffing (MVP)

Implemented in **`server/src/diff.js`** with one rule:

- **Valid pair** (same `id`, same kind text/element, and same `tag` for elements) → update in place: `setText`, `setAttrs` (full wire attrs), then recurse into children.
- **Otherwise** → `replaceChildren` on that parent with the **entire** next child list (one op, no partial sibling list).
- **Root** has no parent: if the root cannot be paired, emit **`replaceRoot`** with the full serialized tree (client remounts under `#root`).

This trims most structural edge cases: any mismatch at a child index forces a wholesale replace for that parent’s children.

## Event routing

**`server/src/handlers.js`** exports a map:

- Key: `` `${targetId}:${eventType}` `` (e.g. `btn-inc:click`)
- Value: `(session, detail) => { ... }` — mutate `session.state`, then rely on **`queueUpdate(session)`** (already invoked by `Session.handleEvent` after the handler).

The view assigns stable `data-sdui-id` on the client via `id` on each node; the client resolves the nearest ancestor with `data-sdui-id` and sends `targetId`.

## Render loop (batching)

**`server/src/renderLoop.js`** maintains a **dirty set** of sessions. `queueUpdate(session)` schedules **`setImmediate(flushAll)`**. Multiple state changes in the same turn collapse into **one flush batch** per macrotick where possible.

## Latency UX (server-driven)

On each user `event`, `Session` sets **`uiPending`**. The first flushed tree after that includes `disabled` / `aria-busy` on buttons; the next flush clears them. No extra logic in the browser beyond applying attributes from patches.

## Hot reload (development)

Changing **`server/src/view.js`** or **`server/src/handlers.js`** triggers a cache bust and reload. Every live session gets **`prevTree` cleared** and a fresh **`init`** on the next flush so structure and handlers stay consistent. Events that arrive mid-reload use the current code path after reload; this is best-effort for a demo.

## Project layout

| Path | Role |
|------|------|
| `server/src/index.js` | HTTP static server, WebSocket upgrade, session lifecycle |
| `server/src/renderLoop.js` | `queueUpdate` / `flushAll` |
| `server/src/session.js` | Per-connection state, flush, devtools broadcast hook |
| `server/src/vdom.js` | `h`, `text`, `serialize`, `wireAttrs` |
| `server/src/view.js` | `view(state, { uiPending })` |
| `server/src/handlers.js` | Event router map |
| `server/src/diff.js` | `diff(prev, next)` |
| `server/src/hotReload.js` | `fs.watch` + `require.cache` bust |
| `client/index.html` | Shell + optional devtools panel |
| `client/client.js` | WebSocket client, patch applier, delegation |
| `client/styles.css` | Basic styling |

## Protocol (JSON)

**Server → client**

- `{ type: "init", sessionId, tree }`
- `{ type: "patch", sessionId, ops }`
- `{ type: "error", message }`
- `{ type: "devtoolsVdom", sessionId, tree }` (devtools socket)
- `{ type: "devtoolsPatch", sessionId, ops }` (devtools socket)

**Client → server (UI)**

- `{ type: "<domEvent>", sessionId, targetId, detail? }` — top-level `type` is the interaction kind (`click`, `input`, `keydown`, `focus`, …), not a wrapper enum.

**Patch ops**

- `{ op: "setText", id, text }`
- `{ op: "setAttrs", id, attrs }` — full wire attribute replacement (except `data-sdui-id` preserved by the client)
- `{ op: "replaceChildren", parentId, children }`
- `{ op: "replaceRoot", tree }` — remount the app root (same as `init` DOM effect, without a new session)

## Pitfalls (by design)

- **`h()` must declare `id` or `key`** — enforced at runtime; dynamic lists without keys are a footgun for reorder + event routing.
- **Do not** grow a “smart” client—any reconciliation or business rules belong on the server.
- **Do not** chase a perfect diff algorithm until the protocol and sessions are stable; extend ops incrementally.
- **Sanitize** tags/attributes if trees ever come from untrusted sources (this MVP assumes trusted server output).
