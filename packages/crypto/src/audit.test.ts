import { describe, it, expect } from 'vitest';
import sodium from 'libsodium-wrappers-sumo';
import {
  auditPasswordStrength,
  detectReusedPasswords,
  checkPasswordForSavePrompt,
  calculateVaultSecurityScore,
  parseCsvRows,
  importCsvBytesWithZeroization,
  createVault,
} from './index.js';

describe('Password Security Audit & Reuse Engine', () => {
  it('flags weak passwords with < 12 characters', () => {
    const result1 = auditPasswordStrength('Short1!');
    expect(result1.isWeak).toBe(true);
    expect(result1.hasMinLength).toBe(false);
    expect(result1.reasons).toContain('Weak (< 12 characters)');
    expect(result1.score).toBeLessThanOrEqual(50);

    const result2 = auditPasswordStrength('12345678');
    expect(result2.isWeak).toBe(true);
    expect(result2.reasons).toContain('Weak (< 12 characters)');
  });

  it('flags passwords lacking complexity', () => {
    // 14 characters, but only lowercase
    const resultAllLower = auditPasswordStrength('alllowercaseletters');
    expect(resultAllLower.isWeak).toBe(true);
    expect(resultAllLower.hasMinLength).toBe(true);
    expect(resultAllLower.reasons.some(r => r.includes('Lacks complexity'))).toBe(true);

    // 14 digits only
    const resultDigits = auditPasswordStrength('12345678901234');
    expect(resultDigits.isWeak).toBe(true);
    expect(resultDigits.reasons.some(r => r.includes('Digits-only'))).toBe(true);
  });

  it('flags commonly compromised passwords', () => {
    const result = auditPasswordStrength('password123');
    expect(result.isWeak).toBe(true);
    expect(result.isCommon).toBe(true);
    expect(result.reasons).toContain('Commonly compromised password');
  });

  it('passes strong, complex passwords >= 12 characters', () => {
    const result = auditPasswordStrength('K9#mQ2$vL8!xP4&z');
    expect(result.isWeak).toBe(false);
    expect(result.hasMinLength).toBe(true);
    expect(result.hasLowercase).toBe(true);
    expect(result.hasUppercase).toBe(true);
    expect(result.hasDigits).toBe(true);
    expect(result.hasSymbols).toBe(true);
    expect(result.score).toBeGreaterThanOrEqual(90);
    expect(result.reasons).toHaveLength(0);
  });

  it('detects reused passwords across different itemIds and urls', () => {
    const items = [
      { id: '1', password: 'SharedSecret123!', urls: ['https://google.com'] },
      { id: '2', password: 'SharedSecret123!', urls: ['https://github.com'] },
      { id: '3', password: 'UniquePassword456$!', urls: ['https://amazon.com'] },
      { id: '4', password: 'SharedSecret123!', urls: ['https://netflix.com'] },
    ];

    const result = detectReusedPasswords(items);
    expect(result.reusedCount).toBe(3);
    expect(result.reusedItemIds.has('1')).toBe(true);
    expect(result.reusedItemIds.has('2')).toBe(true);
    expect(result.reusedItemIds.has('4')).toBe(true);
    expect(result.reusedItemIds.has('3')).toBe(false);

    expect(result.groups).toHaveLength(1);
    expect(result.groups[0]?.count).toBe(3);
    expect(result.groups[0]?.password).toBe('SharedSecret123!');
  });

  it('generates save prompt warnings for weak and reused passwords', () => {
    const existing = [
      { id: '1', password: 'MyDog2010!', urls: ['https://site1.com'] },
      { id: '2', password: 'MyDog2010!', urls: ['https://site2.com'] },
      { id: '3', password: 'MyDog2010!', urls: ['https://site3.com'] },
    ];

    const prompt = checkPasswordForSavePrompt('MyDog2010!', 'https://site4.com', existing);
    expect(prompt.isWeak).toBe(true);
    expect(prompt.isReused).toBe(true);
    expect(prompt.reusedCount).toBe(3);
    expect(prompt.warningMessage).toBe('Warning: This password is weak and used on 3 other sites.');
  });

  it('calculates comprehensive vault security score', () => {
    const items = [
      { id: '1', password: 'K9#mQ2$vL8!xP4&z', urls: ['https://strong1.com'] },
      { id: '2', password: 'X8*vP3#mQ1!zL9$a', urls: ['https://strong2.com'] },
      { id: '3', password: '123456', urls: ['https://weak1.com'] },
    ];

    const scoreResult = calculateVaultSecurityScore(items);
    expect(scoreResult.totalCount).toBe(3);
    expect(scoreResult.weakCount).toBe(1);
    expect(scoreResult.reusedCount).toBe(0);
    expect(scoreResult.score).toBeGreaterThan(50);
  });
});

describe('In-Memory CSV Bulk Import with Memory Zeroization', () => {
  it('parses Chrome CSV export and zeroizes input bytes in finally', async () => {
    await sodium.ready;
    const chromeCsv = `name,url,username,password,note
Google,https://accounts.google.com,testuser@gmail.com,MyDog2010!,Personal account
GitHub,https://github.com,octocat,StrongP@ssw0rd2026!,Work repo`;

    const encoder = new TextEncoder();
    const csvBytes = encoder.encode(chromeCsv);
    expect(csvBytes.some(b => b !== 0)).toBe(true);

    const vault = await createVault(sodium.from_string('TestMasterPassword123!'));
    const result = await importCsvBytesWithZeroization(csvBytes, vault.dek);

    // Verify parsed data
    expect(result.plaintexts).toHaveLength(2);
    expect(result.plaintexts[0]?.title).toBe('Google');
    expect(result.plaintexts[0]?.username).toBe('testuser@gmail.com');
    expect(result.plaintexts[0]?.password).toBe('MyDog2010!');
    expect(result.plaintexts[0]?.urls).toEqual(['https://accounts.google.com']);
    expect(result.plaintexts[0]?.notes).toBe('Personal account');

    expect(result.records).toHaveLength(2);
    expect(result.audit.totalImported).toBe(2);
    // MyDog2010! is 11 chars -> weak
    expect(result.audit.weakCount).toBe(1);

    // CRITICAL: Verify Memory Zeroization!
    // The original csvBytes buffer MUST be completely zeroed out!
    const allZeroes = csvBytes.every(byte => byte === 0);
    expect(allZeroes).toBe(true);
  });

  it('parses Bitwarden CSV export format', async () => {
    await sodium.ready;
    const bitwardenCsv = `folder,favorite,type,name,notes,fields,reprompt,login_uri,login_username,login_password,login_totp
,0,login,Dropbox,Important files,,0,https://dropbox.com,user@dropbox.com,SecretP@ssw0rd123!,JBSWY3DPEHPK3PXP`;

    const csvBytes = new TextEncoder().encode(bitwardenCsv);
    const result = await importCsvBytesWithZeroization(csvBytes);

    expect(result.plaintexts).toHaveLength(1);
    expect(result.plaintexts[0]?.title).toBe('Dropbox');
    expect(result.plaintexts[0]?.username).toBe('user@dropbox.com');
    expect(result.plaintexts[0]?.password).toBe('SecretP@ssw0rd123!');
    expect(result.plaintexts[0]?.urls).toEqual(['https://dropbox.com']);
    expect(result.plaintexts[0]?.totpConfig?.secret).toBe('JBSWY3DPEHPK3PXP');
    expect((result.plaintexts[0] as any)?.totpSecret).toBe('JBSWY3DPEHPK3PXP');

    // Verify buffer was zeroized
    expect(csvBytes.every(b => b === 0)).toBe(true);
  });

  it('parses 1Password CSV export format with quoted fields and commas', async () => {
    await sodium.ready;
    const onePasswordCsv = `"Title","Website","Username","Password","Notes"
"Amazon, Inc.","https://amazon.com","shopper@mail.com","Shop123!","Two-factor enabled, prime member"`;

    const csvBytes = new TextEncoder().encode(onePasswordCsv);
    const result = await importCsvBytesWithZeroization(csvBytes);

    expect(result.plaintexts).toHaveLength(1);
    expect(result.plaintexts[0]?.title).toBe('Amazon, Inc.');
    expect(result.plaintexts[0]?.username).toBe('shopper@mail.com');
    expect(result.plaintexts[0]?.password).toBe('Shop123!');
    expect(result.plaintexts[0]?.urls).toEqual(['https://amazon.com']);
    expect(result.plaintexts[0]?.notes).toBe('Two-factor enabled, prime member');

    // Verify buffer was zeroized
    expect(csvBytes.every(b => b === 0)).toBe(true);
  });
});
