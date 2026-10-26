using System;
using System.Collections.Generic;
using ClinicEz.Clinic.Application.Features.LabOrders.Queries;
using ClinicEz.Clinic.Application.Features.Prescriptions.DTOs;
using ClinicEz.Clinic.Application.Features.Reports.DTOs;
using ClinicEz.Clinic.Domain.Entities;
using ClinicEz.Clinic.Domain.Enums;
using ClinicEz.Shared.Documents.Configuration;

namespace ClinicEz.Clinic.Infrastructure.Services;

/// <summary>
/// Provides synthetic mock entities and DTO fixtures specifically for stationery preview rendering.
/// Decoupled from production controllers and persistence logic.
/// </summary>
public static class SampleDocumentFixtures
{
    public static StaffMember CreateSampleDoctor(ClinicSettings settings, SignatureMode signatureMode) => new()
    {
        Id = Guid.NewGuid(),
        TenantId = settings.TenantId,
        FirstName = "Allan",
        LastName = "Ramos",
        Title = "Dr.",
        Role = StaffRole.Doctor,
        Specialty = "Internal Medicine",
        PrcLicenseNumber = "0056789",
        PtrNumber = "PTR-2026-9912",
        S2LicenseNumber = "S2-0918-99214-A1",
        DefaultSignatureMode = signatureMode
    };

    public static ClinicPatient CreateSamplePatient(ClinicSettings settings) => new()
    {
        Id = Guid.NewGuid(),
        TenantId = settings.TenantId,
        PatientCode = "PAT-2026-0001",
        ContactNumber = "+63 917 123 4567",
        FirstName = "Maria Clara",
        LastName = "De Los Santos",
        DateOfBirth = new DateOnly(1992, 5, 14),
        Gender = "Female",
        PhilHealthNumber = "12-050192831-2"
    };

    public static PrescriptionSlipDto CreateSamplePrescriptionSlip(
        ClinicSettings settings,
        ClinicPatient samplePatient,
        StaffMember sampleDoctor) => new(
        ConsultationId: Guid.NewGuid(),
        PrescriptionNumber: "RX-SAMPLE-0001",
        IssuedAt: DateTime.UtcNow,
        ClinicName: settings.ClinicName,
        ClinicAddress: settings.LetterheadAddress ?? "Philippines",
        ClinicContact: settings.LetterheadContact ?? "Tel: (02) 8876-5432",
        DoctorName: "Dr. Allan Ramos, MD",
        DoctorPrcLicense: "0056789",
        DoctorPtr: "PTR-2026-9912",
        DoctorS2License: "S2-0918-99214-A1",
        DoctorSpecialization: "Internal Medicine",
        PatientId: samplePatient.Id,
        PatientName: "Maria Clara De Los Santos",
        PatientAge: 34,
        PatientGender: "Female",
        PhilHealthNumber: "12-050192831-2",
        PatientAllergies: "None",
        ClinicalDiagnosis: "Acute Upper Respiratory Tract Infection",
        SpecialInstructions: "Take after meals. Complete full 7-day course of antibiotic.",
        Items: new List<PrescriptionSlipItemDto>
        {
            new(Guid.NewGuid(), "Amoxicillin + Clavulanic Acid", "Augmentin", "625 mg", "Tablet", "Take 1 tablet every 12 hours for 7 days", 14, 7, 0, false, "Take with food"),
            new(Guid.NewGuid(), "Paracetamol", "Biogesic", "500 mg", "Tablet", "Take 1 tablet every 4 to 6 hours as needed for fever", 10, 3, 0, false, "Maximum 4 grams per day")
        },
        PublicVerificationToken: "sample-rx-verify-tok",
        PublicVerificationUrl: "https://clinicez.ph/verify/rx/sample-rx-verify-tok",
        QrPayload: "CLINICEZ:RX:RX-SAMPLE-0001:sample-rx-verify-tok",
        DispenseStatus: "Pending",
        DispensedPharmacyName: null,
        DispensedPharmacistName: null,
        DispensedPharmacistPrc: null,
        DispensedReceiptNumber: null,
        DispensedReceiptUrl: null,
        DispensedAt: null,
        DispenseNotes: null,
        PharmacyStatus: null,
        PatientDateOfBirth: samplePatient.DateOfBirth
    );

    public static LabOrderSlipDto CreateSampleLabOrderSlip(
        ClinicSettings settings,
        ClinicPatient samplePatient,
        StaffMember sampleDoctor) => new(
        OrderId: Guid.NewGuid(),
        OrderNumber: "ORD-SAMPLE-0001",
        OrderDate: DateTime.UtcNow,
        ClinicName: settings.ClinicName,
        ClinicAddress: settings.LetterheadAddress ?? "Philippines",
        ClinicContact: settings.LetterheadContact ?? "Tel: (02) 8876-5432",
        DoctorName: "Dr. Allan Ramos, MD",
        DoctorPrcLicense: "0056789",
        DoctorPtr: "PTR-2026-9912",
        PatientId: samplePatient.Id,
        PatientName: "Maria Clara De Los Santos",
        PatientAge: 34,
        PatientGender: "Female",
        PhilHealthNumber: "12-050192831-2",
        ClinicalDiagnosis: "Routine Annual Executive Checkup",
        FastingInstructions: "Strict 10-hour fasting prior to blood draw",
        Items: new List<LabOrderSlipItemDto>
        {
            new("Complete Blood Count (CBC) with Platelet Count", "Hematology", "EDTA purple top tube"),
            new("Fasting Blood Sugar (FBS)", "Clinical Chemistry", "Serum separator tube (SST)"),
            new("Lipid Profile (Total Cholesterol, Triglycerides, HDL, LDL)", "Clinical Chemistry", "Serum separator tube (SST)")
        },
        PublicUploadUrl: "https://clinicez.ph/upload/sample-lab-tok",
        QrPayload: "CLINICEZ:REQ:ORD-SAMPLE-0001",
        ClaimToken: null,
        PatientDateOfBirth: samplePatient.DateOfBirth
    );

    public static ReferralLetter CreateSampleReferralLetter(
        ClinicSettings settings,
        ClinicPatient samplePatient,
        StaffMember sampleDoctor) => new()
    {
        Id = Guid.NewGuid(),
        TenantId = settings.TenantId,
        ClinicId = settings.ClinicId,
        ReferralNumber = "REF-SAMPLE-0001",
        PatientId = samplePatient.Id,
        PatientName = "Maria Clara De Los Santos",
        ReferringDoctorId = sampleDoctor.Id,
        ReferringDoctorName = "Dr. Allan Ramos, MD",
        ReferredToDoctor = "Dr. Roberto Cruz, MD",
        ReferredToFacility = "National Kidney and Transplant Institute",
        ReferredDepartment = "Department of Nephrology",
        ReferralDate = DateOnly.FromDateTime(DateTime.UtcNow),
        Urgency = "Routine",
        ProvisionalDiagnosis = "Chronic Kidney Disease Stage 2",
        ReasonForReferral = "For specialist nephrology evaluation and co-management.",
        ClinicalSummary = "34yo female with persistent mild proteinuria and elevated serum creatinine noted on routine screening.",
        CurrentMedications = "Losartan 50mg OD, Multivitamins 1 tab OD",
        AttachedDiagnostics = "Serum Creatinine: 1.4 mg/dL; eGFR: 62 mL/min; Urinalysis: Protein 1+",
        IsSigned = true,
        SignedAt = DateTime.UtcNow,
        CreatedAt = DateTime.UtcNow,
        CreatedBy = "Dr. Allan Ramos"
    };

    public static DailyEodReportDto CreateSampleDailyEodReport(ClinicSettings settings) => new(
        DateTime.UtcNow.Date,
        settings.TenantId,
        settings.ClinicId,
        28, 19, 9, 26, 2,
        24500m, 2940m, 1960m, 980m, 0m, 21560m, 21560m, 14200m, 0m,
        new List<PaymentModeSummary>
        {
            new("Cash", 14200m, 18),
            new("GCash", 5360m, 7),
            new("CreditCard", 2000m, 1)
        },
        new List<DoctorWorkloadSummary>
        {
            new("Dr. Allan Ramos, MD", 16),
            new("Dr. Roberto Cruz, MD", 10)
        },
        4, 6, 22, 1
    );

    public static MorbidityReportDto CreateSampleMorbidityReport(ClinicSettings settings) => new(
        DateTime.UtcNow.AddDays(-30),
        DateTime.UtcNow,
        settings.TenantId,
        settings.ClinicId,
        settings.ClinicName,
        184, 192,
        new List<MorbidityDiseaseRowDto>
        {
            new(1, "J06.9", "Acute Upper Respiratory Tract Infection", 64, 18, 38, 8, 30, 34, 33.3),
            new(2, "I10", "Essential (Primary) Hypertension", 48, 0, 22, 26, 22, 26, 25.0),
            new(3, "E11.9", "Type 2 Diabetes Mellitus without Complications", 32, 0, 18, 14, 15, 17, 16.7),
            new(4, "K21.9", "Gastro-Esophageal Reflux Disease without Esophagitis", 24, 2, 18, 4, 11, 13, 12.5),
            new(5, "M54.5", "Low Back Pain", 16, 0, 12, 4, 9, 7, 8.3)
        }
    );

    public static TaxDiscountAuditReportDto CreateSampleTaxDiscountAuditReport(ClinicSettings settings) => new(
        DateTime.UtcNow.AddDays(-30),
        DateTime.UtcNow,
        settings.TenantId,
        settings.ClinicId,
        45, 54000m, 6800m, 4000m, 6480m, 43200m,
        new List<TaxDiscountAuditRowDto>
        {
            new("INV-2026-0042", DateTime.UtcNow.AddDays(-2), "Juan Dela Cruz", "SeniorCitizen", "OSCA-9921", 1200m, 240m, 960m, 115.2m, 960m, 960m, "OR-2026-0038", "Cash"),
            new("INV-2026-0056", DateTime.UtcNow.AddDays(-1), "Maria Clara", "Pwd", "PWD-4412", 1500m, 300m, 1200m, 144m, 1200m, 1200m, "OR-2026-0051", "GCash")
        }
    );

    public static DoctorSharesReportDto CreateSampleDoctorSharesReport(ClinicSettings settings, StaffMember sampleDoctor) => new(
        DateTime.UtcNow.AddDays(-30),
        DateTime.UtcNow,
        settings.TenantId,
        settings.ClinicId,
        184, 142000m, 99400m, 42600m,
        new List<DoctorWorkloadDetailDto>
        {
            new(sampleDoctor.Id.ToString(), "Dr. Allan Ramos, MD", 112, 14, 84000m, 14000m, 98000m, 68600m, 29400m),
            new(Guid.NewGuid().ToString(), "Dr. Roberto Cruz, MD", 72, 6, 38000m, 6000m, 44000m, 30800m, 13200m)
        }
    );

    public static ClinicAnalyticsDto CreateSampleClinicAnalytics(ClinicSettings settings) => new(
        DateTime.UtcNow.AddDays(-30),
        DateTime.UtcNow,
        settings.TenantId,
        settings.ClinicId,
        new FlowAnalyticsDto(32, 4, 1, 2, 26, 12.5, 16.0, 24, 6, 2),
        185000m, 164000m, 158000m, 6000m, 980m, 12800m, 8200m,
        new List<DailyTrendPointDto>
        {
            new(DateTime.UtcNow.AddDays(-6).ToString("MMM dd"), 24000m, 26),
            new(DateTime.UtcNow.AddDays(-5).ToString("MMM dd"), 28000m, 31),
            new(DateTime.UtcNow.AddDays(-4).ToString("MMM dd"), 21000m, 22),
            new(DateTime.UtcNow.AddDays(-3).ToString("MMM dd"), 26000m, 29),
            new(DateTime.UtcNow.AddDays(-2).ToString("MMM dd"), 31000m, 34),
            new(DateTime.UtcNow.AddDays(-1).ToString("MMM dd"), 19000m, 20),
            new(DateTime.UtcNow.ToString("MMM dd"), 25000m, 28)
        },
        new List<TenderShareDto>
        {
            new("Cash", 94800m, 60.0),
            new("GCash", 47400m, 30.0),
            new("CreditCard", 15800m, 10.0)
        },
        new List<MorbidityItemDto>
        {
            new("J06.9", "Acute Upper Respiratory Tract Infection", 64, 33.3),
            new("I10", "Essential Hypertension", 48, 25.0),
            new("E11.9", "Type 2 Diabetes Mellitus", 32, 16.7)
        },
        new List<ServiceUsageDto>
        {
            new("Procedure", "Wound Dressing & Suturing", 18),
            new("LabOrder", "Complete Blood Count (CBC)", 42)
        },
        new List<DoctorStatDto>
        {
            new("Dr. Allan Ramos, MD", 112, 98000m),
            new("Dr. Roberto Cruz, MD", 72, 44000m)
        },
        new List<HourlyFlowPointDto>
        {
            new(8, "08:00", 12, 11.2),
            new(9, "09:00", 22, 20.5),
            new(10, "10:00", 28, 26.1),
            new(11, "11:00", 18, 16.8),
            new(13, "13:00", 14, 13.1),
            new(14, "14:00", 13, 12.3)
        },
        new VisitTypeSplitDto(72, 67.3, 35, 32.7),
        new AcuitySplitDto(85, 79.4, 18, 16.8, 4, 3.8),
        new DemographicDistributionDto(24, 22.4, 58, 54.2, 25, 23.4, 48, 44.9, 57, 53.3, 2, 1.8),
        new FinancialEfficiencyDto(96.3, 11.4, 1532.71m, 21000m)
    );

    public static MedicalCertificate CreateSampleMedicalCertificate(
        ClinicSettings settings,
        ClinicPatient samplePatient,
        StaffMember sampleDoctor) => new()
    {
        Id = Guid.NewGuid(),
        TenantId = settings.TenantId,
        ClinicId = settings.ClinicId,
        CertificateNumber = "MC-SAMPLE-0001",
        PatientId = samplePatient.Id,
        PatientName = "Maria Clara De Los Santos",
        DoctorId = sampleDoctor.Id,
        DoctorName = "Dr. Allan Ramos, MD",
        PrcLicenseNumber = "0056789",
        PtrNumber = "PTR-2026-9912",
        IssueDate = DateOnly.FromDateTime(DateTime.UtcNow),
        Diagnosis = "Acute Bronchitis (ICD-10: J20.9)",
        ClinicalFindings = "Bilateral rhonchi, dry persistent cough, low-grade fever of 37.8°C.",
        FitnessStatus = "UnfitToWork",
        RecommendedRestDays = 3,
        RestStartDate = DateOnly.FromDateTime(DateTime.UtcNow),
        RestEndDate = DateOnly.FromDateTime(DateTime.UtcNow.AddDays(3)),
        Purpose = "Employment / Medical Sick Leave",
        Remarks = "Advised oral hydration, rest, and follow-up if symptoms persist beyond 5 days.",
        IsSigned = true,
        SignedAt = DateTime.UtcNow,
        CreatedAt = DateTime.UtcNow,
        CreatedBy = "Dr. Allan Ramos"
    };

    public static (string QrUrl, string JoinCode, string ExpiresAt) CreateSampleReceptionPlacardParams() =>
        ("https://clinicez.ph/checkin/sample-qr-reception", "CEZ-2026", DateTime.UtcNow.AddHours(24).ToString("MMM dd, yyyy h:mm tt"));
}
