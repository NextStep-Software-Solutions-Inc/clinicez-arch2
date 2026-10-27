using System;
using System.Threading;
using System.Threading.Tasks;
using ClinicEz.Clinic.Application.Features.TeleconsultRecordings.DTOs;
using ClinicEz.Clinic.Domain.Constants;
using ClinicEz.Clinic.Domain.Entities;
using ClinicEz.Clinic.Domain.Interfaces;
using ClinicEz.Shared.Exceptions;
using MediatR;
using Microsoft.EntityFrameworkCore;

namespace ClinicEz.Clinic.Application.Features.TeleconsultRecordings.Queries;

public sealed record GetConsultationRecordingQuery(Guid ConsultationId) : IRequest<RecordingSessionDto?>;

public sealed class GetConsultationRecordingQueryHandler : IRequestHandler<GetConsultationRecordingQuery, RecordingSessionDto?>
{
    private readonly IRepository<TeleconsultRecordingSession> _sessionRepo;
    private readonly IClinicContext _clinicContext;

    public GetConsultationRecordingQueryHandler(
        IRepository<TeleconsultRecordingSession> sessionRepo,
        IClinicContext clinicContext)
    {
        _sessionRepo = sessionRepo;
        _clinicContext = clinicContext;
    }

    public async Task<RecordingSessionDto?> Handle(GetConsultationRecordingQuery request, CancellationToken ct)
    {
        if (!_clinicContext.HasPermission(ClinicPermissions.ConsultationsRead))
        {
            throw new ForbiddenException("Caller lacks required consultations:read permission.");
        }

        var session = await _sessionRepo.Query()
            .FirstOrDefaultAsync(s => s.ConsultationId == request.ConsultationId && s.ClinicId == _clinicContext.ClinicId, ct);

        if (session == null) return null;

        return new RecordingSessionDto(
            session.Id,
            session.ClinicId,
            session.CallId,
            session.AppointmentId,
            session.ConsultationId,
            session.PatientId,
            session.PatientName,
            session.DoctorId,
            session.DoctorName,
            session.ConsentStatus,
            session.RecordingState,
            session.StoragePolicy,
            session.TotalDurationSeconds,
            session.SegmentCount,
            session.TotalSizeBytes,
            session.ContainerFormat,
            session.ManifestStorageKey,
            session.HasGaps,
            session.RetentionPolicyDays,
            session.ExpiresAtUtc,
            session.IsLegalHold,
            session.LegalHoldReason,
            session.IsPurged
        );
    }
}
