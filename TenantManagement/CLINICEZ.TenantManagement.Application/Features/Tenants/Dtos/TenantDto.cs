using CLINICEZ.TenantManagement.Application.Features.TenantMembers.Dtos;
using CLINICEZ.TenantManagement.Application.Features.TenantSettings.Dtos;
using CLINICEZ.TenantManagement.Application.Features.TenantSubscriptions.Dtos;

namespace CLINICEZ.TenantManagement.Application.Features.Tenants.Dtos;

public class TenantDto
{
    public Guid Id { get; set; }
    public string Name { get; set; } = string.Empty;
    public string? Description { get; set; }
    public TenantSettingDto? TenantSetting { get; set; }
    public List<TenantSubscriptionDto> TenantSubscriptions { get; set; } = [];
    public List<TenantMemberDto> TenantMembers { get; set; } = [];
}