/**
 * @vaultguard/shared — Standardized Error Codes & Localized UX Copy (EN + HI)
 * Locked to ARCHITECTURE.md v3.1 §7 (Finding 4 Fix)
 */

export const ERR_VAULT_CORRUPTED = 'ERR_VAULT_CORRUPTED';
export const ERR_VAULT_LOCKED = 'ERR_VAULT_LOCKED';
export const ERR_VAULT_ROLLBACK = 'ERR_VAULT_ROLLBACK';
export const ERR_MANIFEST_MAC_FAILED = 'ERR_MANIFEST_MAC_FAILED';
export const ERR_RECOVERY_INVALID = 'ERR_RECOVERY_INVALID';
export const ERR_SW_TERMINATED = 'ERR_SW_TERMINATED';
export const ERR_WRONG_PASSWORD = 'ERR_WRONG_PASSWORD';
export const ERR_SESSION_PERSIST_UNSUPPORTED = 'ERR_SESSION_PERSIST_UNSUPPORTED';
export const ERR_AUTOFILL_OCCLUDED = 'ERR_AUTOFILL_OCCLUDED';
export const ERR_WORKER_QUEUE_OVERFLOW = 'ERR_WORKER_QUEUE_OVERFLOW';
export const ERR_SCHEMA_INVALID = 'ERR_SCHEMA_INVALID';
export const ERR_AUTOFILL_ORIGIN_MISMATCH = 'ERR_AUTOFILL_ORIGIN_MISMATCH';
export const ERR_AUTOFILL_SUBFRAME_DENIED = 'ERR_AUTOFILL_SUBFRAME_DENIED';
export const ERR_AUTOFILL_INSECURE_SCHEME = 'ERR_AUTOFILL_INSECURE_SCHEME';

export const VAULTGUARD_ERROR_CODES = [
  ERR_VAULT_CORRUPTED,
  ERR_VAULT_LOCKED,
  ERR_VAULT_ROLLBACK,
  ERR_MANIFEST_MAC_FAILED,
  ERR_RECOVERY_INVALID,
  ERR_SW_TERMINATED,
  ERR_WRONG_PASSWORD,
  ERR_SESSION_PERSIST_UNSUPPORTED,
  ERR_AUTOFILL_OCCLUDED,
  ERR_WORKER_QUEUE_OVERFLOW,
  ERR_SCHEMA_INVALID,
  ERR_AUTOFILL_ORIGIN_MISMATCH,
  ERR_AUTOFILL_SUBFRAME_DENIED,
  ERR_AUTOFILL_INSECURE_SCHEME,
] as const;

export type VaultGuardErrorCode = (typeof VAULTGUARD_ERROR_CODES)[number] | string;

export interface ErrorDescriptor {
  code: string;
  en: string;
  hi: string;
  recoverable: boolean;
}

export const VAULTGUARD_ERRORS: Record<string, ErrorDescriptor> = {
  [ERR_VAULT_CORRUPTED]: {
    code: ERR_VAULT_CORRUPTED,
    en: 'Vault integrity check failed. To protect your credentials, unlocking was halted. You can export your encrypted vault backup and restore from a clean backup.',
    hi: 'वॉल्ट सुरक्षा जांच विफल रही। आपके पासवर्ड की सुरक्षा के लिए अनलॉक रोक दिया गया है। आप अपना एन्क्रिप्टेड बैकअप एक्सपोर्ट कर सकते हैं।',
    recoverable: false,
  },
  [ERR_VAULT_LOCKED]: {
    code: ERR_VAULT_LOCKED,
    en: 'Vault is currently locked. Please unlock with your Master Password or Biometrics.',
    hi: 'वॉल्ट वर्तमान में लॉक है। कृपया अपने मास्टर पासवर्ड या बायोमेट्रिक्स से अनलॉक करें।',
    recoverable: true,
  },
  [ERR_VAULT_ROLLBACK]: {
    code: ERR_VAULT_ROLLBACK,
    en: 'Rollback attack detected: manifest revision is older than the last known state.',
    hi: 'रोलबैक हमले का पता चला: मेनिफेस्ट रिवीज़न अंतिम ज्ञात स्थिति से पुराना है।',
    recoverable: false,
  },
  [ERR_MANIFEST_MAC_FAILED]: {
    code: ERR_MANIFEST_MAC_FAILED,
    en: 'Vault manifest signature verification failed.',
    hi: 'वॉल्ट मेनिफेस्ट हस्ताक्षर सत्यापन विफल रहा।',
    recoverable: false,
  },
  [ERR_RECOVERY_INVALID]: {
    code: ERR_RECOVERY_INVALID,
    en: 'Invalid 24-word Recovery Key. Please check the spelling and order of your words and try again.',
    hi: 'अमान्य 24-शब्द रिकवरी कुंजी। कृपया अपने शब्दों की स्पेलिंग और क्रम जांचें और पुनः प्रयास करें।',
    recoverable: true,
  },
  [ERR_SW_TERMINATED]: {
    code: ERR_SW_TERMINATED,
    en: 'Background security worker restarted seamlessly.',
    hi: 'बैकग्राउंड सुरक्षा वर्कर सुचारू रूप से पुनः आरंभ हो गया।',
    recoverable: true,
  },
  [ERR_WRONG_PASSWORD]: {
    code: ERR_WRONG_PASSWORD,
    en: 'Incorrect master password. Attempt {{count}} — please wait {{backoffSec}}s before trying again.',
    hi: 'गलत मास्टर पासवर्ड। प्रयास {{count}} — कृपया दोबारा प्रयास करने से पहले {{backoffSec}} सेकंड प्रतीक्षा करें।',
    recoverable: true,
  },
  [ERR_SESSION_PERSIST_UNSUPPORTED]: {
    code: ERR_SESSION_PERSIST_UNSUPPORTED,
    en: 'Browser privacy mode active: your vault will lock automatically when the browser background worker sleeps.',
    hi: 'ब्राउज़र गोपनीयता मोड सक्रिय है: बैकग्राउंड वर्कर के निष्क्रिय होने पर आपका वॉल्ट स्वतः लॉक हो जाएगा।',
    recoverable: true,
  },
  [ERR_AUTOFILL_OCCLUDED]: {
    code: ERR_AUTOFILL_OCCLUDED,
    en: 'Autofill blocked: the login field on this page is hidden or covered by an overlay. Use Copy Password if you trust this site.',
    hi: 'ऑटोफिल रोक दिया गया: इस पेज का लॉगिन फ़ील्ड छिपा हुआ है या किसी ओवरले से ढका है।',
    recoverable: true,
  },
  [ERR_WORKER_QUEUE_OVERFLOW]: {
    code: ERR_WORKER_QUEUE_OVERFLOW,
    en: 'VaultGuard is currently finishing a security operation. Please wait a moment.',
    hi: 'VaultGuard अभी एक सुरक्षा प्रक्रिया पूरी कर रहा है। कृपया कुछ क्षण प्रतीक्षा करें।',
    recoverable: true,
  },
  [ERR_SCHEMA_INVALID]: {
    code: ERR_SCHEMA_INVALID,
    en: 'Invalid vault payload or schema structure.',
    hi: 'अमान्य वॉल्ट पेलोड या स्कीमा संरचना।',
    recoverable: false,
  },
  [ERR_AUTOFILL_ORIGIN_MISMATCH]: {
    code: ERR_AUTOFILL_ORIGIN_MISMATCH,
    en: 'Active tab origin does not match stored vault credentials.',
    hi: 'सक्रिय टैब ओरिजिन संग्रहीत वॉल्ट क्रेडेंशियल से मेल नहीं खाता है।',
    recoverable: true,
  },
  [ERR_AUTOFILL_SUBFRAME_DENIED]: {
    code: ERR_AUTOFILL_SUBFRAME_DENIED,
    en: 'Autofill denied in embedded iframe. Only top-level tab frame is permitted.',
    hi: 'एम्बेडेड iframe में ऑटोफिल अस्वीकृत। केवल शीर्ष-स्तरीय टैब फ़्रेम की अनुमति है।',
    recoverable: true,
  },
  [ERR_AUTOFILL_INSECURE_SCHEME]: {
    code: ERR_AUTOFILL_INSECURE_SCHEME,
    en: 'Autofill denied: insecure HTTP scheme detected. HTTPS is mandatory.',
    hi: 'ऑटोफिल अस्वीकृत: असुरक्षित HTTP योजना का पता चला। HTTPS अनिवार्य है।',
    recoverable: true,
  },
};

function formatTemplate(template: string, params?: Record<string, unknown> | string): string {
  if (!params) return template;
  if (typeof params === 'string') return `${template} (${params})`;
  let output = template;
  for (const [key, value] of Object.entries(params)) {
    output = output.replaceAll(`{{${key}}}`, String(value));
  }
  return output;
}

export class VaultGuardError extends Error {
  public readonly code: string;
  public readonly en: string;
  public readonly hi: string;
  public readonly recoverable: boolean;

  constructor(code: string, params?: Record<string, unknown> | string) {
    const descriptor = VAULTGUARD_ERRORS[code] ?? {
      code,
      en: typeof params === 'string' ? params : code,
      hi: typeof params === 'string' ? params : code,
      recoverable: false,
    };
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
