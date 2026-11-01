/**
 * @file apps/extension/src/content/fillGuard.ts
 * @description 5-Point Hit-Test, Top-Layer Popover Occlusion Guard (`isInputSafeAndUnoccluded`),
 * and Non-Mutating Trailing 28px `:focus` Badge Click Coordinate Trigger (`OPEN_QUICK_FILL_POPUP`).
 *
 * Security Invariants (Patch VG-05):
 * - Zero DOM node creation or injection (`0` `createElement`, `0` `appendChild`, `0` `innerHTML`).
 * - Zero inline CSS attribute mutations on host-page inputs.
 * - Walks the entire ancestor tree from `input` up to `document.documentElement` to reject any
 *   element or ancestor with `display: none`, `visibility: hidden` (or non-`visible`), `opacity < 1`,
 *   `filter` (such as `filter: opacity(0)`), or `clip-path` (such as `clip-path: inset(100%)`).
 * - Uses temporary `pointer-events: auto !important` override on popovers/overlays during
 *   the synchronous 5-point `document.elementsFromPoint()` check and restores in `finally`.
 */

export const MIN_INPUT_WIDTH_PX = 20;
export const MIN_INPUT_HEIGHT_PX = 12;
export const BADGE_CLICK_ZONE_WIDTH_PX = 28;

/**
 * Checks whether an `<input>` element is visible, within the viewport, free of ancestor
 * `filter` / `clip-path` / `visibility` / `opacity` cloaking, and completely unoccluded
 * across 5 sample points even in the presence of `pointer-events: none` popover overlays.
 */
export function isInputSafeAndUnoccluded(input) {
  if (!input || !input.isConnected) {
    return false;
  }

  // 1. Native checkVisibility + computed style check
  if (typeof input.checkVisibility === 'function') {
    const visible = input.checkVisibility({
      checkOpacity: true,
      checkVisibilityCSS: true
    });
    if (!visible) {
      return false;
    }
  }
  const inputStyle = window.getComputedStyle(input);
  if (inputStyle.display === 'none' || inputStyle.visibility === 'hidden' || inputStyle.visibility !== 'visible' || Number.parseFloat(inputStyle.opacity) < 1 || inputStyle.filter && inputStyle.filter !== 'none' || inputStyle.clipPath && inputStyle.clipPath !== 'none') {
    return false;
  }

  // 2. Bounding box minimum size & viewport containment
  const rect = input.getBoundingClientRect();
  if (rect.width < MIN_INPUT_WIDTH_PX || rect.height < MIN_INPUT_HEIGHT_PX) {
    return false;
  }
  if (rect.left < 0 || rect.top < 0 || rect.right > window.innerWidth || rect.bottom > window.innerHeight) {
    return false;
  }

  // 3. Patch VG-05: Walk up the entire parent tree to ensure no ancestor has
  //    filter: opacity(0) (or any non-'none' filter), clip-path, opacity < 1, or visibility: hidden.
  let ancestor = input.parentElement;
  while (ancestor) {
    const st = window.getComputedStyle(ancestor);
    if (st.display === 'none' || st.visibility === 'hidden' || st.visibility !== 'visible' || Number.parseFloat(st.opacity) < 1 || st.filter && st.filter !== 'none' || st.clipPath && st.clipPath !== 'none') {
      return false;
    }
    ancestor = ancestor.parentElement;
  }

  // 4. Temporary pointer-events override on top-layer popovers, dialogs, and pointer-events:none overlays
  const savedStyles = [];
  try {
    const candidates = document.querySelectorAll('[popover], :popover-open, dialog[open], body *');
    for (const el of candidates) {
      if (el === input || input.contains(el) || el.contains(input)) {
        continue;
      }
      const computed = window.getComputedStyle(el);
      const isTopLayerCandidate = el.hasAttribute('popover') || el.matches(':popover-open') || el.matches('dialog[open]');
      if (isTopLayerCandidate || computed.pointerEvents === 'none') {
        const styleDecl = Reflect.get(el, 'style');
        savedStyles.push({
          styleDecl,
          previousValue: styleDecl.getPropertyValue('pointer-events'),
          previousPriority: styleDecl.getPropertyPriority('pointer-events')
        });
        styleDecl.setProperty('pointer-events', 'auto', 'important');
      }
    }

    // 5. 5-Point Hit-Test (Center + 4 Corners inset by 2px)
    const insetX = Math.min(2, rect.width / 4);
    const insetY = Math.min(2, rect.height / 4);
    const samplePoints = [[rect.left + rect.width / 2, rect.top + rect.height / 2], [rect.left + insetX, rect.top + insetY], [rect.right - insetX, rect.top + insetY], [rect.left + insetX, rect.bottom - insetY], [rect.right - insetX, rect.bottom - insetY]];
    for (const [x, y] of samplePoints) {
      const hits = document.elementsFromPoint(x, y);
      if (!hits || hits.length === 0) {
        return false;
      }
      const topHit = hits[0];
      if (topHit !== input && !input.contains(topHit ?? null)) {
        return false;
      }
    }
    return true;
  } finally {
    for (const item of savedStyles) {
      if (item.previousValue) {
        item.styleDecl.setProperty('pointer-events', item.previousValue, item.previousPriority);
      } else {
        item.styleDecl.removeProperty('pointer-events');
      }
    }
  }
}

/**
 * Checks whether a trusted `pointerdown` event occurred inside the trailing 28px
 * `:focus` badge zone of a safe, unoccluded login `<input>`, and dispatches
 * `OPEN_QUICK_FILL_POPUP` to the MV3 Background Service Worker.
 */
export function isClickInsideTrailingBadgeZone(input, clientX, clientY) {
  if (!isInputSafeAndUnoccluded(input)) {
    return false;
  }
  const rect = input.getBoundingClientRect();
  return clientX >= rect.right - BADGE_CLICK_ZONE_WIDTH_PX && clientX <= rect.right && clientY >= rect.top && clientY <= rect.bottom;
}
export function registerQuickFillBadgeClickListener() {
  if (typeof document === 'undefined') return;
  document.addEventListener('pointerdown', event => {
    if (!event.isTrusted) return;
    const target = event.target;
    if (!(target instanceof HTMLInputElement)) return;
    if (document.activeElement !== target) return;
    const isLoginField = target.type === 'password' || target.type === 'email' || target.autocomplete === 'username' || target.autocomplete === 'current-password';
    if (!isLoginField) return;
    if (isClickInsideTrailingBadgeZone(target, event.clientX, event.clientY)) {
      const g = globalThis;
      if (g.chrome?.runtime?.sendMessage) {
        void g.chrome.runtime.sendMessage({
          type: 'OPEN_QUICK_FILL_POPUP'
        });
      }
    }
  }, {
    capture: true,
    passive: true
  });
}