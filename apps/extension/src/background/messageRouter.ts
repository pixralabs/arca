/**
 * @file apps/extension/src/background/messageRouter.ts
 * @description Strict Runtime Message Router for Popup, Options, Content Script, Offscreen, and Share IPC
 * including Opt-In Zero-Knowledge Cloud Sync, New Device Authorization (`VAULT_DEVICE_REQUEST`,
 * `VAULT_DEVICE_APPROVE`, `VAULT_DEVICE_LIST`, `VAULT_DEVICE_REVOKE`), 24-Word Recovery Kit Bypass,
 * and 5-Minute One-Time Ephemeral Secure Sharing.
 */

import sodium from 'libsodium-wrappers-sumo';
import {
  createVault,
  unlockWithMaster,
  unlockWithRecovery,
  rotateMasterPassword,
  sealItem,
  unsealItem,
  signManifest,
  verifyManifest,
  computeBackoffDelayMs,
  buildSyncContentSecurityPolicy,
  createEphemeralShare,
  consumeEphemeralShare,
  burnEphemeralShare,
  registerSyncAccount,
  pushSyncDelta,
  pullSyncDelta,
  formatHlcTimestamp,
  requestDeviceAuthorization,
  approveOrDenyDevice,
  listTrustedDevices,
  revokeTrustedDevice,
  computeDeviceShortCode,
  deriveDeviceAuthKeyPair,
  TrustedDeviceRecord,
  NewDeviceAttemptEvent,
} from '@vaultguard/crypto';
import {
  DEFAULT_KDF_PARAMS,
  VaultGuardError,
  ERR_VAULT_LOCKED,
  ERR_VAULT_ROLLBACK,
  ERR_MANIFEST_MAC_FAILED,
  ERR_SCHEMA_INVALID,
  isValidVaultItemPlaintext,
} from '@vaultguard/shared';
import {
  readVaultHeader,
  writeVaultHeader,
  readVaultManifest,
  writeVaultManifest,
  readAllEncryptedItems,
  putEncryptedItemAndManifest,
  readBiometricSlot,
  readSyncConfig,
  writeSyncConfig,
} from '../vault/db.js';
import {
  establishUnlockedSession,
  getOrRestoreActiveDEK,
  getVaultLifecycleState,
  lockVault,
  scheduleClipboardClearAlarm,
  setAutoLockTimeoutMinutes,
  setVaultErrorState,
} from './session.js';
import { prepareAutofillForTab, injectNonMutatingFocusBadgeCss } from './autofill.js';
import {
  stagePendingSaveCandidate,
  getPendingSaveCandidate,
  clearPendingSaveCandidate,
} from './autoSave.js';
import { scanTotpQrFromActiveTab } from './qrScanner.js';

let consecutiveFailedUnlocks = 0;

// Local fallback registry for offline/sandbox device authorization & revocation state
const localDeviceRegistry = new Map<string, TrustedDeviceRecord>();
const localPendingAttempts = new Map<string, NewDeviceAttemptEvent>();

async function ensurePrimaryLocalDevice(
  accountId: string,
  deviceId: string,
  dek: Uint8Array
): Promise<void> {
  if (!accountId || !deviceId) return;
  if (!localDeviceRegistry.has(deviceId)) {
    const devKey = await deriveDeviceAuthKeyPair(dek, deviceId);
    const shortCode = await computeDeviceShortCode(accountId, deviceId, devKey.publicKeyBase64);
    sodium.memzero(devKey.privateKey);
    const now = Date.now();
    localDeviceRegistry.set(deviceId, {
      deviceId,
      deviceName: 'This Browser (Primary)',
      deviceAuthPubKey: devKey.publicKeyBase64,
      status: 'TRUSTED',
      shortCode,
      approvedByDeviceId: deviceId,
      lastSeenAt: now,
      createdAt: now,
    });
  }
}

async function syncAllLocalItemsToRelayIfEnabled(dek: Uint8Array): Promise<void> {
  const syncConfig = await readSyncConfig();
  if (!syncConfig.syncEnabled) {
    return; // 100% Local-First default: never touch network unless opt-in Cloud Sync is enabled
  }
  const header = await readVaultHeader();
  const { manifest } = await readVaultManifest();
  if (!header || !manifest) return;

  try {
    const encryptedHeaderB64 = sodium.to_base64(
      sodium.from_string(JSON.stringify(header)),
      sodium.base64_variants.ORIGINAL
    );
    await registerSyncAccount(syncConfig, dek, encryptedHeaderB64, true);

    const records = await readAllEncryptedItems();
    const envelopes = records.map((rec, idx) => ({
      itemId: rec.id,
      revision: rec.revision,
      nonceBase64: rec.nonce,
      ciphertextBase64: rec.ciphertext,
      hlcTimestamp: formatHlcTimestamp(rec.updatedAt, idx, syncConfig.deviceId),
      deletedAt: rec.deletedAt,
      updatedAt: rec.updatedAt,
    }));

    const encryptedManifestB64 = sodium.to_base64(
      sodium.from_string(JSON.stringify(manifest)),
      sodium.base64_variants.ORIGINAL
    );

    await pushSyncDelta(
      syncConfig,
      dek,
      {
        expectedVaultSeq: 0,
        encryptedManifest: encryptedManifestB64,
        items: envelopes,
      },
      Date.now(),
      true
    );
  } catch {
    // Offline-first resilience: local IndexedDB remains authoritative if relay is unreachable
  }
}

async function verifyVaultIntegrityWithDEK(dek: Uint8Array): Promise<void> {
  const { manifest, lastKnownVaultSeq } = await readVaultManifest();
  if (!manifest) {
    setVaultErrorState('CORRUPTED');
    throw new VaultGuardError(ERR_MANIFEST_MAC_FAILED);
  }
  try {
    await verifyManifest(dek, manifest, lastKnownVaultSeq);
  } catch (err) {
    if (err instanceof VaultGuardError && err.code === ERR_VAULT_ROLLBACK) {
      setVaultErrorState('ROLLBACK_DETECTED');
    } else {
      setVaultErrorState('CORRUPTED');
    }
    throw err;
  }
  const records = await readAllEncryptedItems();
  const activeRecords = records.filter(r => r.deletedAt === null);
  const manifestIds = Object.keys(manifest.itemRevisions);
  if (activeRecords.length !== manifestIds.length) {
    setVaultErrorState('CORRUPTED');
    throw new VaultGuardError(ERR_MANIFEST_MAC_FAILED);
  }
  for (const rec of activeRecords) {
    if (manifest.itemRevisions[rec.id] !== rec.revision) {
      setVaultErrorState('CORRUPTED');
      throw new VaultGuardError(ERR_MANIFEST_MAC_FAILED);
    }
  }
}

export async function handleRuntimeMessage(msg: any, senderTab?: any): Promise<any> {
  await sodium.ready;
  switch (msg.type) {
    case 'VAULT_STATUS': {
      const status = await getVaultLifecycleState();
      const biometricSlot = await readBiometricSlot();
      const pendingSave = await getPendingSaveCandidate();
      const syncConfig = await readSyncConfig();
      return {
        ok: true,
        ...status,
        hasBiometricSlot: Boolean(biometricSlot),
        biometricFailedAttempts: biometricSlot?.failedAttempts ?? 0,
        pendingSaveCandidate: pendingSave,
        syncEnabled: syncConfig.syncEnabled,
        syncServerUrl: syncConfig.serverUrl,
        accountId: syncConfig.accountId,
        deviceId: syncConfig.deviceId,
        activeCsp: buildSyncContentSecurityPolicy(syncConfig.syncEnabled, syncConfig.serverUrl),
        backoffMs: computeBackoffDelayMs(consecutiveFailedUnlocks),
      };
    }

    case 'VAULT_UPDATE_SYNC_SETTINGS': {
      const currentSync = await readSyncConfig();
      const updated = await writeSyncConfig({
        syncEnabled: Boolean(msg.syncEnabled),
        serverUrl: String(msg.serverUrl ?? currentSync.serverUrl),
        accountId: currentSync.accountId,
        deviceId: currentSync.deviceId,
      });
      const activeCsp = buildSyncContentSecurityPolicy(updated.syncEnabled, updated.serverUrl);

      if (updated.syncEnabled) {
        const dek = await getOrRestoreActiveDEK();
        if (dek) {
          await ensurePrimaryLocalDevice(updated.accountId, updated.deviceId, dek);
          await syncAllLocalItemsToRelayIfEnabled(dek);
          sodium.memzero(dek);
        }
      }

      return {
        ok: true,
        syncEnabled: updated.syncEnabled,
        syncServerUrl: updated.serverUrl,
        accountId: updated.accountId,
        deviceId: updated.deviceId,
        activeCsp,
      };
    }

    case 'VAULT_DEVICE_LIST': {
      const dek = await getOrRestoreActiveDEK();
      if (!dek) {
        throw new VaultGuardError(ERR_VAULT_LOCKED);
      }
      const syncConfig = await readSyncConfig();
      const ensuredConfig =
        syncConfig.accountId && syncConfig.deviceId
          ? syncConfig
          : await writeSyncConfig(syncConfig);
      await ensurePrimaryLocalDevice(ensuredConfig.accountId, ensuredConfig.deviceId, dek);

      try {
        if (ensuredConfig.syncEnabled) {
          const remote = await listTrustedDevices(ensuredConfig, dek, Date.now(), true);
          sodium.memzero(dek);
          return {
            ok: true,
            currentDeviceId: ensuredConfig.deviceId,
            devices: remote.devices,
            pendingAttempts: remote.pendingAttempts,
          };
        }
      } catch {
        // Fallback to local registry when offline
      }
      sodium.memzero(dek);
      return {
        ok: true,
        currentDeviceId: ensuredConfig.deviceId,
        devices: Array.from(localDeviceRegistry.values()),
        pendingAttempts: Array.from(localPendingAttempts.values()),
      };
    }

    case 'VAULT_DEVICE_REQUEST': {
      const dek = await getOrRestoreActiveDEK();
      if (!dek) {
        throw new VaultGuardError(ERR_VAULT_LOCKED);
      }
      const syncConfig = await readSyncConfig();
      const ensuredConfig =
        syncConfig.accountId && syncConfig.deviceId
          ? syncConfig
          : await writeSyncConfig(syncConfig);
      await ensurePrimaryLocalDevice(ensuredConfig.accountId, ensuredConfig.deviceId, dek);

      const targetDeviceId =
        typeof msg.newDeviceId === 'string' && msg.newDeviceId.trim().length > 0
          ? msg.newDeviceId.trim()
          : crypto.randomUUID();
      const deviceName =
        typeof msg.deviceName === 'string' && msg.deviceName.trim().length > 0
          ? msg.deviceName.trim()
          : 'New Arca Device';
      const recoveryMnemonic =
        typeof msg.recoveryMnemonic === 'string' && msg.recoveryMnemonic.trim().length > 0
          ? msg.recoveryMnemonic.trim()
          : undefined;

      try {
        if (ensuredConfig.syncEnabled) {
          const reqConfig = {
            ...ensuredConfig,
            deviceId: targetDeviceId,
            deviceName,
          };
          const res = await requestDeviceAuthorization(
            reqConfig,
            dek,
            {
              deviceName,
              recoveryMnemonicOrEntropy: recoveryMnemonic,
            },
            true
          );
          if (res.status === 'TRUSTED') {
            await pullSyncDelta(reqConfig, dek, 0, Date.now(), true).catch(() => {});
          }
          sodium.memzero(dek);
          return res;
        }
      } catch {
        // Fallback to local verification when relay is unreachable
      }

      const devKey = await deriveDeviceAuthKeyPair(dek, targetDeviceId);
      const shortCode = await computeDeviceShortCode(
        ensuredConfig.accountId,
        targetDeviceId,
        devKey.publicKeyBase64
      );
      sodium.memzero(devKey.privateKey);
      sodium.memzero(dek);

      const bypassUsed = Boolean(recoveryMnemonic && recoveryMnemonic.split(/\s+/).length === 24);
      const now = Date.now();
      const status = bypassUsed ? 'TRUSTED' : 'PENDING';

      localDeviceRegistry.set(targetDeviceId, {
        deviceId: targetDeviceId,
        deviceName,
        deviceAuthPubKey: devKey.publicKeyBase64,
        status,
        shortCode,
        approvedByDeviceId: bypassUsed ? 'RECOVERY_KIT_24_WORDS' : null,
        lastSeenAt: now,
        createdAt: now,
      });

      let event: NewDeviceAttemptEvent | null = null;
      if (!bypassUsed) {
        event = {
          type: 'NEW_DEVICE_ATTEMPT',
          newDeviceId: targetDeviceId,
          deviceName,
          deviceAuthPubKey: devKey.publicKeyBase64,
          shortCode,
          requestedAt: now,
        };
        localPendingAttempts.set(targetDeviceId, event);
      }

      return {
        ok: true,
        status,
        bypassUsed,
        deviceId: targetDeviceId,
        shortCode,
        event,
      };
    }

    case 'VAULT_DEVICE_APPROVE': {
      const dek = await getOrRestoreActiveDEK();
      if (!dek) {
        throw new VaultGuardError(ERR_VAULT_LOCKED);
      }
      const syncConfig = await readSyncConfig();
      const targetDeviceId = String(msg.targetDeviceId ?? '').trim();
      const approve = Boolean(msg.approve);
      const targetDevicePubKey =
        typeof msg.targetDevicePubKey === 'string' ? msg.targetDevicePubKey : undefined;

      try {
        if (syncConfig.syncEnabled) {
          const remoteRes = await approveOrDenyDevice(
            syncConfig,
            dek,
            {
              targetDeviceId,
              targetDevicePubKey,
              approve,
            },
            Date.now(),
            true
          );
          sodium.memzero(dek);
          localPendingAttempts.delete(targetDeviceId);
          const localDev = localDeviceRegistry.get(targetDeviceId);
          if (localDev) {
            localDev.status = approve ? 'TRUSTED' : 'REVOKED';
            localDev.approvedByDeviceId = syncConfig.deviceId;
          }
          return remoteRes;
        }
      } catch {
        // Fallback to local state
      }
      sodium.memzero(dek);
      localPendingAttempts.delete(targetDeviceId);
      const existing = localDeviceRegistry.get(targetDeviceId);
      if (existing) {
        existing.status = approve ? 'TRUSTED' : 'REVOKED';
        existing.approvedByDeviceId = syncConfig.deviceId;
        existing.lastSeenAt = Date.now();
      }
      return {
        ok: true,
        targetDeviceId,
        status: approve ? 'TRUSTED' : 'REVOKED',
      };
    }

    case 'VAULT_DEVICE_REVOKE': {
      const dek = await getOrRestoreActiveDEK();
      if (!dek) {
        throw new VaultGuardError(ERR_VAULT_LOCKED);
      }
      const syncConfig = await readSyncConfig();
      const targetDeviceId = String(msg.targetDeviceId ?? '').trim();

      try {
        if (syncConfig.syncEnabled) {
          const remoteRes = await revokeTrustedDevice(
            syncConfig,
            dek,
            targetDeviceId,
            Date.now(),
            true
          );
          sodium.memzero(dek);
          localPendingAttempts.delete(targetDeviceId);
          const localDev = localDeviceRegistry.get(targetDeviceId);
          if (localDev) {
            localDev.status = 'REVOKED';
          }
          return remoteRes;
        }
      } catch {
        // Fallback to local state
      }
      sodium.memzero(dek);
      localPendingAttempts.delete(targetDeviceId);
      const existing = localDeviceRegistry.get(targetDeviceId);
      if (existing) {
        existing.status = 'REVOKED';
        existing.lastSeenAt = Date.now();
      }
      return {
        ok: true,
        revokedDeviceId: targetDeviceId,
        status: 'REVOKED',
      };
    }

    case 'VAULT_CREATE_SHARE': {
      const dek = await getOrRestoreActiveDEK();
      if (!dek) {
        throw new VaultGuardError(ERR_VAULT_LOCKED);
      }
      sodium.memzero(dek);
      const created = await createEphemeralShare({
        title: String(msg.title ?? ''),
        username: String(msg.username ?? ''),
        password: String(msg.password ?? ''),
        url: String(msg.url ?? ''),
      });
      return {
        ok: true,
        ...created,
      };
    }

    case 'VAULT_CONSUME_SHARE': {
      const itemPayload = await consumeEphemeralShare(
        String(msg.shareId ?? ''),
        String(msg.shareKeyBase64 ?? ''),
        {
          burnAfterReading: Boolean(msg.burnAfterReading ?? true),
        }
      );
      return {
        ok: true,
        itemPayload,
      };
    }

    case 'VAULT_BURN_SHARE': {
      const burned = await burnEphemeralShare(String(msg.shareId ?? ''), {
        burnToken: typeof msg.burnToken === 'string' ? msg.burnToken : undefined,
        shareKeyBase64: typeof msg.shareKeyBase64 === 'string' ? msg.shareKeyBase64 : undefined,
      });
      return {
        ok: burned,
        burned,
      };
    }

    case 'VAULT_SETUP': {
      if (typeof msg.masterPassword !== 'string' || msg.masterPassword.length < 12) {
        throw new VaultGuardError(ERR_SCHEMA_INVALID);
      }
      const passwordBytes = new TextEncoder().encode(msg.masterPassword);
      const { header, dek, recoveryMnemonic } = await createVault(
        passwordBytes,
        DEFAULT_KDF_PARAMS
      );
      const initialManifest = await signManifest(dek, {
        version: 1,
        vaultSeq: 1,
        keyVersion: header.keyVersion,
        itemRevisions: {},
      });
      await writeVaultHeader(header);
      await writeVaultManifest(initialManifest);
      const state = await establishUnlockedSession(dek);
      sodium.memzero(dek);
      consecutiveFailedUnlocks = 0;
      return {
        ok: true,
        state,
        recoveryMnemonic,
      };
    }

    case 'VAULT_UNLOCK_MASTER': {
      const header = await readVaultHeader();
      if (!header) {
        throw new VaultGuardError(ERR_SCHEMA_INVALID);
      }
      const passwordBytes = new TextEncoder().encode(msg.masterPassword);
      try {
        const dek = await unlockWithMaster(header, passwordBytes);
        await verifyVaultIntegrityWithDEK(dek);
        const state = await establishUnlockedSession(dek);
        sodium.memzero(dek);
        consecutiveFailedUnlocks = 0;
        return {
          ok: true,
          state,
        };
      } catch (err) {
        consecutiveFailedUnlocks++;
        throw err;
      }
    }

    case 'VAULT_UNLOCK_RECOVERY': {
      const header = await readVaultHeader();
      if (!header) {
        throw new VaultGuardError(ERR_SCHEMA_INVALID);
      }
      try {
        const dek = await unlockWithRecovery(header, msg.recoveryMnemonic);
        await verifyVaultIntegrityWithDEK(dek);
        const state = await establishUnlockedSession(dek);
        sodium.memzero(dek);
        consecutiveFailedUnlocks = 0;
        return {
          ok: true,
          state,
          recoveryBypassAuthorized: true,
        };
      } catch (err) {
        consecutiveFailedUnlocks++;
        throw err;
      }
    }

    case 'VAULT_UNLOCK_BIOMETRICS': {
      const dekCopy = new Uint8Array(msg.dek);
      try {
        await verifyVaultIntegrityWithDEK(dekCopy);
        const state = await establishUnlockedSession(dekCopy);
        consecutiveFailedUnlocks = 0;
        return {
          ok: true,
          state,
        };
      } finally {
        sodium.memzero(dekCopy);
      }
    }

    case 'VAULT_LOCK': {
      await lockVault();
      return {
        ok: true,
        state: 'LOCKED',
      };
    }

    case 'VAULT_GET_ITEMS': {
      const dek = await getOrRestoreActiveDEK();
      if (!dek) {
        throw new VaultGuardError(ERR_VAULT_LOCKED);
      }
      await verifyVaultIntegrityWithDEK(dek);
      const records = await readAllEncryptedItems();
      const items: any[] = [];
      for (const rec of records) {
        if (rec.deletedAt !== null) continue;
        const plain = await unsealItem(dek, rec);
        items.push({
          ...plain,
          id: rec.id,
          revision: rec.revision,
          createdAt: rec.createdAt,
          updatedAt: rec.updatedAt,
          deletedAt: rec.deletedAt,
        });
      }
      sodium.memzero(dek);
      return {
        ok: true,
        items,
      };
    }

    case 'VAULT_SAVE_ITEM': {
      const dek = await getOrRestoreActiveDEK();
      if (!dek) {
        throw new VaultGuardError(ERR_VAULT_LOCKED);
      }
      if (!isValidVaultItemPlaintext(msg.plaintext)) {
        sodium.memzero(dek);
        throw new VaultGuardError(ERR_SCHEMA_INVALID);
      }
      const header = await readVaultHeader();
      const { manifest, lastKnownVaultSeq } = await readVaultManifest();
      if (!header || !manifest) {
        sodium.memzero(dek);
        throw new VaultGuardError(ERR_MANIFEST_MAC_FAILED);
      }
      await verifyManifest(dek, manifest, lastKnownVaultSeq);

      const records = await readAllEncryptedItems();
      const now = Date.now();
      const itemId = msg.id ?? crypto.randomUUID();
      const existing = records.find(r => r.id === itemId);
      const nextRevision = existing ? existing.revision + 1 : 1;
      const createdAt = existing ? existing.createdAt : now;

      const sealed = await sealItem(dek, msg.plaintext, {
        id: itemId,
        schemaVersion: 1,
        revision: nextRevision,
        createdAt,
        updatedAt: now,
        deletedAt: null,
      });

      const nextRevisions = {
        ...manifest.itemRevisions,
        [itemId]: nextRevision,
      };
      const nextManifest = await signManifest(dek, {
        version: 1,
        vaultSeq: manifest.vaultSeq + 1,
        keyVersion: header.keyVersion,
        itemRevisions: nextRevisions,
      });

      await putEncryptedItemAndManifest(sealed, nextManifest);
      await clearPendingSaveCandidate();

      // Push encrypted blob to relay if Opt-In Cloud Sync is enabled
      await syncAllLocalItemsToRelayIfEnabled(dek);
      sodium.memzero(dek);

      return {
        ok: true,
        itemId,
        revision: nextRevision,
      };
    }

    case 'VAULT_DELETE_ITEM': {
      const dek = await getOrRestoreActiveDEK();
      if (!dek) {
        throw new VaultGuardError(ERR_VAULT_LOCKED);
      }
      const header = await readVaultHeader();
      const { manifest, lastKnownVaultSeq } = await readVaultManifest();
      if (!header || !manifest) {
        sodium.memzero(dek);
        throw new VaultGuardError(ERR_MANIFEST_MAC_FAILED);
      }
      await verifyManifest(dek, manifest, lastKnownVaultSeq);

      const records = await readAllEncryptedItems();
      const existing = records.find(r => r.id === msg.id);
      if (!existing) {
        sodium.memzero(dek);
        throw new VaultGuardError(ERR_SCHEMA_INVALID);
      }
      const plain = await unsealItem(dek, existing);
      const now = Date.now();
      const nextRevision = existing.revision + 1;
      const tombstoned = await sealItem(dek, plain, {
        id: existing.id,
        schemaVersion: 1,
        revision: nextRevision,
        createdAt: existing.createdAt,
        updatedAt: now,
        deletedAt: now,
      });

      const nextRevisions = { ...manifest.itemRevisions };
      delete nextRevisions[existing.id];

      const nextManifest = await signManifest(dek, {
        version: 1,
        vaultSeq: manifest.vaultSeq + 1,
        keyVersion: header.keyVersion,
        itemRevisions: nextRevisions,
      });

      await putEncryptedItemAndManifest(tombstoned, nextManifest);

      // Push encrypted tombstone blob to relay if Opt-In Cloud Sync is enabled
      await syncAllLocalItemsToRelayIfEnabled(dek);
      sodium.memzero(dek);

      return {
        ok: true,
      };
    }

    case 'VAULT_ROTATE_PASSWORD': {
      const dek = await getOrRestoreActiveDEK();
      if (!dek) {
        throw new VaultGuardError(ERR_VAULT_LOCKED);
      }
      const header = await readVaultHeader();
      const { manifest, lastKnownVaultSeq } = await readVaultManifest();
      if (!header || !manifest) {
        sodium.memzero(dek);
        throw new VaultGuardError(ERR_MANIFEST_MAC_FAILED);
      }
      await verifyManifest(dek, manifest, lastKnownVaultSeq);

      const newPassBytes = new TextEncoder().encode(msg.newMasterPassword);
      const rotatedHeader = await rotateMasterPassword(dek.slice(), newPassBytes, header);
      const rotatedManifest = await signManifest(dek, {
        version: 1,
        vaultSeq: manifest.vaultSeq + 1,
        keyVersion: rotatedHeader.keyVersion,
        itemRevisions: manifest.itemRevisions,
      });

      await writeVaultHeader(rotatedHeader);
      await writeVaultManifest(rotatedManifest);
      sodium.memzero(dek);
      return {
        ok: true,
        keyVersion: rotatedHeader.keyVersion,
      };
    }

    case 'VAULT_AUTOFILL_ACTIVE_TAB':
    case 'VAULT_AUTOFILL_REQUEST': {
      const requestedItemId = String(msg.itemId ?? msg.payload?.itemId ?? '').trim();
      const requestedFrameId =
        typeof msg.frameId === 'number'
          ? msg.frameId
          : typeof msg.payload?.frameId === 'number'
          ? msg.payload.frameId
          : typeof senderTab?.frameId === 'number'
          ? senderTab.frameId
          : 0;

      const prepared = await prepareAutofillForTab({
        itemId: requestedItemId,
        frameId: requestedFrameId,
      });
      return {
        ok: true,
        ...prepared,
      };
    }

    case 'OPEN_QUICK_FILL_POPUP': {
      const targetTabId = msg.tabId ?? senderTab?.id;
      if (typeof targetTabId === 'number') {
        await injectNonMutatingFocusBadgeCss(targetTabId);
      }
      const g = globalThis as any;
      if (g.chrome?.action?.openPopup) {
        await g.chrome.action.openPopup().catch(() => {});
      }
      return {
        ok: true,
      };
    }

    case 'CANDIDATE_LOGIN_SUBMITTED': {
      const tabId = senderTab?.id ?? msg.tabId ?? 0;
      const tabUrl = senderTab?.url ?? msg.tabUrl ?? '';
      const candidate = await stagePendingSaveCandidate({
        tabId,
        tabUrl,
        username: msg.username,
        password: msg.password,
      });
      return {
        ok: Boolean(candidate),
        candidate,
      };
    }

    case 'VAULT_GET_PENDING_SAVE': {
      const candidate = await getPendingSaveCandidate();
      return {
        ok: true,
        candidate,
      };
    }

    case 'VAULT_DISMISS_PENDING_SAVE': {
      await clearPendingSaveCandidate(msg.tabId);
      return {
        ok: true,
      };
    }

    case 'VAULT_SCAN_QR_FROM_TAB': {
      const scanned = await scanTotpQrFromActiveTab();
      return {
        ok: true,
        ...scanned,
      };
    }

    case 'VAULT_COPY_CLIPBOARD': {
      await scheduleClipboardClearAlarm();
      return {
        ok: true,
      };
    }

    case 'VAULT_SET_AUTOLOCK': {
      await setAutoLockTimeoutMinutes(msg.minutes);
      return {
        ok: true,
        autoLockMinutes: msg.minutes,
      };
    }

    default:
      return { ok: false, error: 'Unknown message type' };
  }
}
