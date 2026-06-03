import { useEffect, useState, useRef } from 'react';
import { ScrollView, StyleSheet, KeyboardAvoidingView, Platform } from 'react-native';
import { useNavigation } from '@react-navigation/native';
import { useForm, Controller } from 'react-hook-form';
import { db } from '@db/index';
import { patientObstetricProfile } from '@db/schema/patientObstetricProfile';
import { patientPregnancies } from '@db/schema/patientPregnancies';
import { patientContraceptiveHistory } from '@db/schema/patientContraceptiveHistory';
import { eq } from 'drizzle-orm';
import { BottomSheetModal, BottomSheetModalProvider } from '@gorhom/bottom-sheet';
import { randomUUID } from 'expo-crypto';
import ProfileFormField from 'components/profile/ProfileFormField';
import ProfileListItemCard from 'components/profile/ProfileListItemCard';
import ProfileAddButton from 'components/profile/ProfileAddButton';
import ProfileSectionHeader from 'components/profile/ProfileSectionHeader';
import ProfileSaveBar from 'components/profile/ProfileSaveBar';
import ProfileSelectModal from 'components/profile/ProfileSelectModal';
import ProfileToggle from 'components/profile/ProfileToggle';
import ProfileDatePicker from 'components/profile/ProfileDatePicker';
import { usePatientId } from 'hooks/usePatientId';


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
  endDate: string;
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
  const navigation = useNavigation();
  const [saving, setSaving] = useState(false);
  const [savingPreg, setSavingPreg] = useState(false);
  const [savingContra, setSavingContra] = useState(false);
  const [pregnancies, setPregnancies] = useState<any[]>([]);
  const [contraItems, setContraItems] = useState<any[]>([]);
  const [outcomeModal, setOutcomeModal] = useState(false);
  const [deliveryModal, setDeliveryModal] = useState(false);
  const [contraModal, setContraModal] = useState(false);
  const pregSheetRef = useRef<BottomSheetModal>(null);
  const contraSheetRef = useRef<BottomSheetModal>(null);

  const obsForm = useForm<ObsForm>({
    defaultValues: { menarche: '', lastMenstrualPeriod: '', cycleLength: '', cycleDuration: '', dysmenorrhea: '', menopauseAge: '', gravida: '', para: '', abortion: '', living: '' },
  });

  const pregForm = useForm<PregForm>({
    defaultValues: { id: null, year: '', outcome: '', gestationalWeeks: '', deliveryMode: '', complications: '' },
  });

  const contraForm = useForm<ContraForm>({
    defaultValues: { id: null, method: '', isCurrent: false, startDate: '', endDate: '', stopReason: '' },
  });

  const loadPregnancies = async () => {
    const rows = await db.select().from(patientPregnancies).where(eq(patientPregnancies.patientId, patientId));
    setPregnancies(rows.filter((r) => !r.deletedAt));
  };
  const loadContra = async () => {
    const rows = await db.select().from(patientContraceptiveHistory).where(eq(patientContraceptiveHistory.patientId, patientId));
    setContraItems(rows.filter((r) => !r.deletedAt));
  };

  useEffect(() => {
    db.query.patientObstetricProfile.findFirst({ where: eq(patientObstetricProfile.patientId, patientId) })
      .then((row) => {
        if (row) {
          obsForm.reset({
            menarche: row.menarche?.toString() ?? '',
            lastMenstrualPeriod: row.lastMenstrualPeriod ?? '',
            cycleLength: row.cycleLength?.toString() ?? '',
            cycleDuration: row.cycleDuration?.toString() ?? '',
            dysmenorrhea: row.dysmenorrhea ?? '',
            menopauseAge: row.menopauseAge?.toString() ?? '',
            gravida: row.gravida?.toString() ?? '',
            para: row.para?.toString() ?? '',
            abortion: row.abortion?.toString() ?? '',
            living: row.living?.toString() ?? '',
          });
        }
      })
      .catch(console.error);
    loadPregnancies();
    loadContra();
  }, []);

  const onSaveObs = obsForm.handleSubmit(async (data) => {
    setSaving(true);
    try {
      const payload = {
        menarche: data.menarche ? parseInt(data.menarche) : null,
        lastMenstrualPeriod: data.lastMenstrualPeriod || null,
        cycleLength: data.cycleLength ? parseInt(data.cycleLength) : null,
        cycleDuration: data.cycleDuration ? parseInt(data.cycleDuration) : null,
        dysmenorrhea: data.dysmenorrhea || null,
        menopauseAge: data.menopauseAge ? parseInt(data.menopauseAge) : null,
        gravida: data.gravida ? parseInt(data.gravida) : null,
        para: data.para ? parseInt(data.para) : null,
        abortion: data.abortion ? parseInt(data.abortion) : null,
        living: data.living ? parseInt(data.living) : null,
        updatedAt: new Date(),
      };
      await db.insert(patientObstetricProfile).values({ id: randomUUID(), patientId: patientId, ...payload, createdAt: new Date() }).onConflictDoUpdate({ target: patientObstetricProfile.patientId, set: payload });
      obsForm.reset(data);
    } catch (e) { console.error(e); } finally { setSaving(false); }
  });

  const onSavePreg = pregForm.handleSubmit(async (data) => {
    setSavingPreg(true);
    try {
      const payload = { ...data, gestationalWeeks: data.gestationalWeeks ? parseInt(data.gestationalWeeks) : null, year: data.year ? parseInt(data.year) : null };
      if (data.id) {
        await db.update(patientPregnancies).set({ ...payload, updatedAt: new Date() }).where(eq(patientPregnancies.id, data.id));
      } else {
        await db.insert(patientPregnancies).values({ id: randomUUID(), patientId: patientId, ...payload, createdAt: new Date(), updatedAt: new Date() });
      }
      pregSheetRef.current?.dismiss();
      loadPregnancies();
    } catch (e) { console.error(e); } finally { setSavingPreg(false); }
  });

  const onSaveContra = contraForm.handleSubmit(async (data) => {
    setSavingContra(true);
    try {
      if (data.id) {
        await db.update(patientContraceptiveHistory).set({ ...data, updatedAt: new Date() }).where(eq(patientContraceptiveHistory.id, data.id));
      } else {
        await db.insert(patientContraceptiveHistory).values({ id: randomUUID(), patientId: patientId, ...data, createdAt: new Date(), updatedAt: new Date() });
      }
      contraSheetRef.current?.dismiss();
      loadContra();
    } catch (e) { console.error(e); } finally { setSavingContra(false); }
  });

  return (
    <BottomSheetModalProvider>
      <KeyboardAvoidingView style={styles.flex} behavior={Platform.OS === 'ios' ? 'padding' : undefined}>
        <ScrollView contentInsetAdjustmentBehavior="automatic" contentContainerStyle={styles.content} keyboardShouldPersistTaps="handled">
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
          {pregnancies.map((p) => (
            <ProfileListItemCard key={p.id} title={[OUTCOME_OPTIONS.find(o => o.value === p.outcome)?.label ?? p.outcome, p.year ? `${p.year}` : ''].filter(Boolean).join(' — ')} subtitle={p.deliveryMode} onEdit={() => { pregForm.reset({ id: p.id, year: p.year?.toString() ?? '', outcome: p.outcome ?? '', gestationalWeeks: p.gestationalWeeks?.toString() ?? '', deliveryMode: p.deliveryMode ?? '', complications: p.complications ?? '' }); pregSheetRef.current?.present(); }} onDelete={async () => { await db.update(patientPregnancies).set({ deletedAt: new Date() }).where(eq(patientPregnancies.id, p.id)); loadPregnancies(); }} />
          ))}
          <ProfileAddButton label="Add Pregnancy" onPress={() => { pregForm.reset({ id: null, year: '', outcome: '', gestationalWeeks: '', deliveryMode: '', complications: '' }); pregSheetRef.current?.present(); }} />

          <ProfileSectionHeader title="Contraceptive History" />
          {contraItems.map((c) => (
            <ProfileListItemCard key={c.id} title={CONTRA_OPTIONS.find(o => o.value === c.method)?.label ?? c.method} badge={c.isCurrent ? 'Current' : 'Past'} onEdit={() => { contraForm.reset({ id: c.id, method: c.method ?? '', isCurrent: c.isCurrent ?? false, startDate: c.startDate ?? '', endDate: c.endDate ?? '', stopReason: c.stopReason ?? '' }); contraSheetRef.current?.present(); }} onDelete={async () => { await db.update(patientContraceptiveHistory).set({ deletedAt: new Date() }).where(eq(patientContraceptiveHistory.id, c.id)); loadContra(); }} />
          ))}
          <ProfileAddButton label="Add Contraceptive Method" onPress={() => { contraForm.reset({ id: null, method: '', isCurrent: false, startDate: '', endDate: '', stopReason: '' }); contraSheetRef.current?.present(); }} />
        </ScrollView>
      </KeyboardAvoidingView>

      {/* Pregnancy Sheet */}
      <BottomSheetModal ref={pregSheetRef} snapPoints={['55%', '80%']} enablePanDownToClose keyboardBehavior="interactive" keyboardBlurBehavior="restore">
        <ScrollView contentContainerStyle={styles.sheetContent} keyboardShouldPersistTaps="handled">
          <ProfileSectionHeader title="Pregnancy" />
          <Controller control={pregForm.control} name="outcome" render={({ field }) => (
            <ProfileFormField label="Outcome" value={OUTCOME_OPTIONS.find(o => o.value === field.value)?.label || ''} onPressIn={() => setOutcomeModal(true)} placeholder="Select outcome" />
          )} />
          <Controller control={pregForm.control} name="year" render={({ field }) => (
            <ProfileFormField label="Year" value={field.value} onChangeText={field.onChange} keyboardType="numeric" placeholder="YYYY" />
          )} />
          <Controller control={pregForm.control} name="gestationalWeeks" render={({ field }) => (
            <ProfileFormField label="Gestational Age (weeks)" value={field.value} onChangeText={field.onChange} keyboardType="numeric" />
          )} />
          <Controller control={pregForm.control} name="deliveryMode" render={({ field }) => (
            <ProfileFormField label="Delivery Mode" value={DELIVERY_OPTIONS.find(o => o.value === field.value)?.label || ''} onPressIn={() => setDeliveryModal(true)} placeholder="Select mode" />
          )} />
          <Controller control={pregForm.control} name="complications" render={({ field }) => (
            <ProfileFormField label="Complications" value={field.value} onChangeText={field.onChange} multiline placeholder="None, or describe" />
          )} />
        </ScrollView>
        <ProfileSaveBar onSave={onSavePreg} saving={savingPreg} isDirty={pregForm.formState.isDirty} label="Save Pregnancy" />
        <Controller control={pregForm.control} name="outcome" render={({ field }) => (
          <ProfileSelectModal visible={outcomeModal} title="Pregnancy Outcome" options={OUTCOME_OPTIONS} selected={field.value} onSelect={field.onChange} onClose={() => setOutcomeModal(false)} />
        )} />
        <Controller control={pregForm.control} name="deliveryMode" render={({ field }) => (
          <ProfileSelectModal visible={deliveryModal} title="Delivery Mode" options={DELIVERY_OPTIONS} selected={field.value} onSelect={field.onChange} onClose={() => setDeliveryModal(false)} />
        )} />
      </BottomSheetModal>

      {/* Contraceptive Sheet */}
      <BottomSheetModal ref={contraSheetRef} snapPoints={['50%', '75%']} enablePanDownToClose keyboardBehavior="interactive" keyboardBlurBehavior="restore">
        <ScrollView contentContainerStyle={styles.sheetContent} keyboardShouldPersistTaps="handled">
          <ProfileSectionHeader title="Contraceptive Method" />
          <Controller control={contraForm.control} name="method" render={({ field }) => (
            <ProfileFormField label="Method" value={CONTRA_OPTIONS.find(o => o.value === field.value)?.label || ''} onPressIn={() => setContraModal(true)} placeholder="Select method" />
          )} />
          <Controller control={contraForm.control} name="isCurrent" render={({ field }) => (
            <ProfileToggle label="Currently Using" value={field.value} onValueChange={field.onChange} />
          )} />
          <Controller control={contraForm.control} name="startDate" render={({ field }) => (
            <ProfileDatePicker label="Start Date" value={field.value} onChange={field.onChange} />
          )} />
          <Controller control={contraForm.control} name="endDate" render={({ field }) => (
            <ProfileDatePicker label="End Date" value={field.value} onChange={field.onChange} />
          )} />
          <Controller control={contraForm.control} name="stopReason" render={({ field }) => (
            <ProfileFormField label="Reason for Stopping" value={field.value} onChangeText={field.onChange} multiline placeholder="Optional" />
          )} />
        </ScrollView>
        <ProfileSaveBar onSave={onSaveContra} saving={savingContra} isDirty={contraForm.formState.isDirty} label="Save Method" />
        <Controller control={contraForm.control} name="method" render={({ field }) => (
          <ProfileSelectModal visible={contraModal} title="Contraceptive Method" options={CONTRA_OPTIONS} selected={field.value} onSelect={field.onChange} onClose={() => setContraModal(false)} />
        )} />
      </BottomSheetModal>
    </BottomSheetModalProvider>
  );
}

const styles = StyleSheet.create({
  flex: { flex: 1 },
  content: { padding: 16, paddingBottom: 40 },
  sheetContent: { padding: 16, paddingBottom: 16 },
});
