using MediatR;
using ClinicEz.Portal.Application.Interfaces;
using Microsoft.EntityFrameworkCore;
using System.Threading;
using System.Threading.Tasks;

namespace ClinicEz.Portal.Application.Features.Billing.Commands;

public class CreateCheckoutSessionCommand : IRequest<string>
{
    public string TenantId { get; set; } = string.Empty;
    public string PlanId { get; set; } = string.Empty;
    public bool IsAnnual { get; set; }

    // Contact & Address Details
    public string? PhoneNumber { get; set; }
    public string? Country { get; set; }
    public string? StreetLine1 { get; set; }
    public string? StreetLine2 { get; set; }
    public string? City { get; set; }
    public string? Province { get; set; }
    public string? PostalCode { get; set; }

    // Business Details
    public string? TradingName { get; set; }
    public string? BusinessType { get; set; }
    public string? TaxId { get; set; }
}

public class CreateCheckoutSessionCommandHandler(
    IBillingProvider billingService,
    IApplicationDbContext context)
    : IRequestHandler<CreateCheckoutSessionCommand, string>
{
    public async Task<string> Handle(CreateCheckoutSessionCommand request, CancellationToken cancellationToken)
    {
        var tenant = await context.Tenants
            .FirstOrDefaultAsync(t => t.Id.ToString() == request.TenantId || t.TenantSlug == request.TenantId, cancellationToken);

        if (tenant != null)
        {
            tenant.PhoneNumber = request.PhoneNumber;
            tenant.Country = request.Country;
            tenant.StreetLine1 = request.StreetLine1;
            tenant.StreetLine2 = request.StreetLine2;
            tenant.City = request.City;
            tenant.Province = request.Province;
            tenant.PostalCode = request.PostalCode;
            tenant.TradingName = request.TradingName;
            tenant.BusinessType = request.BusinessType;
            tenant.TaxId = request.TaxId;

            await context.SaveChangesAsync(cancellationToken);
        }

        return await billingService.CreateCheckoutSessionAsync(request.TenantId, request.PlanId, request.IsAnnual, cancellationToken);
    }
}
