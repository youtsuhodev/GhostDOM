/**
 * Virtual DOM builder for the server.
 *
 * - h(tag, attrs, children) builds element nodes.
 * - text(str) builds text leaves (ids are structural for leaves only — see README).
 * - Server-only attrs (onClick, key) are stripped from the wire format via serialize().
 *
 * Rule (MVP, enforced): every h() node MUST set attrs.id or attrs.key.
 * Auto-ids for elements are disabled so list reorder cannot silently remap element identity.
 */

const SERVER_ATTRS = new Set(["onClick", "key"]);

/**
 * @param {Record<string, unknown>} attrs
 * @returns {string}
 */
function resolveElementId(attrs) {
  if (attrs.id != null && attrs.id !== "") return String(attrs.id);
  if (attrs.key != null && attrs.key !== "") return `k_${String(attrs.key)}`;
  throw new Error(
    '[GhostDOM] VDOM: every h() element must set attrs.id or attrs.key. ' +
      "Without them, reordering children can corrupt identity and event routing.",
  );
}

/**
 * @returns {{ h: Function, text: Function }}
 */
function createRenderContext() {
  const stack = [0];

  function autoPathId() {
    return "a_" + stack.join("_");
  }

  /**
   * Text leaves only: structural id (not used for event targets; avoid reordering text siblings
   * without wrapping in h('span', { id | key }, …) if that list is dynamic).
   * @param {string} str
   */
  function text(str) {
    const id = autoPathId();
    stack[stack.length - 1]++;
    return { id, text: str };
  }

  /**
   * @param {string} tag
   * @param {Record<string, unknown>} attrs
   * @param {unknown[]} rawChildren
   */
  function h(tag, attrs = {}, rawChildren = []) {
    const id = resolveElementId(attrs);
    const node = {
      id,
      tag,
      attrs: { ...attrs },
      children: [],
    };

    stack.push(0);
    for (const item of rawChildren) {
      if (item == null) continue;
      if (typeof item === "string" || typeof item === "number") {
        node.children.push(text(String(item)));
      } else if (typeof item === "object" && "text" in item && item.tag == null) {
        node.children.push(item);
      } else {
        node.children.push(item);
      }
    }
    stack.pop();
    stack[stack.length - 1]++;

    return node;
  }

  return { h, text };
}

/**
 * Strip server-only attributes for messages sent to the client.
 * @param {Record<string, unknown>} attrs
 */
function wireAttrs(attrs) {
  const out = {};
  for (const [k, v] of Object.entries(attrs)) {
    if (SERVER_ATTRS.has(k)) continue;
    out[k] = v;
  }
  return out;
}

/**
 * Deep clone vnode for the wire: text leaves stay { id, text }; elements get wire attrs only.
 * @param {object} node
 */
function serialize(node) {
  if (node.text != null && node.tag == null) {
    return { id: node.id, text: node.text };
  }
  return {
    id: node.id,
    tag: node.tag,
    attrs: wireAttrs(node.attrs),
    children: node.children.map(serialize),
  };
}

module.exports = {
  createRenderContext,
  serialize,
  wireAttrs,
};
