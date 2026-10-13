using System;
using System.Collections.Concurrent;
using System.Collections.Generic;
using System.Linq;
using System.Threading;
using System.Threading.Tasks;
using ClinicEz.Clinic.Application.Common.Interfaces;
using ClinicEz.Clinic.Domain.Entities;
using ClinicEz.Clinic.Infrastructure.Persistence;
using Microsoft.EntityFrameworkCore;
using Microsoft.Extensions.Logging;

namespace ClinicEz.Clinic.Infrastructure.Services;

public sealed class PatientCodeGenerator : IPatientCodeGenerator
{
    private static readonly ConcurrentDictionary<string, SemaphoreSlim> _semaphores = new();
    private readonly ApplicationDbContext _dbContext;
    private readonly ILogger<PatientCodeGenerator>? _logger;

    public PatientCodeGenerator(
        ApplicationDbContext dbContext,
        ILogger<PatientCodeGenerator>? logger = null)
    {
        _dbContext = dbContext ?? throw new ArgumentNullException(nameof(dbContext));
        _logger = logger;
    }

    public async Task<string> GenerateNextCodeAsync(
        string tenantId,
        Guid clinicId,
        int? year = null,
        CancellationToken ct = default)
    {
        var reservation = await ReserveRangeAsync(tenantId, clinicId, 1, year, ct);
        return reservation.PatientCodes[0];
    }

    public async Task<PatientCodeReservation> ReserveNextAsync(
        string tenantId,
        Guid clinicId,
        int? year = null,
        CancellationToken ct = default)
    {
        var reservation = await ReserveRangeAsync(tenantId, clinicId, 1, year, ct);
        return new PatientCodeReservation(reservation.StartSequence, reservation.PatientCodes[0]);
    }

    public async Task<IReadOnlyList<string>> ReserveBatchCodesAsync(
        string tenantId,
        Guid clinicId,
        int count,
        int? year = null,
        CancellationToken ct = default)
    {
        var reservation = await ReserveRangeAsync(tenantId, clinicId, count, year, ct);
        return reservation.PatientCodes;
    }

    public bool BypassSemaphore { get; set; } = false;

    public async Task<PatientCodeRangeReservation> ReserveRangeAsync(
        string tenantId,
        Guid clinicId,
        int count,
        int? year = null,
        CancellationToken ct = default)
    {
        if (string.IsNullOrWhiteSpace(tenantId))
        {
            throw new ArgumentException("TenantId cannot be null or whitespace.", nameof(tenantId));
        }

        if (clinicId == Guid.Empty)
        {
            throw new ArgumentException("ClinicId cannot be empty.", nameof(clinicId));
        }

        if (year.HasValue && year.Value <= 0)
        {
            throw new ArgumentOutOfRangeException(nameof(year), "Year must be a positive integer.");
        }

        if (count < 0)
        {
            throw new ArgumentOutOfRangeException(nameof(count), "Count cannot be negative.");
        }

        if (count == 0)
        {
            return new PatientCodeRangeReservation(0, 0, Array.Empty<string>());
        }

        var targetYear = year ?? DateTime.UtcNow.Year;
        var prefix = $"PAT-{targetYear}-";
        var lockKey = $"{tenantId}:{clinicId}:{targetYear}";
        var semaphore = _semaphores.GetOrAdd(lockKey, _ => new SemaphoreSlim(1, 1));

        if (!BypassSemaphore)
        {
            await semaphore.WaitAsync(ct);
        }

        try
        {
            const int maxAttempts = 15;
            for (var attempt = 1; attempt <= maxAttempts; attempt++)
            {
                PatientCodeSequenceTracker? tracker = null;
                try
                {
                    // 1. Query tracker entity (check Local on attempt 1, query DB on retries)
                    tracker = (attempt == 1
                        ? _dbContext.PatientCodeSequenceTrackers.Local
                            .FirstOrDefault(t =>
                                t.TenantId == tenantId &&
                                t.ClinicId == clinicId &&
                                t.Year == targetYear)
                        : null)
                        ?? await _dbContext.PatientCodeSequenceTrackers
                            .IgnoreQueryFilters()
                            .FirstOrDefaultAsync(t =>
                                t.TenantId == tenantId &&
                                t.ClinicId == clinicId &&
                                t.Year == targetYear, ct);

                    if (tracker == null)
                    {
                        // Smooth initial bootstrap from pre-existing maximum numeric patient codes
                        var existingCodes = await _dbContext.Patients
                            .IgnoreQueryFilters()
                            .Where(p => p.TenantId == tenantId && p.ClinicId == clinicId && p.PatientCode != null && p.PatientCode.StartsWith(prefix))
                            .Select(p => p.PatientCode)
                            .ToListAsync(ct);

                        var localCodes = _dbContext.Patients.Local
                            .Where(p => p.TenantId == tenantId && p.ClinicId == clinicId && p.PatientCode != null && p.PatientCode.StartsWith(prefix))
                            .Select(p => p.PatientCode)
                            .ToList();

                        var allKnownCodes = existingCodes.Concat(localCodes).Distinct();

                        var maxSeq = 0;
                        foreach (var code in allKnownCodes)
                        {
                            if (!string.IsNullOrEmpty(code) && code.Length > prefix.Length)
                            {
                                var suffix = code[prefix.Length..];
                                if (int.TryParse(suffix, out var parsed) && parsed > 0 && parsed > maxSeq)
                                {
                                    maxSeq = parsed;
                                }
                            }
                        }

                        var startSeq = maxSeq + 1;
                        var endSeq = maxSeq + count;

                        tracker = new PatientCodeSequenceTracker
                        {
                            Id = Guid.NewGuid(),
                            TenantId = tenantId,
                            ClinicId = clinicId,
                            Year = targetYear,
                            CurrentSequence = endSeq,
                            LastAssignedAt = DateTime.UtcNow,
                            CreatedAt = DateTime.UtcNow,
                            CreatedBy = "System:SequenceGenerator"
                        };

                        _dbContext.PatientCodeSequenceTrackers.Add(tracker);
                        await SaveTrackerOnlyAsync(ct);

                        var codes = new List<string>(count);
                        for (var seq = startSeq; seq <= endSeq; seq++)
                        {
                            codes.Add($"{prefix}{seq:D5}");
                        }

                        return new PatientCodeRangeReservation(startSeq, endSeq, codes);
                    }
                    else
                    {
                        // 2. Continuous range allocation on existing tracker
                        var startSeq = tracker.CurrentSequence + 1;
                        var endSeq = tracker.CurrentSequence + count;

                        tracker.CurrentSequence = endSeq;
                        tracker.LastAssignedAt = DateTime.UtcNow;
                        tracker.UpdatedAt = DateTime.UtcNow;

                        await SaveTrackerOnlyAsync(ct);

                        var codes = new List<string>(count);
                        for (var seq = startSeq; seq <= endSeq; seq++)
                        {
                            codes.Add($"{prefix}{seq:D5}");
                        }

                        return new PatientCodeRangeReservation(startSeq, endSeq, codes);
                    }
                }
                catch (DbUpdateConcurrencyException ex)
                {
                    if (tracker != null)
                    {
                        _dbContext.Entry(tracker).State = EntityState.Detached;
                    }
                    if (attempt >= maxAttempts)
                    {
                        throw new InvalidOperationException($"Failed to allocate patient code sequence after {maxAttempts} attempts.", ex);
                    }
                    var jitter = Random.Shared.Next(10, 35);
                    await Task.Delay(jitter * attempt, ct);
                }
                catch (DbUpdateException ex)
                {
                    if (tracker != null)
                    {
                        _dbContext.Entry(tracker).State = EntityState.Detached;
                    }
                    if (attempt >= maxAttempts)
                    {
                        throw new InvalidOperationException($"Failed to allocate patient code sequence after {maxAttempts} attempts.", ex);
                    }
                    var jitter = Random.Shared.Next(10, 35);
                    await Task.Delay(jitter * attempt, ct);
                }
            }

            throw new InvalidOperationException($"Failed to allocate patient code sequence after {maxAttempts} attempts.");
        }
        finally
        {
            if (!BypassSemaphore)
            {
                semaphore.Release();
            }
        }
    }

    private async Task SaveTrackerOnlyAsync(CancellationToken ct)
    {
        var nonTrackerEntries = _dbContext.ChangeTracker.Entries()
            .Where(e => e.Entity is not PatientCodeSequenceTracker && e.State != EntityState.Unchanged && e.State != EntityState.Detached)
            .Select(e => (Entry: e, OriginalState: e.State))
            .ToList();

        foreach (var (entry, _) in nonTrackerEntries)
        {
            entry.State = EntityState.Unchanged;
        }

        try
        {
            await _dbContext.SaveChangesAsync(ct);
        }
        finally
        {
            foreach (var (entry, originalState) in nonTrackerEntries)
            {
                entry.State = originalState;
            }
        }
    }
}
