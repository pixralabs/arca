/**
 * @vaultguard/crypto — ISO/IEC 7816-4 256-Byte Block Padding (`padding.ts`)
 * Locked to ENVELOPE_SPEC.md v2 §4.2
 *
 * Appends mandatory 0x80 delimiter byte followed by 0x00 bytes up to the next
 * multiple of 256 bytes. A 0-byte input produces a 256-byte padded block.
 */

import { PAD_BLOCK_BYTES } from '@vaultguard/shared';

export function padTo256(bytes: Uint8Array): Uint8Array {
  if (!(bytes instanceof Uint8Array)) {
    throw new Error('PADDING_INVALID_INPUT_TYPE');
  }
  const remainder = bytes.byteLength % PAD_BLOCK_BYTES;
  const padLength = PAD_BLOCK_BYTES - remainder; // Strictly in [1..256]
  const padded = new Uint8Array(bytes.byteLength + padLength);
  padded.set(bytes, 0);
  padded[bytes.byteLength] = 0x80;
  // Remaining bytes are initialized to 0x00 by Uint8Array
  return padded;
}

export function unpadFrom256(padded: Uint8Array): Uint8Array {
  if (!(padded instanceof Uint8Array)) {
    throw new Error('PADDING_INVALID_INPUT_TYPE');
  }
  if (padded.byteLength === 0 || padded.byteLength % PAD_BLOCK_BYTES !== 0) {
    throw new Error('PADDING_ALIGNMENT_ERROR');
  }
  let delimiterIndex = -1;
  for (let i = padded.byteLength - 1; i >= 0; i--) {
    const byteVal = padded[i];
    if (byteVal === 0x00) {
      continue;
    }
    if (byteVal === 0x80) {
      delimiterIndex = i;
      break;
    }
    throw new Error('PADDING_CORRUPTED_BYTE');
  }
  if (delimiterIndex < 0) {
    throw new Error('PADDING_DELIMITER_MISSING');
  }
  return padded.slice(0, delimiterIndex);
}
