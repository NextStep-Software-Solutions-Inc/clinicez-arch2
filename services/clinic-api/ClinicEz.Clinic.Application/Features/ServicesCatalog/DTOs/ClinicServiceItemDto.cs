using System;

namespace ClinicEz.Clinic.Application.Features.ServicesCatalog.DTOs;

public record ClinicServiceItemDto(
    Guid Id,
    string TenantId,
    Guid ClinicId,
    string Code,
    string Name,
    string Category,
    decimal StandardPrice,
    string? Description,
    bool IsActive,
    string? PhilHealthCode = null,
    string? PhilHealthDescription = null,
    bool IsPhilHealthFormulary = false
);
