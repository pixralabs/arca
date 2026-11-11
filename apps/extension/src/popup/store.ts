/**
 * @file apps/extension/src/popup/store.ts
 * @description Zustand Popup State Store (`zustand@5.0.0`) managing Vault Lifecycle,
 * WebAuthn PRF Biometric 3-Strike Fallback, Dual-Path Auto-Save Candidate, Quick-Fill,
 * Offline Tab-Capture QR Code Scanning (`VAULT_SCAN_QR_FROM_TAB`),
 * Opt-In Blind Relay Cloud Sync, New Device Authorization (`NEW_DEVICE_ATTEMPT`),
 * Active Device Revocation, and 5-Minute One-Time Ephemeral Secure Sharing (`VAULT_CREATE_SHARE`).
 */

import { create } from 'zustand';
import { BIOMETRIC_MAX_STRIKES } from '@vaultguard/shared';
import { DEFAULT_SYNC_SERVER_URL, importCsvBytesWithZeroization } from '@vaultguard/crypto';
import { handleRuntimeMessage } from '../background/messageRouter.js';
import { unlockVaultWithBiometrics } from '../options/biometrics.js';

async function sendRuntimeIpc(req: any): Promise<any> {
  const g = globalThis as any;
  if (g.chrome?.runtime?.sendMessage) {
    return g.chrome.runtime.sendMessage(req);
  }
  return handleRuntimeMessage(req);
}

export const usePopupStore = create<any>((set, get) => ({
  lifecycleState: 'LOCKED',
  isEphemeralFallback: false,
  autoLockMinutes: 15,
  backoffMs: 0,
  hasBiometricSlot: false,
  biometricStrikes: 0,
  pendingSaveCandidate: null,
  syncEnabled: false,
  syncServerUrl: DEFAULT_SYNC_SERVER_URL,
  accountId: '',
  deviceId: '',
  trustedDevices: [],
  pendingDeviceAttempts: [],
  activeShareModal: null,
  items: [],
  searchQuery: '',
  pendingRecoveryMnemonic: null,
  activeTab: 'vault',
  errorCode: null,
  toastMessageKey: null,

  setSearchQuery: (searchQuery: string) => set({ searchQuery }),
  setActiveTab: (activeTab: string) => set({ activeTab }),
  clearPendingRecoveryMnemonic: () => set({ pendingRecoveryMnemonic: null }),
  clearToast: () => set({ toastMessageKey: null }),
  closeShareModal: () => set({ activeShareModal: null }),

  createOneTimeShareForItem: async (item: any) => {
    try {
      const res = await sendRuntimeIpc({
        type: 'VAULT_CREATE_SHARE',
        title: item.title,
        username: item.username,
        password: item.password,
        url: item.urls?.[0] ?? '',
      });
      if (res && res.ok && typeof res.url === 'string') {
        const shareData = {
          shareId: String(res.shareId),
          shareKeyBase64: String(res.shareKeyBase64),
          url: String(res.url),
          expiresAt: Number(res.expiresAt),
        };
        set({ activeShareModal: shareData });
        return shareData;
      }
      return null;
    } catch {
      return null;
    }
  },

  refreshStatus: async () => {
    const res = await sendRuntimeIpc({ type: 'VAULT_STATUS' });
    if (res && res.ok) {
      const state = res.state;
      set({
        lifecycleState: state,
        isEphemeralFallback: Boolean(res.isEphemeralFallback),
        autoLockMinutes: typeof res.autoLockMinutes === 'number' ? res.autoLockMinutes : 15,
        backoffMs: typeof res.backoffMs === 'number' ? res.backoffMs : 0,
        hasBiometricSlot: Boolean(res.hasBiometricSlot),
        biometricStrikes:
          typeof res.biometricFailedAttempts === 'number' ? res.biometricFailedAttempts : 0,
        pendingSaveCandidate: res.pendingSaveCandidate ?? null,
        syncEnabled: Boolean(res.syncEnabled),
        syncServerUrl:
          typeof res.syncServerUrl === 'string' && res.syncServerUrl.length > 0
            ? res.syncServerUrl
            : DEFAULT_SYNC_SERVER_URL,
        accountId: typeof res.accountId === 'string' ? res.accountId : '',
        deviceId: typeof res.deviceId === 'string' ? res.deviceId : '',
      });
      if (state === 'UNLOCKED' || state === 'EPHEMERAL_FALLBACK') {
        await get().loadItems();
        await get().loadDevices();
      }
    }
  },

  updateSyncSettings: async (syncEnabled: boolean, serverUrl: string) => {
    try {
      const res = await sendRuntimeIpc({
        type: 'VAULT_UPDATE_SYNC_SETTINGS',
        syncEnabled,
        serverUrl,
      });
      if (res && res.ok) {
        set({
          syncEnabled: Boolean(res.syncEnabled),
          syncServerUrl: String(res.syncServerUrl ?? serverUrl),
          accountId: String(res.accountId ?? get().accountId),
          deviceId: String(res.deviceId ?? get().deviceId),
        });
        await get().loadDevices();
        return true;
      }
      return false;
    } catch {
      return false;
    }
  },

  loadDevices: async () => {
    try {
      const res = await sendRuntimeIpc({ type: 'VAULT_DEVICE_LIST' });
      if (res && res.ok) {
        set({
          deviceId: String(res.currentDeviceId ?? get().deviceId),
          trustedDevices: Array.isArray(res.devices) ? res.devices : [],
          pendingDeviceAttempts: Array.isArray(res.pendingAttempts) ? res.pendingAttempts : [],
        });
      }
    } catch {
      // Ignore if locked
    }
  },

  requestDeviceAuthorization: async (deviceName: string, recoveryMnemonic?: string) => {
    try {
      const res = await sendRuntimeIpc({
        type: 'VAULT_DEVICE_REQUEST',
        deviceName,
        recoveryMnemonic,
      });
      await get().loadDevices();
      return res;
    } catch {
      return null;
    }
  },

  approveOrDenyDeviceAttempt: async (
    targetDeviceId: string,
    approve: boolean,
    targetDevicePubKey?: string
  ) => {
    try {
      const res = await sendRuntimeIpc({
        type: 'VAULT_DEVICE_APPROVE',
        targetDeviceId,
        approve,
        targetDevicePubKey,
      });
      if (res && res.ok) {
        await get().loadDevices();
        return true;
      }
      return false;
    } catch {
      return false;
    }
  },

  revokeDevice: async (targetDeviceId: string) => {
    try {
      const res = await sendRuntimeIpc({
        type: 'VAULT_DEVICE_REVOKE',
        targetDeviceId,
      });
      if (res && res.ok) {
        await get().loadDevices();
        return true;
      }
      return false;
    } catch {
      return false;
    }
  },

  setupVault: async (masterPassword: string) => {
    set({ lifecycleState: 'UNLOCKING', errorCode: null });
    try {
      const res = await sendRuntimeIpc({
        type: 'VAULT_SETUP',
        masterPassword,
      });
      if (!res || !res.ok) {
        set({
          lifecycleState: 'UNINITIALIZED',
          errorCode: String(res?.code ?? 'ERR_SETUP'),
        });
        return false;
      }
      set({
        lifecycleState: res.state ?? 'UNLOCKED',
        pendingRecoveryMnemonic: String(res.recoveryMnemonic ?? ''),
        errorCode: null,
      });
      await get().loadDevices();
      return true;
    } catch {
      set({ lifecycleState: 'UNINITIALIZED', errorCode: 'ERR_SETUP' });
      return false;
    }
  },

  unlockWithMasterPassword: async (masterPassword: string) => {
    set({ lifecycleState: 'UNLOCKING', errorCode: null });
    try {
      const res = await sendRuntimeIpc({
        type: 'VAULT_UNLOCK_MASTER',
        masterPassword,
      });
      if (!res || !res.ok) {
        await get().refreshStatus();
        set({ errorCode: String(res?.code ?? 'ERR_UNLOCK') });
        return false;
      }
      await get().refreshStatus();
      return true;
    } catch {
      await get().refreshStatus();
      set({ errorCode: 'ERR_UNLOCK' });
      return false;
    }
  },

  unlockWithRecoveryPhrase: async (recoveryMnemonic: string) => {
    set({ lifecycleState: 'UNLOCKING', errorCode: null });
    try {
      const res = await sendRuntimeIpc({
        type: 'VAULT_UNLOCK_RECOVERY',
        recoveryMnemonic,
      });
      if (!res || !res.ok) {
        await get().refreshStatus();
        set({ errorCode: String(res?.code ?? 'ERR_RECOVERY') });
        return false;
      }
      await get().refreshStatus();
      return true;
    } catch {
      await get().refreshStatus();
      set({ errorCode: 'ERR_RECOVERY' });
      return false;
    }
  },

  unlockWithBiometrics: async () => {
    set({ lifecycleState: 'UNLOCKING', errorCode: null });
    try {
      const dek = await unlockVaultWithBiometrics();
      const res = await sendRuntimeIpc({
        type: 'VAULT_UNLOCK_BIOMETRICS',
        dek,
      });
      if (!res || !res.ok) {
        await get().refreshStatus();
        return false;
      }
      set({ biometricStrikes: 0, errorCode: null });
      await get().refreshStatus();
      return true;
    } catch {
      const nextStrikes = get().biometricStrikes + 1;
      set({
        lifecycleState: 'LOCKED',
        biometricStrikes: nextStrikes,
        hasBiometricSlot: nextStrikes < BIOMETRIC_MAX_STRIKES,
        errorCode: 'ERR_BIOMETRICS_FAILED',
      });
      return false;
    }
  },

  confirmPendingSave: async (candidate: any) => {
    const ok = await get().saveItem(
      {
        title: candidate.domain,
        username: candidate.username,
        password: candidate.password,
        urls: [candidate.originUrl],
        notes: '',
        totpSecret: null,
        customFields: [],
      },
      candidate.existingItemId ?? undefined
    );
    if (ok) {
      await sendRuntimeIpc({
        type: 'VAULT_DISMISS_PENDING_SAVE',
        tabId: candidate.tabId,
      });
      set({ pendingSaveCandidate: null });
    }
    return ok;
  },

  dismissPendingSave: async (candidate: any) => {
    await sendRuntimeIpc({
      type: 'VAULT_DISMISS_PENDING_SAVE',
      tabId: candidate.tabId,
    });
    set({ pendingSaveCandidate: null });
  },

  scanQrFromActiveTab: async () => {
    try {
      const res = await sendRuntimeIpc({ type: 'VAULT_SCAN_QR_FROM_TAB' });
      if (res && res.ok && typeof res.uri === 'string' && res.config) {
        return {
          uri: res.uri,
          config: res.config,
        };
      }
      return null;
    } catch {
      return null;
    }
  },

  autofillActiveTabItem: async (item: any) => {
    const res = await sendRuntimeIpc({
      type: 'VAULT_AUTOFILL_ACTIVE_TAB',
      itemId: item.id,
      frameId: 0,
    });
    return Boolean(res?.ok);
  },

  lock: async () => {
    await sendRuntimeIpc({ type: 'VAULT_LOCK' });
    set({
      lifecycleState: 'LOCKED',
      items: [],
      pendingRecoveryMnemonic: null,
      activeShareModal: null,
      errorCode: null,
    });
  },

  loadItems: async () => {
    const res = await sendRuntimeIpc({ type: 'VAULT_GET_ITEMS' });
    if (res && res.ok && Array.isArray(res.items)) {
      set({ items: res.items });
    }
  },

  saveItem: async (plaintext: any, id?: string) => {
    const res = await sendRuntimeIpc({
      type: 'VAULT_SAVE_ITEM',
      id,
      plaintext,
    });
    if (res && res.ok) {
      await get().loadItems();
      return true;
    }
    return false;
  },

  deleteItem: async (id: string) => {
    const res = await sendRuntimeIpc({
      type: 'VAULT_DELETE_ITEM',
      id,
    });
    if (res && res.ok) {
      await get().loadItems();
      return true;
    }
    return false;
  },

  copyToClipboardWithAutoClear: async (text: string) => {
    if (typeof navigator !== 'undefined' && navigator.clipboard?.writeText) {
      await navigator.clipboard.writeText(text);
    }
    await sendRuntimeIpc({
      type: 'VAULT_COPY_CLIPBOARD',
      text,
    });
    set({ toastMessageKey: 'vault.copied.toast' });
  },

  importCsv: async (csvBytes: Uint8Array) => {
    try {
      const result = await importCsvBytesWithZeroization(csvBytes);
      for (const item of result.plaintexts) {
        await get().saveItem(item);
      }
      await get().loadItems();
      return result;
    } finally {
      // Memory zeroization is guaranteed inside importCsvBytesWithZeroization
    }
  },
}));