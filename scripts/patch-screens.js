const fs = require('fs');
const path = require('path');

function patchFile(filePath, search, replace) {
  if (fs.existsSync(filePath)) {
    let content = fs.readFileSync(filePath, 'utf8');
    if (content.includes(search)) {
      content = content.replace(search, replace);
      fs.writeFileSync(filePath, content, 'utf8');
      console.log(`[patch-screens] Patched: ${filePath}`);
    }
  }
}

function findScreensDirs(baseDir) {
  const matches = [];
  if (!fs.existsSync(baseDir)) return matches;
  const entries = fs.readdirSync(baseDir, { withFileTypes: true });
  for (const entry of entries) {
    if (entry.isDirectory()) {
      if (entry.name.startsWith('react-native-screens@') || entry.name === 'react-native-screens') {
        matches.push(path.join(baseDir, entry.name));
      } else if (entry.name === '.pnpm' || entry.name === 'node_modules') {
        matches.push(...findScreensDirs(path.join(baseDir, entry.name)));
      }
    }
  }
  return matches;
}

const rootNodeModules = path.resolve(__dirname, '../node_modules');
const screensDirs = findScreensDirs(rootNodeModules);

for (const dir of screensDirs) {
  const actualDir = fs.realpathSync(dir);
  
  // 1. Fix ComponentRef in Codegen native components
  const fabricDir = path.join(actualDir, 'src/fabric');
  if (fs.existsSync(fabricDir)) {
    const files = [
      path.join(fabricDir, 'SearchBarNativeComponent.ts'),
      path.join(fabricDir, 'gamma/split/SplitHostNativeComponent.ts'),
      path.join(fabricDir, 'gamma/stack/StackHeaderConfigIOSNativeComponent.ts'),
      path.join(fabricDir, 'gamma/stack/StackHeaderConfigAndroidNativeComponent.ts'),
    ];
    for (const f of files) {
      patchFile(f, /React\.ComponentRef<ComponentType>/g, 'React.ElementRef<ComponentType>');
    }
  }

  // 2. Fix FormSheetContentView 3-arg call
  const formSheetPath = path.join(actualDir, 'android/src/main/java/com/swmansion/rnscreens/gamma/modals/formsheet/FormSheetContentView.kt');
  patchFile(
    formSheetPath,
    'jsTouchDispatcher.onChildStartedNativeGesture(ev, eventDispatcher, themedReactContext)',
    'jsTouchDispatcher.onChildStartedNativeGesture(ev, eventDispatcher)'
  );
}

// 3. Fix op-sqlite minSdkVersion hardcoding
function findOpSqliteDirs(baseDir) {
  const matches = [];
  if (!fs.existsSync(baseDir)) return matches;
  const entries = fs.readdirSync(baseDir, { withFileTypes: true });
  for (const entry of entries) {
    if (entry.isDirectory()) {
      if (entry.name.includes('op-sqlite')) {
        matches.push(path.join(baseDir, entry.name));
      } else if (entry.name === '.pnpm' || entry.name === 'node_modules') {
        matches.push(...findOpSqliteDirs(path.join(baseDir, entry.name)));
      }
    }
  }
  return matches;
}

const opSqliteDirs = findOpSqliteDirs(rootNodeModules);
for (const dir of opSqliteDirs) {
  const actual = fs.realpathSync(dir);
  const buildGradle = path.join(actual, 'android/build.gradle');
  patchFile(buildGradle, 'minSdkVersion 23', "minSdkVersion safeExtGet('minSdkVersion', 24)");

  const cmakeLists = path.join(actual, 'android/CMakeLists.txt');
  patchFile(cmakeLists, 'ReactAndroid::turbomodulejsijni', 'ReactAndroid::reactnative');
  patchFile(cmakeLists, 'ReactAndroid::react_nativemodule_core', '');
}

