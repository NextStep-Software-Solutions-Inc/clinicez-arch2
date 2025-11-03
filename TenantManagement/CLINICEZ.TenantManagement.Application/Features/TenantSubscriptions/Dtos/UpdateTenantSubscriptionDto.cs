namespace CLINICEZ.TenantManagement.Application.Features.TenantSubscriptions.Dtos;

public class UpdateTenantSubscriptionDto
{
    public Guid? TenantId { get; set; }
    public decimal? Amount { get; set; }
    public string? Plan { get; set; }
    public DateTime? StartDate { get; set; }
    public DateTime? EndDate { get; set; }
    public string? Status { get; set; }
    public string? BillingCycle { get; set; }
    public bool? AutoRenew { get; set; }

}
