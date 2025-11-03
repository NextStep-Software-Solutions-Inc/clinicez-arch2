using CLINICEZ.Shared.Common;
using CLINICEZ.Shared.Exceptions;
using CLINICEZ.TenantManagement.Domain.Enums;
using CLINICEZ.TenantManagement.Domain.Interfaces;
using MediatR;

namespace CLINICEZ.TenantManagement.Application.Features.TenantSubscriptions.Commands.UpdateTenantSubscription;

public class UpdateTenantSubscriptionCommandHandler(IUnitOfWork unitOfWork)
    : IRequestHandler<UpdateTenantSubscriptionCommand, ApiResponse<Guid>>
{
    public async Task<ApiResponse<Guid>> Handle(UpdateTenantSubscriptionCommand request, CancellationToken cancellationToken)
    {
        var dto = request.UpdateTenantSubscription;

        var tenantSubscription = await unitOfWork.TenantSubscriptionRepository
            .FindAsync(ts => ts.Id == request.Id, cancellationToken: cancellationToken) ?? throw new NotFoundException("Tenant subscription not found.");
        if (dto.TenantId.HasValue)
        {
            var existTenant = await unitOfWork.TenantRepository.GetByIdAsync(dto.TenantId.Value, cancellationToken: cancellationToken) ?? throw new NotFoundException("Tenant not found.");
            tenantSubscription.TenantId = dto.TenantId.Value;
        }

        var validation = EnumValidator.ValidateAll(
            (typeof(Plan), dto.Plan, nameof(dto.Plan)),
            (typeof(BillingCycle), dto.BillingCycle, nameof(dto.BillingCycle)),
            (typeof(Status), dto.Status, nameof(dto.Status))
        );

        if (!validation.IsValid) throw new BadRequestException(validation.ErrorMessage);
        
        tenantSubscription.Amount = dto.Amount ?? tenantSubscription.Amount;
        tenantSubscription.StartDate = dto.StartDate ?? tenantSubscription.StartDate;
        tenantSubscription.EndDate = dto.EndDate ?? tenantSubscription.EndDate;
        tenantSubscription.AutoRenew = dto.AutoRenew ?? tenantSubscription.AutoRenew;

        if (!string.IsNullOrWhiteSpace(dto.Plan)) tenantSubscription.Plan = Enum.TryParse(dto.Plan, out Plan plan) ? plan : throw new ArgumentException("Invalid plan value.");

        if (!string.IsNullOrWhiteSpace(dto.Status)) tenantSubscription.Status = Enum.TryParse(dto.Status, out Status status) ? status : throw new ArgumentException("Invalid status value.");

        if (!string.IsNullOrWhiteSpace(dto.BillingCycle)) tenantSubscription.BillingCycle = Enum.TryParse(dto.BillingCycle, out BillingCycle billingCycle) ? billingCycle : throw new ArgumentException("Invalid billing cycle value.");

        unitOfWork.TenantSubscriptionRepository.Update(tenantSubscription);
        await unitOfWork.SaveChangesAsync(cancellationToken);

        return ApiResponse<Guid>.Success(tenantSubscription.Id, "Tenant subscription updated successfully.");
    }
}
