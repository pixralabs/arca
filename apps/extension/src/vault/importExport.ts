/**
 * @file apps/extension/src/vault/importExport.ts
 * @description Encrypted `.vgvault` Backup Bundle & Re-Auth Gated CSV Import/Export
 * with `sodium.memzero()` on all transient plaintext byte buffers.
 */

import sodium from 'libsodium-wrappers-sumo';
import { verifyManifest } from '@vaultguard/crypto';
import {
  isValidVaultHeader,
  isValidVaultItemRecord,
  isValidVaultManifest,
  VaultGuardError,
  ERR_SCHEMA_INVALID,
  VaultHeader,
  VaultManifest,
  VaultItemRecord,
  VaultItemPlaintext,
} from '@vaultguard/shared';

export interface EncryptedVaultBundle {
  format: 'vaultguard-encrypted-backup';
  version: 1;
  exportedAt: number;
  header: VaultHeader;
  manifest: VaultManifest;
  items: VaultItemRecord[];
}

export function serializeEncryptedVaultBundle(
  header: VaultHeader,
  manifest: VaultManifest,
  items: VaultItemRecord[]
): string {
  if (!isValidVaultHeader(header) || !isValidVaultManifest(manifest)) {
    throw new VaultGuardError(ERR_SCHEMA_INVALID, 'Invalid header or manifest for backup export.');
  }
  for (const item of items) {
    if (!isValidVaultItemRecord(item)) {
      throw new VaultGuardError(ERR_SCHEMA_INVALID, 'Invalid encrypted item record in backup.');
    }
  }
  const bundle: EncryptedVaultBundle = {
    format: 'vaultguard-encrypted-backup',
    version: 1,
    exportedAt: Date.now(),
    header,
    manifest,
    items,
  };
  return JSON.stringify(bundle, null, 2);
}

export async function parseAndVerifyEncryptedVaultBundle(
  rawJson: string,
  dek: Uint8Array,
  lastKnownVaultSeq: number
): Promise<EncryptedVaultBundle> {
  await sodium.ready;
  let parsed: unknown;
  try {
    parsed = JSON.parse(rawJson);
  } catch {
    throw new VaultGuardError(ERR_SCHEMA_INVALID, 'Malformed JSON in .vgvault backup file.');
  }

  if (typeof parsed !== 'object' || parsed === null) {
    throw new VaultGuardError(ERR_SCHEMA_INVALID, 'Invalid .vgvault root object.');
  }

  const candidate = parsed as EncryptedVaultBundle;
  if (candidate.format !== 'vaultguard-encrypted-backup' || candidate.version !== 1) {
    throw new VaultGuardError(
      ERR_SCHEMA_INVALID,
      'Unsupported .vgvault backup format or version.'
    );
  }
  if (!isValidVaultHeader(candidate.header) || !isValidVaultManifest(candidate.manifest)) {
    throw new VaultGuardError(ERR_SCHEMA_INVALID, 'Invalid header or manifest inside .vgvault.');
  }
  if (!Array.isArray(candidate.items)) {
    throw new VaultGuardError(ERR_SCHEMA_INVALID, 'Missing items array inside .vgvault.');
  }

  const validatedItems: VaultItemRecord[] = [];
  for (const item of candidate.items) {
    if (!isValidVaultItemRecord(item)) {
      throw new VaultGuardError(ERR_SCHEMA_INVALID, 'Corrupt VaultItemRecord in .vgvault.');
    }
    validatedItems.push(item);
  }

  await verifyManifest(dek, candidate.manifest, lastKnownVaultSeq);

  return {
    format: 'vaultguard-encrypted-backup',
    version: 1,
    exportedAt:
      typeof candidate.exportedAt === 'number' ? candidate.exportedAt : Date.now(),
    header: candidate.header,
    manifest: candidate.manifest,
    items: validatedItems,
  };
}

function escapeCsvCell(value: string): string {
  const escaped = value.replaceAll('"', '""');
  return `"${escaped}"`;
}

/**
 * Exports decrypted items into a UTF-8 CSV byte buffer and invokes `onBytesReady`,
 * immediately zeroizing the UTF-8 buffer via `sodium.memzero()` in `finally`.
 */
export async function exportDecryptedItemsToCsvBytes<T>(
  items: VaultItemPlaintext[],
  onBytesReady: (bytes: Uint8Array) => Promise<T>
): Promise<T> {
  await sodium.ready;
  const headerRow = '"title","username","password","url","notes"';
  const rows = items.map(item =>
    [
      escapeCsvCell(item.title),
      escapeCsvCell(item.username),
      escapeCsvCell(item.password),
      escapeCsvCell(item.urls[0] ?? ''),
      escapeCsvCell(item.notes ?? ''),
    ].join(',')
  );
  const csvString = [headerRow, ...rows].join('\r\n');
  const csvBytes = new TextEncoder().encode(csvString);
  try {
    return await onBytesReady(csvBytes);
  } finally {
    sodium.memzero(csvBytes);
  }
}
