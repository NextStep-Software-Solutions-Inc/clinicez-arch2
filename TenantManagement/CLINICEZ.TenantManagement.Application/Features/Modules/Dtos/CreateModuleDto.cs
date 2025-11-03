namespace CLINICEZ.TenantManagement.Application.Features.Modules.Dtos;

public class CreateModuleDto
{
    public string Name { get; set; } = string.Empty;
    public string? Description { get; set; }
    public string Key { get; set; } = string.Empty;
    public bool IsActive { get; set; }
}
