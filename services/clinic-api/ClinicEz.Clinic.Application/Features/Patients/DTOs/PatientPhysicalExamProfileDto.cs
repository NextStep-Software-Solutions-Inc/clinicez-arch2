using System;

namespace ClinicEz.Clinic.Application.Features.Patients.DTOs;

public sealed record PatientPhysicalExamProfileDto(
    Guid Id,
    Guid PatientId,
    string GenSurveyId,
    string? GenSurveyRemarks,
    string SkinId,
    string? SkinRemarks,
    string HeentId,
    string? HeentRemarks,
    string ChestId,
    string? ChestRemarks,
    string HeartId,
    string? HeartRemarks,
    string AbdomenId,
    string? AbdomenRemarks,
    string NeuroId,
    string? NeuroRemarks,
    string RectalId,
    string? RectalRemarks,
    string GuId,
    string? GuRemarks,
    DateTime CreatedAt,
    DateTime? UpdatedAt);
