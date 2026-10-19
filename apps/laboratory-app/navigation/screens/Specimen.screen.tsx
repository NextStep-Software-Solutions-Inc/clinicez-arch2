import React, { useEffect, useState } from 'react';
import { View, StyleSheet, ScrollView, Pressable, TextInput, Alert, RefreshControl, Modal, ActivityIndicator } from 'react-native';
import ThemedText from '@ui/ThemedText';
import PaymentSummary from '../../components/PaymentSummary';
import { laboratoryService, LabRequisitionItem, SpecimenItem, PrintableTubeStickerItem, RackInventoryItem, SpecimenContainerType, SpecimenRejectionReason, StorageTemperature } from '../../services/laboratoryService';
import { describeActionError, isPaymentRequiredError } from '../../utils/requisitionPresentation';

interface SpecimenWithMeta
  extends SpecimenItem,
    Pick<
      LabRequisitionItem,
      'stage' | 'paymentPolicy' | 'paymentRequired' | 'paid' | 'paidAtUtc' | 'receiptNumber' | 'quotedAmount' | 'currency'
    > {
  requisitionId: string;
  accessionNumber: string;
  patientName: string;
  patientAge: number;
  patientGender: string;
  philHealthPin?: string;
  urgency: string;
}

export default function SpecimenScreen() {
  const [specimens, setSpecimens] = useState<SpecimenWithMeta[]>([]);
  const [loading, setLoading] = useState(false);
  const [phlebName, setPhlebName] = useState('');
  const [filter, setFilter] = useState<'All' | 'Pending' | 'Collected' | 'Rejected' | 'Stored'>('All');

  // Sticker preview modal
  const [stickerModalVisible, setStickerModalVisible] = useState(false);
  const [selectedSticker, setSelectedSticker] = useState<PrintableTubeStickerItem | null>(null);

  // Rejection modal
  const [rejectModalVisible, setRejectModalVisible] = useState(false);
  const [targetSpecimen, setTargetSpecimen] = useState<SpecimenWithMeta | null>(null);
  const [rejectionReason, setRejectionReason] = useState<SpecimenRejectionReason>('Hemolyzed');
  const [rejectionNotes, setRejectionNotes] = useState('');
  const [correctiveAction, setCorrectiveAction] = useState('Recall patient for immediate re-collection');

  // Rack storage modal
  const [rackModalVisible, setRackModalVisible] = useState(false);
  const [rackId, setRackId] = useState('RACK-CHEM-A');
  const [rackPos, setRackPos] = useState('B04');
  const [storageTemp, setStorageTemp] = useState<StorageTemperature>('Refrigerated_2_8C');

  // Rack inventory modal
  const [inventoryModalVisible, setInventoryModalVisible] = useState(false);
  const [rackInventory, setRackInventory] = useState<RackInventoryItem[]>([]);

  const loadSpecimens = async () => {
    setLoading(true);
    const [orders] = await laboratoryService.getWorklist();
    if (orders && orders.length > 0) {
      const flattened: SpecimenWithMeta[] = [];
      for (const order of orders) {
        for (const spec of order.specimens ?? []) {
          flattened.push({
            ...spec,
            requisitionId: order.id,
            accessionNumber: order.accessionNumber,
            patientName: order.patientName,
            patientAge: order.patientAge,
            patientGender: order.patientGender,
            philHealthPin: order.philHealthPin,
            urgency: order.urgency,
            stage: order.stage,
            paymentPolicy: order.paymentPolicy,
            paymentRequired: order.paymentRequired,
            paid: order.paid,
            paidAtUtc: order.paidAtUtc,
            receiptNumber: order.receiptNumber,
            quotedAmount: order.quotedAmount,
            currency: order.currency,
          });
        }
      }
      setSpecimens(flattened);
    } else {
      setSpecimens([]);
    }
    setLoading(false);
  };

  useEffect(() => {
    loadSpecimens();
  }, []);

  const handleCollect = async (item: SpecimenWithMeta) => {
    if (!phlebName.trim()) {
      Alert.alert('Phlebotomist Required', 'Enter the name of the phlebotomist on duty before collecting a specimen.');
      return;
    }
    const [updated, err] = await laboratoryService.accessionSpecimen(item.requisitionId, phlebName, [
      {
        specimenId: item.id,
        barcode: item.barcode,
        containerType: item.containerType,
        specimenType: item.specimenType,
        collectedAt: new Date().toISOString(),
        notes: `Collected by ${phlebName}`,
      },
    ]);

    if (err) {
      Alert.alert(isPaymentRequiredError(err) ? 'Payment Required' : 'Collection Error', describeActionError(err));
    } else {
      Alert.alert('Accessioned', `Specimen ${item.barcode} marked as Collected.`);
      loadSpecimens();
    }
  };

  const handleOpenStickerPreview = (item: SpecimenWithMeta) => {
    const capInfo = resolveCapStyle(item.containerType);
    setSelectedSticker({
      barcode: item.barcode,
      accessionNumber: item.accessionNumber,
      patientName: item.patientName,
      patientGender: item.patientGender,
      patientAge: item.patientAge,
      philHealthPin: item.philHealthPin,
      containerType: item.containerType,
      containerColor: capInfo.name,
      hexColor: capInfo.color,
      specimenType: item.specimenType,
      requiredTests: item.notes || capInfo.tests,
      urgency: item.urgency,
      drawnAt: item.collectedAt,
      phlebotomistName: item.collectedByPhlebotomistName,
      rackLocation: item.rackId ? `${item.rackId} / ${item.rackPosition}` : undefined,
    });
    setStickerModalVisible(true);
  };

  const handlePrintLabel = () => {
    if (typeof window !== 'undefined' && window.print) {
      window.print();
    } else {
      Alert.alert('Printing Unavailable', 'Label printing is not available on this device. Open the app in a browser to print the label.');
    }
  };

  const handleOpenRejectModal = (item: SpecimenWithMeta) => {
    setTargetSpecimen(item);
    setRejectionReason('Hemolyzed');
    setRejectionNotes('');
    setCorrectiveAction('Recall patient for immediate re-collection');
    setRejectModalVisible(true);
  };

  const handleSubmitRejection = async () => {
    if (!targetSpecimen) return;
    if (!phlebName.trim()) {
      setRejectModalVisible(false);
      Alert.alert('Phlebotomist Required', 'Enter the name of the phlebotomist on duty before rejecting a specimen.');
      return;
    }
    const [, err] = await laboratoryService.rejectSpecimen(targetSpecimen.requisitionId, targetSpecimen.id, {
      reasonCode: rejectionReason,
      notes: rejectionNotes,
      phlebotomistName: phlebName,
      correctiveAction,
    });

    setRejectModalVisible(false);
    if (err) {
      Alert.alert('Rejection Error', err.message);
    } else {
      Alert.alert('Specimen Rejected', `Specimen ${targetSpecimen.barcode} rejected for ${rejectionReason}.`);
      loadSpecimens();
    }
  };

  const handleOpenRackModal = (item: SpecimenWithMeta) => {
    setTargetSpecimen(item);
    setRackId(item.rackId || 'RACK-CHEM-A');
    setRackPos(item.rackPosition || 'B04');
    setStorageTemp(item.storageTemperature || 'Refrigerated_2_8C');
    setRackModalVisible(true);
  };

  const handleSubmitStorage = async () => {
    if (!targetSpecimen) return;
    const [, err] = await laboratoryService.storeSpecimen(targetSpecimen.requisitionId, targetSpecimen.id, {
      rackId,
      rackPosition: rackPos,
      temperature: storageTemp,
    });

    setRackModalVisible(false);
    if (err) {
      Alert.alert('Storage Error', err.message);
    } else {
      Alert.alert('Specimen Stored', `Specimen ${targetSpecimen.barcode} assigned to ${rackId} [${rackPos}].`);
      loadSpecimens();
    }
  };

  const handleOpenRackInventory = async () => {
    setInventoryModalVisible(true);
    const [inv] = await laboratoryService.getRackInventory();
    if (inv) setRackInventory(inv);
  };

  const resolveCapStyle = (containerType: SpecimenContainerType) => {
    switch (containerType) {
      case 'Purple_EDTA':
        return { name: 'Lavender / EDTA', color: '#7C3AED', tests: 'CBC, Blood Typing, HbA1c' };
      case 'Yellow_SST':
        return { name: 'Gold / SST Gel', color: '#D97706', tests: 'FBS, Lipid Profile, LFT, Creatinine' };
      case 'LightBlue_Citrate':
        return { name: 'Light Blue / Citrate', color: '#0284C7', tests: 'PT, INR, aPTT Coagulation' };
      case 'Urine_Cup':
        return { name: 'Teal / Sterile Cup', color: '#0D9488', tests: 'Routine Urinalysis & Microscopy' };
      case 'Grey_Fluoride':
        return { name: 'Grey / Fluoride', color: '#4B5563', tests: 'Glucose Tolerance, Lactate' };
      case 'Red_Serum':
        return { name: 'Red / Plain Clot', color: '#DC2626', tests: 'Serology, Infectious Disease' };
      default:
        return { name: 'Standard Vial', color: '#4B5563', tests: 'Diagnostic Examination' };
    }
  };

  const filtered = specimens.filter(s => {
    if (filter === 'Pending') return s.status === 'Pending';
    if (filter === 'Collected') return s.status === 'Collected' || s.status === 'ReceivedInLab';
    if (filter === 'Rejected') return s.status === 'Rejected';
    if (filter === 'Stored') return s.storageStatus === 'StoredInRack';
    return true;
  });

  return (
    <ScrollView
      style={styles.container}
      contentContainerStyle={styles.content}
      refreshControl={<RefreshControl refreshing={loading} onRefresh={loadSpecimens} />}
    >
      <View style={styles.header}>
        <ThemedText style={styles.subtitle}>Phlebotomy & Sample Tracking</ThemedText>
        <ThemedText style={styles.title}>Specimen Management</ThemedText>
      </View>

      {/* Phlebotomist Bar & Quick Action */}
      <View style={styles.phlebBar}>
        <View style={{ flex: 1 }}>
          <ThemedText style={styles.phlebLabel}>Phlebotomist on Duty:</ThemedText>
          <TextInput
            style={styles.phlebInput}
            value={phlebName}
            onChangeText={setPhlebName}
            placeholder="Phlebotomist Name"
          />
        </View>
        <Pressable style={styles.inventoryBtn} onPress={handleOpenRackInventory}>
          <ThemedText style={styles.inventoryBtnText}>📦 View Storage Racks</ThemedText>
        </Pressable>
      </View>

      {/* Filter Chips */}
      <View style={styles.filterRow}>
        {(['All', 'Pending', 'Collected', 'Rejected', 'Stored'] as const).map(tab => (
          <Pressable
            key={tab}
            style={[styles.filterChip, filter === tab && styles.filterChipActive]}
            onPress={() => setFilter(tab)}
          >
            <ThemedText style={[styles.filterChipText, filter === tab && styles.filterChipTextActive]}>
              {tab} ({specimens.filter(s => {
                if (tab === 'All') return true;
                if (tab === 'Pending') return s.status === 'Pending';
                if (tab === 'Collected') return s.status === 'Collected' || s.status === 'ReceivedInLab';
                if (tab === 'Rejected') return s.status === 'Rejected';
                if (tab === 'Stored') return s.storageStatus === 'StoredInRack';
                return true;
              }).length})
            </ThemedText>
          </Pressable>
        ))}
      </View>

      <View style={styles.section}>
        <ThemedText style={styles.sectionTitle}>Specimens Queue ({filtered.length})</ThemedText>
        <View style={styles.list}>
          {!loading && filtered.length === 0 && (
            <ThemedText style={styles.emptyText}>No specimens to show. Specimens appear here once a requisition has been received.</ThemedText>
          )}
          {filtered.map((item) => {
            const cap = resolveCapStyle(item.containerType);
            const isRejected = item.status === 'Rejected';
            const isStored = item.storageStatus === 'StoredInRack';

            return (
              <View key={item.id} style={[styles.card, isRejected && styles.cardRejected]}>
                <View style={styles.rowBetween}>
                  <View style={styles.barcodeWrap}>
                    <ThemedText style={styles.barcodeText}>{item.barcode}</ThemedText>
                    <ThemedText style={styles.accessionSub}>{item.accessionNumber}</ThemedText>
                  </View>

                  <View style={[
                    styles.statusBadge,
                    isRejected ? styles.statusBadgeRejected :
                    item.status === 'Collected' ? styles.statusCollected : styles.statusPending
                  ]}>
                    <ThemedText style={[
                      styles.statusBadgeText,
                      isRejected ? { color: '#DC2626' } : undefined
                    ]}>
                      {isRejected ? 'REJECTED' : item.status}
                    </ThemedText>
                  </View>
                </View>

                <ThemedText style={styles.patientName}>
                  {item.patientName} ({item.patientAge}y • {item.patientGender})
                </ThemedText>

                <View style={styles.row}>
                  <View style={[styles.capIndicator, { backgroundColor: cap.color }]} />
                  <ThemedText style={styles.tubeInfoText}>
                    {cap.name} • {item.specimenType}
                  </ThemedText>
                </View>

                <PaymentSummary order={item} />

                {/* Storage position if assigned */}
                {item.rackId && (
                  <View style={styles.rackLocationBadge}>
                    <ThemedText style={styles.rackLocationText}>
                      📍 Rack: <strong>{item.rackId}</strong> (Slot {item.rackPosition}) • {item.storageTemperature?.replace('_', ' ')}
                    </ThemedText>
                  </View>
                )}

                {/* Rejection notice if rejected */}
                {isRejected && (
                  <View style={styles.rejectionNotice}>
                    <ThemedText style={styles.rejectionTitle}>⚠️ Rejection Reason: {item.rejectionReason}</ThemedText>
                    {item.rejectionNotes ? <ThemedText style={styles.rejectionNotes}>{item.rejectionNotes}</ThemedText> : null}
                    <ThemedText style={styles.correctiveText}>Action: {item.correctiveAction || 'Redraw required'}</ThemedText>
                  </View>
                )}

                {/* Action Buttons Row */}
                <View style={styles.cardActionsRow}>
                  <Pressable
                    style={styles.stickerBtn}
                    onPress={() => handleOpenStickerPreview(item)}
                  >
                    <ThemedText style={styles.stickerBtnText}>🏷️ Tube Sticker</ThemedText>
                  </Pressable>

                  {item.status === 'Pending' && (
                    <Pressable
                      style={styles.collectBtn}
                      onPress={() => handleCollect(item)}
                    >
                      <ThemedText style={styles.collectBtnText}>✓ Collect</ThemedText>
                    </Pressable>
                  )}

                  {!isRejected && (
                    <Pressable
                      style={styles.rackBtn}
                      onPress={() => handleOpenRackModal(item)}
                    >
                      <ThemedText style={styles.rackBtnText}>
                        {isStored ? '📍 Move Rack' : '📍 Assign Rack'}
                      </ThemedText>
                    </Pressable>
                  )}

                  {!isRejected && (
                    <Pressable
                      style={styles.rejectBtn}
                      onPress={() => handleOpenRejectModal(item)}
                    >
                      <ThemedText style={styles.rejectBtnText}>✕ Reject</ThemedText>
                    </Pressable>
                  )}
                </View>
              </View>
            );
          })}
        </View>
      </View>

      {/* 1. Tube Sticker Barcode Preview Modal */}
      <Modal visible={stickerModalVisible} transparent animationType="fade">
        <View style={styles.modalOverlay}>
          <View style={styles.stickerModalCard}>
            <View style={styles.modalHeaderRow}>
              <ThemedText style={styles.modalHeading}>Printable Phlebotomy Tube Sticker</ThemedText>
              <Pressable onPress={() => setStickerModalVisible(false)}>
                <ThemedText style={styles.closeBtn}>✕</ThemedText>
              </Pressable>
            </View>

            {selectedSticker && (
              <View style={styles.thermalStickerPreview}>
                <View style={[styles.stickerCapBanner, { backgroundColor: selectedSticker.hexColor }]}>
                  <ThemedText style={styles.stickerCapTitle}>{selectedSticker.containerColor.toUpperCase()}</ThemedText>
                  <ThemedText style={styles.stickerUrgencyBadge}>{selectedSticker.urgency}</ThemedText>
                </View>

                <View style={styles.stickerBody}>
                  <View style={styles.stickerRow}>
                    <ThemedText style={styles.stickerPatientName}>{selectedSticker.patientName}</ThemedText>
                    <ThemedText style={styles.stickerAge}>{selectedSticker.patientAge}y/{selectedSticker.patientGender[0]}</ThemedText>
                  </View>
                  <ThemedText style={styles.stickerSub}>PIN: {selectedSticker.philHealthPin || 'N/A'}</ThemedText>
                  <ThemedText style={styles.stickerTests}>REQ: {selectedSticker.requiredTests}</ThemedText>

                  {/* Visual Barcode Lines */}
                  <View style={styles.barcodeVisualBox}>
                    <View style={styles.barcodeLinesRow}>
                      {[3, 1, 2, 4, 1, 3, 2, 1, 4, 2, 1, 3, 4, 1, 2, 3, 1, 4, 2, 1, 3, 2, 4, 1, 2, 3].map((w, i) => (
                        <View key={i} style={[styles.barLine, { width: w }]} />
                      ))}
                    </View>
                    <ThemedText style={styles.barcodeString}>{selectedSticker.barcode}</ThemedText>
                  </View>

                  <View style={styles.stickerFooter}>
                    <ThemedText style={styles.stickerMetaText}>
                      Drawn: {selectedSticker.drawnAt ? new Date(selectedSticker.drawnAt).toLocaleTimeString([], { hour: '2-digit', minute: '2-digit' }) : '____:____'}
                    </ThemedText>
                    <ThemedText style={styles.stickerMetaText}>
                      Tech: {selectedSticker.phlebotomistName ? selectedSticker.phlebotomistName.split(' ')[0] : '______'}
                    </ThemedText>
                  </View>
                </View>
              </View>
            )}

            <View style={styles.modalActionsRow}>
              <Pressable style={styles.modalCancelBtn} onPress={() => setStickerModalVisible(false)}>
                <ThemedText style={styles.modalCancelText}>Close</ThemedText>
              </Pressable>
              <Pressable style={styles.modalPrintBtn} onPress={handlePrintLabel}>
                <ThemedText style={styles.modalPrintText}>🖨️ Print Label (Zebra / TSC)</ThemedText>
              </Pressable>
            </View>
          </View>
        </View>
      </Modal>

      {/* 2. Specimen Rejection Modal */}
      <Modal visible={rejectModalVisible} transparent animationType="slide">
        <View style={styles.modalOverlay}>
          <View style={styles.rejectModalCard}>
            <ThemedText style={styles.rejectModalHeading}>Clinical Specimen Rejection</ThemedText>
            <ThemedText style={styles.rejectModalSub}>
              Barcode: {targetSpecimen?.barcode} • Patient: {targetSpecimen?.patientName}
            </ThemedText>

            <View style={styles.formGroup}>
              <ThemedText style={styles.inputLabel}>Rejection Reason Code *</ThemedText>
              <View style={styles.reasonChipsWrap}>
                {([
                  { code: 'Hemolyzed', desc: 'Free Hemoglobin' },
                  { code: 'Lipemic', desc: 'Turbid Lipids' },
                  { code: 'Icteric', desc: 'High Bilirubin' },
                  { code: 'Clotted', desc: 'Microclot Present' },
                  { code: 'InsufficientVolume_QNS', desc: 'QNS / Low Volume' },
                  { code: 'WrongContainer', desc: 'Incorrect Tube' },
                  { code: 'Contaminated', desc: 'IV Dilution / Contam' },
                ] as { code: SpecimenRejectionReason; desc: string }[]).map(r => (
                  <Pressable
                    key={r.code}
                    style={[styles.reasonChip, rejectionReason === r.code && styles.reasonChipActive]}
                    onPress={() => setRejectionReason(r.code)}
                  >
                    <ThemedText style={[styles.reasonChipText, rejectionReason === r.code && styles.reasonChipTextActive]}>
                      {r.code} ({r.desc})
                    </ThemedText>
                  </Pressable>
                ))}
              </View>
            </View>

            <View style={styles.formGroup}>
              <ThemedText style={styles.inputLabel}>Laboratory Notes / Observations</ThemedText>
              <TextInput
                style={styles.textInputArea}
                value={rejectionNotes}
                onChangeText={setRejectionNotes}
                placeholder="e.g. Specimen exhibits severe pink-red discoloration consistent with Grade 3+ hemolysis..."
                multiline
              />
            </View>

            <View style={styles.formGroup}>
              <ThemedText style={styles.inputLabel}>Corrective Action Required *</ThemedText>
              <TextInput
                style={styles.textInput}
                value={correctiveAction}
                onChangeText={setCorrectiveAction}
                placeholder="e.g. Recall patient for redraw prior to running CBC"
              />
            </View>

            <View style={styles.modalActionsRow}>
              <Pressable style={styles.modalCancelBtn} onPress={() => setRejectModalVisible(false)}>
                <ThemedText style={styles.modalCancelText}>Cancel</ThemedText>
              </Pressable>
              <Pressable style={styles.confirmRejectBtn} onPress={handleSubmitRejection}>
                <ThemedText style={styles.confirmRejectText}>Confirm Specimen Rejection</ThemedText>
              </Pressable>
            </View>
          </View>
        </View>
      </Modal>

      {/* 3. Storage Rack Allocation Modal */}
      <Modal visible={rackModalVisible} transparent animationType="slide">
        <View style={styles.modalOverlay}>
          <View style={styles.rackModalCard}>
            <ThemedText style={styles.modalHeading}>Specimen Storage Rack Routing</ThemedText>
            <ThemedText style={styles.modalSub}>
              Assign specimen {targetSpecimen?.barcode} to an archival rack and temperature zone.
            </ThemedText>

            <View style={styles.formGroup}>
              <ThemedText style={styles.inputLabel}>Storage Rack ID *</ThemedText>
              <View style={styles.rackChipsWrap}>
                {['RACK-CHEM-A', 'RACK-HEMA-01', 'FREEZER-SERO-B', 'AMBIENT-URINE'].map(r => (
                  <Pressable
                    key={r}
                    style={[styles.rackChip, rackId === r && styles.rackChipActive]}
                    onPress={() => setRackId(r)}
                  >
                    <ThemedText style={[styles.rackChipText, rackId === r && styles.rackChipTextActive]}>{r}</ThemedText>
                  </Pressable>
                ))}
              </View>
            </View>

            <View style={styles.formGroup}>
              <ThemedText style={styles.inputLabel}>Rack Grid Position (Row + Col) *</ThemedText>
              <TextInput
                style={styles.textInput}
                value={rackPos}
                onChangeText={setRackPos}
                placeholder="e.g. B04, C12, A01"
              />
            </View>

            <View style={styles.formGroup}>
              <ThemedText style={styles.inputLabel}>Storage Temperature Zone *</ThemedText>
              <View style={styles.rackChipsWrap}>
                {([
                  { code: 'Refrigerated_2_8C', label: '2-8°C (Refrigerated)' },
                  { code: 'Ambient_20_25C', label: '20-25°C (Ambient)' },
                  { code: 'Frozen_Minus20C', label: '-20°C (Frozen)' },
                ] as { code: StorageTemperature; label: string }[]).map(t => (
                  <Pressable
                    key={t.code}
                    style={[styles.rackChip, storageTemp === t.code && styles.rackChipActive]}
                    onPress={() => setStorageTemp(t.code)}
                  >
                    <ThemedText style={[styles.rackChipText, storageTemp === t.code && styles.rackChipTextActive]}>{t.label}</ThemedText>
                  </Pressable>
                ))}
              </View>
            </View>

            <View style={styles.modalActionsRow}>
              <Pressable style={styles.modalCancelBtn} onPress={() => setRackModalVisible(false)}>
                <ThemedText style={styles.modalCancelText}>Cancel</ThemedText>
              </Pressable>
              <Pressable style={styles.modalSaveBtn} onPress={handleSubmitStorage}>
                <ThemedText style={styles.modalSaveText}>Save Rack Location</ThemedText>
              </Pressable>
            </View>
          </View>
        </View>
      </Modal>

      {/* 4. Rack Inventory Modal */}
      <Modal visible={inventoryModalVisible} transparent animationType="slide">
        <View style={styles.modalOverlay}>
          <View style={styles.inventoryModalCard}>
            <View style={styles.modalHeaderRow}>
              <ThemedText style={styles.modalHeading}>Archival Storage Rack Inventory ({rackInventory.length})</ThemedText>
              <Pressable onPress={() => setInventoryModalVisible(false)}>
                <ThemedText style={styles.closeBtn}>✕</ThemedText>
              </Pressable>
            </View>

            <ScrollView style={{ maxHeight: 360 }}>
              {rackInventory.length === 0 ? (
                <ThemedText style={{ color: '#6B7280', textAlign: 'center', marginVertical: 20 }}>
                  No specimens currently stored in racks.
                </ThemedText>
              ) : (
                rackInventory.map((item, idx) => (
                  <View key={idx} style={styles.invRow}>
                    <View style={{ flex: 2 }}>
                      <ThemedText style={styles.invBarcode}>{item.barcode}</ThemedText>
                      <ThemedText style={styles.invPatient}>{item.patientName} • {item.specimenType}</ThemedText>
                    </View>
                    <View style={{ flex: 1.5, alignItems: 'flex-end' }}>
                      <ThemedText style={styles.invRack}>{item.rackId}</ThemedText>
                      <ThemedText style={styles.invSlot}>Position: {item.rackPosition} • {item.storageTemperature?.replace('_', ' ')}</ThemedText>
                    </View>
                  </View>
                ))
              )}
            </ScrollView>

            <Pressable style={styles.modalCloseBtn} onPress={() => setInventoryModalVisible(false)}>
              <ThemedText style={styles.modalCloseText}>Done</ThemedText>
            </Pressable>
          </View>
        </View>
      </Modal>
    </ScrollView>
  );
}

const styles = StyleSheet.create({
  container: {
    flex: 1,
    backgroundColor: '#F9FAFB',
  },
  content: {
    padding: 20,
    gap: 16,
  },
  header: {
    gap: 4,
  },
  subtitle: {
    fontSize: 13,
    textTransform: 'uppercase',
    letterSpacing: 1.2,
    color: '#4B5563',
    fontWeight: '600',
  },
  title: {
    fontSize: 28,
    fontWeight: '700',
    color: '#111827',
  },
  phlebBar: {
    backgroundColor: '#FFFFFF',
    padding: 12,
    borderRadius: 12,
    borderWidth: 1,
    borderColor: '#E5E7EB',
    flexDirection: 'row',
    alignItems: 'center',
    gap: 12,
  },
  phlebLabel: {
    fontSize: 11,
    fontWeight: '600',
    color: '#6B7280',
    marginBottom: 4,
  },
  phlebInput: {
    fontSize: 13,
    fontWeight: '600',
    color: '#111827',
    borderWidth: 1,
    borderColor: '#D1D5DB',
    borderRadius: 8,
    paddingHorizontal: 10,
    paddingVertical: 5,
  },
  inventoryBtn: {
    backgroundColor: '#F3E8FF',
    paddingHorizontal: 14,
    paddingVertical: 10,
    borderRadius: 10,
    borderWidth: 1,
    borderColor: '#D8B4FE',
  },
  inventoryBtnText: {
    color: '#6B21A8',
    fontWeight: '700',
    fontSize: 12,
  },
  filterRow: {
    flexDirection: 'row',
    flexWrap: 'wrap',
    gap: 8,
  },
  filterChip: {
    paddingHorizontal: 12,
    paddingVertical: 6,
    borderRadius: 20,
    backgroundColor: '#E5E7EB',
  },
  filterChipActive: {
    backgroundColor: '#7C3AED',
  },
  filterChipText: {
    fontSize: 12,
    fontWeight: '600',
    color: '#374151',
  },
  filterChipTextActive: {
    color: '#FFFFFF',
  },
  section: {
    gap: 12,
  },
  sectionTitle: {
    fontSize: 18,
    fontWeight: '600',
    color: '#1F2937',
  },
  list: {
    gap: 12,
  },
  emptyText: {
    fontSize: 14,
    color: '#6B7280',
    textAlign: 'center',
    paddingVertical: 24,
  },
  card: {
    backgroundColor: '#FFFFFF',
    borderRadius: 14,
    borderWidth: 1,
    borderColor: '#E5E7EB',
    padding: 16,
    gap: 8,
  },
  cardRejected: {
    borderColor: '#FCA5A5',
    backgroundColor: '#FFF5F5',
  },
  rowBetween: {
    flexDirection: 'row',
    justifyContent: 'space-between',
    alignItems: 'center',
  },
  barcodeWrap: {
    gap: 2,
  },
  barcodeText: {
    fontSize: 15,
    fontWeight: '700',
    color: '#7C3AED',
    fontFamily: 'monospace',
  },
  accessionSub: {
    fontSize: 11,
    color: '#6B7280',
  },
  statusBadge: {
    paddingHorizontal: 8,
    paddingVertical: 3,
    borderRadius: 6,
  },
  statusPending: {
    backgroundColor: '#FEF3C7',
  },
  statusCollected: {
    backgroundColor: '#DCFCE7',
  },
  statusBadgeRejected: {
    backgroundColor: '#FEE2E2',
  },
  statusBadgeText: {
    fontSize: 11,
    fontWeight: '700',
    color: '#111827',
  },
  patientName: {
    fontSize: 15,
    fontWeight: '700',
    color: '#111827',
  },
  row: {
    flexDirection: 'row',
    alignItems: 'center',
    gap: 8,
  },
  capIndicator: {
    width: 12,
    height: 12,
    borderRadius: 6,
  },
  tubeInfoText: {
    fontSize: 12,
    fontWeight: '600',
    color: '#4B5563',
  },
  rackLocationBadge: {
    backgroundColor: '#EFF6FF',
    paddingHorizontal: 10,
    paddingVertical: 4,
    borderRadius: 6,
    borderWidth: 1,
    borderColor: '#BFDBFE',
  },
  rackLocationText: {
    fontSize: 11,
    color: '#1E40AF',
  },
  rejectionNotice: {
    backgroundColor: '#FEE2E2',
    padding: 10,
    borderRadius: 8,
    borderLeftWidth: 4,
    borderLeftColor: '#DC2626',
    gap: 2,
  },
  rejectionTitle: {
    fontSize: 12,
    fontWeight: '700',
    color: '#991B1B',
  },
  rejectionNotes: {
    fontSize: 11,
    color: '#B91C1C',
  },
  correctiveText: {
    fontSize: 11,
    fontWeight: '600',
    color: '#7F1D1D',
    marginTop: 2,
  },
  cardActionsRow: {
    flexDirection: 'row',
    flexWrap: 'wrap',
    gap: 8,
    marginTop: 6,
    paddingTop: 8,
    borderTopWidth: 1,
    borderTopColor: '#F3F4F6',
  },
  stickerBtn: {
    backgroundColor: '#F3F4F6',
    paddingHorizontal: 12,
    paddingVertical: 6,
    borderRadius: 8,
    borderWidth: 1,
    borderColor: '#E5E7EB',
  },
  stickerBtnText: {
    fontSize: 12,
    fontWeight: '600',
    color: '#374151',
  },
  collectBtn: {
    backgroundColor: '#7C3AED',
    paddingHorizontal: 14,
    paddingVertical: 6,
    borderRadius: 8,
  },
  collectBtnText: {
    fontSize: 12,
    fontWeight: '700',
    color: '#FFFFFF',
  },
  rackBtn: {
    backgroundColor: '#E0E7FF',
    paddingHorizontal: 12,
    paddingVertical: 6,
    borderRadius: 8,
  },
  rackBtnText: {
    fontSize: 12,
    fontWeight: '600',
    color: '#3730A3',
  },
  rejectBtn: {
    backgroundColor: '#FEE2E2',
    paddingHorizontal: 12,
    paddingVertical: 6,
    borderRadius: 8,
  },
  rejectBtnText: {
    fontSize: 12,
    fontWeight: '700',
    color: '#DC2626',
  },
  modalOverlay: {
    flex: 1,
    backgroundColor: 'rgba(0,0,0,0.5)',
    justifyContent: 'center',
    alignItems: 'center',
    padding: 20,
  },
  stickerModalCard: {
    backgroundColor: '#FFFFFF',
    borderRadius: 16,
    padding: 20,
    width: '100%',
    maxWidth: 440,
    maxHeight: '95%',
    overflow: 'hidden',
    gap: 16,
  },
  rejectModalCard: {
    backgroundColor: '#FFFFFF',
    borderRadius: 16,
    padding: 20,
    width: '100%',
    maxWidth: 520,
    maxHeight: '95%',
    overflow: 'hidden',
    gap: 14,
  },
  rackModalCard: {
    backgroundColor: '#FFFFFF',
    borderRadius: 16,
    padding: 20,
    width: '100%',
    maxWidth: 480,
    maxHeight: '95%',
    overflow: 'hidden',
    gap: 14,
  },
  inventoryModalCard: {
    backgroundColor: '#FFFFFF',
    borderRadius: 16,
    padding: 20,
    width: '100%',
    maxWidth: 560,
    maxHeight: '95%',
    overflow: 'hidden',
    gap: 14,
  },
  modalHeaderRow: {
    flexDirection: 'row',
    justifyContent: 'space-between',
    alignItems: 'center',
  },
  modalHeading: {
    fontSize: 18,
    fontWeight: '700',
    color: '#111827',
  },
  modalSub: {
    fontSize: 12,
    color: '#6B7280',
  },
  closeBtn: {
    fontSize: 18,
    fontWeight: '700',
    color: '#6B7280',
    padding: 4,
  },
  thermalStickerPreview: {
    backgroundColor: '#FFFFFF',
    borderRadius: 8,
    borderWidth: 2,
    borderColor: '#111827',
    overflow: 'hidden',
    shadowColor: '#000',
    shadowOpacity: 0.1,
    shadowRadius: 10,
    elevation: 4,
  },
  stickerCapBanner: {
    paddingHorizontal: 12,
    paddingVertical: 6,
    flexDirection: 'row',
    justifyContent: 'space-between',
    alignItems: 'center',
  },
  stickerCapTitle: {
    color: '#FFFFFF',
    fontWeight: '800',
    fontSize: 11,
    letterSpacing: 0.5,
  },
  stickerUrgencyBadge: {
    backgroundColor: 'rgba(255,255,255,0.3)',
    color: '#FFFFFF',
    fontWeight: '800',
    fontSize: 10,
    paddingHorizontal: 6,
    paddingVertical: 2,
    borderRadius: 4,
  },
  stickerBody: {
    padding: 12,
    gap: 4,
  },
  stickerRow: {
    flexDirection: 'row',
    justifyContent: 'space-between',
    alignItems: 'center',
  },
  stickerPatientName: {
    fontSize: 14,
    fontWeight: '800',
    color: '#111827',
  },
  stickerAge: {
    fontSize: 11,
    fontWeight: '700',
    color: '#4B5563',
  },
  stickerSub: {
    fontSize: 10,
    color: '#6B7280',
  },
  stickerTests: {
    fontSize: 11,
    fontWeight: '700',
    color: '#6B21A8',
  },
  barcodeVisualBox: {
    alignItems: 'center',
    marginVertical: 8,
    paddingVertical: 6,
    backgroundColor: '#F9FAFB',
    borderRadius: 6,
    borderWidth: 1,
    borderColor: '#E5E7EB',
  },
  barcodeLinesRow: {
    flexDirection: 'row',
    height: 36,
    alignItems: 'center',
    gap: 2,
  },
  barLine: {
    backgroundColor: '#111827',
    height: '100%',
  },
  barcodeString: {
    fontSize: 11,
    fontFamily: 'monospace',
    fontWeight: '700',
    letterSpacing: 2,
    color: '#111827',
    marginTop: 4,
  },
  stickerFooter: {
    flexDirection: 'row',
    justifyContent: 'space-between',
    borderTopWidth: 1,
    borderTopColor: '#E5E7EB',
    paddingTop: 4,
  },
  stickerMetaText: {
    fontSize: 10,
    color: '#4B5563',
    fontWeight: '600',
  },
  modalActionsRow: {
    flexDirection: 'row',
    justifyContent: 'flex-end',
    gap: 10,
  },
  modalCancelBtn: {
    backgroundColor: '#F3F4F6',
    paddingHorizontal: 16,
    paddingVertical: 10,
    borderRadius: 8,
  },
  modalCancelText: {
    fontSize: 13,
    fontWeight: '600',
    color: '#374151',
  },
  modalPrintBtn: {
    backgroundColor: '#7C3AED',
    paddingHorizontal: 18,
    paddingVertical: 10,
    borderRadius: 8,
  },
  modalPrintText: {
    fontSize: 13,
    fontWeight: '700',
    color: '#FFFFFF',
  },
  rejectModalHeading: {
    fontSize: 18,
    fontWeight: '700',
    color: '#DC2626',
  },
  rejectModalSub: {
    fontSize: 12,
    color: '#6B7280',
  },
  formGroup: {
    gap: 6,
  },
  inputLabel: {
    fontSize: 12,
    fontWeight: '700',
    color: '#374151',
  },
  reasonChipsWrap: {
    flexDirection: 'row',
    flexWrap: 'wrap',
    gap: 6,
  },
  reasonChip: {
    backgroundColor: '#F3F4F6',
    paddingHorizontal: 10,
    paddingVertical: 6,
    borderRadius: 6,
    borderWidth: 1,
    borderColor: '#E5E7EB',
  },
  reasonChipActive: {
    backgroundColor: '#FEE2E2',
    borderColor: '#DC2626',
  },
  reasonChipText: {
    fontSize: 11,
    fontWeight: '600',
    color: '#374151',
  },
  reasonChipTextActive: {
    color: '#991B1B',
    fontWeight: '700',
  },
  textInput: {
    borderWidth: 1,
    borderColor: '#D1D5DB',
    borderRadius: 8,
    paddingHorizontal: 10,
    paddingVertical: 8,
    fontSize: 13,
    color: '#111827',
  },
  textInputArea: {
    borderWidth: 1,
    borderColor: '#D1D5DB',
    borderRadius: 8,
    paddingHorizontal: 10,
    paddingVertical: 8,
    fontSize: 13,
    color: '#111827',
    minHeight: 60,
  },
  confirmRejectBtn: {
    backgroundColor: '#DC2626',
    paddingHorizontal: 18,
    paddingVertical: 10,
    borderRadius: 8,
  },
  confirmRejectText: {
    fontSize: 13,
    fontWeight: '700',
    color: '#FFFFFF',
  },
  rackChipsWrap: {
    flexDirection: 'row',
    flexWrap: 'wrap',
    gap: 6,
  },
  rackChip: {
    backgroundColor: '#F3F4F6',
    paddingHorizontal: 10,
    paddingVertical: 6,
    borderRadius: 6,
    borderWidth: 1,
    borderColor: '#E5E7EB',
  },
  rackChipActive: {
    backgroundColor: '#E0E7FF',
    borderColor: '#4F46E5',
  },
  rackChipText: {
    fontSize: 11,
    fontWeight: '600',
    color: '#374151',
  },
  rackChipTextActive: {
    color: '#312E81',
    fontWeight: '700',
  },
  modalSaveBtn: {
    backgroundColor: '#4F46E5',
    paddingHorizontal: 18,
    paddingVertical: 10,
    borderRadius: 8,
  },
  modalSaveText: {
    fontSize: 13,
    fontWeight: '700',
    color: '#FFFFFF',
  },
  invRow: {
    flexDirection: 'row',
    justifyContent: 'space-between',
    paddingVertical: 10,
    borderBottomWidth: 1,
    borderBottomColor: '#F3F4F6',
  },
  invBarcode: {
    fontSize: 13,
    fontWeight: '700',
    color: '#7C3AED',
    fontFamily: 'monospace',
  },
  invPatient: {
    fontSize: 12,
    color: '#4B5563',
  },
  invRack: {
    fontSize: 12,
    fontWeight: '700',
    color: '#1E40AF',
  },
  invSlot: {
    fontSize: 11,
    color: '#6B7280',
  },
  modalCloseBtn: {
    backgroundColor: '#111827',
    paddingVertical: 10,
    borderRadius: 8,
    alignItems: 'center',
    marginTop: 10,
  },
  modalCloseText: {
    color: '#FFFFFF',
    fontWeight: '700',
    fontSize: 13,
  },
});
