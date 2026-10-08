import { useEffect, useState, useRef, useCallback } from 'react';
import { ScrollView, StyleSheet, KeyboardAvoidingView, Platform } from 'react-native';
import { useNavigation } from '@react-navigation/native';
import { useForm, Controller } from 'react-hook-form';
import { db } from '@db/index';
import { patientObstetricProfile } from '@db/schema/patientObstetricProfile';
import { patientPregnancies } from '@db/schema/patientPregnancies';
import { patientContraceptiveHistory } from '@db/schema/patientContraceptiveHistory';
import { eq } from 'drizzle-orm';
import { BottomSheetModalProvider } from '@gorhom/bottom-sheet';
import BottomSheetScrollView from '@ui/ThemedBottomSheetScrollView';
import type { BottomSheetModal as BottomSheetModalType } from '@gorhom/bottom-sheet';
import ThemedBottomSheetModal from '@ui/ThemedBottomSheetModal';
import { randomUUID } from 'expo-crypto';
import ProfileFormField from 'components/profile/ProfileFormField';
import ProfileListItemCard from 'components/profile/ProfileListItemCard';
import ProfileAddButton from 'components/profile/ProfileAddButton';
import ProfileSectionHeader from 'components/profile/ProfileSectionHeader';
import ProfileSaveBar from 'components/profile/ProfileSaveBar';
import ProfileSelectModal from 'components/profile/ProfileSelectModal';
import ProfileToggle from 'components/profile/ProfileToggle';
import ProfileDatePicker from 'components/profile/ProfileDatePicker';
import Screen from 'components/layout/Screen';
import { usePatientId } from 'hooks/usePatientId';
import { useAuth } from 'contexts/AuthContext';
import { useAppTheme } from 'contexts/ThemeContext';
import { dialog } from '@utils/dialog';
import { flushAndSyncProfile, deleteProfileListItem } from 'services/api/syncService';
import { deletePatientPregnancy, deletePatientContraceptiveHistory } from 'services/api/patientApi';
import { useProfileSync } from 'hooks/useProfileSync';

// ── Obstetric Profile Form ──────────────────────────────────────────────────

type ObsForm = {
  menarche: string;
  lastMenstrualPeriod: string;
  cycleLength: string;
  cycleDuration: string;
  dysmenorrhea: string;
  menopauseAge: string;
  gravida: string;
  para: string;
  abortion: string;
  living: string;
};

// ── Pregnancy Form ──────────────────────────────────────────────────────────

type PregForm = {
  id: string | null;
  year: string;
  outcome: string;
  gestationalWeeks: string;
  deliveryMode: string;
  complications: string;
};

const OUTCOME_OPTIONS = [
  { label: 'Live Birth', value: 'LiveBirth' },
  { label: 'Stillbirth', value: 'Stillbirth' },
  { label: 'Miscarriage', value: 'Miscarriage' },
  { label: 'Ectopic', value: 'Ectopic' },
  { label: 'Induced Abortion', value: 'Abortion' },
];
const DELIVERY_OPTIONS = [
  { label: 'Normal Spontaneous Vaginal', value: 'NSVD' },
  { label: 'Caesarean Section', value: 'CS' },
  { label: 'Forceps Delivery', value: 'Forceps' },
  { label: 'Vacuum Extraction', value: 'Vacuum' },
];

// ── Contraceptive Form ──────────────────────────────────────────────────────

type ContraForm = {
  id: string | null;
  method: string;
  isCurrent: boolean;
  startDate: string;
  stopReason: string;
};

const CONTRA_OPTIONS = [
  { label: 'Combined Oral Contraceptive Pill', value: 'COCP' },
  { label: 'Progestin-Only Pill', value: 'POP' },
  { label: 'Injectable (Depo-Provera)', value: 'Injectable' },
  { label: 'IUD (Copper)', value: 'IUD_Copper' },
  { label: 'IUD (Hormonal/Mirena)', value: 'IUD_Hormonal' },
  { label: 'Implant', value: 'Implant' },
  { label: 'Male Condom', value: 'MaleCondom' },
  { label: 'Female Condom', value: 'FemaleCondom' },
  { label: 'Bilateral Tubal Ligation', value: 'BTL' },
  { label: 'Vasectomy (Partner)', value: 'Vasectomy' },
  { label: 'Calendar / NFP', value: 'NFP' },
  { label: 'None', value: 'None' },
];

export default function ObstetricProfileScreen() {
  const patientId = usePatientId();
  const { getToken } = useAuth();
  const { spacing } = useAppTheme();
  const navigation = useNavigation();
  const [saving, setSaving] = useState(false);
  const [savingPreg, setSavingPreg] = useState(false);
  const [savingContra, setSavingContra] = useState(false);
  const [pregnancies, setPregnancies] = useState<any[]>([]);
  const [contraItems, setContraItems] = useState<any[]>([]);
  const [outcomeModal, setOutcomeModal] = useState(false);
  const [deliveryModal, setDeliveryModal] = useState(false);
  const [contraModal, setContraModal] = useState(false);
  const pregSheetRef = useRef<BottomSheetModalType>(null);
  const contraSheetRef = useRef<BottomSheetModalType>(null);

  const obsForm = useForm<ObsForm>({
    defaultValues: { menarche: '', lastMenstrualPeriod: '', cycleLength: '', cycleDuration: '', dysmenorrhea: '', menopauseAge: '', gravida: '', para: '', abortion: '', living: '' },
  });

  const pregForm = useForm<PregForm>({
    defaultValues: { id: null, year: '', outcome: '', gestationalWeeks: '', deliveryMode: '', complications: '' },
  });

  const contraForm = useForm<ContraForm>({
    defaultValues: { id: null, method: '', isCurrent: false, startDate: '', stopReason: '' },
  });

  const loadPregnancies = useCallback(async () => {
    try {
      const rows = await db.select().from(patientPregnancies).where(eq(patientPregnancies.patientId, patientId));
      setPregnancies(rows.filter((r) => !r.deletedAt));
    } catch (err) {
      console.warn('[ObstetricProfileScreen] Failed to load pregnancies:', err);
    }
  }, [patientId]);

  const loadContra = useCallback(async () => {
    try {
      const rows = await db.select().from(patientContraceptiveHistory).where(eq(patientContraceptiveHistory.patientId, patientId));
      setContraItems(rows.filter((r) => !r.deletedAt));
    } catch (err) {
      console.warn('[ObstetricProfileScreen] Failed to load contraceptive history:', err);
    }
  }, [patientId]);

  const [hasObsRecord, setHasObsRecord] = useState(false);

  const loadObsProfile = useCallback(async () => {
    try {
      const row = await db.query.patientObstetricProfile.findFirst({
        where: eq(patientObstetricProfile.patientId, patientId),
      });
      if (row) {
        setHasObsRecord(true);
        obsForm.reset({
          menarche: row.ageAtMenarche?.toString() ?? '',
          lastMenstrualPeriod: row.lmp ?? '',
          cycleLength: row.cycleLength?.toString() ?? '',
          cycleDuration: row.cycleDuration?.toString() ?? '',
          dysmenorrhea: row.dysmenorrheaSeverity ?? '',
          menopauseAge: row.ageAtMenopause?.toString() ?? '',
          gravida: row.gravida?.toString() ?? '',
          para: row.para?.toString() ?? '',
          abortion: row.abortion?.toString() ?? '',
          living: row.livingChildren?.toString() ?? '',
        });
      }
    } catch (err) {
      console.warn('[ObstetricProfileScreen] Failed to load obs profile:', err);
    }
  }, [patientId, obsForm]);

  const load = useCallback(async () => {
    await Promise.all([loadObsProfile(), loadPregnancies(), loadContra()]);
  }, [loadObsProfile, loadPregnancies, loadContra]);

  useEffect(() => {
    load();
  }, [load]);

  useProfileSync(load);

  const onSaveObs = obsForm.handleSubmit(async (data) => {
    setSaving(true);
    try {
      const payload = {
        patientId,
        ageAtMenarche: data.menarche ? parseInt(data.menarche, 10) : null,
        lmp: data.lastMenstrualPeriod || null,
        cycleLength: data.cycleLength ? parseInt(data.cycleLength, 10) : null,
        cycleDuration: data.cycleDuration ? parseInt(data.cycleDuration, 10) : null,
        dysmenorrheaSeverity: (data.dysmenorrhea as 'None' | 'Mild' | 'Moderate' | 'Severe') || null,
        ageAtMenopause: data.menopauseAge ? parseInt(data.menopauseAge, 10) : null,
        gravida: data.gravida ? parseInt(data.gravida, 10) : null,
        para: data.para ? parseInt(data.para, 10) : null,
        abortion: data.abortion ? parseInt(data.abortion, 10) : null,
        livingChildren: data.living ? parseInt(data.living, 10) : null,
        updatedAt: new Date(),
      };
      if (hasObsRecord) {
        await db
          .update(patientObstetricProfile)
          .set(payload)
          .where(eq(patientObstetricProfile.patientId, patientId));
      } else {
        await db.insert(patientObstetricProfile).values({
          id: randomUUID(),
          ...payload,
          createdAt: new Date(),
        });
        setHasObsRecord(true);
      }

      const syncResult = await flushAndSyncProfile(patientId, getToken);
      obsForm.reset(data);

      if (syncResult.isOffline) {
        dialog.alert('Saved Offline', 'Obstetric profile saved locally and will sync when you are back online.');
      } else if (!syncResult.success && syncResult.failed > 0) {
        dialog.alert(
          'Sync Warning',
          `Saved locally, but server sync failed: ${syncResult.reason || 'Server conflict or validation error'}. Changes will retry automatically.`
        );
      } else {
        dialog.alert('Saved', 'Obstetric profile saved successfully.');
      }
    } catch (e: any) {
      console.error(e);
      dialog.alert('Error', e?.message || 'Failed to save obstetric profile.');
    } finally {
      setSaving(false);
    }
  });

  const onSavePreg = pregForm.handleSubmit(async (data) => {
    setSavingPreg(true);
    try {
      const { id, ...rest } = data;
      const fields = {
        patientId,
        year: rest.year ? parseInt(rest.year, 10) : null,
        outcome: rest.outcome || null,
        gestationalAgeWeeks: rest.gestationalWeeks ? parseInt(rest.gestationalWeeks, 10) : null,
        deliveryType: rest.deliveryMode || null,
        complications: rest.complications.trim() || null,
        updatedAt: new Date(),
      };
      if (id) {
        await db.update(patientPregnancies).set(fields).where(eq(patientPregnancies.id, id));
      } else {
        await db.insert(patientPregnancies).values({ id: randomUUID(), ...fields, createdAt: new Date() });
      }
      const syncResult = await flushAndSyncProfile(patientId, getToken);
      pregSheetRef.current?.dismiss();
      loadPregnancies();

      if (syncResult.isOffline) {
        dialog.alert('Saved Offline', 'Pregnancy record saved locally and will sync when you are back online.');
      } else if (!syncResult.success && syncResult.failed > 0) {
        dialog.alert(
          'Sync Warning',
          `Saved locally, but server sync failed: ${syncResult.reason || 'Server conflict or validation error'}. Changes will retry automatically.`
        );
      } else {
        dialog.alert('Saved', 'Pregnancy record saved successfully.');
      }
    } catch (e: any) {
      console.error(e);
      dialog.alert('Error', e?.message || 'Failed to save pregnancy record.');
    } finally {
      setSavingPreg(false);
    }
  });

  const onDeletePreg = async (id: string, serverId?: string | null, label?: string) => {
    const confirmed = await dialog.confirm({
      title: 'Delete Pregnancy Record',
      message: `Are you sure you want to remove ${label || 'this record'}?`,
      confirmLabel: 'Delete',
      destructive: true,
    });
    if (!confirmed) return;
    try {
      await deleteProfileListItem({
        table: patientPregnancies,
        entityType: 'patient_pregnancies',
        patientId,
        id,
        serverId,
        getToken,
        restDeleteFn: deletePatientPregnancy,
      });
      loadPregnancies();
    } catch (err: any) {
      dialog.alert('Error', err?.message || 'Failed to delete pregnancy record.');
    }
  };

  const onSaveContra = contraForm.handleSubmit(async (data) => {
    setSavingContra(true);
    const { id, ...rest } = data;
    const fields = {
      patientId,
      method: rest.method,
      isCurrent: rest.isCurrent,
      dateStarted: rest.startDate || null,
      reasonForStopping: rest.stopReason.trim() || null,
      updatedAt: new Date(),
    };
    try {
      if (id) {
        await db.update(patientContraceptiveHistory).set(fields).where(eq(patientContraceptiveHistory.id, id));
      } else {
        await db.insert(patientContraceptiveHistory).values({ id: randomUUID(), ...fields, createdAt: new Date() });
      }
      const syncResult = await flushAndSyncProfile(patientId, getToken);
      contraSheetRef.current?.dismiss();
      loadContra();

      if (syncResult.isOffline) {
        dialog.alert('Saved Offline', 'Contraceptive method saved locally and will sync when you are back online.');
      } else if (!syncResult.success && syncResult.failed > 0) {
        dialog.alert(
          'Sync Warning',
          `Saved locally, but server sync failed: ${syncResult.reason || 'Server conflict or validation error'}. Changes will retry automatically.`
        );
      } else {
        dialog.alert('Saved', 'Contraceptive method saved successfully.');
      }
    } catch (e: any) {
      console.error(e);
      dialog.alert('Error', e?.message || 'Failed to save contraceptive method.');
    } finally {
      setSavingContra(false);
    }
  });

  const onDeleteContra = async (id: string, serverId?: string | null, methodName?: string) => {
    const confirmed = await dialog.confirm({
      title: 'Delete Contraceptive Record',
      message: `Are you sure you want to remove ${methodName || 'this method'}?`,
      confirmLabel: 'Delete',
      destructive: true,
    });
    if (!confirmed) return;
    try {
      await deleteProfileListItem({
        table: patientContraceptiveHistory,
        entityType: 'patient_contraceptive_history',
        patientId,
        id,
        serverId,
        getToken,
        restDeleteFn: deletePatientContraceptiveHistory,
      });
      loadContra();
    } catch (err: any) {
      dialog.alert('Error', err?.message || 'Failed to delete contraceptive record.');
    }
  };

  return (
    <BottomSheetModalProvider>
      <Screen width="form" scroll={false} padded={false}>
        <KeyboardAvoidingView style={styles.flex} behavior={Platform.OS === 'ios' ? 'padding' : undefined}>
          <ScrollView contentInsetAdjustmentBehavior="automatic" contentContainerStyle={[styles.content, { padding: spacing.md }]} keyboardShouldPersistTaps="handled">
            <ProfileSectionHeader title="Menstrual History" />
            <Controller control={obsForm.control} name="menarche" render={({ field }) => (
              <ProfileFormField label="Age at Menarche" value={field.value} onChangeText={field.onChange} keyboardType="numeric" placeholder="e.g. 12" />
            )} />
            <Controller control={obsForm.control} name="lastMenstrualPeriod" render={({ field }) => (
              <ProfileDatePicker label="Last Menstrual Period" value={field.value} onChange={field.onChange} />
            )} />
            <Controller control={obsForm.control} name="cycleLength" render={({ field }) => (
              <ProfileFormField label="Cycle Length (days)" value={field.value} onChangeText={field.onChange} keyboardType="numeric" placeholder="e.g. 28" />
            )} />
            <Controller control={obsForm.control} name="cycleDuration" render={({ field }) => (
              <ProfileFormField label="Menstrual Duration (days)" value={field.value} onChangeText={field.onChange} keyboardType="numeric" placeholder="e.g. 5" />
            )} />
            <Controller control={obsForm.control} name="dysmenorrhea" render={({ field }) => (
              <ProfileFormField label="Dysmenorrhea" value={field.value} onChangeText={field.onChange} placeholder="e.g. None, Mild, Severe" />
            )} />
            <Controller control={obsForm.control} name="menopauseAge" render={({ field }) => (
              <ProfileFormField label="Age at Menopause (if applicable)" value={field.value} onChangeText={field.onChange} keyboardType="numeric" placeholder="Optional" />
            )} />

            <ProfileSectionHeader title="Obstetric Summary (GPAL)" />
            <Controller control={obsForm.control} name="gravida" render={({ field }) => (
              <ProfileFormField label="Gravida (G) — Total Pregnancies" value={field.value} onChangeText={field.onChange} keyboardType="numeric" />
            )} />
            <Controller control={obsForm.control} name="para" render={({ field }) => (
              <ProfileFormField label="Para (P) — Live Births" value={field.value} onChangeText={field.onChange} keyboardType="numeric" />
            )} />
            <Controller control={obsForm.control} name="abortion" render={({ field }) => (
              <ProfileFormField label="Abortion (A) — Losses" value={field.value} onChangeText={field.onChange} keyboardType="numeric" />
            )} />
            <Controller control={obsForm.control} name="living" render={({ field }) => (
              <ProfileFormField label="Living Children (L)" value={field.value} onChangeText={field.onChange} keyboardType="numeric" />
            )} />

            <ProfileSaveBar onSave={onSaveObs} saving={saving} isDirty={obsForm.formState.isDirty} label="Save Obstetric Profile" />

            <ProfileSectionHeader title="Pregnancy History" />
            {pregnancies.map((p) => {
              const outcomeLabel = OUTCOME_OPTIONS.find(o => o.value === p.outcome)?.label ?? p.outcome;
              const deliveryLabel = DELIVERY_OPTIONS.find(o => o.value === p.deliveryType)?.label ?? p.deliveryType;
              const cardTitle = [outcomeLabel, p.year ? `${p.year}` : ''].filter(Boolean).join(' — ');
              return (
                <ProfileListItemCard
                  key={p.id}
                  title={cardTitle}
                  subtitle={deliveryLabel}
                  onEdit={() => {
                    pregForm.reset({
                      id: p.id,
                      year: p.year?.toString() ?? '',
                      outcome: p.outcome ?? '',
                      gestationalWeeks: p.gestationalAgeWeeks?.toString() ?? '',
                      deliveryMode: p.deliveryType ?? '',
                      complications: p.complications ?? '',
                    });
                    pregSheetRef.current?.present();
                  }}
                  onDelete={() => onDeletePreg(p.id, p.serverId, cardTitle)}
                />
              );
            })}
            <ProfileAddButton
              label="Add Pregnancy"
              onPress={() => {
                pregForm.reset({ id: null, year: '', outcome: '', gestationalWeeks: '', deliveryMode: '', complications: '' });
                pregSheetRef.current?.present();
              }}
            />

            <ProfileSectionHeader title="Contraceptive History" />
            {contraItems.map((c) => {
              const methodLabel = CONTRA_OPTIONS.find(o => o.value === c.method)?.label ?? c.method;
              return (
                <ProfileListItemCard
                  key={c.id}
                  title={methodLabel}
                  badge={c.isCurrent ? 'Current' : 'Past'}
                  subtitle={c.dateStarted ? `Started: ${c.dateStarted}` : undefined}
                  onEdit={() => {
                    contraForm.reset({
                      id: c.id,
                      method: c.method ?? '',
                      isCurrent: Boolean(c.isCurrent),
                      startDate: c.dateStarted ?? '',
                      stopReason: c.reasonForStopping ?? '',
                    });
                    contraSheetRef.current?.present();
                  }}
                  onDelete={() => onDeleteContra(c.id, c.serverId, methodLabel)}
                />
              );
            })}
            <ProfileAddButton
              label="Add Contraceptive Method"
              onPress={() => {
                contraForm.reset({ id: null, method: '', isCurrent: false, startDate: '', stopReason: '' });
                contraSheetRef.current?.present();
              }}
            />
          </ScrollView>
        </KeyboardAvoidingView>
      </Screen>

      {/* Pregnancy Sheet */}
      <ThemedBottomSheetModal ref={pregSheetRef} snapPoints={['55%', '80%']} enablePanDownToClose keyboardBehavior="interactive" keyboardBlurBehavior="restore">
        <BottomSheetScrollView contentContainerStyle={styles.sheetContent} keyboardShouldPersistTaps="handled">
          <ProfileSectionHeader title="Pregnancy" />
          <Controller control={pregForm.control} name="outcome" render={({ field }) => (
            <ProfileFormField label="Outcome" value={OUTCOME_OPTIONS.find(o => o.value === field.value)?.label || ''} onPressIn={() => setOutcomeModal(true)} placeholder="Select outcome" picker />
          )} />
          <Controller control={pregForm.control} name="year" render={({ field }) => (
            <ProfileFormField label="Year" value={field.value} onChangeText={field.onChange} keyboardType="numeric" placeholder="YYYY" />
          )} />
          <Controller control={pregForm.control} name="gestationalWeeks" render={({ field }) => (
            <ProfileFormField label="Gestational Age (weeks)" value={field.value} onChangeText={field.onChange} keyboardType="numeric" />
          )} />
          <Controller control={pregForm.control} name="deliveryMode" render={({ field }) => (
            <ProfileFormField label="Delivery Mode" value={DELIVERY_OPTIONS.find(o => o.value === field.value)?.label || ''} onPressIn={() => setDeliveryModal(true)} placeholder="Select mode" picker />
          )} />
          <Controller control={pregForm.control} name="complications" render={({ field }) => (
            <ProfileFormField label="Complications" value={field.value} onChangeText={field.onChange} multiline placeholder="None, or describe" />
          )} />
        </BottomSheetScrollView>
        <ProfileSaveBar onSave={onSavePreg} saving={savingPreg} isDirty={pregForm.formState.isDirty} label="Save Pregnancy" />
      </ThemedBottomSheetModal>

      {/* Contraceptive Sheet */}
      <ThemedBottomSheetModal ref={contraSheetRef} snapPoints={['50%', '75%']} enablePanDownToClose keyboardBehavior="interactive" keyboardBlurBehavior="restore">
        <BottomSheetScrollView contentContainerStyle={styles.sheetContent} keyboardShouldPersistTaps="handled">
          <ProfileSectionHeader title="Contraceptive Method" />
          <Controller control={contraForm.control} name="method" render={({ field }) => (
            <ProfileFormField label="Method" value={CONTRA_OPTIONS.find(o => o.value === field.value)?.label || ''} onPressIn={() => setContraModal(true)} placeholder="Select method" picker />
          )} />
          <Controller control={contraForm.control} name="isCurrent" render={({ field }) => (
            <ProfileToggle label="Currently Using" value={field.value} onValueChange={field.onChange} />
          )} />
          <Controller control={contraForm.control} name="startDate" render={({ field }) => (
            <ProfileDatePicker label="Start Date" value={field.value} onChange={field.onChange} />
          )} />
          <Controller control={contraForm.control} name="stopReason" render={({ field }) => (
            <ProfileFormField label="Reason for Stopping" value={field.value} onChangeText={field.onChange} multiline placeholder="Optional" />
          )} />
        </BottomSheetScrollView>
        <ProfileSaveBar onSave={onSaveContra} saving={savingContra} isDirty={contraForm.formState.isDirty} label="Save Method" />
      </ThemedBottomSheetModal>

      <Controller control={pregForm.control} name="outcome" render={({ field }) => (
        <ProfileSelectModal visible={outcomeModal} title="Pregnancy Outcome" options={OUTCOME_OPTIONS} selected={field.value} onSelect={field.onChange} onClose={() => setOutcomeModal(false)} />
      )} />
      <Controller control={pregForm.control} name="deliveryMode" render={({ field }) => (
        <ProfileSelectModal visible={deliveryModal} title="Delivery Mode" options={DELIVERY_OPTIONS} selected={field.value} onSelect={field.onChange} onClose={() => setDeliveryModal(false)} />
      )} />
      <Controller control={contraForm.control} name="method" render={({ field }) => (
        <ProfileSelectModal visible={contraModal} title="Contraceptive Method" options={CONTRA_OPTIONS} selected={field.value} onSelect={field.onChange} onClose={() => setContraModal(false)} />
      )} />
    </BottomSheetModalProvider>
  );
}

const styles = StyleSheet.create({
  flex: { flex: 1 },
  content: { paddingBottom: 40 },
  sheetContent: { padding: 16, paddingBottom: 16 },
});
