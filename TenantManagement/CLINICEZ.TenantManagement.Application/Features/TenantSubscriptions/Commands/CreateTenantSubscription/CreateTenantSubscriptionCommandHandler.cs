using CLINICEZ.Shared.Common;
using CLINICEZ.Shared.Exceptions;
using CLINICEZ.TenantManagement.Domain.Entities;
using CLINICEZ.TenantManagement.Domain.Enums;
using CLINICEZ.TenantManagement.Domain.Interfaces;
using MediatR;

namespace CLINICEZ.TenantManagement.Application.Features.TenantSubscriptions.Commands.CreateTenantSubscription;

public sealed class CreateTenantSubscriptionCommandHandler(IUnitOfWork _unitOfWork) : IRequestHandler<CreateTenantSubscriptionCommand, ApiResponse<Guid>>
{
    public async Task<ApiResponse<Guid>> Handle(CreateTenantSubscriptionCommand command, CancellationToken cancellationToken)
    {
        var existTenant = await _unitOfWork.TenantRepository.GetByIdAsync(command.TenantId, cancellationToken: cancellationToken) ?? throw new NotFoundException("Tenant does not exist.");
        var existTenantSubscription = await _unitOfWork.TenantSubscriptionRepository.FindAsync(ts =>
            ts.TenantId == command.TenantId &&
            ts.StartDate == command.StartDate &&
            ts.EndDate == command.EndDate && !ts.IsDeleted, cancellationToken);

        if(existTenantSubscription != null)
        {
            throw new ConflictException("Tenant subscription already exist.");
        }
        var validation = EnumValidator.ValidateAll(
            (typeof(Plan), command.Plan, nameof(command.Plan)),
            (typeof(BillingCycle), command.BillingCycle, nameof(command.BillingCycle)),
            (typeof(Status), command.Status, nameof(command.Status))
        );

        if (!validation.IsValid)
        {
            return new()
            {
                Succeeded = false,
                Message = validation.ErrorMessage
            };
        }

        var plan = Enum.TryParse(command.Plan, out Plan parsedPlan) ? parsedPlan : throw new ArgumentException("Invalid plan value.");
        var billingCycle = Enum.TryParse(command.BillingCycle, out BillingCycle parsedBillingCycle) ? parsedBillingCycle : throw new ArgumentException("Invalid billing cycle value.");
        var status = Enum.TryParse(command.Status, out Status parsedStatus) ? parsedStatus : throw new ArgumentException("Invalid status value.");

        var tenantSubscription = new TenantSubscription
        {
            TenantId = command.TenantId,
            Amount = command.Amount,
            Plan = plan ,
            StartDate = command.StartDate,
            EndDate = command.EndDate,
            BillingCycle = billingCycle,
            Status = status,
            AutoRenew = command.AutoRenew
        };

        await _unitOfWork.TenantSubscriptionRepository.AddAsync(tenantSubscription, cancellationToken);
        await _unitOfWork.SaveChangesAsync(cancellationToken);
        return ApiResponse<Guid>.Success(tenantSubscription.Id, "Tenant subscription created successfully.");
    }
}
