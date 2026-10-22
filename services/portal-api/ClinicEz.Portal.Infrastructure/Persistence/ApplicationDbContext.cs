using ClinicEz.Portal.Application.Interfaces;
using ClinicEz.Portal.Domain.Common;
using ClinicEz.Portal.Domain.Entities;
using ClinicEz.Shared.Interop.Contracts;
using ClinicEz.Shared.Interop.Persistence;
using Microsoft.AspNetCore.DataProtection.EntityFrameworkCore;
using Microsoft.EntityFrameworkCore;
using Microsoft.EntityFrameworkCore.Metadata;
using System.Linq.Expressions;

namespace ClinicEz.Portal.Infrastructure.Persistence;

public class ApplicationDbContext(DbContextOptions<ApplicationDbContext> options)
    : DbContext(options), IApplicationDbContext, IInteropDbContext, IDataProtectionKeyContext
{

    public DbSet<ExampleEntity> ExampleEntities { get; set; }
    public DbSet<Tenant> Tenants { get; set; }
    public DbSet<Plan> Plans { get; set; }
    public DbSet<PlanFeature> PlanFeatures { get; set; }
    public DbSet<PlanEntitlement> PlanEntitlements { get; set; }
    public DbSet<EntitlementOverride> EntitlementOverrides { get; set; }
    public DbSet<Subscription> Subscriptions { get; set; }
    public DbSet<PaymentReceipt> PaymentReceipts { get; set; }
    public DbSet<BillingInvoice> BillingInvoices { get; set; }
    public DbSet<BlogArticle> BlogArticles { get; set; }
    public DbSet<AdminRole> AdminRoles { get; set; }
    public DbSet<AdminUser> AdminUsers { get; set; }
    public DbSet<Facility> Facilities { get; set; }
    public DbSet<Branch> Branches { get; set; }
    public DbSet<WorkspaceMember> WorkspaceMembers { get; set; }
    public DbSet<StaffMember> StaffMembers { get; set; }
    public DbSet<OwnershipTransfer> OwnershipTransfers { get; set; }
    public DbSet<FacilityAllocation> FacilityAllocations { get; set; }
    public DbSet<FacilityLink> FacilityLinks { get; set; }
    public DbSet<EdgeHubClient> EdgeHubClients { get; set; }
    public DbSet<FinanceDailySummary> FinanceDailySummaries { get; set; }
    public DbSet<FinanceInvoiceRecord> FinanceInvoiceRecords { get; set; }
    public DbSet<WorkspaceSettings> WorkspaceSettings { get; set; }
    public DbSet<WorkspaceAuditEntry> WorkspaceAuditEntries { get; set; }
    public DbSet<WorkspaceApiKey> WorkspaceApiKeys { get; set; }
    public DbSet<WebhookEndpoint> WebhookEndpoints { get; set; }
    public DbSet<WebhookDelivery> WebhookDeliveries { get; set; }
    public DbSet<SystemSetting> SystemSettings { get; set; }
    public DbSet<PortalNotification> PortalNotifications { get; set; }
    public DbSet<NewsletterSubscriber> NewsletterSubscribers { get; set; }
    public DbSet<InteropOutboxMessage> InteropOutbox { get; set; }
    public DbSet<InteropInboxMessage> InteropInbox { get; set; }
    public DbSet<DataProtectionKey> DataProtectionKeys { get; set; } = null!;

    /// <summary>Every enum is stored as its member name, never as a number (explicit mappings below only narrow the length).</summary>
    protected override void ConfigureConventions(ModelConfigurationBuilder configurationBuilder)
    {
        configurationBuilder.Properties<Enum>().HaveConversion<string>().HaveMaxLength(64);
    }

    protected override void OnModelCreating(ModelBuilder modelBuilder)
    {
        const string schemaName = "public";
        modelBuilder.HasDefaultSchema(schemaName);

        foreach (var entity in modelBuilder.Model.GetEntityTypes())
        {
            var idProperty = entity.FindProperty("Id");

            if (idProperty == null)
            {
                continue;
            }

            if (idProperty.ClrType == typeof(Guid))
            {
                idProperty.SetDefaultValueSql("gen_random_uuid()");
            }

            entity.SetPrimaryKey(idProperty);
            idProperty.ValueGenerated = ValueGenerated.OnAdd;
        }

        // Apply soft delete query filter
        foreach (var entityType in modelBuilder.Model.GetEntityTypes())
        {
            if (typeof(IEntity).IsAssignableFrom(entityType.ClrType))
            {
                var parameter = Expression.Parameter(entityType.ClrType, "e");
                var property = Expression.Property(parameter, nameof(IEntity.IsDeleted));
                var notDeleted = Expression.Not(property);
                var lambda = Expression.Lambda(notDeleted, parameter);
                entityType.SetQueryFilter(lambda);
            }
        }

        // Example entity configuration
        modelBuilder.Entity<ExampleEntity>()
            .HasIndex(e => e.Name)
            .IsUnique();

        modelBuilder.Entity<Tenant>()
            .HasIndex(t => t.TenantSlug)
            .IsUnique();

        // One OWNED workspace per user. Archived workspaces still count: only purging (soft delete) frees the slot.
        modelBuilder.Entity<Tenant>()
            .HasIndex(t => t.OwnerId)
            .HasDatabaseName(Tenant.UniqueOwnerIndexName)
            .HasFilter("\"IsDeleted\" = false")
            .IsUnique();

        modelBuilder.Entity<Plan>()
            .HasIndex(p => p.Slug)
            .HasFilter("\"IsDeleted\" = false")
            .IsUnique();

        modelBuilder.Entity<Plan>()
            .HasMany(p => p.Features)
            .WithOne(f => f.Plan)
            .HasForeignKey(f => f.PlanId)
            .OnDelete(DeleteBehavior.Cascade);

        modelBuilder.Entity<BillingInvoice>(entity =>
        {
            entity.HasIndex(i => i.XenditInvoiceId)
                .IsUnique();

            entity.HasIndex(i => i.InvoiceNumber)
                .IsUnique();
        });

        modelBuilder.Entity<BlogArticle>()
            .HasIndex(b => b.Slug)
            .IsUnique();

        modelBuilder.Entity<AdminRole>()
            .Property(r => r.Permissions)
            .Metadata
            .SetValueComparer(new Microsoft.EntityFrameworkCore.ChangeTracking.ValueComparer<List<string>>(
                (c1, c2) => c1 == null && c2 == null || c1 != null && c2 != null && System.Linq.Enumerable.SequenceEqual(c1, c2),
                c => c.Aggregate(0, (a, v) => HashCode.Combine(a, v.GetHashCode())),
                c => c.ToList()));

        modelBuilder.Entity<AdminUser>(entity =>
        {
            entity.Property(e => e.ClerkUserId).IsRequired(false);
            entity.Property(e => e.Email).IsRequired().HasMaxLength(254);
            entity.Property(e => e.FullName).IsRequired().HasMaxLength(256);
            entity.Property(e => e.Status).HasConversion<string>().HasMaxLength(64);
            entity.Property(e => e.InvitationToken).HasMaxLength(128);

            entity.HasIndex(e => e.InvitationToken)
                .HasFilter("\"IsDeleted\" = false AND \"InvitationToken\" IS NOT NULL")
                .IsUnique();

            entity.HasIndex(e => e.Email)
                .HasFilter("\"IsDeleted\" = false")
                .IsUnique();
        });

        modelBuilder.Entity<BillingInvoice>()
            .HasOne(i => i.Tenant)
            .WithMany()
            .HasForeignKey(i => i.TenantId)
            .OnDelete(DeleteBehavior.Restrict);

        modelBuilder.Entity<PaymentReceipt>(entity =>
        {
            entity.HasOne(r => r.Invoice)
                .WithOne()
                .HasForeignKey<PaymentReceipt>(r => r.InvoiceId)
                .OnDelete(DeleteBehavior.Cascade);

            entity.HasOne(r => r.Tenant)
                .WithMany()
                .HasForeignKey(r => r.TenantId)
                .OnDelete(DeleteBehavior.Restrict);

            entity.HasIndex(r => r.ReceiptNumber)
                .IsUnique();

            entity.Property(r => r.TransactionReference).HasMaxLength(256);
            entity.Property(r => r.Notes).HasMaxLength(2000);
        });

        modelBuilder.Entity<Branch>(entity =>
        {
            entity.HasOne(e => e.Tenant)
                .WithMany(t => t.Branches)
                .HasForeignKey(e => e.TenantId)
                .OnDelete(DeleteBehavior.Cascade);

            entity.HasIndex(e => new { e.TenantId, e.Code })
                .HasFilter("\"IsDeleted\" = false AND \"Code\" IS NOT NULL")
                .IsUnique();
        });

        modelBuilder.Entity<Facility>(entity =>
        {
            entity.Property(e => e.FacilityType).HasConversion<string>();
            entity.Property(e => e.Status).HasConversion<string>();
            entity.Property(e => e.DeploymentMode).HasConversion<string>().HasMaxLength(16).HasDefaultValue(FacilityDeploymentMode.SharedCloud);
            entity.Property(e => e.ConsoleBaseUrl).HasMaxLength(2048);
            entity.Property(e => e.Visibility).HasConversion<string>().HasMaxLength(16).HasDefaultValue(FacilityVisibility.Private);
            entity.Property(e => e.IsPatientDiscoveryEligible).HasDefaultValue(false);
            entity.Property(e => e.CellId).HasMaxLength(80).HasDefaultValue(string.Empty);
            entity.Property(e => e.HubClientId).HasMaxLength(128);
            entity.HasOne(e => e.Tenant)
                .WithMany()
                .HasForeignKey(e => e.TenantId)
                .OnDelete(DeleteBehavior.Cascade);

            entity.HasOne(e => e.Branch)
                .WithMany(b => b.Facilities)
                .HasForeignKey(e => e.BranchId)
                .OnDelete(DeleteBehavior.SetNull);

            entity.HasIndex(e => new { e.TenantId, e.Name })
                .HasFilter("\"IsDeleted\" = false")
                .IsUnique();

            entity.HasIndex(e => e.Slug)
                .HasFilter("\"IsDeleted\" = false")
                .IsUnique();

            entity.HasIndex(e => new { e.BranchId, e.FacilityType })
                .HasFilter("\"IsDeleted\" = false AND \"BranchId\" IS NOT NULL")
                .IsUnique();
        });

        modelBuilder.Entity<WorkspaceMember>(entity =>
        {
            entity.Property(e => e.Role).HasConversion<string>().HasMaxLength(16);
            entity.Property(e => e.Status).HasConversion<string>().HasMaxLength(16);
            entity.Property(e => e.Email).HasMaxLength(254);
            entity.Property(e => e.UserId).HasMaxLength(128);

            entity.HasOne(e => e.Tenant)
                .WithMany()
                .HasForeignKey(e => e.TenantId)
                .OnDelete(DeleteBehavior.Cascade);

            entity.HasIndex(e => new { e.TenantId, e.Email })
                .HasFilter("\"IsDeleted\" = false")
                .IsUnique();

            entity.HasIndex(e => new { e.TenantId, e.UserId })
                .HasFilter("\"IsDeleted\" = false AND \"UserId\" IS NOT NULL")
                .IsUnique();

            entity.HasIndex(e => e.UserId);
        });

        modelBuilder.Entity<StaffMember>(entity =>
        {
            entity.HasOne(e => e.Tenant)
                .WithMany()
                .HasForeignKey(e => e.TenantId)
                .OnDelete(DeleteBehavior.Cascade);

            entity.HasOne(e => e.WorkspaceMember)
                .WithMany()
                .HasForeignKey(e => e.WorkspaceMemberId)
                .OnDelete(DeleteBehavior.Cascade);

            entity.HasOne(e => e.Facility)
                .WithMany()
                .HasForeignKey(e => e.FacilityId)
                .OnDelete(DeleteBehavior.SetNull);

            entity.HasIndex(e => e.WorkspaceMemberId)
                .HasFilter("\"IsDeleted\" = false")
                .IsUnique();
        });

        modelBuilder.Entity<OwnershipTransfer>(entity =>
        {
            entity.Property(e => e.Status).HasConversion<string>().HasMaxLength(16);
            entity.Property(e => e.OfferedByUserId).HasMaxLength(128);

            entity.HasOne(e => e.Tenant)
                .WithMany()
                .HasForeignKey(e => e.TenantId)
                .OnDelete(DeleteBehavior.Cascade);

            entity.HasOne(e => e.TargetMember)
                .WithMany()
                .HasForeignKey(e => e.TargetMemberId)
                .OnDelete(DeleteBehavior.Cascade);

            entity.HasIndex(e => e.TenantId)
                .HasFilter("\"IsDeleted\" = false AND \"Status\" = 'Pending'")
                .IsUnique();
        });

        modelBuilder.Entity<FacilityAllocation>(entity =>
        {
            entity.HasOne(e => e.Facility)
                .WithMany()
                .HasForeignKey(e => e.FacilityId)
                .OnDelete(DeleteBehavior.Cascade);

            entity.HasIndex(e => e.FacilityId)
                .HasFilter("\"IsDeleted\" = false")
                .IsUnique();

            entity.HasIndex(e => e.TenantId);
        });

        modelBuilder.Entity<FacilityLink>(entity =>
        {
            entity.Property(e => e.Status).HasConversion<string>().HasMaxLength(16);
            entity.Property(e => e.Scopes).HasConversion<string>().HasMaxLength(64);
            entity.Property(e => e.RequestedBy).HasMaxLength(128);
            entity.Property(e => e.ApprovedBy).HasMaxLength(128);

            entity.HasOne(e => e.SourceFacility)
                .WithMany()
                .HasForeignKey(e => e.SourceFacilityId)
                .OnDelete(DeleteBehavior.Cascade);

            entity.HasOne(e => e.TargetFacility)
                .WithMany()
                .HasForeignKey(e => e.TargetFacilityId)
                .OnDelete(DeleteBehavior.Cascade);

            entity.HasIndex(e => new { e.SourceFacilityId, e.TargetFacilityId })
                .HasFilter("\"IsDeleted\" = false")
                .IsUnique();

            entity.HasIndex(e => e.SourceTenantId);
            entity.HasIndex(e => e.TargetTenantId);
        });

        modelBuilder.Entity<EdgeHubClient>(entity =>
        {
            entity.Property(e => e.CellId).HasMaxLength(128);
            entity.Property(e => e.Service).HasMaxLength(32);
            entity.Property(e => e.ClientId).HasMaxLength(128);

            entity.HasIndex(e => new { e.TenantId, e.Service })
                .HasFilter("\"IsDeleted\" = false")
                .IsUnique();
        });

        modelBuilder.Entity<Subscription>(entity =>
        {
            entity.Property(e => e.Status).HasConversion<string>().HasMaxLength(16);
            entity.Property(e => e.ProviderName).HasMaxLength(32);
            entity.Property(e => e.ProviderCustomerId).HasMaxLength(128);
            entity.Property(e => e.ProviderSubscriptionId).HasMaxLength(128);

            entity.HasOne(e => e.Tenant)
                .WithMany()
                .HasForeignKey(e => e.TenantId)
                .OnDelete(DeleteBehavior.Cascade);

            entity.HasOne(e => e.Plan)
                .WithMany()
                .HasForeignKey(e => e.PlanId)
                .OnDelete(DeleteBehavior.Restrict);

            entity.HasIndex(e => e.TenantId)
                .HasFilter("\"IsDeleted\" = false")
                .IsUnique();

            entity.HasIndex(e => e.ProviderCustomerId);
            entity.HasIndex(e => e.ProviderSubscriptionId);
        });

        modelBuilder.Entity<PlanEntitlement>(entity =>
        {
            entity.Property(e => e.Key).HasMaxLength(64);
            entity.Property(e => e.Kind).HasConversion<string>().HasMaxLength(16);

            entity.HasOne(e => e.Plan)
                .WithMany(p => p.Entitlements)
                .HasForeignKey(e => e.PlanId)
                .OnDelete(DeleteBehavior.Cascade);

            entity.HasIndex(e => new { e.PlanId, e.Key })
                .HasFilter("\"IsDeleted\" = false")
                .IsUnique();
        });

        modelBuilder.Entity<EntitlementOverride>(entity =>
        {
            entity.Property(e => e.Key).HasMaxLength(64);
            entity.Property(e => e.Kind).HasConversion<string>().HasMaxLength(16);
            entity.Property(e => e.Reason).HasMaxLength(256);

            entity.HasOne(e => e.Tenant)
                .WithMany()
                .HasForeignKey(e => e.TenantId)
                .OnDelete(DeleteBehavior.Cascade);

            entity.HasIndex(e => new { e.TenantId, e.Key })
                .HasFilter("\"IsDeleted\" = false")
                .IsUnique();
        });

        modelBuilder.Entity<FinanceInvoiceRecord>(entity =>
        {
            entity.Property(e => e.SourceType).HasMaxLength(64);
            entity.Property(e => e.Currency).HasMaxLength(3);

            entity.HasIndex(e => e.InvoiceId)
                .HasFilter("\"IsDeleted\" = false")
                .IsUnique();

            entity.HasIndex(e => e.TenantId);
        });

        modelBuilder.Entity<FinanceDailySummary>(entity =>
        {
            entity.Property(e => e.SourceType).HasMaxLength(64);
            entity.Property(e => e.Currency).HasMaxLength(3);

            entity.HasIndex(e => new { e.TenantId, e.FacilityId, e.Day, e.SourceType, e.Currency })
                .HasFilter("\"IsDeleted\" = false")
                .IsUnique();

            entity.HasIndex(e => new { e.TenantId, e.Day });
        });


        modelBuilder.Entity<WorkspaceSettings>(entity =>
        {
            entity.HasOne(e => e.Tenant)
                .WithMany()
                .HasForeignKey(e => e.TenantId)
                .OnDelete(DeleteBehavior.Cascade);

            entity.HasIndex(e => e.TenantId)
                .HasFilter("\"IsDeleted\" = false")
                .IsUnique();

            entity.Property(e => e.TimeZoneId).HasMaxLength(64);
            entity.Property(e => e.Locale).HasMaxLength(16);
            entity.Property(e => e.BrandName).HasMaxLength(120);
            entity.Property(e => e.LogoUrl).HasMaxLength(2048);
            entity.Property(e => e.AccentColorHex).HasMaxLength(7);
            entity.Property(e => e.DateFormat).HasMaxLength(32);
            entity.Property(e => e.CurrencyCode).HasMaxLength(3);
            entity.Property(e => e.AllowedInviteDomains).HasMaxLength(1024);
            entity.Property(e => e.DpoName).HasMaxLength(120);
            entity.Property(e => e.DpoEmail).HasMaxLength(254);
            entity.Property(e => e.PrivacyNoticeUrl).HasMaxLength(2048);
        });

        modelBuilder.Entity<WorkspaceAuditEntry>(entity =>
        {
            entity.HasOne(e => e.Tenant)
                .WithMany()
                .HasForeignKey(e => e.TenantId)
                .OnDelete(DeleteBehavior.Cascade);

            entity.HasIndex(e => new { e.TenantId, e.CreatedAt });

            entity.Property(e => e.Section).HasMaxLength(32);
            entity.Property(e => e.Action).HasMaxLength(32);
            entity.Property(e => e.ActorUserId).HasMaxLength(128);
            entity.Property(e => e.ActorName).HasMaxLength(256);
            entity.Property(e => e.ActorRole).HasMaxLength(32);
            entity.Property(e => e.ChangesJson).HasColumnType("jsonb");
        });

        modelBuilder.Entity<PortalNotification>(entity =>
        {
            entity.ToTable("portal_notifications");
            entity.HasIndex(e => new { e.TenantId, e.IsRead, e.CreatedAt });
            entity.HasIndex(e => e.UserId);
            entity.Property(e => e.Title).HasMaxLength(256);
            entity.Property(e => e.Category).HasMaxLength(64);
            entity.Property(e => e.Severity).HasMaxLength(32);
        });

        modelBuilder.Entity<WorkspaceApiKey>(entity =>
        {
            entity.HasOne(e => e.Tenant)
                .WithMany()
                .HasForeignKey(e => e.TenantId)
                .OnDelete(DeleteBehavior.Cascade);

            entity.HasIndex(e => e.TenantId);
            entity.HasIndex(e => e.KeyHash)
                .HasFilter("\"IsDeleted\" = false")
                .IsUnique();

            entity.Property(e => e.Name).HasMaxLength(100);
            entity.Property(e => e.KeyPrefix).HasMaxLength(16);
            entity.Property(e => e.KeyHash).HasMaxLength(64);
            entity.Property(e => e.Scopes).HasMaxLength(256);
            entity.Property(e => e.CreatedByName).HasMaxLength(256);
        });

        modelBuilder.Entity<WebhookEndpoint>(entity =>
        {
            entity.HasOne(e => e.Tenant)
                .WithMany()
                .HasForeignKey(e => e.TenantId)
                .OnDelete(DeleteBehavior.Cascade);

            entity.HasIndex(e => e.TenantId);

            entity.Property(e => e.Url).HasMaxLength(2048);
            entity.Property(e => e.Description).HasMaxLength(200);
            entity.Property(e => e.Events).HasMaxLength(512);
            entity.Property(e => e.SigningSecret).HasMaxLength(128);
        });

        modelBuilder.Entity<WebhookDelivery>(entity =>
        {
            entity.HasOne(e => e.Endpoint)
                .WithMany(e => e.Deliveries)
                .HasForeignKey(e => e.EndpointId)
                .OnDelete(DeleteBehavior.Cascade);

            entity.HasIndex(e => new { e.Status, e.NextAttemptAt });
            entity.HasIndex(e => new { e.EndpointId, e.CreatedAt });

            entity.Property(e => e.EventType).HasMaxLength(64);
            entity.Property(e => e.Payload).HasColumnType("jsonb");
            entity.Property(e => e.Status).HasConversion<string>().HasMaxLength(16);
            entity.Property(e => e.LastError).HasMaxLength(300);
        });

        modelBuilder.ApplyInteropModel();

        modelBuilder.Entity<DataProtectionKey>(entity =>
        {
            entity.ToTable("DataProtectionKeys");
        });

        modelBuilder.Entity<SystemSetting>(entity =>
        {
            entity.ToTable("SystemSettings");
            entity.HasKey(e => e.Key);
            entity.Property(e => e.Key).HasMaxLength(128);
            entity.Property(e => e.Value).HasMaxLength(2048);
            entity.Property(e => e.Category).HasMaxLength(64);
            entity.Property(e => e.Description).HasMaxLength(512);
            entity.Property(e => e.UpdatedBy).HasMaxLength(256);
        });

        modelBuilder.Entity<NewsletterSubscriber>(entity =>
        {
            entity.ToTable("NewsletterSubscribers");
            entity.Property(e => e.Email).IsRequired().HasMaxLength(254);
            entity.Property(e => e.Source).HasMaxLength(64);
            entity.Property(e => e.Status).HasMaxLength(32);
            entity.HasIndex(e => e.Email)
                .HasFilter("\"IsDeleted\" = false")
                .IsUnique();
        });

        base.OnModelCreating(modelBuilder);
    }
}
