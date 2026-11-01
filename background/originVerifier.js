/**
 * @file apps/extension/src/background/originVerifier.ts
 * @description Strict Origin & eTLD+1 Public Suffix List Verifier (`tldts@7.4.19`).
 *
 * Security Invariants (ARCHITECTURE.md v4.4 & Patch VG-05):
 * 1. NEVER trusts any origin or URL string inside the message payload; uses ONLY the real active tab URL
 *    queried via `chrome.tabs.query({ active: true, currentWindow: true })`.
 * 2. Rejects any non-`https:` scheme (`ERR_AUTOFILL_INSECURE_SCHEME`).
 * 3. Rejects any subframe (`sender.frameId !== 0`, `ERR_AUTOFILL_SUBFRAME_DENIED`).
 * 4. Defaults `matchMode` to `'exact_origin'` (Patch VG-05) so compromised sibling subdomains cannot
 *    receive credentials unless the user explicitly opts into `'base_domain'`.
 */

import { parse } from 'tldts';
import { VaultGuardError, ERR_AUTOFILL_INSECURE_SCHEME, ERR_AUTOFILL_ORIGIN_MISMATCH, ERR_AUTOFILL_SUBFRAME_DENIED } from '@vaultguard/shared';
/**
 * Validates that the autofill target tab is top-frame (`frameId === 0`), `https:`,
 * and matches at least one stored URL on the vault item according to `matchMode`
 * (defaults to `'exact_origin'` per Patch VG-05).
 */
export function verifySenderOriginAgainstItemUrls(sender, itemUrls, matchMode = 'exact_origin') {
  if (sender.frameId !== 0) {
    throw new VaultGuardError(ERR_AUTOFILL_SUBFRAME_DENIED, `Autofill denied in subframe (frameId=${String(sender.frameId)}). Only top-level frame (frameId=0) is permitted.`);
  }
  let parsedTabUrl;
  try {
    parsedTabUrl = new URL(sender.tabUrl);
  } catch {
    throw new VaultGuardError(ERR_AUTOFILL_ORIGIN_MISMATCH, 'Invalid or unparseable active tab URL.');
  }
  if (parsedTabUrl.protocol !== 'https:') {
    throw new VaultGuardError(ERR_AUTOFILL_INSECURE_SCHEME, `Autofill requires https: scheme (received ${parsedTabUrl.protocol}).`);
  }
  const tabTld = parse(parsedTabUrl.hostname, {
    allowPrivateDomains: true
  });
  const tabHost = tabTld.hostname;
  const tabDomain = tabTld.domain;
  if (!tabHost || !tabDomain || tabTld.isIp) {
    throw new VaultGuardError(ERR_AUTOFILL_ORIGIN_MISMATCH, 'Autofill requires a valid registrable domain name.');
  }
  let hasDomainMatch = false;
  for (const rawItemUrl of itemUrls) {
    try {
      const parsedItemUrl = new URL(rawItemUrl);
      if (parsedItemUrl.protocol !== 'https:') {
        continue;
      }
      const itemTld = parse(parsedItemUrl.hostname, {
        allowPrivateDomains: true
      });
      if (!itemTld.hostname || !itemTld.domain) {
        continue;
      }
      if (itemTld.hostname === tabHost && parsedItemUrl.origin === parsedTabUrl.origin) {
        return {
          exactHostMatch: true,
          registrableDomainMatch: true,
          hostname: tabHost,
          domain: tabDomain,
          matchMode
        };
      }
      if (matchMode === 'base_domain' && itemTld.domain === tabDomain) {
        hasDomainMatch = true;
      }
    } catch {
      continue;
    }
  }
  if (matchMode === 'base_domain' && hasDomainMatch) {
    return {
      exactHostMatch: false,
      registrableDomainMatch: true,
      hostname: tabHost,
      domain: tabDomain,
      matchMode
    };
  }
  throw new VaultGuardError(ERR_AUTOFILL_ORIGIN_MISMATCH, `Active tab origin (${parsedTabUrl.origin}) does not match any stored URL for the selected item under matchMode="${matchMode}".`);
}