/**
 * Minimal VDOM diff — MVP rule:
 *
 * - If prev and next are a valid pair (same id, same kind, same tag for elements) → update in place
 *   (setText, setAttrs, recurse into children).
 * - Otherwise → replaceChildren on the parent with the full next sibling list (or replaceRoot at the host).
 *
 * This avoids most structural edge cases: any mismatch at a slot triggers a single wholesale replace for
 * that parent's children.
 */

const { serialize, wireAttrs } = require("./vdom");

function isText(n) {
  return n != null && n.text != null && n.tag == null;
}

function isElement(n) {
  return n != null && n.tag != null;
}

/**
 * Same identity and DOM shape can be patched without replacing the parent's entire child list.
 */
function canPairUpdate(prev, next) {
  if (prev == null || next == null) return false;
  if (prev.id !== next.id) return false;
  if (isText(prev) && isText(next)) return true;
  if (isElement(prev) && isElement(next) && prev.tag === next.tag) return true;
  return false;
}

function attrsEqual(a, b) {
  const ka = Object.keys(a);
  const kb = Object.keys(b);
  if (ka.length !== kb.length) return false;
  for (const k of ka) {
    if (a[k] !== b[k]) return false;
  }
  return true;
}

function wireAttrsForDiff(node) {
  return wireAttrs(node.attrs);
}

/**
 * @param {object|null} prev
 * @param {object|null} next
 * @returns {object[]}
 */
function diff(prev, next) {
  const ops = [];
  diffRoot(prev, next, ops);
  return ops;
}

function diffRoot(prev, next, ops) {
  if (next == null) return;
  if (prev == null) {
    ops.push({ op: "replaceRoot", tree: serialize(next) });
    return;
  }
  if (!canPairUpdate(prev, next)) {
    ops.push({ op: "replaceRoot", tree: serialize(next) });
    return;
  }
  if (isText(prev)) {
    if (prev.text !== next.text) {
      ops.push({ op: "setText", id: next.id, text: next.text });
    }
    return;
  }
  updateElementInPlace(prev, next, ops);
}

function updateElementInPlace(prevEl, nextEl, ops) {
  const wa = wireAttrsForDiff(prevEl);
  const wb = wireAttrsForDiff(nextEl);
  if (!attrsEqual(wa, wb)) {
    ops.push({ op: "setAttrs", id: nextEl.id, attrs: wb });
  }
  diffChildren(prevEl, nextEl, ops, nextEl.id);
}

function diffChildren(prevEl, nextEl, ops, parentId) {
  const prevCh = prevEl.children || [];
  const nextCh = nextEl.children || [];

  const replaceAllSiblings = () => {
    ops.push({
      op: "replaceChildren",
      parentId,
      children: nextCh.map(serialize),
    });
  };

  if (prevCh.length !== nextCh.length) {
    replaceAllSiblings();
    return;
  }

  for (let i = 0; i < prevCh.length; i++) {
    if (!canPairUpdate(prevCh[i], nextCh[i])) {
      replaceAllSiblings();
      return;
    }
  }

  for (let i = 0; i < prevCh.length; i++) {
    updateInPlace(prevCh[i], nextCh[i], ops);
  }
}

function updateInPlace(prev, next, ops) {
  if (isText(prev)) {
    if (prev.text !== next.text) {
      ops.push({ op: "setText", id: next.id, text: next.text });
    }
    return;
  }
  updateElementInPlace(prev, next, ops);
}

module.exports = { diff };
