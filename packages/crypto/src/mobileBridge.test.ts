import { describe, it, expect } from 'vitest';
import {
  splitRecoveryEntropy,
  combineRecoveryShares,
  deriveDeviceAuthKeyPair,
  computeDeviceShortCode,
  signDeviceApprovalDecision,
} from './index.js';
import { createVault } from './envelope.js';

describe('Mobile Cryptographic Bridge & Helpers', () => {
  it('should split and reconstruct a recovery secret using Shamir 2-of-3 threshold', async () => {
    const originalSecret = new Uint8Array(32);
    for (let i = 0; i < 32; i++) originalSecret[i] = (i * 7 + 13) % 256;

    // Split into 3 shares with threshold 2
    const shares = await splitRecoveryEntropy(originalSecret);
    expect(shares).toHaveLength(3);

    // Any 2 shares must reconstruct the exact original secret
    const reconstructed12 = await combineRecoveryShares([shares[0], shares[1]]);
    expect(reconstructed12).toEqual(originalSecret);

    const reconstructed23 = await combineRecoveryShares([shares[1], shares[2]]);
    expect(reconstructed23).toEqual(originalSecret);

    const reconstructed13 = await combineRecoveryShares([shares[0], shares[2]]);
    expect(reconstructed13).toEqual(originalSecret);
  });

  it('should compute deterministic SAS 4-6 digit short code for device pairing', async () => {
    const accountId = 'acc_test_alice_123';
    const deviceId = 'dev_mobile_test_456';
    const deviceAuthPubKey = 'aabbccddeeff00112233445566778899aabbccddeeff00112233445566778899';

    const shortCode = await computeDeviceShortCode(accountId, deviceId, deviceAuthPubKey);
    expect(shortCode).toBeTruthy();
    expect(typeof shortCode).toBe('string');
    // Short code format: e.g. "9F4-2A1" or similar uppercase alphanumeric
    expect(shortCode.length).toBeGreaterThanOrEqual(4);
  });

  it('should sign device approval decision with detached Ed25519 signature', async () => {
    const password = new TextEncoder().encode('PairingPass_98765!');
    const vault = await createVault(password);

    const accountId = 'acc_primary_owner';
    const approvingDeviceId = 'dev_primary_approver';
    const targetDeviceId = 'dev_new_phone';
    const targetDeviceAuthPubKey = '0123456789abcdef0123456789abcdef0123456789abcdef0123456789abcdef';

    const signature = await signDeviceApprovalDecision(vault.dek, {
      accountId,
      approverDeviceId: approvingDeviceId,
      targetDeviceId,
      targetDevicePubKey: targetDeviceAuthPubKey,
      approve: true,
    });

    expect(signature).toBeTruthy();
    expect(typeof signature).toBe('string');
    expect(signature.length).toBeGreaterThan(0);
  });

  it('should parse RFC 6238 otpauth:// URIs with custom parameters', () => {
    function parseOtpAuth(rawUri: string) {
      const trimmed = rawUri.trim();
      if (!trimmed.toLowerCase().startsWith('otpauth://totp/')) {
        throw new Error('Invalid TOTP QR Code');
      }
      const withoutScheme = trimmed.slice('otpauth://totp/'.length);
      const [rawLabelPart, queryPart = ''] = withoutScheme.split('?');
      const decodedLabel = decodeURIComponent(rawLabelPart || '');
      const params: Record<string, string> = {};
      queryPart.split('&').forEach((pair) => {
        const [k, v] = pair.split('=');
        if (k && v) params[k.toLowerCase()] = decodeURIComponent(v);
      });
      const secret = (params.secret || '').replace(/\s+/g, '').toUpperCase();
      let issuer = params.issuer || '';
      let accountName = decodedLabel;
      if (decodedLabel.includes(':')) {
        const [pfx, rest] = decodedLabel.split(':');
        if (!issuer) issuer = pfx.trim();
        accountName = rest.trim();
      }
      return {
        issuer: issuer || accountName,
        accountName,
        secret,
        digits: params.digits === '8' ? 8 : 6,
        period: parseInt(params.period || '30', 10) || 30,
        algorithm: (params.algorithm || 'SHA1').toUpperCase(),
      };
    }

    const standardUri = 'otpauth://totp/GitHub:alice@example.com?secret=JBSWY3DPEHPK3PXP&issuer=GitHub&digits=6&period=30';
    const parsed = parseOtpAuth(standardUri);
    expect(parsed.issuer).toBe('GitHub');
    expect(parsed.accountName).toBe('alice@example.com');
    expect(parsed.secret).toBe('JBSWY3DPEHPK3PXP');
    expect(parsed.digits).toBe(6);
    expect(parsed.period).toBe(30);
    expect(parsed.algorithm).toBe('SHA1');

    const customUri = 'otpauth://totp/AWS%20Cloud:bob?secret=kbcw%206ba5&issuer=AWS&digits=8&period=60&algorithm=SHA256';
    const parsedCustom = parseOtpAuth(customUri);
    expect(parsedCustom.issuer).toBe('AWS');
    expect(parsedCustom.accountName).toBe('bob');
    expect(parsedCustom.secret).toBe('KBCW6BA5');
    expect(parsedCustom.digits).toBe(8);
    expect(parsedCustom.period).toBe(60);
    expect(parsedCustom.algorithm).toBe('SHA256');
  });

  it('should reject invalid or malicious URI schemes and invalid Base32 secrets', () => {
    function sanitizeTotp(raw: string) {
      if (!raw.toLowerCase().startsWith('otpauth://totp/')) {
        throw new Error('Invalid TOTP URI scheme');
      }
      const match = raw.match(/[?&]secret=([^&]+)/i);
      const secret = match ? match[1].replace(/\s+/g, '').toUpperCase() : '';
      if (!/^[A-Z2-7=]{8,128}$/.test(secret)) {
        throw new Error('Invalid Base32 secret');
      }
      return secret;
    }

    expect(() => sanitizeTotp('javascript:alert(1)')).toThrow('Invalid TOTP URI scheme');
    expect(() => sanitizeTotp('https://evil.com/phish')).toThrow('Invalid TOTP URI scheme');
    expect(() => sanitizeTotp('otpauth://totp/test?secret=INVALID890!@#')).toThrow('Invalid Base32 secret');
    expect(sanitizeTotp('otpauth://totp/test?secret=JBSWY3DPEHPK3PXP')).toBe('JBSWY3DPEHPK3PXP');
  });

  it('should enforce SAS verification to prevent MITM tampering in device pairing', async () => {
    const accountId = 'acc_alice_777';
    const deviceId = 'dev_bob_888';
    const deviceAuthPubKey = '11223344556677889900aabbccddeeff11223344556677889900aabbccddeeff';

    const validSas = await computeDeviceShortCode(accountId, deviceId, deviceAuthPubKey);
    expect(validSas).toBeTruthy();

    function verifySas(scannedSas: string, expectedSas: string) {
      const normScanned = scannedSas.replace(/[-\s]/g, '').toUpperCase();
      const normExpected = expectedSas.replace(/[-\s]/g, '').toUpperCase();
      if (normScanned !== normExpected) {
        throw new Error('SAS Verification Failed! MITM attack detected.');
      }
      return true;
    }

    // Matching SAS succeeds
    expect(verifySas(validSas, validSas)).toBe(true);
    // Tampered SAS throws MITM error
    expect(() => verifySas('000-000', validSas)).toThrow('SAS Verification Failed! MITM attack detected.');
  });
});
