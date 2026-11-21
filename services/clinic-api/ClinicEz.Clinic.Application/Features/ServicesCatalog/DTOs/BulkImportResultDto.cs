using System.Collections.Generic;

namespace ClinicEz.Clinic.Application.Features.ServicesCatalog.DTOs;

public record BulkImportServiceItemDto(
    string Code,
    string Name,
    string Category,
    decimal StandardPrice,
    string? Description = null,
    string? PhilHealthCode = null,
    string? PhilHealthDescription = null,
    bool IsPhilHealthFormulary = false,
    bool IsNurseOrderable = false
);

public record BulkImportResultDto(
    int TotalProcessed,
    int TotalCreated,
    int TotalUpdated,
    int TotalMappedToPhilHealth,
    int TotalNonFormulary,
    List<ClinicServiceItemDto> Items
);
