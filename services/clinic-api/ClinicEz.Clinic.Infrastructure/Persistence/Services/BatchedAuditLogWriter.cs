namespace ClinicEz.Clinic.Infrastructure.Persistence.Services;

using System;
using System.Collections.Generic;
using System.Linq;
using System.Threading;
using System.Threading.Tasks;
using ClinicEz.Clinic.Domain.Entities;
using ClinicEz.Clinic.Infrastructure.Persistence;
using Microsoft.Extensions.Logging;

public interface IBatchedAuditLogWriter
{
    Task<int> WriteBatchAsync(IEnumerable<AuditEntry> entries, int batchSize = 100, CancellationToken ct = default);
}

public sealed class BatchedAuditLogWriter : IBatchedAuditLogWriter
{
    private readonly ApplicationDbContext _dbContext;
    private readonly ILogger<BatchedAuditLogWriter> _logger;

    public BatchedAuditLogWriter(ApplicationDbContext dbContext, ILogger<BatchedAuditLogWriter> logger)
    {
        _dbContext = dbContext;
        _logger = logger;
    }

    public async Task<int> WriteBatchAsync(IEnumerable<AuditEntry> entries, int batchSize = 100, CancellationToken ct = default)
    {
        if (entries == null) return 0;
        var entryList = entries as IReadOnlyList<AuditEntry> ?? entries.ToList();
        if (entryList.Count == 0) return 0;

        var totalPersisted = 0;
        var effectiveBatchSize = Math.Max(1, batchSize);
        var chunks = entryList.Chunk(effectiveBatchSize);

        foreach (var chunk in chunks)
        {
            ct.ThrowIfCancellationRequested();
            await _dbContext.AuditEntries.AddRangeAsync(chunk, ct);
            await _dbContext.SaveChangesAsync(ct);
            totalPersisted += chunk.Length;
        }

        _logger.LogInformation("BatchedAuditLogWriter successfully persisted {Count} audit entries in chunks of {BatchSize}.", totalPersisted, effectiveBatchSize);
        return totalPersisted;
    }
}
