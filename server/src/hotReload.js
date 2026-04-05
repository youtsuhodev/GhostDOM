/**
 * Development: watch view / handlers; bust require.cache and force all sessions to re-init.
 */

const fs = require("fs");
const path = require("path");

/**
 * @param {object} opts
 * @param {string} opts.viewPath
 * @param {string} opts.handlersPath
 * @param {() => void} opts.onModulesReloaded
 */
function setupHotReload({ viewPath, handlersPath, onModulesReloaded }) {
  const enabled =
    process.env.GHOSTDOM_HOT_RELOAD === "1" ||
    (process.env.NODE_ENV !== "production" && process.env.GHOSTDOM_HOT_RELOAD !== "0");

  if (!enabled) return;

  const watchFile = (absPath, label) => {
    fs.watch(absPath, { persistent: true }, (eventType) => {
      if (eventType !== "change") return;
      try {
        delete require.cache[viewPath];
        delete require.cache[handlersPath];
        require(viewPath);
        require(handlersPath);
        onModulesReloaded();
        console.log(`[GhostDOM] Hot reload: ${label}`);
      } catch (err) {
        console.error(`[GhostDOM] Hot reload failed (${label}):`, err);
      }
    });
  };

  watchFile(viewPath, "view.js");
  watchFile(handlersPath, "handlers.js");
  console.log("[GhostDOM] Hot reload enabled (view.js, handlers.js)");
}

function resolveModulePath(relativeFromServerSrc) {
  return path.join(__dirname, relativeFromServerSrc);
}

module.exports = { setupHotReload, resolveModulePath };
