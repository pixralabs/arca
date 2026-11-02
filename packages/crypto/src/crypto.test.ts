import { describe, it, expect } from 'vitest';
import {
  createVault,
  unlockWithMaster,
  unlockWithRecovery,
  sealItem,
  unsealItem,
  generatePassword,
  generatePassphrase,
  generateTotpCode,
} from './index.js';

describe('Vault Cryptography & Envelopes', () => {
  it('should create and unlock a vault with master password and recovery phrase', async () => {
    const password = new TextEncoder().encode('masterPassword_12345!Secure');
    const created = await createVault(password);

    expect(created.mnemonic).toBeTruthy();
    expect(created.header).toBeTruthy();
    expect(created.dek.length).toBe(32);

    // Unlock with master password
    const unlockedDek = await unlockWithMaster(created.header, password);
    expect(unlockedDek).toEqual(created.dek);

    // Unlock with recovery phrase
    const recoveryDek = await unlockWithRecovery(created.header, created.mnemonic);
    expect(recoveryDek).toEqual(created.dek);
  });

  it('should seal and unseal items with AEAD envelope', async () => {
    const password = new TextEncoder().encode('TestMasterPass123!');
    const vault = await createVault(password);

    const testItem = {
      title: 'GitHub',
      username: 'arca-user',
      password: 'SampleSecretPassword#99',
      urls: ['https://github.com'],
      notes: 'Developer account',
    };

    const sealed = await sealItem(vault.dek, 'item_1', 1, testItem);
    expect(sealed.id).toBe('item_1');
    expect(sealed.ciphertext).toBeTruthy();

    const unsealed = await unsealItem(vault.dek, sealed);
    expect(unsealed.title).toBe(testItem.title);
    expect(unsealed.username).toBe(testItem.username);
    expect(unsealed.password).toBe(testItem.password);
  });

  it('should generate valid 6-digit TOTP codes with correct period', async () => {
    const secret = 'JBSWY3DPEHPK3PXP'; // standard test secret
    const result = await generateTotpCode(secret);

    expect(result.code).toMatch(/^\d{6}$/);
    expect(result.formattedCode).toHaveLength(7); // e.g. "123 456"
    expect(result.period).toBe(30);
    expect(result.remainingSeconds).toBeGreaterThanOrEqual(1);
    expect(result.remainingSeconds).toBeLessThanOrEqual(30);
  });

  it('should generate cryptographically strong passwords and passphrases', async () => {
    const pw = await generatePassword({ length: 24 });
    expect(pw).toHaveLength(24);

    const phrase = await generatePassphrase(5);
    const words = phrase.split('-');
    expect(words).toHaveLength(5);
  });
});
