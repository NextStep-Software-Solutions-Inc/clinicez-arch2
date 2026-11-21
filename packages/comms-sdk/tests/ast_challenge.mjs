import ts from 'typescript';
import fs from 'node:fs';
import path from 'node:path';

function analyzeJsxFile(filePath) {
  const code = fs.readFileSync(filePath, 'utf8');
  const sourceFile = ts.createSourceFile(
    filePath,
    code,
    ts.ScriptTarget.Latest,
    true,
    ts.ScriptKind.TSX
  );

  const buttons = [];
  const colorLiterals = [];
  const emojis = [];
  const arbitraryFontSizes = [];

  const emojiRegex = /[\uD83C-\uD83E][\uDC00-\uDFFF]|[\u2600-\u27BF]|[\u2B00-\u2BFF]/g;
  const hexRegex = /#(?:[0-9a-fA-F]{8}|[0-9a-fA-F]{6}|[0-9a-fA-F]{3,4})\b/g;
  const rgbRegex = /\brgba?\([^)]+\)/g;

  function visit(node) {
    // Check for string literals with hex, rgb, emoji, or text-[...]
    if (ts.isStringLiteral(node) || ts.isNoSubstitutionTemplateLiteral(node)) {
      const text = node.text;
      
      const hexMatches = text.match(hexRegex);
      if (hexMatches) colorLiterals.push({ text, matches: hexMatches, line: sourceFile.getLineAndCharacterOfPosition(node.getStart()).line + 1 });

      const rgbMatches = text.match(rgbRegex);
      if (rgbMatches) colorLiterals.push({ text, matches: rgbMatches, line: sourceFile.getLineAndCharacterOfPosition(node.getStart()).line + 1 });

      const emojiMatches = text.match(emojiRegex);
      if (emojiMatches) emojis.push({ text, matches: emojiMatches, line: sourceFile.getLineAndCharacterOfPosition(node.getStart()).line + 1 });

      const sub12Matches = text.match(/text-\[(\d+)px\]/g);
      if (sub12Matches) {
        sub12Matches.forEach(m => {
          const px = parseInt(m.match(/\d+/)[0], 10);
          arbitraryFontSizes.push({ class: m, px, line: sourceFile.getLineAndCharacterOfPosition(node.getStart()).line + 1 });
        });
      }
    }

    // Check for JSX Elements: <button> or <TouchableOpacity>
    if (ts.isJsxOpeningElement(node) || ts.isJsxSelfClosingElement(node)) {
      const tagName = node.tagName.getText(sourceFile);
      if (tagName === 'button' || tagName === 'TouchableOpacity') {
        const attributes = {};
        for (const prop of node.attributes.properties) {
          if (ts.isJsxAttribute(prop)) {
            const attrName = prop.name.getText(sourceFile);
            if (prop.initializer) {
              if (ts.isStringLiteral(prop.initializer)) {
                attributes[attrName] = prop.initializer.text;
              } else if (ts.isJsxExpression(prop.initializer) && prop.initializer.expression) {
                attributes[attrName] = prop.initializer.expression.getText(sourceFile);
              }
            } else {
              attributes[attrName] = true;
            }
          }
        }
        const line = sourceFile.getLineAndCharacterOfPosition(node.getStart()).line + 1;
        buttons.push({ tagName, attributes, line });
      }
    }

    ts.forEachChild(node, visit);
  }

  visit(sourceFile);

  return { buttons, colorLiterals, emojis, arbitraryFontSizes };
}

console.log('=== TYPESCRIPT AST EMPIRICAL CHALLENGE ===\n');

const webAnalysis = analyzeJsxFile(path.resolve('packages/comms-sdk/src/web-ui/TriageQueueView.tsx'));
console.log(`[Web UI] Found ${webAnalysis.buttons.length} <button> elements:`);
webAnalysis.buttons.forEach((b, idx) => {
  const cls = b.attributes.className || '';
  const minHMatch = cls.match(/min-h-\[(\d+)px\]/);
  const hMatch = cls.match(/\bh-\[(\d+)px\]/);
  const minH = minHMatch ? parseInt(minHMatch[1], 10) : (hMatch ? parseInt(hMatch[1], 10) : null);
  console.log(`  Button ${idx + 1} (Line ${b.line}): minH = ${minH !== null ? minH + 'px' : 'NONE'}, aria-label = "${b.attributes['aria-label'] || ''}"`);
  console.log(`    className: ${cls.slice(0, 100)}...`);
  if (minH !== null && minH < 44) {
    console.log(`    ⚠️ ACCESSIBILITY DEFECT: Touch target height is ${minH}px (< 44px minimum touch target)!`);
  }
});

console.log(`\n[Web UI Arbitrary Font Sizes (<12px)]:`);
webAnalysis.arbitraryFontSizes.forEach(f => {
  console.log(`  Line ${f.line}: ${f.class} (${f.px}px) — ${f.px < 12 ? '⚠️ VIOLATION: Below clinical 12px minimum' : 'OK'}`);
});

console.log(`\n[Web UI Hex/RGB Colors]: ${webAnalysis.colorLiterals.length === 0 ? '0 violations ✓' : JSON.stringify(webAnalysis.colorLiterals)}`);
console.log(`[Web UI Emojis]: ${webAnalysis.emojis.length === 0 ? '0 violations ✓' : JSON.stringify(webAnalysis.emojis)}`);

const nativeAnalysis = analyzeJsxFile(path.resolve('packages/comms-sdk/src/native-ui/TriageQueueView.tsx'));
console.log(`\n[Native UI] Found ${nativeAnalysis.buttons.length} <TouchableOpacity> elements:`);
nativeAnalysis.buttons.forEach((b, idx) => {
  console.log(`  TouchableOpacity ${idx + 1} (Line ${b.line}): style = "${b.attributes.style || ''}", accessibilityLabel = "${b.attributes.accessibilityLabel || ''}"`);
});

console.log(`\n[Native UI Hex/RGB Colors]: ${nativeAnalysis.colorLiterals.length === 0 ? '0 violations ✓' : JSON.stringify(nativeAnalysis.colorLiterals)}`);
console.log(`[Native UI Emojis]: ${nativeAnalysis.emojis.length === 0 ? '0 violations ✓' : JSON.stringify(nativeAnalysis.emojis)}`);
