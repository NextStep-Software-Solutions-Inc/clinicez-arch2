import fs from 'node:fs';
import path from 'node:path';

const nativePath = path.resolve('packages/comms-sdk/src/native-ui/TriageQueueView.tsx');
const webPath = path.resolve('packages/comms-sdk/src/web-ui/TriageQueueView.tsx');

const nativeSrc = fs.readFileSync(nativePath, 'utf8');
const webSrc = fs.readFileSync(webPath, 'utf8');

console.log('=== EMPIRICAL CHALLENGER TOKEN & ACCESSIBILITY AUDIT ===\n');

// 1. AST / Pattern scan for Hex colors
const hexRegex = /#(?:[0-9a-fA-F]{8}|[0-9a-fA-F]{6}|[0-9a-fA-F]{3,4})\b/g;
const rgbRegex = /\brgba?\([^)]+\)/g;

function checkColors(name, src) {
  const hexes = src.match(hexRegex) || [];
  const rgbs = src.match(rgbRegex) || [];
  console.log(`[Color Check] ${name}:`);
  console.log(`  Raw Hex matches: ${hexes.length} ${hexes.length ? JSON.stringify(hexes) : '✓'}`);
  console.log(`  RGB/RGBA matches: ${rgbs.length} ${rgbs.length ? JSON.stringify(rgbs) : '✓'}`);
}

checkColors('Native UI', nativeSrc);
checkColors('Web UI', webSrc);

// 2. Scan for numeric fontSize or borderRadius literals
const fontSizeRegex = /\bfontSize:\s*\d+/g;
const radiusRegex = /\b(?!shadow)\w*[rR]adius:\s*[1-9]\d*/g;

function checkNumericLiterals(name, src) {
  const fontSizes = src.match(fontSizeRegex) || [];
  const radii = src.match(radiusRegex) || [];
  console.log(`\n[Numeric Style Check] ${name}:`);
  console.log(`  Numeric fontSize literals: ${fontSizes.length} ${fontSizes.length ? JSON.stringify(fontSizes) : '✓'}`);
  console.log(`  Numeric radius literals: ${radii.length} ${radii.length ? JSON.stringify(radii) : '✓'}`);
}

checkNumericLiterals('Native UI', nativeSrc);
checkNumericLiterals('Web UI', webSrc);

// 3. Scan for Unicode Emojis / Pictographs
const emojiRegex = /[\uD83C-\uD83E][\uDC00-\uDFFF]|[\u2600-\u27BF]|[\u2B00-\u2BFF]/g;
function checkEmojis(name, src) {
  const emojis = src.match(emojiRegex) || [];
  console.log(`\n[Emoji / Unicode Glyph Check] ${name}:`);
  console.log(`  Unicode emoji / pictograph matches: ${emojis.length} ${emojis.length ? JSON.stringify(emojis) : '✓'}`);
}

checkEmojis('Native UI', nativeSrc);
checkEmojis('Web UI', webSrc);

// 4. Scan for External Host URLs / Local addresses
const urlRegex = /https?:\/\/(?!\$\{)(?!www\.w3\.org\/)[^\s'"`)]+/gi;
const localRegex = /\b(localhost|127\.0\.0\.1|0\.0\.0\.0)\b/gi;
function checkHosts(name, src) {
  const urls = src.match(urlRegex) || [];
  const locals = src.match(localRegex) || [];
  console.log(`\n[Host & URL Check] ${name}:`);
  console.log(`  Hardcoded external URLs: ${urls.length} ${urls.length ? JSON.stringify(urls) : '✓'}`);
  console.log(`  Hardcoded local IPs/hosts: ${locals.length} ${locals.length ? JSON.stringify(locals) : '✓'}`);
}

checkHosts('Native UI', nativeSrc);
checkHosts('Web UI', webSrc);

// 5. Clinical Typography Audit: Check for font sizes < 12px
console.log(`\n[Clinical Typography Audit (< 12px)]:`);
const webArbitraryFontSizes = webSrc.match(/text-\[(\d+)px\]/g) || [];
console.log(`  Web arbitrary font size classes: ${JSON.stringify(webArbitraryFontSizes)}`);
webArbitraryFontSizes.forEach(cls => {
  const px = parseInt(cls.match(/\d+/)[0], 10);
  if (px < 12) {
    console.log(`  ⚠️ VIOLATION: Found font-size ${px}px in ${cls} (< 12px clinical minimum)!`);
  }
});

// 6. Interactive Touch Target Audit (Buttons < 44px)
console.log(`\n[Interactive Touch Target Audit (min 44px)]:`);
// Extract all buttons from Web UI
const webButtons = [];
const buttonTagRegex = /<(?:button|a)[^>]*className="([^"]*)"[^>]*>([\s\S]*?)<\/(?:button|a)>/g;
let match;
while ((match = buttonTagRegex.exec(webSrc)) !== null) {
  const className = match[1];
  const innerText = match[2].replace(/<[^>]*>/g, '').trim().slice(0, 30);
  const minHMatch = className.match(/min-h-\[(\d+)px\]/);
  const hMatch = className.match(/\bh-\[(\d+)px\]/);
  const minH = minHMatch ? parseInt(minHMatch[1], 10) : (hMatch ? parseInt(hMatch[1], 10) : null);
  webButtons.push({ innerText, className, minH });
}
console.log(`  Found ${webButtons.length} button instances in Web UI:`);
webButtons.forEach(b => {
  const status = (b.minH !== null && b.minH >= 44) ? '✓' : `⚠️ FAIL (${b.minH || 'unspecified'}px)`;
  console.log(`    ${status} Button "${b.innerText}": minH=${b.minH}px`);
});

// Check Native UI touch targets in StyleSheet
console.log(`\n[Native UI Touch Target Audit]:`);
const touchTargetStyles = [
  'refreshButton',
  'filterPill',
  'errorRetryButton',
  'emptyRefreshButton',
  'answerButton',
  'visitButton',
  'routeButton',
  'declineButton',
  'reasonPill',
  'modalCancelButton',
  'modalSubmitButton',
  'skeletonButton'
];

touchTargetStyles.forEach(styleName => {
  const regex = new RegExp(`${styleName}:\\s*\\{([^\\}]+)\\}`, 'm');
  const m = nativeSrc.match(regex);
  if (m) {
    const hasMinHeight = /minHeight:\s*sizes\.touchTarget/.test(m[1]);
    console.log(`    ${hasMinHeight ? '✓' : '⚠️ FAIL'} Native style "${styleName}": minHeight: sizes.touchTarget = ${hasMinHeight}`);
  } else {
    console.log(`    ❓ Could not find style "${styleName}"`);
  }
});

