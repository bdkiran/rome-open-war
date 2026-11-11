/**
 * Puts new HTML into an element, changing only the parts that differ.
 *
 * Panels are rendered as HTML strings, and rebuilding one wholesale on every
 * click throws away its elements: an opening animation plays again, scrolled
 * lists jump back to the top and a tooltip under the mouse closes. Patching
 * keeps every element that's still there, so a click that queues a building
 * only changes the boxes and the queue it touched.
 */
export function patchHtml(target: Element, html: string): void {
  const template = document.createElement("template");
  template.innerHTML = html;
  patchChildren(target, template.content);
}

/** Brings `target`'s children in line with `source`'s, reusing the ones that match. */
function patchChildren(target: Element, source: ParentNode): void {
  const before = [...target.childNodes];
  const after = [...source.childNodes];
  // A list that grew or shrank (a queue, a row of boxes): rebuild its contents, keep the list itself.
  if (before.length !== after.length) {
    target.replaceChildren(...after);
    return;
  }
  before.forEach((old, i) => {
    const next = after[i];
    if (old instanceof Element && next instanceof Element && old.tagName === next.tagName) {
      if (old.outerHTML === next.outerHTML) return;
      patchAttributes(old, next);
      patchChildren(old, next);
    } else if (old.nodeType === next.nodeType && !(old instanceof Element)) {
      if (old.nodeValue !== next.nodeValue) old.nodeValue = next.nodeValue;
    } else {
      target.replaceChild(next, old);
    }
  });
}

/** Copies `source`'s attributes onto `target` and drops the ones it no longer has. */
function patchAttributes(target: Element, source: Element): void {
  for (const { name } of [...target.attributes]) {
    if (!source.hasAttribute(name)) target.removeAttribute(name);
  }
  for (const { name, value } of [...source.attributes]) {
    if (target.getAttribute(name) !== value) target.setAttribute(name, value);
  }
}
