using System.Collections.Concurrent;
using System.Text.Json;
using System.Threading;
using System.Threading.Tasks;
using Microsoft.EntityFrameworkCore;
using Microsoft.Extensions.Configuration;
using Microsoft.Extensions.DependencyInjection;
using Microsoft.Extensions.Logging;

namespace ClinicEz.Shared.Workspace;

/// <summary>
/// A service's own copy of the workspace profiles it has received (one row per tenant). A service normally uses the shared
/// <see cref="EfWorkspaceProfileStore{TDbContext}"/>; implement this only to keep the profile somewhere else.
/// </summary>
public interface IWorkspaceProfileStore
{
    /// <summary>The held profile for a tenant id or slug (case-insensitive), or null.</summary>
    Task<WorkspaceProfile?> GetAsync(string tenantIdentifier, CancellationToken ct);

    /// <summary>
    /// Stores <paramref name="profile"/> for the tenant and COMMITS it before returning, but only when its
    /// <see cref="WorkspaceProfile.Version"/> is greater than the held one. Returns false (and changes nothing) for an equal or
    /// older version, which makes redelivery and out-of-order delivery harmless.
    /// </summary>
    Task<bool> UpsertAsync(string tenantId, WorkspaceProfile profile, CancellationToken ct);
}

/// <summary>Persisted copy of a workspace profile. The profile itself is one JSON column so adding a field needs no migration.</summary>
public class WorkspaceProfileRecord
{
    public string TenantId { get; set; } = string.Empty;
    public string TenantSlug { get; set; } = string.Empty;
    public long Version { get; set; }
    public string ProfileJson { get; set; } = string.Empty;
    public DateTime UpdatedAtUtc { get; set; } = DateTime.UtcNow;
}

/// <summary>Implemented by a service's <c>ApplicationDbContext</c> to host <see cref="WorkspaceProfileRecord"/>.</summary>
public interface IWorkspaceProfileDbContext
{
    DbSet<WorkspaceProfileRecord> WorkspaceProfiles { get; }
    Task<int> SaveChangesAsync(CancellationToken cancellationToken = default);
}

public static class WorkspaceProfileModelBuilderExtensions
{
    /// <summary>Call from <c>OnModelCreating</c>: maps the <c>workspace_profiles</c> table.</summary>
    public static ModelBuilder ApplyWorkspaceProfileModel(this ModelBuilder modelBuilder)
    {
        modelBuilder.Entity<WorkspaceProfileRecord>(b =>
        {
            b.ToTable("workspace_profiles");
            b.HasKey(x => x.TenantId);
            b.Property(x => x.TenantId).HasMaxLength(64);
            b.Property(x => x.TenantSlug).HasMaxLength(128).IsRequired();
            b.Property(x => x.ProfileJson).IsRequired();
            b.HasIndex(x => x.TenantSlug);
        });

        return modelBuilder;
    }
}

/// <summary>
/// EF-backed <see cref="IWorkspaceProfileStore"/>. The table has no tenant query filter on purpose: the interop handler writes
/// without a request scope, and every read names its tenant explicitly.
/// </summary>
public sealed class EfWorkspaceProfileStore<TDbContext> : IWorkspaceProfileStore
    where TDbContext : DbContext, IWorkspaceProfileDbContext
{
    private static readonly JsonSerializerOptions Json = new(JsonSerializerDefaults.Web);

    private readonly TDbContext _db;

    public EfWorkspaceProfileStore(TDbContext db) => _db = db;

    public async Task<WorkspaceProfile?> GetAsync(string tenantIdentifier, CancellationToken ct)
    {
        if (string.IsNullOrWhiteSpace(tenantIdentifier)) return null;
        var key = tenantIdentifier.Trim();
        var lower = key.ToLowerInvariant();

        var json = await _db.WorkspaceProfiles
            .AsNoTracking()
            .Where(x => x.TenantId == key || x.TenantSlug.ToLower() == lower)
            .Select(x => x.ProfileJson)
            .FirstOrDefaultAsync(ct);

        return json is null ? null : JsonSerializer.Deserialize<WorkspaceProfile>(json, Json);
    }

    public async Task<bool> UpsertAsync(string tenantId, WorkspaceProfile profile, CancellationToken ct)
    {
        ArgumentException.ThrowIfNullOrWhiteSpace(tenantId);
        ArgumentNullException.ThrowIfNull(profile);

        var json = JsonSerializer.Serialize(profile, Json);

        // Two attempts: the second one covers a concurrent first insert for the same tenant by another instance.
        for (var attempt = 0; attempt < 2; attempt++)
        {
            var row = await _db.WorkspaceProfiles.FirstOrDefaultAsync(x => x.TenantId == tenantId, ct);

            if (row is null)
            {
                row = new WorkspaceProfileRecord
                {
                    TenantId = tenantId,
                    TenantSlug = profile.TenantSlug,
                    Version = profile.Version,
                    ProfileJson = json,
                    UpdatedAtUtc = DateTime.UtcNow
                };
                _db.WorkspaceProfiles.Add(row);
                try
                {
                    await _db.SaveChangesAsync(ct);
                    return true;
                }
                catch (DbUpdateException) when (attempt == 0)
                {
                    _db.Entry(row).State = EntityState.Detached;
                    continue;
                }
            }

            if (row.Version >= profile.Version) return false;

            row.TenantSlug = profile.TenantSlug;
            row.Version = profile.Version;
            row.ProfileJson = json;
            row.UpdatedAtUtc = DateTime.UtcNow;
            await _db.SaveChangesAsync(ct);
            return true;
        }

        return false;
    }
}

/// <summary>
/// <see cref="IWorkspaceProfileProvider"/> over the service's <see cref="IWorkspaceProfileStore"/>, with a short in-memory cache
/// (<c>WorkspaceProfile:CacheSeconds</c>, default 60; unknown tenants are re-checked after 15 seconds) so other instances
/// converge soon after one of them stored a new version. Never throws; on a store failure it serves the last copy it had.
/// </summary>
public sealed class StoreBackedWorkspaceProfileProvider : IWorkspaceProfileProvider
{
    private sealed record Entry(WorkspaceProfile? Profile, DateTimeOffset ExpiresAt);

    private static readonly TimeSpan MissingFor = TimeSpan.FromSeconds(15);

    private readonly IServiceScopeFactory _scopes;
    private readonly IConfiguration _configuration;
    private readonly ILogger<StoreBackedWorkspaceProfileProvider> _logger;
    private readonly TimeProvider _time;
    private readonly ConcurrentDictionary<string, Entry> _cache = new(StringComparer.OrdinalIgnoreCase);

    public StoreBackedWorkspaceProfileProvider(
        IServiceScopeFactory scopes,
        IConfiguration configuration,
        ILogger<StoreBackedWorkspaceProfileProvider> logger,
        TimeProvider? time = null)
    {
        _scopes = scopes;
        _configuration = configuration;
        _logger = logger;
        _time = time ?? TimeProvider.System;
    }

    private TimeSpan FreshFor => TimeSpan.FromSeconds(Math.Max(1, _configuration.GetValue("WorkspaceProfile:CacheSeconds", 60)));

    public void Invalidate(string tenantIdentifier)
    {
        if (string.IsNullOrWhiteSpace(tenantIdentifier)) return;
        _cache.TryRemove(tenantIdentifier.Trim(), out _);
    }

    public WorkspaceProfile? TryGetCached(string tenantIdentifier) =>
        GetAsync(tenantIdentifier).GetAwaiter().GetResult();

    public async Task<WorkspaceProfile?> GetAsync(string tenantIdentifier, CancellationToken ct = default)
    {
        if (string.IsNullOrWhiteSpace(tenantIdentifier)) return null;
        var key = tenantIdentifier.Trim();

        _cache.TryGetValue(key, out var known);
        if (known is not null && known.ExpiresAt > _time.GetUtcNow()) return known.Profile;

        try
        {
            await using var scope = _scopes.CreateAsyncScope();
            var store = scope.ServiceProvider.GetRequiredService<IWorkspaceProfileStore>();
            var profile = await store.GetAsync(key, ct);
            _cache[key] = new Entry(profile, _time.GetUtcNow() + (profile is null ? MissingFor : FreshFor));
            return profile;
        }
        catch (Exception ex) when (ex is not OperationCanceledException || !ct.IsCancellationRequested)
        {
            _logger.LogWarning(ex, "[WorkspaceProfile] Could not read the profile of '{Tenant}'; using the last copy: {HasCopy}", key, known?.Profile is not null);
            return known?.Profile;
        }
    }
}
