using System;
using System.Collections.Generic;
using ClinicEz.Clinic.Application.Features.Billing.DTOs;
using ClinicEz.Clinic.Application.Features.Consultations.DTOs;
using ClinicEz.Clinic.Application.Features.LabOrders.DTOs;
using ClinicEz.Clinic.Application.Features.Procedures.DTOs;
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
    NcdRiskAssessmentDto? LatestNcdAssessment = null
);
