import React, { useEffect, useState } from 'react';
import {
  ScrollView,
  StyleSheet,
  View,
  Pressable,
  Alert,
  KeyboardAvoidingView,
  Platform,
} from 'react-native';
import { useNavigation, useTheme } from '@react-navigation/native';
import { db } from '@db/index';
import { patientNcdQuestionnaire } from '@db/schema/patientNcdQuestionnaire';
import { eq } from 'drizzle-orm';
import ThemedText from '@ui/ThemedText';
import ProfileSectionHeader from 'components/profile/ProfileSectionHeader';
import ProfileFormField from 'components/profile/ProfileFormField';
import ProfileDatePicker from 'components/profile/ProfileDatePicker';
import ProfileSelectModal from 'components/profile/ProfileSelectModal';
import ProfileSaveBar from 'components/profile/ProfileSaveBar';
import { usePatientId } from 'hooks/usePatientId';
import { useAuth } from 'contexts/AuthContext';
import { addToSyncQueue, syncPendingProfileWrites } from 'services/api/syncService';
import { randomUUID } from 'expo-crypto';

// ─── WHO/ISH CVD Risk Options (Q17) ──────────────────────────────────────────
const Q17_OPTIONS = [
  { label: 'A — Low Risk (< 10%)', value: 'A' },
  { label: 'B — Moderate Risk (10% to < 20%)', value: 'B' },
  { label: 'C — High Risk (20% to < 30%)', value: 'C' },
  { label: 'D — Very High Risk (30% to < 40%)', value: 'D' },
  { label: 'E — Critical Risk (≥ 40%)', value: 'E' },
];

export default function NcdQuestionnaireScreen() {
  const patientId = usePatientId();
  const { getToken } = useAuth();
  const navigation = useNavigation();
  const { colors, dark: isDark } = useTheme();

  const [recordId, setRecordId] = useState<string | null>(null);
  const [isSaving, setIsSaving] = useState(false);
  const [isDirty, setIsDirty] = useState(false);
  const [showQ17Modal, setShowQ17Modal] = useState(false);

  // Form State Q1–Q24
  const [form, setForm] = useState({
    // Tobacco (Q1–Q4)
    qid1Yn: null as string | null,
    qid2Yn: null as string | null,
    qid3Yn: null as string | null,
    qid4Yn: null as string | null,

    // Alcohol (Q5–Q8)
    qid5Ynx: null as string | null, // 'Y' | 'N' | 'X'
    qid6Yn: null as string | null,
    qid7Yn: null as string | null,
    qid8Yn: null as string | null,

    // Nutrition & Diet (Q9–Q12)
    qid9Yn: null as string | null,
    qid10Yn: null as string | null,
    qid11Yn: null as string | null,
    qid12Yn: null as string | null,

    // Physical Activity (Q13–Q16)
    qid13Yn: null as string | null,
    qid14Yn: null as string | null,
    qid15Yn: null as string | null,
    qid16Yn: null as string | null,

    // CVD Risk (Q17)
    qid17Abcde: null as string | null,

    // Medical History (Q18, Q23–Q24)
    qid18Yn: null as string | null,
    qid23Yn: null as string | null,
    qid24Yn: null as string | null,

    // Lab Monitoring (Q19–Q22)
    qid19Yn: null as string | null,
    qid19FbsMgdl: '' as string,
    qid19FbsMmol: '' as string,
    qid19FbsDate: '' as string,

    qid20Yn: null as string | null,
    qid20CholeVal: '' as string,
    qid20CholeDate: '' as string,

    qid21Yn: null as string | null,
    qid21KetonVal: '' as string,
    qid21KetonDate: '' as string,

    qid22Yn: null as string | null,
    qid22ProteinVal: '' as string,
    qid22ProteinDate: '' as string,
  });

  // Load existing records from local SQLite
  useEffect(() => {
    let isMounted = true;
    db.select()
      .from(patientNcdQuestionnaire)
      .where(eq(patientNcdQuestionnaire.patientId, patientId))
      .then((rows) => {
        if (!isMounted || !rows || rows.length === 0) return;
        const row = rows[0];
        setRecordId(row.id);
        setForm({
          qid1Yn: row.qid1Yn ?? null,
          qid2Yn: row.qid2Yn ?? null,
          qid3Yn: row.qid3Yn ?? null,
          qid4Yn: row.qid4Yn ?? null,

          qid5Ynx: row.qid5Ynx ?? null,
          qid6Yn: row.qid6Yn ?? null,
          qid7Yn: row.qid7Yn ?? null,
          qid8Yn: row.qid8Yn ?? null,

          qid9Yn: row.qid9Yn ?? null,
          qid10Yn: row.qid10Yn ?? null,
          qid11Yn: row.qid11Yn ?? null,
          qid12Yn: row.qid12Yn ?? null,

          qid13Yn: row.qid13Yn ?? null,
          qid14Yn: row.qid14Yn ?? null,
          qid15Yn: row.qid15Yn ?? null,
          qid16Yn: row.qid16Yn ?? null,

          qid17Abcde: row.qid17Abcde ?? null,
          qid18Yn: row.qid18Yn ?? null,
          qid23Yn: row.qid23Yn ?? null,
          qid24Yn: row.qid24Yn ?? null,

          qid19Yn: row.qid19Yn ?? null,
          qid19FbsMgdl: row.qid19FbsMgdl !== null && row.qid19FbsMgdl !== undefined ? String(row.qid19FbsMgdl) : '',
          qid19FbsMmol: row.qid19FbsMmol !== null && row.qid19FbsMmol !== undefined ? String(row.qid19FbsMmol) : '',
          qid19FbsDate: row.qid19FbsDate ?? '',

          qid20Yn: row.qid20Yn ?? null,
          qid20CholeVal: row.qid20CholeVal !== null && row.qid20CholeVal !== undefined ? String(row.qid20CholeVal) : '',
          qid20CholeDate: row.qid20CholeDate ?? '',

          qid21Yn: row.qid21Yn ?? null,
          qid21KetonVal: row.qid21KetonVal !== null && row.qid21KetonVal !== undefined ? String(row.qid21KetonVal) : '',
          qid21KetonDate: row.qid21KetonDate ?? '',

          qid22Yn: row.qid22Yn ?? null,
          qid22ProteinVal: row.qid22ProteinVal !== null && row.qid22ProteinVal !== undefined ? String(row.qid22ProteinVal) : '',
          qid22ProteinDate: row.qid22ProteinDate ?? '',
        });
      })
      .catch(console.error);

    return () => {
      isMounted = false;
    };
  }, [patientId]);

  const updateField = (key: keyof typeof form, val: any) => {
    setForm((prev) => ({ ...prev, [key]: val }));
    setIsDirty(true);
  };

  // Auto-calculate mmol/L from mg/dL for Fasting Blood Sugar
  const handleFbsMgdlChange = (text: string) => {
    setIsDirty(true);
    const num = parseFloat(text);
    if (!isNaN(num) && num > 0) {
      const mmol = (num / 18.0182).toFixed(2);
      setForm((prev) => ({ ...prev, qid19FbsMgdl: text, qid19FbsMmol: mmol }));
    } else {
      setForm((prev) => ({ ...prev, qid19FbsMgdl: text }));
    }
  };

  const handleSave = async () => {
    setIsSaving(true);
    try {
      const now = new Date();
      const entityId = recordId ?? randomUUID();

      const payload = {
        patientId,
        qid1Yn: form.qid1Yn,
        qid2Yn: form.qid2Yn,
        qid3Yn: form.qid3Yn,
        qid4Yn: form.qid4Yn,
        qid5Ynx: form.qid5Ynx,
        qid6Yn: form.qid6Yn,
        qid7Yn: form.qid7Yn,
        qid8Yn: form.qid8Yn,
        qid9Yn: form.qid9Yn,
        qid10Yn: form.qid10Yn,
        qid11Yn: form.qid11Yn,
        qid12Yn: form.qid12Yn,
        qid13Yn: form.qid13Yn,
        qid14Yn: form.qid14Yn,
        qid15Yn: form.qid15Yn,
        qid16Yn: form.qid16Yn,
        qid17Abcde: form.qid17Abcde,
        qid18Yn: form.qid18Yn,
        qid19Yn: form.qid19Yn,
        qid19FbsMgdl: form.qid19FbsMgdl ? parseFloat(form.qid19FbsMgdl) : null,
        qid19FbsMmol: form.qid19FbsMmol ? parseFloat(form.qid19FbsMmol) : null,
        qid19FbsDate: form.qid19FbsDate || null,
        qid20Yn: form.qid20Yn,
        qid20CholeVal: form.qid20CholeVal ? parseFloat(form.qid20CholeVal) : null,
        qid20CholeDate: form.qid20CholeDate || null,
        qid21Yn: form.qid21Yn,
        qid21KetonVal: form.qid21KetonVal ? parseFloat(form.qid21KetonVal) : null,
        qid21KetonDate: form.qid21KetonDate || null,
        qid22Yn: form.qid22Yn,
        qid22ProteinVal: form.qid22ProteinVal ? parseFloat(form.qid22ProteinVal) : null,
        qid22ProteinDate: form.qid22ProteinDate || null,
        qid23Yn: form.qid23Yn,
        qid24Yn: form.qid24Yn,
        updatedAt: now,
      };

      // 1. Upsert into local SQLite
      await db
        .insert(patientNcdQuestionnaire)
        .values({
          id: entityId,
          ...payload,
          createdAt: now,
        })
        .onConflictDoUpdate({
          target: patientNcdQuestionnaire.patientId,
          set: payload,
        });

      setRecordId(entityId);

      // 2. Queue for background sync to patient-api & PhilHealth proxy
      await addToSyncQueue('patient_ncd_questionnaire', patientId, 'update', payload);

      // 3. Attempt immediate sync if connected
      syncPendingProfileWrites(patientId, getToken).catch(console.error);

      setIsDirty(false);
      Alert.alert(
        'Assessment Saved',
        'Your 24-item NCD Risk Questionnaire has been saved locally and queued for synchronization with your PhilHealth YAKAP eClaims record.',
        [{ text: 'OK', onPress: () => navigation.goBack() }]
      );
    } catch (err: any) {
      console.error('Failed to save NCD Questionnaire:', err);
      Alert.alert('Save Failed', err?.message || 'Could not save questionnaire. Please try again.');
    } finally {
      setIsSaving(false);
    }
  };

  // Reusable Binary Yes/No Choice Control
  const renderYnQuestion = (
    qNumber: number,
    label: string,
    key: keyof typeof form,
    helper?: string
  ) => {
    const currentVal = form[key];
    return (
      <View style={[styles.questionCard, { backgroundColor: colors.card, borderColor: colors.border }]}>
        <View style={styles.qHeader}>
          <View style={styles.qBadge}>
            <ThemedText style={styles.qBadgeText}>Q{qNumber}</ThemedText>
          </View>
          <ThemedText style={[styles.qLabel, { color: colors.text }]}>{label}</ThemedText>
        </View>
        {helper && <ThemedText style={styles.qHelper}>{helper}</ThemedText>}
        <View style={styles.ynButtonGroup}>
          <Pressable
            style={[
              styles.ynButton,
              currentVal === 'Y' && styles.ynButtonSelectedYes,
              { borderColor: currentVal === 'Y' ? '#10B981' : colors.border },
            ]}
            onPress={() => updateField(key, currentVal === 'Y' ? null : 'Y')}
          >
            <ThemedText
              style={[
                styles.ynButtonText,
                currentVal === 'Y' && styles.ynButtonTextSelected,
              ]}
            >
              ✓ Yes
            </ThemedText>
          </Pressable>

          <Pressable
            style={[
              styles.ynButton,
              currentVal === 'N' && styles.ynButtonSelectedNo,
              { borderColor: currentVal === 'N' ? '#EF4444' : colors.border },
            ]}
            onPress={() => updateField(key, currentVal === 'N' ? null : 'N')}
          >
            <ThemedText
              style={[
                styles.ynButtonText,
                currentVal === 'N' && styles.ynButtonTextSelected,
              ]}
            >
              ✕ No
            </ThemedText>
          </Pressable>
        </View>
      </View>
    );
  };

  return (
    <KeyboardAvoidingView
      style={styles.flex}
      behavior={Platform.OS === 'ios' ? 'padding' : undefined}
    >
      <ScrollView
        contentInsetAdjustmentBehavior="automatic"
        contentContainerStyle={styles.content}
        keyboardShouldPersistTaps="handled"
      >
        {/* Banner */}
        <View style={[styles.headerBanner, { backgroundColor: isDark ? '#1E293B' : '#EFF6FF', borderColor: colors.border }]}>
          <ThemedText style={styles.bannerKicker}>PHILHEALTH YAKAP • EKONSULTA</ThemedText>
          <ThemedText style={styles.bannerTitle}>Non-Communicable Disease (NCD) Risk Assessment</ThemedText>
          <ThemedText style={styles.bannerDesc}>
            Standardized 24-item survey aligned with DOH PhilPEN and PhilHealth KonsultaData v1.14 specification. Your answers establish clinical risk stratification and streamline preventive care consultations.
          </ThemedText>
        </View>

        {/* Section 1: Tobacco Use (Q1–Q4) */}
        <ProfileSectionHeader
          title="Section 1: Tobacco & Smoking"
          description="Assessing current, past, and secondhand tobacco exposure."
        />
        {renderYnQuestion(1, 'Do you currently smoke tobacco products (cigarettes, cigars, pipe)?', 'qid1Yn')}
        {renderYnQuestion(2, 'Did you use tobacco products in the past? (Former smoker)', 'qid2Yn')}
        {renderYnQuestion(3, 'Are you regularly exposed to secondhand smoke at home or work?', 'qid3Yn')}
        {renderYnQuestion(4, 'Have you tried quitting smoking in the past 12 months?', 'qid4Yn')}

        {/* Section 2: Alcohol Consumption (Q5–Q8) */}
        <ProfileSectionHeader
          title="Section 2: Alcohol Consumption"
          description="Frequency and patterns of alcohol use (AUDIT-aligned)."
        />
        {/* Q5: 3-Way Choice (Y/N/X) */}
        <View style={[styles.questionCard, { backgroundColor: colors.card, borderColor: colors.border }]}>
          <View style={styles.qHeader}>
            <View style={styles.qBadge}>
              <ThemedText style={styles.qBadgeText}>Q5</ThemedText>
            </View>
            <ThemedText style={[styles.qLabel, { color: colors.text }]}>
              How often do you consume alcoholic beverages?
            </ThemedText>
          </View>
          <ThemedText style={styles.qHelper}>
            Y = 2+ times/week • N = Monthly or less • X = Never
          </ThemedText>
          <View style={styles.ynButtonGroup}>
            <Pressable
              style={[
                styles.ynButton,
                form.qid5Ynx === 'Y' && styles.ynButtonSelectedAmber,
                { borderColor: form.qid5Ynx === 'Y' ? '#F59E0B' : colors.border },
              ]}
              onPress={() => updateField('qid5Ynx', form.qid5Ynx === 'Y' ? null : 'Y')}
            >
              <ThemedText style={[styles.ynButtonText, form.qid5Ynx === 'Y' && styles.ynButtonTextSelected]}>
                Regular (2+/wk)
              </ThemedText>
            </Pressable>
            <Pressable
              style={[
                styles.ynButton,
                form.qid5Ynx === 'N' && styles.ynButtonSelectedBlue,
                { borderColor: form.qid5Ynx === 'N' ? '#3B82F6' : colors.border },
              ]}
              onPress={() => updateField('qid5Ynx', form.qid5Ynx === 'N' ? null : 'N')}
            >
              <ThemedText style={[styles.ynButtonText, form.qid5Ynx === 'N' && styles.ynButtonTextSelected]}>
                Occasionally
              </ThemedText>
            </Pressable>
            <Pressable
              style={[
                styles.ynButton,
                form.qid5Ynx === 'X' && styles.ynButtonSelectedGreen,
                { borderColor: form.qid5Ynx === 'X' ? '#10B981' : colors.border },
              ]}
              onPress={() => updateField('qid5Ynx', form.qid5Ynx === 'X' ? null : 'X')}
            >
              <ThemedText style={[styles.ynButtonText, form.qid5Ynx === 'X' && styles.ynButtonTextSelected]}>
                Never
              </ThemedText>
            </Pressable>
          </View>
        </View>

        {renderYnQuestion(6, 'Do you consume 5 or more standard alcoholic drinks on a single occasion?', 'qid6Yn', 'Binge drinking screening')}
        {renderYnQuestion(7, 'Has a relative, friend, or healthcare worker expressed concern about your drinking?', 'qid7Yn')}
        {renderYnQuestion(8, 'Have you failed to do what was normally expected of you because of drinking?', 'qid8Yn')}

        {/* Section 3: Nutrition & Diet (Q9–Q12) */}
        <ProfileSectionHeader
          title="Section 3: Diet & Nutrition"
          description="Evaluation of dietary habits, salt, sugar, and fat intake."
        />
        {renderYnQuestion(9, 'Do you eat at least 3 to 5 servings of vegetables and fruits daily?', 'qid9Yn')}
        {renderYnQuestion(10, 'Do you regularly eat high-fat, deep-fried foods, or processed meats?', 'qid10Yn')}
        {renderYnQuestion(11, 'Do you frequently add table salt, soy sauce, or patis to meals?', 'qid11Yn')}
        {renderYnQuestion(12, 'Do you drink sugary beverages (soda, sweet tea, energy drinks) daily?', 'qid12Yn')}

        {/* Section 4: Physical Activity (Q13–Q16) */}
        <ProfileSectionHeader
          title="Section 4: Physical Activity"
          description="Assessment of aerobic activity and sedentary lifestyle."
        />
        {renderYnQuestion(13, 'Do you engage in at least 150 minutes of moderate-intensity activity weekly?', 'qid13Yn', 'e.g. brisk walking, cycling, jogging')}
        {renderYnQuestion(14, 'Do you spend 3 or more continuous hours sitting or reclining each day?', 'qid14Yn')}
        {renderYnQuestion(15, 'Does your work or daily routine involve vigorous physical labor?', 'qid15Yn')}
        {renderYnQuestion(16, 'Do you walk or bicycle for at least 10 minutes continuously to travel?', 'qid16Yn')}

        {/* Section 5: Cardiovascular Risk Score (Q17) */}
        <ProfileSectionHeader
          title="Section 5: WHO/ISH Cardiovascular Risk"
          description="10-year risk prediction of fatal or non-fatal CVD events."
        />
        <View style={[styles.questionCard, { backgroundColor: colors.card, borderColor: colors.border }]}>
          <View style={styles.qHeader}>
            <View style={styles.qBadge}>
              <ThemedText style={styles.qBadgeText}>Q17</ThemedText>
            </View>
            <ThemedText style={[styles.qLabel, { color: colors.text }]}>
              WHO/ISH 10-Year CVD Risk Prediction Score
            </ThemedText>
          </View>
          <ThemedText style={styles.qHelper}>
            Computed by your clinic provider based on age, gender, blood pressure, smoking, and blood sugar.
          </ThemedText>

          <Pressable
            style={[styles.pickerTrigger, { borderColor: colors.border, backgroundColor: colors.background }]}
            onPress={() => setShowQ17Modal(true)}
          >
            <ThemedText style={[styles.pickerTriggerText, { color: form.qid17Abcde ? colors.text : '#94A3B8' }]}>
              {Q17_OPTIONS.find((o) => o.value === form.qid17Abcde)?.label ?? 'Select Risk Category (A – E)'}
            </ThemedText>
            <ThemedText style={{ color: colors.text, opacity: 0.6 }}>▼</ThemedText>
          </Pressable>
        </View>

        {/* Section 6: Medical History & Symptoms (Q18, Q23, Q24) */}
        <ProfileSectionHeader
          title="Section 6: Medical & Family History"
          description="Pre-existing diagnoses and genetic pre-dispositions."
        />
        {renderYnQuestion(18, 'Have you been diagnosed with hypertension or taking blood pressure medication?', 'qid18Yn')}
        {renderYnQuestion(23, 'Have you been diagnosed with diabetes or taking diabetes medication?', 'qid23Yn')}
        {renderYnQuestion(24, 'Do you have a family history of premature cardiovascular disease, stroke, or diabetes?', 'qid24Yn')}

        {/* Section 7: Clinical Measurements & Lab Monitoring (Q19–Q22) */}
        <ProfileSectionHeader
          title="Section 7: Laboratory Checks & Biomarkers"
          description="Diagnostic lab results recorded under PhilHealth YAKAP benefits."
        />

        {/* Q19: Fasting Blood Sugar */}
        <View style={[styles.questionCard, { backgroundColor: colors.card, borderColor: colors.border }]}>
          <View style={styles.qHeader}>
            <View style={styles.qBadge}>
              <ThemedText style={styles.qBadgeText}>Q19</ThemedText>
            </View>
            <ThemedText style={[styles.qLabel, { color: colors.text }]}>
              Has Fasting Blood Sugar (FBS) been tested?
            </ThemedText>
          </View>
          <View style={styles.ynButtonGroup}>
            <Pressable
              style={[
                styles.ynButton,
                form.qid19Yn === 'Y' && styles.ynButtonSelectedYes,
                { borderColor: form.qid19Yn === 'Y' ? '#10B981' : colors.border },
              ]}
              onPress={() => updateField('qid19Yn', form.qid19Yn === 'Y' ? null : 'Y')}
            >
              <ThemedText style={[styles.ynButtonText, form.qid19Yn === 'Y' && styles.ynButtonTextSelected]}>
                ✓ Tested
              </ThemedText>
            </Pressable>
            <Pressable
              style={[
                styles.ynButton,
                form.qid19Yn === 'N' && styles.ynButtonSelectedNo,
                { borderColor: form.qid19Yn === 'N' ? '#EF4444' : colors.border },
              ]}
              onPress={() => updateField('qid19Yn', form.qid19Yn === 'N' ? null : 'N')}
            >
              <ThemedText style={[styles.ynButtonText, form.qid19Yn === 'N' && styles.ynButtonTextSelected]}>
                ✕ Not Tested
              </ThemedText>
            </Pressable>
          </View>

          {form.qid19Yn === 'Y' && (
            <View style={styles.labSubFields}>
              <ProfileFormField
                label="FBS Value (mg/dL)"
                value={form.qid19FbsMgdl}
                onChangeText={handleFbsMgdlChange}
                keyboardType="numeric"
                placeholder="e.g. 95.0"
              />
              <ProfileFormField
                label="FBS Value (mmol/L) (Auto-computed)"
                value={form.qid19FbsMmol}
                onChangeText={(val) => updateField('qid19FbsMmol', val)}
                keyboardType="numeric"
                placeholder="e.g. 5.27"
              />
              <ProfileDatePicker
                label="FBS Test Date"
                value={form.qid19FbsDate}
                onChange={(val) => updateField('qid19FbsDate', val)}
              />
            </View>
          )}
        </View>

        {/* Q20: Total Cholesterol */}
        <View style={[styles.questionCard, { backgroundColor: colors.card, borderColor: colors.border }]}>
          <View style={styles.qHeader}>
            <View style={styles.qBadge}>
              <ThemedText style={styles.qBadgeText}>Q20</ThemedText>
            </View>
            <ThemedText style={[styles.qLabel, { color: colors.text }]}>
              Has Total Cholesterol been tested?
            </ThemedText>
          </View>
          <View style={styles.ynButtonGroup}>
            <Pressable
              style={[
                styles.ynButton,
                form.qid20Yn === 'Y' && styles.ynButtonSelectedYes,
                { borderColor: form.qid20Yn === 'Y' ? '#10B981' : colors.border },
              ]}
              onPress={() => updateField('qid20Yn', form.qid20Yn === 'Y' ? null : 'Y')}
            >
              <ThemedText style={[styles.ynButtonText, form.qid20Yn === 'Y' && styles.ynButtonTextSelected]}>
                ✓ Tested
              </ThemedText>
            </Pressable>
            <Pressable
              style={[
                styles.ynButton,
                form.qid20Yn === 'N' && styles.ynButtonSelectedNo,
                { borderColor: form.qid20Yn === 'N' ? '#EF4444' : colors.border },
              ]}
              onPress={() => updateField('qid20Yn', form.qid20Yn === 'N' ? null : 'N')}
            >
              <ThemedText style={[styles.ynButtonText, form.qid20Yn === 'N' && styles.ynButtonTextSelected]}>
                ✕ Not Tested
              </ThemedText>
            </Pressable>
          </View>

          {form.qid20Yn === 'Y' && (
            <View style={styles.labSubFields}>
              <ProfileFormField
                label="Cholesterol Value (mg/dL)"
                value={form.qid20CholeVal}
                onChangeText={(val) => updateField('qid20CholeVal', val)}
                keyboardType="numeric"
                placeholder="e.g. 185.0"
              />
              <ProfileDatePicker
                label="Cholesterol Test Date"
                value={form.qid20CholeDate}
                onChange={(val) => updateField('qid20CholeDate', val)}
              />
            </View>
          )}
        </View>

        {/* Q21: Urine Ketones */}
        <View style={[styles.questionCard, { backgroundColor: colors.card, borderColor: colors.border }]}>
          <View style={styles.qHeader}>
            <View style={styles.qBadge}>
              <ThemedText style={styles.qBadgeText}>Q21</ThemedText>
            </View>
            <ThemedText style={[styles.qLabel, { color: colors.text }]}>
              Has Urine Ketones test been performed?
            </ThemedText>
          </View>
          <View style={styles.ynButtonGroup}>
            <Pressable
              style={[
                styles.ynButton,
                form.qid21Yn === 'Y' && styles.ynButtonSelectedYes,
                { borderColor: form.qid21Yn === 'Y' ? '#10B981' : colors.border },
              ]}
              onPress={() => updateField('qid21Yn', form.qid21Yn === 'Y' ? null : 'Y')}
            >
              <ThemedText style={[styles.ynButtonText, form.qid21Yn === 'Y' && styles.ynButtonTextSelected]}>
                ✓ Tested
              </ThemedText>
            </Pressable>
            <Pressable
              style={[
                styles.ynButton,
                form.qid21Yn === 'N' && styles.ynButtonSelectedNo,
                { borderColor: form.qid21Yn === 'N' ? '#EF4444' : colors.border },
              ]}
              onPress={() => updateField('qid21Yn', form.qid21Yn === 'N' ? null : 'N')}
            >
              <ThemedText style={[styles.ynButtonText, form.qid21Yn === 'N' && styles.ynButtonTextSelected]}>
                ✕ Not Tested
              </ThemedText>
            </Pressable>
          </View>

          {form.qid21Yn === 'Y' && (
            <View style={styles.labSubFields}>
              <ProfileFormField
                label="Ketones Value (mg/dL or Scale 0–4)"
                value={form.qid21KetonVal}
                onChangeText={(val) => updateField('qid21KetonVal', val)}
                keyboardType="numeric"
                placeholder="e.g. 0 (Negative)"
              />
              <ProfileDatePicker
                label="Ketones Test Date"
                value={form.qid21KetonDate}
                onChange={(val) => updateField('qid21KetonDate', val)}
              />
            </View>
          )}
        </View>

        {/* Q22: Urine Protein */}
        <View style={[styles.questionCard, { backgroundColor: colors.card, borderColor: colors.border }]}>
          <View style={styles.qHeader}>
            <View style={styles.qBadge}>
              <ThemedText style={styles.qBadgeText}>Q22</ThemedText>
            </View>
            <ThemedText style={[styles.qLabel, { color: colors.text }]}>
              Has Urine Protein (Albumin) test been performed?
            </ThemedText>
          </View>
          <View style={styles.ynButtonGroup}>
            <Pressable
              style={[
                styles.ynButton,
                form.qid22Yn === 'Y' && styles.ynButtonSelectedYes,
                { borderColor: form.qid22Yn === 'Y' ? '#10B981' : colors.border },
              ]}
              onPress={() => updateField('qid22Yn', form.qid22Yn === 'Y' ? null : 'Y')}
            >
              <ThemedText style={[styles.ynButtonText, form.qid22Yn === 'Y' && styles.ynButtonTextSelected]}>
                ✓ Tested
              </ThemedText>
            </Pressable>
            <Pressable
              style={[
                styles.ynButton,
                form.qid22Yn === 'N' && styles.ynButtonSelectedNo,
                { borderColor: form.qid22Yn === 'N' ? '#EF4444' : colors.border },
              ]}
              onPress={() => updateField('qid22Yn', form.qid22Yn === 'N' ? null : 'N')}
            >
              <ThemedText style={[styles.ynButtonText, form.qid22Yn === 'N' && styles.ynButtonTextSelected]}>
                ✕ Not Tested
              </ThemedText>
            </Pressable>
          </View>

          {form.qid22Yn === 'Y' && (
            <View style={styles.labSubFields}>
              <ProfileFormField
                label="Protein Value (mg/dL or Scale 0–4)"
                value={form.qid22ProteinVal}
                onChangeText={(val) => updateField('qid22ProteinVal', val)}
                keyboardType="numeric"
                placeholder="e.g. 0 (Negative)"
              />
              <ProfileDatePicker
                label="Protein Test Date"
                value={form.qid22ProteinDate}
                onChange={(val) => updateField('qid22ProteinDate', val)}
              />
            </View>
          )}
        </View>
      </ScrollView>

      {/* Save Bar */}
      <ProfileSaveBar
        onSave={handleSave}
        saving={isSaving}
        isDirty={isDirty}
        label="Save & Sync NCD Assessment"
      />

      {/* Modal for Q17 CVD Risk selection */}
      <ProfileSelectModal
        visible={showQ17Modal}
        title="WHO/ISH CVD Risk Category"
        options={Q17_OPTIONS}
        selected={form.qid17Abcde}
        onSelect={(val) => {
          updateField('qid17Abcde', val);
          setShowQ17Modal(false);
        }}
        onClose={() => setShowQ17Modal(false)}
      />
    </KeyboardAvoidingView>
  );
}

const styles = StyleSheet.create({
  flex: { flex: 1 },
  content: { padding: 16, paddingBottom: 40 },
  headerBanner: {
    borderRadius: 16,
    borderWidth: StyleSheet.hairlineWidth,
    padding: 16,
    marginBottom: 16,
    gap: 6,
  },
  bannerKicker: {
    fontSize: 11,
    fontWeight: '800',
    color: '#0284C7',
    letterSpacing: 0.8,
  },
  bannerTitle: {
    fontSize: 18,
    fontWeight: '800',
  },
  bannerDesc: {
    fontSize: 13,
    lineHeight: 18,
    opacity: 0.8,
  },
  questionCard: {
    borderRadius: 14,
    borderWidth: StyleSheet.hairlineWidth,
    padding: 14,
    marginBottom: 12,
    gap: 10,
  },
  qHeader: {
    flexDirection: 'row',
    alignItems: 'flex-start',
    gap: 10,
  },
  qBadge: {
    backgroundColor: '#0284C7',
    paddingHorizontal: 8,
    paddingVertical: 3,
    borderRadius: 6,
  },
  qBadgeText: {
    color: '#fff',
    fontSize: 12,
    fontWeight: '800',
  },
  qLabel: {
    flex: 1,
    fontSize: 14,
    fontWeight: '600',
    lineHeight: 20,
  },
  qHelper: {
    fontSize: 12,
    opacity: 0.65,
    marginTop: -4,
  },
  ynButtonGroup: {
    flexDirection: 'row',
    gap: 10,
  },
  ynButton: {
    flex: 1,
    paddingVertical: 10,
    borderRadius: 10,
    borderWidth: 1.5,
    alignItems: 'center',
    justifyContent: 'center',
  },
  ynButtonSelectedYes: {
    backgroundColor: 'rgba(16, 185, 129, 0.15)',
  },
  ynButtonSelectedNo: {
    backgroundColor: 'rgba(239, 68, 68, 0.15)',
  },
  ynButtonSelectedAmber: {
    backgroundColor: 'rgba(245, 158, 11, 0.15)',
  },
  ynButtonSelectedBlue: {
    backgroundColor: 'rgba(59, 130, 246, 0.15)',
  },
  ynButtonSelectedGreen: {
    backgroundColor: 'rgba(16, 185, 129, 0.15)',
  },
  ynButtonText: {
    fontSize: 13,
    fontWeight: '600',
  },
  ynButtonTextSelected: {
    fontWeight: '800',
  },
  pickerTrigger: {
    borderWidth: StyleSheet.hairlineWidth,
    borderRadius: 10,
    paddingHorizontal: 14,
    paddingVertical: 12,
    flexDirection: 'row',
    justifyContent: 'space-between',
    alignItems: 'center',
  },
  pickerTriggerText: {
    fontSize: 14,
    fontWeight: '500',
  },
  labSubFields: {
    marginTop: 6,
    gap: 6,
  },
});
