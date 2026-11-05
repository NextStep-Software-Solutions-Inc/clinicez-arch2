import { describe, expect, test } from 'bun:test';
import fs from 'fs';
import path from 'path';
import {
  appendSymptomToNarrative,
  removeSymptomFromNarrative,
  syncSubjectiveWithToggledSymptoms,
} from '../utils/subjectiveNarrative';

describe('Subjective Quick-Select Symptom Toggle Sync', () => {
  test('reproduces screenshot flow: toggling off multi-word and comma-containing symptoms removes their appended text cleanly', () => {
    let narrative = 'Patient presents with: Doctor Consultation.';
    const abdominal = { optionCode: '02', symptomName: 'Abdominal cramp/pain' };
    const headache = { optionCode: '16', symptomName: 'Headache' };
    const hematemesis = { optionCode: '17', symptomName: 'Hematemesis' };
    const edema = { optionCode: '21', symptomName: 'Lower extremity edema' };
    const urgency = { optionCode: '32', symptomName: 'Urgency' };
    const stool = { optionCode: '29', symptomName: 'Stool, bloody/black tarry/mucoid' };

    let current = [] as typeof abdominal[];
    for (const item of [abdominal, headache, hematemesis, edema, urgency, stool]) {
      const next = [...current, item];
      narrative = syncSubjectiveWithToggledSymptoms(narrative, current, next);
      current = next;
    }

    expect(narrative).toBe(
      'Patient presents with: Doctor Consultation. Abdominal cramp/pain, Headache, Hematemesis, Lower extremity edema, Urgency, Stool, bloody/black tarry/mucoid'
    );

    // Toggle off first, middle, and comma-containing trailing items leaving only Headache
    for (const itemToRemove of [abdominal, hematemesis, edema, urgency, stool]) {
      const next = current.filter((i) => i.optionCode !== itemToRemove.optionCode);
      narrative = syncSubjectiveWithToggledSymptoms(narrative, current, next);
      current = next;
    }

    expect(narrative).toBe('Patient presents with: Doctor Consultation. Headache');

    // Toggle off Headache -> restores original triage chief complaint sentence cleanly
    narrative = syncSubjectiveWithToggledSymptoms(narrative, current, []);
    expect(narrative).toBe('Patient presents with: Doctor Consultation.');
  });

  test('does not corrupt compound symptom names when untoggling standalone "Pain"', () => {
    let narrative = 'Patient presents with: Doctor Consultation.';
    narrative = appendSymptomToNarrative(narrative, 'Abdominal cramp/pain');
    narrative = appendSymptomToNarrative(narrative, 'Chest pain/discomfort');
    narrative = appendSymptomToNarrative(narrative, 'Pain');

    expect(narrative).toBe(
      'Patient presents with: Doctor Consultation. Abdominal cramp/pain, Chest pain/discomfort, Pain'
    );

    narrative = removeSymptomFromNarrative(narrative, 'Pain');
    expect(narrative).toBe(
      'Patient presents with: Doctor Consultation. Abdominal cramp/pain, Chest pain/discomfort'
    );
  });

  test('preserves protected triage prefix even if triage complaint matches toggled symptom', () => {
    let narrative = 'Patient presents with: Headache.';
    const headache = { optionCode: '16', symptomName: 'Headache' };

    narrative = syncSubjectiveWithToggledSymptoms(narrative, [], [headache]);
    expect(narrative).toBe('Patient presents with: Headache. Headache');

    narrative = syncSubjectiveWithToggledSymptoms(narrative, [headache], []);
    expect(narrative).toBe('Patient presents with: Headache.');
  });

  test('handles empty initial narrative without dangling commas when toggling on and off', () => {
    let narrative = '';
    const cough = { optionCode: '09', symptomName: 'Cough' };
    const fever = { optionCode: '37', symptomName: 'Fever' };

    narrative = syncSubjectiveWithToggledSymptoms(narrative, [], [cough]);
    expect(narrative).toBe('Cough');

    narrative = syncSubjectiveWithToggledSymptoms(narrative, [cough], [cough, fever]);
    expect(narrative).toBe('Cough, Fever');

    narrative = syncSubjectiveWithToggledSymptoms(narrative, [cough, fever], [fever]);
    expect(narrative).toBe('Fever');

    narrative = syncSubjectiveWithToggledSymptoms(narrative, [fever], []);
    expect(narrative).toBe('');
  });

  test('PatientSummarySpine renders pencil icon-only button for Edit Demographics without visible text label', () => {
    const spineSource = fs.readFileSync(
      path.resolve(__dirname, '../components/chart/PatientSummarySpine.tsx'),
      'utf8'
    );
    expect(spineSource).toContain('accessibilityLabel="Edit Demographics"');
    expect(spineSource).not.toContain('>Edit Demographics<');
    expect(spineSource).not.toMatch(/<ThemedText[^>]*>\s*Edit Demographics\s*<\/ThemedText>/);
  });
});
