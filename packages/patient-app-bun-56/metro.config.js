const { getDefaultConfig } = require('expo/metro-config');
/** @type {import('expo/metro-config').MetroConfig} */

const config = getDefaultConfig(__dirname);

config.resolver.sourceExts.push('sql');

// Exclude Android build/Gradle dirs from Metro's FallbackWatcher (Windows ENOENT fix).
// On Windows without Watchman, FallbackWatcher walks ALL dirs under the project root.
// Gradle cache dirs may not exist when Metro starts, causing ENOENT crashes.
config.resolver.blockList = [
  /.*[/\\]android[/\\]\.gradle[/\\].*/,
  /.*[/\\]android[/\\]build[/\\].*/,
  /.*[/\\]android[/\\]app[/\\]build[/\\].*/,
  /.*[/\\]android[/\\]app[/\\]\.cxx[/\\].*/,
];

module.exports = config;