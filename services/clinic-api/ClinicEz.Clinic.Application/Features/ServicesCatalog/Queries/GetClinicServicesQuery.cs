using System;
using System.Collections.Generic;
using System.Linq;
using System.Threading;
using System.Threading.Tasks;
using ClinicEz.Clinic.Application.Features.ServicesCatalog.DTOs;
using ClinicEz.Clinic.Domain.Entities;
using ClinicEz.Clinic.Domain.Interfaces;
using MediatR;
using Microsoft.EntityFrameworkCore;

namespace ClinicEz.Clinic.Application.Features.ServicesCatalog.Queries;

public record GetClinicServicesQuery(string? Category = null, bool? IsActive = null) : IRequest<List<ClinicServiceItemDto>>;

public class GetClinicServicesQueryHandler : IRequestHandler<GetClinicServicesQuery, List<ClinicServiceItemDto>>
{
    private readonly IRepository<ClinicServiceItem> _serviceRepo;
    private readonly IUnitOfWork _unitOfWork;
    private readonly IClinicContext _clinicContext;

    public GetClinicServicesQueryHandler(
        IRepository<ClinicServiceItem> serviceRepo,
        IUnitOfWork unitOfWork,
        IClinicContext clinicContext)
    {
        _serviceRepo = serviceRepo;
        _unitOfWork = unitOfWork;
        _clinicContext = clinicContext;
    }

    public async Task<List<ClinicServiceItemDto>> Handle(GetClinicServicesQuery request, CancellationToken cancellationToken)
    {
        var query = _serviceRepo.Query();

        if (!string.IsNullOrWhiteSpace(request.Category))
        {
            query = query.Where(s => s.Category.ToLower() == request.Category.ToLower());
        }

        if (request.IsActive.HasValue)
        {
            query = query.Where(s => s.IsActive == request.IsActive.Value);
        }

        var items = await query
            .OrderBy(s => s.Category)
            .ThenBy(s => s.Name)
            .ToListAsync(cancellationToken);

        // Auto-seed default primary care fee schedule if empty for this clinic
        if (!items.Any() && string.IsNullOrWhiteSpace(request.Category))
        {
            var defaultServices = new List<ClinicServiceItem>
            {
                new() { TenantId = _clinicContext.TenantId, ClinicId = _clinicContext.ClinicId, Code = "CONS-GEN", Name = "General Consultation", Category = "Consultation", StandardPrice = 500m, Description = "Comprehensive outpatient primary care medical consultation" },
                new() { TenantId = _clinicContext.TenantId, ClinicId = _clinicContext.ClinicId, Code = "CONS-PEDIA", Name = "Pediatric Consultation", Category = "Consultation", StandardPrice = 600m, Description = "Infant and child wellness and acute illness consultation" },
                new() { TenantId = _clinicContext.TenantId, ClinicId = _clinicContext.ClinicId, Code = "CONS-FU", Name = "Follow-up Consultation", Category = "Consultation", StandardPrice = 350m, Description = "Return follow-up review within 14 days" },
                new() { TenantId = _clinicContext.TenantId, ClinicId = _clinicContext.ClinicId, Code = "PROC-NEB", Name = "Nebulization Therapy", Category = "Procedure", StandardPrice = 250m, Description = "Inhalation bronchodilator nebulization session" },
                new() { TenantId = _clinicContext.TenantId, ClinicId = _clinicContext.ClinicId, Code = "PROC-WOUND", Name = "Wound Dressing & Debridement", Category = "Procedure", StandardPrice = 350m, Description = "Aseptic wound dressing, cleansing, and bandage application" },
                new() { TenantId = _clinicContext.TenantId, ClinicId = _clinicContext.ClinicId, Code = "PROC-ECG", Name = "12-Lead Electrocardiogram (ECG)", Category = "Diagnostic", StandardPrice = 450m, Description = "Standard 12-lead ECG tracing with physician interpretation", PhilHealthCode = "93000", PhilHealthDescription = "Electrocardiogram, routine ECG with at least 12 leads", IsPhilHealthFormulary = true },
                new() { TenantId = _clinicContext.TenantId, ClinicId = _clinicContext.ClinicId, Code = "PROC-SUTURE", Name = "Minor Suture / Laceration Repair", Category = "Procedure", StandardPrice = 850m, Description = "Local anesthesia and primary closure of minor skin laceration" },
                new() { TenantId = _clinicContext.TenantId, ClinicId = _clinicContext.ClinicId, Code = "PROC-VAX", Name = "Vaccine Administration Fee", Category = "NursingService", StandardPrice = 250m, Description = "Intramuscular or subcutaneous vaccine administration and observation" },
                new() { TenantId = _clinicContext.TenantId, ClinicId = _clinicContext.ClinicId, Code = "LAB-RBS", Name = "Random Blood Sugar (RBS) Rapid Test", Category = "Diagnostic", StandardPrice = 150m, Description = "Capillary blood glucose fingerstick test", PhilHealthCode = "82947", PhilHealthDescription = "Glucose; quantitative, blood (except reagent strip)", IsPhilHealthFormulary = true }
            };

            foreach (var svc in defaultServices)
            {
                await _serviceRepo.AddAsync(svc, cancellationToken);
            }
            await _unitOfWork.SaveChangesAsync(cancellationToken);

            items = defaultServices;
        }

        return items.Select(s => new ClinicServiceItemDto(
            s.Id,
            s.TenantId ?? _clinicContext.TenantId,
            s.ClinicId,
            s.Code,
            s.Name,
            s.Category,
            s.StandardPrice,
            s.Description,
            s.IsActive,
            s.PhilHealthCode,
            s.PhilHealthDescription,
            s.IsPhilHealthFormulary
        )).ToList();
    }
}
