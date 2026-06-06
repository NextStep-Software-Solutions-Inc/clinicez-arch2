import { db } from './index';
import { clinics } from './schema/clinics';
import { patients } from './schema/patients';
import { patientGovernmentIds } from './schema/patientGovernmentIds';
import { patientAddresses } from './schema/patientAddresses';
import { emergencyContacts } from './schema/emergencyContacts';
import { patientHealthcareProviders } from './schema/patientHealthcareProviders';
import { patientAllergies } from './schema/patientAllergies';
import { patientMedications } from './schema/patientMedications';
import { patientSurgicalHistory } from './schema/patientSurgicalHistory';
import { patientPastIllnesses } from './schema/patientPastIllnesses';
import { patientChronicConditions } from './schema/patientChronicConditions';
import { patientDisabilities } from './schema/patientDisabilities';
import { patientImmunizationsSelf } from './schema/patientImmunizationsSelf';
import { patientFamilyHistory } from './schema/patientFamilyHistory';
import { patientSocialHistory } from './schema/patientSocialHistory';
import { patientOccupation } from './schema/patientOccupation';
import { patientTravelHistory } from './schema/patientTravelHistory';
import { patientObstetricProfile } from './schema/patientObstetricProfile';
import { patientPregnancies } from './schema/patientPregnancies';
import { patientContraceptiveHistory } from './schema/patientContraceptiveHistory';
import { patientMaleReproductive } from './schema/patientMaleReproductive';
import { patientDentalVision } from './schema/patientDentalVision';
import { patientMentalHealthProfile } from './schema/patientMentalHealthProfile';
import { consultations } from './schema/consultations';
import { vitalSigns } from './schema/vitalSigns';
import { labResults } from './schema/labResults';
import { imagingResults } from './schema/imagingResults';
import { clinicalAssessments } from './schema/clinicalAssessments';
import { prescriptions } from './schema/prescriptions';
import { vaccinationsAdministered } from './schema/vaccinationsAdministered';
import { patientNcdQuestionnaire } from './schema/patientNcdQuestionnaire';
import { patientPhysicalExamProfile } from './schema/patientPhysicalExamProfile';

const DAY_MS = 24 * 60 * 60 * 1000;

function toDate(date: Date): string {
    return date.toISOString().slice(0, 10);
}

function toDateTime(date: Date): string {
    return date.toISOString();
}

function demoId(patientId: string, suffix: string): string {
    return `demo:${patientId}:${suffix}`;
}

async function ensurePatientRow(patientId: string) {
    const now = new Date();
    await db
        .insert(patients)
        .values({
            id: patientId,
            clerkUserId: patientId,
            firstName: 'Demo',
            middleName: 'L.',
            lastName: 'Patient',
            sex: 'Male',
            dob: '1989-04-14',
            civilStatus: 'Married',
            bloodType: 'O+',
            nationality: 'Filipino',
            primaryLanguage: 'Filipino',
            mobile: '09171234567',
            email: `demo.${patientId}@example.com`,
            consentToShareInfo: true,
            createdAt: now,
            updatedAt: now,
        })
        .onConflictDoUpdate({
            target: patients.id,
            set: {
                firstName: 'Demo',
                middleName: 'L.',
                lastName: 'Patient',
                sex: 'Male',
                dob: '1989-04-14',
                civilStatus: 'Married',
                bloodType: 'O+',
                nationality: 'Filipino',
                primaryLanguage: 'Filipino',
                mobile: '09171234567',
                email: `demo.${patientId}@example.com`,
                consentToShareInfo: true,
                updatedAt: now,
            },
        });
}

async function ensureClinicRows(patientId: string) {
    const joinedAt = new Date('2024-01-15T08:00:00.000Z');

    const primaryClinicId = demoId(patientId, 'clinic-city-health');
    const secondaryClinicId = demoId(patientId, 'clinic-riverside-diagnostics');

    const clinicRows: (typeof clinics.$inferInsert)[] = [
        {
            id: primaryClinicId,
            name: 'City Health Center - OPD',
            address: 'JP Rizal Street, Poblacion, City Proper',
            baseUrl: 'https://city-health.demo.clinicez.local',
            inviteCode: 'CITY-DEMO-01',
            joinedAt,
        },
        {
            id: secondaryClinicId,
            name: 'Riverside Diagnostics and Imaging',
            address: 'Riverside Avenue, District 2, Metro City',
            baseUrl: 'https://riverside-diagnostics.demo.clinicez.local',
            inviteCode: 'RIVER-DEMO-02',
            joinedAt,
        },
    ];

    for (const row of clinicRows) {
        const { id, ...set } = row;
        await db.insert(clinics).values(row).onConflictDoUpdate({ target: clinics.id, set });
    }

    return { primaryClinicId, secondaryClinicId };
}

export async function seedDemoHealthRecords(patientId: string): Promise<void> {
    if (!patientId) return;

    await ensurePatientRow(patientId);
    const { primaryClinicId, secondaryClinicId } = await ensureClinicRows(patientId);

    const now = new Date();
    const d56 = new Date(now.getTime() - 56 * DAY_MS);
    const d42 = new Date(now.getTime() - 42 * DAY_MS);
    const d28 = new Date(now.getTime() - 28 * DAY_MS);
    const d21 = new Date(now.getTime() - 21 * DAY_MS);
    const d14 = new Date(now.getTime() - 14 * DAY_MS);
    const d9 = new Date(now.getTime() - 9 * DAY_MS);
    const d3 = new Date(now.getTime() - 3 * DAY_MS);
    const d30Future = new Date(now.getTime() + 30 * DAY_MS);

    const consultationRows: (typeof consultations.$inferInsert)[] = [
        {
            id: demoId(patientId, 'consultation-initial'),
            patientId,
            clinicId: primaryClinicId,
            visitDate: toDate(d28),
            visitType: 'Scheduled',
            clinicName: 'City Health Center - OPD',
            doctorName: 'Dr. Maria Santos',
            doctorSpecialty: 'Family Medicine',
            chiefComplaint: 'Intermittent headache and elevated home blood pressure readings',
            primaryDiagnosis: 'Essential Hypertension',
            icd10Code: 'I10',
            secondaryDiagnoses: 'Overweight',
            soapNotes:
                'S: Headache in late afternoons, no chest pain. O: BP 148/94, HR 82, no focal deficits. A: Stage 1 hypertension. P: Start amlodipine and lifestyle changes.',
            treatmentPlan:
                'Initiate amlodipine 5 mg once daily, sodium reduction, 150 minutes/week moderate activity.',
            followUpInstructions: 'Bring 2-week blood pressure log and return for medication review.',
            followUpDate: toDate(d14),
            referralIssued: 'No',
            serverCreatedAt: d28,
        },
        {
            id: demoId(patientId, 'consultation-followup'),
            patientId,
            clinicId: secondaryClinicId,
            visitDate: toDate(d14),
            visitType: 'FollowUp',
            clinicName: 'City Health Center - OPD',
            doctorName: 'Dr. Maria Santos',
            doctorSpecialty: 'Family Medicine',
            chiefComplaint: 'Follow-up for blood pressure control',
            primaryDiagnosis: 'Essential Hypertension, improving control',
            icd10Code: 'I10',
            secondaryDiagnoses: 'Prediabetes',
            soapNotes:
                'S: Fewer headaches, compliant with meds. O: BP 134/86, fasting glucose mildly elevated. A: Improved BP trend. P: Continue current regimen and monitor.',
            treatmentPlan:
                'Continue amlodipine, reinforce DASH-style diet, monitor fasting blood sugar with repeat lab in 3 months.',
            followUpInstructions: 'Return in 1 month or earlier for persistent BP > 140/90.',
            followUpDate: toDate(d3),
            referralIssued: 'No',
            serverCreatedAt: d14,
        },
    ];

    for (const row of consultationRows) {
        const { id, ...set } = row;
        await db.insert(consultations).values(row).onConflictDoUpdate({ target: consultations.id, set });
    }

    const vitalRows: (typeof vitalSigns.$inferInsert)[] = [
        {
            id: demoId(patientId, 'vitals-baseline'),
            patientId,
            clinicId: primaryClinicId,
            measuredAt: toDateTime(d56),
            heightCm: 169,
            weightKg: 75.2,
            bmi: 26.3,
            temperatureCelsius: 36.8,
            bpSystolic: 150,
            bpDiastolic: 96,
            heartRateBpm: 84,
            respiratoryRate: 18,
            spO2Percent: 98,
            fastingBloodGlucose: 111,
            waistCm: 95.1,
            hipCm: 101.3,
            headCircumferenceCm: 56,
            zScore: 0.2,
            leftVisionAcuity: '20/30',
            rightVisionAcuity: '20/25',
            bodyLengthCm: 169,
            skinfoldThicknessMm: 18.4,
            midUpperArmCircCm: 29.4,
            limbMeasurements: JSON.stringify({
                upperArmLeftCm: 29.2,
                upperArmRightCm: 29.4,
                thighLeftCm: 53.1,
                thighRightCm: 53.4,
                calfLeftCm: 36.2,
                calfRightCm: 36.0,
            }),
            takenBy: 'Nurse A. Reyes',
            facility: 'City Health Center',
            serverCreatedAt: d56,
        },
        {
            id: demoId(patientId, 'vitals-followup-1'),
            patientId,
            clinicId: primaryClinicId,
            measuredAt: toDateTime(d28),
            heightCm: 169,
            weightKg: 74.3,
            bmi: 26,
            temperatureCelsius: 36.7,
            bpSystolic: 146,
            bpDiastolic: 92,
            heartRateBpm: 80,
            respiratoryRate: 17,
            spO2Percent: 98,
            fastingBloodGlucose: 107,
            waistCm: 94.2,
            hipCm: 100.8,
            headCircumferenceCm: 56,
            zScore: 0.15,
            leftVisionAcuity: '20/25',
            rightVisionAcuity: '20/25',
            bodyLengthCm: 169,
            skinfoldThicknessMm: 17.9,
            midUpperArmCircCm: 29.1,
            limbMeasurements: JSON.stringify({
                upperArmLeftCm: 29.0,
                upperArmRightCm: 29.1,
                thighLeftCm: 52.8,
                thighRightCm: 53.0,
                calfLeftCm: 35.9,
                calfRightCm: 35.8,
            }),
            takenBy: 'Nurse A. Reyes',
            facility: 'City Health Center',
            serverCreatedAt: d28,
        },
        {
            id: demoId(patientId, 'vitals-followup-2'),
            patientId,
            clinicId: secondaryClinicId,
            measuredAt: toDateTime(d9),
            heightCm: 169,
            weightKg: 73.7,
            bmi: 25.8,
            temperatureCelsius: 36.6,
            bpSystolic: 134,
            bpDiastolic: 86,
            heartRateBpm: 76,
            respiratoryRate: 16,
            spO2Percent: 99,
            fastingBloodGlucose: 101,
            waistCm: 93.4,
            hipCm: 100.2,
            headCircumferenceCm: 56,
            zScore: 0.1,
            leftVisionAcuity: '20/20',
            rightVisionAcuity: '20/20',
            bodyLengthCm: 169,
            skinfoldThicknessMm: 17.1,
            midUpperArmCircCm: 28.9,
            limbMeasurements: JSON.stringify({
                upperArmLeftCm: 28.8,
                upperArmRightCm: 28.9,
                thighLeftCm: 52.4,
                thighRightCm: 52.7,
                calfLeftCm: 35.6,
                calfRightCm: 35.5,
            }),
            takenBy: 'Nurse J. Navarro',
            facility: 'City Health Center',
            serverCreatedAt: d9,
        },
    ];

    for (const row of vitalRows) {
        const { id, ...set } = row;
        await db.insert(vitalSigns).values(row).onConflictDoUpdate({ target: vitalSigns.id, set });
    }

    const labRows: (typeof labResults.$inferInsert)[] = [
        {
            id: demoId(patientId, 'lab-lipid-ldl'),
            patientId,
            clinicId: secondaryClinicId,
            testName: 'Lipid Profile',
            componentParameter: 'LDL Cholesterol',
            resultValue: '136',
            unit: 'mg/dL',
            referenceRange: '< 130',
            flag: 'High',
            dateOrdered: toDate(d21),
            dateResulted: toDate(d21),
            orderingPhysician: 'Dr. Maria Santos',
            laboratory: 'City Health Laboratory',
            serverCreatedAt: d21,
        },
        {
            id: demoId(patientId, 'lab-fbs'),
            patientId,
            clinicId: primaryClinicId,
            testName: 'Fasting Blood Sugar',
            componentParameter: 'Glucose',
            resultValue: '101',
            unit: 'mg/dL',
            referenceRange: '70 - 99',
            flag: 'High',
            dateOrdered: toDate(d9),
            dateResulted: toDate(d9),
            orderingPhysician: 'Dr. Maria Santos',
            laboratory: 'City Health Laboratory',
            serverCreatedAt: d9,
        },
        {
            id: demoId(patientId, 'lab-creatinine'),
            patientId,
            clinicId: secondaryClinicId,
            testName: 'Renal Function Panel',
            componentParameter: 'Creatinine',
            resultValue: '0.96',
            unit: 'mg/dL',
            referenceRange: '0.67 - 1.17',
            flag: 'Normal',
            dateOrdered: toDate(d9),
            dateResulted: toDate(d9),
            orderingPhysician: 'Dr. Maria Santos',
            laboratory: 'City Health Laboratory',
            serverCreatedAt: d9,
        },
    ];

    for (const row of labRows) {
        const { id, ...set } = row;
        await db.insert(labResults).values(row).onConflictDoUpdate({ target: labResults.id, set });
    }

    const imagingRows: (typeof imagingResults.$inferInsert)[] = [
        {
            id: demoId(patientId, 'imaging-cxr'),
            patientId,
            clinicId: secondaryClinicId,
            imagingType: 'XRay',
            bodyPart: 'Chest',
            examDate: toDate(d21),
            orderingPhysician: 'Dr. Maria Santos',
            radiologist: 'Dr. R. Dela Cruz',
            findings: 'No focal infiltrate or pleural effusion. Cardiac silhouette upper normal limits.',
            impression: 'No acute cardiopulmonary abnormality.',
            recommendation: 'Continue routine clinical follow-up.',
            serverCreatedAt: d21,
        },
        {
            id: demoId(patientId, 'imaging-ecg'),
            patientId,
            clinicId: primaryClinicId,
            imagingType: 'ECG',
            bodyPart: 'Cardiac',
            examDate: toDate(d14),
            orderingPhysician: 'Dr. Maria Santos',
            radiologist: 'Dr. L. Mendoza',
            findings: 'Normal sinus rhythm at 76 bpm, no ST-T wave changes.',
            impression: 'Normal ECG.',
            recommendation: 'Repeat only if new cardiac symptoms occur.',
            serverCreatedAt: d14,
        },
    ];

    for (const row of imagingRows) {
        const { id, ...set } = row;
        await db.insert(imagingResults).values(row).onConflictDoUpdate({ target: imagingResults.id, set });
    }

    const clinicalAssessmentRows: (typeof clinicalAssessments.$inferInsert)[] = [
        {
            id: demoId(patientId, 'assessment-phq9'),
            patientId,
            clinicId: primaryClinicId,
            assessmentType: 'PHQ9',
            date: toDate(d14),
            assessedBy: 'Dr. Maria Santos',
            scoresJson: JSON.stringify({
                total: 3,
                sleep: 1,
                energy: 1,
                concentration: 1,
                appetite: 0,
                mood: 0,
            }),
            findingsJson: JSON.stringify({
                interpretation: 'Minimal depressive symptoms',
                recommendations: ['Maintain sleep routine', 'Continue regular physical activity', 'Repeat screening in 6 months'],
            }),
            serverCreatedAt: d14,
        },
        {
            id: demoId(patientId, 'assessment-occ-health'),
            patientId,
            clinicId: secondaryClinicId,
            assessmentType: 'OccupationalHealth',
            date: toDate(d3),
            assessedBy: 'Nurse J. Navarro',
            scoresJson: JSON.stringify({
                fitnessForWork: 'Fit',
                bpControl: 'Improving',
            }),
            findingsJson: JSON.stringify({
                notes: 'Cleared for regular duties; advised hydration and periodic BP checks during shifts.',
            }),
            serverCreatedAt: d3,
        },
    ];

    for (const row of clinicalAssessmentRows) {
        const { id, ...set } = row;
        await db.insert(clinicalAssessments).values(row).onConflictDoUpdate({ target: clinicalAssessments.id, set });
    }

    const prescriptionRows: (typeof prescriptions.$inferInsert)[] = [
        {
            id: demoId(patientId, 'rx-amlodipine'),
            patientId,
            clinicId: primaryClinicId,
            drugName: 'Amlodipine 5 mg Tablet',
            genericName: 'Amlodipine',
            dosage: '5 mg',
            dosageForm: 'Tablet',
            frequency: 'Once daily',
            route: 'Oral',
            duration: '90 days',
            indication: 'Hypertension',
            startDate: toDate(d28),
            endDate: toDate(d30Future),
            prescribingPhysician: 'Dr. Maria Santos',
            refillsAllowed: 2,
            specialInstructions: 'Take at the same time daily; monitor BP three times per week.',
            serverCreatedAt: d28,
        },
        {
            id: demoId(patientId, 'rx-paracetamol'),
            patientId,
            clinicId: secondaryClinicId,
            drugName: 'Paracetamol 500 mg Tablet',
            genericName: 'Paracetamol',
            dosage: '500 mg',
            dosageForm: 'Tablet',
            frequency: 'Every 6 hours as needed',
            route: 'Oral',
            duration: '5 days',
            indication: 'Headache',
            startDate: toDate(d14),
            endDate: toDate(d9),
            prescribingPhysician: 'Dr. Maria Santos',
            refillsAllowed: 0,
            specialInstructions: 'Do not exceed 4 grams per day.',
            serverCreatedAt: d14,
        },
    ];

    for (const row of prescriptionRows) {
        const { id, ...set } = row;
        await db.insert(prescriptions).values(row).onConflictDoUpdate({ target: prescriptions.id, set });
    }

    const vaccinationRows: (typeof vaccinationsAdministered.$inferInsert)[] = [
        {
            id: demoId(patientId, 'vax-influenza-2025'),
            patientId,
            clinicId: primaryClinicId,
            vaccineName: 'Quadrivalent Influenza Vaccine',
            diseaseTargeted: 'Influenza',
            doseNumber: 'Annual',
            dateAdministered: toDate(d42),
            lotBatchNumber: 'FLU-25-1048',
            administeredBy: 'Nurse J. Navarro',
            facility: 'City Health Center',
            route: 'IM',
            injectionSite: 'Left deltoid',
            nextDueDate: toDate(new Date(d42.getTime() + 365 * DAY_MS)),
            adverseReaction: 'None',
            adverseReactionDescription: 'No immediate or delayed adverse event documented.',
            vaccineProgram: 'DOH_EPI',
            serverCreatedAt: d42,
        },
        {
            id: demoId(patientId, 'vax-td-booster'),
            patientId,
            clinicId: secondaryClinicId,
            vaccineName: 'Tetanus-Diphtheria Booster',
            diseaseTargeted: 'Tetanus, Diphtheria',
            doseNumber: 'Booster',
            dateAdministered: toDate(d3),
            lotBatchNumber: 'TD-26-7781',
            administeredBy: 'Nurse A. Reyes',
            facility: 'City Health Center',
            route: 'IM',
            injectionSite: 'Right deltoid',
            nextDueDate: toDate(new Date(d3.getTime() + 10 * 365 * DAY_MS)),
            adverseReaction: 'Local',
            adverseReactionDescription: 'Mild soreness at injection site for 1 day.',
            vaccineProgram: 'DOH_EPI',
            serverCreatedAt: d3,
        },
    ];

    for (const row of vaccinationRows) {
        const { id, ...set } = row;
        await db
            .insert(vaccinationsAdministered)
            .values(row)
            .onConflictDoUpdate({ target: vaccinationsAdministered.id, set });
    }

    const governmentIdsRow: typeof patientGovernmentIds.$inferInsert = {
        id: demoId(patientId, 'government-ids'),
        patientId,
        philhealthId: '12-345678901-2',
        philhealthCategory: 'Member',
        sssNumber: '34-1234567-8',
        gsisNumber: '11-234567890-1',
        pagibigId: '1234-5678-9012',
        tin: '123-456-789-000',
        seniorCitizenId: null,
        isPwd: false,
        pwdIdNumber: null,
        disabilityType: null,
        hmoProvider: 'DemoCare HMO',
        hmoPolicyNumber: 'HMO-2026-0008',
        hmoPlanType: 'Family',
        hmoCoverageStart: toDate(d56),
        hmoCoverageEnd: toDate(new Date(now.getTime() + 330 * DAY_MS)),
        createdAt: d56,
        updatedAt: now,
    };

    {
        const { id, ...set } = governmentIdsRow;
        await db
            .insert(patientGovernmentIds)
            .values(governmentIdsRow)
            .onConflictDoUpdate({ target: patientGovernmentIds.patientId, set });
    }

    const addressRows: (typeof patientAddresses.$inferInsert)[] = [
        {
            id: demoId(patientId, 'address-primary'),
            patientId,
            type: 'primary',
            houseStreet: 'Lot 18 Block 4, Sampaguita Street',
            barangay: 'Barangay San Isidro',
            cityMunicipality: 'Quezon City',
            province: 'Metro Manila',
            region: 'NCR',
            zipCode: '1106',
            country: 'Philippines',
            createdAt: d56,
            updatedAt: now,
        },
        {
            id: demoId(patientId, 'address-secondary'),
            patientId,
            type: 'secondary',
            houseStreet: 'Unit 4B, Riverside Residences',
            barangay: 'Barangay Riverside',
            cityMunicipality: 'Pasig City',
            province: 'Metro Manila',
            region: 'NCR',
            zipCode: '1600',
            country: 'Philippines',
            createdAt: d28,
            updatedAt: now,
        },
    ];

    for (const row of addressRows) {
        const { id, ...set } = row;
        await db.insert(patientAddresses).values(row).onConflictDoUpdate({ target: patientAddresses.id, set });
    }

    const emergencyContactRows: (typeof emergencyContacts.$inferInsert)[] = [
        {
            id: demoId(patientId, 'emergency-contact-1'),
            patientId,
            sortOrder: 1,
            name: 'Ana Patient',
            relationship: 'Spouse',
            phone: '09170000001',
            altPhone: '0281234567',
            email: 'ana.patient@example.com',
            address: 'Quezon City',
            createdAt: d56,
            updatedAt: now,
        },
        {
            id: demoId(patientId, 'emergency-contact-2'),
            patientId,
            sortOrder: 2,
            name: 'Luis Patient',
            relationship: 'Brother',
            phone: '09170000002',
            altPhone: null,
            email: 'luis.patient@example.com',
            address: 'Pasig City',
            createdAt: d42,
            updatedAt: now,
        },
    ];

    for (const row of emergencyContactRows) {
        const { id, ...set } = row;
        await db.insert(emergencyContacts).values(row).onConflictDoUpdate({ target: emergencyContacts.id, set });
    }

    const healthcareProviderRows: (typeof patientHealthcareProviders.$inferInsert)[] = [
        {
            id: demoId(patientId, 'healthcare-provider-pcp'),
            patientId,
            providerType: 'primary_care',
            name: 'Dr. Maria Santos',
            specialty: 'Family Medicine',
            clinicHospital: 'City Health Center - OPD',
            phone: '0281112233',
            createdAt: d56,
            updatedAt: now,
        },
        {
            id: demoId(patientId, 'healthcare-provider-specialist'),
            patientId,
            providerType: 'specialist_1',
            name: 'Dr. Ramon Dela Cruz',
            specialty: 'Cardiology',
            clinicHospital: 'Riverside Diagnostics and Imaging',
            phone: '0284445566',
            createdAt: d28,
            updatedAt: now,
        },
    ];

    for (const row of healthcareProviderRows) {
        const { id, ...set } = row;
        await db
            .insert(patientHealthcareProviders)
            .values(row)
            .onConflictDoUpdate({ target: patientHealthcareProviders.id, set });
    }

    const allergyRows: (typeof patientAllergies.$inferInsert)[] = [
        {
            id: demoId(patientId, 'allergy-penicillin'),
            patientId,
            allergen: 'Penicillin',
            reactionType: 'Rash',
            severity: 'Moderate',
            management: 'Avoid penicillin-class antibiotics; use alternatives.',
            isActive: true,
            createdAt: d56,
            updatedAt: now,
        },
    ];

    for (const row of allergyRows) {
        const { id, ...set } = row;
        await db.insert(patientAllergies).values(row).onConflictDoUpdate({ target: patientAllergies.id, set });
    }

    const selfMedicationRows: (typeof patientMedications.$inferInsert)[] = [
        {
            id: demoId(patientId, 'self-med-amlodipine'),
            patientId,
            drugName: 'Amlodipine',
            dosage: '5 mg',
            dosageForm: 'Tablet',
            frequency: 'Once daily',
            prescribingPhysician: 'Dr. Maria Santos',
            startDate: toDate(d28),
            indication: 'Blood pressure control',
            isActive: true,
            createdAt: d28,
            updatedAt: now,
        },
    ];

    for (const row of selfMedicationRows) {
        const { id, ...set } = row;
        await db.insert(patientMedications).values(row).onConflictDoUpdate({ target: patientMedications.id, set });
    }

    const surgicalHistoryRows: (typeof patientSurgicalHistory.$inferInsert)[] = [
        {
            id: demoId(patientId, 'surgical-appendectomy'),
            patientId,
            procedure: 'Appendectomy',
            surgeon: 'Dr. Paolo Mercado',
            facility: 'St. Gabriel Medical Center',
            date: '2014-09-10',
            anesthesiaType: 'General anesthesia',
            complications: 'None',
            createdAt: d56,
            updatedAt: now,
        },
    ];

    for (const row of surgicalHistoryRows) {
        const { id, ...set } = row;
        await db.insert(patientSurgicalHistory).values(row).onConflictDoUpdate({ target: patientSurgicalHistory.id, set });
    }

    const pastIllnessRows: (typeof patientPastIllnesses.$inferInsert)[] = [
        {
            id: demoId(patientId, 'past-illness-dengue'),
            patientId,
            diagnosis: 'Dengue fever',
            duration: '7 days',
            complications: 'Resolved without complications',
            createdAt: d56,
            updatedAt: now,
        },
    ];

    for (const row of pastIllnessRows) {
        const { id, ...set } = row;
        await db.insert(patientPastIllnesses).values(row).onConflictDoUpdate({ target: patientPastIllnesses.id, set });
    }

    const chronicConditionRows: (typeof patientChronicConditions.$inferInsert)[] = [
        {
            id: demoId(patientId, 'chronic-hypertension'),
            patientId,
            diagnosis: 'Hypertension',
            controlStatus: 'Partially controlled',
            monitoringFrequency: 'Weekly home BP log',
            createdAt: d56,
            updatedAt: now,
        },
    ];

    for (const row of chronicConditionRows) {
        const { id, ...set } = row;
        await db
            .insert(patientChronicConditions)
            .values(row)
            .onConflictDoUpdate({ target: patientChronicConditions.id, set });
    }

    const disabilityRows: (typeof patientDisabilities.$inferInsert)[] = [
        {
            id: demoId(patientId, 'disability-vision'),
            patientId,
            bodyPart: 'Eyes',
            classification: 'Low vision requiring corrective lenses',
            isPwdCertified: false,
            createdAt: d56,
            updatedAt: now,
        },
    ];

    for (const row of disabilityRows) {
        const { id, ...set } = row;
        await db.insert(patientDisabilities).values(row).onConflictDoUpdate({ target: patientDisabilities.id, set });
    }

    const selfImmunizationRows: (typeof patientImmunizationsSelf.$inferInsert)[] = [
        {
            id: demoId(patientId, 'self-immunization-covid-booster'),
            patientId,
            immunizationCategory: 'Other',
            vaccineName: 'COVID-19 Booster',
            doseNumber: 'Booster 1',
            lotNumber: 'C19-8891',
            date: toDate(d42),
            administeredBy: 'Private clinic',
            createdAt: d42,
            updatedAt: now,
        },
    ];

    for (const row of selfImmunizationRows) {
        const { id, ...set } = row;
        await db
            .insert(patientImmunizationsSelf)
            .values(row)
            .onConflictDoUpdate({ target: patientImmunizationsSelf.id, set });
    }

    const familyHistoryRows: (typeof patientFamilyHistory.$inferInsert)[] = [
        {
            id: demoId(patientId, 'family-history-hypertension'),
            patientId,
            condition: 'Hypertension',
            affectedRelative: 'Father',
            side: 'Paternal',
            ageOfOnset: 48,
            isDeceased: false,
            ageAtDeath: null,
            causeOfDeath: null,
            notes: 'Controlled with maintenance medications.',
            createdAt: d56,
            updatedAt: now,
        },
    ];

    for (const row of familyHistoryRows) {
        const { id, ...set } = row;
        await db.insert(patientFamilyHistory).values(row).onConflictDoUpdate({ target: patientFamilyHistory.id, set });
    }

    const socialHistoryRow: typeof patientSocialHistory.$inferInsert = {
        id: demoId(patientId, 'social-history'),
        patientId,
        tobaccoStatus: 'Former',
        cigsPerDay: 0,
        packYears: 3.5,
        quitDate: '2020-06-01',
        otherTobaccoProducts: 'None',
        alcoholUseLevel: 'Occasional',
        alcoholType: 'Beer',
        alcoholFrequencyDaysPerWeek: 1,
        alcoholQuantityPerOccasion: 2,
        substanceUse: false,
        substanceName: null,
        substanceRoute: null,
        substanceFrequency: null,
        activityLevel: 'Moderate',
        exerciseType: 'Brisk walking',
        exerciseFrequencyDaysPerWeek: 4,
        dietPattern: 'Balanced with reduced sodium',
        foodRestrictions: 'Low sodium',
        sleepAvgHours: 7,
        sleepQuality: 'Good',
        isSexuallyActive: true,
        waterIntake: '2 liters/day',
        caffeineUse: '1 cup coffee/day',
        dailyScreenTime: '6 hours/day',
        createdAt: d56,
        updatedAt: now,
    };

    {
        const { id, ...set } = socialHistoryRow;
        await db
            .insert(patientSocialHistory)
            .values(socialHistoryRow)
            .onConflictDoUpdate({ target: patientSocialHistory.patientId, set });
    }

    const occupationRow: typeof patientOccupation.$inferInsert = {
        id: demoId(patientId, 'occupation'),
        patientId,
        occupation: 'Administrative Assistant',
        employer: 'Metro Logistics Inc.',
        industry: 'Logistics',
        workEnvironment: 'Office',
        yearsInOccupation: 8,
        hazardExposure: 'Prolonged sitting and screen exposure',
        createdAt: d56,
        updatedAt: now,
    };

    {
        const { id, ...set } = occupationRow;
        await db.insert(patientOccupation).values(occupationRow).onConflictDoUpdate({ target: patientOccupation.patientId, set });
    }

    const travelHistoryRows: (typeof patientTravelHistory.$inferInsert)[] = [
        {
            id: demoId(patientId, 'travel-history-baguio'),
            patientId,
            destination: 'Baguio',
            cityProvince: 'Benguet',
            departureDate: toDate(new Date(now.getTime() - 120 * DAY_MS)),
            returnDate: toDate(new Date(now.getTime() - 116 * DAY_MS)),
            purpose: 'Leisure',
            illnessDuringAfterTravel: 'None',
            createdAt: d56,
            updatedAt: now,
        },
    ];

    for (const row of travelHistoryRows) {
        const { id, ...set } = row;
        await db.insert(patientTravelHistory).values(row).onConflictDoUpdate({ target: patientTravelHistory.id, set });
    }

    const obstetricRow: typeof patientObstetricProfile.$inferInsert = {
        id: demoId(patientId, 'obstetric-profile'),
        patientId,
        ageAtMenarche: 12,
        cycleLength: 28,
        cycleDuration: 5,
        regularity: 'Regular',
        dysmenorrheaSeverity: 'Mild',
        menopausalStatus: 'NA',
        ageAtMenopause: null,
        padsPerDay: 3,
        ageAtOnsetSexualActivity: 21,
        currentContraceptiveMethod: 'Condom',
        menstruationApplicable: true,
        gravida: 1,
        para: 1,
        abortion: 0,
        livingChildren: 1,
        lmp: toDate(new Date(now.getTime() - 20 * DAY_MS)),
        deliveryCnt: 1,
        deliveryType: 'Vaginal',
        fullTermDeliveries: 1,
        prematureDeliveries: 0,
        pregnancyInducedHypertension: false,
        onFamilyPlanning: true,
        pregnancyApplicable: true,
        createdAt: d56,
        updatedAt: now,
    };

    {
        const { id, ...set } = obstetricRow;
        await db
            .insert(patientObstetricProfile)
            .values(obstetricRow)
            .onConflictDoUpdate({ target: patientObstetricProfile.patientId, set });
    }

    const pregnancyRows: (typeof patientPregnancies.$inferInsert)[] = [
        {
            id: demoId(patientId, 'pregnancy-2020'),
            patientId,
            year: 2020,
            outcome: 'Live birth',
            gestationalAgeWeeks: 39,
            deliveryType: 'Vaginal',
            birthWeightKg: 3.2,
            complications: 'None',
            facility: 'City General Hospital',
            createdAt: d56,
            updatedAt: now,
        },
    ];

    for (const row of pregnancyRows) {
        const { id, ...set } = row;
        await db.insert(patientPregnancies).values(row).onConflictDoUpdate({ target: patientPregnancies.id, set });
    }

    const contraceptiveRows: (typeof patientContraceptiveHistory.$inferInsert)[] = [
        {
            id: demoId(patientId, 'contraceptive-condom'),
            patientId,
            method: 'Condom',
            isCurrent: true,
            dateStarted: '2024-01-01',
            reasonForStopping: null,
            createdAt: d56,
            updatedAt: now,
        },
    ];

    for (const row of contraceptiveRows) {
        const { id, ...set } = row;
        await db
            .insert(patientContraceptiveHistory)
            .values(row)
            .onConflictDoUpdate({ target: patientContraceptiveHistory.id, set });
    }

    const maleReproductiveRow: typeof patientMaleReproductive.$inferInsert = {
        id: demoId(patientId, 'male-reproductive'),
        patientId,
        hasVasectomy: false,
        vasectomyDate: null,
        conditions: 'None reported',
        createdAt: d56,
        updatedAt: now,
    };

    {
        const { id, ...set } = maleReproductiveRow;
        await db
            .insert(patientMaleReproductive)
            .values(maleReproductiveRow)
            .onConflictDoUpdate({ target: patientMaleReproductive.patientId, set });
    }

    const dentalVisionRow: typeof patientDentalVision.$inferInsert = {
        id: demoId(patientId, 'dental-vision'),
        patientId,
        dentistName: 'Dr. Elena Cruz',
        dentistClinic: 'SmileCare Dental Clinic',
        orthodonticDevice: 'None',
        eyeDoctorName: 'Dr. Jorge Lim',
        correctiveLenses: 'Glasses',
        createdAt: d56,
        updatedAt: now,
    };

    {
        const { id, ...set } = dentalVisionRow;
        await db.insert(patientDentalVision).values(dentalVisionRow).onConflictDoUpdate({ target: patientDentalVision.patientId, set });
    }

    const mentalHealthRow: typeof patientMentalHealthProfile.$inferInsert = {
        id: demoId(patientId, 'mental-health-profile'),
        patientId,
        hasPriorDiagnosis: false,
        providerName: 'Dr. Andrea Molina',
        providerSpecialty: 'Psychiatry',
        providerClinic: 'City Health Center - Behavioral Unit',
        psychotherapyStatus: 'None',
        createdAt: d56,
        updatedAt: now,
    };

    {
        const { id, ...set } = mentalHealthRow;
        await db
            .insert(patientMentalHealthProfile)
            .values(mentalHealthRow)
            .onConflictDoUpdate({ target: patientMentalHealthProfile.patientId, set });
    }

    const ncdqRow: typeof patientNcdQuestionnaire.$inferInsert = {
        id: demoId(patientId, 'ncd-questionnaire'),
        patientId,
        qid1Yn: 'Y',
        qid2Yn: 'N',
        qid3Yn: 'N',
        qid4Yn: 'Y',
        qid5Ynx: 'Y',
        qid6Yn: 'N',
        qid7Yn: 'Y',
        qid8Yn: 'N',
        qid9Yn: 'N',
        qid10Yn: 'N',
        qid11Yn: 'Y',
        qid12Yn: 'N',
        qid13Yn: 'N',
        qid14Yn: 'Y',
        qid15Yn: 'N',
        qid16Yn: 'Y',
        qid17Abcde: 'C',
        qid18Yn: 'N',
        qid19Yn: 'Y',
        qid19FbsMgdl: 101,
        qid19FbsMmol: 5.6,
        qid19FbsDate: toDate(d9),
        qid20Yn: 'Y',
        qid20CholeVal: 206,
        qid20CholeDate: toDate(d21),
        qid21Yn: 'N',
        qid21KetonVal: 0,
        qid21KetonDate: toDate(d21),
        qid22Yn: 'Y',
        qid22ProteinVal: 0,
        qid22ProteinDate: toDate(d21),
        qid23Yn: 'N',
        qid24Yn: 'Y',
        createdAt: d21,
        updatedAt: now,
    };

    {
        const { id, ...set } = ncdqRow;
        await db
            .insert(patientNcdQuestionnaire)
            .values(ncdqRow)
            .onConflictDoUpdate({ target: patientNcdQuestionnaire.patientId, set });
    }

    const physicalExamRows: (typeof patientPhysicalExamProfile.$inferInsert)[] = [
        {
            id: demoId(patientId, 'pepert-initial'),
            patientId,
            clinicId: primaryClinicId,
            examDate: toDate(d21),
            genSurveyId: 'GS001',
            genSurveyRem: 'Conscious, coherent, ambulatory, not in cardiopulmonary distress.',
            skinRem: 'Warm, good turgor, no active lesions.',
            heentRem: 'Anicteric sclerae, moist oral mucosa, no pharyngeal congestion.',
            chestRem: 'Symmetric expansion, clear breath sounds bilaterally.',
            heartRem: 'Regular rate and rhythm, no murmurs.',
            abdomenRem: 'Soft, non-tender, normoactive bowel sounds.',
            neuroRem: 'Alert and oriented x3, no focal neurologic deficit.',
            rectalRem: 'Deferred, no clinical indication.',
            guRem: 'No dysuria, no flank tenderness.',
            skinId: 'SK001',
            heentId: 'HE001',
            chestId: 'CH001',
            heartId: 'HT001',
            abdomenId: 'AB001',
            neuroId: 'NE001',
            guId: 'GU001',
            rectalId: 'RC999',
            serverCreatedAt: d21,
        },
        {
            id: demoId(patientId, 'pepert-followup'),
            patientId,
            clinicId: secondaryClinicId,
            examDate: toDate(d3),
            genSurveyId: 'GS001',
            genSurveyRem: 'Well-appearing and comfortable at rest.',
            skinRem: 'No edema, no cyanosis.',
            heentRem: 'PERRLA, pink conjunctiva.',
            chestRem: 'Clear breath sounds, no rales or wheeze.',
            heartRem: 'Regular rhythm, no gallop.',
            abdomenRem: 'Soft, non-distended, non-tender.',
            neuroRem: 'No motor or sensory deficits.',
            rectalRem: 'Deferred.',
            guRem: 'No suprapubic tenderness.',
            skinId: 'SK001',
            heentId: 'HE001',
            chestId: 'CH001',
            heartId: 'HT001',
            abdomenId: 'AB001',
            neuroId: 'NE001',
            guId: 'GU001',
            rectalId: 'RC999',
            serverCreatedAt: d3,
        },
    ];

    for (const row of physicalExamRows) {
        const { id, ...set } = row;
        await db
            .insert(patientPhysicalExamProfile)
            .values(row)
            .onConflictDoUpdate({ target: patientPhysicalExamProfile.id, set });
    }
}
