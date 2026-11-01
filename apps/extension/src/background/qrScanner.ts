/**
 * @file apps/extension/src/background/qrScanner.ts
 * @description Offline Tab-Capture QR Code Scanner (`TOTP_SPEC.md` v1.1 §4.1).
 *
 * Security & Privacy Invariants:
 * - Uses `chrome.tabs.captureVisibleTab({ format: 'png' })` authorized by the user's
 *   active gesture and existing `activeTab` permission (zero camera permission).
 * - Decodes the PNG data URL in-memory via `createImageBitmap` + `OffscreenCanvas`
 *   (zero network calls, 100% offline).
 * - Decodes QR matrices via `jsqr@1.4.0` (`inversionAttempts: 'attemptBoth'`) and
 *   validates `otpauth://totp/...` via `parseOtpauthUri()`.
 * - Wipes both the raw PNG buffer and the RGBA `Uint8ClampedArray` pixel buffer in `finally`.
 */

import jsQR from 'jsqr';
import { parseOtpauthUri, TotpConfig } from '@vaultguard/shared';

function decodeDataUrlToPngBytes(dataUrl: string): Uint8Array {
  const commaIdx = dataUrl.indexOf(',');
  if (commaIdx === -1 || !dataUrl.startsWith('data:image/')) {
    throw new Error('ERR_QR_CAPTURE_INVALID_DATA_URL');
  }
  const base64 = dataUrl.slice(commaIdx + 1);
  const binaryString = atob(base64);
  const bytes = new Uint8Array(binaryString.length);
  for (let i = 0; i < binaryString.length; i++) {
    bytes[i] = binaryString.charCodeAt(i);
  }
  return bytes;
}

export interface QrScanResult {
  uri: string;
  config: TotpConfig;
}

/**
 * Captures the visible viewport of the currently active tab, decodes any visible
 * 2FA QR code offline using `jsqr@1.4.0`, validates the `otpauth://totp/...` URI,
 * and zeroes all screenshot buffers before returning.
 */
export async function scanTotpQrFromActiveTab(): Promise<QrScanResult> {
  const g = globalThis as any;
  if (!g.chrome?.tabs?.captureVisibleTab) {
    throw new Error('ERR_QR_CAPTURE_UNAVAILABLE');
  }
  const dataUrl = await g.chrome.tabs.captureVisibleTab({
    format: 'png',
  });
  const pngBytes = decodeDataUrlToPngBytes(dataUrl);
  let imageData: ImageData | null = null;
  try {
    const blob = new Blob([pngBytes], {
      type: 'image/png',
    });
    const bitmap = await createImageBitmap(blob);
    const canvas = new OffscreenCanvas(bitmap.width, bitmap.height);
    const ctx = canvas.getContext('2d');
    if (!ctx) {
      bitmap.close();
      throw new Error('ERR_QR_OFFSCREEN_CANVAS_FAILED');
    }
    ctx.drawImage(bitmap, 0, 0);
    bitmap.close();
    imageData = ctx.getImageData(0, 0, canvas.width, canvas.height);
    const qrResult = jsQR(imageData.data, imageData.width, imageData.height, {
      inversionAttempts: 'attemptBoth',
    });
    if (!qrResult || !qrResult.data) {
      throw new Error('ERR_QR_NOT_FOUND_IN_TAB');
    }
    const config = parseOtpauthUri(qrResult.data);
    return {
      uri: qrResult.data,
      config,
    };
  } finally {
    pngBytes.fill(0);
    if (imageData) {
      imageData.data.fill(0);
    }
  }
}
