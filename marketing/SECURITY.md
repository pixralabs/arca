# 🔒 Security Policy & Vulnerability Disclosure (`SECURITY.md`)

VaultGuard (Arca by Pixra) is built on a **100% Offline-First, Zero-Knowledge** architecture. We treat any bypass of our cryptographic envelope, origin verifier, DOM occlusion guard, or blind relay server as a critical priority.

## 1. Supported Versions

| Version | Supported | Security Notes |
| :--- | :--- | :--- |
| **`0.4.1` (Latest)** | ✅ **Yes** | Includes all `VG-01` through `VG-07` white-box pentest remediations. |
| `< 0.4.1` | ❌ **No** | Upgrade immediately to `0.4.1`. |

## 2. Threat Model & Zero-Knowledge Guarantees

* **Zero Plaintext on the Server:** The optional Rust Blind Relay (`apps/relay-server`) stores only `accountAuthPubKey` (32-byte Ed25519 public key derived via `BLAKE2b` context `"VG_AUT_1"`), `encryptedHeader`, `encryptedManifest`, and 256-byte padded `XChaCha20-Poly1305-IETF` item ciphertexts. Even a complete database compromise of the relay server exposes zero passwords, usernames, URLs, or TOTP secrets.
* **Split-Key Non-Extractable Session Memory:** When unlocked, the browser extension splits the 256-bit `DEK` between a non-extractable (`extractable: false`) WebCrypto `AES-256-GCM` `CryptoKey` in `IndexedDB` and ciphertext in `chrome.storage.session` (`TRUSTED_CONTEXTS`).
* **Anti-Clickjacking Autofill:** Content scripts perform a 5-point `document.elementsFromPoint()` geometry check and walk all parent DOM nodes to reject `opacity < 1`, `filter` (including `filter: opacity(0)`), `clip-path`, and `visibility: hidden` before filling any `<input>`.
* **Bot-Safe Ephemeral Share:** One-time share links (`https://share.vaultguard.dev/#<shareId>:<shareKeyBase64>`) keep the 256-bit `shareKey` exclusively inside the URL `#` fragment and require a keyed `BLAKE2b-256` `burnToken` on `POST /v1/share/:id/burn`.

## 3. How to Report a Security Vulnerability

**Please do NOT report security vulnerabilities through public GitHub Issues, Discussions, or Pull Requests.**

Instead, please report suspected vulnerabilities privately via one of the following channels:

1. **GitHub Private Security Reporting (Preferred):** Navigate to the repository's **Security** tab → **Report a vulnerability** to open a private advisory directly with the maintainers.
2. **Encrypted Security Email:** Send your report to **`security@pixra.dev`** (or `security@vaultguard.dev`).

### What to Include in Your Report
* The affected component and exact file path(s) (e.g., `packages/crypto/src/envelope.ts`, `apps/extension/src/content/fillGuard.ts`, or `apps/relay-server/src/share.rs`).
* Clear step-by-step reproduction instructions or a self-contained Vitest / Cargo test case demonstrating the flaw.
* Impact assessment (whether the issue impacts Confidentiality, Integrity, or Availability).

### Coordinated Disclosure Timeline & Safe Harbor
* **Acknowledgment:** Within **24 hours**.
* **Technical Triage & Confirmation:** Within **72 hours**.
* **Patch & Public Advisory Release:** Within **7 days** for Critical/High issues and **14 days** for Medium/Low issues.
* **Safe Harbor:** We authorize good-faith security research conducted against local builds of the extension, mobile app, and self-hosted instances of `apps/relay-server`. We will never pursue legal action against researchers who follow this policy and avoid accessing or disrupting other users' data.
