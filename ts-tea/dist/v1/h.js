// Virtual DOM layer with diff/patch.
//
// A VNode is a tree describing what the DOM should look like. It is generic
// over Msg because event handlers in the tree produce messages — the view
// stays pure and never calls dispatch directly. The runtime passes dispatch
// into `render`, which wires it up when building real DOM event listeners.
//
// `render` keeps the previous VNode tree stashed on the mount element via
// a private symbol. On the next call it diffs old vs new and mutates the
// live DOM in place, reusing nodes whenever a tag matches. This preserves
// focus, selection, scroll position, <details> state, video playback, etc.
// — anything that lives on the real DOM and would be destroyed by a naive
// full-rebuild.
// Text node constructor. Msg defaults to `never` because a bare text node
// carries no handlers, so it's compatible with any Msg type.
export function text(s) {
    return { kind: "text", text: s };
}
// Element constructor. Children may be strings as a convenience; we wrap
// them in text nodes automatically.
export function h(tag, attrs, children = []) {
    const normalized = children.map((c) => typeof c === "string" ? text(c) : c);
    return { kind: "element", tag, attrs, children: normalized };
}
// ─── Render + state persistence ──────────────────────────────────────
// Stashed on the mount element so that successive calls to `render` can
// diff against the previous frame instead of rebuilding from scratch.
const PREV = Symbol("ts-tea.prev");
export function render(vnode, parent, dispatch) {
    const host = parent;
    const prev = host[PREV];
    if (prev === undefined) {
        // First render: build once and mount.
        const node = build(vnode, dispatch);
        parent.replaceChildren(node);
        host[PREV] = { vnode, node };
        return;
    }
    const node = patch(prev.vnode, vnode, prev.node, parent, dispatch);
    host[PREV] = { vnode, node };
}
// ─── Build (used on fresh subtrees) ──────────────────────────────────
function build(vnode, dispatch) {
    if (vnode.kind === "text") {
        return document.createTextNode(vnode.text);
    }
    const el = document.createElement(vnode.tag);
    for (const [key, value] of Object.entries(vnode.attrs)) {
        applyAttr(el, key, value, dispatch);
    }
    for (const child of vnode.children) {
        el.appendChild(build(child, dispatch));
    }
    return el;
}
// ─── Patch (the diff) ────────────────────────────────────────────────
// Mutate `node` so it represents `newVNode`, given that it currently
// represents `oldVNode`. Returns the node now representing newVNode —
// usually the same one, but a fresh replacement if the vnodes disagree
// enough that reuse isn't possible.
function patch(oldVNode, newVNode, node, parent, dispatch) {
    // Case 1: text → text. Just update textContent if needed.
    if (oldVNode.kind === "text" && newVNode.kind === "text") {
        if (oldVNode.text !== newVNode.text) {
            node.textContent = newVNode.text;
        }
        return node;
    }
    // Case 2: element → element with the same tag. Reuse the live element
    // and patch its attrs + children in place. This is the case that
    // preserves focus, scroll, etc.
    if (oldVNode.kind === "element" &&
        newVNode.kind === "element" &&
        oldVNode.tag === newVNode.tag) {
        const el = node;
        patchAttrs(el, oldVNode.attrs, newVNode.attrs, dispatch);
        patchChildren(el, oldVNode.children, newVNode.children, dispatch);
        return el;
    }
    // Case 3: any other mismatch (kind change, or tag change). Build a
    // fresh subtree and replace. We lose whatever DOM state was there, but
    // that's correct — the shape of the UI actually changed here.
    const fresh = build(newVNode, dispatch);
    parent.replaceChild(fresh, node);
    return fresh;
}
function patchAttrs(el, oldAttrs, newAttrs, dispatch) {
    // Remove attrs that existed before and are gone now.
    for (const [key, oldVal] of Object.entries(oldAttrs)) {
        if (!(key in newAttrs)) {
            removeAttr(el, key, oldVal);
        }
    }
    // Add or update new/changed attrs. Handlers are always "refreshed"
    // because inline closures never compare equal — but refreshing a
    // handler just writes to the slot, so it's cheap.
    for (const [key, newVal] of Object.entries(newAttrs)) {
        const oldVal = oldAttrs[key];
        const changed = oldVal !== newVal;
        const isHandler = typeof newVal === "function";
        if (changed || isHandler) {
            applyAttr(el, key, newVal, dispatch);
        }
    }
}
function patchChildren(parent, oldChildren, newChildren, dispatch) {
    const common = Math.min(oldChildren.length, newChildren.length);
    // Patch in-place for indices present in both.
    for (let i = 0; i < common; i++) {
        const oldChild = oldChildren[i];
        const newChild = newChildren[i];
        const childNode = parent.childNodes[i];
        if (oldChild === undefined ||
            newChild === undefined ||
            childNode === undefined) {
            continue;
        }
        patch(oldChild, newChild, childNode, parent, dispatch);
    }
    // Trim any extras left over from the previous render.
    while (parent.childNodes.length > newChildren.length) {
        const last = parent.lastChild;
        if (last === null)
            break;
        parent.removeChild(last);
    }
    // Append anything new that didn't have a match to patch against.
    for (let i = common; i < newChildren.length; i++) {
        const child = newChildren[i];
        if (child === undefined)
            continue;
        parent.appendChild(build(child, dispatch));
    }
}
// ─── Attribute application + removal ─────────────────────────────────
// Event handlers live in a slot on the element itself, reached via this
// symbol. A single real DOM listener per (element, eventName) reads from
// the slot on every event, so replacing the handler across renders is
// just a property write — no addEventListener / removeEventListener
// churn, no leaks.
const HANDLERS = Symbol("ts-tea.handlers");
function applyAttr(el, key, value, dispatch) {
    if (typeof value === "function") {
        const eventName = eventNameFor(key);
        const host = el;
        let slot = host[HANDLERS];
        if (slot === undefined) {
            slot = {};
            host[HANDLERS] = slot;
        }
        if (slot[eventName] === undefined) {
            // First time we've seen this event on this element: register one
            // stable wrapper that forwards to whatever is currently in the
            // slot. The wrapper never changes across renders.
            el.addEventListener(eventName, (event) => {
                const current = host[HANDLERS]?.[eventName];
                if (current !== undefined) {
                    dispatch(current(event));
                }
            });
        }
        slot[eventName] = value;
        return;
    }
    // Property-first so `value`, `checked`, `disabled`, `className` behave
    // like live state. Fall back to setAttribute for `class`, `aria-*`, etc.
    if (key in el) {
        el[key] = value;
    }
    else {
        el.setAttribute(key, String(value));
    }
}
function removeAttr(el, key, oldValue) {
    if (typeof oldValue === "function") {
        const eventName = eventNameFor(key);
        const host = el;
        if (host[HANDLERS] !== undefined) {
            host[HANDLERS][eventName] = undefined;
        }
        return;
    }
    if (key in el) {
        // Reset property to a neutral value of the right type. We don't know
        // the element's defaults, but this covers the common cases
        // (disabled→false, value→"", tabIndex→0).
        const reset = typeof oldValue === "boolean"
            ? false
            : typeof oldValue === "number"
                ? 0
                : "";
        el[key] = reset;
    }
    else {
        el.removeAttribute(key);
    }
}
function eventNameFor(key) {
    return key.startsWith("on") ? key.slice(2).toLowerCase() : key;
}
//# sourceMappingURL=h.js.map