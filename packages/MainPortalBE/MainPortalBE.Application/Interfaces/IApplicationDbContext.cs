using System.Threading;
using System.Threading.Tasks;
using MainPortalBE.Domain.Entities;
using Microsoft.EntityFrameworkCore;

namespace MainPortalBE.Application.Interfaces;

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

    Task<int> SaveChangesAsync(CancellationToken cancellationToken);
}
