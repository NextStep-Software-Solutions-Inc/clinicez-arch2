using Microsoft.EntityFrameworkCore;
using PatientApp.Domain.Entities;
using PatientApp.Domain.Interfaces;
using PatientApp.Infrastructure.Persistence;

namespace PatientApp.Infrastructure.Persistence.Repositories;

public sealed class ClinicRepository : IClinicRepository
{
    private readonly ApplicationDbContext _ctx;

    public ClinicRepository(ApplicationDbContext ctx) => _ctx = ctx;

    public async Task<IReadOnlyList<Clinic>> SearchAsync(string? query, int skip, int take, CancellationToken ct = default)
    {
        var q = _ctx.Clinics.AsQueryable();
        if (!string.IsNullOrWhiteSpace(query))
            q = q.Where(c => EF.Functions.ILike(c.Name, $"%{query}%"));
        return await q.OrderByDescending(c => c.FeaturedScore).ThenBy(c => c.Name)
            .Skip(skip).Take(take).ToListAsync(ct);
    }

    public Task<Clinic?> GetByIdAsync(Guid id, CancellationToken ct = default)
        => _ctx.Clinics
            .Include(c => c.OrganizationLinks).ThenInclude(l => l.Organization)
            .Include(c => c.HealthcareProviders)
            .Include(c => c.Services)
            .FirstOrDefaultAsync(c => c.Id == id, ct);

    public async Task<IReadOnlyList<Clinic>> GetByOrganizationAsync(Guid organizationId, CancellationToken ct = default)
        => await _ctx.Clinics
            .Where(c => c.OrganizationLinks.Any(l => l.OrganizationId == organizationId && l.IsActive))
            .OrderByDescending(c => c.FeaturedScore).ThenBy(c => c.Name)
            .ToListAsync(ct);

    public async Task<IReadOnlyList<Clinic>> GetAllAsync(CancellationToken ct = default)
        => await _ctx.Clinics.ToListAsync(ct);

    public async Task AddAsync(Clinic clinic, CancellationToken ct = default)
        => await _ctx.Clinics.AddAsync(clinic, ct);

    public void Update(Clinic clinic) => _ctx.Clinics.Update(clinic);

    public Task<int> CountAsync(string? query, CancellationToken ct = default)
    {
        var q = _ctx.Clinics.AsQueryable();
        if (!string.IsNullOrWhiteSpace(query))
            q = q.Where(c => EF.Functions.ILike(c.Name, $"%{query}%"));
        return q.CountAsync(ct);
    }
}
