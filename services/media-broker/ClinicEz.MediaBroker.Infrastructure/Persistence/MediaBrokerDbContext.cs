using System;
using ClinicEz.MediaBroker.Application.Common.Interfaces;
using ClinicEz.MediaBroker.Domain.Entities;
using ClinicEz.Shared.Interop.Persistence;
using Microsoft.EntityFrameworkCore;
using Microsoft.Extensions.Configuration;

namespace ClinicEz.MediaBroker.Infrastructure.Persistence;

public class MediaBrokerDbContext : DbContext, IMediaBrokerDbContext, IInteropDbContext
{
    private readonly IConfiguration? _configuration;

    public MediaBrokerDbContext(
        DbContextOptions<MediaBrokerDbContext> options,
        IConfiguration? configuration = null) : base(options)
    {
        _configuration = configuration;
    }

    public DbSet<TenantMediaEntitlement> Entitlements => Set<TenantMediaEntitlement>();
    public DbSet<MediaCallSession> CallSessions => Set<MediaCallSession>();
    public DbSet<TenantMonthlyUsage> MonthlyUsages => Set<TenantMonthlyUsage>();
    public DbSet<MediaAuditLog> AuditLogs => Set<MediaAuditLog>();

    public DbSet<InteropOutboxMessage> InteropOutbox { get; set; } = null!;
    public DbSet<InteropInboxMessage> InteropInbox { get; set; } = null!;

    protected override void ConfigureConventions(ModelConfigurationBuilder configurationBuilder)
    {
        configurationBuilder.Properties<Enum>().HaveConversion<string>().HaveMaxLength(32);
    }

    protected override void OnModelCreating(ModelBuilder modelBuilder)
    {
        base.OnModelCreating(modelBuilder);

        var schemaName = _configuration?["DbSchema"] ?? "media";
        modelBuilder.HasDefaultSchema(schemaName);

        modelBuilder.ApplyInteropModel();

        modelBuilder.Entity<TenantMediaEntitlement>(entity =>
        {
            entity.ToTable("tenant_media_entitlements");
            entity.HasKey(e => e.TenantId);
            entity.Property(e => e.TenantId).HasMaxLength(64).IsRequired();
        });

        modelBuilder.Entity<MediaCallSession>(entity =>
        {
            entity.ToTable("media_call_sessions");
            entity.HasKey(e => e.CallId);
            entity.HasIndex(e => new { e.TenantId, e.CallId });
            entity.HasIndex(e => e.RoomName);

            entity.Property(e => e.TenantId).HasMaxLength(64).IsRequired();
            entity.Property(e => e.FacilityId).HasMaxLength(64).IsRequired();
            entity.Property(e => e.RoomName).HasMaxLength(128).IsRequired();
            entity.Property(e => e.Status).HasMaxLength(32).IsRequired();
            entity.Property(e => e.E2eeKeyHash).HasMaxLength(128);
        });

        modelBuilder.Entity<TenantMonthlyUsage>(entity =>
        {
            entity.ToTable("tenant_monthly_usages");
            entity.HasKey(e => new { e.TenantId, e.YearMonth });
            entity.Property(e => e.TenantId).HasMaxLength(64).IsRequired();
            entity.Property(e => e.YearMonth).HasMaxLength(16).IsRequired();
        });

        modelBuilder.Entity<MediaAuditLog>(entity =>
        {
            entity.ToTable("media_audit_logs");
            entity.HasKey(e => e.Id);
            entity.HasIndex(e => new { e.TenantId, e.CallId });

            entity.Property(e => e.TenantId).HasMaxLength(64).IsRequired();
            entity.Property(e => e.EventType).HasMaxLength(64).IsRequired();
            entity.Property(e => e.Details).HasMaxLength(1024).IsRequired();
        });
    }
}
