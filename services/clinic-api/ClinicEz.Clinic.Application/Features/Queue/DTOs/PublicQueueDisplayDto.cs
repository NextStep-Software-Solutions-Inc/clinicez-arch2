using System;
using System.Collections.Generic;

namespace ClinicEz.Clinic.Application.Features.Queue.DTOs;

public sealed record ServingTicketDto(
    Guid QueueItemId,
    string TicketNumber,
    string? DoctorName,
    string? RoomOrStation,
    DateTime? CalledTime,
    string Status = "InConsultation"
);

public sealed record UpcomingTicketDto(
    Guid QueueItemId,
    string TicketNumber,
    string DisplayName,
    string Priority,
    string Status,
    int SequenceNumber,
    DateTime CheckInTime
);

public sealed record PublicQueueDisplayDto(
    Guid ClinicId,
    string ClinicName,
    string? TenantSlug,
    string? FacilitySlug,
    IReadOnlyList<ServingTicketDto> NowServing,
    IReadOnlyList<UpcomingTicketDto> UpNext,
    bool MaskPatientNames,
    DateTime GeneratedAtUtc,
    int PatientsWaitingCount,
    string? LogoUrl = null
);
