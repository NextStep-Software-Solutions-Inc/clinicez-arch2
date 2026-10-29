using System;
using System.Threading;
using System.Threading.RateLimiting;
using System.Threading.Tasks;
using Microsoft.Extensions.Logging;

namespace ClinicEz.PhilHealthProxy.Infrastructure.Services;

public interface IPhilHealthRateLimiter
{
    ValueTask<RateLimitLease> AcquireAsync(Guid tenantId, string accreNo, CancellationToken cancellationToken = default);
}

public sealed class PhilHealthRateLimiter : IPhilHealthRateLimiter, IAsyncDisposable
{
    private readonly PartitionedRateLimiter<string> _partitionedLimiter;
    private readonly ILogger<PhilHealthRateLimiter> _logger;

    public PhilHealthRateLimiter(ILogger<PhilHealthRateLimiter> logger)
    {
        _logger = logger;
        _partitionedLimiter = PartitionedRateLimiter.Create<string, string>(partitionKey =>
        {
            return RateLimitPartition.GetTokenBucketLimiter(
                partitionKey,
                _ => new TokenBucketRateLimiterOptions
                {
                    TokenLimit = 20,                // Up to 20 requests burst
                    TokensPerPeriod = 10,           // Replenish 10 permits per second
                    ReplenishmentPeriod = TimeSpan.FromSeconds(1),
                    QueueLimit = 100,               // Queue up to 100 requests per facility
                    QueueProcessingOrder = QueueProcessingOrder.OldestFirst
                });
        });
    }

    public async ValueTask<RateLimitLease> AcquireAsync(Guid tenantId, string accreNo, CancellationToken cancellationToken = default)
    {
        var partitionKey = $"{tenantId}_{accreNo.Trim()}";
        var lease = await _partitionedLimiter.AcquireAsync(partitionKey, 1, cancellationToken);
        if (!lease.IsAcquired)
        {
            _logger.LogWarning("[RateLimiter] Rate limit exceeded for Facility {PartitionKey}", partitionKey);
        }
        return lease;
    }

    public ValueTask DisposeAsync() => _partitionedLimiter.DisposeAsync();
}
