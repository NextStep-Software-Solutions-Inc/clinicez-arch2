namespace CLINICEZ.TenantManagement.Application.Features.TenantSettings.Dtos;

public class UpdateTenantSettingDto
{
    public Guid TenantId { get; set; }
    public string? BaseUrl { get; set; }
    public string? DBConnectionString { get; set; }
    public string? BillingContactEmail { get; set; }
}
