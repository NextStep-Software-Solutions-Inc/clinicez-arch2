using Microsoft.EntityFrameworkCore;
using ClinicEz.PhilHealthProxy.Domain.Entities;
using ClinicEz.PhilHealthProxy.Domain.Interfaces;
using ClinicEz.PhilHealthProxy.Infrastructure.Persistence;

namespace ClinicEz.PhilHealthProxy.Infrastructure.Persistence.Repositories;

public sealed class TenantRepository(ApplicationDbContext dbContext) : ITenantRepository
{
    public Task<PhilHealthTenant?> GetByTenantIdAsync(
        Guid tenantId,
        CancellationToken cancellationToken = default)
        => dbContext.PhilHealthTenants
            .AsNoTracking()
            .FirstOrDefaultAsync(t => t.TenantId == tenantId && t.IsActive, cancellationToken);

    public async Task<PhilHealthTenant> UpsertTenantAsync(
        PhilHealthTenant tenant,
        CancellationToken cancellationToken = default)
    {
        var existing = await dbContext.PhilHealthTenants
            .FirstOrDefaultAsync(t => t.TenantId == tenant.TenantId, cancellationToken);

        if (existing == null)
        {
            dbContext.PhilHealthTenants.Add(tenant);
        }
        else
        {
            existing.FacilityName = tenant.FacilityName;
            existing.AccreditationNumber = tenant.AccreditationNumber;
            existing.PmccNumber = tenant.PmccNumber;
            existing.SoftwareCertificateId = tenant.SoftwareCertificateId;
            existing.EncryptedUsername = tenant.EncryptedUsername;
            existing.EncryptedPassword = tenant.EncryptedPassword;
            existing.EncryptedCipherKey = tenant.EncryptedCipherKey;
            existing.KonsultaEndpoint = tenant.KonsultaEndpoint;
            existing.IsActive = tenant.IsActive;
            existing.UpdatedAt = DateTimeOffset.UtcNow;
        }

        await dbContext.SaveChangesAsync(cancellationToken);
        return existing ?? tenant;
    }
}
