using System;
using System.Threading;
using System.Threading.Tasks;
using ClinicEz.Comms.Application.Common.Interfaces;
using ClinicEz.Comms.Domain.Entities;
using ClinicEz.Shared.Interop.Persistence;
using Microsoft.EntityFrameworkCore;
using Microsoft.Extensions.Configuration;

namespace ClinicEz.Comms.Infrastructure.Persistence;

public class CommsDbContext : DbContext, ICommsDbContext, IInteropDbContext
{
    private readonly IConfiguration? _configuration;

    public CommsDbContext(
        DbContextOptions<CommsDbContext> options,
        IConfiguration? configuration = null) : base(options)
    {
        _configuration = configuration;
    }

    public DbSet<Conversation> Conversations => Set<Conversation>();
    public DbSet<Participant> Participants => Set<Participant>();
    public DbSet<Message> Messages => Set<Message>();
    public DbSet<MessageReaction> MessageReactions => Set<MessageReaction>();
    public DbSet<MessageAttachment> MessageAttachments => Set<MessageAttachment>();
    public DbSet<EligibilityGrant> EligibilityGrants => Set<EligibilityGrant>();

    public DbSet<InteropOutboxMessage> InteropOutbox { get; set; } = null!;
    public DbSet<InteropInboxMessage> InteropInbox { get; set; } = null!;

    public string? CurrentTenantId { get; set; }

    protected override void ConfigureConventions(ModelConfigurationBuilder configurationBuilder)
    {
        configurationBuilder.Properties<Enum>().HaveConversion<string>().HaveMaxLength(32);
    }

    protected override void OnModelCreating(ModelBuilder modelBuilder)
    {
        base.OnModelCreating(modelBuilder);

        var schemaName = _configuration?["DbSchema"] ?? "comms";
        modelBuilder.HasDefaultSchema(schemaName);

        modelBuilder.ApplyConfigurationsFromAssembly(typeof(CommsDbContext).Assembly);
        modelBuilder.ApplyInteropModel();

        // Multi-tenant global query filters
        modelBuilder.Entity<Conversation>().HasQueryFilter(e => CurrentTenantId == null || e.TenantId == CurrentTenantId);
        modelBuilder.Entity<Participant>().HasQueryFilter(e => CurrentTenantId == null || e.TenantId == CurrentTenantId);
        modelBuilder.Entity<Message>().HasQueryFilter(e => CurrentTenantId == null || e.TenantId == CurrentTenantId);
        modelBuilder.Entity<MessageAttachment>().HasQueryFilter(e => CurrentTenantId == null || e.TenantId == CurrentTenantId);
        modelBuilder.Entity<EligibilityGrant>().HasQueryFilter(e => CurrentTenantId == null || e.TenantId == CurrentTenantId);
    }
}
