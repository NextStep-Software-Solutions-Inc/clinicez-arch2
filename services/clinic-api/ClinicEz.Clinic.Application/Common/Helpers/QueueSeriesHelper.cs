using System;
using System.Collections.Generic;
using System.Linq;
using System.Threading;
using System.Threading.Tasks;
using ClinicEz.Clinic.Domain.Entities;
using ClinicEz.Clinic.Domain.Interfaces;
using Microsoft.EntityFrameworkCore;

namespace ClinicEz.Clinic.Application.Common.Helpers;

public static class QueueSeriesHelper
{
    public static async Task<(int nextSequence, string queueNumber)> GetNextQueueSequenceAsync(
        IRepository<QueueItem> queueRepo,
        Guid clinicId,
        DateOnly queueDate,
        string seriesPrefix,
        CancellationToken ct = default)
    {
        return await GetNextQueueSequenceAsync(
            queueRepo.Query(q => q.ClinicId == clinicId && q.QueueDate == queueDate),
            seriesPrefix,
            ct);
    }

    public static async Task<(int nextSequence, string queueNumber)> GetNextQueueSequenceAsync(
        IQueryable<QueueItem> baseQuery,
        string seriesPrefix,
        CancellationToken ct = default)
    {
        var rawPrefix = string.IsNullOrWhiteSpace(seriesPrefix) ? "Q" : seriesPrefix.Trim().TrimEnd('-').ToUpperInvariant();
        var normalizedPrefix = string.IsNullOrWhiteSpace(rawPrefix) ? "Q" : rawPrefix;
        var seriesPattern = $"{normalizedPrefix}-";

        var matchingQueueNumbers = await baseQuery
            .Where(q => q.QueueNumber.StartsWith(seriesPattern))
            .Select(q => q.QueueNumber)
            .ToListAsync(ct);

        int maxSeriesSequence = 0;
        foreach (var qNum in matchingQueueNumbers)
        {
            if (qNum.StartsWith(seriesPattern, StringComparison.OrdinalIgnoreCase))
            {
                var suffix = qNum[seriesPattern.Length..];
                if (int.TryParse(suffix, out var parsedSeq) && parsedSeq > maxSeriesSequence)
                {
                    maxSeriesSequence = parsedSeq;
                }
            }
        }

        var nextSequence = maxSeriesSequence + 1;
        var queueNumber = $"{normalizedPrefix}-{nextSequence:D3}";
        return (nextSequence, queueNumber);
    }
}
