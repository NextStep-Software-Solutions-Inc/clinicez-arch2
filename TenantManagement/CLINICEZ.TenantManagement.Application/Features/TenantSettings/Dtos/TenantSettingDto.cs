namespace CLINICEZ.TenantManagement.Application.Features.TenantSettings.Dtos;

public class TenantSettingDto
{
    public Guid Id { get; set; }
    public bool OnPremise { get; set; }
    public string BaseURL { get; set; } = string.Empty;
    public string DbConnectionString { get; set; } = string.Empty;
    public string BillingContactEmail { get; set; } = string.Empty;
}