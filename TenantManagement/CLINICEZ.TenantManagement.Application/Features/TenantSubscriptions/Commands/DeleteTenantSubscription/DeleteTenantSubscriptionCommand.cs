using CLINICEZ.Shared.Common;
using MediatR;

namespace CLINICEZ.TenantManagement.Application.Features.TenantSubscriptions.Commands.DeleteTenantSubscription;

public record class DeleteTenantSubscriptionCommand(Guid Id) : IRequest<ApiResponse<Unit>>;
