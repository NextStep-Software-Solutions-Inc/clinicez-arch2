namespace ClinicEz.Clinic.Application.Features.Patients.DTOs;

public sealed record UpdatePatientPhysicalExamRequest(
    string? GenSurveyId = null,
    string? GenSurveyRemarks = null,
    string? SkinId = null,
    string? SkinRemarks = null,
    string? HeentId = null,
    string? HeentRemarks = null,
    string? ChestId = null,
    string? ChestRemarks = null,
    string? HeartId = null,
    string? HeartRemarks = null,
    string? AbdomenId = null,
    string? AbdomenRemarks = null,
    string? NeuroId = null,
    string? NeuroRemarks = null,
    string? RectalId = null,
    string? RectalRemarks = null,
    string? GuId = null,
    string? GuRemarks = null);
