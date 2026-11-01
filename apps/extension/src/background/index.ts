/**
 * @file apps/extension/src/background/index.ts
 * @description VaultGuard MV3 Background Service Worker Entrypoint.
 */

import { handleRuntimeMessage } from './messageRouter.js';
import { lockVault } from './session.js';

const ALARM_AUTO_LOCK = 'VAULT_AUTO_LOCK';
const ALARM_CLEAR_CLIPBOARD = 'CLEAR_CLIPBOARD';
const ALARM_EXPIRE_PENDING_SAVE = 'EXPIRE_PENDING_SAVE';

const g = globalThis as any;

if (g.chrome && g.chrome.alarms && g.chrome.alarms.onAlarm) {
  g.chrome.alarms.onAlarm.addListener((alarm: any) => {
    if (alarm.name === ALARM_AUTO_LOCK) {
      void lockVault();
    } else if (alarm.name === ALARM_CLEAR_CLIPBOARD) {
      if (g.chrome.runtime?.sendMessage) {
        g.chrome.runtime.sendMessage({ type: 'OFFSCREEN_CLEAR_CLIPBOARD' }).catch(() => {});
      }
    } else if (alarm.name === ALARM_EXPIRE_PENDING_SAVE) {
      if (g.chrome.action && g.chrome.action.setBadgeText) {
        g.chrome.action.setBadgeText({ text: '' });
      }
    }
  });
}

if (g.chrome && g.chrome.runtime && g.chrome.runtime.onMessage) {
  g.chrome.runtime.onMessage.addListener((msg: any, sender: any, sendResponse: (res: any) => void) => {
    if (g.chrome.runtime.id && sender.id && sender.id !== g.chrome.runtime.id) {
      sendResponse({
        ok: false,
        error: 'Unauthorized sender',
      });
      return false;
    }

    handleRuntimeMessage(msg, sender?.tab)
      .then(res => sendResponse(res))
      .catch(err => {
        sendResponse({
          ok: false,
          error: err instanceof Error ? err.message : String(err),
        });
      });

    return true; // Keep channel open for async response
  });
}
