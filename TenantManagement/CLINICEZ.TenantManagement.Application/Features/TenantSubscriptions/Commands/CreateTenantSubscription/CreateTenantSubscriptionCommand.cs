using CLINICEZ.Shared.Common;
using MediatR;

namespace CLINICEZ.TenantManagement.Application.Features.TenantSubscriptions.Commands.CreateTenantSubscription;

public class CreateTenantSubscriptionCommand : IRequest<ApiResponse<Guid>>
{
    public Guid TenantId { get; set; }
    public int Amount { get; set; }
    public string Plan { get; set; } = string.Empty;
    public DateTime StartDate { get; set; }
    public DateTime EndDate { get; set; }
    public string BillingCycle { get; set; } = string.Empty;
    public string Status { get; set; } = string.Empty;
    public bool AutoRenew { get; set; }
}
