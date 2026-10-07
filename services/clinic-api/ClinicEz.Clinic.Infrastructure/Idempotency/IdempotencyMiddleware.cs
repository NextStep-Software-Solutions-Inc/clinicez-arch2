using System.Collections.Concurrent;
using System.Security.Claims;
using System.Security.Cryptography;
using System.Text;
using ClinicEz.Clinic.Domain.Entities;
using ClinicEz.Clinic.Infrastructure.Persistence;
using ClinicEz.Clinic.Infrastructure.Context;
using Microsoft.AspNetCore.Http;
using Microsoft.EntityFrameworkCore;
using Microsoft.Extensions.Hosting;
using Microsoft.Extensions.Logging;
using Microsoft.Extensions.DependencyInjection;

namespace ClinicEz.Clinic.Infrastructure.Idempotency;

/// <summary>
/// Makes POST/PUT/PATCH/DELETE safe to retry. When the request carries an <c>Idempotency-Key</c> header:
/// <list type="bullet">
///   <item>first time: the request runs and a successful (2xx) response is stored;</item>
///   <item>same key and same request again: the stored response is replayed (<c>Idempotency-Replayed: true</c>), nothing runs twice;</item>
///   <item>same key but a different request: 422, because the client reused a key.</item>
/// </list>
/// Requests without the header are untouched. The offline outbox on every device sends one key per queued item.
/// </summary>
public sealed class IdempotencyMiddleware
{
    public const string HeaderName = "Idempotency-Key";
    public const string ReplayHeaderName = "Idempotency-Replayed";
    public const int MaxKeyLength = 128;
    public const long MaxBufferedBodyBytes = 25 * 1024 * 1024;

    private static readonly ConcurrentDictionary<string, SemaphoreSlim> InFlight = new(StringComparer.Ordinal);

    private readonly RequestDelegate _next;

    public IdempotencyMiddleware(RequestDelegate next) => _next = next;

    public static bool IsMutating(string method) =>
        HttpMethods.IsPost(method) || HttpMethods.IsPut(method) || HttpMethods.IsPatch(method) || HttpMethods.IsDelete(method);

    public async Task InvokeAsync(HttpContext context, ApplicationDbContext db)
    {
        var request = context.Request;
        if (!IsMutating(request.Method) ||
            context.User.Identity?.IsAuthenticated != true ||
            !request.Headers.TryGetValue(HeaderName, out var rawKey))
        {
            await _next(context);
            return;
        }

        var key = rawKey.ToString().Trim();
        if (key.Length == 0 || key.Length > MaxKeyLength || key.Any(c => char.IsControl(c) || char.IsWhiteSpace(c)))
        {
            await Reject(context, StatusCodes.Status400BadRequest, "The Idempotency-Key must be 1-128 characters without spaces.");
            return;
        }

        if (request.ContentLength is > MaxBufferedBodyBytes)
        {
            // Too large to fingerprint safely; run it normally rather than fail a legitimate upload.
            await _next(context);
            return;
        }

        var scope = BuildScope(context.User);
        var hash = await FingerprintAsync(request);
        var gate = InFlight.GetOrAdd($"{scope}|{key}", _ => new SemaphoreSlim(1, 1));

        await gate.WaitAsync(context.RequestAborted);
        try
        {
            var existing = await db.Set<IdempotencyRecord>()
                .AsNoTracking()
                .FirstOrDefaultAsync(r => r.Scope == scope && r.Key == key, context.RequestAborted);

            if (existing is not null)
            {
                if (!string.Equals(existing.RequestHash, hash, StringComparison.Ordinal))
                {
                    await Reject(context, StatusCodes.Status422UnprocessableEntity,
                        "This Idempotency-Key was already used for a different request.");
                    return;
                }

                context.Response.StatusCode = existing.StatusCode;
                context.Response.Headers[ReplayHeaderName] = "true";
                if (!string.IsNullOrEmpty(existing.ContentType)) context.Response.ContentType = existing.ContentType;
                if (!string.IsNullOrEmpty(existing.ResponseBody)) await context.Response.WriteAsync(existing.ResponseBody, context.RequestAborted);
                return;
            }

            var original = context.Response.Body;
            await using var buffer = new MemoryStream();
            context.Response.Body = buffer;
            try
            {
                await _next(context);
            }
            finally
            {
                context.Response.Body = original;
            }

            buffer.Position = 0;
            var body = Encoding.UTF8.GetString(buffer.ToArray());
            buffer.Position = 0;
            await buffer.CopyToAsync(original, context.RequestAborted);

            // Only successful outcomes are remembered: a failed attempt may legitimately be retried and succeed.
            if (context.Response.StatusCode is >= 200 and < 300)
            {
                db.Set<IdempotencyRecord>().Add(new IdempotencyRecord
                {
                    Scope = scope,
                    Key = key,
                    Method = request.Method,
                    Path = request.Path.Value ?? string.Empty,
                    RequestHash = hash,
                    StatusCode = context.Response.StatusCode,
                    ContentType = context.Response.ContentType,
                    ResponseBody = body,
                });
                try
                {
                    await db.SaveChangesAsync(CancellationToken.None);
                }
                catch (DbUpdateException)
                {
                    // Another node stored the same key first; the response the client already has is still correct.
                }
            }
        }
        finally
        {
            gate.Release();
            if (gate.CurrentCount == 1) InFlight.TryRemove($"{scope}|{key}", out _);
        }
    }

    private static string BuildScope(ClaimsPrincipal user)
    {
        var clinic = user.FindFirst(ClinicClaimTypes.ClinicId)?.Value ?? "-";
        var subject = user.FindFirst(ClinicClaimTypes.Subject)?.Value ?? user.FindFirst(ClaimTypes.NameIdentifier)?.Value ?? user.Identity?.Name ?? "-";
        return $"{clinic}:{subject}";
    }

    private static async Task<string> FingerprintAsync(HttpRequest request)
    {
        request.EnableBuffering();
        using var sha = SHA256.Create();
        sha.TransformBlock(Encoding.UTF8.GetBytes($"{request.Method}\n{request.Path}{request.QueryString}\n"), 0,
            Encoding.UTF8.GetByteCount($"{request.Method}\n{request.Path}{request.QueryString}\n"), null, 0);

        var chunk = new byte[16 * 1024];
        int read;
        while ((read = await request.Body.ReadAsync(chunk)) > 0)
        {
            sha.TransformBlock(chunk, 0, read, null, 0);
        }
        sha.TransformFinalBlock([], 0, 0);
        request.Body.Position = 0;
        return Convert.ToHexString(sha.Hash!);
    }

    private static async Task Reject(HttpContext context, int status, string message)
    {
        context.Response.StatusCode = status;
        await context.Response.WriteAsJsonAsync(new { succeeded = false, message, errors = Array.Empty<string>() });
    }
}

/// <summary>Forgets stored idempotent responses after a week (clients retry within minutes or hours, not weeks).</summary>
public sealed class IdempotencyCleanupHostedService : BackgroundService
{
    public static readonly TimeSpan Retention = TimeSpan.FromDays(7);
    private static readonly TimeSpan Interval = TimeSpan.FromHours(6);

    private readonly IServiceProvider _services;
    private readonly ILogger<IdempotencyCleanupHostedService> _logger;

    public IdempotencyCleanupHostedService(IServiceProvider services, ILogger<IdempotencyCleanupHostedService> logger)
    {
        _services = services;
        _logger = logger;
    }

    protected override async Task ExecuteAsync(CancellationToken stoppingToken)
    {
        while (!stoppingToken.IsCancellationRequested)
        {
            try
            {
                using var scope = _services.CreateScope();
                var db = scope.ServiceProvider.GetRequiredService<ApplicationDbContext>();
                var cutoff = DateTime.UtcNow - Retention;
                var removed = await db.Set<IdempotencyRecord>()
                    .IgnoreQueryFilters()
                    .Where(r => r.CreatedAt < cutoff)
                    .ExecuteDeleteAsync(stoppingToken);
                if (removed > 0) _logger.LogInformation("Removed {Count} expired idempotency records.", removed);
            }
            catch (OperationCanceledException) when (stoppingToken.IsCancellationRequested)
            {
                return;
            }
            catch (Exception ex)
            {
                _logger.LogWarning(ex, "Idempotency cleanup failed; it will retry later.");
            }

            try
            {
                await Task.Delay(Interval, stoppingToken);
            }
            catch (OperationCanceledException)
            {
                return;
            }
        }
    }
}
