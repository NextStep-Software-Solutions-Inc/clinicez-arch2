import fs from 'node:fs';
import path from 'node:path';

const webPath = path.resolve('packages/comms-sdk/src/web-ui/TriageQueueView.tsx');
const webSrc = fs.readFileSync(webPath, 'utf8');

console.log('=== PRECISE BUTTON & TOUCH TARGET PARSER ===\n');

// Find all <button ... > tags
const buttonOpeningRegex = /<button\b([\s\S]*?)>/g;
let match;
let count = 0;

while ((match = buttonOpeningRegex.exec(webSrc)) !== null) {
  count++;
  const rawAttrs = match[1];
  
  // Extract className
  let className = '';
  const classLiteralMatch = rawAttrs.match(/className="([^"]*)"/);
  const classTemplateMatch = rawAttrs.match(/className=\{`([^`]*)`\}/s);
  if (classLiteralMatch) {
    className = classLiteralMatch[1];
  } else if (classTemplateMatch) {
    className = classTemplateMatch[1].replace(/\$\{[\s\S]*?\}/g, ' ');
  }

  // Find min-h or h in className
  const minHMatch = className.match(/min-h-\[(\d+)px\]/);
  const hMatch = className.match(/\bh-\[(\d+)px\]/);
  const minH = minHMatch ? parseInt(minHMatch[1], 10) : (hMatch ? parseInt(hMatch[1], 10) : null);

  // Extract aria-label or preview
  const ariaLabelMatch = rawAttrs.match(/aria-label="([^"]*)"/);
  const ariaLabel = ariaLabelMatch ? ariaLabelMatch[1] : '';

  console.log(`[Button #${count}] ${ariaLabel ? `aria-label="${ariaLabel}"` : ''}`);
  console.log(`  Raw classes: ${className.trim()}`);
  console.log(`  minHeight detected: ${minH !== null ? minH + 'px' : 'NONE'}`);
  if (minH !== null && minH < 44) {
    console.log(`  ⚠️ VIOLATION: minHeight is ${minH}px (< 44px required)!`);
  } else if (minH === null) {
    console.log(`  ⚠️ WARNING: No explicit min-h-[44px] detected!`);
  } else {
    console.log(`  ✓ Touch target >= 44px (${minH}px)`);
  }
}
