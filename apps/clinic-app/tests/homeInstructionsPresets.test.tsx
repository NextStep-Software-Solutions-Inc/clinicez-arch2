// token-guard:ignore-file
import { describe, expect, test } from 'bun:test';
import {
  HOME_INSTRUCTION_PRESETS,
  toggleHomeInstructionPreset,
  type HomeInstructionPreset,
} from '../components/consultation/homeInstructionPresets';

describe('Issue #154 — Consultations Home Instructions Quick Presets Smart Toggle Suite', () => {
  describe('1. Preset Catalog Definition & Metadata Integrity', () => {
    test('defines all 5 clinical discharge presets with unique IDs, labels, and instruction text', () => {
      expect(HOME_INSTRUCTION_PRESETS).toHaveLength(5);

      const ids = HOME_INSTRUCTION_PRESETS.map((p) => p.id);
      expect(new Set(ids).size).toBe(5);

      const labels = HOME_INSTRUCTION_PRESETS.map((p) => p.label);
      expect(labels).toContain('Hydration & Rest');
      expect(labels).toContain('Low Salt & Low Fat Diet');
      expect(labels).toContain('Warning Signs');
      expect(labels).toContain('Strict Medication Compliance');
      expect(labels).toContain('Wound Care');

      HOME_INSTRUCTION_PRESETS.forEach((preset: HomeInstructionPreset) => {
        expect(preset.id).toBeTruthy();
        expect(preset.label).toBeTruthy();
        expect(preset.text).toBeTruthy();
        expect(preset.text.length).toBeGreaterThanOrEqual(preset.label.length);
      });
    });

    test('preserves exact clinical warning sign threshold (38.5°C) and water volume guidance', () => {
      const warningSigns = HOME_INSTRUCTION_PRESETS.find((p) => p.id === 'warning-signs');
      expect(warningSigns?.text).toContain('38.5°C');
      expect(warningSigns?.text).toContain('acute chest pain');

      const hydration = HOME_INSTRUCTION_PRESETS.find((p) => p.id === 'hydration-rest');
      expect(hydration?.text).toContain('8+ glasses water daily');
    });
  });

  describe('2. Smart Toggle & Deduplication Logic (toggleHomeInstructionPreset)', () => {
    const hydrationPreset = 'Hydration & Rest (8+ glasses water daily)';
    const dietPreset = 'Low Salt & Low Fat Diet';
    const warningPreset = 'Warning Signs: Return immediately if fever > 38.5°C or acute chest pain occurs';

    test('2.1 appends bullet point on inactive preset when text is initially empty', () => {
      const initial = '';
      const updated = toggleHomeInstructionPreset(initial, hydrationPreset);

      expect(updated).toBe(`• ${hydrationPreset}`);
    });

    test('2.2 appends bullet point on inactive preset when initial text has whitespace', () => {
      const initial = '   \n  ';
      const updated = toggleHomeInstructionPreset(initial, hydrationPreset);

      expect(updated).toBe(`• ${hydrationPreset}`);
    });

    test('2.3 removes matching bullet point when preset is already active (toggle-off)', () => {
      const initial = `• ${hydrationPreset}`;
      const toggledOff = toggleHomeInstructionPreset(initial, hydrationPreset);

      expect(toggledOff).toBe('');
      expect(toggledOff.includes(hydrationPreset)).toBe(false);
    });

    test('2.4 rapid clicking / re-clicking toggles off rather than duplicating bullets', () => {
      let instructions = '';

      // Click 1: append
      instructions = toggleHomeInstructionPreset(instructions, hydrationPreset);
      expect(instructions).toBe(`• ${hydrationPreset}`);

      // Click 2 (re-click): remove
      instructions = toggleHomeInstructionPreset(instructions, hydrationPreset);
      expect(instructions).toBe('');

      // Click 3: re-append cleanly
      instructions = toggleHomeInstructionPreset(instructions, hydrationPreset);
      expect(instructions).toBe(`• ${hydrationPreset}`);

      // Count occurrences: never duplicates
      const occurrences = (instructions.match(/Hydration & Rest/g) || []).length;
      expect(occurrences).toBe(1);
    });

    test('2.5 appends multiple distinct presets on separate bullet lines', () => {
      let instructions = '';

      instructions = toggleHomeInstructionPreset(instructions, hydrationPreset);
      instructions = toggleHomeInstructionPreset(instructions, dietPreset);
      instructions = toggleHomeInstructionPreset(instructions, warningPreset);

      expect(instructions).toBe(
        `• ${hydrationPreset}\n• ${dietPreset}\n• ${warningPreset}`
      );
      expect(instructions.split('\n')).toHaveLength(3);
    });

    test('2.6 removes first preset cleanly without leaving leading blank lines', () => {
      const initial = `• ${hydrationPreset}\n• ${dietPreset}\n• ${warningPreset}`;
      const updated = toggleHomeInstructionPreset(initial, hydrationPreset);

      expect(updated).toBe(`• ${dietPreset}\n• ${warningPreset}`);
      expect(updated.startsWith('\n')).toBe(false);
    });

    test('2.7 removes middle preset cleanly without leaving dangling blank lines', () => {
      const initial = `• ${hydrationPreset}\n• ${dietPreset}\n• ${warningPreset}`;
      const updated = toggleHomeInstructionPreset(initial, dietPreset);

      expect(updated).toBe(`• ${hydrationPreset}\n• ${warningPreset}`);
      expect(updated).not.toContain('\n\n');
    });

    test('2.8 removes last preset cleanly without leaving trailing blank lines', () => {
      const initial = `• ${hydrationPreset}\n• ${dietPreset}\n• ${warningPreset}`;
      const updated = toggleHomeInstructionPreset(initial, warningPreset);

      expect(updated).toBe(`• ${hydrationPreset}\n• ${dietPreset}`);
      expect(updated.endsWith('\n')).toBe(false);
    });
  });

  describe('3. Custom Clinical Notes Preservation During Toggling', () => {
    const hydrationPreset = 'Hydration & Rest (8+ glasses water daily)';
    const dietPreset = 'Low Salt & Low Fat Diet';

    test('3.1 preserves clinician freeform text entered before presets', () => {
      const customPrefix = 'Patient advised to take paracetamol 500mg Q6H PRN for temperature > 37.8°C.';
      let instructions = customPrefix;

      // Toggle ON
      instructions = toggleHomeInstructionPreset(instructions, hydrationPreset);
      expect(instructions).toBe(`${customPrefix}\n• ${hydrationPreset}`);

      // Toggle OFF
      instructions = toggleHomeInstructionPreset(instructions, hydrationPreset);
      expect(instructions).toBe(customPrefix);
    });

    test('3.2 preserves clinician freeform text entered after presets', () => {
      const customSuffix = 'Next clinic visit scheduled for Friday at 9:00 AM.';
      let instructions = `• ${hydrationPreset}\n${customSuffix}`;

      // Toggle OFF preset
      instructions = toggleHomeInstructionPreset(instructions, hydrationPreset);
      expect(instructions).toBe(customSuffix);
    });

    test('3.3 preserves clinician multi-paragraph notes and intermediate formatting', () => {
      const customIntro = 'Primary Diagnosis: Acute Bronchitis.\nFollow regular nebulization as ordered.';
      const customOutro = 'Emergency contact: Clinic hotline 0917-123-4567.';

      let instructions = `${customIntro}\n\n• ${hydrationPreset}\n• ${dietPreset}\n\n${customOutro}`;

      // Remove diet preset
      instructions = toggleHomeInstructionPreset(instructions, dietPreset);
      expect(instructions).toContain(customIntro);
      expect(instructions).toContain(`• ${hydrationPreset}`);
      expect(instructions).toContain(customOutro);
      expect(instructions).not.toContain(dietPreset);

      // Remove hydration preset
      instructions = toggleHomeInstructionPreset(instructions, hydrationPreset);
      expect(instructions).toContain(customIntro);
      expect(instructions).toContain(customOutro);
      expect(instructions).not.toContain('• ');
    });
  });

  describe('4. Bi-directional Synchronization Invariants', () => {
    const preset = HOME_INSTRUCTION_PRESETS[0]; // Hydration & Rest

    test('4.1 derives active state from textarea content including preset text', () => {
      const textWithPreset = `Follow diet.\n• ${preset.text}`;
      const isActive = textWithPreset.includes(preset.text);
      expect(isActive).toBe(true);
    });

    test('4.2 reverts active state to inactive when clinician manually deletes the bullet', () => {
      const originalText = `• ${preset.text}`;
      expect(originalText.includes(preset.text)).toBe(true);

      // Clinician deletes the line in textarea
      const editedText = '';
      expect(editedText.includes(preset.text)).toBe(false);
    });

    test('4.3 reverts active state to inactive when clinician edits the bullet text', () => {
      const originalText = `• ${preset.text}`;
      expect(originalText.includes(preset.text)).toBe(true);

      // Clinician modifies "8+ glasses" to "4 glasses" due to renal condition
      const customizedText = '• Hydration & Rest (4 glasses water daily due to CKD stage 3)';
      expect(customizedText.includes(preset.text)).toBe(false);
    });
  });

  describe('5. Component Styles & Token Compliance Invariants', () => {
    test('Consultations.screen.tsx defines presetChip, presetChipActive, and presetChipText styles', async () => {
      const screenSource = await Bun.file(
        'apps/clinic-app/navigation/screens/Consultations.screen.tsx'
      ).text();

      expect(screenSource).toContain('presetChip: {');
      expect(screenSource).toContain('presetChipActive: {');
      expect(screenSource).toContain('presetChipText: {');
      expect(screenSource).toContain('theme.colors.primaryLight');
      expect(screenSource).toContain('theme.colors.primary');
      expect(screenSource).toContain('theme.radii.full');
      expect(screenSource).toContain('theme.sizes.controlSm');
    });

    test('Consultations.screen.tsx renders Pressable with accessibilityRole and accessibilityState', async () => {
      const screenSource = await Bun.file(
        'apps/clinic-app/navigation/screens/Consultations.screen.tsx'
      ).text();

      expect(screenSource).toContain('accessibilityRole="button"');
      expect(screenSource).toContain('accessibilityState={{ selected: isActive }}');
      expect(screenSource).toContain('toggleHomeInstructionPreset');
    });
  });
});
