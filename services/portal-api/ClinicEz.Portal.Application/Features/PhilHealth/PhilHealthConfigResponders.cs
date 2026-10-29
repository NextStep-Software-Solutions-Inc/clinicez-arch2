using ClinicEz.Portal.Application.Features.Admin.Consumers;
using ClinicEz.Portal.Application.Interfaces;
using ClinicEz.Portal.Domain.Entities;
using ClinicEz.Shared.Interop;
using ClinicEz.Shared.Interop.Handling;
using ClinicEz.Shared.Interop.Requests;
using ClinicEz.Shared.Interoperability;
using Microsoft.EntityFrameworkCore;
using Microsoft.Extensions.Logging;

namespace ClinicEz.Portal.Application.Features.PhilHealth;

/// <summary>PhilHealth settings shared by the hub responders and the branch configuration endpoint.</summary>
public static class PhilHealthDefaults
{
    /// <summary>Canonical PhilHealth PCAPI base URL.</summary>
    public const string PcapiBaseUrl = "https://pcapi.philhealth.gov.ph";

    /// <summary>Konsulta SOAP endpoint fallback of a branch that did not set one.</summary>
    public const string KonsultaEndpoint = "https://staging.philhealth.gov.ph/KONSULTA/SOAP";
}

/// <summary>
/// Reads and writes the PhilHealth credentials of a workspace on behalf of the PhilHealth proxy. A request names a branch
/// or a facility of the workspace (the facility resolves to the branch it belongs to), or neither for the workspace default. The credentials only
/// ever travel between the portal and the proxy: anyone else asking is told nothing was found (or that nothing was stored),
/// never that the request was refused, and no secret is logged.
/// </summary>
internal static class PhilHealthConfigAccess
{
    /// <summary>The branch whose settings answer the request; null when there are none.</summary>
    public static async Task<Branch?> FindBranchAsync(IApplicationDbContext dbContext, string tenantId, string? branchId, CancellationToken ct)
    {
        if (!Guid.TryParse(tenantId, out var tenantGuid)) return null;

        if (branchId is not null)
        {
            if (!Guid.TryParse(branchId, out var branchGuid)) return null;

            var branch = await dbContext.Branches.FirstOrDefaultAsync(
                b => b.Id == branchGuid && b.TenantId == tenantGuid && !b.IsDeleted, ct);
            if (branch is not null) return branch;

            // The proxy only knows the requesting facility (the envelope sender): it holds the settings of its branch.
            var facility = await dbContext.Facilities.AsNoTracking().FirstOrDefaultAsync(
                f => f.Id == branchGuid && f.TenantId == tenantGuid && !f.IsDeleted, ct);
            if (facility is null) return null;
            if (facility.BranchId is { } facilityBranchId)
            {
                return await dbContext.Branches.FirstOrDefaultAsync(
                    b => b.Id == facilityBranchId && b.TenantId == tenantGuid && !b.IsDeleted, ct);
            }
        }

        // A workspace-level request (or a facility outside any branch) is answered with the accredited active branch, or any active branch.
        var branches = await dbContext.Branches
            .Where(b => b.TenantId == tenantGuid && !b.IsDeleted && b.IsActive)
            .ToListAsync(ct);
        return branches.FirstOrDefault(b => b.IsPhilHealthAccredited) ?? branches.FirstOrDefault();
    }
}

public sealed class PhilHealthConfigRequestedResponder(
    IApplicationDbContext dbContext,
    IPhilHealthSecretProtector protector,
    ILogger<PhilHealthConfigRequestedResponder> logger)
    : IInteropResponder<PhilHealthConfigRequestedPayload, PhilHealthConfigRespondedPayload>
{
    private static readonly PhilHealthConfigRespondedPayload NotFound = new() { Found = false };

    public async Task<PhilHealthConfigRespondedPayload> RespondAsync(
        PhilHealthConfigRequestedPayload request, InteropMessageContext context, CancellationToken ct)
    {
        if (!InteropSenders.IsPhilHealthProxy(context.From))
        {
            logger.LogWarning("Ignoring PhilHealth config request from {Sender}: only the PhilHealth proxy may ask for credentials.", context.From.Address);
            return NotFound;
        }

        var branch = await PhilHealthConfigAccess.FindBranchAsync(dbContext, request.TenantId, request.BranchId, ct);
        if (branch is null) return NotFound;

        return new PhilHealthConfigRespondedPayload
        {
            Found = true,
            Config = new PhilHealthConfigPayload
            {
                TenantId = branch.TenantId.ToString(),
                BranchId = branch.Id.ToString(),
                FacilityName = branch.Name,
                AccreditationNumber = branch.PhilHealthAccreditationNumber ?? string.Empty,
                PmccNumber = branch.PhilHealthPmccNumber ?? string.Empty,
                SoftwareCertificateId = branch.PhilHealthSoftwareCertificateId ?? string.Empty,
                SecretKey = Reveal(branch.PhilHealthEncryptedSecretKey),
                CipherKey = Reveal(branch.PhilHealthEncryptedCipherKey),
                BaseUrl = branch.PhilHealthBaseUrl ?? PhilHealthDefaults.PcapiBaseUrl,
                IsActive = branch.IsActive && branch.IsPhilHealthAccredited
            }
        };
    }

    private string Reveal(string? stored) => string.IsNullOrEmpty(stored) ? string.Empty : protector.Unprotect(stored);
}

public sealed class PhilHealthConfigUpsertRequestedResponder(
    IApplicationDbContext dbContext,
    IPhilHealthSecretProtector protector,
    ILogger<PhilHealthConfigUpsertRequestedResponder> logger)
    : IInteropResponder<PhilHealthConfigPayload, PhilHealthConfigUpsertRespondedPayload>
{
    public async Task<PhilHealthConfigUpsertRespondedPayload> RespondAsync(
        PhilHealthConfigPayload request, InteropMessageContext context, CancellationToken ct)
    {
        if (!InteropSenders.IsPhilHealthProxy(context.From))
        {
            logger.LogWarning("Ignoring PhilHealth config upsert from {Sender}: only the PhilHealth proxy may store credentials.", context.From.Address);
            return new PhilHealthConfigUpsertRespondedPayload { Succeeded = false, Message = "Not accepted." };
        }

        if (!Guid.TryParse(request.TenantId, out var tenantId)
            || !await dbContext.Tenants.AnyAsync(t => t.Id == tenantId, ct))
        {
            return new PhilHealthConfigUpsertRespondedPayload { Succeeded = false, Message = "Workspace not found." };
        }

        var branch = await PhilHealthConfigAccess.FindBranchAsync(dbContext, request.TenantId, request.BranchId, ct);
        if (branch is null && request.BranchId is not null)
        {
            return new PhilHealthConfigUpsertRespondedPayload { Succeeded = false, Message = "Branch not found." };
        }

        branch ??= AddMainBranch(tenantId);

        branch.PhilHealthAccreditationNumber = request.AccreditationNumber.Trim();
        branch.PhilHealthPmccNumber = request.PmccNumber.Trim();
        branch.PhilHealthSoftwareCertificateId = request.SoftwareCertificateId.Trim();
        branch.PhilHealthBaseUrl = !string.IsNullOrWhiteSpace(request.BaseUrl)
            ? request.BaseUrl.Trim()
            : (!string.IsNullOrWhiteSpace(request.KonsultaEndpoint) ? request.KonsultaEndpoint.Trim() : PhilHealthDefaults.PcapiBaseUrl);
        branch.IsPhilHealthAccredited = request.IsActive;

        if (!string.IsNullOrWhiteSpace(request.SecretKey))
            branch.PhilHealthEncryptedSecretKey = protector.Protect(request.SecretKey.Trim());
        if (!string.IsNullOrWhiteSpace(request.CipherKey))
            branch.PhilHealthEncryptedCipherKey = protector.Protect(request.CipherKey.Trim());

        branch.UpdatedAt = DateTime.UtcNow;
        return new PhilHealthConfigUpsertRespondedPayload { Succeeded = true };
    }

    private Branch AddMainBranch(Guid tenantId)
    {
        var branch = new Branch
        {
            Id = Guid.NewGuid(),
            TenantId = tenantId,
            Name = "Main Branch",
            Code = "MAIN-01",
            IsActive = true,
            CreatedAt = DateTime.UtcNow,
            CreatedBy = InteropServices.Philhealth
        };
        dbContext.Branches.Add(branch);
        return branch;
    }
}