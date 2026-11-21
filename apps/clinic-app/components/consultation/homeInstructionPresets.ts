/**
 * Home Instructions Quick Presets & Smart Toggle Helpers
 * Issue #154: Consultations - Smart Toggle & Deduplication for Home Instructions Quick Presets
 */

export interface HomeInstructionPreset {
  id: string;
  label: string;
  text: string;
}

export const HOME_INSTRUCTION_PRESETS: HomeInstructionPreset[] = [
  {
    id: 'hydration-rest',
    label: 'Hydration & Rest',
    text: 'Hydration & Rest (8+ glasses water daily)',
  },
  {
    id: 'diet',
    label: 'Low Salt & Low Fat Diet',
    text: 'Low Salt & Low Fat Diet',
  },
  {
    id: 'warning-signs',
    label: 'Warning Signs',
    text: 'Warning Signs: Return immediately if fever > 38.5°C or acute chest pain occurs',
  },
  {
    id: 'med-compliance',
    label: 'Strict Medication Compliance',
    text: 'Strict Medication Compliance: Complete the full course as prescribed',
  },
  {
    id: 'wound-care',
    label: 'Wound Care',
    text: 'Wound Care: Keep area clean, dry, and change dressing daily',
  },
];

/**
 * Toggles a home instruction preset bullet in patient-facing instructions:
 * - When not present: appends `• <presetText>` on a new line (preserving existing text).
 * - When already present: removes line(s) containing `<presetText>` and normalizes newlines/spacing.
 */
export function toggleHomeInstructionPreset(currentText: string, presetText: string): string {
  if (!currentText.includes(presetText)) {
    const trimmed = currentText.trim();
    const bullet = `• ${presetText}`;
    return trimmed ? `${trimmed}\n${bullet}` : bullet;
  }

  // Remove lines containing this preset
  const lines = currentText.split(/\r?\n/);
  const remaining = lines.filter((line) => !line.includes(presetText));

  // Clean up any dangling blank lines: collapse 3+ consecutive newlines to 2 newlines and trim ends
  const cleaned = remaining.join('\n').replace(/(\r?\n\s*){2,}\r?\n/g, '\n\n');
  return cleaned.trim();
}
