/**
 * @file packages/crypto/src/csvImport.ts
 * @description Zero-Knowledge In-Memory CSV Importer with Mandatory Memory Zeroization (`sodium.memzero()`).
 *
 * Precision Requirements:
 * 1. Plaintext CSV data must ONLY exist in RAM during import.
 * 2. All raw input buffers must be wiped using `sodium.memzero()` in a `finally` block immediately
 *    after items are encrypted into the `DataEnvelope` / `VaultItemRecord`.
 * 3. Supports major password managers: Chrome, Bitwarden, 1Password, and Standard CSV.
 * 4. Runs in-RAM security audit on all imported credentials immediately upon parsing.
 */

import sodium from 'libsodium-wrappers-sumo';
import { VaultItemPlaintext, VaultItemRecord } from '@vaultguard/shared';
import { sealItem } from './envelope.js';
import { auditPasswordStrength, detectReusedPasswords } from './audit.js';

export interface CsvImportResult {
  plaintexts: VaultItemPlaintext[];
  records: VaultItemRecord[];
  audit: {
    totalImported: number;
    weakCount: number;
    reusedCount: number;
  };
}

/**
 * Standard RFC-4180 compliant CSV line tokenizer that handles quotes, escaped quotes (""), and commas.
 */
export function parseCsvRows(csvText: string): string[][] {
  const rows: string[][] = [];
  let currentRow: string[] = [];
  let currentField = '';
  let inQuotes = false;
  let i = 0;

  while (i < csvText.length) {
    const char = csvText[i];
    const nextChar = i + 1 < csvText.length ? csvText[i + 1] : '';

    if (inQuotes) {
      if (char === '"') {
        if (nextChar === '"') {
          // Escaped quote: "" -> "
          currentField += '"';
          i += 2;
          continue;
        } else {
          // Closing quote
          inQuotes = false;
          i++;
          continue;
        }
      } else {
        currentField += char;
        i++;
        continue;
      }
    } else {
      if (char === '"') {
        inQuotes = true;
        i++;
        continue;
      } else if (char === ',') {
        currentRow.push(currentField.trim());
        currentField = '';
        i++;
        continue;
      } else if (char === '\r') {
        if (nextChar === '\n') i++; // Handle CRLF
        currentRow.push(currentField.trim());
        rows.push(currentRow);
        currentRow = [];
        currentField = '';
        i++;
        continue;
      } else if (char === '\n') {
        currentRow.push(currentField.trim());
        rows.push(currentRow);
        currentRow = [];
        currentField = '';
        i++;
        continue;
      } else {
        currentField += char;
        i++;
        continue;
      }
    }
  }

  // Push remaining field / row if present
  if (currentField.length > 0 || currentRow.length > 0) {
    currentRow.push(currentField.trim());
    rows.push(currentRow);
  }

  // Filter out empty rows
  return rows.filter(r => r.length > 0 && r.some(c => c.length > 0));
}

interface ColumnMapping {
  titleIdx: number;
  usernameIdx: number;
  passwordIdx: number;
  urlIdx: number;
  notesIdx: number;
  totpIdx: number;
}

function resolveColumnIndices(headers: string[]): ColumnMapping {
  let titleIdx = -1;
  let usernameIdx = -1;
  let passwordIdx = -1;
  let urlIdx = -1;
  let notesIdx = -1;
  let totpIdx = -1;

  headers.forEach((header, idx) => {
    const h = header.toLowerCase().replace(/[^a-z0-9_]/g, '');

    // Title / Name
    if (titleIdx === -1 && (h === 'title' || h === 'name' || h === 'account')) {
      titleIdx = idx;
    }
    // Username / Email
    else if (
      usernameIdx === -1 &&
      (h === 'username' || h === 'login_username' || h === 'user' || h === 'email' || h === 'login')
    ) {
      usernameIdx = idx;
    }
    // Password
    else if (passwordIdx === -1 && (h === 'password' || h === 'login_password' || h === 'pwd')) {
      passwordIdx = idx;
    }
    // URL / Website / URI
    else if (urlIdx === -1 && (h === 'url' || h === 'login_uri' || h === 'website' || h === 'uri')) {
      urlIdx = idx;
    }
    // Notes
    else if (notesIdx === -1 && (h === 'notes' || h === 'note' || h === 'comments')) {
      notesIdx = idx;
    }
    // TOTP Secret
    else if (totpIdx === -1 && (h === 'totp' || h === 'login_totp' || h === 'totpsecret' || h === 'otp')) {
      totpIdx = idx;
    }
  });

  return {
    titleIdx,
    usernameIdx,
    passwordIdx,
    urlIdx,
    notesIdx,
    totpIdx,
  };
}

/**
 * Imports plaintext CSV byte buffer into encrypted `VaultItemRecord` DataEnvelopes
 * and immediately zeroizes the plaintext input buffer in a mandatory `finally` block.
 *
 * @param csvBytes Raw UTF-8 bytes of uploaded CSV (from FileReader or Buffer).
 * @param dek Active Vault Data Encryption Key (32 bytes).
 * @param onProgress Optional callback invoked as items are encrypted.
 */
export async function importCsvBytesWithZeroization(
  csvBytes: Uint8Array,
  dek?: Uint8Array,
  onProgress?: (index: number, total: number) => void
): Promise<CsvImportResult> {
  await sodium.ready; // Must be first line

  const plaintexts: VaultItemPlaintext[] = [];
  const records: VaultItemRecord[] = [];

  try {
    const decoder = new TextDecoder('utf-8');
    const csvText = decoder.decode(csvBytes);
    const rows = parseCsvRows(csvText);

    if (rows.length < 2) {
      throw new Error('CSV file must contain a header row and at least one data row.');
    }

    const headerRow = rows[0]!;
    const mapping = resolveColumnIndices(headerRow);

    if (mapping.passwordIdx === -1) {
      throw new Error('CSV does not contain a recognizable "password" column.');
    }

    const dataRows = rows.slice(1);
    const now = Date.now();

    for (let i = 0; i < dataRows.length; i++) {
      const row = dataRows[i]!;
      const title = (mapping.titleIdx !== -1 ? row[mapping.titleIdx] : '') || 'Imported Login';
      const username = (mapping.usernameIdx !== -1 ? row[mapping.usernameIdx] : '') || '';
      const password = (mapping.passwordIdx !== -1 ? row[mapping.passwordIdx] : '') || '';
      const url = (mapping.urlIdx !== -1 ? row[mapping.urlIdx] : '') || '';
      const notes = (mapping.notesIdx !== -1 ? row[mapping.notesIdx] : '') || '';
      const totp = (mapping.totpIdx !== -1 ? row[mapping.totpIdx] : '') || null;

      // Skip completely empty rows
      if (!title && !username && !password && !url) {
        continue;
      }

      const plaintext: VaultItemPlaintext & { totpSecret?: string | null } = {
        title: title.trim(),
        username: username.trim(),
        password,
        urls: url.trim() ? [url.trim()] : [],
        notes: notes.trim(),
        totpConfig:
          totp && totp.trim().length > 0
            ? {
                secret: totp.trim(),
                period: 30,
                digits: 6,
                algorithm: 'SHA1',
              }
            : undefined,
        totpSecret: totp && totp.trim().length > 0 ? totp.trim() : null,
      };

      plaintexts.push(plaintext);

      // If DEK is provided, encrypt directly into DataEnvelope (VaultItemRecord)
      if (dek && dek instanceof Uint8Array) {
        const itemId = crypto.randomUUID();
        const sealed = await sealItem(dek, plaintext, {
          id: itemId,
          schemaVersion: 1,
          revision: 1,
          createdAt: now,
          updatedAt: now,
          deletedAt: null,
        });
        records.push(sealed);
      }

      if (onProgress) {
        onProgress(i + 1, dataRows.length);
      }
    }

    // In-RAM Security Audit of the imported credentials
    let weakCount = 0;
    for (const item of plaintexts) {
      const strength = auditPasswordStrength(item.password);
      if (strength.isWeak) weakCount++;
    }

    const itemsForReuse = plaintexts.map((p, idx) => ({
      id: records[idx]?.id ?? `import_${idx}`,
      password: p.password,
      urls: p.urls,
    }));
    const reuseAudit = detectReusedPasswords(itemsForReuse);

    return {
      plaintexts,
      records,
      audit: {
        totalImported: plaintexts.length,
        weakCount,
        reusedCount: reuseAudit.reusedCount,
      },
    };
  } finally {
    // MANDATORY MEMORY ZEROIZATION: Wipe raw CSV byte buffer immediately from volatile RAM
    if (csvBytes && csvBytes instanceof Uint8Array && csvBytes.byteLength > 0) {
      sodium.memzero(csvBytes);
    }
  }
}
