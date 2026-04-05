/**
 * Pure view: builds a VDOM tree from application state.
 * uiPending: when true, interactive controls are disabled (server-driven latency UX).
 */

const { createRenderContext } = require("./vdom");

/**
 * @param {{ count: number }} state
 * @param {{ uiPending?: boolean }} opts
 */
function view(state, opts = {}) {
  const { h } = createRenderContext();
  const uiPending = Boolean(opts.uiPending);
  const busyAttr = uiPending ? { disabled: true, "aria-busy": "true" } : {};

  return h(
    "div",
    { id: "root", class: "app" },
    [
      h("h1", { id: "title" }, ["GhostDOM"]),
      h("p", { id: "label" }, ["Count: ", String(state.count)]),
      h(
        "button",
        {
          id: "btn-inc",
          type: "button",
          ...busyAttr,
          onClick: "inc",
        },
        ["+1"],
      ),
      h(
        "button",
        {
          id: "btn-dec",
          type: "button",
          ...busyAttr,
          onClick: "dec",
        },
        ["−1"],
      ),
    ],
  );
}

module.exports = { view };
