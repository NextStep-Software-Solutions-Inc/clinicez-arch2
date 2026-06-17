using Microsoft.EntityFrameworkCore;
using PatientApp.Domain.Entities;
using PatientApp.Domain.Interfaces;
using PatientApp.Infrastructure.Persistence;

namespace PatientApp.Infrastructure.Persistence.Repositories;

public sealed class OrganizationMembershipRepository
    : BaseRepository<OrganizationMembership>, IOrganizationMembershipRepository
{
    public OrganizationMembershipRepository(ApplicationDbContext context) : base(context) { }

    public Task<OrganizationMembership?> GetByPatientAndOrgAsync(Guid patientId, Guid organizationId, CancellationToken ct = default)
        => DbSet.FirstOrDefaultAsync(m => m.PatientId == patientId && m.OrganizationId == organizationId, ct);

    public async Task<IReadOnlyList<OrganizationMembership>> GetByPatientAsync(Guid patientId, CancellationToken ct = default)
        => await DbSet.Include(m => m.Organization)
            .Where(m => m.PatientId == patientId)
            .ToListAsync(ct);
}
