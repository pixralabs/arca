# 🚀 VaultGuard (Arca by Pixra) — Production Deployment Guide (`docs/DEPLOYMENT.md`)

This guide walks you step-by-step through deploying all three production targets of **VaultGuard (`v0.4.1`)**:
1. **Rust Blind Relay Server (`apps/relay-server`)** on **Render.com** (Free Tier via Docker).
2. **Browser Extension (`apps/extension`)** to the **Chrome Web Store**.
3. **React Native 0.76+ Android App (`apps/mobile`)** as a signed **`.aab` (Android App Bundle)** for the **Google Play Store**.

---

## Part 1: Deploy the Rust Blind Relay Server on Render.com (Free Tier)

The Rust Blind Relay Server (`apps/relay-server`) is packaged with a multi-stage `Dockerfile` (`apps/relay-server/Dockerfile`) that compiles the static `vaultguard-relay-server` binary and runs as an unprivileged user (`uid=10001`) with SQLite WAL mode and `PRAGMA secure_delete = ON`.

### Step 1 — Verify `apps/relay-server/Dockerfile`
Ensure `apps/relay-server/Dockerfile` is committed to your GitHub repository:

```dockerfile
FROM rust:1.82-slim-bookworm AS builder
WORKDIR /app
RUN apt-get update && apt-get install -y --no-install-recommends pkg-config libsqlite3-dev ca-certificates && rm -rf /var/lib/apt/lists/*
COPY Cargo.toml ./
COPY migrations ./migrations
COPY src ./src
RUN cargo build --release

FROM debian:bookworm-slim AS runtime
WORKDIR /app
RUN apt-get update && apt-get install -y --no-install-recommends libsqlite3-0 ca-certificates && rm -rf /var/lib/apt/lists/* \
    && useradd -m -u 10001 arca
COPY --from=builder /app/target/release/vaultguard-relay-server /usr/local/bin/vaultguard-relay-server
USER arca
ENV DATABASE_URL="sqlite:///tmp/arca_relay.db"
ENV TRUSTED_PROXY="true"
EXPOSE 8080
CMD ["/usr/local/bin/vaultguard-relay-server"]
```

### Step 2 — Create the Web Service on Render.com
1. Push your repository to GitHub (`https://github.com/pixra/arca`).
2. Sign in to [Render.com](https://render.com) and click **New +** → **Web Service**.
3. Connect your GitHub repository and configure the service settings:
   * **Name:** `arca-blind-relay`
   * **Root Directory:** `apps/relay-server`
   * **Runtime / Environment:** `Docker`
   * **Dockerfile Path:** `./Dockerfile`
   * **Instance Type:** `Free`
4. Under **Environment Variables**, add:
   | Key | Value | Purpose |
   | :--- | :--- | :--- |
   | `PORT` | `8080` | Binds the Axum listener to port `8080`. |
   | `DATABASE_URL` | `sqlite:///tmp/arca_relay.db` | SQLite database path (or mount a Render Disk at `/data/arca_relay.db` on paid plans). |
   | `TRUSTED_PROXY` | `true` | Enables `X-Forwarded-For` parsing behind Render's load balancer for the 5 req/min `/v1/share/create` rate limiter (`VG-02`). |
5. Click **Create Web Service**. Once Render finishes building the Docker image, your relay server will be live at `https://arca-blind-relay.onrender.com`.
6. In the VaultGuard Browser Extension or Mobile App, open **Settings → Sync Settings**, enter your Render URL (`https://arca-blind-relay.onrender.com`), and toggle **Enable Zero-Knowledge Sync** ON.

---

## Part 2: Publish the Browser Extension to the Chrome Web Store

### Step 1 — Generate the Clean Production ZIP (`arca-extension-ready.zip`)
The Chrome Web Store requires a `.zip` archive where `manifest.json` sits directly at the root of the archive (not inside a subfolder).

```bash
# Run from the monorepo root
node scripts/build-extension.mjs
```

Verify that `arca-extension-ready.zip` has `manifest.json` at the root:
```bash
unzip -l arca-extension-ready.zip | head -n 25
```

### Step 2 — Upload to the Chrome Web Store Developer Dashboard
1. Open the [Chrome Web Store Developer Dashboard](https://chrome.google.com/webstore/devconsole) (requires a one-time $5 developer registration fee).
2. Click **New Item** and upload **`arca-extension-ready.zip`**.
3. Fill in the **Store Listing** tab (see `docs/STORE_LISTING.md` for copy-paste text):
   * **Title:** `Arca - Zero-Knowledge Password Manager`
   * **Summary (124 chars):** `100% offline-first, zero-knowledge password manager with Argon2id + XChaCha20-Poly1305, built-in 2FA, and anti-clickjacking.`
   * **Category:** `Privacy & Security`
   * **Icons & Screenshots:** Upload `apps/extension/icons/128.png` and 1280×800 screenshots of the Charcoal Vault, TOTP ring, and One-Time Share modal.
4. Fill in the **Privacy Practices** tab for fast reviewer approval:
   * **Single Purpose:** `Arca is a local-first, zero-knowledge password manager and 2FA authenticator that encrypts, stores, and autofills user login credentials entirely on the user's device.`
   * **Remote Code:** Select **No, I am not using Remote code** (all JS and `libsodium` WASM modules are bundled locally).
   * **Permission Justifications:**
     * `storage`: Stores local encrypted vault metadata and split-key ephemeral session ciphertext (`chrome.storage.session`).
     * `alarms`: Enforces the MV3 inactivity auto-lock timer and the 30-second clipboard auto-clear alarm.
     * `activeTab`: Verifies active tab origin (`chrome.tabs.query`) and autofills login fields strictly upon explicit user gesture without requesting `<all_urls>`.
     * `offscreen`: Scrubs copied passwords from the system clipboard after 30 seconds via an MV3 Offscreen Document.
     * `scripting`: Injects the non-mutating `:focus` lock badge CSS rule into the top frame (`frameId: 0`).
     * `contextMenus` & `notifications`: Provides right-click quick autofill and local clipboard-cleared security notifications.
5. Click **Submit for Review**. Standard review completes within 24–72 hours.

---

## Part 3: Build the Android App (`.aab`) for the Google Play Store

The mobile app in `apps/mobile` is built on **React Native 0.76+ (New Architecture & Hermes)** with native C++ JSI Libsodium (`react-native-sodium-jsi`), SQLite WAL storage (`@op-engineering/op-sqlite`), hardware-backed StrongBox (`react-native-keychain`), and a native Android Autofill Service (`VaultGuardAutofillService.kt`).

### Step 1 — Generate an Upload Keystore
Generate a 2048-bit RSA upload keystore for signing your Play Store Android App Bundle (`.aab`):

```bash
keytool -genkeypair -v \
  -storetype PKCS12 \
  -keystore apps/mobile/android/app/arca-upload-key.keystore \
  -alias arca-key-alias \
  -keyalg RSA \
  -keysize 2048 \
  -validity 10000
```

### Step 2 — Configure Gradle Signing Variables
Add your keystore credentials to `~/.gradle/gradle.properties` (never commit plaintext keystore passwords to Git):

```ini
ARCA_UPLOAD_STORE_FILE=arca-upload-key.keystore
ARCA_UPLOAD_KEY_ALIAS=arca-key-alias
ARCA_UPLOAD_STORE_PASSWORD=your_strong_keystore_password
ARCA_UPLOAD_KEY_PASSWORD=your_strong_key_password
```

### Step 3 — Bundle Hermes JS & Compile the Signed `.aab`
Run the following commands from the monorepo root:

```bash
# 1. Install all workspace dependencies
pnpm install

# 2. Pre-bundle the production React Native JS bundle
cd apps/mobile
pnpm run bundle:android

# 3. Compile the signed Release Android App Bundle (.aab)
cd android
./gradlew clean
./gradlew bundleRelease
```

### Step 4 — Locate & Upload the `.aab` to Google Play Console
1. Your signed Android App Bundle will be generated at:
   ```text
   apps/mobile/android/app/build/outputs/bundle/release/app-release.aab
   ```
2. Verify the `.aab` signature before uploading:
   ```bash
   jarsigner -verify -verbose -certs app/build/outputs/bundle/release/app-release.aab
   ```
3. Open the [Google Play Console](https://play.google.com/console), create a new app (**Arca by Pixra**), navigate to **Release → Production → Create new release**, and upload **`app-release.aab`**.
4. In the Play Console **App Content → Data Safety** section, declare that all user credentials are encrypted end-to-end on the device (`XChaCha20-Poly1305` + `Argon2id`) and that users can permanently delete synced data at any time via `DELETE /v1/account`.
