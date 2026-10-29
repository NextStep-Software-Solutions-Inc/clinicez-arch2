using System.Threading;
using System.Threading.Tasks;
using ClinicEz.Clinic.Application.Common.Interfaces;
using ClinicEz.Clinic.Domain.Interfaces;
using ClinicEz.Clinic.Infrastructure.Persistence;
using Microsoft.EntityFrameworkCore;

namespace ClinicEz.Clinic.Infrastructure.Services;

public sealed class ClinicIdentityProvider : IClinicIdentityProvider
{
    private readonly ApplicationDbContext _db;
    private readonly IClinicContext _clinicContext;

    public ClinicIdentityProvider(ApplicationDbContext db, IClinicContext clinicContext)
    {
        _db = db;
        _clinicContext = clinicContext;
    }

    public async Task<ClinicIdentity?> GetAsync(CancellationToken cancellationToken = default)
    {
        var clinicId = _clinicContext.ClinicId;
        return await _db.Settings
            .IgnoreQueryFilters()
            .AsNoTracking()
            .Where(s => !s.IsDeleted && s.ClinicId == clinicId)
            .Select(s => new ClinicIdentity(s.TenantId, s.ClinicId, s.ClinicName))
            .FirstOrDefaultAsync(cancellationToken);
    }
}
