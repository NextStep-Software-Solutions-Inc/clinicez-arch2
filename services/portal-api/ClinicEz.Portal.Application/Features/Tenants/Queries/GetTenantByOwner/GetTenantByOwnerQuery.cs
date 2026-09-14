using ClinicEz.Portal.Domain.Interfaces;
using MediatR;
using System.Threading;
using System.Threading.Tasks;

namespace ClinicEz.Portal.Application.Features.Tenants.Queries.GetTenantByOwner;

public record GetTenantByOwnerQuery(string OwnerId) : IRequest<TenantDto?>;

public record TenantDto(string TenantSlug, string Name, string TenantType);

public class GetTenantByOwnerQueryHandler : IRequestHandler<GetTenantByOwnerQuery, TenantDto?>
{
    private readonly IUnitOfWork _unitOfWork;

    public GetTenantByOwnerQueryHandler(IUnitOfWork unitOfWork)
    {
        _unitOfWork = unitOfWork;
    }

    public async Task<TenantDto?> Handle(GetTenantByOwnerQuery request, CancellationToken cancellationToken)
    {
        var tenant = await _unitOfWork.TenantRepository.FindAsync(t => t.OwnerId == request.OwnerId, cancellationToken);
        if (tenant == null) return null;
        return new TenantDto(tenant.TenantSlug, tenant.Name, tenant.TenantType);
    }
}
