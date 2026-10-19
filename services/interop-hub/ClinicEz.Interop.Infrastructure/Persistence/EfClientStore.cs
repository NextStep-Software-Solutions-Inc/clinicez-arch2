using ClinicEz.Interop.Application.Abstractions;
using ClinicEz.Interop.Domain.Entities;
using ClinicEz.Shared.Interop.Contracts;
using Microsoft.EntityFrameworkCore;

namespace ClinicEz.Interop.Infrastructure.Persistence;

public sealed class EfClientStore(HubDbContext db) : IClientStore
{
    public Task<HubClient?> FindAsync(string clientId, CancellationToken ct) =>
        db.Clients.FirstOrDefaultAsync(c => c.ClientId == clientId, ct);

    public async Task AddAsync(HubClient client, CancellationToken ct)
    {
        db.Clients.Add(client);
        await db.SaveChangesAsync(ct);
    }

    public Task UpdateAsync(HubClient client, CancellationToken ct) => db.SaveChangesAsync(ct);

    public Task<bool> AnyActiveAsync(HubClientKind kind, CancellationToken ct) =>
        db.Clients.AnyAsync(c => c.Kind == kind && !c.Revoked, ct);
}
