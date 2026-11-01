/**
 * @vaultguard/shared — Standardized Error Codes & Localized UX Copy (EN + HI)
 * Locked to ARCHITECTURE.md v3.1 §7 (Finding 4 Fix)
 */

export const VAULTGUARD_ERROR_CODES = ['ERR_VAULT_CORRUPTED', 'ERR_RECOVERY_INVALID', 'ERR_SW_TERMINATED', 'ERR_WRONG_PASSWORD', 'ERR_SESSION_PERSIST_UNSUPPORTED', 'ERR_AUTOFILL_OCCLUDED', 'ERR_WORKER_QUEUE_OVERFLOW'];
export const VAULTGUARD_ERRORS = {
  ERR_VAULT_CORRUPTED: {
    code: 'ERR_VAULT_CORRUPTED',
    en: 'Vault integrity check failed. To protect your credentials, unlocking was halted. You can export your encrypted vault backup and restore from a clean backup.',
    hi: 'वॉल्ट सुरक्षा जांच विफल रही। आपके पासवर्ड की सुरक्षा के लिए अनलॉक रोक दिया गया है। आप अपना एन्क्रिप्टेड बैकअप एक्सपोर्ट कर सकते हैं।',
    recoverable: false
  },
  ERR_RECOVERY_INVALID: {
    code: 'ERR_RECOVERY_INVALID',
    en: 'Invalid 24-word Recovery Key. Please check the spelling and order of your words and try again.',
    hi: 'अमान्य 24-शब्द रिकवरी कुंजी। कृपया अपने शब्दों की स्पेलिंग और क्रम जांचें और पुनः प्रयास करें।',
    recoverable: true
  },
  ERR_SW_TERMINATED: {
    code: 'ERR_SW_TERMINATED',
    en: 'Background security worker restarted seamlessly.',
    hi: 'बैकग्राउंड सुरक्षा वर्कर सुचारू रूप से पुनः आरंभ हो गया।',
    recoverable: true
  },
  ERR_WRONG_PASSWORD: {
    code: 'ERR_WRONG_PASSWORD',
    en: 'Incorrect master password. Attempt {{count}} — please wait {{backoffSec}}s before trying again.',
    hi: 'गलत मास्टर पासवर्ड। प्रयास {{count}} — कृपया दोबारा प्रयास करने से पहले {{backoffSec}} सेकंड प्रतीक्षा करें।',
    recoverable: true
  },
  ERR_SESSION_PERSIST_UNSUPPORTED: {
    code: 'ERR_SESSION_PERSIST_UNSUPPORTED',
    en: 'Browser privacy mode active: your vault will lock automatically when the browser background worker sleeps.',
    hi: 'ब्राउज़र गोपनीयता मोड सक्रिय है: बैकग्राउंड वर्कर के निष्क्रिय होने पर आपका वॉल्ट स्वतः लॉक हो जाएगा।',
    recoverable: true
  },
  ERR_AUTOFILL_OCCLUDED: {
    code: 'ERR_AUTOFILL_OCCLUDED',
    en: 'Autofill blocked: the login field on this page is hidden or covered by an overlay. Use Copy Password if you trust this site.',
    hi: 'ऑटोफिल रोक दिया गया: इस पेज का लॉगिन फ़ील्ड छिपा हुआ है या किसी ओवरले से ढका है।',
    recoverable: true
  },
  ERR_WORKER_QUEUE_OVERFLOW: {
    code: 'ERR_WORKER_QUEUE_OVERFLOW',
    en: 'VaultGuard is currently finishing a security operation. Please wait a moment.',
    hi: 'VaultGuard अभी एक सुरक्षा प्रक्रिया पूरी कर रहा है। कृपया कुछ क्षण प्रतीक्षा करें।',
    recoverable: true
  }
};
export class VaultGuardError extends Error {
  constructor(code, params) {
    const descriptor = VAULTGUARD_ERRORS[code];
    const formattedEn = formatTemplate(descriptor.en, params);
    const formattedHi = formatTemplate(descriptor.hi, params);
    super(formattedEn);
    this.name = 'VaultGuardError';
    this.code = code;
    this.en = formattedEn;
    this.hi = formattedHi;
    this.recoverable = descriptor.recoverable;
  }
}
function formatTemplate(template, params) {
  if (!params) return template;
  let output = template;
  for (const [key, value] of Object.entries(params)) {
    output = output.replaceAll(`{{${key}}}`, String(value));
  }
  return output;
}