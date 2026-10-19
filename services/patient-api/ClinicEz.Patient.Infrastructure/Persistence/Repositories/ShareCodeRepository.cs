using ClinicEz.Patient.Domain.Entities;
using ClinicEz.Patient.Domain.Interfaces;
using Microsoft.EntityFrameworkCore;

namespace ClinicEz.Patient.Infrastructure.Persistence.Repositories;

public sealed class ShareCodeRepository : IShareCodeRepository
{
    private readonly ApplicationDbContext _context;

    public ShareCodeRepository(ApplicationDbContext context) => _context = context;

    public async Task AddAsync(ShareCode code, CancellationToken cancellationToken = default) =>
        await _context.ShareCodes.AddAsync(code, cancellationToken);

    public Task<ShareCode?> FindAsync(Guid patientId, string codeHash, CancellationToken cancellationToken = default) =>
        _context.ShareCodes
            .AsNoTracking()
            .FirstOrDefaultAsync(c => c.PatientId == patientId && c.CodeHash == codeHash, cancellationToken);

    public Task<int> CountLiveAsync(Guid patientId, DateTime utcNow, CancellationToken cancellationToken = default) =>
        _context.ShareCodes.CountAsync(
            c => c.PatientId == patientId
                 && c.ExpiresAt > utcNow
                 && !_context.ShareTokenUses.Any(u => u.TokenId == c.TokenId),
            cancellationToken);

    public async Task AddFailureAsync(ShareCodeFailure failure, CancellationToken cancellationToken = default) =>
        await _context.ShareCodeFailures.AddAsync(failure, cancellationToken);

    public Task<int> CountFailuresByActorAsync(string actor, DateTime since, CancellationToken cancellationToken = default) =>
        _context.ShareCodeFailures.CountAsync(f => f.Actor == actor && f.CreatedAt >= since, cancellationToken);

    public Task<int> CountFailuresByPatientAsync(Guid patientId, DateTime since, CancellationToken cancellationToken = default) =>
        _context.ShareCodeFailures.CountAsync(f => f.PatientId == patientId && f.CreatedAt >= since, cancellationToken);
}
