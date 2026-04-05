/**
 * Virtual DOM builder for the server.
 *
 * - h(tag, attrs, children) builds element nodes.
 * - text(str) builds text leaves.
 * - Server-only attrs (onClick, key) are stripped from the wire format via serialize().
 *
 * Auto-ID policy: explicit attrs.id > attrs.key as k_${key} > structural path a_0_1_0
 * (stable as long as the tree shape and h() call order stay the same).
 */

const SERVER_ATTRS = new Set(["onClick", "key"]);

/**
 * @returns {{ h: Function, text: Function }}
 */
function createRenderContext() {
  const stack = [0];

  function autoPathId() {
    return "a_" + stack.join("_");
  }

  function resolveId(attrs) {
    if (attrs.id != null && attrs.id !== "") return String(attrs.id);
    if (attrs.key != null && attrs.key !== "") return `k_${String(attrs.key)}`;
    return autoPathId();
  }

  /**
   * @param {string} str
   */
  function text(str) {
    const id = resolveId({});
    stack[stack.length - 1]++;
    return { id, text: str };
  }

  /**
   * @param {string} tag
   * @param {Record<string, unknown>} attrs
   * @param {unknown[]} rawChildren
   */
  function h(tag, attrs = {}, rawChildren = []) {
    const id = resolveId(attrs);
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
