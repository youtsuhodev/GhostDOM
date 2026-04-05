/**
 * Global render loop: coalesce multiple state changes into batched flushes per macrotask.
 */

/** @type {Set<import('./session').Session>} */
const dirty = new Set();
let flushScheduled = false;

/**
 * @param {(session: import('./session').Session) => void} flushSession
 */
function createRenderLoop(flushSession) {
  function flushAll() {
    flushScheduled = false;
    const batch = Array.from(dirty);
    dirty.clear();
    for (const session of batch) {
      flushSession(session);
    }
  }

  function queueUpdate(session) {
    dirty.add(session);
    if (!flushScheduled) {
      flushScheduled = true;
      setImmediate(flushAll);
    }
  }

  return { queueUpdate, flushAll };
}

module.exports = { createRenderLoop };
