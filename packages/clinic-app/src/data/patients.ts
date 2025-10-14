import type { PatientProfile, PatientSummary } from "@app-types/patient";

export const PATIENT_SUMMARIES: PatientSummary[] = [
  {
    id: 1,
    name: "John Doe",
    age: 45,
    gender: "male",
    diagnosis: {
      id: 1,
      code: "I10",
      name: "Hypertension",
    },
    lastVisit: "2025-09-15",
    nextAppointment: "2025-10-15",
    hp: {
      name: "Dr. Smith",
      specialization: "Cardiologist",
    },
  },
  {
    id: 2,
    name: "Jane Smith",
    age: 30,
    gender: "female",
    diagnosis: {
      id: 3,
      code: "F32.9",
      name: "Depression",
    },
    lastVisit: "2025-09-10",
    nextAppointment: "2025-10-10",
    hp: {
      name: "Dr. Johnson",
      specialization: "Psychiatrist",
    },
  },
  {
    id: 3,
    name: "Michael Brown",
    age: 60,
    gender: "male",
    diagnosis: {
      id: 4,
      code: "E11.9",
      name: "Diabetes",
    },
    lastVisit: "2025-09-05",
    nextAppointment: "2025-10-05",
    hp: {
      name: "Dr. Lee",
      specialization: "Endocrinologist",
    },
  },
  {
    id: 4,
    name: "Emily Davis",
    age: 25,
    gender: "female",
    diagnosis: {
      id: 5,
      code: "J45.909",
      name: "Asthma",
    },
    lastVisit: "2025-09-01",
    nextAppointment: "2025-10-01",
    hp: {
      name: "Dr. Wilson",
      specialization: "Pulmonologist",
    },
  },
  {
    id: 5,
    name: "David Wilson",
    age: 50,
    gender: "male",
    diagnosis: {
      id: 6,
      code: "E78.5",
      name: "Hyperlipidemia",
    },
    lastVisit: "2025-08-28",
    nextAppointment: "2025-09-28",
    hp: {
      name: "Dr. Taylor",
      specialization: "Cardiologist",
    },
  },
];

const PATIENT_PROFILES: Record<number, PatientProfile> = {
  1: {
    id: 1,
    userUid: "patient-1",
    profile: {
      imageUrl: "https://images.unsplash.com/photo-1537368910025-700350fe46c7",
    },
    name: {
      firstName: "John",
      middleName: "A.",
      lastName: "Doe",
    },
    civilStatus: "married",
    gender: "male",
    dateOfBirth: "1980-02-14",
    nationality: "American",
    religion: "Christianity",
    bloodType: "a_positive",
    contactInfo: {
      email: "john.doe@example.com",
      mobile: "+1 (555) 010-1010",
    },
    allergy: [
      { id: 1, name: "Peanuts" },
      { id: 2, name: "Shellfish" },
    ],
    medication: [
      {
        name: "Lisinopril",
        dosage: "10 mg",
        frequency: "Once daily",
        startDate: "2025-01-15",
        endDate: null,
        prescribingDoctor: "Dr. Smith",
      },
      {
        name: "Amlodipine",
        dosage: "5 mg",
        frequency: "Once daily",
        startDate: "2025-03-20",
        endDate: null,
        prescribingDoctor: "Dr. Smith",
      },
    ],
    vitalSigns: [
      {
        createdAt: "2025-09-15T09:00:00Z",
        temperature: 36.8,
        bloodPressure: "128/82 mmHg",
        heartRate: 78,
        respiratoryRate: 16,
        oxygenSaturation: 98,
        height: 178,
        weight: 85,
        bmi: 26.8,
      },
      {
        createdAt: "2025-08-15T09:30:00Z",
        temperature: 36.6,
        bloodPressure: "130/85 mmHg",
        heartRate: 80,
        respiratoryRate: 18,
        oxygenSaturation: 97,
        height: 178,
        weight: 86,
        bmi: 27.1,
      },
      {
        createdAt: "2025-07-20T10:15:00Z",
        temperature: 36.9,
        bloodPressure: "132/84 mmHg",
        heartRate: 82,
        respiratoryRate: 17,
        oxygenSaturation: 97,
        height: 178,
        weight: 87,
        bmi: 27.5,
      },
    ],
    consultationHistory: [
      {
        id: 1,
        diagnosis: {
          id: 1,
          code: "I10",
          name: "Essential (primary) hypertension",
        },
        hp: {
          prefix: "Dr.",
          name: "Robert Smith",
          specialization: "Cardiologist",
        },
        chiefComplaint: "High blood pressure readings at home",
        createdAt: "2025-09-15T09:00:00Z",
      },
      {
        id: 2,
        diagnosis: {
          id: 2,
          code: "E78.5",
          name: "Hyperlipidemia, unspecified",
        },
        hp: {
          prefix: "Dr.",
          name: "Sarah Johnson",
          specialization: "Internal Medicine",
        },
        chiefComplaint: "Routine checkup and cholesterol management",
        createdAt: "2025-06-10T14:30:00Z",
      },
    ],
    diagnosisHistory: [
      {
        id: 1,
        diagnosis: {
          id: 1,
          code: "I10",
          name: "Essential (primary) hypertension",
        },
        hp: {
          prefix: "Dr.",
          name: "Robert Smith",
        },
        createdAt: "2025-09-15T09:00:00Z",
      },
      {
        id: 2,
        diagnosis: {
          id: 2,
          code: "E78.5",
          name: "Hyperlipidemia, unspecified",
        },
        hp: {
          prefix: "Dr.",
          name: "Sarah Johnson",
        },
        createdAt: "2025-06-10T14:30:00Z",
      },
    ],
    vaccinationRecords: [
      {
        id: 1,
        vaccineName: "Influenza Vaccine",
        dateAdministered: "2025-09-01T11:00:00Z",
        doseNumber: "Annual dose",
        administeredBy: "Nurse Johnson",
      },
      {
        id: 2,
        vaccineName: "COVID-19 Booster",
        dateAdministered: "2025-03-15T10:30:00Z",
        doseNumber: "2nd Booster",
        administeredBy: "Nurse Williams",
      },
    ],
    labImagingRequests: [
      {
        id: 1,
        testName: "Lipid Panel",
        requestedAt: "2025-09-15T09:00:00Z",
        requestedBy: {
          prefix: "Dr.",
          name: "Robert Smith",
          postfix: "MD",
        },
      },
      {
        id: 2,
        imagingType: "Chest X-Ray",
        requestedAt: "2025-08-20T13:45:00Z",
        requestedBy: {
          prefix: "Dr.",
          name: "Michael Chen",
          postfix: "MD, PhD",
        },
      },
    ],
    disabilities: [],
    prescriptionHistory: [
      {
        id: 1,
        medicationName: "Lisinopril",
        dosage: "10 mg",
        frequency: "Once daily",
        createdAt: "2025-01-15",
        hp: {
          prefix: "Dr.",
          name: "Robert Smith",
          postfix: "MD",
        },
      },
      {
        id: 2,
        medicationName: "Amlodipine",
        dosage: "5 mg",
        frequency: "Once daily",
        createdAt: "2025-03-20",
        hp: {
          prefix: "Dr.",
          name: "Robert Smith",
          postfix: "MD",
        },
      },
    ],
    familyHistory: [
      {
        id: 1,
        relation: "Father",
        condition: "Type 2 Diabetes",
        notes: "Diagnosed at age 55",
      },
      {
        id: 2,
        relation: "Mother",
        condition: "Hypertension",
        notes: null,
      },
    ],
    billingHistory: [
      {
        id: 1,
        service: "Cardiology Consultation",
        amount: 2500,
        currency: "PHP",
        createdAt: "2025-09-15",
        hp: {
          prefix: "Dr.",
          name: "Robert Smith",
          postfix: "MD",
        },
        status: "paid",
      },
      {
        id: 2,
        service: "Lipid Panel Test",
        amount: 1200,
        currency: "PHP",
        createdAt: "2025-09-15",
        hp: {
          prefix: "Dr.",
          name: "Robert Smith",
          postfix: "MD",
        },
        status: "paid",
      },
    ],
    emergencyContacts: [
      {
        id: 1,
        name: "Jane Doe",
        relation: "Spouse",
        phone: "+1 (555) 010-1011",
        email: "jane.doe@example.com",
        address: "123 Main St, New York, NY 10001",
      },
      {
        id: 2,
        name: "Robert Doe",
        relation: "Brother",
        phone: "+1 (555) 010-1012",
        email: null,
        address: "456 Oak Ave, Brooklyn, NY 11201",
      },
    ],
  },
  2: {
    id: 2,
    userUid: "patient-2",
    profile: {
      imageUrl: "https://images.unsplash.com/photo-1524504388940-b1c1722653e1",
    },
    name: {
      firstName: "Jane",
      lastName: "Smith",
    },
    civilStatus: "single",
    gender: "female",
    dateOfBirth: "1995-07-21",
    nationality: "Canadian",
    religion: "Christianity",
    bloodType: "o_negative",
    contactInfo: {
      email: "jane.smith@example.com",
      mobile: "+1 (555) 020-2020",
    },
    allergy: [{ id: 1, name: "Penicillin" }],
    medication: [
      {
        name: "Sertraline",
        dosage: "50 mg",
        frequency: "Once daily",
        startDate: "2025-01-15",
        endDate: null,
        prescribingDoctor: "Dr. Johnson",
      }
    ],
    vitalSigns: [
      {
        createdAt: "2025-09-10T10:15:00Z",
        temperature: 36.7,
        bloodPressure: "118/75 mmHg",
        heartRate: 72,
        respiratoryRate: 15,
        oxygenSaturation: 99,
        height: 165,
        weight: 60,
        bmi: 22.0,
      },
      {
        createdAt: "2025-08-10T10:45:00Z",
        temperature: 36.5,
        bloodPressure: "120/78 mmHg",
        heartRate: 74,
        respiratoryRate: 16,
        oxygenSaturation: 98,
        height: 165,
        weight: 61,
        bmi: 22.4,
      },
    ],
    consultationHistory: [
      {
        id: 1,
        diagnosis: {
          id: 3,
          code: "F32.9",
          name: "Major depressive disorder, single episode, unspecified",
        },
        hp: {
          prefix: "Dr.",
          name: "Emily Johnson",
          specialization: "Psychiatrist",
        },
        chiefComplaint: "Persistent sadness and lack of interest in daily activities",
        createdAt: "2025-09-10T10:15:00Z",
      },
    ],
    diagnosisHistory: [
      {
        id: 1,
        diagnosis: {
          id: 3,
          code: "F32.9",
          name: "Major depressive disorder, single episode, unspecified",
        },
        hp: {
          prefix: "Dr.",
          name: "Emily Johnson",
        },
        createdAt: "2025-09-10T10:15:00Z",
      },
    ],
    vaccinationRecords: [
      {
        id: 1,
        vaccineName: "Influenza Vaccine",
        dateAdministered: "2025-09-05T09:30:00Z",
        doseNumber: "Annual dose",
        administeredBy: "Nurse Davis",
      },
    ],
    labImagingRequests: [
      {
        id: 1,
        testName: "Complete Blood Count (CBC)",
        requestedAt: "2025-08-15T11:00:00Z",
        requestedBy: {
          prefix: "Dr.",
          name: "Emily Johnson",
          postfix: "MD",
        },
      },
    ],
    disabilities: [],
    prescriptionHistory: [
      {
        id: 1,
        medicationName: "Sertraline",
        dosage: "50 mg",
        frequency: "Once daily",
        createdAt: "2025-01-15",
        hp: {
          prefix: "Dr.",
          name: "Emily Johnson",
          postfix: "MD",
        },
      },
    ],
    familyHistory: [
      {
        id: 1,
        relation: "Mother",
        condition: "Anxiety Disorder",
        notes: "Managed with therapy",
      },
    ],
    billingHistory: [
      {
        id: 1,
        service: "Psychiatric Consultation",
        amount: 3000,
        currency: "PHP",
        createdAt: "2025-09-10",
        hp: {
          prefix: "Dr.",
          name: "Emily Johnson",
          postfix: "MD",
        },
        status: "paid",
      },
    ],
    emergencyContacts: [
      {
        id: 1,
        name: "Robert Smith",
        relation: "Father",
        phone: "+1 (555) 020-2021",
        email: "robert.smith@example.com",
        address: "789 Pine St, Toronto, ON M5H 2N2",
      },
    ],
  },
  3: {
    id: 3,
    userUid: "patient-3",
    profile: {
      imageUrl: "https://images.unsplash.com/photo-1502767089025-6572583495b0",
    },
    name: {
      firstName: "Michael",
      lastName: "Brown",
    },
    civilStatus: "married",
    gender: "male",
    dateOfBirth: "1965-11-05",
    nationality: "British",
    religion: "Christianity",
    bloodType: "b_positive",
    contactInfo: {
      email: "michael.brown@example.com",
      mobile: "+44 20 7946 0300",
    },
    allergy: [{ id: 1, name: "Sulfa Drugs" }],
    medication: [
      {
        name: "Metformin",
        dosage: "500 mg",
        frequency: "Twice daily",
        startDate: "2024-12-01",
        endDate: null,
        prescribingDoctor: "Dr. Lee"
      },
      {
        name: "Insulin",
        dosage: "10 units",
        frequency: "Before meals",
        startDate: "2025-02-10",
        endDate: null,
        prescribingDoctor: "Dr. Lee"
      },
    ],
    vitalSigns: [
      {
        createdAt: "2025-09-05T08:20:00Z",
        temperature: 36.9,
        bloodPressure: "135/88 mmHg",
        heartRate: 82,
        respiratoryRate: 19,
        oxygenSaturation: 96,
        height: 182,
        weight: 92,
        bmi: 27.8,
      },
      {
        createdAt: "2025-07-30T08:45:00Z",
        temperature: 37.1,
        bloodPressure: "138/90 mmHg",
        heartRate: 85,
        respiratoryRate: 20,
        oxygenSaturation: 95,
        height: 182,
        weight: 94,
        bmi: 28.4,
      },
    ],
    consultationHistory: [
      {
        id: 1,
        diagnosis: {
          id: 4,
          code: "E11.9",
          name: "Type 2 diabetes mellitus without complications",
        },
        hp: {
          prefix: "Dr.",
          name: "David Lee",
          specialization: "Endocrinologist",
        },
        chiefComplaint: "Difficulty managing blood sugar levels",
        createdAt: "2025-09-05T08:20:00Z",
      },
    ],
    diagnosisHistory: [
      {
        id: 1,
        diagnosis: {
          id: 4,
          code: "E11.9",
          name: "Type 2 diabetes mellitus without complications",
        },
        hp: {
          prefix: "Dr.",
          name: "David Lee",
        },
        createdAt: "2025-09-05T08:20:00Z",
      },
    ],
    vaccinationRecords: [
      {
        id: 1,
        vaccineName: "Pneumococcal Vaccine",
        dateAdministered: "2025-06-15T14:00:00Z",
        doseNumber: "1st dose",
        administeredBy: "Nurse Thompson",
      },
      {
        id: 2,
        vaccineName: "Influenza Vaccine",
        dateAdministered: "2025-09-01T10:00:00Z",
        doseNumber: "Annual dose",
        administeredBy: "Nurse Martinez",
      },
    ],
    labImagingRequests: [
      {
        id: 1,
        testName: "HbA1c Test",
        requestedAt: "2025-09-05T08:20:00Z",
        requestedBy: {
          prefix: "Dr.",
          name: "David Lee",
          postfix: "MD",
        },
      },
      {
        id: 2,
        testName: "Fasting Blood Glucose",
        requestedAt: "2025-08-01T07:30:00Z",
        requestedBy: {
          prefix: "Dr.",
          name: "David Lee",
          postfix: "MD",
        },
      },
    ],
    disabilities: [],
    prescriptionHistory: [
      {
        id: 1,
        medicationName: "Metformin",
        dosage: "500 mg",
        frequency: "Twice daily",
        createdAt: "2024-12-01",
        hp: {
          prefix: "Dr.",
          name: "David Lee",
          postfix: "MD",
        },
      },
      {
        id: 2,
        medicationName: "Insulin",
        dosage: "10 units",
        frequency: "Before meals",
        createdAt: "2025-02-10",
        hp: {
          prefix: "Dr.",
          name: "David Lee",
          postfix: "MD",
        },
      },
    ],
    familyHistory: [
      {
        id: 1,
        relation: "Father",
        condition: "Type 2 Diabetes",
        notes: "Diagnosed at age 50",
      },
      {
        id: 2,
        relation: "Grandfather (paternal)",
        condition: "Heart Disease",
        notes: null,
      },
    ],
    billingHistory: [
      {
        id: 1,
        service: "Endocrinology Consultation",
        amount: 2800,
        currency: "PHP",
        createdAt: "2025-09-05",
        hp: {
          prefix: "Dr.",
          name: "David Lee",
          postfix: "MD",
        },
        status: "paid",
      },
      {
        id: 2,
        service: "HbA1c Test",
        amount: 800,
        currency: "PHP",
        createdAt: "2025-09-05",
        hp: {
          prefix: "Dr.",
          name: "David Lee",
          postfix: "MD",
        },
        status: "pending",
      },
    ],
    emergencyContacts: [
      {
        id: 1,
        name: "Sarah Brown",
        relation: "Wife",
        phone: "+44 20 7946 0301",
        email: "sarah.brown@example.com",
        address: "10 Downing Street, London SW1A 2AA",
      },
    ],
  },
  4: {
    id: 4,
    userUid: "patient-4",
    profile: {
      imageUrl: "https://images.unsplash.com/photo-1544723795-3fb6469f5b39",
    },
    name: {
      firstName: "Emily",
      lastName: "Davis",
    },
    civilStatus: "single",
    gender: "female",
    dateOfBirth: "2000-04-12",
    nationality: "Australian",
    religion: "Other",
    bloodType: "ab_positive",
    contactInfo: {
      email: "emily.davis@example.com",
      mobile: "+61 2 9374 4000",
    },
    allergy: [],
    medication: [
      {
        name: "Albuterol Inhaler",
        dosage: "2 puffs",
        frequency: "As needed",
        startDate: "2025-06-01",
        endDate: null,
        prescribingDoctor: "Dr. Wilson",
      },
      {
        name: "Montelukast",
        dosage: "10 mg",
        frequency: "Once daily",
        startDate: "2025-06-01",
        endDate: null,
        prescribingDoctor: "Dr. Wilson",
      }
    ],
    vitalSigns: [
      {
        createdAt: "2025-09-01T11:00:00Z",
        temperature: 36.6,
        bloodPressure: "110/70 mmHg",
        heartRate: 70,
        respiratoryRate: 17,
        oxygenSaturation: 99,
        height: 168,
        weight: 58,
        bmi: 20.5,
      },
      {
        createdAt: "2025-08-01T11:30:00Z",
        temperature: 36.5,
        bloodPressure: "112/72 mmHg",
        heartRate: 72,
        respiratoryRate: 18,
        oxygenSaturation: 98,
        height: 168,
        weight: 59,
        bmi: 20.9,
      },
    ],
    consultationHistory: [
      {
        id: 1,
        diagnosis: {
          id: 5,
          code: "J45.909",
          name: "Unspecified asthma, uncomplicated",
        },
        hp: {
          prefix: "Dr.",
          name: "Amanda Wilson",
          specialization: "Pulmonologist",
        },
        chiefComplaint: "Shortness of breath and wheezing episodes",
        createdAt: "2025-09-01T11:00:00Z",
      },
    ],
    diagnosisHistory: [
      {
        id: 1,
        diagnosis: {
          id: 5,
          code: "J45.909",
          name: "Unspecified asthma, uncomplicated",
        },
        hp: {
          prefix: "Dr.",
          name: "Amanda Wilson",
        },
        createdAt: "2025-09-01T11:00:00Z",
      },
    ],
    vaccinationRecords: [
      {
        id: 1,
        vaccineName: "Influenza Vaccine",
        dateAdministered: "2025-08-25T09:15:00Z",
        doseNumber: "Annual dose",
        administeredBy: "Nurse Brown",
      },
    ],
    labImagingRequests: [
      {
        id: 1,
        imagingType: "Chest CT Scan",
        requestedAt: "2025-08-15T10:30:00Z",
        requestedBy: {
          prefix: "Dr.",
          name: "Amanda Wilson",
          postfix: "MD",
        },
      },
    ],
    disabilities: [],
    prescriptionHistory: [
      {
        id: 1,
        medicationName: "Albuterol Inhaler",
        dosage: "2 puffs",
        frequency: "As needed",
        createdAt: "2025-06-01",
        hp: {
          prefix: "Dr.",
          name: "Amanda Wilson",
          postfix: "MD",
        },
      },
      {
        id: 2,
        medicationName: "Montelukast",
        dosage: "10 mg",
        frequency: "Once daily",
        createdAt: "2025-06-01",
        hp: {
          prefix: "Dr.",
          name: "Amanda Wilson",
          postfix: "MD",
        },
      },
    ],
    familyHistory: [
      {
        id: 1,
        relation: "Mother",
        condition: "Asthma",
        notes: "Childhood onset",
      },
    ],
    billingHistory: [
      {
        id: 1,
        service: "Pulmonology Consultation",
        amount: 2500,
        currency: "PHP",
        createdAt: "2025-09-01",
        hp: {
          prefix: "Dr.",
          name: "Amanda Wilson",
          postfix: "MD",
        },
        status: "paid",
      },
    ],
    emergencyContacts: [
      {
        id: 1,
        name: "John Davis",
        relation: "Father",
        phone: "+61 2 9374 4001",
        email: "john.davis@example.com",
        address: "123 Sydney Road, Sydney NSW 2000",
      },
    ],
  },
  5: {
    id: 5,
    userUid: "patient-5",
    profile: {
      imageUrl: "https://images.unsplash.com/photo-1521572267360-ee0c2909d518",
    },
    name: {
      firstName: "David",
      lastName: "Wilson",
    },
    civilStatus: "married",
    gender: "male",
    dateOfBirth: "1975-10-30",
    nationality: "American",
    religion: "Christianity",
    bloodType: "o_positive",
    contactInfo: {
      email: "david.wilson@example.com",
      mobile: "+1 (555) 030-3030",
    },
    allergy: [{ id: 1, name: "Latex" }],
    medication: [
      {
        name: "Atorvastatin",
        dosage: "20 mg",
        frequency: "Once daily",
        startDate: "2025-05-10",
        endDate: null,
        prescribingDoctor: "Dr. Taylor",
      }
    ],
    vitalSigns: [
      {
        createdAt: "2025-08-28T07:45:00Z",
        temperature: 36.7,
        bloodPressure: "125/80 mmHg",
        heartRate: 76,
        respiratoryRate: 16,
        oxygenSaturation: 97,
        height: 175,
        weight: 82,
        bmi: 26.8,
      },
      {
        createdAt: "2025-07-28T08:15:00Z",
        temperature: 36.8,
        bloodPressure: "128/82 mmHg",
        heartRate: 78,
        respiratoryRate: 17,
        oxygenSaturation: 97,
        height: 175,
        weight: 83,
        bmi: 27.1,
      },
    ],
    consultationHistory: [
      {
        id: 1,
        diagnosis: {
          id: 6,
          code: "E78.5",
          name: "Hyperlipidemia, unspecified",
        },
        hp: {
          prefix: "Dr.",
          name: "Karen Taylor",
          specialization: "Cardiologist",
        },
        chiefComplaint: "High cholesterol levels on recent blood work",
        createdAt: "2025-08-28T07:45:00Z",
      },
    ],
    diagnosisHistory: [
      {
        id: 1,
        diagnosis: {
          id: 6,
          code: "E78.5",
          name: "Hyperlipidemia, unspecified",
        },
        hp: {
          prefix: "Dr.",
          name: "Karen Taylor",
        },
        createdAt: "2025-08-28T07:45:00Z",
      },
    ],
    vaccinationRecords: [
      {
        id: 1,
        vaccineName: "Tetanus-Diphtheria (Td)",
        dateAdministered: "2025-07-10T15:30:00Z",
        doseNumber: "Booster",
        administeredBy: "Nurse Garcia",
      },
      {
        id: 2,
        vaccineName: "Influenza Vaccine",
        dateAdministered: "2025-08-30T11:00:00Z",
        doseNumber: "Annual dose",
        administeredBy: "Nurse Wilson",
      },
    ],
    labImagingRequests: [
      {
        id: 1,
        testName: "Lipid Panel",
        requestedAt: "2025-08-28T07:45:00Z",
        requestedBy: {
          prefix: "Dr.",
          name: "Karen Taylor",
          postfix: "MD, FACC",
        },
      },
      {
        id: 2,
        imagingType: "Cardiac Stress Test",
        requestedAt: "2025-08-28T07:45:00Z",
        requestedBy: {
          prefix: "Dr.",
          name: "Karen Taylor",
          postfix: "MD, FACC",
        },
      },
    ],
    disabilities: [],
    prescriptionHistory: [
      {
        id: 1,
        medicationName: "Atorvastatin",
        dosage: "20 mg",
        frequency: "Once daily",
        createdAt: "2025-05-10",
        hp: {
          prefix: "Dr.",
          name: "Karen Taylor",
          postfix: "MD, FACC",
        },
      },
    ],
    familyHistory: [
      {
        id: 1,
        relation: "Father",
        condition: "High Cholesterol",
        notes: "Managed with medication",
      },
      {
        id: 2,
        relation: "Brother",
        condition: "Hypertension",
        notes: null,
      },
    ],
    billingHistory: [
      {
        id: 1,
        service: "Cardiology Consultation",
        amount: 3000,
        currency: "PHP",
        createdAt: "2025-08-28",
        hp: {
          prefix: "Dr.",
          name: "Karen Taylor",
          postfix: "MD, FACC",
        },
        status: "paid",
      },
      {
        id: 2,
        service: "Lipid Panel Test",
        amount: 1000,
        currency: "PHP",
        createdAt: "2025-08-28",
        hp: {
          prefix: "Dr.",
          name: "Karen Taylor",
          postfix: "MD, FACC",
        },
        status: "paid",
      },
    ],
    emergencyContacts: [
      {
        id: 1,
        name: "Mary Wilson",
        relation: "Wife",
        phone: "+1 (555) 030-3031",
        email: "mary.wilson@example.com",
        address: "456 Elm Street, Los Angeles, CA 90001",
      },
      {
        id: 2,
        name: "Tom Wilson",
        relation: "Son",
        phone: "+1 (555) 030-3032",
        email: null,
        address: "789 Oak Drive, San Francisco, CA 94102",
      },
    ],
  },
};

export const getPatientSummaryById = (id: number) => PATIENT_SUMMARIES.find((patient) => patient.id === id) ?? null;

export const getPatientProfileById = (id: number) => PATIENT_PROFILES[id] ?? null;
