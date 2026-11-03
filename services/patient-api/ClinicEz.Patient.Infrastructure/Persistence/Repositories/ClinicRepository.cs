using Microsoft.EntityFrameworkCore;
using ClinicEz.Patient.Domain.Entities;
using ClinicEz.Patient.Domain.Interfaces;
using ClinicEz.Patient.Infrastructure.Persistence;

namespace ClinicEz.Patient.Infrastructure.Persistence.Repositories;

public sealed class ClinicRepository : IClinicRepository
{
    private readonly ApplicationDbContext _ctx;

    public ClinicRepository(ApplicationDbContext ctx) => _ctx = ctx;

    public async Task<IReadOnlyList<Clinic>> SearchAsync(string? query, int skip, int take, CancellationToken ct = default)
    {
        var q = _ctx.Clinics.Where(c => c.IsPublic).AsQueryable();
        if (!string.IsNullOrWhiteSpace(query))
            q = q.Where(c => EF.Functions.ILike(c.Name, $"%{query}%"));
        return await q
            .OrderByDescending(c => c.TenantId != null)
            .ThenByDescending(c => c.FeaturedScore)
            .ThenBy(c => c.Name)
            .Skip(skip).Take(take).ToListAsync(ct);
    }

    public Task<Clinic?> GetByIdAsync(Guid id, CancellationToken ct = default)
        => _ctx.Clinics
            .Include(c => c.OrganizationLinks).ThenInclude(l => l.Organization)
            .Include(c => c.HealthcareProviders)
            .Include(c => c.Services)
            .FirstOrDefaultAsync(c => c.Id == id, ct);

    public async Task<IReadOnlyList<Clinic>> GetByIdsAsync(IEnumerable<Guid> ids, CancellationToken ct = default)
    {
        var idList = ids.ToList();
        return await _ctx.Clinics
            .Include(c => c.OrganizationLinks).ThenInclude(l => l.Organization)
            .Include(c => c.HealthcareProviders)
            .Include(c => c.Services)
            .Where(c => idList.Contains(c.Id))
            .ToListAsync(ct);
    }

    public async Task<IReadOnlyList<Clinic>> GetByOrganizationAsync(Guid organizationId, CancellationToken ct = default)
        => await _ctx.Clinics
            .Where(c => c.OrganizationLinks.Any(l => l.OrganizationId == organizationId && l.IsActive))
            .OrderByDescending(c => c.TenantId != null)
            .ThenByDescending(c => c.FeaturedScore)
            .ThenBy(c => c.Name)
            .ToListAsync(ct);

    public async Task<IReadOnlyList<Clinic>> GetAllAsync(CancellationToken ct = default)
        => await _ctx.Clinics.ToListAsync(ct);

    public async Task AddAsync(Clinic clinic, CancellationToken ct = default)
        => await _ctx.Clinics.AddAsync(clinic, ct);

    public void Update(Clinic clinic) => _ctx.Clinics.Update(clinic);

    public Task<int> CountAsync(string? query, CancellationToken ct = default)
    {
        var q = _ctx.Clinics.Where(c => c.IsPublic).AsQueryable();
        if (!string.IsNullOrWhiteSpace(query))
            q = q.Where(c => EF.Functions.ILike(c.Name, $"%{query}%"));
        return q.CountAsync(ct);
    }

    public async Task<IReadOnlyList<ClinicHealthcareProvider>> SearchProvidersAsync(string? query, int skip, int take, CancellationToken ct = default)
    {
        var q = _ctx.ClinicHealthcareProviders
            .Include(p => p.Clinic)
            .Where(p => p.IsActive)
            .AsQueryable();

        if (!string.IsNullOrWhiteSpace(query))
        {
            var pattern = $"%{query}%";
            q = q.Where(p => EF.Functions.ILike(p.Name, pattern) ||
                             EF.Functions.ILike(p.Specialty, pattern) ||
                             EF.Functions.ILike(p.Clinic.Name, pattern));
        }

        return await q
            .OrderBy(p => p.DisplayOrder)
            .ThenBy(p => p.Name)
            .Skip(skip)
            .Take(take)
            .ToListAsync(ct);
    }

    public async Task<IReadOnlyList<ClinicService>> SearchServicesAsync(string? query, int skip, int take, CancellationToken ct = default)
    {
        var q = _ctx.ClinicServices
            .Include(s => s.Clinic)
            .Where(s => s.IsActive)
            .AsQueryable();

        if (!string.IsNullOrWhiteSpace(query))
        {
            var pattern = $"%{query}%";
            q = q.Where(s => EF.Functions.ILike(s.Name, pattern) ||
                             (s.Description != null && EF.Functions.ILike(s.Description, pattern)) ||
                             EF.Functions.ILike(s.Clinic.Name, pattern));
        }

        return await q
            .OrderBy(s => s.DisplayOrder)
            .ThenBy(s => s.Name)
            .Skip(skip)
            .Take(take)
            .ToListAsync(ct);
    }
}
