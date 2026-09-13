using MediatR;
using ClinicEz.Portal.Application.Interfaces;
using Microsoft.EntityFrameworkCore;
using System.Threading;
using System.Threading.Tasks;

namespace ClinicEz.Portal.Application.Features.Billing.Commands;

public class UpdateTenantBillingDetailsCommand : IRequest<bool>
{
    public string TenantId { get; set; } = string.Empty;
    public string? PhoneNumber { get; set; }
    public string? Country { get; set; }
    public string? StreetLine1 { get; set; }
    public string? StreetLine2 { get; set; }
    public string? City { get; set; }
    public string? Province { get; set; }
    public string? PostalCode { get; set; }
    public string? TradingName { get; set; }
    public string? BusinessType { get; set; }
    public string? TaxId { get; set; }
}

public class UpdateTenantBillingDetailsCommandHandler(IApplicationDbContext context)
    : IRequestHandler<UpdateTenantBillingDetailsCommand, bool>
{
    public async Task<bool> Handle(UpdateTenantBillingDetailsCommand request, CancellationToken cancellationToken)
    {
        var tenant = await context.Tenants
            .FirstOrDefaultAsync(t => t.Id.ToString() == request.TenantId || t.TenantSlug == request.TenantId, cancellationToken);

        if (tenant == null) return false;

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
        return true;
    }
}
