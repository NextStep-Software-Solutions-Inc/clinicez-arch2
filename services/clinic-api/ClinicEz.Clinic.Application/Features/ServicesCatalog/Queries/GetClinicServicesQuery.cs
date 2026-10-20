using System;
using System.Collections.Generic;
using System.Linq;
using System.Threading;
using System.Threading.Tasks;
using ClinicEz.Clinic.Application.Features.ServicesCatalog.Common;
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
    private readonly IRepository<ClinicSettings>? _settingsRepo;

    public GetClinicServicesQueryHandler(
        IRepository<ClinicServiceItem> serviceRepo,
        IUnitOfWork unitOfWork,
        IClinicContext clinicContext,
        IRepository<ClinicSettings>? settingsRepo = null)
    {
        _serviceRepo = serviceRepo;
        _unitOfWork = unitOfWork;
        _clinicContext = clinicContext;
        _settingsRepo = settingsRepo;
    }

    public async Task<List<ClinicServiceItemDto>> Handle(GetClinicServicesQuery request, CancellationToken cancellationToken)
    {
        var hasAnyServices = await _serviceRepo.Query().AnyAsync(cancellationToken);

        // Auto-seed default fee schedule if catalog is empty for this clinic
        if (!hasAnyServices)
        {
            ClinicSettings? settings = null;
            if (_settingsRepo != null)
            {
                settings = await _settingsRepo.Query().FirstOrDefaultAsync(cancellationToken);
            }

            var specialtyMode = settings?.SpecialtyMode?.Trim();
            var defaultServices = new List<ClinicServiceItem>();

            if (string.Equals(specialtyMode, "Dental", StringComparison.OrdinalIgnoreCase))
            {
                defaultServices.AddRange(DentalCatalogDefaults.CreateDefaults(_clinicContext.TenantId, _clinicContext.ClinicId));
            }
            else if (string.Equals(specialtyMode, "MultiSpecialty", StringComparison.OrdinalIgnoreCase) ||
                     string.Equals(specialtyMode, "Multi-Specialty", StringComparison.OrdinalIgnoreCase))
            {
                defaultServices.AddRange(GeneralMedicalCatalogDefaults.CreateDefaults(_clinicContext.TenantId, _clinicContext.ClinicId));
                defaultServices.AddRange(DentalCatalogDefaults.CreateDefaults(_clinicContext.TenantId, _clinicContext.ClinicId));
            }
            else
            {
                defaultServices.AddRange(GeneralMedicalCatalogDefaults.CreateDefaults(_clinicContext.TenantId, _clinicContext.ClinicId));
            }

            foreach (var svc in defaultServices)
            {
                await _serviceRepo.AddAsync(svc, cancellationToken);
            }
            await _unitOfWork.SaveChangesAsync(cancellationToken);
        }

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
