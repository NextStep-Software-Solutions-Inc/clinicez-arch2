using Microsoft.EntityFrameworkCore;
using PatientAppBE.Domain.Entities;
using PatientAppBE.Domain.Interfaces;
using PatientAppBE.Infrastructure.Persistence;

namespace PatientAppBE.Infrastructure.Persistence.Repositories;

public sealed class OrganizationRepository : IOrganizationRepository
{
    private readonly ApplicationDbContext _ctx;

    public OrganizationRepository(ApplicationDbContext ctx) => _ctx = ctx;

    public async Task<IReadOnlyList<Organization>> SearchAsync(string? query, int skip, int take, CancellationToken ct = default)
    {
        var q = _ctx.Organizations.AsQueryable();
        if (!string.IsNullOrWhiteSpace(query))
            q = q.Where(o => EF.Functions.ILike(o.Name, $"%{query}%"));
        return await q.OrderByDescending(o => o.FeaturedScore).ThenBy(o => o.Name)
            .Skip(skip).Take(take).ToListAsync(ct);
    }

    public Task<Organization?> GetByIdAsync(Guid id, CancellationToken ct = default)
        => _ctx.Organizations.Include(o => o.ClinicLinks).ThenInclude(l => l.Clinic)
            .FirstOrDefaultAsync(o => o.Id == id, ct);

    public Task<Organization?> GetBySlugAsync(string slug, CancellationToken ct = default)
        => _ctx.Organizations
            .Include(o => o.ClinicLinks).ThenInclude(l => l.Clinic)
            .FirstOrDefaultAsync(o => o.Slug == slug, ct);

    public Task<Organization?> GetByInviteCodeAsync(string inviteCode, CancellationToken ct = default)
        => _ctx.Organizations
            .Include(o => o.ClinicLinks).ThenInclude(l => l.Clinic)
            .FirstOrDefaultAsync(o => o.InviteCode == inviteCode, ct);

    public async Task AddAsync(Organization organization, CancellationToken ct = default)
        => await _ctx.Organizations.AddAsync(organization, ct);

    public void Update(Organization organization)
        => _ctx.Organizations.Update(organization);

    public Task<int> CountAsync(string? query, CancellationToken ct = default)
    {
        var q = _ctx.Organizations.AsQueryable();
        if (!string.IsNullOrWhiteSpace(query))
            q = q.Where(o => EF.Functions.ILike(o.Name, $"%{query}%"));
        return q.CountAsync(ct);
    }

    public async Task<IReadOnlyList<OrganizationRole>> GetRolesAsync(Guid organizationId, CancellationToken ct = default)
    {
        return await _ctx.OrganizationRoles
            .Where(r => r.OrganizationId == organizationId)
            .OrderBy(r => r.Name)
            .ToListAsync(ct);
    }
}
