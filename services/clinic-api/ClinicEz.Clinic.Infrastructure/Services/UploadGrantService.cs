using System;
using System.Linq;
using System.Security.Cryptography;
using System.Text;
using System.Threading;
using System.Threading.Tasks;
using ClinicEz.Clinic.Application.Common;
using ClinicEz.Clinic.Application.Common.Interfaces;
using ClinicEz.Clinic.Domain.Entities;
using ClinicEz.Clinic.Infrastructure.Persistence;
using ClinicEz.Shared.Interoperability;
using Microsoft.EntityFrameworkCore;
using Microsoft.Extensions.Options;

namespace ClinicEz.Clinic.Infrastructure.Services;

public sealed class UploadGrantService : IUploadGrantService
{
    private const int SecretBytes = 16;

    private readonly ApplicationDbContext _db;
    private readonly ClinicUploadOptions _options;

    public UploadGrantService(ApplicationDbContext db, IOptions<ClinicUploadOptions> options)
    {
        _db = db;
        _options = options.Value;
    }

    public async Task<MintedUploadGrant> MintAsync(ClinicLabOrder order, UploaderKind kind, CancellationToken ct)
    {
        var portalUrl = RequirePortalBaseUrl();

        var now = DateTime.UtcNow;
        var earlier = await _db.UploadGrants
            .IgnoreQueryFilters()
            .Where(g => !g.IsDeleted && g.ClinicId == order.ClinicId && g.LabOrderId == order.Id
                        && g.Kind == kind && g.RevokedAt == null)
            .ToListAsync(ct);
        foreach (var grant in earlier)
        {
            grant.RevokedAt = now;
        }

        var token = $"{order.ClinicId:N}.{Base64Url(RandomNumberGenerator.GetBytes(SecretBytes))}";
        var expiresAt = now.AddDays(_options.UploadGrantTtlDays);

        _db.UploadGrants.Add(new UploadGrant
        {
            Id = Guid.NewGuid(),
            TenantId = order.TenantId ?? string.Empty,
            ClinicId = order.ClinicId,
            LabOrderId = order.Id,
            TokenHash = Hash(token),
            Kind = kind,
            ExpiresAt = expiresAt,
            MaxUploads = _options.UploadMaxUploads,
            CreatedAt = now,
            CreatedBy = "system"
        });

        return new MintedUploadGrant(token, $"{portalUrl}/upload/lab/{token}", expiresAt);
    }

    public async Task<UploadGrantContext?> ResolveAsync(string token, CancellationToken ct)
    {
        if (!TryReadClinicId(token, out var clinicId)) return null;

        var hash = Hash(token);
        var grant = await _db.UploadGrants
            .IgnoreQueryFilters()
            .FirstOrDefaultAsync(g => !g.IsDeleted && g.ClinicId == clinicId && g.TokenHash == hash, ct);
        if (grant == null || grant.RevokedAt != null) return null;

        var order = await _db.LabOrders
            .IgnoreQueryFilters()
            .Include(o => o.Items)
            .FirstOrDefaultAsync(o => !o.IsDeleted && o.ClinicId == clinicId && o.Id == grant.LabOrderId, ct);
        if (order == null) return null;

        var clinic = await _db.ClinicSettings
            .IgnoreQueryFilters()
            .AsNoTracking()
            .FirstOrDefaultAsync(s => !s.IsDeleted && s.ClinicId == clinicId, ct);
        var patient = await _db.Patients
            .IgnoreQueryFilters()
            .AsNoTracking()
            .FirstOrDefaultAsync(p => !p.IsDeleted && p.ClinicId == clinicId && p.Id == order.PatientId, ct);

        return new UploadGrantContext(grant, order, clinic, patient);
    }

    private string RequirePortalBaseUrl()
    {
        var configured = _options.PortalBaseUrl?.Trim();
        if (string.IsNullOrEmpty(configured)
            || !Uri.TryCreate(configured, UriKind.Absolute, out var uri)
            || (uri.Scheme != Uri.UriSchemeHttps && uri.Scheme != Uri.UriSchemeHttp))
        {
            throw new InvalidOperationException(
                "PortalBaseUrl (environment variable PORTAL_BASE_URL or Clinic__PortalBaseUrl) must be set to the absolute public URL of "
                + "the portal, for example https://dev.clinicez.net, before lab orders can be issued.");
        }

        return configured.TrimEnd('/');
    }

    /// <summary>The clinic a token belongs to, read from its <c>{clinicId:N}.{random}</c> prefix; false for anything else.</summary>
    public static bool TryReadClinicId(string? token, out Guid clinicId)
    {
        clinicId = Guid.Empty;
        if (string.IsNullOrWhiteSpace(token) || token.Length > 128) return false;

        var parts = token.Split('.');
        return parts.Length == 2
               && parts[1].Length >= 20
               && Guid.TryParseExact(parts[0], "N", out clinicId)
               && clinicId != Guid.Empty;
    }

    public static byte[] Hash(string token) => SHA256.HashData(Encoding.UTF8.GetBytes(token));

    private static string Base64Url(byte[] bytes) =>
        Convert.ToBase64String(bytes).TrimEnd('=').Replace('+', '-').Replace('/', '_');
}
