using System;
using ClinicEz.Clinic.Domain.Enums;

namespace ClinicEz.Clinic.Application.Features.Procedures.DTOs;

public record ClinicalProcedureDto(
    Guid Id,
    string TenantId,
    Guid ClinicId,
    Guid PatientId,
    string PatientName,
    Guid? QueueItemId,
    Guid? ConsultationId,
    string? ProcedureCode,
    string ProcedureName,
    string Category,
    Guid? OrderedByDoctorId,
    string? OrderedByDoctorName,
    Guid? PerformedByStaffId,
    string? PerformedByStaffName,
    DateTime? PerformedAt,
    DateTime ScheduledAt,
    ProcedureStatus Status,
    string? PreProcedureVitalsJson,
    string? PostProcedureVitalsJson,
    string? MedicationAdministered,
    string? LotNumber,
    DateTime? ExpirationDate,
    string? SiteRoute,
    string? ClinicalNotes,
    string? Complications,
    Guid? TargetRoomId = null,
    string? TargetRoomName = null
);

public record OrderProcedureRequest(
    Guid PatientId,
    string PatientName,
    Guid? QueueItemId,
    Guid? ConsultationId,
    string? ProcedureCode,
    string ProcedureName,
    string Category,
    Guid? OrderedByDoctorId,
    string? OrderedByDoctorName,
    string? ClinicalNotes,
    Guid? TargetRoomId = null,
    string? TargetRoomName = null
);

public record RecordProcedureExecutionRequest(
    Guid? PerformedByStaffId,
    string? PerformedByStaffName,
    string? PreProcedureVitalsJson,
    string? PostProcedureVitalsJson,
    string? MedicationAdministered,
    string? LotNumber,
    DateTime? ExpirationDate,
    string? SiteRoute,
    string? ClinicalNotes,
    string? Complications
);
