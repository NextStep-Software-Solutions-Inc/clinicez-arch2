using System.Text.Json;
using ClinicEz.Patient.Application.Common.Interfaces;
using StackExchange.Redis;

namespace ClinicEz.Patient.Infrastructure.Services.Session;

public sealed class RedisSessionService : ISessionService
{
    private readonly IConnectionMultiplexer _redis;
    private const string KeyPrefix = "patientapp:session:";

    public RedisSessionService(IConnectionMultiplexer redis) => _redis = redis;

    public async Task SetSessionAsync(
        Guid patientId,
        string deviceId,
        string deviceLabel,
        string clerkSessionId,
        TimeSpan expiry,
        CancellationToken cancellationToken = default)
    {
        var db = _redis.GetDatabase();
        var key = BuildKey(patientId);

        var session = new ActiveSession(deviceId, deviceLabel, clerkSessionId, DateTime.UtcNow);
        var json = JsonSerializer.Serialize(session);

        await db.StringSetAsync(key, json, expiry);
    }

    public async Task<ActiveSession?> GetSessionAsync(
        Guid patientId,
        CancellationToken cancellationToken = default)
    {
        var db = _redis.GetDatabase();
        var value = await db.StringGetAsync(BuildKey(patientId));

        return value.HasValue
            ? JsonSerializer.Deserialize<ActiveSession>(value.ToString())
            : null;
    }

    public async Task<bool> IsSessionValidAsync(
        Guid patientId,
        string deviceId,
        string clerkSessionId,
        CancellationToken cancellationToken = default)
    {
        var session = await GetSessionAsync(patientId, cancellationToken);

        return session is not null
            && session.DeviceId == deviceId
            && session.ClerkSessionId == clerkSessionId;
    }

    public async Task RevokeSessionAsync(
        Guid patientId,
        CancellationToken cancellationToken = default)
    {
        var db = _redis.GetDatabase();
        await db.KeyDeleteAsync(BuildKey(patientId));
    }

    private static string BuildKey(Guid patientId) => $"{KeyPrefix}{patientId}";
}
