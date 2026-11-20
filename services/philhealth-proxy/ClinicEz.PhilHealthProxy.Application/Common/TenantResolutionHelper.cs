using System;
using System.Threading;
using System.Threading.Tasks;
using ClinicEz.PhilHealthProxy.Domain.Entities;
using ClinicEz.PhilHealthProxy.Domain.Interfaces;
using Microsoft.AspNetCore.DataProtection;

namespace ClinicEz.PhilHealthProxy.Application.Common;

public static class TenantResolutionHelper
{
    public const string SandboxDefaultCipherKey = "CLINICEZ-SANDBOX-CIPHER-KEY-32CH!";

    public static bool IsSandboxUrl(string? baseUrl)
    {
        if (string.IsNullOrWhiteSpace(baseUrl))
        {
            return false;
        }

        var lower = baseUrl.ToLowerInvariant();
        return lower.Contains("sandbox")
               || lower.Contains("simulator")
               || lower.Contains("localhost")
               || lower.Contains("127.0.0.1");
    }

    public static string ResolveCipherKey(PhilHealthTenant tenant, IDataProtectionProvider dataProtectionProvider)
    {
        if (!string.IsNullOrWhiteSpace(tenant.EncryptedCipherKey))
        {
            foreach (var purpose in new[] { "PhilHealthTenantProtection", "ClinicEz.PhilHealthProxy.TenantCredentials" })
            {
                try
                {
                    var protector = dataProtectionProvider.CreateProtector(purpose);
                    return protector.Unprotect(tenant.EncryptedCipherKey);
                }
                catch
                {
                    // Try next protector or fall through to plaintext.
                }
            }

            return tenant.EncryptedCipherKey;
        }

        if (IsSandboxUrl(tenant.BaseUrl))
        {
            return SandboxDefaultCipherKey;
        }

        throw new InvalidOperationException("PhilHealth encryption key is not configured for this clinic.");
    }

    public static async Task<PhilHealthTenant> ResolveTenantAsync(
        ICurrentTenant currentTenant,
        ITenantRepository tenantRepo,
        CancellationToken ct)
    {
        var tenantId = currentTenant.TenantId
            ?? throw new UnauthorizedAccessException("TenantId is missing or unverified.");

        PhilHealthTenant? tenant = currentTenant.BranchId.HasValue
            ? await tenantRepo.GetByBranchIdAsync(currentTenant.BranchId.Value, ct)
            : await tenantRepo.GetByTenantIdAsync(tenantId, ct);

        tenant ??= new PhilHealthTenant
        {
            TenantId = tenantId,
            BranchId = currentTenant.BranchId,
            FacilityName = "Default Health Center",
            AccreditationNumber = "H10000001",
            PmccNumber = "Z15445",
            SoftwareCertificateId = "KON-DUMMYCERTS-Z15445",
            BaseUrl = "https://pcapi-sandbox.philhealth.gov.ph"
        };

        return tenant;
    }
}
