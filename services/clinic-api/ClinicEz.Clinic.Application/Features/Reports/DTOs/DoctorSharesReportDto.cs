using System;
using System.Collections.Generic;

namespace ClinicEz.Clinic.Application.Features.Reports.DTOs;

public record DoctorWorkloadDetailDto(
    string DoctorId,
    string DoctorName,
    int TotalEncounters,
    int TotalProceduresAssisted,
    decimal TotalConsultationGross,
    decimal TotalProcedureGross,
    decimal TotalGrossGenerated,
    decimal EstimatedPhysicianShare,
    decimal ClinicFacilityShare
);

public record DoctorSharesReportDto(
    DateTime StartDate,
    DateTime EndDate,
    string TenantId,
    Guid ClinicId,
    int TotalClinicEncounters,
    decimal TotalClinicGrossRevenue,
    decimal TotalPhysicianShares,
    decimal TotalFacilityShares,
    List<DoctorWorkloadDetailDto> DoctorShares
);
