/**
 * @file apps/mobile/src/services/CloudBackupService.ts
 * @description Automated Zero-Knowledge Cloud Backup Service (Render + Supabase).
 *
 * Implements:
 * 1. 1-Click Automated Cloud Backup Registration using DEK-derived Ed25519 identity.
 * 2. Background Auto-Sync: automatically pushes encrypted CRDT item deltas on every change.
 * 3. Disaster Recovery Restore Flow: reconstructs the entire vault and SQLite DB
 *    from Render + Supabase after app deletion or device switch.
 * 4. Zero-Knowledge Guarantees: All items sealed with XChaCha20-Poly1305 before leaving device.
 */

import AsyncStorage from '@react-native-async-storage/async-storage';
import {
  getAllVaultItems,
  saveVaultItem,
  getVaultMeta,
  saveVaultMeta,
  createVaultRecord,
  StoredMobileItem,
  ensureDatabaseReady,
} from '../storage/db';
import sodiumJsi from '../crypto/sodiumJsi';

export const CLOUD_SERVER_URL = 'https://arca-rc8v.onrender.com';
export const PREF_CLOUD_BACKUP_ENABLED = '@arca_cloud_sync_enabled';
export const PREF_SYNC_ACCOUNT_ID = '@arca_sync_account_id';
export const PREF_SYNC_DEVICE_ID = '@arca_sync_device_id';
export const PREF_LAST_SYNC_TIMESTAMP = '@arca_last_sync_timestamp';
export const PREF_SYNC_VAULT_SEQ = '@arca_sync_vault_seq';

export type CloudSyncStatus = 'synced' | 'syncing' | 'offline' | 'disabled';

let _sodium: any = null;
function getSodium(): any {
  if (!_sodium) {
    try {
      const mod = require('react-native-sodium-jsi');
      _sodium = mod?.default ?? mod ?? sodiumJsi;
    } catch {
      _sodium = sodiumJsi;
    }
  }
  return _sodium;
}

let _crypto: any = null;
function getCrypto(): any {
  if (!_crypto) {
    _crypto = require('@vaultguard/crypto');
  }
  return _crypto;
}

export interface SyncItemEnvelope {
  itemId: string;
  revision: number;
  nonceBase64: string;
  ciphertextBase64: string;
  hlcTimestamp: string;
  deletedAt: number | null;
  updatedAt: number;
}

export interface CloudStatusInfo {
  enabled: boolean;
  status: CloudSyncStatus;
  lastSyncTime: number | null;
  accountId: string | null;
  itemCount?: number;
  error?: string | null;
}

class CloudBackupService {
  private isSyncing = false;
  private syncListeners: Array<(info: CloudStatusInfo) => void> = [];

  subscribe(listener: (info: CloudStatusInfo) => void): () => void {
    this.syncListeners.push(listener);
    void this.getStatus().then(listener);
    return () => {
      this.syncListeners = this.syncListeners.filter((l) => l !== listener);
    };
  }

  private notify(info: CloudStatusInfo) {
    for (const listener of this.syncListeners) {
      try {
        listener(info);
      } catch {}
    }
  }

  async isEnabled(): Promise<boolean> {
    const val = await AsyncStorage.getItem(PREF_CLOUD_BACKUP_ENABLED).catch(() => null);
    return val === 'true';
  }

  async getStatus(): Promise<CloudStatusInfo> {
    const enabled = await this.isEnabled();
    const lastSyncStr = await AsyncStorage.getItem(PREF_LAST_SYNC_TIMESTAMP).catch(() => null);
    const lastSyncTime = lastSyncStr ? parseInt(lastSyncStr, 10) : null;
    const accountId = await AsyncStorage.getItem(PREF_SYNC_ACCOUNT_ID).catch(() => null);

    let status: CloudSyncStatus = 'disabled';
    if (enabled) {
      status = this.isSyncing ? 'syncing' : 'synced';
    }

    return {
      enabled,
      status,
      lastSyncTime,
      accountId,
    };
  }

  /**
   * Deterministically derives Account ID and Ed25519 Account KeyPair from the DEK.
   */
  async deriveAccountKeys(dek: Uint8Array): Promise<{
    accountId: string;
    accountAuthPubKey: string;
    accountKeyPair: any;
  }> {
    const sodium = getSodium();
    await sodium.ready;
    const authSeed = sodium.crypto_generichash(32, dek, sodium.from_string('VG_AUT_1'));
    const accountKeyPair = sodium.crypto_sign_seed_keypair(authSeed);
    const accountAuthPubKey = sodium.to_base64(
      accountKeyPair.publicKey,
      sodium.base64_variants.ORIGINAL
    );
    const accountId = sodium.to_hex(accountKeyPair.publicKey).slice(0, 32);
    return { accountId, accountAuthPubKey, accountKeyPair };
  }

  /**
   * Gets or initializes the device identity.
   */
  async getOrCreateDeviceId(): Promise<string> {
    let deviceId = await AsyncStorage.getItem(PREF_SYNC_DEVICE_ID).catch(() => null);
    if (!deviceId) {
      const sodium = getSodium();
      await sodium.ready;
      deviceId = 'dev_android_' + sodium.to_hex(sodium.randombytes_buf(6));
      await AsyncStorage.setItem(PREF_SYNC_DEVICE_ID, deviceId).catch(() => {});
    }
    return deviceId;
  }

  /**
   * Activates 1-Click Zero-Knowledge Cloud Backup.
   */
  async enableCloudBackup(
    dek: Uint8Array,
    headerRaw?: string
  ): Promise<{ success: boolean; itemsSynced: number; error?: string }> {
    this.isSyncing = true;
    this.notify({ enabled: true, status: 'syncing', lastSyncTime: null, accountId: null });

    try {
      const sodium = getSodium();
      await sodium.ready;

      const { accountId, accountAuthPubKey, accountKeyPair } = await this.deriveAccountKeys(dek);
      const deviceId = await this.getOrCreateDeviceId();

      // Get vault header to store encrypted on server
      let headerStr = headerRaw;
      if (!headerStr) {
        headerStr = (await getVaultMeta('header')) || JSON.stringify({ version: 1 });
      }
      const encryptedHeaderB64 = sodium.to_base64(
        sodium.from_string(headerStr),
        sodium.base64_variants.ORIGINAL
      );

      // Sign registration proof
      const preimage = `VG_SYNC_REGISTER_V1:${accountId}:${accountAuthPubKey}`;
      const sig = sodium.crypto_sign_detached(
        sodium.from_string(preimage),
        accountKeyPair.privateKey
      );
      const registrationSignature = sodium.to_base64(sig, sodium.base64_variants.ORIGINAL);

      // Call Rust Relay Server POST /v1/auth/register
      const regRes = await fetch(`${CLOUD_SERVER_URL}/v1/auth/register`, {
        method: 'POST',
        headers: { 'Content-Type': 'application/json' },
        body: JSON.stringify({
          accountId,
          deviceId,
          deviceName: 'Android Mobile (Arca)',
          accountAuthPubKey,
          deviceAuthPubKey: accountAuthPubKey,
          recoveryAuthPubKey: null,
          encryptedHeader: encryptedHeaderB64,
          registrationSignature,
        }),
      });

      if (!regRes.ok) {
        const errJson = await regRes.json().catch(() => ({}));
        throw new Error(errJson.error || `HTTP ${regRes.status}`);
      }

      const regData = await regRes.json();
      const vaultSeq = regData.vaultSeq || 1;

      await AsyncStorage.setItem(PREF_CLOUD_BACKUP_ENABLED, 'true');
      await AsyncStorage.setItem(PREF_SYNC_ACCOUNT_ID, accountId);
      await AsyncStorage.setItem(PREF_SYNC_VAULT_SEQ, String(vaultSeq));

      // Push all existing local items to Supabase
      const itemsSynced = await this.pushAllLocalItems(dek, accountId, deviceId, accountKeyPair, vaultSeq);

      this.isSyncing = false;
      const statusInfo: CloudStatusInfo = {
        enabled: true,
        status: 'synced',
        lastSyncTime: Date.now(),
        accountId,
        itemCount: itemsSynced,
      };
      this.notify(statusInfo);

      return { success: true, itemsSynced };
    } catch (err: any) {
      this.isSyncing = false;
      const msg = err?.message || 'Failed to activate cloud backup';
      this.notify({ enabled: false, status: 'offline', lastSyncTime: null, accountId: null, error: msg });
      return { success: false, itemsSynced: 0, error: msg };
    }
  }

  /**
   * Pushes all local SQLite items to the Cloud Relay.
   */
  async pushAllLocalItems(
    dek: Uint8Array,
    accountId?: string,
    deviceId?: string,
    accountKeyPair?: any,
    currentSeq?: number
  ): Promise<number> {
    const sodium = getSodium();
    await sodium.ready;

    const accId = accountId || (await AsyncStorage.getItem(PREF_SYNC_ACCOUNT_ID));
    const devId = deviceId || (await AsyncStorage.getItem(PREF_SYNC_DEVICE_ID));
    if (!accId || !devId) {
      throw new Error('Cloud backup account not initialized');
    }

    let keyPair = accountKeyPair;
    if (!keyPair) {
      const derived = await this.deriveAccountKeys(dek);
      keyPair = derived.accountKeyPair;
    }

    const items = await getAllVaultItems(true);
    if (items.length === 0) {
      return 0;
    }

    // 1. Request Challenge Nonce
    const chalRes = await fetch(`${CLOUD_SERVER_URL}/v1/auth/challenge`, {
      method: 'POST',
      headers: { 'Content-Type': 'application/json' },
      body: JSON.stringify({ accountId: accId, deviceId: devId }),
    });

    if (!chalRes.ok) {
      throw new Error('Failed to obtain sync challenge from relay');
    }
    const { challengeNonce } = await chalRes.json();

    // 2. Format Sync Item Envelopes
    const envelopes: SyncItemEnvelope[] = items.map((it) => ({
      itemId: it.id,
      revision: 1,
      nonceBase64: it.nonce,
      ciphertextBase64: it.ciphertext,
      hlcTimestamp: it.hlc || `${it.updated_at}:0:mobile`,
      deletedAt: it.is_deleted === 1 ? it.updated_at : null,
      updatedAt: it.updated_at,
    }));

    // 3. Build Push Body & Compute SHA-256
    const expectedVaultSeq = currentSeq || parseInt((await AsyncStorage.getItem(PREF_SYNC_VAULT_SEQ)) || '1', 10);
    const pushBodyObj = {
      expectedVaultSeq,
      encryptedManifest: null,
      items: envelopes,
    };
    const pushBodyStr = JSON.stringify(pushBodyObj);

    const bodyBytes = sodium.from_string(pushBodyStr);
    const bodySha256 = sodium.to_hex(sodium.crypto_hash_sha256(bodyBytes));
    const timestamp = Date.now();

    // 4. Canonical Auth Signature
    const authPreimage = `VG_SYNC_AUTH_V1:${challengeNonce}${accId}${devId}${timestamp}${bodySha256.toLowerCase()}`;
    const authSig = sodium.crypto_sign_detached(
      sodium.from_string(authPreimage),
      keyPair.privateKey
    );
    const signatureBase64 = sodium.to_base64(authSig, sodium.base64_variants.ORIGINAL);

    // 5. POST /v1/sync/push
    const pushRes = await fetch(`${CLOUD_SERVER_URL}/v1/sync/push`, {
      method: 'POST',
      headers: {
        'Content-Type': 'application/json',
        'x-vg-account-id': accId,
        'x-vg-device-id': devId,
        'x-vg-challenge-nonce': challengeNonce,
        'x-vg-timestamp': String(timestamp),
        'x-vg-body-sha256': bodySha256,
        'x-vg-signature': signatureBase64,
      },
      body: pushBodyStr,
    });

    if (!pushRes.ok) {
      const errJson = await pushRes.json().catch(() => ({}));
      throw new Error(errJson.error || `Push failed: HTTP ${pushRes.status}`);
    }

    const pushData = await pushRes.json();
    if (pushData.newVaultSeq) {
      await AsyncStorage.setItem(PREF_SYNC_VAULT_SEQ, String(pushData.newVaultSeq));
    }
    await AsyncStorage.setItem(PREF_LAST_SYNC_TIMESTAMP, String(Date.now()));

    return envelopes.length;
  }

  /**
   * Disaster Recovery Restore: Restores the entire vault from Cloud Relay.
   * Pulls encrypted manifest + items, unseals metadata, and populates SQLite.
   */
  async restoreFromCloud(
    dek: Uint8Array,
    recoveryMnemonic?: string
  ): Promise<{ success: boolean; restoredCount: number; error?: string }> {
    this.isSyncing = true;
    this.notify({ enabled: true, status: 'syncing', lastSyncTime: null, accountId: null });

    try {
      const sodium = getSodium();
      await sodium.ready;
      const cryptoPkg = getCrypto();

      const { accountId, accountAuthPubKey, accountKeyPair } = await this.deriveAccountKeys(dek);
      const deviceId = await this.getOrCreateDeviceId();

      // Ensure account / device is registered or authenticated
      const dummyHeader = sodium.to_base64(
        sodium.from_string(JSON.stringify({ version: 1, restored: true })),
        sodium.base64_variants.ORIGINAL
      );
      const preimage = `VG_SYNC_REGISTER_V1:${accountId}:${accountAuthPubKey}`;
      const sig = sodium.crypto_sign_detached(
        sodium.from_string(preimage),
        accountKeyPair.privateKey
      );
      const registrationSignature = sodium.to_base64(sig, sodium.base64_variants.ORIGINAL);

      // Register or update device on server
      await fetch(`${CLOUD_SERVER_URL}/v1/auth/register`, {
        method: 'POST',
        headers: { 'Content-Type': 'application/json' },
        body: JSON.stringify({
          accountId,
          deviceId,
          deviceName: 'Restored Device (Arca)',
          accountAuthPubKey,
          deviceAuthPubKey: accountAuthPubKey,
          recoveryAuthPubKey: null,
          encryptedHeader: dummyHeader,
          registrationSignature,
        }),
      }).catch(() => {});

      // 1. Request Challenge Nonce for pull
      const chalRes = await fetch(`${CLOUD_SERVER_URL}/v1/auth/challenge`, {
        method: 'POST',
        headers: { 'Content-Type': 'application/json' },
        body: JSON.stringify({ accountId, deviceId }),
      });

      if (!chalRes.ok) {
        throw new Error('Failed to obtain challenge for delta pull');
      }
      const { challengeNonce } = await chalRes.json();

      // 2. Auth headers for GET /v1/sync/delta?sinceSeq=0
      const emptySha256 = 'e3b0c44298fc1c149afbf4c8996fb92427ae41e4649b934ca495991b7852b855';
      const timestamp = Date.now();
      const authPreimage = `VG_SYNC_AUTH_V1:${challengeNonce}${accountId}${deviceId}${timestamp}${emptySha256}`;
      const authSig = sodium.crypto_sign_detached(
        sodium.from_string(authPreimage),
        accountKeyPair.privateKey
      );
      const signatureBase64 = sodium.to_base64(authSig, sodium.base64_variants.ORIGINAL);

      const pullRes = await fetch(`${CLOUD_SERVER_URL}/v1/sync/delta?sinceSeq=0`, {
        method: 'GET',
        headers: {
          'x-vg-account-id': accountId,
          'x-vg-device-id': deviceId,
          'x-vg-challenge-nonce': challengeNonce,
          'x-vg-timestamp': String(timestamp),
          'x-vg-body-sha256': emptySha256,
          'x-vg-signature': signatureBase64,
        },
      });

      if (!pullRes.ok) {
        throw new Error(`Failed to pull cloud delta: HTTP ${pullRes.status}`);
      }

      const delta = await pullRes.json();
      const items: SyncItemEnvelope[] = delta.items || [];

      await ensureDatabaseReady();

      // Restore header
      if (delta.encryptedHeader) {
        try {
          const headerJson = sodium.to_string(
            sodium.from_base64(delta.encryptedHeader, sodium.base64_variants.ORIGINAL)
          );
          await createVaultRecord('vault_personal', 'Personal Vault', headerJson);
          await saveVaultMeta('header', headerJson, 'vault_personal', 'Personal Vault');
        } catch {}
      }

      // Populate all items into SQLite database
      let restoredCount = 0;
      for (const envelope of items) {
        try {
          // Decrypt metadata (title & username) to populate instant SQLite indexing
          let title = 'Restored Item';
          let username: string | null = null;
          let itemType = 'login';

          try {
            const plain = await cryptoPkg.unsealItem(dek, {
              id: envelope.itemId,
              revision: envelope.revision,
              nonce: envelope.nonceBase64,
              ciphertext: envelope.ciphertextBase64,
            });
            if (plain) {
              title = plain.title || title;
              username = plain.username || null;
              if (plain.totpSecret || plain.totpConfig) itemType = 'totp';
              else if (plain.type) itemType = plain.type;
            }
          } catch (decryptErr) {
            console.warn('[CloudBackup] Could not decrypt metadata for item', envelope.itemId);
          }

          const storedItem: StoredMobileItem = {
            id: envelope.itemId,
            vault_id: 'vault_personal',
            title,
            username,
            ciphertext: envelope.ciphertextBase64,
            nonce: envelope.nonceBase64,
            tag: '',
            hlc: envelope.hlcTimestamp,
            updated_at: envelope.updatedAt,
            is_deleted: envelope.deletedAt ? 1 : 0,
            item_type: itemType,
          };

          await saveVaultItem(storedItem);
          restoredCount++;
        } catch (itemErr) {
          console.error('[CloudBackup] Failed to save restored item:', itemErr);
        }
      }

      await AsyncStorage.setItem(PREF_CLOUD_BACKUP_ENABLED, 'true');
      await AsyncStorage.setItem(PREF_SYNC_ACCOUNT_ID, accountId);
      await AsyncStorage.setItem(PREF_SYNC_VAULT_SEQ, String(delta.currentVaultSeq || 1));
      await AsyncStorage.setItem(PREF_LAST_SYNC_TIMESTAMP, String(Date.now()));
      await AsyncStorage.setItem('@arca_vault_created', 'true');

      this.isSyncing = false;
      this.notify({
        enabled: true,
        status: 'synced',
        lastSyncTime: Date.now(),
        accountId,
        itemCount: restoredCount,
      });

      return { success: true, restoredCount };
    } catch (err: any) {
      this.isSyncing = false;
      const msg = err?.message || 'Restore failed';
      this.notify({ enabled: false, status: 'offline', lastSyncTime: null, accountId: null, error: msg });
      return { success: false, restoredCount: 0, error: msg };
    }
  }

  /**
   * Background Auto-Sync trigger: Pushes a delta when an item is modified.
   */
  async autoSyncItem(item: StoredMobileItem, dek: Uint8Array): Promise<void> {
    const enabled = await this.isEnabled();
    if (!enabled) return;

    try {
      const envelope: SyncItemEnvelope = {
        itemId: item.id,
        revision: 1,
        nonceBase64: item.nonce,
        ciphertextBase64: item.ciphertext,
        hlcTimestamp: item.hlc || `${item.updated_at}:0:mobile`,
        deletedAt: item.is_deleted === 1 ? item.updated_at : null,
        updatedAt: item.updated_at,
      };

      const sodium = getSodium();
      await sodium.ready;

      const { accountId, accountKeyPair } = await this.deriveAccountKeys(dek);
      const deviceId = await this.getOrCreateDeviceId();

      const chalRes = await fetch(`${CLOUD_SERVER_URL}/v1/auth/challenge`, {
        method: 'POST',
        headers: { 'Content-Type': 'application/json' },
        body: JSON.stringify({ accountId, deviceId }),
      });
      if (!chalRes.ok) return;
      const { challengeNonce } = await chalRes.json();

      const lastSeq = parseInt((await AsyncStorage.getItem(PREF_SYNC_VAULT_SEQ)) || '1', 10);
      const pushBodyObj = {
        expectedVaultSeq: lastSeq,
        encryptedManifest: null,
        items: [envelope],
      };
      const pushBodyStr = JSON.stringify(pushBodyObj);
      const bodyBytes = sodium.from_string(pushBodyStr);
      const bodySha256 = sodium.to_hex(sodium.crypto_hash_sha256(bodyBytes));
      const timestamp = Date.now();

      const authPreimage = `VG_SYNC_AUTH_V1:${challengeNonce}${accountId}${deviceId}${timestamp}${bodySha256.toLowerCase()}`;
      const authSig = sodium.crypto_sign_detached(
        sodium.from_string(authPreimage),
        accountKeyPair.privateKey
      );
      const signatureBase64 = sodium.to_base64(authSig, sodium.base64_variants.ORIGINAL);

      const pushRes = await fetch(`${CLOUD_SERVER_URL}/v1/sync/push`, {
        method: 'POST',
        headers: {
          'Content-Type': 'application/json',
          'x-vg-account-id': accountId,
          'x-vg-device-id': deviceId,
          'x-vg-challenge-nonce': challengeNonce,
          'x-vg-timestamp': String(timestamp),
          'x-vg-body-sha256': bodySha256,
          'x-vg-signature': signatureBase64,
        },
        body: pushBodyStr,
      });

      if (pushRes.ok) {
        const pushData = await pushRes.json();
        if (pushData.newVaultSeq) {
          await AsyncStorage.setItem(PREF_SYNC_VAULT_SEQ, String(pushData.newVaultSeq));
        }
        await AsyncStorage.setItem(PREF_LAST_SYNC_TIMESTAMP, String(Date.now()));
      }
    } catch (e) {
      console.warn('[CloudBackup] autoSyncItem background error:', e);
    }
  }
}

export const cloudBackupService = new CloudBackupService();

