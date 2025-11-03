using CLINICEZ.Shared.Common;
using CLINICEZ.Shared.Exceptions;
using CLINICEZ.TenantManagement.Application.Features.TenantSubscriptions.Dtos;
using CLINICEZ.TenantManagement.Domain.Interfaces;
using MediatR;

namespace CLINICEZ.TenantManagement.Application.Features.TenantSubscriptions.Queries.GetTenantSubscriptionById;

public sealed class GetTenantSubscriptionQueryHandler(IUnitOfWork unitOfWork) : IRequestHandler<GetTenantSubscriptionByIdQuery, ApiResponse<TenantSubscriptionDto>>
{
    public async Task<ApiResponse<TenantSubscriptionDto>> Handle(
        GetTenantSubscriptionByIdQuery request,
        CancellationToken cancellationToken)
    {
        var tenantSubscription = await unitOfWork.TenantSubscriptionRepository.GetByIdAsync(request.Id, cancellationToken: cancellationToken) ?? throw new NotFoundException("Tenant subscription not found.");

        var dto = new TenantSubscriptionDto
        {
            Id = tenantSubscription.Id,
            TenantId = tenantSubscription.TenantId,
            Amount = tenantSubscription.Amount,
            Plan = tenantSubscription.Plan.ToString(),
            Status = tenantSubscription.Status.ToString(),
            BillingCycle = tenantSubscription.BillingCycle.ToString(),
            StartDate = tenantSubscription.StartDate,
            EndDate = tenantSubscription.EndDate,
            AutoRenew = tenantSubscription.AutoRenew
        };
        return ApiResponse<TenantSubscriptionDto>.Success(dto, "Tenant subscription retrieved successfully.");
    }
}
