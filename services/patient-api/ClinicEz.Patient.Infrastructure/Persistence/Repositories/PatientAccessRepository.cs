using ClinicEz.Patient.Domain.Entities;
using ClinicEz.Patient.Domain.Interfaces;
using Microsoft.EntityFrameworkCore;

namespace ClinicEz.Patient.Infrastructure.Persistence.Repositories;

public sealed class PatientAccessRepository : IPatientAccessRepository
{
    private readonly ApplicationDbContext _context;

    public PatientAccessRepository(ApplicationDbContext context) => _context = context;

    public async Task<IReadOnlyList<PatientAccessGrant>> GetGrantsAsync(Guid patientId, CancellationToken cancellationToken = default) =>
        await _context.PatientAccessGrants
            .AsNoTracking()
            .Where(g => g.PatientId == patientId)
            .OrderByDescending(g => g.CreatedAt)
            .ToListAsync(cancellationToken);

    public Task<PatientAccessGrant?> GetGrantAsync(Guid patientId, Guid grantId, CancellationToken cancellationToken = default) =>
        _context.PatientAccessGrants.FirstOrDefaultAsync(g => g.Id == grantId && g.PatientId == patientId, cancellationToken);

    public async Task AddGrantAsync(PatientAccessGrant grant, CancellationToken cancellationToken = default) =>
        await _context.PatientAccessGrants.AddAsync(grant, cancellationToken);

    public async Task AddLogAsync(PatientAccessLog log, CancellationToken cancellationToken = default) =>
        await _context.PatientAccessLogs.AddAsync(log, cancellationToken);

    public async Task<(IReadOnlyList<PatientAccessLog> Items, int TotalCount)> GetLogAsync(
        Guid patientId, Guid? grantId, int skip, int take, CancellationToken cancellationToken = default)
    {
        var query = _context.PatientAccessLogs.AsNoTracking().Where(l => l.PatientId == patientId);
        if (grantId is { } id)
            query = query.Where(l => l.GrantId == id);

        var total = await query.CountAsync(cancellationToken);
        var items = await query
            .OrderByDescending(l => l.CreatedAt)
            .Skip(skip)
            .Take(take)
            .ToListAsync(cancellationToken);

        return (items, total);
    }

    public Task<ShareTokenUse?> GetTokenUseAsync(string tokenId, CancellationToken cancellationToken = default) =>
        _context.ShareTokenUses.FirstOrDefaultAsync(u => u.TokenId == tokenId, cancellationToken);

    public async Task AddTokenUseAsync(ShareTokenUse use, CancellationToken cancellationToken = default) =>
        await _context.ShareTokenUses.AddAsync(use, cancellationToken);
}