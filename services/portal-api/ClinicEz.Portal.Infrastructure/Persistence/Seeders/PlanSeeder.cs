using ClinicEz.Portal.Application.Features.Billing;
using ClinicEz.Portal.Domain.Interfaces;
using Microsoft.Extensions.Options;

namespace ClinicEz.Portal.Infrastructure.Persistence.Seeders;

/// <summary>Seeds the plan catalogue from <c>Billing:Plans</c>. Registered for every environment, not only Development.</summary>
public class PlanSeeder(ApplicationDbContext context, IOptions<BillingOptions> options) : IBaseSeeder
{
    public Task SeedAsync(CancellationToken cancellationToken = default) =>
        PlanCatalog.SeedMissingAsync(context, options.Value, cancellationToken);
}
