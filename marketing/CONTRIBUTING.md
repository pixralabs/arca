# 🤝 Contributing to VaultGuard (Arca by Pixra)

Thank you for contributing to **VaultGuard (Arca by Pixra)**! Because this project safeguards sensitive credentials and cryptographic keys, all contributions must follow our strict zero-knowledge and memory-safety engineering standards.

## 1. Setting Up the Development Environment

### Prerequisites
* **Node.js:** `v18.20+` or `v20+` LTS
* **Package Manager:** `pnpm` `v9+`
* **Rust Toolchain:** `rustup` `1.82+` (`cargo`, `clippy`, `rustfmt`) for `apps/relay-server`
* **Android SDK & JDK 17:** Required when building the React Native 0.76+ Android app (`apps/mobile`)

### Installation & Local Build
```bash
# 1. Clone the repository
git clone https://github.com/pixralabs/arca.git
cd arca

# 2. Install all workspace dependencies
pnpm install

# 3. Build and verify the Browser Extension (Babel + Acorn + ESLint)
pnpm run build:extension
```

## 2. Running the Test Suites

```bash
# 1. Run TypeScript / Cryptographic Unit Tests (Vitest)
pnpm test

# 2. Run Rust Blind Relay Server Integration Tests (Ed25519 Auth, HLC CRDT, Ephemeral Share)
pnpm run test:relay

# 3. Verify Mobile React Native JSI & SQLite Bridge
bash scripts/build-mobile.sh
```

## 3. Core Security & Code Style Invariants

Every pull request must satisfy these mandatory checks:

1. **`await sodium.ready;` on Line 1:** Every `async` function in `packages/crypto/src/*` and `apps/mobile/src/crypto/*` must call `await sodium.ready;` on its very first line before invoking any `sodium.*` primitive.
2. **Deterministic Buffer Zeroization (`sodium.memzero`):** Every transient `Uint8Array` holding sensitive material (`dek`, `masterSeed`, `authSeed`, `privateKey`, `shareKey`, `paddedPlaintext`) must be wiped via `sodium.memzero()` inside a `finally` block.
3. **Zero Host-Page DOM Injection:** Content scripts (`apps/extension/src/content/*`) must never inject custom HTML elements (`0` calls to `createElement`, `appendChild`, `innerHTML`, or `attachShadow`).
4. **Active Tab Origin Verification (`exact_origin`):** Autofill handlers in `apps/extension/src/background/autofill.ts` must resolve the active tab via `chrome.tabs.query({ active: true, currentWindow: true })`, enforce `frameId === 0`, and default `matchMode` to `'exact_origin'`.
5. **Line-1 Offline Guard:** All network-capable functions in `packages/crypto/src/syncClient.ts` must begin with `if (!syncEnabled) { throw new Error('Sync is disabled'); }`.
6. **Parameterized SQL & `PRAGMA secure_delete = ON`:** All SQLite queries in `apps/relay-server` and `apps/mobile` must use bound parameters (`?`) and enable `PRAGMA secure_delete = ON;` so deleted rows are zero-filled on disk.

## 4. Submitting a Pull Request

1. Create a feature or fix branch from `main` (`feat/your-feature`, `fix/issue-name`, or `sec/hardening-id`).
2. Ensure all unit tests (`pnpm test`), static verification (`node scripts/build-extension.mjs`), and Rust integration tests (`cargo test --manifest-path apps/relay-server/Cargo.toml`) pass with zero warnings.
3. Use Conventional Commit messages (e.g., `feat(totp): add 8-digit SHA-256 URI support`).
4. Open a Pull Request describing the architectural motivation and test coverage. By contributing, you agree to license your work under the repository's **GNU Affero General Public License v3.0 (`AGPL-3.0`)**.
