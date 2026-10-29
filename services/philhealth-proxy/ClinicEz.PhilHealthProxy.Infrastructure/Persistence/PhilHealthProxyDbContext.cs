using ClinicEz.Shared.Interop.Persistence;
using Microsoft.EntityFrameworkCore;

namespace ClinicEz.PhilHealthProxy.Infrastructure.Persistence;

public sealed class PhilHealthProxyDbContext(DbContextOptions<PhilHealthProxyDbContext> options)
    : DbContext(options), IInteropDbContext
{
    public DbSet<InteropOutboxMessage> InteropOutbox { get; set; } = null!;
    public DbSet<InteropInboxMessage> InteropInbox { get; set; } = null!;

    protected override void OnModelCreating(ModelBuilder modelBuilder)
    {
        base.OnModelCreating(modelBuilder);
        modelBuilder.ApplyInteropModel();
    }
}
