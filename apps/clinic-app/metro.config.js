const { getDefaultConfig } = require('expo/metro-config');
const path = require('path');

const projectRoot = __dirname;
const monorepoRoot = path.resolve(projectRoot, '../..');

const config = getDefaultConfig(projectRoot);

// 1. Watch monorepo root for workspace packages (@shared/safe, etc.)
config.watchFolders = [monorepoRoot];

// 2. Resolve hoisted packages from project and monorepo node_modules
config.resolver.nodeModulesPaths = [
  path.resolve(projectRoot, 'node_modules'),
  path.resolve(monorepoRoot, 'node_modules'),
];

// 3. Pin singleton runtime packages to root node_modules to avoid duplicate React instances
const SINGLETON_PACKAGES = ['react', 'react-dom', 'react-native', 'react-native-web'];
config.resolver.extraNodeModules = {
  ...config.resolver.extraNodeModules,
  react: path.resolve(monorepoRoot, 'node_modules/react'),
  'react-dom': path.resolve(monorepoRoot, 'node_modules/react-dom'),
  'react-native': path.resolve(monorepoRoot, 'node_modules/react-native'),
  'react-native-web': path.resolve(monorepoRoot, 'node_modules/react-native-web'),
};

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
