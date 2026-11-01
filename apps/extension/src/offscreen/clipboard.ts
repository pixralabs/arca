/**
 * @file apps/extension/src/offscreen/clipboard.ts
 * @description MV3 Offscreen Document Handler for 30-Second Clipboard Auto-Clear (`CLEAR_CLIPBOARD`).
 */

export async function clearSystemClipboard() {
  try {
    if (typeof navigator !== 'undefined' && navigator.clipboard?.writeText) {
      await navigator.clipboard.writeText('');
      return true;
    }
    return false;
  } catch {
    return false;
  }
}
const g = globalThis;
if (g.chrome?.runtime?.onMessage) {
  g.chrome.runtime.onMessage.addListener((msg, _sender, sendResponse) => {
    if (msg && msg.type === 'OFFSCREEN_CLEAR_CLIPBOARD') {
      void clearSystemClipboard().then(ok => sendResponse({
        ok
      }));
      return true;
    }
    return false;
  });
}