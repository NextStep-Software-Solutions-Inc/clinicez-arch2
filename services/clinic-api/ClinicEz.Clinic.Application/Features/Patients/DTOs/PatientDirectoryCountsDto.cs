namespace ClinicEz.Clinic.Application.Features.Patients.DTOs;

public sealed record PatientDirectoryCountsDto(
    int All,
    int Students,
    int Employees,
    int Alerts,
    int SeniorPwd);
