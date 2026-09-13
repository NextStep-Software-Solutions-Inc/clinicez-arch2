// One-off script: replace editable={false} + onPressIn picker fields with picker prop
const fs = require('fs');
const path = require('path');

const dir = path.join(__dirname, '..', 'navigation', 'screens', 'profile');
const files = fs.readdirSync(dir).filter(f => f.endsWith('.tsx'));
let totalChanges = 0;

for (const file of files) {
  const filepath = path.join(dir, file);
  let content = fs.readFileSync(filepath, 'utf8');
  const original = content;

  // Replace the two-prop pattern:  editable={false}\n            onPressIn  (with any whitespace)
  // Also handles same-line: editable={false} onPressIn={...}
  // We just remove editable={false} from any field that also has onPressIn — those are pickers
  // Strategy: for each ProfileFormField that has both editable={false} AND onPressIn, remove editable={false}
  // and add picker prop.

  // Match ProfileFormField JSX blocks (single-line or multi-line) containing both
  // We'll do a simple string approach: find lines with editable={false} in ProfileFormField context
  // that are adjacent to or same as onPressIn

  // Simple approach: remove standalone `editable={false}\n` or `editable={false} ` lines
  // only where onPressIn is present within 3 lines

  const lines = content.split('\n');
  const result = [];
  let changed = 0;

  for (let i = 0; i < lines.length; i++) {
    const line = lines[i];
    // Check if this line is the editable={false} line
    if (line.match(/^\s+editable=\{false\}\s*$/) || line.match(/^\s+editable=\{false\} \/>/)) {
      // Look within ±3 lines for onPressIn
      const window = lines.slice(Math.max(0, i-3), Math.min(lines.length, i+4)).join('\n');
      if (window.includes('onPressIn')) {
        // This is a picker field - skip this line (remove editable={false})
        changed++;
        continue;
      }
    }
    // Also handle inline: editable={false} onPressIn  (same line in JSX spread)
    if (line.includes('editable={false}') && line.includes('onPressIn')) {
      result.push(line.replace('editable={false} ', '').replace(' editable={false}', ''));
      changed++;
      continue;
    }
    result.push(line);
  }

  if (changed > 0) {
    content = result.join('\n');
    // Now add picker prop to the ProfileFormField that has onPressIn but no editable={false}
    // We need to add `picker` to fields that have onPressIn (they were picker fields)
    // Actually, in ProfileFormField the new logic auto-detects picker when onPressIn is present
    // so we don't need to explicitly add picker={true} — the component handles it
    fs.writeFileSync(filepath, content, 'utf8');
    console.log(`${file}: removed ${changed} editable={false} from picker fields`);
    totalChanges += changed;
  }
}

console.log(`Done: ${totalChanges} total changes across ${files.length} files`);
