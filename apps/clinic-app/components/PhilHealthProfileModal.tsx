import React, { useState, useEffect } from 'react';
import {
  View,
  StyleSheet,
  ScrollView,
  Modal,
  Pressable,
  TextInput,
  ActivityIndicator,
  Alert,
} from 'react-native';
import ThemedText from './ui/ThemedText';
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

export default function PhilHealthProfileModal({
  visible,
  onClose,
  patient,
  onSaved,
}: PhilHealthProfileModalProps) {
  const [activeTab, setActiveTab] = useState<TabType>('general');
  const [loading, setLoading] = useState(false);
  const [saving, setSaving] = useState(false);
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
    try {
      const [data, err] = await clinicService.getPhilHealthPatientProfile(patientId);
      if (data) {
        setProfile(data);
      } else {
        Alert.alert('Notice', err?.message || 'Unable to load PhilHealth profile. Initializing defaults.');
      }
    } catch (err: any) {
      console.error('Failed to load profile:', err);
      Alert.alert('Error', err?.message || 'Failed to fetch PhilHealth profile.');
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
        Alert.alert('Success', 'PhilHealth Patient Profile saved successfully (Offline & Standalone Ready).');
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

  return (
    <Modal visible={visible} transparent animationType="slide">
      <View style={styles.modalOverlay}>
        <View style={styles.modalContainer}>
          {/* Header */}
          <View style={styles.headerBar}>
            <View>
              <View style={styles.titleRow}>
                <ThemedText style={styles.titleText}>PhilHealth Patient Profile</ThemedText>
                <ThemedText style={styles.trancheBadge}>Tranche 1 & 2 Tagging Ready</ThemedText>
              </View>
              <ThemedText style={styles.patientSubText}>
                {patient.fullName} • {patient.gender} • {patient.age} yrs • PIN: {patient.philHealthNumber || 'Not Enlisted'}
              </ThemedText>
            </View>
            <Pressable onPress={onClose} style={styles.closeBtn}>
              <ThemedText style={styles.closeBtnText}>✕</ThemedText>
            </Pressable>
          </View>

          {/* Tab Navigation */}
          <View style={styles.tabBar}>
            <Pressable
              onPress={() => setActiveTab('general')}
              style={[styles.tabItem, activeTab === 'general' && styles.tabItemActive]}
            >
              <ThemedText style={[styles.tabText, activeTab === 'general' && styles.tabTextActive]}>
                General & Vitals
              </ThemedText>
            </Pressable>
            <Pressable
              onPress={() => setActiveTab('medical')}
              style={[styles.tabItem, activeTab === 'medical' && styles.tabItemActive]}
            >
              <ThemedText style={[styles.tabText, activeTab === 'medical' && styles.tabTextActive]}>
                Medical & Family
              </ThemedText>
            </Pressable>
            <Pressable
              onPress={() => setActiveTab('lifestyle')}
              style={[styles.tabItem, activeTab === 'lifestyle' && styles.tabItemActive]}
            >
              <ThemedText style={[styles.tabText, activeTab === 'lifestyle' && styles.tabTextActive]}>
                Social & Vaccines
              </ThemedText>
            </Pressable>
            <Pressable
              onPress={() => setActiveTab('reproductive')}
              style={[styles.tabItem, activeTab === 'reproductive' && styles.tabItemActive]}
            >
              <ThemedText style={[styles.tabText, activeTab === 'reproductive' && styles.tabTextActive]}>
                Women's Health
              </ThemedText>
            </Pressable>
            <Pressable
              onPress={() => setActiveTab('ncd')}
              style={[styles.tabItem, activeTab === 'ncd' && styles.tabItemActive]}
            >
              <ThemedText style={[styles.tabText, activeTab === 'ncd' && styles.tabTextActive]}>
                PhilPEN (24)
              </ThemedText>
            </Pressable>
          </View>

          {loading || !profile ? (
            <View style={styles.loadingContainer}>
              <ActivityIndicator size="large" color="#0284C7" />
              <ThemedText style={styles.loadingText}>Loading PhilHealth clinical profile...</ThemedText>
            </View>
          ) : (
            <ScrollView style={styles.scrollArea} contentContainerStyle={styles.scrollContent}>
              {/* TAB 1: General & Vitals */}
              {activeTab === 'general' && (
                <View style={styles.sectionCard}>
                  <ThemedText style={styles.sectionTitle}>Identification & Registration</ThemedText>
                  <View style={styles.formRow}>
                    <View style={styles.fieldCol}>
                      <ThemedText style={styles.label}>PhilHealth Identification No. (PIN)</ThemedText>
                      <TextInput
                        style={styles.input}
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
                    </View>
                    <View style={styles.fieldCol}>
                      <ThemedText style={styles.label}>Member Type</ThemedText>
                      <View style={styles.chipRow}>
                        <Pressable
                          onPress={() =>
                            setProfile({
                              ...profile,
                              memberType: 'MM',
                              memberPin: profile.pin || '',
                            })
                          }
                          style={[styles.chip, profile.memberType === 'MM' && styles.chipActive]}
                        >
                          <ThemedText style={profile.memberType === 'MM' ? styles.chipTextActive : styles.chipText}>
                            Member (MM)
                          </ThemedText>
                        </Pressable>
                        <Pressable
                          onPress={() =>
                            setProfile({
                              ...profile,
                              memberType: 'DD',
                              memberLastName: profile.memberLastName || patient?.lastName || '',
                              dependentRelationship: profile.dependentRelationship || (isPediatric ? 'C' : 'S'),
                            })
                          }
                          style={[styles.chip, profile.memberType === 'DD' && styles.chipActive]}
                        >
                          <ThemedText style={profile.memberType === 'DD' ? styles.chipTextActive : styles.chipText}>
                            Dependent (DD)
                          </ThemedText>
                        </Pressable>
                      </View>
                    </View>
                    <View style={styles.fieldCol}>
                      <ThemedText style={styles.label}>Blood Type</ThemedText>
                      <TextInput
                        style={styles.input}
                        value={profile.bloodType || 'O+'}
                        onChangeText={(txt) => setProfile({ ...profile, bloodType: txt })}
                        placeholder="e.g. O+, A+, B+"
                      />
                    </View>
                  </View>

                  {profile.memberType === 'DD' && (
                    <View style={styles.sponsorCard}>
                      <View style={styles.sponsorHeader}>
                        <ThemedText style={styles.sponsorBadge}>SPONSOR</ThemedText>
                        <ThemedText style={styles.sponsorTitle}>Principal Member / Sponsor Credentials</ThemedText>
                      </View>
                      <ThemedText style={styles.sponsorSubtitle}>
                        Required for PhilHealth Konsulta dependent claim transmittal. Enter the sponsoring Principal Member's legal details.
                      </ThemedText>

                      <View style={[styles.formRow, { marginTop: 12 }]}>
                        <View style={styles.fieldCol}>
                          <ThemedText style={styles.label}>Principal Member PIN *</ThemedText>
                          <TextInput
                            style={styles.input}
                            value={profile.memberPin || ''}
                            onChangeText={(txt) => setProfile({ ...profile, memberPin: txt })}
                            placeholder="12-digit Sponsor PIN"
                            keyboardType="numeric"
                          />
                        </View>
                        <View style={styles.fieldCol}>
                          <ThemedText style={styles.label}>Relationship to Principal Member *</ThemedText>
                          <View style={styles.chipRow}>
                            {[
                              { label: 'Child (C)', value: 'C' },
                              { label: 'Spouse (S)', value: 'S' },
                              { label: 'Parent (P)', value: 'P' },
                              { label: 'Disabled (D)', value: 'D' },
                            ].map((rel) => (
                              <Pressable
                                key={rel.value}
                                onPress={() => setProfile({ ...profile, dependentRelationship: rel.value })}
                                style={[
                                  styles.chip,
                                  profile.dependentRelationship === rel.value && styles.chipActive,
                                ]}
                              >
                                <ThemedText
                                  style={
                                    profile.dependentRelationship === rel.value
                                      ? styles.chipTextActive
                                      : styles.chipText
                                  }
                                >
                                  {rel.label}
                                </ThemedText>
                              </Pressable>
                            ))}
                          </View>
                        </View>
                      </View>

                      <View style={[styles.formRow, { marginTop: 12 }]}>
                        <View style={styles.fieldCol}>
                          <ThemedText style={styles.label}>Member Last Name *</ThemedText>
                          <TextInput
                            style={styles.input}
                            value={profile.memberLastName || ''}
                            onChangeText={(txt) => setProfile({ ...profile, memberLastName: txt })}
                            placeholder="Last Name"
                          />
                        </View>
                        <View style={styles.fieldCol}>
                          <ThemedText style={styles.label}>Member First Name *</ThemedText>
                          <TextInput
                            style={styles.input}
                            value={profile.memberFirstName || ''}
                            onChangeText={(txt) => setProfile({ ...profile, memberFirstName: txt })}
                            placeholder="First Name"
                          />
                        </View>
                        <View style={styles.fieldCol}>
                          <ThemedText style={styles.label}>Middle Name</ThemedText>
                          <TextInput
                            style={styles.input}
                            value={profile.memberMiddleName || ''}
                            onChangeText={(txt) => setProfile({ ...profile, memberMiddleName: txt })}
                            placeholder="Middle Name"
                          />
                        </View>
                      </View>

                      <View style={[styles.formRow, { marginTop: 12 }]}>
                        <View style={styles.fieldCol}>
                          <ThemedText style={styles.label}>Member Suffix</ThemedText>
                          <TextInput
                            style={styles.input}
                            value={profile.memberSuffix || ''}
                            onChangeText={(txt) => setProfile({ ...profile, memberSuffix: txt })}
                            placeholder="e.g. Jr, Sr, III"
                          />
                        </View>
                        <View style={styles.fieldCol}>
                          <ThemedText style={styles.label}>Member Date of Birth (YYYY-MM-DD) *</ThemedText>
                          <TextInput
                            style={styles.input}
                            value={profile.memberBirthDate || ''}
                            onChangeText={(txt) => setProfile({ ...profile, memberBirthDate: txt })}
                            placeholder="YYYY-MM-DD"
                          />
                        </View>
                      </View>
                    </View>
                  )}

                  <ThemedText style={[styles.sectionTitle, { marginTop: 20 }]}>
                    Vitals & Anthropometrics {isPediatric ? '(Pediatric Protocol)' : '(Adult Protocol)'}
                  </ThemedText>
                  <View style={styles.formRow}>
                    <View style={styles.fieldCol}>
                      <ThemedText style={styles.label}>BP Systolic (mmHg)</ThemedText>
                      <TextInput
                        style={styles.input}
                        value={profile.systolic || ''}
                        onChangeText={(txt) => setProfile({ ...profile, systolic: txt })}
                        keyboardType="numeric"
                      />
                    </View>
                    <View style={styles.fieldCol}>
                      <ThemedText style={styles.label}>BP Diastolic (mmHg)</ThemedText>
                      <TextInput
                        style={styles.input}
                        value={profile.diastolic || ''}
                        onChangeText={(txt) => setProfile({ ...profile, diastolic: txt })}
                        keyboardType="numeric"
                      />
                    </View>
                    <View style={styles.fieldCol}>
                      <ThemedText style={styles.label}>Heart Rate (bpm)</ThemedText>
                      <TextInput
                        style={styles.input}
                        value={profile.heartRate || ''}
                        onChangeText={(txt) => setProfile({ ...profile, heartRate: txt })}
                        keyboardType="numeric"
                      />
                    </View>
                    <View style={styles.fieldCol}>
                      <ThemedText style={styles.label}>Temp (°C)</ThemedText>
                      <TextInput
                        style={styles.input}
                        value={profile.temperature || ''}
                        onChangeText={(txt) => setProfile({ ...profile, temperature: txt })}
                        keyboardType="numeric"
                      />
                    </View>
                  </View>

                  <View style={styles.formRow}>
                    <View style={styles.fieldCol}>
                      <ThemedText style={styles.label}>Height / Length (cm)</ThemedText>
                      <TextInput
                        style={styles.input}
                        value={profile.heightCm || ''}
                        onChangeText={(txt) => setProfile({ ...profile, heightCm: txt })}
                        keyboardType="numeric"
                      />
                    </View>
                    <View style={styles.fieldCol}>
                      <ThemedText style={styles.label}>Weight (kg)</ThemedText>
                      <TextInput
                        style={styles.input}
                        value={profile.weightKg || ''}
                        onChangeText={(txt) => setProfile({ ...profile, weightKg: txt })}
                        keyboardType="numeric"
                      />
                    </View>
                    {!isPediatric ? (
                      <>
                        <View style={styles.fieldCol}>
                          <ThemedText style={styles.label}>Waist Circ (cm)</ThemedText>
                          <TextInput
                            style={styles.input}
                            value={profile.waistCm || ''}
                            onChangeText={(txt) => setProfile({ ...profile, waistCm: txt })}
                            keyboardType="numeric"
                          />
                        </View>
                        <View style={styles.fieldCol}>
                          <ThemedText style={styles.label}>Hip Circ (cm)</ThemedText>
                          <TextInput
                            style={styles.input}
                            value={profile.hipCm || ''}
                            onChangeText={(txt) => setProfile({ ...profile, hipCm: txt })}
                            keyboardType="numeric"
                          />
                        </View>
                      </>
                    ) : (
                      <>
                        <View style={styles.fieldCol}>
                          <ThemedText style={styles.label}>Head Circ (cm)</ThemedText>
                          <TextInput
                            style={styles.input}
                            value={profile.headCircCm || ''}
                            onChangeText={(txt) => setProfile({ ...profile, headCircCm: txt })}
                            keyboardType="numeric"
                          />
                        </View>
                        <View style={styles.fieldCol}>
                          <ThemedText style={styles.label}>MUAC (cm)</ThemedText>
                          <TextInput
                            style={styles.input}
                            value={profile.muacCm || ''}
                            onChangeText={(txt) => setProfile({ ...profile, muacCm: txt })}
                            keyboardType="numeric"
                          />
                        </View>
                      </>
                    )}
                  </View>

                  <ThemedText style={[styles.sectionTitle, { marginTop: 20 }]}>Organ Systems Examination</ThemedText>
                  <View style={styles.organsGrid}>
                    {[
                      { key: 'skinId', remKey: 'skinRemarks', label: 'Skin' },
                      { key: 'heentId', remKey: 'heentRemarks', label: 'HEENT' },
                      { key: 'chestId', remKey: 'chestRemarks', label: 'Chest / Lungs' },
                      { key: 'heartId', remKey: 'heartRemarks', label: 'Heart' },
                      { key: 'abdomenId', remKey: 'abdomenRemarks', label: 'Abdomen' },
                      { key: 'neuroId', remKey: 'neuroRemarks', label: 'Neurological' },
                      { key: 'guId', remKey: 'guRemarks', label: 'Genitourinary' },
                      { key: 'rectalId', remKey: 'rectalRemarks', label: 'Rectal' },
                    ].map((item) => {
                      const isNorm = (profile as any)[item.key] === '1';
                      return (
                        <View key={item.key} style={styles.organRow}>
                          <ThemedText style={styles.organLabel}>{item.label}</ThemedText>
                          <View style={styles.organControls}>
                            <Pressable
                              onPress={() => setProfile({ ...profile, [item.key]: '1' })}
                              style={[styles.smallChip, isNorm && styles.smallChipGreen]}
                            >
                              <ThemedText style={isNorm ? styles.smallChipTextActive : styles.smallChipText}>
                                Normal (1)
                              </ThemedText>
                            </Pressable>
                            <Pressable
                              onPress={() => setProfile({ ...profile, [item.key]: '2' })}
                              style={[styles.smallChip, !isNorm && styles.smallChipAmber]}
                            >
                              <ThemedText style={!isNorm ? styles.smallChipTextActive : styles.smallChipText}>
                                Findings (2)
                              </ThemedText>
                            </Pressable>
                          </View>
                        </View>
                      );
                    })}
                  </View>
                </View>
              )}

              {/* TAB 2: Medical & Family */}
              {activeTab === 'medical' && (
                <View style={styles.sectionCard}>
                  <ThemedText style={styles.sectionTitle}>Past Medical History (Personal)</ThemedText>
                  <ThemedText style={styles.helperText}>
                    Select documented non-communicable and chronic diseases for the patient:
                  </ThemedText>
                  <View style={styles.conditionsWrap}>
                    {[
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
                    ].map((c) => {
                      const active = profile.medicalHistories.some((m) => m.code === c.code);
                      return (
                        <Pressable
                          key={c.code}
                          onPress={() => toggleCondition(c.code, c.desc)}
                          style={[styles.conditionChip, active && styles.conditionChipActive]}
                        >
                          <ThemedText style={active ? styles.conditionChipTextActive : styles.conditionChipText}>
                            {active ? '✓ ' : '+ '}
                            {c.desc}
                          </ThemedText>
                        </Pressable>
                      );
                    })}
                  </View>

                  <ThemedText style={[styles.sectionTitle, { marginTop: 24 }]}>Family Medical History</ThemedText>
                  <ThemedText style={styles.helperText}>Hereditary and familial risk factors:</ThemedText>
                  <View style={styles.conditionsWrap}>
                    {[
                      { code: '011', desc: 'Hypertension' },
                      { code: '006', desc: 'Diabetes Mellitus' },
                      { code: '003', desc: 'Cancer' },
                      { code: '004', desc: 'Stroke' },
                      { code: '005', desc: 'Heart Disease' },
                      { code: '002', desc: 'Asthma' },
                    ].map((c) => {
                      const active = profile.familyHistories.some((m) => m.code === c.code);
                      return (
                        <Pressable
                          key={`fam-${c.code}`}
                          onPress={() => toggleFamilyCondition(c.code, c.desc)}
                          style={[styles.conditionChip, active && styles.conditionChipActive]}
                        >
                          <ThemedText style={active ? styles.conditionChipTextActive : styles.conditionChipText}>
                            {active ? '✓ ' : '+ '}
                            {c.desc}
                          </ThemedText>
                        </Pressable>
                      );
                    })}
                  </View>
                </View>
              )}

              {/* TAB 3: Social & Vaccines */}
              {activeTab === 'lifestyle' && (
                <View style={styles.sectionCard}>
                  <ThemedText style={styles.sectionTitle}>Social & Behavioral History</ThemedText>
                  {isPediatric ? (
                    <View style={styles.pediatricBanner}>
                      <ThemedText style={styles.bannerText}>
                        👶 Pediatric patient ({age} yrs): Behavioral factors (smoking, alcohol, substance use) are
                        preset to non-applicable / non-user per PhilHealth protocol.
                      </ThemedText>
                    </View>
                  ) : (
                    <View style={styles.behavioralGrid}>
                      <View style={styles.behavioralRow}>
                        <ThemedText style={styles.label}>Tobacco / Cigarette Smoker?</ThemedText>
                        <View style={styles.chipRow}>
                          <Pressable
                            onPress={() => setProfile({ ...profile, isSmoker: false })}
                            style={[styles.chip, !profile.isSmoker && styles.chipActive]}
                          >
                            <ThemedText style={!profile.isSmoker ? styles.chipTextActive : styles.chipText}>No</ThemedText>
                          </Pressable>
                          <Pressable
                            onPress={() => setProfile({ ...profile, isSmoker: true })}
                            style={[styles.chip, profile.isSmoker && styles.chipActive]}
                          >
                            <ThemedText style={profile.isSmoker ? styles.chipTextActive : styles.chipText}>Yes</ThemedText>
                          </Pressable>
                        </View>
                      </View>

                      <View style={styles.behavioralRow}>
                        <ThemedText style={styles.label}>Alcohol Drinker?</ThemedText>
                        <View style={styles.chipRow}>
                          <Pressable
                            onPress={() => setProfile({ ...profile, isAlcoholDrinker: false })}
                            style={[styles.chip, !profile.isAlcoholDrinker && styles.chipActive]}
                          >
                            <ThemedText style={!profile.isAlcoholDrinker ? styles.chipTextActive : styles.chipText}>No</ThemedText>
                          </Pressable>
                          <Pressable
                            onPress={() => setProfile({ ...profile, isAlcoholDrinker: true })}
                            style={[styles.chip, profile.isAlcoholDrinker && styles.chipActive]}
                          >
                            <ThemedText style={profile.isAlcoholDrinker ? styles.chipTextActive : styles.chipText}>Yes</ThemedText>
                          </Pressable>
                        </View>
                      </View>
                    </View>
                  )}

                  <ThemedText style={[styles.sectionTitle, { marginTop: 24 }]}>Immunizations (Vaccines)</ThemedText>
                  {isPediatric && (
                    <View style={{ marginBottom: 16 }}>
                      <ThemedText style={styles.subHeading}>Child Vaccines (EPI)</ThemedText>
                      <View style={styles.conditionsWrap}>
                        {['BCG', 'DPT', 'OPV', 'MEASLES', 'HEPB', 'HIB', 'ROTA', 'PCV'].map((v) => {
                          const active = profile.childImmunizations.includes(v);
                          return (
                            <Pressable
                              key={v}
                              onPress={() => toggleImmunization('child', v)}
                              style={[styles.conditionChip, active && styles.conditionChipActive]}
                            >
                              <ThemedText style={active ? styles.conditionChipTextActive : styles.conditionChipText}>
                                {active ? '✓ ' : '+ '}
                                {v}
                              </ThemedText>
                            </Pressable>
                          );
                        })}
                      </View>
                    </View>
                  )}

                  {isFemale && age >= 10 && age <= 49 && (
                    <View style={{ marginBottom: 16 }}>
                      <ThemedText style={styles.subHeading}>Young Woman Vaccines (HPV / Rubella)</ThemedText>
                      <View style={styles.conditionsWrap}>
                        {['HPV', 'RUBELLA'].map((v) => {
                          const active = profile.youngWomanImmunizations.includes(v);
                          return (
                            <Pressable
                              key={v}
                              onPress={() => toggleImmunization('youngWoman', v)}
                              style={[styles.conditionChip, active && styles.conditionChipActive]}
                            >
                              <ThemedText style={active ? styles.conditionChipTextActive : styles.conditionChipText}>
                                {active ? '✓ ' : '+ '}
                                {v}
                              </ThemedText>
                            </Pressable>
                          );
                        })}
                      </View>
                    </View>
                  )}

                  {isSenior && (
                    <View style={{ marginBottom: 16 }}>
                      <ThemedText style={styles.subHeading}>Senior Citizen Vaccines</ThemedText>
                      <View style={styles.conditionsWrap}>
                        {['FLU', 'PNEUM'].map((v) => {
                          const active = profile.elderlyImmunizations.includes(v);
                          return (
                            <Pressable
                              key={v}
                              onPress={() => toggleImmunization('elderly', v)}
                              style={[styles.conditionChip, active && styles.conditionChipActive]}
                            >
                              <ThemedText style={active ? styles.conditionChipTextActive : styles.conditionChipText}>
                                {active ? '✓ ' : '+ '}
                                {v}
                              </ThemedText>
                            </Pressable>
                          );
                        })}
                      </View>
                    </View>
                  )}
                </View>
              )}

              {/* TAB 4: Reproductive (Women's Health) */}
              {activeTab === 'reproductive' && (
                <View style={styles.sectionCard}>
                  {!isFemale ? (
                    <View style={styles.maleNoticeBox}>
                      <ThemedText style={styles.maleNoticeTitle}>Not Applicable</ThemedText>
                      <ThemedText style={styles.maleNoticeText}>
                        Menstrual and obstetric history is strictly not applicable for male patients. In PhilHealth PKA
                        XML transmissions, these elements are automatically flagged with `pIsApplicable="N"` and zeroed
                        counts to ensure schema validity.
                      </ThemedText>
                    </View>
                  ) : (
                    <>
                      <View style={{ flexDirection: 'row', justifyContent: 'space-between', alignItems: 'center', marginBottom: 12 }}>
                        <View style={{ flex: 1, paddingRight: 12 }}>
                          <ThemedText style={styles.sectionTitle}>Menstrual History</ThemedText>
                          <ThemedText style={styles.helperText}>
                            Record observed menstrual history. Overwritable if not applicable.
                          </ThemedText>
                        </View>
                        <View style={styles.chipRow}>
                          <Pressable
                            onPress={() => setProfile({ ...profile, menstrualApplicable: false })}
                            style={[styles.chip, !profile.menstrualApplicable && styles.chipActive]}
                          >
                            <ThemedText style={!profile.menstrualApplicable ? styles.chipTextActive : styles.chipText}>
                              Not Applicable (N)
                            </ThemedText>
                          </Pressable>
                          <Pressable
                            onPress={() => setProfile({ ...profile, menstrualApplicable: true })}
                            style={[styles.chip, profile.menstrualApplicable && styles.chipActive]}
                          >
                            <ThemedText style={profile.menstrualApplicable ? styles.chipTextActive : styles.chipText}>
                              Applicable (Y)
                            </ThemedText>
                          </Pressable>
                        </View>
                      </View>

                      {profile.menstrualApplicable ? (
                        <View style={styles.formRow}>
                          <View style={styles.fieldCol}>
                            <ThemedText style={styles.label}>Menarche Age (yrs)</ThemedText>
                            <TextInput
                              style={styles.input}
                              value={profile.menarcheAge || ''}
                              onChangeText={(txt) => setProfile({ ...profile, menarcheAge: txt, menstrualApplicable: true })}
                              placeholder="Age in yrs"
                              keyboardType="numeric"
                            />
                          </View>
                          <View style={styles.fieldCol}>
                            <ThemedText style={styles.label}>LMP Date (YYYY-MM-DD)</ThemedText>
                            <TextInput
                              style={styles.input}
                              value={profile.lastMensPeriod || ''}
                              onChangeText={(txt) => setProfile({ ...profile, lastMensPeriod: txt, menstrualApplicable: true })}
                              placeholder="e.g. 2026-09-15"
                            />
                          </View>
                          <View style={styles.fieldCol}>
                            <ThemedText style={styles.label}>Duration (Days)</ThemedText>
                            <TextInput
                              style={styles.input}
                              value={profile.periodDurationDays || ''}
                              onChangeText={(txt) => setProfile({ ...profile, periodDurationDays: txt })}
                              placeholder="Days"
                              keyboardType="numeric"
                            />
                          </View>
                          <View style={styles.fieldCol}>
                            <ThemedText style={styles.label}>Cycle Interval (Days)</ThemedText>
                            <TextInput
                              style={styles.input}
                              value={profile.cycleIntervalDays || ''}
                              onChangeText={(txt) => setProfile({ ...profile, cycleIntervalDays: txt })}
                              placeholder="Days"
                              keyboardType="numeric"
                            />
                          </View>
                        </View>
                      ) : (
                        <View style={[styles.maleNoticeBox, { marginTop: 0, marginBottom: 16 }]}>
                          <ThemedText style={styles.maleNoticeText}>
                            Menstrual history marked as Not Applicable (N). Will be output as blank in PhilHealth DTD transmissions.
                          </ThemedText>
                        </View>
                      )}

                      <View style={{ flexDirection: 'row', justifyContent: 'space-between', alignItems: 'center', marginTop: 24, marginBottom: 12 }}>
                        <View style={{ flex: 1, paddingRight: 12 }}>
                          <ThemedText style={styles.sectionTitle}>Obstetric History (Pregnancies)</ThemedText>
                          <ThemedText style={styles.helperText}>
                            Record obstetric history if applicable. Overwritable for adolescent or adult patients.
                          </ThemedText>
                        </View>
                        <View style={styles.chipRow}>
                          <Pressable
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
                            style={[styles.chip, !profile.pregnancyApplicable && styles.chipActive]}
                          >
                            <ThemedText style={!profile.pregnancyApplicable ? styles.chipTextActive : styles.chipText}>
                              Not Applicable (N)
                            </ThemedText>
                          </Pressable>
                          <Pressable
                            onPress={() =>
                              setProfile({
                                ...profile,
                                pregnancyApplicable: true,
                                gravida: profile.gravida > 0 ? profile.gravida : 1,
                              })
                            }
                            style={[styles.chip, profile.pregnancyApplicable && styles.chipActive]}
                          >
                            <ThemedText style={profile.pregnancyApplicable ? styles.chipTextActive : styles.chipText}>
                              Applicable (Y)
                            </ThemedText>
                          </Pressable>
                        </View>
                      </View>

                      {profile.pregnancyApplicable ? (
                        <>
                          <View style={styles.formRow}>
                            <View style={styles.fieldCol}>
                              <ThemedText style={styles.label}>Gravida (Total Pregnancies)</ThemedText>
                              <TextInput
                                style={styles.input}
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
                            </View>
                            <View style={styles.fieldCol}>
                              <ThemedText style={styles.label}>Para (Total Deliveries)</ThemedText>
                              <TextInput
                                style={styles.input}
                                value={profile.para.toString()}
                                onChangeText={(txt) => setProfile({ ...profile, para: parseInt(txt, 10) || 0 })}
                                keyboardType="numeric"
                              />
                            </View>
                            <View style={styles.fieldCol}>
                              <ThemedText style={styles.label}>Delivery Type</ThemedText>
                              <View style={styles.chipRow}>
                                <Pressable
                                  onPress={() => setProfile({ ...profile, deliveryType: 'V' })}
                                  style={[styles.chip, (profile.deliveryType || 'V') === 'V' && styles.chipActive]}
                                >
                                  <ThemedText style={(profile.deliveryType || 'V') === 'V' ? styles.chipTextActive : styles.chipText}>
                                    Vaginal (V)
                                  </ThemedText>
                                </Pressable>
                                <Pressable
                                  onPress={() => setProfile({ ...profile, deliveryType: 'C' })}
                                  style={[styles.chip, profile.deliveryType === 'C' && styles.chipActive]}
                                >
                                  <ThemedText style={profile.deliveryType === 'C' ? styles.chipTextActive : styles.chipText}>
                                    Cesarean (C)
                                  </ThemedText>
                                </Pressable>
                              </View>
                            </View>
                            <View style={styles.fieldCol}>
                              <ThemedText style={styles.label}>Full-Term Deliveries</ThemedText>
                              <TextInput
                                style={styles.input}
                                value={profile.fullTermCount.toString()}
                                onChangeText={(txt) => setProfile({ ...profile, fullTermCount: parseInt(txt, 10) || 0 })}
                                keyboardType="numeric"
                              />
                            </View>
                          </View>

                          <View style={styles.formRow}>
                            <View style={styles.fieldCol}>
                              <ThemedText style={styles.label}>Premature Count</ThemedText>
                              <TextInput
                                style={styles.input}
                                value={profile.prematureCount.toString()}
                                onChangeText={(txt) => setProfile({ ...profile, prematureCount: parseInt(txt, 10) || 0 })}
                                keyboardType="numeric"
                              />
                            </View>
                            <View style={styles.fieldCol}>
                              <ThemedText style={styles.label}>Abortion Count</ThemedText>
                              <TextInput
                                style={styles.input}
                                value={profile.abortionCount.toString()}
                                onChangeText={(txt) => setProfile({ ...profile, abortionCount: parseInt(txt, 10) || 0 })}
                                keyboardType="numeric"
                              />
                            </View>
                            <View style={styles.fieldCol}>
                              <ThemedText style={styles.label}>Living Children Count</ThemedText>
                              <TextInput
                                style={styles.input}
                                value={profile.livingChildrenCount.toString()}
                                onChangeText={(txt) => setProfile({ ...profile, livingChildrenCount: parseInt(txt, 10) || 0 })}
                                keyboardType="numeric"
                              />
                            </View>
                            <View style={styles.fieldCol}>
                              <ThemedText style={styles.label}>Pregnancy-Induced Hypertension / Pre-Eclampsia?</ThemedText>
                              <View style={styles.chipRow}>
                                <Pressable
                                  onPress={() => setProfile({ ...profile, preEclampsiaHypertension: false })}
                                  style={[styles.chip, !profile.preEclampsiaHypertension && styles.chipActive]}
                                >
                                  <ThemedText style={!profile.preEclampsiaHypertension ? styles.chipTextActive : styles.chipText}>No</ThemedText>
                                </Pressable>
                                <Pressable
                                  onPress={() => setProfile({ ...profile, preEclampsiaHypertension: true })}
                                  style={[styles.chip, profile.preEclampsiaHypertension && styles.chipActive]}
                                >
                                  <ThemedText style={profile.preEclampsiaHypertension ? styles.chipTextActive : styles.chipText}>Yes</ThemedText>
                                </Pressable>
                              </View>
                            </View>
                          </View>
                        </>
                      ) : (
                        <View style={[styles.maleNoticeBox, { marginTop: 0 }]}>
                          <ThemedText style={styles.maleNoticeText}>
                            Obstetric history marked as Not Applicable (N). Will be output as blank in PhilHealth DTD transmissions.
                          </ThemedText>
                        </View>
                      )}
                    </>
                  )}
                </View>
              )}

              {/* TAB 5: PhilPEN 24 Questions */}
              {activeTab === 'ncd' && (
                <View style={styles.sectionCard}>
                  <ThemedText style={styles.sectionTitle}>PhilPEN Non-Communicable Disease Risk Assessment</ThemedText>
                  <ThemedText style={styles.helperText}>
                    PhilHealth standard 24 questions for cardiovascular and metabolic risk profiling:
                  </ThemedText>

                  {[
                    { id: 'ncd_qid1', q: 'Q1: Does the patient have high blood pressure / hypertension?' },
                    { id: 'ncd_qid2', q: 'Q2: Does the patient have diabetes mellitus?' },
                    { id: 'ncd_qid3', q: 'Q3: Any family history of premature cardiovascular disease?' },
                    { id: 'ncd_qid4', q: 'Q4: Does the patient currently smoke tobacco products?' },
                    { id: 'ncd_qid6', q: 'Q6: Engages in at least 150 minutes of physical activity weekly?' },
                    { id: 'ncd_qid7', q: 'Q7: Consumes fruits and vegetables daily?' },
                    { id: 'ncd_qid8', q: 'Q8: Frequently adds high-sodium condiments or salty snacks?' },
                  ].map((item) => {
                    const ans = profile.ncdAnswers[item.id] || 'N';
                    return (
                      <View key={item.id} style={styles.ncdRow}>
                        <ThemedText style={styles.ncdText}>{item.q}</ThemedText>
                        <View style={styles.chipRow}>
                          <Pressable
                            onPress={() =>
                              setProfile({
                                ...profile,
                                ncdAnswers: { ...profile.ncdAnswers, [item.id]: 'N' },
                              })
                            }
                            style={[styles.smallChip, ans === 'N' && styles.smallChipGreen]}
                          >
                            <ThemedText style={ans === 'N' ? styles.smallChipTextActive : styles.smallChipText}>
                              No
                            </ThemedText>
                          </Pressable>
                          <Pressable
                            onPress={() =>
                              setProfile({
                                ...profile,
                                ncdAnswers: { ...profile.ncdAnswers, [item.id]: 'Y' },
                              })
                            }
                            style={[styles.smallChip, ans === 'Y' && styles.smallChipAmber]}
                          >
                            <ThemedText style={ans === 'Y' ? styles.smallChipTextActive : styles.smallChipText}>
                              Yes
                            </ThemedText>
                          </Pressable>
                        </View>
                      </View>
                    );
                  })}
                </View>
              )}
            </ScrollView>
          )}

          {/* Footer Bar */}
          <View style={styles.footerBar}>
            <Pressable onPress={onClose} style={styles.cancelBtn}>
              <ThemedText style={styles.cancelBtnText}>Cancel</ThemedText>
            </Pressable>
            <Pressable onPress={handleSave} disabled={saving || loading} style={styles.saveBtn}>
              {saving ? (
                <ActivityIndicator size="small" color="#FFFFFF" />
              ) : (
                <ThemedText style={styles.saveBtnText}>💾 Save Profile (Standalone / Offline)</ThemedText>
              )}
            </Pressable>
          </View>
        </View>
      </View>
    </Modal>
  );
}

const styles = StyleSheet.create({
  modalOverlay: {
    flex: 1,
    backgroundColor: 'rgba(15, 23, 42, 0.75)',
    justifyContent: 'center',
    alignItems: 'center',
    padding: 16,
  },
  modalContainer: {
    backgroundColor: '#FFFFFF',
    borderRadius: 16,
    width: '100%',
    maxWidth: 900,
    maxHeight: '90%',
    flexDirection: 'column',
    overflow: 'hidden',
    shadowColor: '#000',
    shadowOffset: { width: 0, height: 10 },
    shadowOpacity: 0.25,
    shadowRadius: 20,
    elevation: 10,
  },
  headerBar: {
    flexDirection: 'row',
    justifyContent: 'space-between',
    alignItems: 'flex-start',
    paddingHorizontal: 24,
    paddingTop: 20,
    paddingBottom: 16,
    borderBottomWidth: 1,
    borderBottomColor: '#E2E8F0',
  },
  titleRow: {
    flexDirection: 'row',
    alignItems: 'center',
    gap: 12,
  },
  titleText: {
    fontSize: 20,
    fontWeight: '800',
    color: '#0F172A',
  },
  trancheBadge: {
    backgroundColor: '#DCFCE7',
    color: '#166534',
    fontSize: 12,
    fontWeight: '700',
    paddingHorizontal: 8,
    paddingVertical: 2,
    borderRadius: 6,
  },
  patientSubText: {
    fontSize: 13,
    color: '#64748B',
    marginTop: 4,
  },
  closeBtn: {
    padding: 6,
    borderRadius: 8,
    backgroundColor: '#F1F5F9',
  },
  closeBtnText: {
    fontSize: 16,
    fontWeight: '700',
    color: '#64748B',
  },
  tabBar: {
    flexDirection: 'row',
    borderBottomWidth: 1,
    borderBottomColor: '#E2E8F0',
    backgroundColor: '#F8FAFC',
  },
  tabItem: {
    paddingVertical: 12,
    paddingHorizontal: 16,
    borderBottomWidth: 2,
    borderBottomColor: 'transparent',
  },
  tabItemActive: {
    borderBottomColor: '#0284C7',
    backgroundColor: '#FFFFFF',
  },
  tabText: {
    fontSize: 13,
    fontWeight: '600',
    color: '#64748B',
  },
  tabTextActive: {
    color: '#0284C7',
    fontWeight: '700',
  },
  loadingContainer: {
    padding: 60,
    alignItems: 'center',
    justifyContent: 'center',
  },
  loadingText: {
    marginTop: 12,
    fontSize: 14,
    color: '#64748B',
  },
  scrollArea: {
    flex: 1,
  },
  scrollContent: {
    padding: 24,
  },
  sectionCard: {
    backgroundColor: '#FFFFFF',
  },
  sectionTitle: {
    fontSize: 16,
    fontWeight: '700',
    color: '#1E293B',
    marginBottom: 8,
  },
  helperText: {
    fontSize: 13,
    color: '#64748B',
    marginBottom: 12,
  },
  subHeading: {
    fontSize: 14,
    fontWeight: '700',
    color: '#334155',
    marginBottom: 8,
  },
  formRow: {
    flexDirection: 'row',
    flexWrap: 'wrap',
    gap: 16,
    marginBottom: 12,
  },
  fieldCol: {
    flex: 1,
    minWidth: 180,
  },
  label: {
    fontSize: 12,
    fontWeight: '600',
    color: '#475569',
    marginBottom: 6,
  },
  input: {
    borderWidth: 1,
    borderColor: '#CBD5E1',
    borderRadius: 8,
    paddingHorizontal: 12,
    paddingVertical: 8,
    fontSize: 14,
    color: '#0F172A',
    backgroundColor: '#F8FAFC',
  },
  chipRow: {
    flexDirection: 'row',
    gap: 8,
  },
  chip: {
    paddingHorizontal: 12,
    paddingVertical: 8,
    borderRadius: 8,
    backgroundColor: '#F1F5F9',
    borderWidth: 1,
    borderColor: '#CBD5E1',
  },
  chipActive: {
    backgroundColor: '#E0F2FE',
    borderColor: '#0284C7',
  },
  chipText: {
    fontSize: 13,
    color: '#475569',
    fontWeight: '600',
  },
  chipTextActive: {
    fontSize: 13,
    color: '#0284C7',
    fontWeight: '700',
  },
  conditionsWrap: {
    flexDirection: 'row',
    flexWrap: 'wrap',
    gap: 8,
  },
  conditionChip: {
    paddingHorizontal: 14,
    paddingVertical: 8,
    borderRadius: 20,
    backgroundColor: '#F8FAFC',
    borderWidth: 1,
    borderColor: '#E2E8F0',
  },
  conditionChipActive: {
    backgroundColor: '#F0FDF4',
    borderColor: '#22C55E',
  },
  conditionChipText: {
    fontSize: 13,
    color: '#475569',
    fontWeight: '600',
  },
  conditionChipTextActive: {
    fontSize: 13,
    color: '#15803D',
    fontWeight: '700',
  },
  organsGrid: {
    gap: 10,
  },
  organRow: {
    flexDirection: 'row',
    justifyContent: 'space-between',
    alignItems: 'center',
    paddingVertical: 6,
    borderBottomWidth: 1,
    borderBottomColor: '#F1F5F9',
  },
  organLabel: {
    fontSize: 14,
    color: '#334155',
    fontWeight: '600',
  },
  organControls: {
    flexDirection: 'row',
    gap: 6,
  },
  smallChip: {
    paddingHorizontal: 10,
    paddingVertical: 5,
    borderRadius: 6,
    backgroundColor: '#F1F5F9',
  },
  smallChipGreen: {
    backgroundColor: '#DCFCE7',
  },
  smallChipAmber: {
    backgroundColor: '#FEF3C7',
  },
  smallChipText: {
    fontSize: 12,
    color: '#64748B',
    fontWeight: '600',
  },
  smallChipTextActive: {
    fontSize: 12,
    color: '#0F172A',
    fontWeight: '700',
  },
  pediatricBanner: {
    backgroundColor: '#EFF6FF',
    padding: 14,
    borderRadius: 10,
    borderColor: '#BFDBFE',
    borderWidth: 1,
  },
  maleNoticeBox: {
    backgroundColor: '#F8FAFC',
    padding: 20,
    borderRadius: 12,
    borderColor: '#CBD5E1',
    borderWidth: 1,
  },
  maleNoticeTitle: {
    fontSize: 16,
    fontWeight: '700',
    color: '#475569',
    marginBottom: 6,
  },
  maleNoticeText: {
    fontSize: 14,
    color: '#64748B',
    lineHeight: 20,
  },
  bannerText: {
    fontSize: 13,
    color: '#1D4ED8',
    lineHeight: 18,
  },
  behavioralGrid: {
    gap: 16,
  },
  behavioralRow: {
    flexDirection: 'row',
    justifyContent: 'space-between',
    alignItems: 'center',
  },
  ncdRow: {
    flexDirection: 'row',
    justifyContent: 'space-between',
    alignItems: 'center',
    paddingVertical: 10,
    borderBottomWidth: 1,
    borderBottomColor: '#F1F5F9',
  },
  ncdText: {
    fontSize: 13,
    color: '#334155',
    flex: 1,
    paddingRight: 12,
  },
  sponsorCard: {
    backgroundColor: '#F0FDF4',
    borderWidth: 1,
    borderColor: '#86EFAC',
    borderRadius: 10,
    padding: 16,
    marginTop: 16,
  },
  sponsorHeader: {
    flexDirection: 'row',
    alignItems: 'center',
    gap: 8,
    marginBottom: 4,
  },
  sponsorBadge: {
    backgroundColor: '#0284C7',
    color: '#FFFFFF',
    fontSize: 10,
    fontWeight: '800',
    paddingHorizontal: 6,
    paddingVertical: 2,
    borderRadius: 4,
    overflow: 'hidden',
  },
  sponsorTitle: {
    fontSize: 14,
    fontWeight: '700',
    color: '#0F172A',
  },
  sponsorSubtitle: {
    fontSize: 12,
    color: '#475569',
    lineHeight: 16,
  },
  footerBar: {
    flexDirection: 'row',
    justifyContent: 'flex-end',
    alignItems: 'center',
    gap: 12,
    paddingHorizontal: 24,
    paddingVertical: 16,
    borderTopWidth: 1,
    borderTopColor: '#E2E8F0',
    backgroundColor: '#F8FAFC',
  },
  cancelBtn: {
    paddingHorizontal: 16,
    paddingVertical: 10,
    borderRadius: 8,
    backgroundColor: '#FFFFFF',
    borderWidth: 1,
    borderColor: '#CBD5E1',
  },
  cancelBtnText: {
    fontSize: 14,
    fontWeight: '600',
    color: '#64748B',
  },
  saveBtn: {
    paddingHorizontal: 20,
    paddingVertical: 10,
    borderRadius: 8,
    backgroundColor: '#0284C7',
  },
  saveBtnText: {
    fontSize: 14,
    fontWeight: '700',
    color: '#FFFFFF',
  },
});
