/**
 * @file apps/extension/src/background/autoSave.ts
 * @description Dual-Path Auto-Save Coordinator (`UI_UX_SPEC.md` v1.1 §2.2 & `ARCHITECTURE.md` v4.1 §3.2).
 *
 * Responsibilities:
 * 1. Validates and binds submitted `(username, password)` strictly to `sender.tab.url` via `tldts`.
 * 2. Stages an encrypted `PendingSaveCandidate` in `chrome.storage.session` with a 120-second TTL
 *    (`chrome.alarms` `EXPIRE_PENDING_SAVE`).
 * 3. Sets a prominent green `"SAVE"` badge (`#10B981`) and triggers an OS toast notification via `chrome.notifications`.
 * 4. Attempts `chrome.action.openPopup().catch(() => {})` as progressive enhancement.
 */

import { parse } from 'tldts';
import { unsealItem } from '@vaultguard/crypto';
import { ALARM_EXPIRE_PENDING_SAVE, PENDING_SAVE_TTL_MINUTES } from '@vaultguard/shared';
import { readAllEncryptedItems } from '../vault/db.js';
import { getOrRestoreActiveDEK } from './session.js';

export const PENDING_SAVE_SESSION_KEY = 'vg_pending_save_candidate_v1';

export interface StagePendingCandidateParams {
  tabId: number;
  tabUrl: string;
  username: string;
  password: string;
}

export interface PendingSaveCandidate {
  id: string;
  tabId: number;
  originUrl: string;
  domain: string;
  username: string;
  password: string;
  isUpdate: boolean;
  existingItemId: string | null;
  stagedAt: number;
  expiresAt: number;
}

export async function stagePendingSaveCandidate(
  params: StagePendingCandidateParams
): Promise<PendingSaveCandidate | null> {
  let parsedUrl: URL;
  try {
    parsedUrl = new URL(params.tabUrl);
  } catch {
    return null;
  }
  if (parsedUrl.protocol !== 'https:') {
    return null;
  }

  const tld = parse(parsedUrl.hostname, {
    allowPrivateDomains: true,
  });
  const domain = tld.domain ?? parsedUrl.hostname;
  if (!domain) {
    return null;
  }

  let isUpdate = false;
  let existingItemId: string | null = null;

  // Check if credential already matches an item in the unlocked vault
  const dek = await getOrRestoreActiveDEK();
  if (dek) {
    const records = await readAllEncryptedItems();
    for (const rec of records) {
      if (rec.deletedAt !== null) continue;
      try {
        const plain = await unsealItem(dek, rec);
        if (plain && typeof plain === 'object' && plain.username === params.username) {
          isUpdate = true;
          existingItemId = rec.id;
          break;
        }
      } catch {
        // Ignore unseal failures
      }
    }
  }

  const now = Date.now();
  const candidate: PendingSaveCandidate = {
    id: crypto.randomUUID(),
    tabId: params.tabId,
    originUrl: parsedUrl.origin,
    domain,
    username: params.username,
    password: params.password,
    isUpdate,
    existingItemId,
    stagedAt: now,
    expiresAt: now + PENDING_SAVE_TTL_MINUTES * 60 * 1000,
  };

  const g = globalThis as any;
  if (g.chrome?.storage?.session) {
    await g.chrome.storage.session.set({
      [PENDING_SAVE_SESSION_KEY]: candidate,
    });
  }

  if (g.chrome?.alarms) {
    await g.chrome.alarms.clear(ALARM_EXPIRE_PENDING_SAVE);
    await g.chrome.alarms.create(ALARM_EXPIRE_PENDING_SAVE, {
      delayInMinutes: PENDING_SAVE_TTL_MINUTES,
    });
  }

  // Path B (Guaranteed Fallback): Prominent green "SAVE" badge + OS Notification toast
  if (g.chrome?.action?.setBadgeText) {
    await g.chrome.action.setBadgeText({
      text: 'SAVE',
      tabId: params.tabId,
    });
  }
  if (g.chrome?.action?.setBadgeBackgroundColor) {
    await g.chrome.action.setBadgeBackgroundColor({
      color: '#10B981',
      tabId: params.tabId,
    });
  }
  if (g.chrome?.notifications?.create) {
    g.chrome.notifications.create(`vg-save-${candidate.id}`, {
      type: 'basic',
      iconUrl: 'icons/48.png',
      title: 'Arca by Pixra — Save Login?',
      message: `Click the Arca SAVE badge to store your login for ${domain}.`,
    });
  }

  // Path A (Progressive Enhancement): Attempt automatic popup open if user gesture is active
  if (g.chrome?.action?.openPopup) {
    await g.chrome.action.openPopup().catch(() => {});
  }

  return candidate;
}

export async function getPendingSaveCandidate(): Promise<PendingSaveCandidate | null> {
  const g = globalThis as any;
  if (!g.chrome?.storage?.session) {
    return null;
  }
  const data = await g.chrome.storage.session.get([PENDING_SAVE_SESSION_KEY]);
  const raw = data[PENDING_SAVE_SESSION_KEY];
  if (!raw || typeof raw.domain !== 'string' || Date.now() > raw.expiresAt) {
    return null;
  }
  return raw as PendingSaveCandidate;
}

export async function clearPendingSaveCandidate(tabId?: number): Promise<void> {
  const g = globalThis as any;
  if (g.chrome?.storage?.session) {
    await g.chrome.storage.session.remove([PENDING_SAVE_SESSION_KEY]);
  }
  if (g.chrome?.alarms) {
    await g.chrome.alarms.clear(ALARM_EXPIRE_PENDING_SAVE);
  }
  if (g.chrome?.action?.setBadgeText) {
    await g.chrome.action.setBadgeText({
      text: '',
      tabId,
    });
  }
}
