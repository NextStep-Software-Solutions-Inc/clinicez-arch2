import React, { useState, useEffect, useCallback, useMemo, useRef } from 'react';
import { View, StyleSheet, Pressable, ScrollView, ActivityIndicator } from 'react-native';
import { theme } from '@constants/theme';
import { ThemedText, Button, Input, Icon, EmptyState, ErrorState, SkeletonList, Modal, Badge, ValidatedDateInput, Icd10AutocompleteInput, validateDateString } from '@ui';
import { Alert } from '@utils/feedback';
import { usePhilHealthCatalog } from '@utils/usePhilHealthCatalog';
import {
  clinicService,
  ClinicPatient,
  PatientSurgicalHistory,
  UpsertPatientSurgicalHistoryPayload,
  PatientProblemRecord,
  CreatePatientProblemPayload,
  PatientAllergyRecord,
  CreatePatientAllergyPayload,
  PhilHealthPatientProfile,
  PhilHealthConditionEntry,
} from '../../services/clinicService';

export const PHILHEALTH_MDISEASES_CONDITIONS: { code: string; description: string }[] = [
  { code: '001', description: 'Allergy' },
  { code: '002', description: 'Asthma' },
  { code: '003', description: 'Cancer' },
  { code: '004', description: 'Cerebrovascular Disease' },
  { code: '005', description: 'Coronary Artery Disease' },
  { code: '006', description: 'Diabetes Mellitus' },
  { code: '007', description: 'Emphysema' },
  { code: '008', description: 'Epilepsy/Seizure Disorder' },
  { code: '009', description: 'Hepatitis' },
  { code: '010', description: 'Hyperlipidemia' },
  { code: '011', description: 'Hypertension' },
  { code: '012', description: 'Peptic Ulcer' },
  { code: '013', description: 'Pneumonia' },
  { code: '014', description: 'Thyroid Disease' },
  { code: '015', description: 'Pulmonary Tuberculosis' },
  { code: '016', description: 'Extrapulmonary Tuberculosis' },
  { code: '017', description: 'Urinary Tract Infection' },
  { code: '018', description: 'Mental Illness' },
  { code: '998', description: 'Others' },
];

export const defaultPhilHealthProfile: PhilHealthPatientProfile = {
  medicalHistories: [],
  surgicalHistories: [],
  familyHistories: [],
  isSmoker: false,
  isAlcoholDrinker: false,
  illDrugUser: false,
  isSexuallyActive: false,
  childImmunizations: [],
  youngWomanImmunizations: [],
  pregnantWomanImmunizations: [],
  elderlyImmunizations: [],
  otherImmunizations: [],
  menstrualApplicable: false,
  isMenopause: false,
  pregnancyApplicable: false,
  gravida: 0,
  para: 0,
  fullTermCount: 0,
  prematureCount: 0,
  abortionCount: 0,
  livingChildrenCount: 0,
  preEclampsiaHypertension: false,
  familyPlanningCounseling: false,
  skinId: '1',
  heentId: '1',
  chestId: '1',
  heartId: '1',
  abdomenId: '1',
  neuroId: '1',
  rectalId: '1',
  guId: '1',
  genSurveyId: '1',
  ncdAnswers: {},
};

export interface ClinicalHistoryTabProps {
  patient: ClinicPatient;
  initialSurgicalHistories?: PatientSurgicalHistory[];
  initialProfile?: PhilHealthPatientProfile;
  onRefreshChart?: () => void;
}

export default function ClinicalHistoryTab({
  patient,
  initialSurgicalHistories,
  initialProfile,
  onRefreshChart,
}: ClinicalHistoryTabProps) {
  // Surgical History State
  const [surgicalHistories, setSurgicalHistories] = useState<PatientSurgicalHistory[]>(
    initialSurgicalHistories || []
  );
  const [loading, setLoading] = useState(false);
  const [error, setError] = useState<string | null>(null);

  // Modal State for Add / Edit Surgical Procedure
  const [modalVisible, setModalVisible] = useState(false);
  const [editingItem, setEditingItem] = useState<PatientSurgicalHistory | null>(null);
  const [saving, setSaving] = useState(false);
  const [deletingId, setDeletingId] = useState<string | null>(null);

  // Surgical Form Fields
  const [procedureName, setProcedureName] = useState('');
  const [surgeryDate, setSurgeryDate] = useState('');
  const [hospitalName, setHospitalName] = useState('');
  const [findings, setFindings] = useState('');
  const [complications, setComplications] = useState('');
  const [remarks, setRemarks] = useState('');
  const [formError, setFormError] = useState<string | null>(null);

  // Problems State
  const [problems, setProblems] = useState<PatientProblemRecord[]>([]);
  const [loadingProblems, setLoadingProblems] = useState(false);
  const [problemModalVisible, setProblemModalVisible] = useState(false);
  const [savingProblem, setSavingProblem] = useState(false);
  const [problemIcd10, setProblemIcd10] = useState('');
  const [problemTitle, setProblemTitle] = useState('');
  const [problemStatus, setProblemStatus] = useState<'Active' | 'Resolved'>('Active');
  const [problemSeverity, setProblemSeverity] = useState<'Mild' | 'Moderate' | 'Severe'>('Moderate');
  const [problemIsChronic, setProblemIsChronic] = useState(false);
  const [problemOnsetDate, setProblemOnsetDate] = useState(new Date().toISOString().split('T')[0]);
  const [problemNotes, setProblemNotes] = useState('');
  const [problemFormError, setProblemFormError] = useState<string | null>(null);

  // Allergies State
  const [allergies, setAllergies] = useState<PatientAllergyRecord[]>([]);
  const [loadingAllergies, setLoadingAllergies] = useState(false);
  const [allergyModalVisible, setAllergyModalVisible] = useState(false);
  const [savingAllergy, setSavingAllergy] = useState(false);
  const [allergyCategory, setAllergyCategory] = useState<'Medication' | 'Food' | 'Environmental'>('Medication');
  const [allergen, setAllergen] = useState('');
  const [allergySeverity, setAllergySeverity] = useState<'Mild' | 'Moderate' | 'Severe' | 'LifeThreatening'>('Moderate');
  const [allergyReaction, setAllergyReaction] = useState('');
  const [isAnaphylactic, setIsAnaphylactic] = useState(false);
  const [allergyNotes, setAllergyNotes] = useState('');
  const [allergyFormError, setAllergyFormError] = useState<string | null>(null);

  // PhilHealth Profile & Statutory Medical/Family History State
  const [profile, setProfile] = useState<PhilHealthPatientProfile | null>(initialProfile || null);
  const [loadingProfile, setLoadingProfile] = useState(false);
  const [savingProfile, setSavingProfile] = useState(false);
  const [profileError, setProfileError] = useState<string | null>(null);
  const [profileSuccess, setProfileSuccess] = useState(false);

  // Personal Medical History
  const [selectedMedicalCodes, setSelectedMedicalCodes] = useState<Set<string>>(() => {
    if (initialProfile?.medicalHistories?.length) {
      return new Set(initialProfile.medicalHistories.map((m) => m.code));
    }
    if (patient.chronicConditions) {
      const parsed = patient.chronicConditions.split(',').map((s) => s.trim().toLowerCase());
      const codes = new Set<string>();
      for (const item of PHILHEALTH_MDISEASES_CONDITIONS) {
        if (parsed.some((p) => p === item.code.toLowerCase() || p === item.description.toLowerCase())) {
          codes.add(item.code);
        }
      }
      return codes;
    }
    return new Set();
  });
  const [medicalOtherDesc, setMedicalOtherDesc] = useState(() => {
    return initialProfile?.medicalHistories?.find((m) => m.code === '998')?.specificDesc || '';
  });
  const [personalNotes, setPersonalNotes] = useState(() => {
    return initialProfile?.medicalHistoryNotes || '';
  });

  // Family Medical History
  const [selectedFamilyCodes, setSelectedFamilyCodes] = useState<Set<string>>(() => {
    if (initialProfile?.familyHistories?.length) {
      return new Set(initialProfile.familyHistories.map((f) => f.code));
    }
    return new Set();
  });
  const [familyOtherDesc, setFamilyOtherDesc] = useState(() => {
    return initialProfile?.familyHistories?.find((f) => f.code === '998')?.specificDesc || '';
  });
  const [familyNotes, setFamilyNotes] = useState(() => {
    return initialProfile?.familyHistoryNotes || '';
  });

  // Catalog for past medical conditions (lib_mdiseases)
  const { items: diseaseCatalog } = usePhilHealthCatalog('lib_mdiseases');
  const activeCatalogConditions = useMemo(() => {
    return diseaseCatalog && diseaseCatalog.length > 0
      ? diseaseCatalog
          .filter((item) => item.code !== '999' && item.description.toLowerCase() !== 'none')
          .map((item) => ({ code: item.code, description: item.description }))
      : PHILHEALTH_MDISEASES_CONDITIONS;
  }, [diseaseCatalog]);
  const availableConditions = activeCatalogConditions;

  const seedFromProfile = useCallback((data: PhilHealthPatientProfile) => {
    if (data.medicalHistories && Array.isArray(data.medicalHistories)) {
      const medCodes = new Set(data.medicalHistories.map((m) => m.code));
      setSelectedMedicalCodes(medCodes);
      const otherMed = data.medicalHistories.find((m) => m.code === '998');
      if (otherMed?.specificDesc) {
        setMedicalOtherDesc(otherMed.specificDesc);
      } else {
        setMedicalOtherDesc('');
      }
    } else if (patient.chronicConditions) {
      const parsed = patient.chronicConditions.split(',').map((s) => s.trim().toLowerCase());
      const codes = new Set<string>();
      for (const item of PHILHEALTH_MDISEASES_CONDITIONS) {
        if (parsed.some((p) => p === item.code.toLowerCase() || p === item.description.toLowerCase())) {
          codes.add(item.code);
        }
      }
      if (codes.size > 0) {
        setSelectedMedicalCodes(codes);
      }
    }

    if (data.familyHistories && Array.isArray(data.familyHistories)) {
      const famCodes = new Set(data.familyHistories.map((f) => f.code));
      setSelectedFamilyCodes(famCodes);
      const otherFam = data.familyHistories.find((f) => f.code === '998');
      if (otherFam?.specificDesc) {
        setFamilyOtherDesc(otherFam.specificDesc);
      } else {
        setFamilyOtherDesc('');
      }
    }

    if (data.medicalHistoryNotes) {
      setPersonalNotes(data.medicalHistoryNotes);
    }
    if (data.familyHistoryNotes) {
      setFamilyNotes(data.familyHistoryNotes);
    }
  }, [patient.chronicConditions]);

  const fetchProfile = useCallback(async () => {
    setLoadingProfile(true);
    setProfileError(null);
    try {
      const [data] = await clinicService.getPhilHealthPatientProfile(patient.id);
      if (data) {
        setProfile(data);
        seedFromProfile(data);
      } else if (patient.chronicConditions) {
        const parsed = patient.chronicConditions.split(',').map((s) => s.trim().toLowerCase());
        const codes = new Set<string>();
        for (const item of PHILHEALTH_MDISEASES_CONDITIONS) {
          if (parsed.some((p) => p === item.code.toLowerCase() || p === item.description.toLowerCase())) {
            codes.add(item.code);
          }
        }
        if (codes.size > 0) {
          setSelectedMedicalCodes(codes);
        }
      }
    } catch {
      if (patient.chronicConditions) {
        const parsed = patient.chronicConditions.split(',').map((s) => s.trim().toLowerCase());
        const codes = new Set<string>();
        for (const item of PHILHEALTH_MDISEASES_CONDITIONS) {
          if (parsed.some((p) => p === item.code.toLowerCase() || p === item.description.toLowerCase())) {
            codes.add(item.code);
          }
        }
        if (codes.size > 0) {
          setSelectedMedicalCodes(codes);
        }
      }
    } finally {
      setLoadingProfile(false);
    }
  }, [patient.id, patient.chronicConditions, seedFromProfile]);

  const isInitializedRef = useRef(false);
  const prevPatientIdRef = useRef(patient.id);
  const prevInitialProfileRef = useRef(initialProfile);

  useEffect(() => {
    const patientChanged = prevPatientIdRef.current !== patient.id;
    const initialProfileChanged = prevInitialProfileRef.current !== initialProfile;

    if (!isInitializedRef.current || patientChanged || initialProfileChanged) {
      isInitializedRef.current = true;
      prevPatientIdRef.current = patient.id;
      prevInitialProfileRef.current = initialProfile;

      if (initialProfile) {
        setProfile(initialProfile);
        seedFromProfile(initialProfile);
      } else {
        fetchProfile();
      }
    }
  }, [patient.id, initialProfile, fetchProfile, seedFromProfile]);

  const toggleMedicalCondition = (code: string) => {
    setSelectedMedicalCodes((prev) => {
      const next = new Set(prev);
      if (next.has(code)) {
        next.delete(code);
        if (code === '998') {
          setMedicalOtherDesc('');
        }
      } else {
        next.add(code);
      }
      return next;
    });
    setProfileSuccess(false);
  };

  const toggleFamilyCondition = (code: string) => {
    setSelectedFamilyCodes((prev) => {
      const next = new Set(prev);
      if (next.has(code)) {
        next.delete(code);
        if (code === '998') {
          setFamilyOtherDesc('');
        }
      } else {
        next.add(code);
      }
      return next;
    });
    setProfileSuccess(false);
  };

  const handleSaveMedicalAndFamilyHistory = async () => {
    setSavingProfile(true);
    setProfileError(null);
    setProfileSuccess(false);

    const medicalHistories: PhilHealthConditionEntry[] = Array.from(selectedMedicalCodes).map((code) => {
      const match = activeCatalogConditions.find((c) => c.code === code);
      const desc = code === '998' ? (medicalOtherDesc.trim() || 'Others') : (match?.description || code);
      return {
        code,
        specificDesc: desc,
      };
    });

    const familyHistories: PhilHealthConditionEntry[] = Array.from(selectedFamilyCodes).map((code) => {
      const match = activeCatalogConditions.find((c) => c.code === code);
      const desc = code === '998' ? (familyOtherDesc.trim() || 'Others') : (match?.description || code);
      return {
        code,
        specificDesc: desc,
      };
    });

    const updatedProfile: PhilHealthPatientProfile = {
      ...(profile || defaultPhilHealthProfile),
      medicalHistories,
      familyHistories,
      medicalHistoryNotes: personalNotes.trim() || undefined,
      familyHistoryNotes: familyNotes.trim() || undefined,
    };

    try {
      const [saved, err] = await clinicService.updatePhilHealthPatientProfile(patient.id, updatedProfile);
      if (err) {
        setProfileError(err.message || 'Failed to save medical & family history.');
        Alert.alert('Error', err.message || 'Failed to save medical & family history.');
      } else {
        if (saved) {
          setProfile(saved);
        }
        setProfileSuccess(true);
        Alert.alert('Success', 'Medical & family history saved successfully.');
        onRefreshChart?.();
      }
    } catch (e: any) {
      setProfileError(e.message || 'An unexpected error occurred while saving.');
      Alert.alert('Error', e.message || 'An unexpected error occurred while saving.');
    } finally {
      setSavingProfile(false);
    }
  };

  const fetchSurgicalHistories = useCallback(async () => {
    setLoading(true);
    setError(null);
    try {
      const [data, err] = await clinicService.getSurgicalHistories(patient.id);
      if (data) {
        setSurgicalHistories(data);
      } else if (err) {
        setError(err.message || 'Unable to load surgical procedures.');
      }
    } catch (e: any) {
      setError(e.message || 'Failed to fetch surgical procedures.');
    } finally {
      setLoading(false);
    }
  }, [patient.id]);

  const fetchProblems = useCallback(async () => {
    setLoadingProblems(true);
    try {
      const [data] = await clinicService.getPatientProblems(patient.id);
      if (data) setProblems(data);
    } catch {
      // ignore
    } finally {
      setLoadingProblems(false);
    }
  }, [patient.id]);

  const fetchAllergies = useCallback(async () => {
    setLoadingAllergies(true);
    try {
      const [data] = await clinicService.getPatientAllergies(patient.id);
      if (data) setAllergies(data);
    } catch {
      // ignore
    } finally {
      setLoadingAllergies(false);
    }
  }, [patient.id]);

  useEffect(() => {
    if (!initialSurgicalHistories || initialSurgicalHistories.length === 0) {
      fetchSurgicalHistories();
    } else {
      setSurgicalHistories(initialSurgicalHistories);
    }
    fetchProblems();
    fetchAllergies();
  }, [fetchSurgicalHistories, fetchProblems, fetchAllergies, initialSurgicalHistories]);

  // Surgical Modals
  const openAddModal = () => {
    setEditingItem(null);
    setProcedureName('');
    setSurgeryDate(new Date().toISOString().split('T')[0]);
    setHospitalName('');
    setFindings('');
    setComplications('');
    setRemarks('');
    setFormError(null);
    setModalVisible(true);
  };

  const openEditModal = (item: PatientSurgicalHistory) => {
    setEditingItem(item);
    setProcedureName(item.procedureName);
    setSurgeryDate(item.surgeryDate ? item.surgeryDate.split('T')[0] : '');
    setHospitalName(item.hospitalName || '');
    setFindings(item.findings || '');
    setComplications(item.complications || '');
    setRemarks(item.remarks || '');
    setFormError(null);
    setModalVisible(true);
  };

  const handleSave = async () => {
    if (!procedureName.trim()) {
      setFormError('Procedure name is required.');
      return;
    }
    if (!surgeryDate.trim()) {
      setFormError('Surgery date is required (YYYY-MM-DD).');
      return;
    }
    const surgeryDateValidation = validateDateString(surgeryDate, { boundaryMode: 'pastOrToday' });
    if (!surgeryDateValidation.isValid) {
      setFormError(surgeryDateValidation.errorMessage || 'Invalid surgery date (must be past or today).');
      return;
    }

    setSaving(true);
    setFormError(null);

    const payload: UpsertPatientSurgicalHistoryPayload = {
      procedureName: procedureName.trim(),
      surgeryDate: surgeryDate.trim(),
      hospitalName: hospitalName.trim() || undefined,
      findings: findings.trim() || undefined,
      complications: complications.trim() || undefined,
      remarks: remarks.trim() || undefined,
    };

    try {
      if (editingItem) {
        const [updated, err] = await clinicService.updateSurgicalHistory(
          patient.id,
          editingItem.id,
          payload
        );
        if (err) {
          setFormError(err.message || 'Failed to update surgical procedure.');
          setSaving(false);
          return;
        }
        if (updated) {
          setSurgicalHistories((prev) =>
            prev.map((item) => (item.id === updated.id ? updated : item))
          );
        }
      } else {
        const [created, err] = await clinicService.addSurgicalHistory(patient.id, payload);
        if (err) {
          setFormError(err.message || 'Failed to record surgical procedure.');
          setSaving(false);
          return;
        }
        if (created) {
          setSurgicalHistories((prev) => [created, ...prev]);
        }
      }
      setModalVisible(false);
      onRefreshChart?.();
    } catch (e: any) {
      setFormError(e.message || 'An unexpected error occurred while saving.');
    } finally {
      setSaving(false);
    }
  };

  const handleDelete = (item: PatientSurgicalHistory) => {
    Alert.alert(
      'Delete Surgical Procedure',
      `Are you sure you want to remove "${item.procedureName}"? This action cannot be undone.`,
      [
        { text: 'Cancel', style: 'cancel' },
        {
          text: 'Delete',
          style: 'destructive',
          onPress: async () => {
            setDeletingId(item.id);
            try {
              const [, err] = await clinicService.deleteSurgicalHistory(patient.id, item.id);
              if (err) {
                Alert.alert('Error', err.message || 'Failed to delete procedure.');
              } else {
                setSurgicalHistories((prev) => prev.filter((p) => p.id !== item.id));
                onRefreshChart?.();
              }
            } catch (e: any) {
              Alert.alert('Error', e.message || 'Unexpected error deleting procedure.');
            } finally {
              setDeletingId(null);
            }
          },
        },
      ]
    );
  };

  // Problem Handling
  const handleSaveProblem = async () => {
    if (!problemIcd10.trim()) {
      setProblemFormError('ICD-10 code is required (e.g. I10, E11.9).');
      return;
    }
    if (!problemTitle.trim()) {
      setProblemFormError('Problem diagnosis description is required.');
      return;
    }
    if (problemOnsetDate && problemOnsetDate.trim()) {
      const onsetValidation = validateDateString(problemOnsetDate, { boundaryMode: 'pastOrToday' });
      if (!onsetValidation.isValid) {
        setProblemFormError(onsetValidation.errorMessage || 'Invalid onset date (must be past or today).');
        return;
      }
    }

    setSavingProblem(true);
    setProblemFormError(null);

    const payload: CreatePatientProblemPayload = {
      icd10Code: problemIcd10.trim().toUpperCase(),
      problemTitle: problemTitle.trim(),
      status: problemStatus,
      severity: problemSeverity,
      isChronicNcd: problemIsChronic,
      onsetDate: problemOnsetDate ? problemOnsetDate.trim() : undefined,
      clinicalNotes: problemNotes.trim() || undefined,
    };

    try {
      const [created, err] = await clinicService.createPatientProblem(patient.id, payload);
      if (err) {
        setProblemFormError(err.message || 'Failed to record problem.');
      } else if (created) {
        setProblems((prev) => [created, ...prev]);
        setProblemModalVisible(false);
        onRefreshChart?.();
      }
    } catch (e: any) {
      setProblemFormError(e.message || 'Error recording problem.');
    } finally {
      setSavingProblem(false);
    }
  };

  const handleToggleProblemStatus = async (item: PatientProblemRecord) => {
    const nextStatus = item.status === 'Active' ? 'Resolved' : 'Active';
    const resolvedDate = nextStatus === 'Resolved' ? new Date().toISOString().split('T')[0] : undefined;

    try {
      const [updated, err] = await clinicService.updatePatientProblemStatus(
        patient.id,
        item.id,
        nextStatus,
        resolvedDate
      );
      if (err) {
        Alert.alert('Error', err.message || 'Failed to update problem status.');
      } else if (updated) {
        setProblems((prev) => prev.map((p) => (p.id === updated.id ? updated : p)));
        onRefreshChart?.();
      }
    } catch (e: any) {
      Alert.alert('Error', e.message || 'Unexpected error.');
    }
  };

  // Allergy Handling
  const handleSaveAllergy = async () => {
    if (!allergen.trim()) {
      setAllergyFormError('Allergen name is required (e.g. Penicillin, Peanuts).');
      return;
    }

    setSavingAllergy(true);
    setAllergyFormError(null);

    const payload: CreatePatientAllergyPayload = {
      category: allergyCategory,
      allergen: allergen.trim(),
      severity: allergySeverity,
      reactionManifestation: allergyReaction.trim() || undefined,
      isAnaphylactic: isAnaphylactic || allergySeverity === 'LifeThreatening',
      notes: allergyNotes.trim() || undefined,
    };

    try {
      const [created, err] = await clinicService.createPatientAllergy(patient.id, payload);
      if (err) {
        setAllergyFormError(err.message || 'Failed to record allergy.');
      } else if (created) {
        setAllergies((prev) => [created, ...prev]);
        setAllergyModalVisible(false);
        onRefreshChart?.();
      }
    } catch (e: any) {
      setAllergyFormError(e.message || 'Error recording allergy.');
    } finally {
      setSavingAllergy(false);
    }
  };

  const handleDeleteAllergy = (item: PatientAllergyRecord) => {
    Alert.alert(
      'Remove Allergy',
      `Are you sure you want to remove documented allergy "${item.allergen}"?`,
      [
        { text: 'Cancel', style: 'cancel' },
        {
          text: 'Remove',
          style: 'destructive',
          onPress: async () => {
            try {
              const [, err] = await clinicService.deletePatientAllergy(patient.id, item.id);
              if (err) {
                Alert.alert('Error', err.message || 'Failed to remove allergy.');
              } else {
                setAllergies((prev) => prev.filter((a) => a.id !== item.id));
                onRefreshChart?.();
              }
            } catch (e: any) {
              Alert.alert('Error', e.message || 'Unexpected error.');
            }
          },
        },
      ]
    );
  };


  return (
    <ScrollView style={styles.container} contentContainerStyle={styles.content}>
      {/* SECTION 1: Structured Problem List */}
      <View style={styles.sectionCard}>
        <View style={styles.sectionHeader}>
          <View style={styles.iconTitleRow}>
            <Icon name="activity" size={theme.sizes.iconMd} color={theme.colors.primary} />
            <ThemedText variant="h3">Structured Problem List</ThemedText>
          </View>
          <Button
            title="Add Problem"
            variant="primary"
            size="sm"
            icon="plus"
            onPress={() => {
              setProblemIcd10('');
              setProblemTitle('');
              setProblemStatus('Active');
              setProblemSeverity('Moderate');
              setProblemIsChronic(false);
              setProblemOnsetDate(new Date().toISOString().split('T')[0]);
              setProblemNotes('');
              setProblemFormError(null);
              setProblemModalVisible(true);
            }}
          />
        </View>

        <ThemedText variant="small" color={theme.colors.textSecondary} style={styles.sectionDescription}>
          Active and resolved clinical problem list with ICD-10 coding and Drug-Disease Interaction (DDI) guardrails.
        </ThemedText>

        {loadingProblems ? (
          <SkeletonList rows={2} />
        ) : problems.length === 0 ? (
          <View style={styles.emptyNoticeStrip}>
            <Icon name="info" size={theme.sizes.iconSm} color={theme.colors.textMuted} />
            <ThemedText variant="small" color={theme.colors.textMuted}>
              No structured problems documented yet.
            </ThemedText>
          </View>
        ) : (
          <View style={styles.proceduresList}>
            {problems.map((prob) => (
              <View key={prob.id} style={styles.procedureCard}>
                <View style={styles.procedureHeader}>
                  <View style={{ flex: 1 }}>
                    <View style={styles.badgeRow}>
                      <Badge
                        label={prob.status}
                        variant={prob.status === 'Active' ? 'primary' : 'neutral'}
                      />
                      <ThemedText variant="code" color={theme.colors.primary}>
                        {prob.icd10Code}
                      </ThemedText>
                      {prob.isChronicNcd ? (
                        <Badge label="Chronic NCD" variant="warning" />
                      ) : null}
                    </View>
                    <ThemedText variant="bodyBold" color={theme.colors.text} style={{ marginTop: theme.spacing.xs }}>
                      {prob.problemTitle}
                    </ThemedText>
                    <ThemedText variant="small" color={theme.colors.textSecondary}>
                      Onset: {prob.onsetDate || '—'} {prob.resolvedDate ? `• Resolved: ${prob.resolvedDate}` : ''}
                    </ThemedText>
                  </View>
                  <Button
                    title={prob.status === 'Active' ? 'Mark Resolved' : 'Reactivate'}
                    variant="outline"
                    size="sm"
                    onPress={() => handleToggleProblemStatus(prob)}
                  />
                </View>
                {prob.clinicalNotes ? (
                  <ThemedText variant="small" color={theme.colors.textSecondary}>
                    {prob.clinicalNotes}
                  </ThemedText>
                ) : null}
              </View>
            ))}
          </View>
        )}
      </View>

      {/* SECTION 2: Structured Allergies Registry */}
      <View style={styles.sectionCard}>
        <View style={styles.sectionHeader}>
          <View style={styles.iconTitleRow}>
            <Icon name="alertCircle" size={theme.sizes.iconMd} color={theme.colors.emergencyText} />
            <ThemedText variant="h3">Documented Allergies & Sensitivities</ThemedText>
          </View>
          <Button
            title="Add Allergy"
            variant="outline"
            size="sm"
            icon="plus"
            onPress={() => {
              setAllergen('');
              setAllergyCategory('Medication');
              setAllergySeverity('Moderate');
              setAllergyReaction('');
              setIsAnaphylactic(false);
              setAllergyNotes('');
              setAllergyFormError(null);
              setAllergyModalVisible(true);
            }}
          />
        </View>

        <ThemedText variant="small" color={theme.colors.textSecondary} style={styles.sectionDescription}>
          Drug, food, and environmental allergies feeding real-time CDS cross-reactivity and contraindication alerts.
        </ThemedText>

        {loadingAllergies ? (
          <SkeletonList rows={2} />
        ) : allergies.length === 0 ? (
          <View style={styles.emptyNoticeStrip}>
            <Icon name="checkCircle" size={theme.sizes.iconSm} color={theme.colors.successText} />
            <ThemedText variant="small" color={theme.colors.successText}>
              No known allergies documented (NKDA).
            </ThemedText>
          </View>
        ) : (
          <View style={styles.proceduresList}>
            {allergies.map((allergy) => (
              <View key={allergy.id} style={styles.procedureCard}>
                <View style={styles.procedureHeader}>
                  <View style={{ flex: 1 }}>
                    <View style={styles.badgeRow}>
                      <Badge label={allergy.category} variant="neutral" />
                      <Badge
                        label={allergy.severity}
                        variant={allergy.isAnaphylactic ? 'emergency' : allergy.severity === 'Severe' ? 'warning' : 'info'}
                      />
                      {allergy.isAnaphylactic ? (
                        <Badge label="Anaphylaxis Risk" variant="emergency" />
                      ) : null}
                    </View>
                    <ThemedText variant="bodyBold" color={theme.colors.text} style={{ marginTop: theme.spacing.xs }}>
                      {allergy.allergen}
                    </ThemedText>
                    {allergy.reactionManifestation ? (
                      <ThemedText variant="small" color={theme.colors.textSecondary}>
                        Reaction: {allergy.reactionManifestation}
                      </ThemedText>
                    ) : null}
                  </View>
                  <Pressable
                    style={styles.actionIconBtn}
                    onPress={() => handleDeleteAllergy(allergy)}
                    accessibilityLabel="Delete allergy"
                  >
                    <Icon name="trash" size={theme.sizes.iconSm} color={theme.colors.emergencyText} />
                  </Pressable>
                </View>
              </View>
            ))}
          </View>
        )}
      </View>

      {/* SECTION 3: Interactive Personal Past Medical History */}
      <View style={styles.sectionCard}>
        <View style={styles.sectionHeader}>
          <View style={styles.iconTitleRow}>
            <Icon name="check" size={theme.sizes.iconMd} color={theme.colors.primary} />
            <ThemedText variant="h3">Past Medical History (Personal)</ThemedText>
          </View>
          <Badge
            label={`${selectedMedicalCodes.size} Selected`}
            variant={selectedMedicalCodes.size > 0 ? 'primary' : 'outline'}
          />
        </View>

        <ThemedText variant="small" color={theme.colors.textSecondary} style={styles.sectionDescription}>
          Documented personal past and chronic medical conditions.
        </ThemedText>

        <View style={styles.chipsWrap}>
          {availableConditions.map((cond) => {
            const isSelected = selectedMedicalCodes.has(cond.code);
            return (
              <Pressable
                key={`personal-${cond.code}`}
                onPress={() => toggleMedicalCondition(cond.code)}
                accessibilityRole="button"
                accessibilityLabel={`Toggle personal ${cond.description}`}
                accessibilityState={{ selected: isSelected }}
                style={[
                  styles.toggleChip,
                  isSelected && styles.toggleChip_active,
                ]}
              >
                <Icon
                  name={isSelected ? 'check' : 'plus'}
                  size={theme.fontSizes.sm}
                  color={isSelected ? theme.colors.primaryDark : theme.colors.textSecondary}
                />
                <ThemedText
                  variant="smallBold"
                  color={isSelected ? theme.colors.primaryDark : theme.colors.textSecondary}
                >
                  {cond.description}
                </ThemedText>
              </Pressable>
            );
          })}
        </View>

        {selectedMedicalCodes.has('998') ? (
          <View style={styles.otherInputRow}>
            <Input
              label="Specific Description for Other Medical Condition *"
              value={medicalOtherDesc}
              onChangeText={setMedicalOtherDesc}
              placeholder="e.g. Systemic Lupus Erythematosus, Chronic Kidney Disease"
            />
          </View>
        ) : null}

        <View style={styles.notesRow}>
          <Input
            label="Personal Medical History Notes"
            value={personalNotes}
            onChangeText={setPersonalNotes}
            placeholder="Clinical notes, disease severity, onset context..."
            multiline
            numberOfLines={2}
          />
        </View>
      </View>

      {/* SECTION 4: Interactive Family Medical History */}
      <View style={styles.sectionCard}>
        <View style={styles.sectionHeader}>
          <View style={styles.iconTitleRow}>
            <Icon name="heartPulse" size={theme.sizes.iconMd} color={theme.colors.primary} />
            <ThemedText variant="h3">Family Medical History</ThemedText>
          </View>
          <Badge
            label={`${selectedFamilyCodes.size} Selected`}
            variant={selectedFamilyCodes.size > 0 ? 'primary' : 'outline'}
          />
        </View>

        <ThemedText variant="small" color={theme.colors.textSecondary} style={styles.sectionDescription}>
          Documented hereditary and familial health risk factors.
        </ThemedText>

        <View style={styles.chipsWrap}>
          {availableConditions.map((cond) => {
            const isSelected = selectedFamilyCodes.has(cond.code);
            return (
              <Pressable
                key={`family-${cond.code}`}
                onPress={() => toggleFamilyCondition(cond.code)}
                accessibilityRole="button"
                accessibilityLabel={`Toggle family ${cond.description}`}
                accessibilityState={{ selected: isSelected }}
                style={[
                  styles.toggleChip,
                  isSelected && styles.toggleChip_active,
                ]}
              >
                <Icon
                  name={isSelected ? 'check' : 'plus'}
                  size={theme.fontSizes.sm}
                  color={isSelected ? theme.colors.primaryDark : theme.colors.textSecondary}
                />
                <ThemedText
                  variant="smallBold"
                  color={isSelected ? theme.colors.primaryDark : theme.colors.textSecondary}
                >
                  {cond.description}
                </ThemedText>
              </Pressable>
            );
          })}
        </View>

        {selectedFamilyCodes.has('998') ? (
          <View style={styles.otherInputRow}>
            <Input
              label="Specific Description for Other Family Condition *"
              value={familyOtherDesc}
              onChangeText={setFamilyOtherDesc}
              placeholder="e.g. Familial Hypercholesterolemia, Polycystic Kidney Disease"
            />
          </View>
        ) : null}

        <View style={styles.notesRow}>
          <Input
            label="Family Medical History Notes"
            value={familyNotes}
            onChangeText={setFamilyNotes}
            placeholder="Pedigree notes, affected 1st-degree relatives, age of onset..."
            multiline
            numberOfLines={2}
          />
        </View>
      </View>

      {/* SECTION 5: Save Profile Persistence Action */}
      <View style={styles.persistenceCard}>
        {profileError ? (
          <View style={styles.formErrorBanner}>
            <Icon name="alertCircle" size={theme.sizes.iconSm} color={theme.colors.emergencyText} />
            <ThemedText variant="small" color={theme.colors.emergencyText}>
              {profileError}
            </ThemedText>
          </View>
        ) : null}

        {profileSuccess ? (
          <View style={styles.successBanner}>
            <Icon name="checkCircle" size={theme.sizes.iconSm} color={theme.colors.successText} />
            <ThemedText variant="small" color={theme.colors.successText}>
              Medical &amp; family history saved successfully to PhilHealth profile.
            </ThemedText>
          </View>
        ) : null}

        <View style={styles.saveActionRow}>
          <Button
            title="Save Medical & Family History"
            variant="primary"
            icon="check"
            loading={savingProfile}
            onPress={handleSaveMedicalAndFamilyHistory}
          />
        </View>
      </View>

      {/* SECTION 6: Relational Surgical Procedure History */}
      <View style={styles.sectionCard}>
        <View style={styles.sectionHeader}>
          <View style={styles.iconTitleRow}>
            <Icon name="file" size={theme.sizes.iconMd} color={theme.colors.primary} />
            <ThemedText variant="h3">Surgical Procedures History</ThemedText>
          </View>
          <Button
            title="Add Procedure"
            variant="primary"
            size="sm"
            icon="plus"
            onPress={openAddModal}
          />
        </View>

        <ThemedText variant="small" color={theme.colors.textSecondary} style={styles.sectionDescription}>
          Structured surgical history. Relational entities enforce multi-tenant isolation and eliminate disconnected modal state.
        </ThemedText>

        {loading ? (
          <SkeletonList rows={3} />
        ) : error ? (
          <ErrorState
            title="Unable to load surgical history"
            message={error}
            onRetry={fetchSurgicalHistories}
          />
        ) : surgicalHistories.length === 0 ? (
          <View style={styles.statutoryEmptyBanner}>
            <View style={styles.statutoryBannerHeader}>
              <Icon name="shield" size={theme.sizes.iconMd} color={theme.colors.infoText} />
              <ThemedText variant="bodyBold" color={theme.colors.infoText}>
                No Past Surgical Procedures Documented
              </ThemedText>
            </View>
            <ThemedText variant="small" color={theme.colors.textSecondary} style={{ marginTop: theme.spacing.xs }}>
              Statutory declaration active: Yakap eKAS / eSER transmittal will automatically populate the required
              PhilHealth fallback <ThemedText variant="code" color={theme.colors.textSecondary}>pSurgDesc=&quot;None&quot; pSurgDate=&quot;1900-01-01&quot;</ThemedText>.
            </ThemedText>
          </View>
        ) : (
          <View style={styles.proceduresList}>
            {surgicalHistories.map((item) => (
              <View key={item.id} style={styles.procedureCard}>
                <View style={styles.procedureHeader}>
                  <View style={{ flex: 1 }}>
                    <ThemedText variant="bodyBold" color={theme.colors.text}>
                      {item.procedureName}
                    </ThemedText>
                    <ThemedText variant="small" color={theme.colors.textSecondary}>
                      Date: {item.surgeryDate ? item.surgeryDate.split('T')[0] : '—'}
                      {item.hospitalName ? ` • Facility: ${item.hospitalName}` : ''}
                    </ThemedText>
                  </View>
                  <View style={styles.cardActions}>
                    <Pressable
                      style={styles.actionIconBtn}
                      onPress={() => openEditModal(item)}
                      accessibilityLabel="Edit procedure"
                    >
                      <Icon name="edit" size={theme.sizes.iconSm} color={theme.colors.primary} />
                    </Pressable>
                    <Pressable
                      style={styles.actionIconBtn}
                      onPress={() => handleDelete(item)}
                      disabled={deletingId === item.id}
                      accessibilityLabel="Delete procedure"
                    >
                      {deletingId === item.id ? (
                        <ActivityIndicator size="small" color={theme.colors.emergencyText} />
                      ) : (
                        <Icon name="trash" size={theme.sizes.iconSm} color={theme.colors.emergencyText} />
                      )}
                    </Pressable>
                  </View>
                </View>

                {item.findings ? (
                  <View style={styles.detailRow}>
                    <ThemedText variant="captionBold" color={theme.colors.textMuted}>Findings: </ThemedText>
                    <ThemedText variant="small" color={theme.colors.text}>{item.findings}</ThemedText>
                  </View>
                ) : null}

                {item.complications ? (
                  <View style={styles.detailRow}>
                    <ThemedText variant="captionBold" color={theme.colors.emergencyText}>Complications: </ThemedText>
                    <ThemedText variant="small" color={theme.colors.emergencyText}>{item.complications}</ThemedText>
                  </View>
                ) : null}

                {item.remarks ? (
                  <View style={styles.detailRow}>
                    <ThemedText variant="captionBold" color={theme.colors.textMuted}>Remarks: </ThemedText>
                    <ThemedText variant="small" color={theme.colors.textSecondary}>{item.remarks}</ThemedText>
                  </View>
                ) : null}
              </View>
            ))}
          </View>
        )}
      </View>

      {/* Modal for Add / Edit Surgical Procedure */}
      <Modal
        visible={modalVisible}
        onClose={() => !saving && setModalVisible(false)}
        title={editingItem ? 'Edit Surgical Procedure' : 'Record Surgical Procedure'}
      >
        <ScrollView contentContainerStyle={styles.modalFormContent}>
          {formError ? (
            <View style={styles.formErrorBanner}>
              <Icon name="alertCircle" size={theme.sizes.iconSm} color={theme.colors.emergencyText} />
              <ThemedText variant="small" color={theme.colors.emergencyText}>
                {formError}
              </ThemedText>
            </View>
          ) : null}

          <Input
            label="Procedure Name *"
            value={procedureName}
            onChangeText={setProcedureName}
            placeholder="e.g. Appendectomy, Cesarean Section"
          />

          <ValidatedDateInput
            label="Surgery Date (YYYY-MM-DD)"
            required
            value={surgeryDate}
            onChangeText={setSurgeryDate}
            boundaryMode="pastOrToday"
            placeholder="YYYY-MM-DD"
          />

          <Input
            label="Hospital / Medical Facility"
            value={hospitalName}
            onChangeText={setHospitalName}
            placeholder="e.g. Philippine General Hospital"
          />

          <Input
            label="Intraoperative Findings"
            value={findings}
            onChangeText={setFindings}
            placeholder="Observations, pathology findings"
            multiline
            numberOfLines={2}
          />

          <Input
            label="Complications (if any)"
            value={complications}
            onChangeText={setComplications}
            placeholder="Post-op infection, bleeding, etc."
          />

          <Input
            label="Clinical Remarks"
            value={remarks}
            onChangeText={setRemarks}
            placeholder="Additional notes"
            multiline
            numberOfLines={2}
          />

          <View style={styles.modalFooter}>
            <Button
              title="Cancel"
              variant="outline"
              size="md"
              disabled={saving}
              onPress={() => setModalVisible(false)}
            />
            <Button
              title={saving ? 'Saving…' : editingItem ? 'Save Changes' : 'Record Procedure'}
              variant="primary"
              size="md"
              loading={saving}
              disabled={saving}
              onPress={handleSave}
            />
          </View>
        </ScrollView>
      </Modal>

      {/* Modal for Add Structured Problem */}
      <Modal
        visible={problemModalVisible}
        onClose={() => !savingProblem && setProblemModalVisible(false)}
        title="Record Clinical Problem"
      >
        <ScrollView contentContainerStyle={styles.modalFormContent}>
          {problemFormError ? (
            <View style={styles.formErrorBanner}>
              <Icon name="alertCircle" size={theme.sizes.iconSm} color={theme.colors.emergencyText} />
              <ThemedText variant="small" color={theme.colors.emergencyText}>
                {problemFormError}
              </ThemedText>
            </View>
          ) : null}

          <Icd10AutocompleteInput
            selectedCode={problemIcd10}
            selectedTitle={problemTitle}
            onSelect={(code, desc) => {
              setProblemIcd10(code);
              setProblemTitle(desc);
              setProblemFormError(null);
            }}
            onClear={() => {
              setProblemIcd10('');
              setProblemTitle('');
            }}
            onTitleChange={(title) => {
              setProblemTitle(title);
            }}
            required
          />

          <ValidatedDateInput
            label="Onset Date (YYYY-MM-DD)"
            value={problemOnsetDate}
            onChangeText={setProblemOnsetDate}
            boundaryMode="pastOrToday"
            placeholder="YYYY-MM-DD"
          />

          <Input
            label="Clinical Notes / Findings"
            value={problemNotes}
            onChangeText={setProblemNotes}
            placeholder="Pertinent findings, current management"
            multiline
            numberOfLines={2}
          />

          <View style={styles.modalFooter}>
            <Button
              title="Cancel"
              variant="outline"
              size="md"
              disabled={savingProblem}
              onPress={() => setProblemModalVisible(false)}
            />
            <Button
              title={savingProblem ? 'Saving…' : 'Record Problem'}
              variant="primary"
              size="md"
              loading={savingProblem}
              disabled={savingProblem}
              onPress={handleSaveProblem}
            />
          </View>
        </ScrollView>
      </Modal>

      {/* Modal for Add Structured Allergy */}
      <Modal
        visible={allergyModalVisible}
        onClose={() => !savingAllergy && setAllergyModalVisible(false)}
        title="Document Allergy / Adverse Sensitivity"
      >
        <ScrollView contentContainerStyle={styles.modalFormContent}>
          {allergyFormError ? (
            <View style={styles.formErrorBanner}>
              <Icon name="alertCircle" size={theme.sizes.iconSm} color={theme.colors.emergencyText} />
              <ThemedText variant="small" color={theme.colors.emergencyText}>
                {allergyFormError}
              </ThemedText>
            </View>
          ) : null}

          <Input
            label="Allergen Name *"
            value={allergen}
            onChangeText={setAllergen}
            placeholder="e.g. Penicillin, Amoxicillin, Peanuts"
          />

          <Input
            label="Reaction Manifestation"
            value={allergyReaction}
            onChangeText={setAllergyReaction}
            placeholder="e.g. Urticaria, Facial swelling, Anaphylaxis"
          />

          <Input
            label="Clinical Notes"
            value={allergyNotes}
            onChangeText={setAllergyNotes}
            placeholder="Prior reaction history, date of onset"
            multiline
            numberOfLines={2}
          />

          <View style={styles.modalFooter}>
            <Button
              title="Cancel"
              variant="outline"
              size="md"
              disabled={savingAllergy}
              onPress={() => setAllergyModalVisible(false)}
            />
            <Button
              title={savingAllergy ? 'Saving…' : 'Document Allergy'}
              variant="primary"
              size="md"
              loading={savingAllergy}
              disabled={savingAllergy}
              onPress={handleSaveAllergy}
            />
          </View>
        </ScrollView>
      </Modal>
    </ScrollView>
  );
}

const styles = StyleSheet.create({
  container: {
    flex: 1,
  },
  content: {
    paddingBottom: theme.spacing.xl,
    gap: theme.spacing.md,
  },
  sectionCard: {
    backgroundColor: theme.colors.surface,
    borderRadius: theme.radii.lg,
    borderWidth: 1,
    borderColor: theme.colors.border,
    padding: theme.spacing.md,
    gap: theme.spacing.sm,
  },
  sectionHeader: {
    flexDirection: 'row',
    alignItems: 'center',
    justifyContent: 'space-between',
  },
  iconTitleRow: {
    flexDirection: 'row',
    alignItems: 'center',
    gap: theme.spacing.sm,
  },
  badgeRow: {
    flexDirection: 'row',
    alignItems: 'center',
    gap: theme.spacing.xs,
  },
  sectionDescription: {
    marginBottom: theme.spacing.xs,
  },
  chipsWrap: {
    flexDirection: 'row',
    flexWrap: 'wrap',
    gap: theme.spacing.xs,
  },
  conditionChip: {
    flexDirection: 'row',
    alignItems: 'center',
    gap: theme.spacing.xs,
    backgroundColor: theme.colors.primaryLight,
    borderColor: theme.colors.primaryBorder,
    borderWidth: 1,
    paddingHorizontal: theme.spacing.sm,
    paddingVertical: theme.spacing.xs,
    borderRadius: theme.radii.full,
  },
  toggleChip: {
    flexDirection: 'row',
    alignItems: 'center',
    gap: theme.spacing.xs,
    backgroundColor: theme.colors.surfaceSubtle,
    borderColor: theme.colors.borderLight,
    borderWidth: 1,
    paddingHorizontal: theme.spacing.sm,
    paddingVertical: theme.spacing.xs,
    borderRadius: theme.radii.full,
  },
  toggleChip_active: {
    backgroundColor: theme.colors.primaryLight,
    borderColor: theme.colors.primary,
  },
  otherInputRow: {
    marginTop: theme.spacing.xs,
  },
  notesRow: {
    marginTop: theme.spacing.xs,
  },
  persistenceCard: {
    gap: theme.spacing.sm,
  },
  saveActionRow: {
    flexDirection: 'row',
    justifyContent: 'flex-start',
  },
  successBanner: {
    flexDirection: 'row',
    alignItems: 'center',
    gap: theme.spacing.xs,
    backgroundColor: theme.colors.successBg,
    borderColor: theme.colors.successBorder,
    borderWidth: 1,
    borderRadius: theme.radii.md,
    padding: theme.spacing.sm,
  },
  emptyNoticeStrip: {
    flexDirection: 'row',
    alignItems: 'center',
    gap: theme.spacing.xs,
    padding: theme.spacing.sm,
    backgroundColor: theme.colors.surfaceSubtle,
    borderRadius: theme.radii.md,
  },
  statutoryEmptyBanner: {
    backgroundColor: theme.colors.infoBg,
    borderColor: theme.colors.infoBorder,
    borderWidth: 1,
    borderRadius: theme.radii.md,
    padding: theme.spacing.md,
  },
  statutoryBannerHeader: {
    flexDirection: 'row',
    alignItems: 'center',
    gap: theme.spacing.sm,
  },
  proceduresList: {
    gap: theme.spacing.sm,
  },
  procedureCard: {
    backgroundColor: theme.colors.surface,
    borderColor: theme.colors.borderLight,
    borderWidth: 1,
    borderRadius: theme.radii.md,
    padding: theme.spacing.md,
    gap: theme.spacing.xs,
  },
  procedureHeader: {
    flexDirection: 'row',
    alignItems: 'flex-start',
    justifyContent: 'space-between',
  },
  cardActions: {
    flexDirection: 'row',
    gap: theme.spacing.xs,
  },
  actionIconBtn: {
    padding: theme.spacing.xs,
    borderRadius: theme.radii.sm,
  },
  detailRow: {
    flexDirection: 'row',
    alignItems: 'center',
    flexWrap: 'wrap',
  },
  modalFormContent: {
    gap: theme.spacing.sm,
    paddingBottom: theme.spacing.lg,
  },
  formErrorBanner: {
    flexDirection: 'row',
    alignItems: 'center',
    gap: theme.spacing.xs,
    backgroundColor: theme.colors.emergencyBg,
    borderColor: theme.colors.emergencyBorder,
    borderWidth: 1,
    borderRadius: theme.radii.md,
    padding: theme.spacing.sm,
  },
  modalFooter: {
    flexDirection: 'row',
    justifyContent: 'flex-end',
    gap: theme.spacing.sm,
    marginTop: theme.spacing.md,
  },
});
