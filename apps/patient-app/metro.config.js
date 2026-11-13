const { getDefaultConfig } = require('expo/metro-config');
const path = require('path');

const projectRoot = __dirname;
const monorepoRoot = path.resolve(projectRoot, '../..');

/** @type {import('expo/metro-config').MetroConfig} */
const config = getDefaultConfig(projectRoot);

// 1. Watch monorepo root for workspace packages (@clinicez/design-tokens, @shared/safe)
config.watchFolders = [monorepoRoot];

// 2. Resolve hoisted packages from project and monorepo node_modules
config.resolver.nodeModulesPaths = [
  path.resolve(projectRoot, 'node_modules'),
  path.resolve(monorepoRoot, 'node_modules'),
];

// 3. Retain .sql in sourceExts and .wasm in assetExts
config.resolver.sourceExts.push('sql');
config.resolver.assetExts.push('wasm');

// 4. Exclude Android build/Gradle dirs from Metro's FallbackWatcher (Windows ENOENT fix)
config.resolver.blockList = [
  /.*[/\\]android[/\\]\.gradle[/\\].*/,
  /.*[/\\]android[/\\]build[/\\].*/,
  /.*[/\\]android[/\\]app[/\\]build[/\\].*/,
  /.*[/\\]android[/\\]app[/\\]\.cxx[/\\].*/,
];

// 5. Pin singleton runtime packages to patient-app's canonical resolution to avoid duplicate React with @clinicez/comms-sdk
const SINGLETON_PACKAGES = ['react', 'react-dom', 'react-native', 'react-native-web'];
const defaultResolveRequest = config.resolver.resolveRequest;
config.resolver.resolveRequest = (context, moduleName, platform) => {
  const isSingleton = SINGLETON_PACKAGES.some(
    (pkg) => moduleName === pkg || moduleName.startsWith(`${pkg}/`),
  );
  if (isSingleton) {
    const canonicalContext = {
      ...context,
      originModulePath: path.join(projectRoot, 'index.ts'),
    };
    if (defaultResolveRequest) {
      return defaultResolveRequest(canonicalContext, moduleName, platform);
    }
    return canonicalContext.resolveRequest(canonicalContext, moduleName, platform);
  }
  if (defaultResolveRequest) {
    return defaultResolveRequest(context, moduleName, platform);
  }
  return context.resolveRequest(context, moduleName, platform);
};

module.exports = config;