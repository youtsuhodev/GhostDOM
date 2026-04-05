/**
 * Event router: keys are "${targetId}:${eventType}" (e.g. btn-inc:click) → handler(session, detail).
 * Handlers mutate session.state and must not send directly; they call queueUpdate(session).
 */

/**
 * @param {import('./session')} Session
 * @typedef {import('./renderLoop')} RenderLoopApi
 */

function createHandlers() {
  return {
    "btn-inc:click": (session) => {
      session.state.count += 1;
    },
    "btn-dec:click": (session) => {
      session.state.count -= 1;
    },
  };
}

let handlers = createHandlers();

function getHandlers() {
  return handlers;
}

module.exports = {
  getHandlers,
  createHandlers,
};
