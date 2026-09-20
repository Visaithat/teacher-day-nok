/**
 * Cached inline-style writes for the DOM overlay layer.
 *
 * Every overlay in the film is driven from the render loop rather than from
 * React state, which is the only way to keep them frame-accurate with the
 * camera. The source wrote roughly forty style properties every frame
 * unconditionally; most of them were the same value as the frame before.
 *
 * These helpers keep the last value written per element+property and skip the
 * write when nothing changed. That matters for more than CPU: an unchanged
 * style write still dirties the element, and combined with a layout read
 * elsewhere in the frame it is what produced the original's forced-reflow
 * loop.
 *
 * Only ever write `transform` and `opacity` where the design allows it - both
 * are composited on the GPU and never trigger layout.
 *
 * `SVGElement` does not extend `HTMLElement`, so everything here is keyed on
 * `Element` - the finale's leader lines are SVG and need the same caching.
 */

/** Anything with an inline style: `SVGElement` has one, it just is not an HTMLElement. */
type Styled = HTMLElement | SVGElement;

const cache = new WeakMap<Element, Map<string, string>>();

function changed(el: Element, prop: string, value: string): boolean {
  let seen = cache.get(el);
  if (!seen) {
    seen = new Map();
    cache.set(el, seen);
  }
  if (seen.get(prop) === value) return false;
  seen.set(prop, value);
  return true;
}

/** Write one inline style property if it differs from the last write. */
export function setStyle(
  el: Styled | null,
  prop:
    | 'opacity'
    | 'transform'
    | 'left'
    | 'right'
    | 'top'
    | 'height'
    | 'width'
    | 'display'
    | 'pointerEvents'
    | 'background'
    | 'backgroundImage'
    | 'fontSize'
    | 'maxWidth'
    | 'textAlign'
    | 'transition',
  value: string,
): void {
  if (!el || !changed(el, prop, value)) return;
  el.style[prop] = value;
}

/**
 * Write one attribute if it differs from the last write.
 *
 * For SVG geometry - `d`, `cx`, `cy`, `stroke-dashoffset` - which are
 * attributes rather than style properties. The cache is not a micro-
 * optimisation here: the finale's heads barely move, so the rounded path
 * string is usually byte-identical to the previous frame's and the write is
 * skipped entirely. Round the numbers you pass in, or it never hits.
 */
export function setAttr(el: Element | null, name: string, value: string): void {
  if (!el || !changed(el, `@${name}`, value)) return;
  el.setAttribute(name, value);
}

/** Set opacity from a number, rounded to a stable string. */
export function setOpacity(el: Styled | null, value: number): void {
  setStyle(el, 'opacity', value <= 0 ? '0' : value >= 1 ? '1' : value.toFixed(3));
}

/** Replace text content if it differs. */
export function setText(el: Element | null, value: string): void {
  if (!el || el.textContent === value) return;
  el.textContent = value;
}

/** Forget an element's cached values, e.g. after it is remounted. */
export function forgetStyles(el: Element | null): void {
  if (el) cache.delete(el);
}
