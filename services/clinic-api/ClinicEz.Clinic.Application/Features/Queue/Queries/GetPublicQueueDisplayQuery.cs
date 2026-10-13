using System;
using System.Collections.Generic;
using System.Linq;
using System.Threading;
using System.Threading.Tasks;
using ClinicEz.Clinic.Application.Features.Queue.DTOs;
using ClinicEz.Clinic.Domain.Entities;
using ClinicEz.Clinic.Domain.Enums;
using ClinicEz.Clinic.Domain.Interfaces;
using MediatR;
using Microsoft.EntityFrameworkCore;

namespace ClinicEz.Clinic.Application.Features.Queue.Queries;

public sealed record GetPublicQueueDisplayQuery(
    Guid? ClinicId = null,
    string? TenantSlug = null,
    string? FacilitySlug = null,
    DateOnly? Date = null
) : IRequest<PublicQueueDisplayDto?>;

public sealed class GetPublicQueueDisplayQueryHandler : IRequestHandler<GetPublicQueueDisplayQuery, PublicQueueDisplayDto?>
{
    private readonly IRepository<QueueItem> _queueRepo;
    private readonly IRepository<ClinicSettings> _settingsRepo;
    private readonly IClinicContext _clinicContext;

    public GetPublicQueueDisplayQueryHandler(
        IRepository<QueueItem> queueRepo,
        IRepository<ClinicSettings> settingsRepo,
        IClinicContext clinicContext)
    {
        _queueRepo = queueRepo;
        _settingsRepo = settingsRepo;
        _clinicContext = clinicContext;
    }

    public async Task<PublicQueueDisplayDto?> Handle(GetPublicQueueDisplayQuery request, CancellationToken ct)
    {
        // 1. Resolve clinic settings without requiring ambient authentication
        ClinicSettings? clinic = null;

        if (request.ClinicId.HasValue && request.ClinicId.Value != Guid.Empty)
        {
            clinic = await _settingsRepo.IgnoreQueryFilters()
                .AsNoTracking()
                .FirstOrDefaultAsync(s => !s.IsDeleted && s.ClinicId == request.ClinicId.Value, ct);
        }

        if (clinic == null && !string.IsNullOrWhiteSpace(request.FacilitySlug))
        {
            var facSlug = request.FacilitySlug.Trim().ToLowerInvariant();
            var settingsQuery = _settingsRepo.IgnoreQueryFilters().AsNoTracking().Where(s => !s.IsDeleted);

            if (!string.IsNullOrWhiteSpace(request.TenantSlug))
            {
                var tenSlug = request.TenantSlug.Trim().ToLowerInvariant();
                clinic = await settingsQuery.FirstOrDefaultAsync(s =>
                    ((s.TenantSlug != null && s.TenantSlug.ToLower() == tenSlug) || s.TenantId.ToLower() == tenSlug) &&
                    ((s.FacilitySlug != null && s.FacilitySlug.ToLower() == facSlug) || s.ClinicId.ToString().ToLower() == facSlug), ct);
            }

            clinic ??= await settingsQuery.FirstOrDefaultAsync(s =>
                (s.FacilitySlug != null && s.FacilitySlug.ToLower() == facSlug) ||
                s.ClinicId.ToString().ToLower() == facSlug, ct);
        }

        if (clinic == null && !string.IsNullOrWhiteSpace(request.TenantSlug))
        {
            var tenSlug = request.TenantSlug.Trim().ToLowerInvariant();
            clinic = await _settingsRepo.IgnoreQueryFilters()
                .AsNoTracking()
                .FirstOrDefaultAsync(s => !s.IsDeleted &&
                    ((s.TenantSlug != null && s.TenantSlug.ToLower() == tenSlug) || s.TenantId.ToLower() == tenSlug), ct);
        }

        // Ambient clinic context fallback
        if (clinic == null && _clinicContext.ClinicId != Guid.Empty && _clinicContext.ClinicId != new Guid("00000000-0000-0000-0000-00000000dead"))
        {
            clinic = await _settingsRepo.IgnoreQueryFilters()
                .AsNoTracking()
                .FirstOrDefaultAsync(s => !s.IsDeleted && s.ClinicId == _clinicContext.ClinicId, ct);
        }

        // Single clinic default fallback
        clinic ??= await _settingsRepo.IgnoreQueryFilters()
            .AsNoTracking()
            .FirstOrDefaultAsync(s => !s.IsDeleted, ct);

        if (clinic == null)
        {
            return null;
        }

        var targetDate = request.Date ?? DateOnly.FromDateTime(DateTime.UtcNow);

        // 2. Fetch queue items for this clinic on the target date
        var queueItems = await _queueRepo.IgnoreQueryFilters()
            .AsNoTracking()
            .Where(q => !q.IsDeleted && q.ClinicId == clinic.ClinicId && q.QueueDate == targetDate)
            .OrderByDescending(q => q.Priority)
            .ThenBy(q => q.SequenceNumber)
            .ToListAsync(ct);

        // 3. Now Serving: active serving tickets (InConsultation)
        var nowServing = queueItems
            .Where(q => q.Status == QueueStatus.InConsultation)
            .OrderByDescending(q => q.CalledTime ?? DateTime.MinValue)
            .ThenBy(q => q.SequenceNumber)
            .Select(q => new ServingTicketDto(
                QueueItemId: q.Id,
                TicketNumber: q.QueueNumber,
                DoctorName: q.DoctorName,
                RoomOrStation: q.RoomOrStation,
                CalledTime: q.CalledTime,
                Status: q.Status.ToString()
            ))
            .ToList();

        // 4. Up Next: upcoming tickets (Waiting, Triaged, OnHold, PendingProcedure, ReEvaluation)
        var mask = clinic.TvDisplayMaskPatientNames;
        var upNext = queueItems
            .Where(q => q.Status == QueueStatus.Waiting ||
                        q.Status == QueueStatus.Triaged ||
                        q.Status == QueueStatus.OnHold ||
                        q.Status == QueueStatus.PendingProcedure ||
                        q.Status == QueueStatus.ReEvaluation)
            .OrderByDescending(q => q.Priority)
            .ThenBy(q => q.SequenceNumber)
            .Select(q => new UpcomingTicketDto(
                QueueItemId: q.Id,
                TicketNumber: q.QueueNumber,
                DisplayName: mask ? MaskPatientName(q.PatientName) : q.PatientName,
                Priority: q.Priority.ToString(),
                Status: q.Status.ToString(),
                SequenceNumber: q.SequenceNumber,
                CheckInTime: q.CheckInTime
            ))
            .ToList();

        return new PublicQueueDisplayDto(
            ClinicId: clinic.ClinicId,
            ClinicName: clinic.ClinicName,
            TenantSlug: clinic.TenantSlug ?? clinic.TenantId,
            FacilitySlug: clinic.FacilitySlug ?? "main",
            NowServing: nowServing,
            UpNext: upNext,
            MaskPatientNames: mask,
            GeneratedAtUtc: DateTime.UtcNow,
            PatientsWaitingCount: upNext.Count
        );
    }

    /// <summary>
    /// Masks a patient's name for public lobby TV displays per Philippine Data Privacy Act (RA 10173).
    /// Examples:
    ///   "Cassandra Alcantara" -> "Cassandra A."
    ///   "Juan Dela Cruz" -> "Juan C."
    ///   "Maria Clara Santos" -> "Maria S."
    ///   "Santos, Maria" -> "Maria S."
    ///   "Cher" -> "C."
    /// </summary>
    public static string MaskPatientName(string? fullName)
    {
        if (string.IsNullOrWhiteSpace(fullName))
            return string.Empty;

        var trimmed = fullName.Trim();

        // Handle "LastName, FirstName"
        if (trimmed.Contains(','))
        {
            var parts = trimmed.Split(',', 2, StringSplitOptions.RemoveEmptyEntries | StringSplitOptions.TrimEntries);
            var lastName = parts[0];
            var firstName = parts.Length > 1 ? parts[1] : string.Empty;

            if (string.IsNullOrWhiteSpace(firstName))
                return lastName.Length > 0 ? $"{char.ToUpperInvariant(lastName[0])}." : string.Empty;

            var firstWord = firstName.Split(' ', StringSplitOptions.RemoveEmptyEntries)[0];
            var lastInitial = char.ToUpperInvariant(lastName[0]);
            return $"{firstWord} {lastInitial}.";
        }

        var tokens = trimmed.Split(' ', StringSplitOptions.RemoveEmptyEntries);
        if (tokens.Length == 0)
            return string.Empty;

        if (tokens.Length == 1)
            return tokens[0].Length > 0 ? $"{char.ToUpperInvariant(tokens[0][0])}." : string.Empty;

        var first = tokens[0];
        var lastToken = tokens[^1];
        var lastInitialChar = char.ToUpperInvariant(lastToken[0]);
        return $"{first} {lastInitialChar}.";
    }
}
