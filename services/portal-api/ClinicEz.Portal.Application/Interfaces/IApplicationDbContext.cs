using System.Threading;
using System.Threading.Tasks;
using ClinicEz.Portal.Domain.Entities;
using Microsoft.EntityFrameworkCore;

namespace ClinicEz.Portal.Application.Interfaces;

public interface IApplicationDbContext
{
    DbSet<ExampleEntity> ExampleEntities { get; }
    DbSet<Tenant> Tenants { get; }
    DbSet<SubscriptionPlan> SubscriptionPlans { get; }
    DbSet<SubscriptionPlanFeature> SubscriptionPlanFeatures { get; }
    DbSet<PaymentReceipt> PaymentReceipts { get; }
    DbSet<BillingInvoice> BillingInvoices { get; }
    DbSet<BlogArticle> BlogArticles { get; }
    DbSet<AdminRole> AdminRoles { get; }
    DbSet<AdminUser> AdminUsers { get; }
    DbSet<Facility> Facilities { get; }
    DbSet<Branch> Branches { get; }
    DbSet<StaffMember> StaffMembers { get; }
    DbSet<WorkspaceSettings> WorkspaceSettings { get; }
    DbSet<WorkspaceAuditEntry> WorkspaceAuditEntries { get; }

    Task<int> SaveChangesAsync(CancellationToken cancellationToken);
}
