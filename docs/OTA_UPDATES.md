# Over-The-Air (OTA) JavaScript Updates Guide

Arca Mobile supports Over-The-Air (OTA) bundle updates powered by **CodePush**. This allows delivering immediate bugfixes, UI refinements, cryptographic algorithm patches in JavaScript, and style updates directly to users without waiting for Google Play Store review cycles.

---

## 1. How OTA Updates Work in Arca

When Arca boots up or returns to the foreground:
1. **Native Boot Hook (`MainApplication.kt`):** `reactNativeHost.getJSBundleFile()` invokes `CodePush.getJSBundleFile()`. If an OTA update has been downloaded, the app launches using the cached update bundle on the local filesystem; otherwise, it falls back to the embedded binary bundle (`assets://index.android.bundle`).
2. **Foreground Synchronization (`App.tsx`):** The root component is wrapped with `codePush({ checkFrequency: codePush.CheckFrequency.ON_APP_RESUME })`. Every time the user resumes the app, CodePush checks the server for bundle updates in the background without interrupting active user workflows.
3. **Seamless Installation:** Standard updates apply silently on the next resume (`InstallMode.ON_NEXT_RESUME`). Critical security updates marked mandatory (`isMandatory: true`) install immediately (`InstallMode.IMMEDIATE`).

---

## 2. Important: Native vs. OTA Boundaries

> [!IMPORTANT]
> **OTA updates only apply to JavaScript, TypeScript, and static asset bundle changes.**
> Any change affecting compiled native code **STILL REQUIRES** building a new Android App Bundle (`.aab`) and publishing an update through the Google Play Console.

### ✅ What CAN be updated via OTA:
- React component layouts, themes, and screen transitions.
- Business logic, validation, state management, and utility helpers.
- Cryptographic bridge glue code (e.g., `apps/mobile/src/crypto/mobileCrypto.ts`).
- New screens or modal dialogs that only rely on already-linked native modules.
- Translations, text strings, and bundled icons/images.

### ❌ What CANNOT be updated via OTA (Requires Play Store release):
- Adding or upgrading native libraries (e.g., updating `react-native-vision-camera`, `op-sqlite`, or native Reanimated).
- Modifying `AndroidManifest.xml` (e.g., adding permissions such as `CAMERA` or `USE_BIOMETRIC`).
- Modifying Kotlin/Java source files in `apps/mobile/android/app/src/main/java/...`.
- Changes to `build.gradle`, NDK versions, CMake files, ProGuard rules, or C++ native modules.
- Upgrading the React Native core framework version.

> [!WARNING]
> If you deploy an OTA update that calls native methods that do not exist in the user's installed binary version, the app will crash. Always restrict releases to matching binary versions using the `-t` / `--target-binary-version` flag.

---

## 3. Deployment Keys & Build Configuration

In `apps/mobile/android/app/build.gradle`, `resValue "string", "CodePushDeploymentKey"` is configured per build type:
- **Debug:** Empty string `""` (bypasses update checks during active Metro development).
- **Release:** Configurable via Gradle property `-PCODEPUSH_KEY=<key>` (or `CODEPUSH_KEY_ANDROID` in `gradle.properties`). Defaults to the configured deployment key placeholder.

### Building with a Production Deployment Key:
```bash
cd apps/mobile/android
./gradlew bundleRelease -PCODEPUSH_KEY="<YOUR_PRODUCTION_DEPLOYMENT_KEY>"
```

---

## 4. Releasing an OTA Update via CLI

You can release updates using either the **AppCenter CLI** or a self-hosted / Revopush server.

### Prerequisites
Install the CLI globally:
```bash
npm install -g appcenter-cli
# Or for Revopush / self-hosted CodePush:
# npm install -g revopush-cli
```

Log in to your account:
```bash
appcenter login
```

### Standard Staging Release
Test your changes on staging devices first:
```bash
appcenter codepush release-react \
  -a <ownerName>/Arca-Android \
  -d Staging \
  -t "0.5.0" \
  --description "Fix vault item search filter and UI spacing"
```

### Promoting from Staging to Production
Once verified on staging:
```bash
appcenter codepush promote \
  -a <ownerName>/Arca-Android \
  -s Staging \
  -d Production \
  --description "Promoted from Staging: v0.5.0 patch"
```

### Direct Production Release
To release directly to Production:
```bash
appcenter codepush release-react \
  -a <ownerName>/Arca-Android \
  -d Production \
  -t "0.5.0" \
  --description "Security patch: updated TOTP URI parser sanitization"
```

### Mandatory Security Update
For critical vulnerability fixes where all users must immediately restart into the new bundle:
```bash
appcenter codepush release-react \
  -a <ownerName>/Arca-Android \
  -d Production \
  -t "0.5.0" \
  -m true \
  --description "Critical: Enforced SAS code comparison for QR pairing"
```

### Gradual Rollout (Staged Percentage)
Deploy safely to a fraction of your user base first:
```bash
appcenter codepush release-react \
  -a <ownerName>/Arca-Android \
  -d Production \
  -t "0.5.0" \
  --rollout 25% \
  --description "Gradual rollout: 25% of active users"
```
To increase the rollout percentage to 100%:
```bash
appcenter codepush patch \
  -a <ownerName>/Arca-Android \
  -d Production \
  --rollout 100%
```

---

## 5. Monitoring & Rollbacks

### View Deployment History
Check active releases, install counts, rollback metrics, and active versions:
```bash
appcenter codepush deployment history Production -a <ownerName>/Arca-Android
```

### Instant Rollback
If an unexpected JS regression is reported in production:
```bash
# Roll back to the previous release
appcenter codepush rollback -a <ownerName>/Arca-Android -d Production

# Or roll back to a specific target release label (e.g., v3)
appcenter codepush rollback -a <ownerName>/Arca-Android -d Production --target-release v3
```

---

## 6. Self-Hosted / Custom Server (Revopush)

If utilizing a self-hosted CodePush server or Revopush:
1. Configure `CodePushServerUrl` in `resValue` in `build.gradle` or strings:
   ```groovy
   resValue "string", "CodePushServerUrl", '"https://your-codepush-server.com/"'
   ```
2. Or pass `serverUrl` directly in the `codePushOptions` inside `apps/mobile/src/App.tsx`:
   ```typescript
   const codePushOptions: CodePushOptions = {
     checkFrequency: codePush.CheckFrequency.ON_APP_RESUME,
     installMode: codePush.InstallMode.ON_NEXT_RESUME,
     serverUrl: 'https://your-codepush-server.com/',
   };
   ```

