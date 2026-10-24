using System;
using System.Collections.Generic;
using ClinicEz.Clinic.Application.Features.Allergies.Dtos;
using ClinicEz.Clinic.Application.Features.Billing.DTOs;
using ClinicEz.Clinic.Application.Features.Consultations.DTOs;
using ClinicEz.Clinic.Application.Features.Dental.DTOs;
using ClinicEz.Clinic.Application.Features.Documents.DTOs;
using ClinicEz.Clinic.Application.Features.Immunizations.DTOs;
using ClinicEz.Clinic.Application.Features.LabOrders.DTOs;
using ClinicEz.Clinic.Application.Features.Problems.Dtos;
using ClinicEz.Clinic.Application.Features.Procedures.DTOs;
using ClinicEz.Clinic.Application.Features.Records.DTOs;
using ClinicEz.Clinic.Application.Features.Triage.DTOs;

namespace ClinicEz.Clinic.Application.Features.Patients.DTOs;

public record PatientChartDto(
    Guid PatientId,
    string PatientName,
    int TotalVisits,
    List<ConsultationEncounterDto> Consultations,
    List<TriageVitalsDto> VitalsHistory,
    List<ClinicalProcedureDto> ProceduresHistory,
    List<ClinicLabOrderDto> LabOrdersHistory,
    List<InvoiceDto> InvoicesHistory,
    List<PatientSurgicalHistoryDto>? SurgicalHistories = null,
    PatientSocialHistoryDto? SocialHistory = null,
    PatientReproductiveHistoryDto? ReproductiveHistory = null,
    NcdRiskAssessmentDto? LatestNcdAssessment = null,
    PatientDemographicsDto? Demographics = null,
    List<PatientProblemDto>? Problems = null,
    List<PatientAllergyDto>? Allergies = null,
    List<PatientImmunizationDto>? Immunizations = null,
    List<ClinicRecordAttachmentDto>? Attachments = null,
    List<PatientPastMedicalHistoryDto>? PastMedicalHistories = null,
    string? PersonalMedicalHistoryNotes = null,
    List<PatientFamilyHistoryDto>? FamilyHistories = null,
    string? FamilyMedicalHistoryNotes = null,
    PatientPhysicalExamProfileDto? PhysicalExamProfile = null,
    List<DentalToothRecordDto>? DentalTeeth = null,
    List<ClinicalProcedureDto>? DentalProcedures = null,
    IReadOnlyList<MedicalCertificateDto>? MedicalCertificates = null,
    IReadOnlyList<ReferralLetterDto>? ReferralLetters = null
);
