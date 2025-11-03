namespace CLINICEZ.TenantManagement.Application.Features.TenantSubscriptions.Dtos;

public class TenantSubscriptionDto
{
    public Guid Id { get; set; }
    public Guid TenantId { get; set; }
    public decimal Amount { get; set; }
    public required string Plan { get; set; }
    public required string Status { get; set; }
    public required string BillingCycle { get; set; }
    public required DateTime StartDate { get; set; }
    public required DateTime EndDate { get; set; }
    public required bool AutoRenew { get; set; }
}
