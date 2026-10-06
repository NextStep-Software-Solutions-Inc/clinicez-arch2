import React, { useState, useEffect } from 'react';
import { View, StyleSheet, Pressable } from 'react-native';
import { theme } from '@constants/theme';
import { Modal, Input, Button, Badge, Icon, ErrorState, SkeletonList, ThemedText } from '@ui';
import { Alert } from '@utils/feedback';
import {
  clinicService,
  PhilHealthPatientProfile,
  PhilHealthConditionEntry,
  ClinicPatient,
} from '../services/clinicService';

interface PhilHealthProfileModalProps {
  visible: boolean;
  onClose: () => void;
  patient: ClinicPatient | null;
  onSaved?: (updated: PhilHealthPatientProfile) => void;
}

type TabType = 'general' | 'medical' | 'lifestyle' | 'reproductive' | 'ncd';

const TABS: { key: TabType; label: string }[] = [
  { key: 'general', label: 'General and vitals' },
  { key: 'medical', label: 'Medical and family' },
  { key: 'lifestyle', label: 'Social and vaccines' },
  { key: 'reproductive', label: "Women's health" },
  { key: 'ncd', label: 'PhilPEN (24)' },
];

type ChipTone = 'primary' | 'success' | 'warning';

/** Selectable option used for single-choice and multi-choice answers throughout the form. */
function Chip({
  label,
  active,
  onPress,
  tone = 'primary',
  marker = false,
}: {
  label: string;
  active: boolean;
  onPress: () => void;
  tone?: ChipTone;
  /** Shows a check/plus marker, used for toggle-style condition lists. */
  marker?: boolean;
}) {
  const textColor = !active
    ? theme.colors.textSecondary
    : tone === 'success'
      ? theme.colors.successText
      : tone === 'warning'
        ? theme.colors.warningText
        : theme.colors.primary;
  return (
    <Pressable
      onPress={onPress}
      accessibilityRole="button"
      accessibilityState={{ selected: active }}
      style={[
        styles.chip,
        active && tone === 'primary' && styles.chipPrimary,
        active && tone === 'success' && styles.chipSuccess,
        active && tone === 'warning' && styles.chipWarning,
      ]}
    >
      {marker ? <Icon name={active ? 'check' : 'plus'} size={theme.fontSizes.md} color={textColor} /> : null}
      <ThemedText variant={active ? 'smallBold' : 'small'} color={textColor}>
        {label}
      </ThemedText>
    </Pressable>
  );
}

function YesNo({
  value,
  onChange,
  yesTone = 'primary',
}: {
  value: boolean;
  onChange: (next: boolean) => void;
  yesTone?: ChipTone;
}) {
  return (
    <View style={styles.chipRow}>
      <Chip label="No" active={!value} onPress={() => onChange(false)} />
      <Chip label="Yes" active={value} onPress={() => onChange(true)} tone={yesTone} />
    </View>
  );
}

function SectionTitle({ children, spaced }: { children: React.ReactNode; spaced?: boolean }) {
  return (
    <ThemedText variant="h3" style={spaced ? styles.sectionTitleSpaced : styles.sectionTitle}>
      {children}
    </ThemedText>
  );
}

function Helper({ children }: { children: React.ReactNode }) {
  return (
    <ThemedText variant="small" color={theme.colors.textMuted} style={styles.helperText}>
      {children}
    </ThemedText>
  );
}

function FieldLabel({ children }: { children: React.ReactNode }) {
  return (
    <ThemedText variant="captionBold" color={theme.colors.textSecondary} style={styles.fieldLabel}>
      {children}
    </ThemedText>
  );
}

const CONDITIONS = [
  { code: '011', desc: 'Hypertension' },
  { code: '006', desc: 'Diabetes Mellitus' },
  { code: '002', desc: 'Bronchial Asthma' },
  { code: '001', desc: 'Allergies' },
  { code: '007', desc: 'COPD / Emphysema' },
  { code: '004', desc: 'Stroke / CVD' },
  { code: '005', desc: 'Coronary Artery Disease' },
  { code: '003', desc: 'Cancer / Malignancy' },
  { code: '010', desc: 'Dyslipidemia' },
  { code: '015', desc: 'Tuberculosis' },
];

const FAMILY_CONDITIONS = [
  { code: '011', desc: 'Hypertension' },
  { code: '006', desc: 'Diabetes Mellitus' },
  { code: '003', desc: 'Cancer' },
  { code: '004', desc: 'Stroke' },
  { code: '005', desc: 'Heart Disease' },
  { code: '002', desc: 'Asthma' },
];

const ORGAN_SYSTEMS = [
  { key: 'skinId', label: 'Skin' },
  { key: 'heentId', label: 'HEENT' },
  { key: 'chestId', label: 'Chest / Lungs' },
  { key: 'heartId', label: 'Heart' },
  { key: 'abdomenId', label: 'Abdomen' },
  { key: 'neuroId', label: 'Neurological' },
  { key: 'guId', label: 'Genitourinary' },
  { key: 'rectalId', label: 'Rectal' },
];

const NCD_QUESTIONS = [
  { id: 'ncd_qid1', q: 'Q1: Does the patient have high blood pressure / hypertension?' },
  { id: 'ncd_qid2', q: 'Q2: Does the patient have diabetes mellitus?' },
  { id: 'ncd_qid3', q: 'Q3: Any family history of premature cardiovascular disease?' },
  { id: 'ncd_qid4', q: 'Q4: Does the patient currently smoke tobacco products?' },
  { id: 'ncd_qid6', q: 'Q6: Engages in at least 150 minutes of physical activity weekly?' },
  { id: 'ncd_qid7', q: 'Q7: Consumes fruits and vegetables daily?' },
  { id: 'ncd_qid8', q: 'Q8: Frequently adds high-sodium condiments or salty snacks?' },
];

export default function PhilHealthProfileModal({
  visible,
  onClose,
  patient,
  onSaved,
}: PhilHealthProfileModalProps) {
  const [activeTab, setActiveTab] = useState<TabType>('general');
  const [loading, setLoading] = useState(false);
  const [saving, setSaving] = useState(false);
  const [loadError, setLoadError] = useState<string | null>(null);
  const [profile, setProfile] = useState<PhilHealthPatientProfile | null>(null);

  const isFemale = patient?.gender?.toLowerCase().startsWith('f') ?? false;
  const age = patient?.age ?? 0;
  const isPediatric = age < 18;
  const isSenior = age >= 60;

  useEffect(() => {
    if (visible && patient) {
      loadProfile(patient.id);
    }
  }, [visible, patient]);

  const loadProfile = async (patientId: string) => {
    setLoading(true);
    setLoadError(null);
    try {
      const [data, err] = await clinicService.getPhilHealthPatientProfile(patientId);
      if (data) {
        setProfile(data);
      } else {
        setProfile(null);
        setLoadError(err?.message || 'Unable to load the PhilHealth profile.');
      }
    } catch (err: any) {
      console.error('Failed to load profile:', err);
      setProfile(null);
      setLoadError(err?.message || 'Failed to fetch the PhilHealth profile.');
    } finally {
      setLoading(false);
    }
  };

  const handleSave = async () => {
    if (!patient || !profile) return;

    if (profile.memberType === 'DD') {
      if (!profile.memberPin?.trim()) {
        Alert.alert('Validation Error', 'Principal Member PIN is required for PhilHealth dependent claim transmittal.');
        return;
      }
      if (!profile.memberLastName?.trim() || !profile.memberFirstName?.trim()) {
        Alert.alert('Validation Error', 'Principal Member Last Name and First Name are required.');
        return;
      }
      if (!profile.memberBirthDate?.trim()) {
        Alert.alert('Validation Error', 'Principal Member Date of Birth (YYYY-MM-DD) is required.');
        return;
      }
      if (!profile.dependentRelationship) {
        Alert.alert('Validation Error', 'Please select the dependent relationship to the principal member.');
        return;
      }
    }

    setSaving(true);
    try {
      const [data, err] = await clinicService.updatePhilHealthPatientProfile(patient.id, profile);
      if (data) {
        Alert.alert('Success', 'PhilHealth patient profile saved.');
        onSaved?.(data);
        onClose();
      } else {
        Alert.alert('Failed', err?.message || 'Could not save profile.');
      }
    } catch (err: any) {
      Alert.alert('Error', err?.message || 'Failed to save PhilHealth profile.');
    } finally {
      setSaving(false);
    }
  };

  if (!visible || !patient) return null;

  const toggleCondition = (code: string, desc: string) => {
    if (!profile) return;
    const exists = profile.medicalHistories.some((m) => m.code === code);
    let updated: PhilHealthConditionEntry[];
    if (exists) {
      updated = profile.medicalHistories.filter((m) => m.code !== code);
    } else {
      updated = [...profile.medicalHistories, { code, specificDesc: desc }];
    }
    setProfile({ ...profile, medicalHistories: updated });
  };

  const toggleFamilyCondition = (code: string, desc: string) => {
    if (!profile) return;
    const exists = profile.familyHistories.some((m) => m.code === code);
    let updated: PhilHealthConditionEntry[];
    if (exists) {
      updated = profile.familyHistories.filter((m) => m.code !== code);
    } else {
      updated = [...profile.familyHistories, { code, specificDesc: desc }];
    }
    setProfile({ ...profile, familyHistories: updated });
  };

  const toggleImmunization = (category: 'child' | 'youngWoman' | 'pregnantWoman' | 'elderly' | 'other', code: string) => {
    if (!profile) return;
    const key = `${category}Immunizations` as keyof PhilHealthPatientProfile;
    const currentList = (profile[key] as string[]) || [];
    const exists = currentList.includes(code);
    const updated = exists ? currentList.filter((c) => c !== code) : [...currentList, code];
    setProfile({ ...profile, [key]: updated });
  };

  const renderImmunizations = (
    title: string,
    category: 'child' | 'youngWoman' | 'elderly',
    codes: string[],
    selected: string[]
  ) => (
    <View style={styles.subSection}>
      <ThemedText variant="bodyBold" color={theme.colors.textSecondary} style={styles.subHeading}>
        {title}
      </ThemedText>
      <View style={styles.conditionsWrap}>
        {codes.map((v) => (
          <Chip
            key={v}
            label={v}
            marker
            tone="success"
            active={selected.includes(v)}
            onPress={() => toggleImmunization(category, v)}
          />
        ))}
      </View>
    </View>
  );

  const renderBody = () => {
    if (loading) {
      return <SkeletonList rows={6} />;
    }
    if (loadError || !profile) {
      return (
        <ErrorState
          title="Could not load the PhilHealth profile"
          message={loadError || 'Something went wrong while loading this patient.'}
          onRetry={() => loadProfile(patient.id)}
        />
      );
    }

    return (
      <>
        {/* TAB 1: General and vitals */}
        {activeTab === 'general' && (
          <View>
            <SectionTitle>Identification and registration</SectionTitle>
            <View style={styles.formRow}>
              <Input
                containerStyle={styles.fieldCol}
                label="PhilHealth Identification No. (PIN)"
                value={profile.pin || ''}
                onChangeText={(txt) =>
                  setProfile({
                    ...profile,
                    pin: txt,
                    ...(profile.memberType === 'MM' ? { memberPin: txt } : {}),
                  })
                }
                placeholder="12-digit PIN"
                keyboardType="numeric"
              />
              <View style={styles.fieldCol}>
                <FieldLabel>Member type</FieldLabel>
                <View style={styles.chipRow}>
                  <Chip
                    label="Member (MM)"
                    active={profile.memberType === 'MM'}
                    onPress={() =>
                      setProfile({
                        ...profile,
                        memberType: 'MM',
                        memberPin: profile.pin || '',
                      })
                    }
                  />
                  <Chip
                    label="Dependent (DD)"
                    active={profile.memberType === 'DD'}
                    onPress={() =>
                      setProfile({
                        ...profile,
                        memberType: 'DD',
                        memberLastName: profile.memberLastName || patient?.lastName || '',
                        dependentRelationship: profile.dependentRelationship || (isPediatric ? 'C' : 'S'),
                      })
                    }
                  />
                </View>
              </View>
              <Input
                containerStyle={styles.fieldCol}
                label="Blood type"
                value={profile.bloodType || ''}
                onChangeText={(txt) => setProfile({ ...profile, bloodType: txt })}
                placeholder="e.g. O+, A+, B+"
              />
            </View>

            {profile.memberType === 'DD' && (
              <View style={styles.sponsorCard}>
                <View style={styles.sponsorHeader}>
                  <Badge label="Sponsor" variant="primary" />
                  <ThemedText variant="bodyBold">Principal member credentials</ThemedText>
                </View>
                <ThemedText variant="caption" color={theme.colors.textSecondary}>
                  Required for PhilHealth Konsulta dependent claim transmittal. Enter the principal member's legal details.
                </ThemedText>

                <View style={styles.formRow}>
                  <Input
                    containerStyle={styles.fieldCol}
                    label="Principal member PIN"
                    required
                    value={profile.memberPin || ''}
                    onChangeText={(txt) => setProfile({ ...profile, memberPin: txt })}
                    placeholder="12-digit PIN"
                    keyboardType="numeric"
                  />
                  <View style={styles.fieldCol}>
                    <FieldLabel>Relationship to principal member *</FieldLabel>
                    <View style={styles.chipRow}>
                      {[
                        { label: 'Child (C)', value: 'C' },
                        { label: 'Spouse (S)', value: 'S' },
                        { label: 'Parent (P)', value: 'P' },
                        { label: 'Disabled (D)', value: 'D' },
                      ].map((rel) => (
                        <Chip
                          key={rel.value}
                          label={rel.label}
                          active={profile.dependentRelationship === rel.value}
                          onPress={() => setProfile({ ...profile, dependentRelationship: rel.value })}
                        />
                      ))}
                    </View>
                  </View>
                </View>

                <View style={styles.formRow}>
                  <Input
                    containerStyle={styles.fieldCol}
                    label="Member last name"
                    required
                    value={profile.memberLastName || ''}
                    onChangeText={(txt) => setProfile({ ...profile, memberLastName: txt })}
                    placeholder="Last name"
                  />
                  <Input
                    containerStyle={styles.fieldCol}
                    label="Member first name"
                    required
                    value={profile.memberFirstName || ''}
                    onChangeText={(txt) => setProfile({ ...profile, memberFirstName: txt })}
                    placeholder="First name"
                  />
                  <Input
                    containerStyle={styles.fieldCol}
                    label="Middle name"
                    value={profile.memberMiddleName || ''}
                    onChangeText={(txt) => setProfile({ ...profile, memberMiddleName: txt })}
                    placeholder="Middle name"
                  />
                </View>

                <View style={styles.formRow}>
                  <Input
                    containerStyle={styles.fieldCol}
                    label="Member suffix"
                    value={profile.memberSuffix || ''}
                    onChangeText={(txt) => setProfile({ ...profile, memberSuffix: txt })}
                    placeholder="e.g. Jr, Sr, III"
                  />
                  <Input
                    containerStyle={styles.fieldCol}
                    label="Member date of birth"
                    required
                    value={profile.memberBirthDate || ''}
                    onChangeText={(txt) => setProfile({ ...profile, memberBirthDate: txt })}
                    placeholder="YYYY-MM-DD"
                  />
                </View>
              </View>
            )}

            <SectionTitle spaced>
              Vitals and anthropometrics {isPediatric ? '(pediatric protocol)' : '(adult protocol)'}
            </SectionTitle>
            <View style={styles.formRow}>
              <Input
                containerStyle={styles.fieldCol}
                label="BP systolic (mmHg)"
                value={profile.systolic || ''}
                onChangeText={(txt) => setProfile({ ...profile, systolic: txt })}
                keyboardType="numeric"
              />
              <Input
                containerStyle={styles.fieldCol}
                label="BP diastolic (mmHg)"
                value={profile.diastolic || ''}
                onChangeText={(txt) => setProfile({ ...profile, diastolic: txt })}
                keyboardType="numeric"
              />
              <Input
                containerStyle={styles.fieldCol}
                label="Heart rate (bpm)"
                value={profile.heartRate || ''}
                onChangeText={(txt) => setProfile({ ...profile, heartRate: txt })}
                keyboardType="numeric"
              />
              <Input
                containerStyle={styles.fieldCol}
                label="Temperature (°C)"
                value={profile.temperature || ''}
                onChangeText={(txt) => setProfile({ ...profile, temperature: txt })}
                keyboardType="numeric"
              />
            </View>

            <View style={styles.formRow}>
              <Input
                containerStyle={styles.fieldCol}
                label="Height / length (cm)"
                value={profile.heightCm || ''}
                onChangeText={(txt) => setProfile({ ...profile, heightCm: txt })}
                keyboardType="numeric"
              />
              <Input
                containerStyle={styles.fieldCol}
                label="Weight (kg)"
                value={profile.weightKg || ''}
                onChangeText={(txt) => setProfile({ ...profile, weightKg: txt })}
                keyboardType="numeric"
              />
              {!isPediatric ? (
                <>
                  <Input
                    containerStyle={styles.fieldCol}
                    label="Waist circumference (cm)"
                    value={profile.waistCm || ''}
                    onChangeText={(txt) => setProfile({ ...profile, waistCm: txt })}
                    keyboardType="numeric"
                  />
                  <Input
                    containerStyle={styles.fieldCol}
                    label="Hip circumference (cm)"
                    value={profile.hipCm || ''}
                    onChangeText={(txt) => setProfile({ ...profile, hipCm: txt })}
                    keyboardType="numeric"
                  />
                </>
              ) : (
                <>
                  <Input
                    containerStyle={styles.fieldCol}
                    label="Head circumference (cm)"
                    value={profile.headCircCm || ''}
                    onChangeText={(txt) => setProfile({ ...profile, headCircCm: txt })}
                    keyboardType="numeric"
                  />
                  <Input
                    containerStyle={styles.fieldCol}
                    label="MUAC (cm)"
                    value={profile.muacCm || ''}
                    onChangeText={(txt) => setProfile({ ...profile, muacCm: txt })}
                    keyboardType="numeric"
                  />
                </>
              )}
            </View>

            <SectionTitle spaced>Organ systems examination</SectionTitle>
            <View style={styles.organsGrid}>
              {ORGAN_SYSTEMS.map((item) => {
                const isNorm = (profile as any)[item.key] === '1';
                return (
                  <View key={item.key} style={styles.organRow}>
                    <ThemedText variant="bodyBold" color={theme.colors.textSecondary}>
                      {item.label}
                    </ThemedText>
                    <View style={styles.chipRow}>
                      <Chip
                        label="Normal"
                        tone="success"
                        active={isNorm}
                        onPress={() => setProfile({ ...profile, [item.key]: '1' })}
                      />
                      <Chip
                        label="Findings"
                        tone="warning"
                        active={!isNorm}
                        onPress={() => setProfile({ ...profile, [item.key]: '2' })}
                      />
                    </View>
                  </View>
                );
              })}
            </View>
          </View>
        )}

        {/* TAB 2: Medical and family */}
        {activeTab === 'medical' && (
          <View>
            <SectionTitle>Past medical history (personal)</SectionTitle>
            <Helper>Select documented non-communicable and chronic diseases for the patient.</Helper>
            <View style={styles.conditionsWrap}>
              {CONDITIONS.map((c) => (
                <Chip
                  key={c.code}
                  label={c.desc}
                  marker
                  tone="success"
                  active={profile.medicalHistories.some((m) => m.code === c.code)}
                  onPress={() => toggleCondition(c.code, c.desc)}
                />
              ))}
            </View>

            <SectionTitle spaced>Family medical history</SectionTitle>
            <Helper>Hereditary and familial risk factors.</Helper>
            <View style={styles.conditionsWrap}>
              {FAMILY_CONDITIONS.map((c) => (
                <Chip
                  key={`fam-${c.code}`}
                  label={c.desc}
                  marker
                  tone="success"
                  active={profile.familyHistories.some((m) => m.code === c.code)}
                  onPress={() => toggleFamilyCondition(c.code, c.desc)}
                />
              ))}
            </View>
          </View>
        )}

        {/* TAB 3: Social and vaccines */}
        {activeTab === 'lifestyle' && (
          <View>
            <SectionTitle>Social and behavioral history</SectionTitle>
            {isPediatric ? (
              <View style={styles.pediatricBanner}>
                <ThemedText variant="small" color={theme.colors.infoText}>
                  Pediatric patient ({age} yrs): behavioral factors (smoking, alcohol, substance use) are preset to
                  non-applicable / non-user per PhilHealth protocol.
                </ThemedText>
              </View>
            ) : (
              <View style={styles.behavioralGrid}>
                <View style={styles.behavioralRow}>
                  <ThemedText variant="bodyBold" color={theme.colors.textSecondary}>
                    Tobacco / cigarette smoker?
                  </ThemedText>
                  <YesNo value={!!profile.isSmoker} onChange={(v) => setProfile({ ...profile, isSmoker: v })} />
                </View>

                <View style={styles.behavioralRow}>
                  <ThemedText variant="bodyBold" color={theme.colors.textSecondary}>
                    Alcohol drinker?
                  </ThemedText>
                  <YesNo
                    value={!!profile.isAlcoholDrinker}
                    onChange={(v) => setProfile({ ...profile, isAlcoholDrinker: v })}
                  />
                </View>
              </View>
            )}

            <SectionTitle spaced>Immunizations (vaccines)</SectionTitle>
            {isPediatric &&
              renderImmunizations(
                'Child vaccines (EPI)',
                'child',
                ['BCG', 'DPT', 'OPV', 'MEASLES', 'HEPB', 'HIB', 'ROTA', 'PCV'],
                profile.childImmunizations
              )}

            {isFemale &&
              age >= 10 &&
              age <= 49 &&
              renderImmunizations(
                'Young woman vaccines (HPV / Rubella)',
                'youngWoman',
                ['HPV', 'RUBELLA'],
                profile.youngWomanImmunizations
              )}

            {isSenior && renderImmunizations('Senior citizen vaccines', 'elderly', ['FLU', 'PNEUM'], profile.elderlyImmunizations)}
          </View>
        )}

        {/* TAB 4: Reproductive (women's health) */}
        {activeTab === 'reproductive' && (
          <View>
            {!isFemale ? (
              <View style={styles.noticeBox}>
                <ThemedText variant="h3" color={theme.colors.textSecondary}>
                  Not applicable
                </ThemedText>
                <ThemedText variant="body" color={theme.colors.textMuted}>
                  Menstrual and obstetric history does not apply to male patients. These sections are sent to PhilHealth
                  as not applicable with zero counts.
                </ThemedText>
              </View>
            ) : (
              <>
                <View style={styles.toggleHeader}>
                  <View style={styles.toggleHeaderText}>
                    <SectionTitle>Menstrual history</SectionTitle>
                    <Helper>Record observed menstrual history. Can be marked not applicable.</Helper>
                  </View>
                  <View style={styles.chipRow}>
                    <Chip
                      label="Not applicable (N)"
                      active={!profile.menstrualApplicable}
                      onPress={() => setProfile({ ...profile, menstrualApplicable: false })}
                    />
                    <Chip
                      label="Applicable (Y)"
                      active={!!profile.menstrualApplicable}
                      onPress={() => setProfile({ ...profile, menstrualApplicable: true })}
                    />
                  </View>
                </View>

                {profile.menstrualApplicable ? (
                  <View style={styles.formRow}>
                    <Input
                      containerStyle={styles.fieldCol}
                      label="Menarche age (yrs)"
                      value={profile.menarcheAge || ''}
                      onChangeText={(txt) => setProfile({ ...profile, menarcheAge: txt, menstrualApplicable: true })}
                      placeholder="Age in years"
                      keyboardType="numeric"
                    />
                    <Input
                      containerStyle={styles.fieldCol}
                      label="LMP date"
                      value={profile.lastMensPeriod || ''}
                      onChangeText={(txt) => setProfile({ ...profile, lastMensPeriod: txt, menstrualApplicable: true })}
                      placeholder="YYYY-MM-DD"
                    />
                    <Input
                      containerStyle={styles.fieldCol}
                      label="Duration (days)"
                      value={profile.periodDurationDays || ''}
                      onChangeText={(txt) => setProfile({ ...profile, periodDurationDays: txt })}
                      placeholder="Days"
                      keyboardType="numeric"
                    />
                    <Input
                      containerStyle={styles.fieldCol}
                      label="Cycle interval (days)"
                      value={profile.cycleIntervalDays || ''}
                      onChangeText={(txt) => setProfile({ ...profile, cycleIntervalDays: txt })}
                      placeholder="Days"
                      keyboardType="numeric"
                    />
                  </View>
                ) : (
                  <View style={styles.noticeBox}>
                    <ThemedText variant="body" color={theme.colors.textMuted}>
                      Menstrual history is marked not applicable (N). It will be left blank in PhilHealth transmissions.
                    </ThemedText>
                  </View>
                )}

                <View style={[styles.toggleHeader, styles.toggleHeaderSpaced]}>
                  <View style={styles.toggleHeaderText}>
                    <SectionTitle>Obstetric history (pregnancies)</SectionTitle>
                    <Helper>Record obstetric history if applicable. Can be changed for adolescent or adult patients.</Helper>
                  </View>
                  <View style={styles.chipRow}>
                    <Chip
                      label="Not applicable (N)"
                      active={!profile.pregnancyApplicable}
                      onPress={() =>
                        setProfile({
                          ...profile,
                          pregnancyApplicable: false,
                          gravida: 0,
                          para: 0,
                          fullTermCount: 0,
                          prematureCount: 0,
                          abortionCount: 0,
                          livingChildrenCount: 0,
                        })
                      }
                    />
                    <Chip
                      label="Applicable (Y)"
                      active={!!profile.pregnancyApplicable}
                      onPress={() =>
                        setProfile({
                          ...profile,
                          pregnancyApplicable: true,
                          gravida: profile.gravida > 0 ? profile.gravida : 1,
                        })
                      }
                    />
                  </View>
                </View>

                {profile.pregnancyApplicable ? (
                  <>
                    <View style={styles.formRow}>
                      <Input
                        containerStyle={styles.fieldCol}
                        label="Gravida (total pregnancies)"
                        value={profile.gravida.toString()}
                        onChangeText={(txt) =>
                          setProfile({
                            ...profile,
                            gravida: parseInt(txt, 10) || 0,
                            pregnancyApplicable: true,
                          })
                        }
                        keyboardType="numeric"
                      />
                      <Input
                        containerStyle={styles.fieldCol}
                        label="Para (total deliveries)"
                        value={profile.para.toString()}
                        onChangeText={(txt) => setProfile({ ...profile, para: parseInt(txt, 10) || 0 })}
                        keyboardType="numeric"
                      />
                      <View style={styles.fieldCol}>
                        <FieldLabel>Delivery type</FieldLabel>
                        <View style={styles.chipRow}>
                          <Chip
                            label="Vaginal (V)"
                            active={(profile.deliveryType || 'V') === 'V'}
                            onPress={() => setProfile({ ...profile, deliveryType: 'V' })}
                          />
                          <Chip
                            label="Cesarean (C)"
                            active={profile.deliveryType === 'C'}
                            onPress={() => setProfile({ ...profile, deliveryType: 'C' })}
                          />
                        </View>
                      </View>
                      <Input
                        containerStyle={styles.fieldCol}
                        label="Full-term deliveries"
                        value={profile.fullTermCount.toString()}
                        onChangeText={(txt) => setProfile({ ...profile, fullTermCount: parseInt(txt, 10) || 0 })}
                        keyboardType="numeric"
                      />
                    </View>

                    <View style={styles.formRow}>
                      <Input
                        containerStyle={styles.fieldCol}
                        label="Premature count"
                        value={profile.prematureCount.toString()}
                        onChangeText={(txt) => setProfile({ ...profile, prematureCount: parseInt(txt, 10) || 0 })}
                        keyboardType="numeric"
                      />
                      <Input
                        containerStyle={styles.fieldCol}
                        label="Abortion count"
                        value={profile.abortionCount.toString()}
                        onChangeText={(txt) => setProfile({ ...profile, abortionCount: parseInt(txt, 10) || 0 })}
                        keyboardType="numeric"
                      />
                      <Input
                        containerStyle={styles.fieldCol}
                        label="Living children count"
                        value={profile.livingChildrenCount.toString()}
                        onChangeText={(txt) => setProfile({ ...profile, livingChildrenCount: parseInt(txt, 10) || 0 })}
                        keyboardType="numeric"
                      />
                      <View style={styles.fieldCol}>
                        <FieldLabel>Pregnancy-induced hypertension / pre-eclampsia?</FieldLabel>
                        <YesNo
                          value={!!profile.preEclampsiaHypertension}
                          onChange={(v) => setProfile({ ...profile, preEclampsiaHypertension: v })}
                        />
                      </View>
                    </View>
                  </>
                ) : (
                  <View style={styles.noticeBox}>
                    <ThemedText variant="body" color={theme.colors.textMuted}>
                      Obstetric history is marked not applicable (N). It will be left blank in PhilHealth transmissions.
                    </ThemedText>
                  </View>
                )}
              </>
            )}
          </View>
        )}

        {/* TAB 5: PhilPEN 24 questions */}
        {activeTab === 'ncd' && (
          <View>
            <SectionTitle>PhilPEN non-communicable disease risk assessment</SectionTitle>
            <Helper>PhilHealth standard 24 questions for cardiovascular and metabolic risk profiling.</Helper>

            {NCD_QUESTIONS.map((item) => {
              const ans = profile.ncdAnswers[item.id] || 'N';
              return (
                <View key={item.id} style={styles.ncdRow}>
                  <ThemedText variant="small" color={theme.colors.textSecondary} style={styles.ncdText}>
                    {item.q}
                  </ThemedText>
                  <View style={styles.chipRow}>
                    <Chip
                      label="No"
                      tone="success"
                      active={ans === 'N'}
                      onPress={() =>
                        setProfile({
                          ...profile,
                          ncdAnswers: { ...profile.ncdAnswers, [item.id]: 'N' },
                        })
                      }
                    />
                    <Chip
                      label="Yes"
                      tone="warning"
                      active={ans === 'Y'}
                      onPress={() =>
                        setProfile({
                          ...profile,
                          ncdAnswers: { ...profile.ncdAnswers, [item.id]: 'Y' },
                        })
                      }
                    />
                  </View>
                </View>
              );
            })}
          </View>
        )}
      </>
    );
  };

  return (
    <Modal
      visible={visible}
      onClose={onClose}
      title="PhilHealth patient profile"
      subtitle={`${patient.fullName} · ${patient.gender} · ${patient.age} yrs · PIN: ${patient.philHealthNumber || 'Not enlisted'}`}
      maxWidth={900}
      maxHeight="92%"
      footer={
        <View style={styles.footerBar}>
          <Button title="Cancel" variant="ghost" onPress={onClose} disabled={saving} />
          <Button
            title="Save profile"
            onPress={handleSave}
            loading={saving}
            disabled={saving || loading || !profile}
          />
        </View>
      }
    >
      {/* Tab navigation */}
      <View style={styles.tabBar}>
        {TABS.map((tab) => {
          const isActive = activeTab === tab.key;
          return (
            <Pressable
              key={tab.key}
              onPress={() => setActiveTab(tab.key)}
              accessibilityRole="tab"
              accessibilityState={{ selected: isActive }}
              style={[styles.tabItem, isActive && styles.tabItemActive]}
            >
              <ThemedText
                variant={isActive ? 'smallBold' : 'small'}
                color={isActive ? theme.colors.primary : theme.colors.textMuted}
              >
                {tab.label}
              </ThemedText>
            </Pressable>
          );
        })}
      </View>

      {renderBody()}
    </Modal>
  );
}

const styles = StyleSheet.create({
  footerBar: {
    flexDirection: 'row',
    justifyContent: 'flex-end',
    alignItems: 'center',
    gap: theme.spacing.sm,
  },
  tabBar: {
    flexDirection: 'row',
    flexWrap: 'wrap',
    gap: theme.spacing.xs,
    borderBottomWidth: theme.sizes.borderWidth,
    borderBottomColor: theme.colors.border,
  },
  tabItem: {
    paddingVertical: theme.spacing.md,
    paddingHorizontal: theme.spacing.lg,
    borderBottomWidth: 2,
    borderBottomColor: theme.colors.transparent,
  },
  tabItemActive: {
    borderBottomColor: theme.colors.primary,
  },
  sectionTitle: {
    marginBottom: theme.spacing.sm,
  },
  sectionTitleSpaced: {
    marginTop: theme.spacing['2xl'],
    marginBottom: theme.spacing.sm,
  },
  helperText: {
    marginBottom: theme.spacing.md,
  },
  subSection: {
    marginBottom: theme.spacing.lg,
  },
  subHeading: {
    marginBottom: theme.spacing.sm,
  },
  formRow: {
    flexDirection: 'row',
    flexWrap: 'wrap',
    gap: theme.spacing.lg,
    marginBottom: theme.spacing.md,
  },
  fieldCol: {
    flex: 1,
    minWidth: 180,
    gap: theme.spacing.xs,
  },
  fieldLabel: {
    marginBottom: theme.spacing.xs,
  },
  chipRow: {
    flexDirection: 'row',
    flexWrap: 'wrap',
    gap: theme.spacing.sm,
  },
  chip: {
    flexDirection: 'row',
    alignItems: 'center',
    gap: theme.spacing.xs,
    paddingHorizontal: theme.spacing.md,
    paddingVertical: theme.spacing.sm,
    borderRadius: theme.radii.md,
    backgroundColor: theme.colors.surface,
    borderWidth: theme.sizes.borderWidth,
    borderColor: theme.colors.borderDark,
  },
  chipPrimary: {
    backgroundColor: theme.colors.primaryLight,
    borderColor: theme.colors.primary,
  },
  chipSuccess: {
    backgroundColor: theme.colors.successBg,
    borderColor: theme.colors.success,
  },
  chipWarning: {
    backgroundColor: theme.colors.warningBg,
    borderColor: theme.colors.warning,
  },
  conditionsWrap: {
    flexDirection: 'row',
    flexWrap: 'wrap',
    gap: theme.spacing.sm,
  },
  organsGrid: {
    gap: theme.spacing.xs,
  },
  organRow: {
    flexDirection: 'row',
    flexWrap: 'wrap',
    justifyContent: 'space-between',
    alignItems: 'center',
    gap: theme.spacing.sm,
    paddingVertical: theme.spacing.sm,
    borderBottomWidth: theme.sizes.borderWidth,
    borderBottomColor: theme.colors.borderLight,
  },
  pediatricBanner: {
    backgroundColor: theme.colors.infoBg,
    padding: theme.spacing.lg,
    borderRadius: theme.radii.lg,
    borderColor: theme.colors.infoBorder,
    borderWidth: theme.sizes.borderWidth,
  },
  noticeBox: {
    backgroundColor: theme.colors.surfaceMuted,
    padding: theme.spacing.lg,
    borderRadius: theme.radii.lg,
    borderColor: theme.colors.border,
    borderWidth: theme.sizes.borderWidth,
    gap: theme.spacing.xs,
    marginBottom: theme.spacing.lg,
  },
  behavioralGrid: {
    gap: theme.spacing.lg,
  },
  behavioralRow: {
    flexDirection: 'row',
    flexWrap: 'wrap',
    justifyContent: 'space-between',
    alignItems: 'center',
    gap: theme.spacing.sm,
  },
  toggleHeader: {
    flexDirection: 'row',
    flexWrap: 'wrap',
    justifyContent: 'space-between',
    alignItems: 'center',
    gap: theme.spacing.md,
    marginBottom: theme.spacing.md,
  },
  toggleHeaderSpaced: {
    marginTop: theme.spacing['2xl'],
  },
  toggleHeaderText: {
    flex: 1,
    minWidth: 240,
  },
  ncdRow: {
    flexDirection: 'row',
    flexWrap: 'wrap',
    justifyContent: 'space-between',
    alignItems: 'center',
    gap: theme.spacing.md,
    paddingVertical: theme.spacing.md,
    borderBottomWidth: theme.sizes.borderWidth,
    borderBottomColor: theme.colors.borderLight,
  },
  ncdText: {
    flex: 1,
    minWidth: 240,
  },
  sponsorCard: {
    backgroundColor: theme.colors.successBg,
    borderWidth: theme.sizes.borderWidth,
    borderColor: theme.colors.successBorder,
    borderRadius: theme.radii.lg,
    padding: theme.spacing.lg,
    gap: theme.spacing.sm,
    marginBottom: theme.spacing.lg,
  },
  sponsorHeader: {
    flexDirection: 'row',
    alignItems: 'center',
    gap: theme.spacing.sm,
  },
});
