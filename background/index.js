/**
 * VaultGuard MV3 Background Service Worker (Milestone 2C v0.2.5-totp)
 */
const ALARM_AUTO_LOCK = "VAULT_AUTO_LOCK";
const ALARM_EXPIRE_PENDING_SAVE = "EXPIRE_PENDING_SAVE";
if (globalThis.chrome && chrome.alarms && chrome.alarms.onAlarm) {
  chrome.alarms.onAlarm.addListener(alarm => {
    if (alarm.name === ALARM_AUTO_LOCK) {
      if (chrome.storage && chrome.storage.local) {
        chrome.storage.local.set({
          vg_session_unlocked: false
        });
      }
    } else if (alarm.name === ALARM_EXPIRE_PENDING_SAVE) {
      if (chrome.action && chrome.action.setBadgeText) {
        chrome.action.setBadgeText({
          text: ""
        });
      }
    }
  });
}
if (globalThis.chrome && chrome.runtime && chrome.runtime.onMessage) {
  chrome.runtime.onMessage.addListener((msg, sender, sendResponse) => {
    if (chrome.runtime.id && sender.id && sender.id !== chrome.runtime.id) {
      sendResponse({
        ok: false,
        error: "Unauthorized sender"
      });
      return false;
    }
    if (msg && msg.type === "OPEN_QUICK_FILL_POPUP" && chrome.action && chrome.action.openPopup) {
      chrome.action.openPopup().catch(() => {});
    }
    sendResponse({
      ok: true
    });
    return false;
  });
}