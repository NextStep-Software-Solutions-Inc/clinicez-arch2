using System;
using System.Collections.Generic;

namespace ClinicEz.Clinic.Application.Features.Patients.DTOs;

public sealed record PatientPhysicalExamFindingDto(
    Guid? Id,
    string System,
    bool IsNormal,
    string FindingTitle,
    string? PhilHealthFindingCode = null,
    string? BodySite = null,
    string? Laterality = null
);

public sealed record PatientPhysicalExamDto(
    Guid? Id,
    DateOnly ExamDate,
    Guid? ConsultationEncounterId = null,
    Guid? ExaminedByStaffId = null,
    string? ExaminedByStaffName = null,
    string GeneralSurveyStatus = "Normal",
    string? GeneralSurveyRemarks = null,
    string? MusculoskeletalRemarks = null,
    string? PsychiatricRemarks = null,
    string? LymphaticRemarks = null,
    string? HeentRemarks = null,
    string? ChestRemarks = null,
    string? HeartRemarks = null,
    string? AbdomenRemarks = null,
    string? GenitourinaryRemarks = null,
    string? DigitalRectalRemarks = null,
    string? SkinExtremitiesRemarks = null,
    string? NeurologicalRemarks = null,
    List<PatientPhysicalExamFindingDto>? Findings = null
);
