const fs = require('fs');
const path = require('path');

const libsToPatch = [
  'react-native-biometrics',
  'react-native-keychain',
  'jail-monkey',
  'react-native-sodium-jsi',
  '@react-native-async-storage/async-storage',
  'react-native-safe-area-context',
  'react-native-screens',
  'react-native-linear-gradient',
];

const candidateDirs = [
  path.join(__dirname, 'node_modules'),
  path.join(__dirname, '..', '..', 'node_modules'),
];

libsToPatch.forEach(lib => {
  for (const baseDir of candidateDirs) {
    const manifestPath = path.join(baseDir, lib, 'android', 'src', 'main', 'AndroidManifest.xml');
    if (fs.existsSync(manifestPath)) {
      try {
        const realManifestPath = fs.realpathSync(manifestPath);
        let content = fs.readFileSync(realManifestPath, 'utf8');
        if (/package="[^"]*"/.test(content)) {
          content = content.replace(/package="[^"]*"/, '');
          fs.writeFileSync(realManifestPath, content, 'utf8');
          console.log(`[patch-manifests] Patched manifest: ${lib}`);
        }
      } catch (err) {
        console.warn(`[patch-manifests] Failed to patch ${lib}:`, err.message);
      }
    }

    // Ensure namespace is present in build.gradle if missing (AGP 8+ requirement)
    const gradlePath = path.join(baseDir, lib, 'android', 'build.gradle');
    if (fs.existsSync(gradlePath)) {
      try {
        const realGradlePath = fs.realpathSync(gradlePath);
        let gradleContent = fs.readFileSync(realGradlePath, 'utf8');
        const namespaces = {
          'react-native-biometrics': 'com.rnbiometrics',
          'react-native-linear-gradient': 'com.BV.LinearGradient',
          'react-native-keychain': 'com.oblador.keychain',
          'jail-monkey': 'com.gantix.JailMonkey',
          'react-native-sodium-jsi': 'com.reactnativesodiumjsi',
          '@react-native-async-storage/async-storage': 'com.reactnativecommunity.asyncstorage',
          'react-native-safe-area-context': 'com.th3rdwave.safeareacontext',
          'react-native-screens': 'com.swmansion.rnscreens',
        };
        if (!gradleContent.includes('namespace') && namespaces[lib]) {
          gradleContent = gradleContent.replace(
            /android\s*\{/,
            `android {\n    namespace "${namespaces[lib]}"`
          );
          fs.writeFileSync(realGradlePath, gradleContent, 'utf8');
          console.log(`[patch-manifests] Added namespace to: ${lib} build.gradle`);
        }
      } catch (err) {
        console.warn(`[patch-manifests] Failed to patch build.gradle for ${lib}:`, err.message);
      }
    }

    // Patch react-native-keychain Android CipherStorageBase to enforce StrongBox (setIsStrongBoxBacked(true))
    // and InvalidatedByBiometricEnrollment(true) for CryptoObject biometric key wrapping
    if (lib === 'react-native-keychain') {
      const cipherBaseCandidates = [
        path.join(baseDir, lib, 'android', 'src', 'main', 'java', 'com', 'oblador', 'keychain', 'cipherStorage', 'CipherStorageBase.java'),
        path.join(baseDir, lib, 'android', 'src', 'main', 'java', 'com', 'oblador', 'keychain', 'cipherStorage', 'CipherStorageKeystoreAesCbc.java'),
      ];
      for (const cipherFile of cipherBaseCandidates) {
        if (fs.existsSync(cipherFile)) {
          try {
            const realCipherFile = fs.realpathSync(cipherFile);
            let cipherContent = fs.readFileSync(realCipherFile, 'utf8');
            if (
              cipherContent.includes('KeyGenParameterSpec.Builder') &&
              !cipherContent.includes('setIsStrongBoxBacked(true)')
            ) {
              cipherContent = cipherContent.replace(
                /\.setUserAuthenticationRequired\(true\)/g,
                '.setUserAuthenticationRequired(true).setInvalidatedByBiometricEnrollment(true).setIsStrongBoxBacked(true)'
              );
              fs.writeFileSync(realCipherFile, cipherContent, 'utf8');
              console.log(`[patch-manifests] Enforced StrongBox (setIsStrongBoxBacked(true)) in ${path.basename(cipherFile)}`);
            }
          } catch (err) {
            console.warn('[patch-manifests] Failed to patch StrongBox in react-native-keychain:', err.message);
          }
        }
      }
    }

    // Also patch op-sqlite CMakeLists.txt and build.gradle for RN 0.76+ & minSdkVersion 24
    const opSqliteGradle = path.join(baseDir, '@op-engineering', 'op-sqlite', 'android', 'build.gradle');
    if (fs.existsSync(opSqliteGradle)) {
      try {
        const realGradle = fs.realpathSync(opSqliteGradle);
        let content = fs.readFileSync(realGradle, 'utf8');
        if (content.includes('minSdkVersion 23')) {
          content = content.replace('minSdkVersion 23', 'minSdkVersion safeExtGet("minSdkVersion", 24)');
          fs.writeFileSync(realGradle, content, 'utf8');
          console.log('[patch-manifests] Patched op-sqlite build.gradle for minSdkVersion 24');
        }
      } catch (err) {
        console.warn('[patch-manifests] Failed to patch op-sqlite build.gradle:', err.message);
      }
    }

    const opSqliteCmake = path.join(baseDir, '@op-engineering', 'op-sqlite', 'android', 'CMakeLists.txt');
    if (fs.existsSync(opSqliteCmake)) {
      try {
        const realCmakePath = fs.realpathSync(opSqliteCmake);
        let cmakeContent = fs.readFileSync(realCmakePath, 'utf8');
        if (cmakeContent.includes('ReactAndroid::turbomodulejsijni')) {
          cmakeContent = cmakeContent.replace(
            /find_library\(LOG_LIB log\)/,
            `find_library(LOG_LIB log)\n\nif(TARGET ReactAndroid::reactnative)\n  set(REACT_NATIVE_EXTRA_LIBS ReactAndroid::reactnative)\nelse()\n  set(REACT_NATIVE_EXTRA_LIBS ReactAndroid::turbomodulejsijni ReactAndroid::react_nativemodule_core)\nendif()`
          );
          cmakeContent = cmakeContent.replace(
            /ReactAndroid::turbomodulejsijni\s+ReactAndroid::react_nativemodule_core/g,
            '${REACT_NATIVE_EXTRA_LIBS}'
          );
          fs.writeFileSync(realCmakePath, cmakeContent, 'utf8');
          console.log('[patch-manifests] Patched op-sqlite CMakeLists.txt for RN 0.76+ compatibility');
        }
      } catch (err) {
        console.warn('[patch-manifests] Failed to patch op-sqlite CMakeLists.txt:', err.message);
      }
    }
  }
});

// Patch react-native-code-push CodePushNativeModule.java for RN 0.77+ (ChoreographerCompat replaced by android.view.Choreographer)
for (const baseDir of candidateDirs) {
  const codePushModule = path.join(
    baseDir,
    'react-native-code-push',
    'android',
    'app',
    'src',
    'main',
    'java',
    'com',
    'microsoft',
    'codepush',
    'react',
    'CodePushNativeModule.java'
  );
  if (fs.existsSync(codePushModule)) {
    try {
      const realModulePath = fs.realpathSync(codePushModule);
      let content = fs.readFileSync(realModulePath, 'utf8');
      if (content.includes('com.facebook.react.modules.core.ChoreographerCompat')) {
        content = content.replace(
          'import com.facebook.react.modules.core.ChoreographerCompat;',
          'import android.view.Choreographer;'
        );
        content = content.replace(
          'new ChoreographerCompat.FrameCallback()',
          'new Choreographer.FrameCallback()'
        );
        fs.writeFileSync(realModulePath, content, 'utf8');
        console.log('[patch-manifests] Patched CodePushNativeModule.java for RN 0.77+ Choreographer');
      }
    } catch (err) {
      console.warn('[patch-manifests] Failed to patch CodePushNativeModule.java:', err.message);
    }
  }
}

// Patch graphicsConversions.h std::format in Gradle transform caches for NDK 26 compatibility
try {
  const os = require('os');
  const gradleCaches = path.join(os.homedir(), '.gradle', 'caches');
  if (fs.existsSync(gradleCaches)) {
    const findAndPatch = (dir) => {
      const entries = fs.readdirSync(dir, { withFileTypes: true });
      for (const entry of entries) {
        const fullPath = path.join(dir, entry.name);
        if (entry.isDirectory()) {
          // Avoid scanning non-transform folders to keep it fast
          if (entry.name === 'transforms' || entry.name.startsWith('8.') || !dir.includes('caches/')) {
            findAndPatch(fullPath);
          }
        } else if (entry.name === 'graphicsConversions.h') {
          let hContent = fs.readFileSync(fullPath, 'utf8');
          if (hContent.includes('std::format(')) {
            hContent = hContent.replace(
              'std::format("{}%", dimension.value)',
              'std::to_string(dimension.value) + "%"'
            );
            fs.writeFileSync(fullPath, hContent, 'utf8');
            console.log(`[patch-manifests] Patched graphicsConversions.h: ${fullPath}`);
          }
        }
      }
    };
    findAndPatch(gradleCaches);
  }
} catch (err) {
  console.warn('[patch-manifests] Failed to patch graphicsConversions.h:', err.message);
}
