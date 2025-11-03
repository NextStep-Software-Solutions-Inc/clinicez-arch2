namespace CLINICEZ.TenantManagement.Application.Features.Modules.Dtos;

public class UpdateModuleDto
{
    public string? Name { get; set; }
    public string? Description { get; set; }
    public string? Key { get; set; }
    public bool? IsActive { get; set; }
}
