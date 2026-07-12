using Microsoft.EntityFrameworkCore;
using PatientAppBE.Domain.Entities;
using PatientAppBE.Domain.Interfaces;
using PatientAppBE.Infrastructure.Persistence;

namespace PatientAppBE.Infrastructure.Persistence.Repositories;

public sealed class OrganizationMembershipRepository
    : BaseRepository<OrganizationMembership>, IOrganizationMembershipRepository
{
    public OrganizationMembershipRepository(ApplicationDbContext context) : base(context) { }

    public Task<OrganizationMembership?> GetByPatientAndOrgAsync(Guid patientId, Guid organizationId, CancellationToken ct = default)
        => DbSet.FirstOrDefaultAsync(m => m.PatientId == patientId && m.OrganizationId == organizationId, ct);

    public Task<OrganizationMembership?> GetByPatientAndOrgWithDeletedAsync(Guid patientId, Guid organizationId, CancellationToken ct = default)
        => DbSet.IgnoreQueryFilters().FirstOrDefaultAsync(m => m.PatientId == patientId && m.OrganizationId == organizationId, ct);

    public async Task<IReadOnlyList<OrganizationMembership>> GetByPatientAsync(Guid patientId, CancellationToken ct = default)
        => await DbSet.Include(m => m.Organization)
            .Where(m => m.PatientId == patientId)
            .ToListAsync(ct);
}
