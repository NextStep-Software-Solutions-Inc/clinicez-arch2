using System.Threading;
using System.Threading.Tasks;
using ClinicEz.Portal.Domain.Entities;
using Microsoft.EntityFrameworkCore;

namespace ClinicEz.Portal.Application.Interfaces;

public interface IApplicationDbContext
{
    DbSet<ExampleEntity> ExampleEntities { get; }
    DbSet<Tenant> Tenants { get; }
    DbSet<Plan> Plans { get; }
    DbSet<PlanFeature> PlanFeatures { get; }
    DbSet<PlanEntitlement> PlanEntitlements { get; }
    DbSet<EntitlementOverride> EntitlementOverrides { get; }
    DbSet<Subscription> Subscriptions { get; }
    DbSet<PaymentReceipt> PaymentReceipts { get; }
    DbSet<BillingInvoice> BillingInvoices { get; }
    DbSet<BlogArticle> BlogArticles { get; }
    DbSet<AdminRole> AdminRoles { get; }
    DbSet<AdminUser> AdminUsers { get; }
    DbSet<Facility> Facilities { get; }
    DbSet<Branch> Branches { get; }
    DbSet<WorkspaceMember> WorkspaceMembers { get; }
    DbSet<StaffMember> StaffMembers { get; }
    DbSet<OwnershipTransfer> OwnershipTransfers { get; }
    DbSet<FacilityAllocation> FacilityAllocations { get; }
    DbSet<FacilityLink> FacilityLinks { get; }
    DbSet<EdgeHubClient> EdgeHubClients { get; }
    DbSet<FinanceDailySummary> FinanceDailySummaries { get; }
    DbSet<FinanceInvoiceRecord> FinanceInvoiceRecords { get; }
    DbSet<WorkspaceSettings> WorkspaceSettings { get; }
    DbSet<WorkspaceAuditEntry> WorkspaceAuditEntries { get; }
    DbSet<WorkspaceApiKey> WorkspaceApiKeys { get; }
    DbSet<WebhookEndpoint> WebhookEndpoints { get; }
    DbSet<WebhookDelivery> WebhookDeliveries { get; }
    DbSet<SystemSetting> SystemSettings { get; }
    DbSet<PortalNotification> PortalNotifications { get; }
    DbSet<NewsletterSubscriber> NewsletterSubscribers { get; }

    Task<int> SaveChangesAsync(CancellationToken cancellationToken);
}
