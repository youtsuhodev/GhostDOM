/**
 * One Session per browser connection: holds state, previous VDOM, WebSocket send.
 */

const { diff } = require("./diff");
const { serialize } = require("./vdom");

let _queueUpdate = () => {};

function setQueueUpdate(fn) {
  _queueUpdate = fn;
}

class Session {
  /**
   * @param {import('ws').WebSocket} ws
   * @param {string} id
   * @param {(msg: object) => void} broadcastDevtools
   */
  constructor(ws, id, broadcastDevtools) {
    this.ws = ws;
    this.id = id;
    this.state = { count: 0 };
    /** @type {object | null} */
    this.prevTree = null;
    /** After a user event, first flush renders with buttons disabled (server-driven UX). */
    this.uiPending = false;
    this.broadcastDevtools = broadcastDevtools;
  }

  /**
   * @param {object} msg
   */
  send(msg) {
    if (this.ws.readyState === 1) {
      this.ws.send(JSON.stringify(msg));
    }
  }

  /**
   * @param {string} eventType DOM event / interaction type (click, input, keydown, …)
   * @param {string} targetId
   * @param {unknown} [detail]
   */
  handleEvent(eventType, targetId, detail) {
    const key = `${targetId}:${eventType}`;
    const handler = require("./handlers").getHandlers()[key];
    this.uiPending = true;
    if (handler) {
      handler(this, detail);
    } else if (process.env.NODE_ENV !== "production") {
      console.warn("[GhostDOM] No handler for", key);
    }
    _queueUpdate(this);
  }

  /**
   * Run one render + diff + send cycle. If uiPending was true, schedule a second flush to clear disabled state.
   */
  flush() {
    const hadPending = this.uiPending;
    const { view } = require("./view");
    const nextTree = view(this.state, { uiPending: hadPending });

    if (this.prevTree == null) {
      this.send({
        type: "init",
        sessionId: this.id,
        tree: serialize(nextTree),
      });
    } else {
      const ops = diff(this.prevTree, nextTree);
      if (ops.length > 0) {
        this.send({
          type: "patch",
          sessionId: this.id,
          ops,
        });
        this.broadcastDevtools({
          type: "devtoolsPatch",
          sessionId: this.id,
          ops,
        });
      }
    }

    this.prevTree = nextTree;
    this.broadcastDevtools({
      type: "devtoolsVdom",
      sessionId: this.id,
      tree: serialize(nextTree),
    });

    if (hadPending) {
      this.uiPending = false;
      _queueUpdate(this);
    }
  }
}

module.exports = { Session, setQueueUpdate };
