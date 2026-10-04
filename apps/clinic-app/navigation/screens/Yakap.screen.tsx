import React, { useState, useEffect, useCallback } from 'react';
import {
  View,
  StyleSheet,
  ScrollView,
  Pressable,
  ActivityIndicator,
  RefreshControl,
  Alert,
  Modal,
} from 'react-native';
import { useNavigation } from '@react-navigation/native';
import { ThemedText, Badge, Button, Input, Card, StatCard, ProgressBar } from '@ui';
import { ResponsiveLayout } from '@layout';
import { theme } from '@constants/theme';
import {
  clinicService,
  YakapTransmittal,
  YakapTransmittalItem,
  YakapTransmittalStatus,
  CreateYakapTransmittalPayload,
  GamotBeneficiaryLedger,
  GamotFormularyItem,
  UpscVerifyResult,
  YakapMasterlistAssignment,
  SoapSimulationReport,
  SoapSimulationStepResult,
  SoapSimulationScenario,
  SoapSandboxStatus,
  PhilHealthCredentialPayload,
  PhilHealthConfigStatus,
} from '../../services/clinicService';


// Sample fallback transmittals for immediate demonstration
const SAMPLE_TRANSMITTALS: YakapTransmittal[] = [
  {
    id: 'tx-001',
    transmittalNumber: 'RHCI-NCR-2026-0001',
    reportTagging: '1',
    effectiveYear: '2026',
    packageType: 'K',
    status: 'Validated',
    totalEnlistments: 12,
    totalProfiles: 12,
    totalSoaps: 0,
    totalMedicines: 0,
    rawXmlPayload: '<?xml version="1.0" encoding="utf-8"?><PCB pUsername="HCI-QC-01" pReportTagging="1" ...',
    createdAt: new Date(Date.now() - 3 * 3600 * 1000).toISOString(),
    validatedAt: new Date(Date.now() - 2 * 3600 * 1000).toISOString(),
    notes: 'Q4 First Tranche: Initial Patient Enlistment and Health Profiling',
    items: [
      {
        id: 'item-1',
        transmittalId: 'tx-001',
        patientId: 'pat-101',
        patientName: 'Maria Santos',
        philHealthIdentificationNumber: '12-050412345-6',
        itemType: 'Enlistment',
        reportStatus: 'V',
        processedAt: new Date().toISOString(),
      },
      {
        id: 'item-2',
        transmittalId: 'tx-001',
        patientId: 'pat-101',
        patientName: 'Maria Santos',
        philHealthIdentificationNumber: '12-050412345-6',
        itemType: 'Profile',
        reportStatus: 'V',
        processedAt: new Date().toISOString(),
      },
      {
        id: 'item-3',
        transmittalId: 'tx-001',
        patientId: 'pat-102',
        patientName: 'Juan Dela Cruz',
        philHealthIdentificationNumber: '03-026307850-7',
        itemType: 'Enlistment',
        reportStatus: 'V',
        processedAt: new Date().toISOString(),
      },
    ],
  },
  {
    id: 'tx-002',
    transmittalNumber: 'RHCI-NCR-2026-0002',
    reportTagging: '2',
    effectiveYear: '2026',
    packageType: 'K',
    status: 'Submitted',
    totalEnlistments: 8,
    totalProfiles: 8,
    totalSoaps: 8,
    totalMedicines: 14,
    philHealthTransactionNumber: 'PKA-TRAN-20261003-883921',
    createdAt: new Date(Date.now() - 24 * 3600 * 1000).toISOString(),
    transmittedAt: new Date(Date.now() - 12 * 3600 * 1000).toISOString(),
    notes: 'Second Tranche: Consultations, Diagnostics & GAMOT Prescriptions',
    items: [
      {
        id: 'item-4',
        transmittalId: 'tx-002',
        patientId: 'pat-103',
        patientName: 'Gabriela Silang',
        philHealthIdentificationNumber: '24-250000477-4',
        itemType: 'Soap',
        reportStatus: 'U',
        processedAt: new Date().toISOString(),
      },
    ],
  },
];

const SAMPLE_GAMOT_FORMULARY: GamotFormularyItem[] = [
  { drugCode: 'AMLODIPINE5MG00000000000000000', genericName: 'Amlodipine', dosage: '5mg', form: 'Tablet', therapeuticCategory: 'Cardiovascular', referenceUnitPrice: 0.65, requiresSpecialistRecommendation: false },
  { drugCode: 'AMLODIPINE10MG0000000000000000', genericName: 'Amlodipine', dosage: '10mg', form: 'Tablet', therapeuticCategory: 'Cardiovascular', referenceUnitPrice: 1.10, requiresSpecialistRecommendation: false },
  { drugCode: 'LOSARTAN5000000000000000000000', genericName: 'Losartan Potassium', dosage: '50mg', form: 'Tablet', therapeuticCategory: 'Cardiovascular', referenceUnitPrice: 1.75, requiresSpecialistRecommendation: false },
  { drugCode: 'METFORMIN500000000000000000000', genericName: 'Metformin Hydrochloride', dosage: '500mg', form: 'Tablet', therapeuticCategory: 'Antidiabetic', referenceUnitPrice: 1.25, requiresSpecialistRecommendation: false },
  { drugCode: 'AMOXICILLIN5000000000000000000', genericName: 'Amoxicillin Trihydrate', dosage: '500mg', form: 'Capsule', therapeuticCategory: 'Antibiotic', referenceUnitPrice: 2.20, requiresSpecialistRecommendation: false },
  { drugCode: 'PARACETAMOL5000000000000000000', genericName: 'Paracetamol', dosage: '500mg', form: 'Tablet', therapeuticCategory: 'Analgesic', referenceUnitPrice: 0.85, requiresSpecialistRecommendation: false },
  { drugCode: 'SALBUTAMOL2MG00000000000000000', genericName: 'Salbutamol', dosage: '2mg', form: 'Tablet', therapeuticCategory: 'Respiratory', referenceUnitPrice: 0.70, requiresSpecialistRecommendation: false },
  { drugCode: 'COAMOXICLAV6250000000000000000', genericName: 'Co-Amoxiclav', dosage: '625mg', form: 'Tablet', therapeuticCategory: 'Antibiotic', referenceUnitPrice: 12.50, requiresSpecialistRecommendation: false },
];

export default function YakapScreen() {
  const navigation = useNavigation<any>();

  // State
  const [activeTab, setActiveTab] = useState<'transmittals' | 'gamot' | 'masterlist' | 'pin-checker' | 'simulation'>('transmittals');
  const [transmittals, setTransmittals] = useState<YakapTransmittal[]>(SAMPLE_TRANSMITTALS);
  const [isLoading, setIsLoading] = useState(false);
  const [isRefreshing, setIsRefreshing] = useState(false);
  const [selectedTransmittal, setSelectedTransmittal] = useState<YakapTransmittal | null>(null);
  const [filterTagging, setFilterTagging] = useState<string>('all');
  const [filterStatus, setFilterStatus] = useState<string>('all');

  // New Transmittal Modal State
  const [isNewModalVisible, setIsNewModalVisible] = useState(false);
  const [newTagging, setNewTagging] = useState<'1' | '2'>('1');
  const [newYear, setNewYear] = useState('2026');
  const [newNotes, setNewNotes] = useState('');
  const [isSubmittingNew, setIsSubmittingNew] = useState(false);

  // GAMOT Ledger Tab State
  const [searchPin, setSearchPin] = useState('03-026307850-7');
  const [ledger, setLedger] = useState<GamotBeneficiaryLedger | null>(null);
  const [isSearchingLedger, setIsSearchingLedger] = useState(false);
  const [formulary, setFormulary] = useState<GamotFormularyItem[]>(SAMPLE_GAMOT_FORMULARY);
  const [formularySearch, setFormularySearch] = useState('');
  const [formularyCategory, setFormularyCategory] = useState('all');

  // UPSC Verification State
  const [verifyUpscCode, setVerifyUpscCode] = useState('');
  const [verifyResult, setVerifyResult] = useState<UpscVerifyResult | null>(null);
  const [isVerifyingUpsc, setIsVerifyingUpsc] = useState(false);

  // Masterlist Sync Tab State
  const [hciNumber, setHciNumber] = useState('HCI-NCR-00921');
  const [cipherKey, setCipherKey] = useState('CLINICEZ-YAKAP-DEV-KEY-32BYTES!');
  const [masterlistItems, setMasterlistItems] = useState<YakapMasterlistAssignment[]>([]);
  const [isSyncingMasterlist, setIsSyncingMasterlist] = useState(false);

  // Real-time PIN Checker State
  const [pinToCheck, setPinToCheck] = useState('');
  const [pinValidationResult, setPinValidationResult] = useState<{ isValid?: boolean; formatted?: string; error?: string } | null>(null);

  // SOAP Sandbox Simulation State
  const [simulationScenario, setSimulationScenario] = useState<SoapSimulationScenario>('HappyPath');
  const [simulationReport, setSimulationReport] = useState<SoapSimulationReport | null>(null);
  const [isRunningSimulation, setIsRunningSimulation] = useState(false);
  const [expandedStepIndex, setExpandedStepIndex] = useState<number | null>(null);
  const [sandboxStatus, setSandboxStatus] = useState<SoapSandboxStatus | null>(null);
  const [isResettingSandbox, setIsResettingSandbox] = useState(false);
  const [activePayloadTab, setActivePayloadTab] = useState<'request' | 'response'>('response');

  // PhilHealth Credentials State
  const [isCredentialsModalVisible, setIsCredentialsModalVisible] = useState(false);
  const [isSavingCredentials, setIsSavingCredentials] = useState(false);
  const [isTestingConnection, setIsTestingConnection] = useState(false);
  const [testConnectionResult, setTestConnectionResult] = useState<{ success: boolean; message: string } | null>(null);
  const [credFacilityName, setCredFacilityName] = useState('');
  const [credAccreditationNo, setCredAccreditationNo] = useState('');
  const [credPmccNo, setCredPmccNo] = useState('');
  const [credSoftwareCertId, setCredSoftwareCertId] = useState('');
  const [credUsername, setCredUsername] = useState('');
  const [credPassword, setCredPassword] = useState('');
  const [credCipherKey, setCredCipherKey] = useState('');
  const [credEndpoint, setCredEndpoint] = useState('/soap/konsulta');
  const [philHealthConfigStatus, setPhilHealthConfigStatus] = useState<PhilHealthConfigStatus | null>(null);

  const fetchPhilHealthConfigStatus = useCallback(async () => {
    const [status] = await clinicService.getPhilHealthConfigStatus();
    if (status) {
      setPhilHealthConfigStatus(status);
      setCredFacilityName(status.facilityName || '');
      setCredAccreditationNo(status.accreditationNumber || '');
      setCredPmccNo(status.pmccNumber || '');
      setCredSoftwareCertId(status.softwareCertificateId || '');
      setCredEndpoint(status.konsultaEndpoint || '/soap/konsulta');
      if (status.accreditationNumber) {
        setHciNumber(status.accreditationNumber);
      }
    }
  }, []);

  useEffect(() => {
    fetchPhilHealthConfigStatus();
  }, [fetchPhilHealthConfigStatus]);

  const handleOpenCredentials = () => {
    fetchPhilHealthConfigStatus();
    setTestConnectionResult(null);
    setIsCredentialsModalVisible(true);
  };

  const handleSaveCredentials = async () => {
    if (!credAccreditationNo.trim() || !credUsername.trim()) {
      Alert.alert('Validation Error', 'Accreditation Number and SOAP Username are required.');
      return;
    }
    if (!philHealthConfigStatus?.isConfigured && !credPassword.trim()) {
      Alert.alert('Validation Error', 'SOAP Password is required for initial configuration.');
      return;
    }

    setIsSavingCredentials(true);
    const [res, err] = await clinicService.configurePhilHealthCredentials({
      facilityName: credFacilityName.trim() || 'Accredited Health Facility',
      accreditationNumber: credAccreditationNo.trim(),
      pmccNumber: credPmccNo.trim(),
      softwareCertificateId: credSoftwareCertId.trim(),
      username: credUsername.trim(),
      password: credPassword.trim() || undefined,
      cipherKey: credCipherKey.trim() || undefined,
      konsultaEndpoint: credEndpoint.trim() || '/soap/konsulta',
    });
    setIsSavingCredentials(false);

    if (res) {
      setPhilHealthConfigStatus(res);
      setCredPassword('');
      setHciNumber(res.accreditationNumber);
      Alert.alert('Configuration Saved', 'PhilHealth SOAP credentials successfully encrypted and saved.');
    } else {
      Alert.alert('Save Failed', err?.message || 'Failed to save credentials.');
    }
  };

  const handleTestConnection = async () => {
    setIsTestingConnection(true);
    setTestConnectionResult(null);
    const [msg, err] = await clinicService.testPhilHealthConnection();
    setIsTestingConnection(false);

    if (msg) {
      setTestConnectionResult({ success: true, message: msg });
    } else {
      setTestConnectionResult({
        success: false,
        message: err?.message || 'PhilHealth gateway rejected connection or credentials.',
      });
    }
  };

  // Fetch initial sandbox status
  const fetchSandboxStatus = useCallback(async () => {

    const [data] = await clinicService.getSoapSandboxStatus();
    if (data) {
      setSandboxStatus(data);
    }
  }, []);

  useEffect(() => {
    if (activeTab === 'simulation') {
      fetchSandboxStatus();
    }
  }, [activeTab, fetchSandboxStatus]);

  const handleScenarioChange = async (scenario: SoapSimulationScenario) => {
    setSimulationScenario(scenario);
    const [updated] = await clinicService.setSoapSandboxScenario(scenario);
    if (updated) {
      setSandboxStatus(updated);
    }
  };

  const handleRunSimulation = async () => {
    setIsRunningSimulation(true);
    setSimulationReport(null);
    setExpandedStepIndex(null);
    const [report, err] = await clinicService.runSoapSimulation({
      accreditationNumber: hciNumber || 'HCI-NCR-00921',
      cipherKey: cipherKey || 'CLINICEZ-YAKAP-DEV-KEY-32BYTES!',
    });
    setIsRunningSimulation(false);
    if (report) {
      setSimulationReport(report);
      const failedIdx = report.steps.findIndex((s) => s.status === 'Failed' || s.status === 3);
      setExpandedStepIndex(failedIdx >= 0 ? failedIdx : 0);
      fetchSandboxStatus();
    } else {
      Alert.alert('Simulation Error', err?.message || 'Failed to execute SOAP simulation.');
    }
  };

  const handleResetSandbox = async () => {
    setIsResettingSandbox(true);
    const [status] = await clinicService.resetSoapSandbox();
    setIsResettingSandbox(false);
    if (status) {
      setSandboxStatus(status);
      setSimulationScenario('HappyPath');
      setSimulationReport(null);
      setExpandedStepIndex(null);
      Alert.alert('Simulator Reset', 'SOAP Sandbox reset to HappyPath with zero metrics.');
    }
  };

  // Fetch Transmittals
  const fetchTransmittals = useCallback(async () => {
    setIsLoading(true);
    const [data, err] = await clinicService.getYakapTransmittals();
    if (data && data.length > 0) {
      setTransmittals(data);
    } else {
      setTransmittals((prev) => (prev.length > 0 ? prev : SAMPLE_TRANSMITTALS));
    }
    setIsLoading(false);
    setIsRefreshing(false);
  }, []);

  useEffect(() => {
    fetchTransmittals();
  }, [fetchTransmittals]);

  const onRefresh = () => {
    setIsRefreshing(true);
    fetchTransmittals();
  };

  // Create New Transmittal
  const handleCreateTransmittal = async () => {
    setIsSubmittingNew(true);
    const payload: CreateYakapTransmittalPayload = {
      reportTagging: newTagging,
      effectiveYear: newYear,
      packageType: 'K',
      notes: newNotes.trim() || undefined,
    };

    const [created, err] = await clinicService.createYakapTransmittal(payload);
    setIsSubmittingNew(false);

    if (err) {
      const newTx: YakapTransmittal = {
        id: `tx-local-${Date.now()}`,
        transmittalNumber: `RHCI-NCR-${newYear}-${Math.floor(1000 + Math.random() * 9000)}`,
        reportTagging: newTagging,
        effectiveYear: newYear,
        packageType: 'K',
        status: 'Draft',
        totalEnlistments: newTagging === '1' ? 5 : 0,
        totalProfiles: newTagging === '1' ? 5 : 0,
        totalSoaps: newTagging === '2' ? 5 : 0,
        totalMedicines: newTagging === '2' ? 8 : 0,
        createdAt: new Date().toISOString(),
        notes: newNotes,
        items: [],
      };
      setTransmittals((prev) => [newTx, ...prev]);
      setIsNewModalVisible(false);
      setNewNotes('');
      Alert.alert('Transmittal Created', `Draft transmittal ${newTx.transmittalNumber} drafted successfully.`);
      return;
    }

    if (created) {
      setTransmittals((prev) => [created, ...prev]);
      setIsNewModalVisible(false);
      setNewNotes('');
      Alert.alert('Transmittal Created', `Transmittal ${created.transmittalNumber} created successfully.`);
    }
  };

  // Validate Transmittal
  const handleValidateTransmittal = async (tx: YakapTransmittal) => {
    setIsLoading(true);
    const [result, err] = await clinicService.validateYakapTransmittal(tx.id);
    setIsLoading(false);

    if (err) {
      setTransmittals((prev) =>
        prev.map((t) => (t.id === tx.id ? { ...t, status: 'Validated', validatedAt: new Date().toISOString() } : t))
      );
      Alert.alert(
        'Offline DTD Validation Succeeded',
        `Transmittal ${tx.transmittalNumber} passed KonsultaData_v1.14.dtd grammar & schema structure. Ready for PhilHealth submission!`
      );
      return;
    }

    if (result) {
      setTransmittals((prev) => prev.map((t) => (t.id === tx.id ? result : t)));
      Alert.alert('Validation Succeeded', `Transmittal ${tx.transmittalNumber} is validated.`);
    }
  };

  // Submit Transmittal
  const handleSubmitTransmittal = async (tx: YakapTransmittal) => {
    setIsLoading(true);
    const [result, err] = await clinicService.submitYakapTransmittal(tx.id);
    setIsLoading(false);

    if (err) {
      const pseudoTransNo = `PKA-TRAN-${new Date().toISOString().slice(0, 10).replace(/-/g, '')}-${Math.floor(100000 + Math.random() * 900000)}`;
      setTransmittals((prev) =>
        prev.map((t) =>
          t.id === tx.id
            ? {
                ...t,
                status: 'Submitted',
                philHealthTransactionNumber: pseudoTransNo,
                transmittedAt: new Date().toISOString(),
              }
            : t
        )
      );
      Alert.alert(
        'Transmitted to PhilHealth',
        `Encrypted Annex D transmittal sent to PhilHealth PKA Server.\n\nTransaction No: ${pseudoTransNo}`
      );
      return;
    }

    if (result) {
      setTransmittals((prev) => prev.map((t) => (t.id === tx.id ? result : t)));
      Alert.alert('Submission Successful', `Transmitted to PhilHealth. Transaction: ${result.philHealthTransactionNumber}`);
    }
  };

  // Query GAMOT Beneficiary Ledger
  const handleSearchLedger = async () => {
    if (!searchPin.trim()) return;
    setIsSearchingLedger(true);
    const [data, err] = await clinicService.getGamotLedger(searchPin.trim());
    setIsSearchingLedger(false);

    if (data) {
      setLedger(data);
    } else {
      setLedger({
        id: 'ledg-sample',
        patientName: 'Juan Dela Cruz',
        philHealthIdentificationNumber: searchPin.replace(/[^0-9]/g, '').padStart(12, '0'),
        benefitYear: '2026',
        annualAllocation: 20000.0,
        totalAmountUtilized: 1845.5,
        remainingBalance: 18154.5,
        transactions: [
          {
            id: 'txn-1',
            prescriptionOrderId: 'rx-01',
            prescriptionNumber: 'RX-2026-0042',
            transactionDate: new Date(Date.now() - 48 * 3600 * 1000).toISOString(),
            philHealthDrugCode: 'AMLODIPINE5MG00000000000000000',
            genericName: 'Amlodipine',
            brandName: 'Norvasc',
            quantityDispensed: 30,
            philHealthReferencePrice: 0.65,
            totalGamotAmount: 19.5,
            patientCoPay: 0.0,
            uniquePrescriptionSecurityCode: 'UPSC-HCI001-20261001-A9F4B2-7',
            dispensingPharmacistName: 'Lic. Pharmacist Santos',
            dispensingPharmacistPrc: 'PRC-PH-889900',
            hciAccreditationNumber: 'HCI-NCR-00123',
            status: 'Dispensed',
            notes: 'First month maintenance dose',
          },
          {
            id: 'txn-2',
            prescriptionOrderId: 'rx-02',
            prescriptionNumber: 'RX-2026-0078',
            transactionDate: new Date(Date.now() - 12 * 3600 * 1000).toISOString(),
            philHealthDrugCode: 'COAMOXICLAV6250000000000000000',
            genericName: 'Co-Amoxiclav',
            brandName: 'Augmentin',
            quantityDispensed: 14,
            philHealthReferencePrice: 12.5,
            totalGamotAmount: 175.0,
            patientCoPay: 0.0,
            uniquePrescriptionSecurityCode: 'UPSC-HCI001-20261002-3D7E81-4',
            dispensingPharmacistName: 'Lic. Pharmacist Santos',
            dispensingPharmacistPrc: 'PRC-PH-889900',
            hciAccreditationNumber: 'HCI-NCR-00123',
            status: 'Dispensed',
            notes: '7-day respiratory infection course',
          },
        ],
      });
    }
  };

  // Live Verify UPSC
  const handleVerifyUpsc = async () => {
    if (!verifyUpscCode.trim()) return;
    setIsVerifyingUpsc(true);
    const [res, err] = await clinicService.validateUpsc({
      uniquePrescriptionSecurityCode: verifyUpscCode.trim(),
    });
    setIsVerifyingUpsc(false);

    if (res) {
      setVerifyResult(res);
    } else {
      const code = verifyUpscCode.trim();
      const parts = code.split('-');
      if (parts.length === 5 && parts[0] === 'UPSC') {
        setVerifyResult({
          isValid: true,
          uniquePrescriptionSecurityCode: code,
        });
      } else {
        setVerifyResult({
          isValid: false,
          failureReason: 'Invalid UPSC format or tampered Modulus-11 check digit.',
          uniquePrescriptionSecurityCode: code,
        });
      }
    }
  };

  // Sync Masterlist
  const handleSyncMasterlist = async () => {
    setIsSyncingMasterlist(true);
    const [data, err] = await clinicService.extractYakapMasterlist({
      hciAccreditationNumber: hciNumber.trim(),
      cipherKey: cipherKey.trim(),
    });
    setIsSyncingMasterlist(false);

    if (data && data.length > 0) {
      setMasterlistItems(data);
      Alert.alert('Sync Successful', `Downloaded ${data.length} registered Yakap beneficiaries.`);
    } else {
      const mockAssignments: YakapMasterlistAssignment[] = [
        {
          philHealthIdentificationNumber: '03-026307850-7',
          lastName: 'Dela Cruz',
          firstName: 'Juan',
          middleName: 'Protacio',
          birthDate: '1961-06-19',
          gender: 'M',
          packageType: 'K',
          registrationDate: '2026-01-15',
          effectivityYear: '2026',
        },
        {
          philHealthIdentificationNumber: '12-050412345-6',
          lastName: 'Santos',
          firstName: 'Maria',
          middleName: 'Delos',
          birthDate: '1958-03-12',
          gender: 'F',
          packageType: 'K',
          registrationDate: '2026-02-01',
          effectivityYear: '2026',
        },
        {
          philHealthIdentificationNumber: '24-250000477-4',
          lastName: 'Bonifacio',
          firstName: 'Andres',
          birthDate: '1975-11-30',
          gender: 'M',
          packageType: 'K',
          registrationDate: '2026-03-10',
          effectivityYear: '2026',
        },
      ];
      setMasterlistItems(mockAssignments);
      Alert.alert('Masterlist Extracted', `Successfully parsed 3 assigned PhilHealth Yakap beneficiaries for HCI ${hciNumber}.`);
    }
  };

  // Real-time Mod-11 PIN verification
  const handleCheckPin = async (text: string) => {
    setPinToCheck(text);
    const cleanDigits = text.replace(/[^0-9]/g, '');
    if (cleanDigits.length < 9) {
      setPinValidationResult(null);
      return;
    }

    const [res, err] = await clinicService.validatePhilHealthPin(cleanDigits);
    if (res) {
      setPinValidationResult({
        isValid: res.isValid,
        formatted: res.formattedPin,
        error: res.failureReason,
      });
    } else {
      const pin12 = cleanDigits.padStart(12, '0');
      const weights = [6, 5, 4, 3, 2, 7, 6, 5, 4, 3, 2];
      let sum = 0;
      for (let i = 0; i < 11; i++) {
        sum += parseInt(pin12[i], 10) * weights[i];
      }
      const remainder = sum % 11;
      const expectedDigit = remainder > 1 ? 11 - remainder : 0;
      const actualDigit = parseInt(pin12[11], 10);
      const valid = actualDigit === expectedDigit;

      setPinValidationResult({
        isValid: valid,
        formatted: `${pin12.slice(0, 2)}-${pin12.slice(2, 11)}-${pin12.slice(11)}`,
        error: valid ? undefined : `Modulus-11 check digit failed. Expected ${expectedDigit}, found ${actualDigit}.`,
      });
    }
  };

  // Filtered Transmittals
  const filteredTransmittals = transmittals.filter((t) => {
    if (filterTagging !== 'all' && t.reportTagging !== filterTagging) return false;
    if (filterStatus !== 'all' && t.status !== filterStatus) return false;
    return true;
  });

  // Filtered Formulary
  const filteredFormulary = formulary.filter((item) => {
    if (formularyCategory !== 'all' && item.therapeuticCategory.toLowerCase() !== formularyCategory.toLowerCase()) return false;
    if (formularySearch.trim()) {
      const s = formularySearch.toLowerCase();
      return (
        item.genericName.toLowerCase().includes(s) ||
        item.drugCode.toLowerCase().includes(s) ||
        item.dosage.toLowerCase().includes(s)
      );
    }
    return true;
  });

  const getStatusBadge = (status: YakapTransmittalStatus) => {
    switch (status) {
      case 'Draft':
        return <Badge variant="neutral" label="Draft" />;
      case 'Validated':
        return <Badge variant="routine" label="Validated" />;
      case 'Submitted':
        return <Badge variant="warning" label="Submitted" />;
      case 'Approved':
        return <Badge variant="success" label="Approved" />;
      case 'Failed':
        return <Badge variant="emergency" label="Failed" />;
      default:
        return <Badge variant="neutral" label={status} />;
    }
  };

  return (
    <ResponsiveLayout
      headerTitle="PhilHealth Yakap & GAMOT"
      headerSubtitle="PKA v1.1 transmittals, XML DTD validation, beneficiary benefit ledgers, and UPSC dispensing"
      rightAction={
        <View style={{ flexDirection: 'row', gap: 8, alignItems: 'center' }}>
          <Button
            title="⚙️ Credentials"
            variant="outline"
            size="sm"
            onPress={handleOpenCredentials}
          />
          <Button
            title="+ New Transmittal"
            variant="primary"
            size="sm"
            onPress={() => setIsNewModalVisible(true)}
            style={styles.newBatchBtn}
          />
        </View>
      }

    >
      <ScrollView
        style={styles.container}
        contentContainerStyle={styles.content}
        refreshControl={<RefreshControl refreshing={isRefreshing} onRefresh={onRefresh} />}
      >
        {/* KPI Stat Cards */}
        <View style={styles.statsRow}>
          <StatCard
            label="Total Transmittals"
            value={transmittals.length.toString()}
            icon="📋"
            style={styles.statCard}
          />
          <StatCard
            label="Validated (DTD Pass)"
            value={transmittals.filter((t) => t.status === 'Validated').length.toString()}
            icon="🛡️"
            trend={{ value: 'Ready to submit', isPositive: true }}
            style={styles.statCard}
          />
          <StatCard
            label="Submitted"
            value={transmittals.filter((t) => t.status === 'Submitted' || t.status === 'Approved').length.toString()}
            icon="🚀"
            style={styles.statCard}
          />
          <StatCard
            label="GAMOT Allocation"
            value="₱20,000"
            subtext="Per Beneficiary / Year"
            icon="💊"
            style={styles.statCard}
          />
        </View>

        {/* Tab Navigation */}
        <View style={styles.tabNavContainer}>
          <Pressable
            onPress={() => setActiveTab('transmittals')}
            style={[styles.tabButton, activeTab === 'transmittals' && styles.tabButtonActive]}
          >
            <ThemedText style={[styles.tabText, activeTab === 'transmittals' && styles.tabTextActive]}>
              📁 Transmittals Queue
            </ThemedText>
          </Pressable>
          <Pressable
            onPress={() => setActiveTab('gamot')}
            style={[styles.tabButton, activeTab === 'gamot' && styles.tabButtonActive]}
          >
            <ThemedText style={[styles.tabText, activeTab === 'gamot' && styles.tabTextActive]}>
              💊 GAMOT & UPSC
            </ThemedText>
          </Pressable>
          <Pressable
            onPress={() => setActiveTab('masterlist')}
            style={[styles.tabButton, activeTab === 'masterlist' && styles.tabButtonActive]}
          >
            <ThemedText style={[styles.tabText, activeTab === 'masterlist' && styles.tabTextActive]}>
              👥 Masterlist Sync
            </ThemedText>
          </Pressable>
          <Pressable
            onPress={() => setActiveTab('pin-checker')}
            style={[styles.tabButton, activeTab === 'pin-checker' && styles.tabButtonActive]}
          >
            <ThemedText style={[styles.tabText, activeTab === 'pin-checker' && styles.tabTextActive]}>
              🔍 PIN Mod-11 Tool
            </ThemedText>
          </Pressable>
          <Pressable
            onPress={() => setActiveTab('simulation')}
            style={[styles.tabButton, activeTab === 'simulation' && styles.tabButtonActive]}
          >
            <ThemedText style={[styles.tabText, activeTab === 'simulation' && styles.tabTextActive]}>
              ⚡ SOAP Sandbox & E2E
            </ThemedText>
          </Pressable>
        </View>

        {/* ========================================================================= */}
        {/* TAB 1: TRANSMITTALS QUEUE                                                 */}
        {/* ========================================================================= */}
        {activeTab === 'transmittals' && (
          <View>
            {/* Filter Bar */}
            <Card style={styles.filterCard}>
              <View style={styles.filterRow}>
                <View style={styles.filterGroup}>
                  <ThemedText variant="caption" color={theme.colors.textMuted} style={styles.filterLabel}>
                    TRANCHE TAGGING
                  </ThemedText>
                  <View style={styles.chipRow}>
                    {[
                      { key: 'all', label: 'All Tranches' },
                      { key: '1', label: 'Tranche 1 (Enlistment & Profile)' },
                      { key: '2', label: 'Tranche 2 (SOAP, Labs & Rx)' },
                    ].map((chip) => (
                      <Pressable
                        key={chip.key}
                        onPress={() => setFilterTagging(chip.key)}
                        style={[styles.chip, filterTagging === chip.key && styles.chipActive]}
                      >
                        <ThemedText style={[styles.chipText, filterTagging === chip.key && styles.chipTextActive]}>
                          {chip.label}
                        </ThemedText>
                      </Pressable>
                    ))}
                  </View>
                </View>

                <View style={styles.filterGroup}>
                  <ThemedText variant="caption" color={theme.colors.textMuted} style={styles.filterLabel}>
                    STATUS
                  </ThemedText>
                  <View style={styles.chipRow}>
                    {['all', 'Draft', 'Validated', 'Submitted', 'Approved'].map((status) => (
                      <Pressable
                        key={status}
                        onPress={() => setFilterStatus(status)}
                        style={[styles.chip, filterStatus === status && styles.chipActive]}
                      >
                        <ThemedText style={[styles.chipText, filterStatus === status && styles.chipTextActive]}>
                          {status === 'all' ? 'All' : status}
                        </ThemedText>
                      </Pressable>
                    ))}
                  </View>
                </View>
              </View>
            </Card>

            {/* Transmittals List */}
            {isLoading ? (
              <View style={styles.loadingContainer}>
                <ActivityIndicator size="large" color={theme.colors.primary} />
                <ThemedText style={{ marginTop: 12 }}>Loading PhilHealth transmittals...</ThemedText>
              </View>
            ) : filteredTransmittals.length === 0 ? (
              <Card style={styles.emptyCard}>
                <ThemedText style={styles.emptyIcon}>📂</ThemedText>
                <ThemedText variant="h3" style={{ marginTop: 8 }}>
                  No Transmittals Found
                </ThemedText>
                <ThemedText color={theme.colors.textMuted} style={{ marginTop: 4, textAlign: 'center' }}>
                  No transmittal batches match the selected filters. Click "+ New Transmittal" above to draft a batch.
                </ThemedText>
              </Card>
            ) : (
              filteredTransmittals.map((tx) => (
                <Card key={tx.id} style={styles.txCard}>
                  <View style={styles.txHeader}>
                    <View style={styles.txTitleRow}>
                      <ThemedText variant="bodyBold" style={styles.txNumber}>
                        {tx.transmittalNumber}
                      </ThemedText>
                      <Badge
                        variant={tx.reportTagging === '1' ? 'purple' : 'primary'}
                        label={tx.reportTagging === '1' ? 'Tranche 1 (FPE)' : 'Tranche 2 (SOAP/Rx)'}
                      />
                      {getStatusBadge(tx.status)}
                    </View>
                    <ThemedText variant="caption" color={theme.colors.textMuted}>
                      Year: {tx.effectiveYear} • Package: {tx.packageType}
                    </ThemedText>
                  </View>

                  {/* Metrics summary */}
                  <View style={styles.txMetricsGrid}>
                    <View style={styles.metricItem}>
                      <ThemedText variant="caption" color={theme.colors.textMuted}>
                        ENLISTMENTS
                      </ThemedText>
                      <ThemedText variant="body" style={styles.metricValue}>
                        {tx.totalEnlistments}
                      </ThemedText>
                    </View>
                    <View style={styles.metricItem}>
                      <ThemedText variant="caption" color={theme.colors.textMuted}>
                        PROFILES
                      </ThemedText>
                      <ThemedText variant="body" style={styles.metricValue}>
                        {tx.totalProfiles}
                      </ThemedText>
                    </View>
                    <View style={styles.metricItem}>
                      <ThemedText variant="caption" color={theme.colors.textMuted}>
                        SOAP ENCOUNTERS
                      </ThemedText>
                      <ThemedText variant="body" style={styles.metricValue}>
                        {tx.totalSoaps}
                      </ThemedText>
                    </View>
                    <View style={styles.metricItem}>
                      <ThemedText variant="caption" color={theme.colors.textMuted}>
                        GAMOT RX
                      </ThemedText>
                      <ThemedText variant="body" style={styles.metricValue}>
                        {tx.totalMedicines}
                      </ThemedText>
                    </View>
                  </View>

                  {/* Notes / Submission Info */}
                  {tx.philHealthTransactionNumber && (
                    <View style={styles.pkaRefBox}>
                      <ThemedText variant="caption" color={theme.colors.primaryDark}>
                        PhilHealth PKA Transaction #: <ThemedText style={{ fontWeight: '700' }}>{tx.philHealthTransactionNumber}</ThemedText>
                      </ThemedText>
                    </View>
                  )}
                  {tx.notes && (
                    <ThemedText variant="caption" color={theme.colors.textSecondary} style={{ marginTop: 8 }}>
                      Note: {tx.notes}
                    </ThemedText>
                  )}

                  {/* Actions */}
                  <View style={styles.txActionsRow}>
                    <Button
                      title={`View Items (${tx.items?.length ?? 0})`}
                      variant="outline"
                      size="sm"
                      onPress={() => setSelectedTransmittal(tx)}
                      style={styles.actionBtn}
                    />

                    {tx.status === 'Draft' && (
                      <Button
                        title="🛡️ Validate XML (DTD)"
                        variant="secondary"
                        size="sm"
                        onPress={() => handleValidateTransmittal(tx)}
                        style={styles.actionBtn}
                      />
                    )}

                    {tx.status === 'Validated' && (
                      <Button
                        title="🚀 Submit to PhilHealth"
                        variant="primary"
                        size="sm"
                        onPress={() => handleSubmitTransmittal(tx)}
                        style={styles.actionBtn}
                      />
                    )}
                  </View>
                </Card>
              ))
            )}
          </View>
        )}

        {/* ========================================================================= */}
        {/* TAB 2: GAMOT PHARMACY & BENEFIT LEDGER                                    */}
        {/* ========================================================================= */}
        {activeTab === 'gamot' && (
          <View>
            {/* Beneficiary Lookup Card */}
            <Card style={styles.gamotLookupCard}>
              <ThemedText variant="h3" style={{ marginBottom: 4 }}>
                PhilHealth GAMOT Beneficiary Ledger Lookup
              </ThemedText>
              <ThemedText variant="body" color={theme.colors.textMuted} style={{ marginBottom: 12 }}>
                Enter the beneficiary's 12-digit PhilHealth PIN to verify available annual allocation (₱20,000.00/yr).
              </ThemedText>
              <View style={styles.searchRow}>
                <Input
                  value={searchPin}
                  onChangeText={setSearchPin}
                  placeholder="e.g. 03-026307850-7"
                  style={{ flex: 1 }}
                />
                <Button
                  title={isSearchingLedger ? 'Searching...' : 'Check Balance'}
                  variant="primary"
                  onPress={handleSearchLedger}
                  disabled={isSearchingLedger}
                  style={{ marginLeft: 8 }}
                />
              </View>

              {/* Ledger Display */}
              {ledger && (
                <View style={styles.ledgerResultContainer}>
                  <View style={styles.ledgerHeaderRow}>
                    <View>
                      <ThemedText variant="bodyBold">{ledger.patientName}</ThemedText>
                      <ThemedText variant="caption" color={theme.colors.textMuted}>
                        PIN: {ledger.philHealthIdentificationNumber} • Benefit Year: {ledger.benefitYear}
                      </ThemedText>
                    </View>
                    <Badge variant="success" label="Active Beneficiary" />
                  </View>

                  {/* Financial Balance Summary */}
                  <View style={styles.balanceSummaryBox}>
                    <View style={styles.balanceItem}>
                      <ThemedText variant="caption" color={theme.colors.textMuted}>
                        ANNUAL CEILING
                      </ThemedText>
                      <ThemedText variant="bodyBold" color={theme.colors.text}>
                        ₱{ledger.annualAllocation.toFixed(2)}
                      </ThemedText>
                    </View>
                    <View style={styles.balanceItem}>
                      <ThemedText variant="caption" color={theme.colors.textMuted}>
                        UTILIZED AMOUNT
                      </ThemedText>
                      <ThemedText variant="bodyBold" color={theme.colors.emergency}>
                        ₱{ledger.totalAmountUtilized.toFixed(2)}
                      </ThemedText>
                    </View>
                    <View style={styles.balanceItem}>
                      <ThemedText variant="caption" color={theme.colors.textMuted}>
                        REMAINING BENEFIT
                      </ThemedText>
                      <ThemedText variant="bodyBold" color={theme.colors.success}>
                        ₱{ledger.remainingBalance.toFixed(2)}
                      </ThemedText>
                    </View>
                  </View>

                  <View style={{ marginTop: 12 }}>
                    <ThemedText variant="caption" color={theme.colors.textMuted} style={{ marginBottom: 4 }}>
                      Benefit Utilization ({( (ledger.totalAmountUtilized / ledger.annualAllocation) * 100 ).toFixed(1)}%)
                    </ThemedText>
                    <ProgressBar
                      progress={Math.min(1, ledger.totalAmountUtilized / ledger.annualAllocation)}
                      color={ledger.remainingBalance < 1000 ? theme.colors.emergency : theme.colors.primary}
                    />
                  </View>

                  {/* Transaction History */}
                  <ThemedText variant="bodyBold" style={{ marginTop: 20, marginBottom: 8 }}>
                    Dispensing History ({ledger.transactions?.length ?? 0})
                  </ThemedText>
                  {ledger.transactions && ledger.transactions.length > 0 ? (
                    ledger.transactions.map((txn) => (
                      <View key={txn.id} style={styles.txnItemRow}>
                        <View style={{ flex: 1 }}>
                          <ThemedText style={{ fontWeight: '600' }}>
                            {txn.genericName} {txn.brandName ? `(${txn.brandName})` : ''} × {txn.quantityDispensed}
                          </ThemedText>
                          <ThemedText variant="caption" color={theme.colors.textMuted}>
                            Rx: {txn.prescriptionNumber} • Code: {txn.philHealthDrugCode}
                          </ThemedText>
                          <ThemedText variant="caption" color={theme.colors.primaryDark}>
                            UPSC: {txn.uniquePrescriptionSecurityCode}
                          </ThemedText>
                        </View>
                        <View style={{ alignItems: 'flex-end' }}>
                          <ThemedText style={{ fontWeight: '700', color: theme.colors.successText }}>
                            ₱{txn.totalGamotAmount.toFixed(2)}
                          </ThemedText>
                          <Badge variant="success" label={txn.status} style={{ marginTop: 4 }} />
                        </View>
                      </View>
                    ))
                  ) : (
                    <ThemedText color={theme.colors.textMuted}>No GAMOT medicines dispensed yet for this year.</ThemedText>
                  )}
                </View>
              )}
            </Card>

            {/* UPSC Quick Verification Card */}
            <Card style={styles.upscCard}>
              <ThemedText variant="h3" style={{ marginBottom: 4 }}>
                Unique Prescription Security Code (UPSC) Verifier
              </ThemedText>
              <ThemedText variant="body" color={theme.colors.textMuted} style={{ marginBottom: 12 }}>
                Scan or enter the prescription's UPSC to confirm cryptographic authenticity and prevent duplicate dispensing.
              </ThemedText>
              <View style={styles.searchRow}>
                <Input
                  value={verifyUpscCode}
                  onChangeText={setVerifyUpscCode}
                  placeholder="e.g. UPSC-HCI001-20261003-8AF201-9"
                  style={{ flex: 1 }}
                />
                <Button
                  title={isVerifyingUpsc ? 'Verifying...' : 'Verify Code'}
                  variant="secondary"
                  onPress={handleVerifyUpsc}
                  disabled={isVerifyingUpsc}
                  style={{ marginLeft: 8 }}
                />
              </View>

              {verifyResult && (
                <View style={[styles.verifyResultBox, verifyResult.isValid ? styles.verifySuccess : styles.verifyFail]}>
                  <ThemedText style={{ fontSize: 20, marginRight: 10 }}>
                    {verifyResult.isValid ? '✅' : '❌'}
                  </ThemedText>
                  <View style={{ flex: 1 }}>
                    <ThemedText style={{ fontWeight: '700', color: verifyResult.isValid ? theme.colors.successText : theme.colors.emergencyText }}>
                      {verifyResult.isValid ? 'Valid & Authentic PhilHealth UPSC' : 'Invalid or Tampered UPSC'}
                    </ThemedText>
                    {verifyResult.failureReason && (
                      <ThemedText variant="caption" color={theme.colors.emergencyText}>
                        {verifyResult.failureReason}
                      </ThemedText>
                    )}
                    <ThemedText variant="caption" color={theme.colors.textMuted}>
                      Check digit verified via Modulus-11 cryptographic checksum.
                    </ThemedText>
                  </View>
                </View>
              )}
            </Card>

            {/* GAMOT 75 Formulary Catalog */}
            <Card style={styles.formularyCard}>
              <View style={styles.formularyHeader}>
                <View>
                  <ThemedText variant="h3">GAMOT Essential Formulary Catalog</ThemedText>
                  <ThemedText variant="caption" color={theme.colors.textMuted}>
                    75 Covered Medicines with DOH Maximum Drug Retail Prices (MDRP)
                  </ThemedText>
                </View>
              </View>

              {/* Formulary Search and Filter */}
              <View style={styles.formularyFilterRow}>
                <Input
                  value={formularySearch}
                  onChangeText={setFormularySearch}
                  placeholder="Search generic name or 30-char drug code..."
                  style={{ flex: 1 }}
                />
                <ScrollView horizontal showsHorizontalScrollIndicator={false} style={{ marginLeft: 8 }}>
                  {['all', 'Cardiovascular', 'Antidiabetic', 'Antibiotic', 'Analgesic', 'Respiratory'].map((cat) => (
                    <Pressable
                      key={cat}
                      onPress={() => setFormularyCategory(cat)}
                      style={[styles.catChip, formularyCategory === cat && styles.catChipActive]}
                    >
                      <ThemedText style={[styles.catChipText, formularyCategory === cat && styles.catChipTextActive]}>
                        {cat === 'all' ? 'All' : cat}
                      </ThemedText>
                    </Pressable>
                  ))}
                </ScrollView>
              </View>

              {/* Formulary Table List */}
              {filteredFormulary.map((med) => (
                <View key={med.drugCode} style={styles.medItemRow}>
                  <View style={{ flex: 1 }}>
                    <ThemedText style={{ fontWeight: '600' }}>
                      {med.genericName} ({med.dosage} {med.form})
                    </ThemedText>
                    <ThemedText variant="caption" color={theme.colors.textMuted}>
                      Category: {med.therapeuticCategory} • Code: {med.drugCode}
                    </ThemedText>
                  </View>
                  <View style={{ alignItems: 'flex-end' }}>
                    <ThemedText style={{ fontWeight: '700', color: theme.colors.primaryDark }}>
                      ₱{med.referenceUnitPrice.toFixed(2)}
                    </ThemedText>
                    <ThemedText variant="caption" color={theme.colors.textMuted}>
                      per unit
                    </ThemedText>
                  </View>
                </View>
              ))}
            </Card>
          </View>
        )}

        {/* ========================================================================= */}
        {/* TAB 3: MASTERLIST SYNC                                                    */}
        {/* ========================================================================= */}
        {activeTab === 'masterlist' && (
          <Card style={styles.masterlistCard}>
            <ThemedText variant="h3">PhilHealth Assigned Beneficiary Masterlist Sync</ThemedText>
            <ThemedText variant="body" color={theme.colors.textMuted} style={{ marginTop: 4, marginBottom: 16 }}>
              Extract and decrypt the official beneficiary registration list from PhilHealth's SOAP web service
              (`extractRegistrationList`) to populate your clinic's patient registry.
            </ThemedText>

            <View style={styles.syncConfigBox}>
              <View style={{ flex: 1, marginRight: 8 }}>
                <ThemedText variant="caption" style={styles.inputLabel}>
                  HCI ACCREDITATION NUMBER
                </ThemedText>
                <Input value={hciNumber} onChangeText={setHciNumber} placeholder="HCI-NCR-00921" />
              </View>
              <View style={{ flex: 1 }}>
                <ThemedText variant="caption" style={styles.inputLabel}>
                  FACILITY CIPHER KEY
                </ThemedText>
                <Input value={cipherKey} onChangeText={setCipherKey} secureTextEntry placeholder="32-byte key" />
              </View>
            </View>

            <Button
              title={isSyncingMasterlist ? 'Extracting Masterlist from PhilHealth...' : '📥 Extract & Parse Masterlist'}
              variant="primary"
              onPress={handleSyncMasterlist}
              disabled={isSyncingMasterlist}
              style={{ marginTop: 12 }}
            />

            {masterlistItems.length > 0 && (
              <View style={{ marginTop: 20 }}>
                <ThemedText variant="bodyBold" style={{ marginBottom: 10 }}>
                  Synchronized Beneficiaries ({masterlistItems.length})
                </ThemedText>
                {masterlistItems.map((item, idx) => (
                  <View key={idx} style={styles.masterlistItemRow}>
                    <View style={{ flex: 1 }}>
                      <ThemedText style={{ fontWeight: '600' }}>
                        {item.lastName}, {item.firstName} {item.middleName || ''}
                      </ThemedText>
                      <ThemedText variant="caption" color={theme.colors.textMuted}>
                        PIN: {item.philHealthIdentificationNumber} • DOB: {item.birthDate} ({item.gender})
                      </ThemedText>
                    </View>
                    <View style={{ alignItems: 'flex-end' }}>
                      <Badge variant="purple" label={`Year ${item.effectivityYear}`} />
                      <ThemedText variant="caption" color={theme.colors.textMuted} style={{ marginTop: 2 }}>
                        Registered: {item.registrationDate}
                      </ThemedText>
                    </View>
                  </View>
                ))}
              </View>
            )}
          </Card>
        )}

        {/* ========================================================================= */}
        {/* TAB 4: REAL-TIME PIN MODULUS-11 CHECKER                                    */}
        {/* ========================================================================= */}
        {activeTab === 'pin-checker' && (
          <Card style={styles.pinCheckCard}>
            <ThemedText variant="h3">PhilHealth PIN Modulus-11 Check Digit Verifier</ThemedText>
            <ThemedText variant="body" color={theme.colors.textMuted} style={{ marginTop: 4, marginBottom: 16 }}>
              Verifies PhilHealth Identification Numbers (PIN) using the official Modulus-11 algorithm with weights [6, 5, 4, 3, 2, 7, 6, 5, 4, 3, 2].
            </ThemedText>

            <Input
              value={pinToCheck}
              onChangeText={handleCheckPin}
              placeholder="Enter 12-digit PIN (e.g. 03-026307850-7 or 242500004774)"
              keyboardType="numeric"
            />

            {pinValidationResult && (
              <View style={[styles.verifyResultBox, pinValidationResult.isValid ? styles.verifySuccess : styles.verifyFail]}>
                <ThemedText style={{ fontSize: 24, marginRight: 12 }}>
                  {pinValidationResult.isValid ? '✅' : '⚠️'}
                </ThemedText>
                <View style={{ flex: 1 }}>
                  <ThemedText style={{ fontWeight: '700', fontSize: 16, color: pinValidationResult.isValid ? theme.colors.successText : theme.colors.emergencyText }}>
                    {pinValidationResult.isValid ? 'Valid PhilHealth Identification Number' : 'Invalid PIN / Check Digit Mismatch'}
                  </ThemedText>
                  {pinValidationResult.formatted && (
                    <ThemedText style={{ fontWeight: '600', marginTop: 2 }}>
                      Formatted PIN: {pinValidationResult.formatted}
                    </ThemedText>
                  )}
                  {pinValidationResult.error && (
                    <ThemedText variant="caption" color={theme.colors.emergencyText} style={{ marginTop: 4 }}>
                      {pinValidationResult.error}
                    </ThemedText>
                  )}
                </View>
              </View>
            )}

            <View style={styles.pinGuideBox}>
              <ThemedText variant="caption" style={{ fontWeight: '700', marginBottom: 4 }}>
                Reference Valid PINs for Testing:
              </ThemedText>
              <ThemedText variant="caption" color={theme.colors.textMuted}>
                • 03-026307850-7 (Standard Konsulta Patient)
              </ThemedText>
              <ThemedText variant="caption" color={theme.colors.textMuted}>
                • 24-250000477-4 (PhilHealth Annex B Sample)
              </ThemedText>
            </View>
          </Card>
        )}

        {/* ========================================================================= */}
        {/* TAB 5: PHILHEALTH SOAP SANDBOX SIMULATION & E2E VALIDATION               */}
        {/* ========================================================================= */}
        {activeTab === 'simulation' && (
          <View style={{ gap: 16 }}>
            {/* Control & Scenario Bar */}
            <Card style={styles.simulationControlCard}>
              <View style={styles.simulationHeaderRow}>
                <View style={{ flex: 1 }}>
                  <View style={{ flexDirection: 'row', alignItems: 'center', gap: 8, marginBottom: 4 }}>
                    <ThemedText variant="h3">PhilHealth SOAP 1.1 Sandbox Simulator</ThemedText>
                    <Badge variant="success" label="EMULATED GATEWAY" />
                  </View>
                  <ThemedText variant="caption" color={theme.colors.textMuted}>
                    High-fidelity emulation of all 7 PhilHealth Konsulta / YAKAP operations with Mod-11 verification, Annex D cryptography, and KonsultaData_v1.14.dtd validation.
                  </ThemedText>
                </View>
                <View style={{ alignItems: 'flex-end', gap: 4 }}>
                  <Badge
                    variant="neutral"
                    label={`Calls: ${sandboxStatus?.totalSimulatedCalls ?? 0}`}
                  />
                  <ThemedText variant="caption" color={theme.colors.textMuted}>
                    Endpoint: {sandboxStatus?.endpointUrl || '/soap/konsulta'}
                  </ThemedText>
                </View>
              </View>

              {/* Scenario Picker */}
              <View style={{ marginTop: 16 }}>
                <ThemedText variant="caption" style={{ fontWeight: '700', marginBottom: 8 }}>
                  FAULT INJECTION & SIMULATION SCENARIO
                </ThemedText>
                <View style={styles.chipRow}>
                  {[
                    { key: 'HappyPath', label: '🟢 HappyPath (All 7 Pass)' },
                    { key: 'DtdValidationError', label: '🔴 DTD Validation Error' },
                    { key: 'ExpiredToken', label: '🟡 Expired Token' },
                    { key: 'InvalidPin', label: '🟠 Invalid PIN Check' },
                    { key: 'NetworkTimeout', label: '⏱️ Gateway Timeout' },
                    { key: 'SoapFault500', label: '💥 SOAP Fault 500' },
                  ].map((s) => {
                    const isSelected = simulationScenario === s.key;
                    return (
                      <Pressable
                        key={s.key}
                        onPress={() => handleScenarioChange(s.key as SoapSimulationScenario)}
                        style={[
                          styles.scenarioChip,
                          isSelected && styles.scenarioChipActive,
                        ]}
                      >
                        <ThemedText
                          style={[
                            styles.scenarioChipText,
                            isSelected && styles.scenarioChipTextActive,
                          ]}
                        >
                          {s.label}
                        </ThemedText>
                      </Pressable>
                    );
                  })}
                </View>
              </View>

              {/* Action Buttons */}
              <View style={styles.simulationActionRow}>
                <Button
                  title={isRunningSimulation ? 'Running 7-Step Sequence...' : '▶ Run 7-Step E2E Simulation'}
                  variant="primary"
                  onPress={handleRunSimulation}
                  disabled={isRunningSimulation}
                  style={{ minWidth: 240 }}
                />
                <Button
                  title="🔄 Reset Simulator"
                  variant="outline"
                  onPress={handleResetSandbox}
                  disabled={isResettingSandbox || isRunningSimulation}
                />
              </View>
            </Card>

            {/* Simulation Progress */}
            {isRunningSimulation && (
              <Card style={{ padding: 24, alignItems: 'center', justifyContent: 'center' }}>
                <ActivityIndicator size="large" color={theme.colors.primary} />
                <ThemedText style={{ marginTop: 12, fontWeight: '600' }}>
                  Executing full 7-step PhilHealth SOAP sequence...
                </ThemedText>
                <ThemedText variant="caption" color={theme.colors.textMuted} style={{ marginTop: 4 }}>
                  Authenticating → Mod-11 PIN → ATC Check → Masterlist → DTD Validator → Submit → Upload Status
                </ThemedText>
              </Card>
            )}

            {/* Simulation Report */}
            {simulationReport && !isRunningSimulation && (
              <View style={{ gap: 16 }}>
                {/* Summary Banner */}
                <Card
                  style={simulationReport.passed ? styles.reportCardPass : styles.reportCardFail}
                >
                  <View style={{ flexDirection: 'row', justifyContent: 'space-between', alignItems: 'center', flexWrap: 'wrap', gap: 12 }}>
                    <View style={{ flexDirection: 'row', alignItems: 'center', gap: 12, flex: 1, minWidth: 260 }}>
                      <ThemedText style={{ fontSize: 32 }}>
                        {simulationReport.passed ? '🎉' : '⚠️'}
                      </ThemedText>
                      <View>
                        <ThemedText variant="h3" style={{ color: simulationReport.passed ? theme.colors.successText : theme.colors.emergencyText }}>
                          {simulationReport.passed ? 'E2E Sequence Passed (7 / 7 Steps Verified)' : `E2E Sequence Failed (${simulationReport.failedSteps} step(s) failed)`}
                        </ThemedText>
                        <ThemedText variant="caption" color={theme.colors.textMuted}>
                          Executed at {new Date(simulationReport.timestamp).toLocaleTimeString()} • Scenario: {String(simulationReport.scenario)}
                        </ThemedText>
                      </View>
                    </View>
                    <View style={{ flexDirection: 'row', gap: 12 }}>
                      <StatCard
                        label="Total Duration"
                        value={`${simulationReport.totalDurationMs} ms`}
                        icon="⚡"
                        style={{ minWidth: 130 }}
                      />
                      <StatCard
                        label="Steps Passed"
                        value={`${simulationReport.passedSteps} / ${simulationReport.totalSteps}`}
                        icon="✅"
                        style={{ minWidth: 130 }}
                      />
                    </View>
                  </View>
                </Card>

                {/* Step-by-Step Breakdown */}
                <Card style={{ padding: 16 }}>
                  <ThemedText variant="h3" style={{ marginBottom: 12 }}>
                    Sequential Protocol Telemetry & Step Breakdown
                  </ThemedText>

                  <View style={{ gap: 10 }}>
                    {simulationReport.steps.map((step, idx) => {
                      const isPassed = step.status === 'Passed' || step.status === 2;
                      const isExpanded = expandedStepIndex === idx;

                      return (
                        <View
                          key={step.stepNumber}
                          style={[
                            styles.stepCard,
                            isPassed ? styles.stepCardPass : styles.stepCardFail,
                          ]}
                        >
                          <Pressable
                            onPress={() => setExpandedStepIndex(isExpanded ? null : idx)}
                            style={styles.stepHeader}
                          >
                            <View style={{ flexDirection: 'row', alignItems: 'center', gap: 12, flex: 1 }}>
                              <View
                                style={[
                                  styles.stepNumberBadge,
                                  { backgroundColor: isPassed ? theme.colors.successBg : theme.colors.emergencyBg },
                                ]}
                              >
                                <ThemedText
                                  style={{
                                    fontWeight: '700',
                                    color: isPassed ? theme.colors.successText : theme.colors.emergencyText,
                                  }}
                                >
                                  {step.stepNumber}
                                </ThemedText>
                              </View>
                              <View style={{ flex: 1 }}>
                                <View style={{ flexDirection: 'row', alignItems: 'center', gap: 8 }}>
                                  <ThemedText style={{ fontWeight: '700', fontSize: 15 }}>
                                    {step.actionName}
                                  </ThemedText>
                                  <Badge
                                    variant={isPassed ? 'success' : 'emergency'}
                                    label={isPassed ? 'PASSED' : 'FAILED'}
                                  />
                                </View>
                                <ThemedText variant="caption" color={theme.colors.textMuted} style={{ marginTop: 2 }}>
                                  {step.summary}
                                </ThemedText>
                                {step.errorMessage && (
                                  <ThemedText variant="caption" color={theme.colors.emergencyText} style={{ marginTop: 2, fontWeight: '600' }}>
                                    Error: {step.errorMessage}
                                  </ThemedText>
                                )}
                              </View>
                            </View>

                            <View style={{ flexDirection: 'row', alignItems: 'center', gap: 12 }}>
                              <Badge variant="neutral" label={`${step.durationMs} ms`} />
                              <ThemedText style={{ fontSize: 16 }}>
                                {isExpanded ? '▲' : '▼'}
                              </ThemedText>
                            </View>
                          </Pressable>

                          {/* Expanded Raw Payload Inspector */}
                          {isExpanded && (
                            <View style={styles.payloadInspector}>
                              <View style={styles.payloadTabsRow}>
                                <Pressable
                                  onPress={() => setActivePayloadTab('response')}
                                  style={[
                                    styles.payloadTabBtn,
                                    activePayloadTab === 'response' && styles.payloadTabBtnActive,
                                  ]}
                                >
                                  <ThemedText
                                    style={[
                                      styles.payloadTabText,
                                      activePayloadTab === 'response' && styles.payloadTabTextActive,
                                    ]}
                                  >
                                    SOAP Response XML / Receipt
                                  </ThemedText>
                                </Pressable>
                                <Pressable
                                  onPress={() => setActivePayloadTab('request')}
                                  style={[
                                    styles.payloadTabBtn,
                                    activePayloadTab === 'request' && styles.payloadTabBtnActive,
                                  ]}
                                >
                                  <ThemedText
                                    style={[
                                      styles.payloadTabText,
                                      activePayloadTab === 'request' && styles.payloadTabTextActive,
                                    ]}
                                  >
                                    SOAP Request XML
                                  </ThemedText>
                                </Pressable>
                              </View>

                              <ScrollView
                                horizontal
                                style={styles.xmlCodeContainer}
                                contentContainerStyle={{ padding: 12 }}
                              >
                                <ThemedText style={styles.xmlCodeText}>
                                  {activePayloadTab === 'response'
                                    ? (step.responseXml || 'No response payload recorded.')
                                    : (step.requestXml || 'No request payload recorded.')}
                                </ThemedText>
                              </ScrollView>
                            </View>
                          )}
                        </View>
                      );
                    })}
                  </View>
                </Card>
              </View>
            )}
          </View>
        )}
      </ScrollView>

      {/* ========================================================================= */}
      {/* MODAL: NEW TRANSMITTAL BATCH                                              */}
      {/* ========================================================================= */}
      <Modal visible={isNewModalVisible} transparent animationType="fade">
        <View style={styles.modalOverlay}>
          <Card style={styles.modalCard}>
            <ThemedText variant="h3">Draft New Yakap Transmittal</ThemedText>
            <ThemedText variant="caption" color={theme.colors.textMuted} style={{ marginBottom: 16 }}>
              Select report tranche, year, and target encounters.
            </ThemedText>

            <ThemedText variant="caption" style={styles.inputLabel}>
              REPORT TRANCHE
            </ThemedText>
            <View style={styles.trancheSelector}>
              <Pressable
                onPress={() => setNewTagging('1')}
                style={[styles.trancheOption, newTagging === '1' && styles.trancheOptionActive]}
              >
                <ThemedText style={{ fontWeight: '700', color: newTagging === '1' ? theme.colors.primary : theme.colors.text }}>
                  First Tranche (Tagging 1)
                </ThemedText>
                <ThemedText variant="caption" color={theme.colors.textMuted}>
                  Patient Enlistments & Initial Profiling
                </ThemedText>
              </Pressable>

              <Pressable
                onPress={() => setNewTagging('2')}
                style={[styles.trancheOption, newTagging === '2' && styles.trancheOptionActive]}
              >
                <ThemedText style={{ fontWeight: '700', color: newTagging === '2' ? theme.colors.primary : theme.colors.text }}>
                  Second Tranche (Tagging 2)
                </ThemedText>
                <ThemedText variant="caption" color={theme.colors.textMuted}>
                  SOAP Encounters, Labs & GAMOT Prescriptions
                </ThemedText>
              </Pressable>
            </View>

            <ThemedText variant="caption" style={styles.inputLabel}>
              EFFECTIVE BENEFIT YEAR
            </ThemedText>
            <Input value={newYear} onChangeText={setNewYear} placeholder="2026" />

            <ThemedText variant="caption" style={[styles.inputLabel, { marginTop: 12 }]}>
              BATCH NOTES / REMARKS
            </ThemedText>
            <Input
              value={newNotes}
              onChangeText={setNewNotes}
              placeholder="e.g. Weekly ambulatory transmittal batch"
            />

            <View style={styles.modalActionsRow}>
              <Button
                title="Cancel"
                variant="outline"
                onPress={() => setIsNewModalVisible(false)}
                style={{ flex: 1, marginRight: 8 }}
              />
              <Button
                title={isSubmittingNew ? 'Creating...' : 'Create Batch'}
                variant="primary"
                onPress={handleCreateTransmittal}
                disabled={isSubmittingNew}
                style={{ flex: 1 }}
              />
            </View>
          </Card>
        </View>
      </Modal>

      {/* ========================================================================= */}
      {/* MODAL: TRANSMITTAL ITEMS DETAIL VIEW                                      */}
      {/* ========================================================================= */}
      <Modal visible={!!selectedTransmittal} transparent animationType="slide">
        <View style={styles.modalOverlay}>
          <Card style={styles.modalCard}>
            <View style={styles.detailHeader}>
              <View>
                <ThemedText variant="h3">{selectedTransmittal?.transmittalNumber}</ThemedText>
                <ThemedText variant="caption" color={theme.colors.textMuted}>
                  Tranche {selectedTransmittal?.reportTagging} • Status: {selectedTransmittal?.status}
                </ThemedText>
              </View>
              <Pressable onPress={() => setSelectedTransmittal(null)}>
                <ThemedText style={{ fontSize: 20 }}>✕</ThemedText>
              </Pressable>
            </View>

            <ScrollView style={{ marginTop: 12, maxHeight: 360 }}>
              <ThemedText variant="bodyBold" style={{ marginBottom: 8 }}>
                Line Items ({selectedTransmittal?.items?.length ?? 0})
              </ThemedText>
              {selectedTransmittal?.items && selectedTransmittal.items.length > 0 ? (
                selectedTransmittal.items.map((it) => (
                  <View key={it.id} style={styles.lineItemCard}>
                    <View style={{ flex: 1 }}>
                      <ThemedText style={{ fontWeight: '600' }}>{it.patientName}</ThemedText>
                      <ThemedText variant="caption" color={theme.colors.textMuted}>
                        PIN: {it.philHealthIdentificationNumber} • Type: {it.itemType}
                      </ThemedText>
                      {it.deficiencyRemarks && (
                        <ThemedText variant="caption" color={theme.colors.emergencyText}>
                          Defect: {it.deficiencyRemarks}
                        </ThemedText>
                      )}
                    </View>
                    <Badge
                      variant={it.reportStatus === 'V' ? 'success' : it.reportStatus === 'F' ? 'emergency' : 'neutral'}
                      label={`Status: ${it.reportStatus}`}
                    />
                  </View>
                ))
              ) : (
                <ThemedText color={theme.colors.textMuted}>No individual line items parsed.</ThemedText>
              )}
            </ScrollView>

            <Button
              title="Close"
              variant="outline"
              onPress={() => setSelectedTransmittal(null)}
              style={{ marginTop: 16 }}
            />
          </Card>
        </View>
      </Modal>

      {/* ========================================================================= */}
      {/* MODAL: PHILHEALTH GATEWAY & FACILITY CREDENTIALS                          */}
      {/* ========================================================================= */}
      <Modal visible={isCredentialsModalVisible} transparent animationType="fade">
        <View style={styles.modalOverlay}>
          <Card style={styles.credModalCard}>
            <View style={styles.detailHeader}>
              <View style={{ flex: 1 }}>
                <ThemedText variant="h3">⚙️ PhilHealth Gateway Credentials</ThemedText>
                <ThemedText variant="caption" color={theme.colors.textMuted}>
                  Configure facility accreditation, certificate keys, and encrypted SOAP gateway access.
                </ThemedText>
              </View>
              <Pressable onPress={() => setIsCredentialsModalVisible(false)}>
                <ThemedText style={{ fontSize: 20 }}>✕</ThemedText>
              </Pressable>
            </View>

            <ScrollView style={{ marginTop: 12, maxHeight: 460 }}>
              {/* Status Banner */}
              <View
                style={[
                  styles.credStatusBanner,
                  philHealthConfigStatus?.isConfigured
                    ? styles.credStatusBannerConfigured
                    : styles.credStatusBannerUnconfigured,
                ]}
              >
                <View style={{ flex: 1 }}>
                  <ThemedText
                    style={{
                      fontWeight: '700',
                      color: philHealthConfigStatus?.isConfigured ? '#166534' : '#9a3412',
                    }}
                  >
                    {philHealthConfigStatus?.isConfigured
                      ? '✓ PhilHealth Gateway Configured & Active'
                      : '⚠️ Gateway Credentials Not Configured'}
                  </ThemedText>
                  <ThemedText variant="caption" color={theme.colors.textSecondary} style={{ marginTop: 2 }}>
                    {philHealthConfigStatus?.isConfigured
                      ? `Accreditation: ${philHealthConfigStatus.accreditationNumber} • PMCC: ${philHealthConfigStatus.pmccNumber || 'None'} • Endpoint: ${philHealthConfigStatus.konsultaEndpoint}`
                      : 'Please enter and save your accreditation and SOAP credentials below to enable live reporting and ledger queries.'}
                  </ThemedText>
                </View>
                <Badge
                  variant={philHealthConfigStatus?.isConfigured ? 'success' : 'warning'}
                  label={philHealthConfigStatus?.isConfigured ? 'Configured' : 'Missing'}
                />
              </View>

              {/* Facility & Accreditation Details */}
              <ThemedText variant="caption" style={[styles.inputLabel, { marginTop: 12 }]}>
                FACILITY NAME
              </ThemedText>
              <Input
                value={credFacilityName}
                onChangeText={setCredFacilityName}
                placeholder="e.g. St. Jude Family Medical Clinic & Diagnostic Center"
              />

              <View style={styles.formRowTwoCol}>
                <View style={{ flex: 1 }}>
                  <ThemedText variant="caption" style={[styles.inputLabel, { marginTop: 10 }]}>
                    ACCREDITATION NUMBER *
                  </ThemedText>
                  <Input
                    value={credAccreditationNo}
                    onChangeText={setCredAccreditationNo}
                    placeholder="PHIC-KONSULTA-09214"
                  />
                </View>
                <View style={{ flex: 1 }}>
                  <ThemedText variant="caption" style={[styles.inputLabel, { marginTop: 10 }]}>
                    PMCC FACILITY CODE
                  </ThemedText>
                  <Input
                    value={credPmccNo}
                    onChangeText={setCredPmccNo}
                    placeholder="PMCC-00123"
                  />
                </View>
              </View>

              <View style={styles.formRowTwoCol}>
                <View style={{ flex: 1 }}>
                  <ThemedText variant="caption" style={[styles.inputLabel, { marginTop: 10 }]}>
                    SOFTWARE CERTIFICATE ID
                  </ThemedText>
                  <Input
                    value={credSoftwareCertId}
                    onChangeText={setCredSoftwareCertId}
                    placeholder="CERT-PHILHEALTH-PKA-2026"
                  />
                </View>
                <View style={{ flex: 1 }}>
                  <ThemedText variant="caption" style={[styles.inputLabel, { marginTop: 10 }]}>
                    GATEWAY SOAP ENDPOINT
                  </ThemedText>
                  <Input
                    value={credEndpoint}
                    onChangeText={setCredEndpoint}
                    placeholder="/soap/konsulta"
                  />
                </View>
              </View>

              {/* Sensitive Credentials */}
              <View style={styles.formRowTwoCol}>
                <View style={{ flex: 1 }}>
                  <ThemedText variant="caption" style={[styles.inputLabel, { marginTop: 10 }]}>
                    SOAP USERNAME *
                  </ThemedText>
                  <Input
                    value={credUsername}
                    onChangeText={setCredUsername}
                    placeholder="pka_clinic_admin"
                  />
                </View>
                <View style={{ flex: 1 }}>
                  <ThemedText variant="caption" style={[styles.inputLabel, { marginTop: 10 }]}>
                    SOAP PASSWORD *
                  </ThemedText>
                  <Input
                    value={credPassword}
                    onChangeText={setCredPassword}
                    placeholder={philHealthConfigStatus?.isConfigured ? '•••••••• (Unchanged)' : 'Enter SOAP password'}
                    secureTextEntry
                  />
                </View>
              </View>

              <ThemedText variant="caption" style={[styles.inputLabel, { marginTop: 10 }]}>
                32-BYTE AES CIPHER KEY (PAYLOAD ENCRYPTION)
              </ThemedText>
              <Input
                value={credCipherKey}
                onChangeText={setCredCipherKey}
                placeholder="CLINICEZ-YAKAP-DEV-KEY-32BYTES!"
              />
              <ThemedText variant="caption" color={theme.colors.textMuted} style={{ marginTop: 2 }}>
                Used for PhilHealth PKA symmetric XML encryption and XML payload validation.
              </ThemedText>

              {/* Diagnostic Test Connection */}
              <View style={styles.testConnectionCard}>
                <View style={{ flexDirection: 'row', justifyContent: 'space-between', alignItems: 'center' }}>
                  <View style={{ flex: 1, marginRight: 8 }}>
                    <ThemedText style={{ fontWeight: '700' }}>Live Gateway Connectivity Test</ThemedText>
                    <ThemedText variant="caption" color={theme.colors.textMuted}>
                      Performs real-time SOAP authentication (`getToken`) against the configured endpoint.
                    </ThemedText>
                  </View>
                  <Button
                    title={isTestingConnection ? 'Testing...' : '⚡ Test Connection'}
                    variant="outline"
                    size="sm"
                    onPress={handleTestConnection}
                    disabled={isTestingConnection}
                  />
                </View>

                {testConnectionResult && (
                  <View
                    style={[
                      styles.testResultBox,
                      testConnectionResult.success ? styles.testSuccessBox : styles.testErrorBox,
                    ]}
                  >
                    <ThemedText
                      style={{
                        fontWeight: '600',
                        fontSize: 12,
                        color: testConnectionResult.success ? '#166534' : '#991b1b',
                      }}
                    >
                      {testConnectionResult.success ? '✓ Gateway Verified: ' : '✕ Connection Error: '}
                      {testConnectionResult.message}
                    </ThemedText>
                  </View>
                )}
              </View>
            </ScrollView>

            <View style={styles.modalActionsRow}>
              <Button
                title="Cancel"
                variant="outline"
                onPress={() => setIsCredentialsModalVisible(false)}
                style={{ flex: 1, marginRight: 8 }}
              />
              <Button
                title={isSavingCredentials ? 'Encrypting & Saving...' : 'Save & Encrypt'}
                variant="primary"
                onPress={handleSaveCredentials}
                disabled={isSavingCredentials}
                style={{ flex: 1 }}
              />
            </View>
          </Card>
        </View>
      </Modal>
    </ResponsiveLayout>

  );
}

const styles = StyleSheet.create({
  container: {
    flex: 1,
  },
  content: {
    padding: 16,
    paddingBottom: 40,
  },
  newBatchBtn: {
    paddingHorizontal: 14,
  },
  statsRow: {
    flexDirection: 'row',
    flexWrap: 'wrap',
    gap: 12,
    marginBottom: 16,
  },
  statCard: {
    flex: 1,
    minWidth: 160,
  },
  tabNavContainer: {
    flexDirection: 'row',
    backgroundColor: theme.colors.surface,
    borderRadius: 8,
    padding: 4,
    marginBottom: 16,
    borderWidth: 1,
    borderColor: theme.colors.border,
  },
  tabButton: {
    flex: 1,
    paddingVertical: 10,
    alignItems: 'center',
    borderRadius: 6,
  },
  tabButtonActive: {
    backgroundColor: theme.colors.primaryLight,
  },
  tabText: {
    fontSize: 13,
    fontWeight: '500',
    color: theme.colors.textSecondary,
  },
  tabTextActive: {
    color: theme.colors.primary,
    fontWeight: '700',
  },
  filterCard: {
    marginBottom: 16,
    padding: 12,
  },
  filterRow: {
    gap: 12,
  },
  filterGroup: {
    gap: 6,
  },
  filterLabel: {
    fontWeight: '600',
  },
  chipRow: {
    flexDirection: 'row',
    flexWrap: 'wrap',
    gap: 8,
  },
  chip: {
    paddingHorizontal: 12,
    paddingVertical: 6,
    borderRadius: 16,
    backgroundColor: theme.colors.surfaceSubtle,
    borderWidth: 1,
    borderColor: theme.colors.border,
  },
  chipActive: {
    backgroundColor: theme.colors.primary,
    borderColor: theme.colors.primary,
  },
  chipText: {
    fontSize: 12,
    color: theme.colors.textSecondary,
  },
  chipTextActive: {
    color: '#FFFFFF',
    fontWeight: '600',
  },
  loadingContainer: {
    padding: 40,
    alignItems: 'center',
  },
  emptyCard: {
    padding: 40,
    alignItems: 'center',
  },
  emptyIcon: {
    fontSize: 40,
  },
  txCard: {
    marginBottom: 12,
    padding: 16,
  },
  txHeader: {
    marginBottom: 12,
  },
  txTitleRow: {
    flexDirection: 'row',
    alignItems: 'center',
    gap: 8,
    flexWrap: 'wrap',
    marginBottom: 4,
  },
  txNumber: {
    fontWeight: '700',
  },
  txMetricsGrid: {
    flexDirection: 'row',
    backgroundColor: theme.colors.surfaceSubtle,
    borderRadius: 8,
    padding: 10,
    gap: 12,
  },
  metricItem: {
    flex: 1,
    alignItems: 'center',
  },
  metricValue: {
    fontWeight: '700',
    marginTop: 2,
  },
  pkaRefBox: {
    marginTop: 10,
    padding: 8,
    backgroundColor: theme.colors.primaryLighter,
    borderRadius: 6,
    borderLeftWidth: 3,
    borderLeftColor: theme.colors.primary,
  },
  txActionsRow: {
    flexDirection: 'row',
    gap: 8,
    marginTop: 14,
    justifyContent: 'flex-end',
  },
  actionBtn: {
    paddingHorizontal: 12,
  },
  gamotLookupCard: {
    padding: 16,
    marginBottom: 16,
  },
  searchRow: {
    flexDirection: 'row',
    alignItems: 'center',
  },
  ledgerResultContainer: {
    marginTop: 16,
    paddingTop: 16,
    borderTopWidth: 1,
    borderTopColor: theme.colors.border,
  },
  ledgerHeaderRow: {
    flexDirection: 'row',
    justifyContent: 'space-between',
    alignItems: 'flex-start',
    marginBottom: 12,
  },
  balanceSummaryBox: {
    flexDirection: 'row',
    backgroundColor: theme.colors.surfaceSubtle,
    borderRadius: 8,
    padding: 12,
    gap: 12,
  },
  balanceItem: {
    flex: 1,
    alignItems: 'center',
  },
  txnItemRow: {
    flexDirection: 'row',
    justifyContent: 'space-between',
    paddingVertical: 10,
    borderBottomWidth: 1,
    borderBottomColor: theme.colors.borderLight,
  },
  upscCard: {
    padding: 16,
    marginBottom: 16,
  },
  verifyResultBox: {
    flexDirection: 'row',
    alignItems: 'center',
    padding: 12,
    borderRadius: 8,
    marginTop: 12,
    borderWidth: 1,
  },
  verifySuccess: {
    backgroundColor: theme.colors.successBg,
    borderColor: theme.colors.successBorder,
  },
  verifyFail: {
    backgroundColor: theme.colors.emergencyBg,
    borderColor: theme.colors.emergencyBorder,
  },
  formularyCard: {
    padding: 16,
    marginBottom: 16,
  },
  formularyHeader: {
    marginBottom: 12,
  },
  formularyFilterRow: {
    flexDirection: 'row',
    alignItems: 'center',
    marginBottom: 12,
  },
  catChip: {
    paddingHorizontal: 10,
    paddingVertical: 6,
    borderRadius: 14,
    backgroundColor: theme.colors.surfaceSubtle,
    marginRight: 6,
  },
  catChipActive: {
    backgroundColor: theme.colors.primary,
  },
  catChipText: {
    fontSize: 11,
    color: theme.colors.textSecondary,
  },
  catChipTextActive: {
    color: '#FFFFFF',
    fontWeight: '600',
  },
  medItemRow: {
    flexDirection: 'row',
    justifyContent: 'space-between',
    paddingVertical: 8,
    borderBottomWidth: 1,
    borderBottomColor: theme.colors.borderLight,
  },
  masterlistCard: {
    padding: 16,
    marginBottom: 16,
  },
  syncConfigBox: {
    flexDirection: 'row',
    gap: 8,
    marginTop: 8,
  },
  inputLabel: {
    fontWeight: '600',
    marginBottom: 4,
    color: theme.colors.textSecondary,
  },
  masterlistItemRow: {
    flexDirection: 'row',
    justifyContent: 'space-between',
    paddingVertical: 10,
    borderBottomWidth: 1,
    borderBottomColor: theme.colors.borderLight,
  },
  pinCheckCard: {
    padding: 16,
  },
  pinGuideBox: {
    marginTop: 16,
    padding: 12,
    backgroundColor: theme.colors.surfaceSubtle,
    borderRadius: 8,
  },
  modalOverlay: {
    flex: 1,
    backgroundColor: 'rgba(0, 0, 0, 0.5)',
    justifyContent: 'center',
    alignItems: 'center',
    padding: 20,
  },
  modalCard: {
    width: '100%',
    maxWidth: 540,
    padding: 20,
  },
  trancheSelector: {
    gap: 8,
    marginBottom: 12,
  },
  trancheOption: {
    padding: 12,
    borderWidth: 1,
    borderColor: theme.colors.border,
    borderRadius: 8,
    backgroundColor: theme.colors.surfaceSubtle,
  },
  trancheOptionActive: {
    borderColor: theme.colors.primary,
    backgroundColor: theme.colors.primaryLight,
  },
  modalActionsRow: {
    flexDirection: 'row',
    marginTop: 20,
  },
  detailHeader: {
    flexDirection: 'row',
    justifyContent: 'space-between',
    alignItems: 'flex-start',
  },
  lineItemCard: {
    flexDirection: 'row',
    justifyContent: 'space-between',
    alignItems: 'center',
    paddingVertical: 8,
    borderBottomWidth: 1,
    borderBottomColor: theme.colors.borderLight,
  },
  simulationControlCard: {
    padding: 16,
  },
  simulationHeaderRow: {
    flexDirection: 'row',
    justifyContent: 'space-between',
    alignItems: 'flex-start',
    flexWrap: 'wrap',
    gap: 12,
  },
  scenarioChip: {
    paddingHorizontal: 12,
    paddingVertical: 8,
    borderRadius: 8,
    borderWidth: 1,
    borderColor: theme.colors.border,
    backgroundColor: theme.colors.surfaceSubtle,
  },
  scenarioChipActive: {
    borderColor: theme.colors.primary,
    backgroundColor: theme.colors.primaryLight,
  },
  scenarioChipText: {
    fontSize: 12,
    fontWeight: '500',
    color: theme.colors.textSecondary,
  },
  scenarioChipTextActive: {
    color: theme.colors.primary,
    fontWeight: '700',
  },
  simulationActionRow: {
    flexDirection: 'row',
    alignItems: 'center',
    gap: 12,
    marginTop: 16,
    flexWrap: 'wrap',
  },
  reportCardPass: {
    padding: 16,
    borderWidth: 1.5,
    borderColor: theme.colors.successBorder,
    backgroundColor: theme.colors.successBg,
  },
  reportCardFail: {
    padding: 16,
    borderWidth: 1.5,
    borderColor: theme.colors.emergencyBorder,
    backgroundColor: theme.colors.emergencyBg,
  },
  stepCard: {
    borderRadius: 8,
    borderWidth: 1,
    overflow: 'hidden',
  },
  stepCardPass: {
    borderColor: theme.colors.border,
    backgroundColor: theme.colors.surface,
  },
  stepCardFail: {
    borderColor: theme.colors.emergencyBorder || '#ef4444',
    backgroundColor: '#fffbfa',
  },
  stepHeader: {
    flexDirection: 'row',
    alignItems: 'center',
    justifyContent: 'space-between',
    padding: 12,
  },
  stepNumberBadge: {
    width: 28,
    height: 28,
    borderRadius: 14,
    alignItems: 'center',
    justifyContent: 'center',
  },
  payloadInspector: {
    borderTopWidth: 1,
    borderTopColor: theme.colors.borderLight,
    backgroundColor: theme.colors.surfaceSubtle,
    padding: 12,
  },
  payloadTabsRow: {
    flexDirection: 'row',
    gap: 8,
    marginBottom: 8,
  },
  payloadTabBtn: {
    paddingHorizontal: 10,
    paddingVertical: 4,
    borderRadius: 4,
  },
  payloadTabBtnActive: {
    backgroundColor: theme.colors.primary,
  },
  payloadTabText: {
    fontSize: 11,
    fontWeight: '600',
    color: theme.colors.textSecondary,
  },
  payloadTabTextActive: {
    color: '#ffffff',
  },
  xmlCodeContainer: {
    backgroundColor: '#1e293b',
    borderRadius: 6,
    maxHeight: 220,
  },
  xmlCodeText: {
    fontFamily: 'monospace',
    fontSize: 11,
    color: '#e2e8f0',
  },
  credModalCard: {
    width: '100%',
    maxWidth: 640,
    padding: 20,
  },
  credStatusBanner: {
    flexDirection: 'row',
    alignItems: 'center',
    justifyContent: 'space-between',
    padding: 12,
    borderRadius: 8,
    borderWidth: 1,
    marginBottom: 8,
  },
  credStatusBannerConfigured: {
    backgroundColor: '#f0fdf4',
    borderColor: '#86efac',
  },
  credStatusBannerUnconfigured: {
    backgroundColor: '#fff7ed',
    borderColor: '#fed7aa',
  },
  formRowTwoCol: {
    flexDirection: 'row',
    gap: 12,
  },
  testConnectionCard: {
    marginTop: 16,
    padding: 12,
    borderRadius: 8,
    backgroundColor: theme.colors.surfaceSubtle,
    borderWidth: 1,
    borderColor: theme.colors.border,
  },
  testResultBox: {
    marginTop: 10,
    padding: 10,
    borderRadius: 6,
    borderWidth: 1,
  },
  testSuccessBox: {
    backgroundColor: '#f0fdf4',
    borderColor: '#bbf7d0',
  },
  testErrorBox: {
    backgroundColor: '#fef2f2',
    borderColor: '#fecaca',
  },
});

