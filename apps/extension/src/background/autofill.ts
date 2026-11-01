/**
 * @file apps/extension/src/background/autofill.ts
 * @description Background Coordinator for User-Gesture Autofill (`activeTab` + Origin Verifier)
 * and Non-Mutating `:focus` Input Badge Injection via `chrome.scripting.insertCSS` (`origin: 'USER'`).
 *
 * Security Patch VG-01 (v0.4.1):
 * - NEVER trusts `msg.tabUrl` or `msg.tabId` from popup or content runtime messages.
 * - Always queries `chrome.tabs.query({ active: true, currentWindow: true })` inside the background
 *   service worker to retrieve the real active tab ID and URL, and enforces `frameId === 0`.
 */

import { unsealItem } from '@vaultguard/crypto';
import {
  VaultGuardError,
  ERR_VAULT_LOCKED,
  ERR_SCHEMA_INVALID,
  ERR_AUTOFILL_ORIGIN_MISMATCH,
  ERR_AUTOFILL_SUBFRAME_DENIED,
} from '@vaultguard/shared';
import { readAllEncryptedItems } from '../vault/db.js';
import { getOrRestoreActiveDEK } from './session.js';
import { verifySenderOriginAgainstItemUrls } from './originVerifier.js';

export const NON_MUTATING_FOCUS_BADGE_CSS = `
input[type="password"]:focus:not([disabled]):not([readonly]),
input[autocomplete="username"]:focus:not([disabled]):not([readonly]),
input[autocomplete="current-password"]:focus:not([disabled]):not([readonly]) {
  background-image: url("data:image/svg+xml,%3Csvg xmlns='http://www.w3.org/2000/svg' width='18' height='18' viewBox='0 0 24 24' fill='none' stroke='%2310B981' stroke-width='2'%3E%3Crect x='3' y='11' width='18' height='11' rx='2'/%3E%3Cpath d='M7 11V7a5 5 0 0 1 10 0v4'/%3E%3C/svg%3E") !important;
  background-repeat: no-repeat !important;
  background-position: right 8px center !important;
  background-size: 18px 18px !important;
}
`;

export async function resolveRealActiveTab(): Promise<{ tabId: number; tabUrl: string }> {
  const g = globalThis as any;
  if (!g.chrome?.tabs?.query) {
    throw new VaultGuardError(
      ERR_AUTOFILL_ORIGIN_MISMATCH,
      'chrome.tabs.query is required in the background service worker to verify active tab origin.'
    );
  }
  const tabs = await g.chrome.tabs.query({
    active: true,
    currentWindow: true,
  });
  const activeTab = Array.isArray(tabs) ? tabs[0] : null;
  if (
    !activeTab ||
    typeof activeTab.id !== 'number' ||
    typeof activeTab.url !== 'string' ||
    activeTab.url.trim().length === 0
  ) {
    throw new VaultGuardError(
      ERR_AUTOFILL_ORIGIN_MISMATCH,
      'Unable to resolve active tab URL from chrome.tabs.query.'
    );
  }
  return {
    tabId: activeTab.id,
    tabUrl: activeTab.url,
  };
}

export async function injectNonMutatingFocusBadgeCss(tabId: number): Promise<boolean> {
  const g = globalThis as any;
  if (!g.chrome?.scripting?.insertCSS) {
    return false;
  }
  try {
    await g.chrome.scripting.insertCSS({
      target: {
        tabId,
        frameIds: [0],
      },
      origin: 'USER',
      css: NON_MUTATING_FOCUS_BADGE_CSS,
    });
    return true;
  } catch {
    return false;
  }
}

export interface PrepareAutofillRequest {
  itemId: string;
  frameId?: number;
  matchMode?: 'exact_origin' | 'base_domain' | 'never';
}

export interface PreparedAutofillResponse {
  tabId: number;
  username: string;
  password: string;
  hostname: string;
  exactHostMatch: boolean;
}

export async function prepareAutofillForTab(
  req: PrepareAutofillRequest
): Promise<PreparedAutofillResponse> {
  const frameId = typeof req.frameId === 'number' ? req.frameId : 0;
  if (frameId !== 0) {
    throw new VaultGuardError(
      ERR_AUTOFILL_SUBFRAME_DENIED,
      `Autofill denied in subframe (frameId=${String(frameId)}). Only frameId=0 is permitted.`
    );
  }
  const dek = await getOrRestoreActiveDEK();
  if (!dek) {
    throw new VaultGuardError(ERR_VAULT_LOCKED);
  }

  // Patch VG-01: Query the REAL active tab directly from the privileged chrome.tabs API
  const realActiveTab = await resolveRealActiveTab();
  const allItems = await readAllEncryptedItems();
  const targetRecord = allItems.find(r => r.id === req.itemId && r.deletedAt === null);
  if (!targetRecord) {
    throw new VaultGuardError(ERR_SCHEMA_INVALID);
  }

  const plaintext = await unsealItem(dek, targetRecord);
  const effectiveMatchMode =
    req.matchMode ??
    (plaintext.matchMode === 'base_domain' ? 'base_domain' : 'exact_origin');

  const match = verifySenderOriginAgainstItemUrls(
    {
      tabUrl: realActiveTab.tabUrl,
      frameId: 0,
    },
    plaintext.urls ?? [],
    effectiveMatchMode
  );

  await injectNonMutatingFocusBadgeCss(realActiveTab.tabId);

  return {
    tabId: realActiveTab.tabId,
    username: plaintext.username,
    password: plaintext.password,
    hostname: match.hostname,
    exactHostMatch: match.exactHostMatch,
  };
}
