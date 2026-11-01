/**
 * @vaultguard/crypto — Rejection-Sampled Password & Passphrase Generator (`generator.ts`)
 * Locked to ARCHITECTURE.md v3.1 & THE 7 CRYPTO FUNCTIONS RULE (`await sodium.ready` first line)
 * Uses `sodium.randombytes_uniform()` exclusively — ZERO modulo `%` bias.
 */

import sodium from 'libsodium-wrappers-sumo';
import { wordlist } from '@scure/bip39/wordlists/english';

export interface PasswordGeneratorOptions {
  length: number;
  includeSymbols: boolean;
  includeDigits: boolean;
  includeUppercase: boolean;
  excludeAmbiguous: boolean;
}

export const DEFAULT_PASSWORD_OPTIONS: PasswordGeneratorOptions = {
  length: 20,
  includeSymbols: true,
  includeDigits: true,
  includeUppercase: true,
  excludeAmbiguous: false,
};

const LOWERCASE_ALL = 'abcdefghijklmnopqrstuvwxyz';
const LOWERCASE_UNAMBIGUOUS = 'abcdefghjkmnpqrstuvwxyz'; // excludes i, l, o
const UPPERCASE_ALL = 'ABCDEFGHJKLMNPQRSTUVWXYZIO';
const UPPERCASE_UNAMBIGUOUS = 'ABCDEFGHJKLMNPQRSTUVWXYZ'; // excludes I, O
const DIGITS_ALL = '0123456789';
const DIGITS_UNAMBIGUOUS = '23456789'; // excludes 0, 1
const SYMBOLS_CHARSET = '!@#$%^&*()-_=+[]{}|;:,.<>?';

/**
 * Generates a cryptographically strong password using `sodium.randombytes_uniform()`.
 * Guarantees at least 1 character from each enabled character class, then performs an
 * unbiased Fisher-Yates shuffle using `sodium.randombytes_uniform()`.
 */
export async function generatePassword(
  opts: Partial<PasswordGeneratorOptions> = DEFAULT_PASSWORD_OPTIONS
): Promise<string> {
  await sodium.ready; // MUST be first line

  const options: PasswordGeneratorOptions = {
    ...DEFAULT_PASSWORD_OPTIONS,
    ...opts,
  };

  if (!Number.isInteger(options.length) || options.length < 12 || options.length > 128) {
    throw new Error('GENERATOR_INVALID_PASSWORD_LENGTH');
  }

  const lower = options.excludeAmbiguous ? LOWERCASE_UNAMBIGUOUS : LOWERCASE_ALL;
  const upper = options.excludeAmbiguous ? UPPERCASE_UNAMBIGUOUS : UPPERCASE_ALL;
  const digits = options.excludeAmbiguous ? DIGITS_UNAMBIGUOUS : DIGITS_ALL;

  const activePools = [lower];
  if (options.includeUppercase) activePools.push(upper);
  if (options.includeDigits) activePools.push(digits);
  if (options.includeSymbols) activePools.push(SYMBOLS_CHARSET);

  const combinedAlphabet = activePools.join('');
  const chars: string[] = [];

  // 1. Guarantee at least one character from each enabled character pool
  for (const pool of activePools) {
    const idx = sodium.randombytes_uniform(pool.length);
    const ch = pool[idx];
    if (ch === undefined) throw new Error('GENERATOR_INDEX_OUT_OF_BOUNDS');
    chars.push(ch);
  }

  // 2. Fill remaining positions uniformly from the combined alphabet
  while (chars.length < options.length) {
    const idx = sodium.randombytes_uniform(combinedAlphabet.length);
    const ch = combinedAlphabet[idx];
    if (ch === undefined) throw new Error('GENERATOR_INDEX_OUT_OF_BOUNDS');
    chars.push(ch);
  }

  // 3. Unbiased Fisher-Yates shuffle using sodium.randombytes_uniform
  for (let i = chars.length - 1; i > 0; i--) {
    const j = sodium.randombytes_uniform(i + 1);
    const temp = chars[i];
    const swapVal = chars[j];
    if (temp === undefined || swapVal === undefined) {
      throw new Error('GENERATOR_SHUFFLE_OUT_OF_BOUNDS');
    }
    chars[i] = swapVal;
    chars[j] = temp;
  }

  return chars.join('');
}

/**
 * Generates a high-entropy passphrase from the audited 2048-word @scure/bip39 English wordlist
 * using `sodium.randombytes_uniform(2048)`.
 */
export async function generatePassphrase(wordCount = 6, separator = '-'): Promise<string> {
  await sodium.ready; // MUST be first line

  if (!Number.isInteger(wordCount) || wordCount < 4 || wordCount > 24) {
    throw new Error('GENERATOR_INVALID_WORD_COUNT');
  }

  const selectedWords: string[] = [];
  for (let i = 0; i < wordCount; i++) {
    const wordIdx = sodium.randombytes_uniform(wordlist.length);
    const word = wordlist[wordIdx];
    if (word === undefined) {
      throw new Error('GENERATOR_WORDLIST_OUT_OF_BOUNDS');
    }
    selectedWords.push(word);
  }

  return selectedWords.join(separator);
}
