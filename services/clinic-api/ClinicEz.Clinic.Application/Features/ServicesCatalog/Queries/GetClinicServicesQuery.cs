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
        ClinicSettings? settings = null;
        if (_settingsRepo != null)
        {
            settings = await _settingsRepo.Query().FirstOrDefaultAsync(cancellationToken);
        }

        var specialtyMode = settings?.SpecialtyMode?.Trim();
        bool isDental = string.Equals(specialtyMode, "Dental", StringComparison.OrdinalIgnoreCase);
        bool isMultiSpecialty = string.Equals(specialtyMode, "MultiSpecialty", StringComparison.OrdinalIgnoreCase) ||
                                string.Equals(specialtyMode, "Multi-Specialty", StringComparison.OrdinalIgnoreCase);

        // Fetch all existing services for this clinic, including soft-deleted items to prevent duplicate key violations
        var allServices = await _serviceRepo.Query()
            .IgnoreQueryFilters()
            .Where(s => s.ClinicId == _clinicContext.ClinicId)
            .ToListAsync(cancellationToken);

        var existingMap = allServices
            .Where(s => !string.IsNullOrWhiteSpace(s.Code))
            .GroupBy(s => s.Code.Trim().ToUpperInvariant())
            .ToDictionary(g => g.Key, g => g.First());

        bool anyCreatedOrRestored = false;
        var targetDefaults = new List<ClinicServiceItem>();

        if (isDental)
        {
            // Dental clinic: ensure all canonical dental presets exist
            targetDefaults.AddRange(DentalCatalogDefaults.CreateDefaults(_clinicContext.TenantId, _clinicContext.ClinicId));
        }
        else if (isMultiSpecialty)
        {
            // Multi-specialty clinic: ensure both general medical and dental presets exist
            targetDefaults.AddRange(GeneralMedicalCatalogDefaults.CreateDefaults(_clinicContext.TenantId, _clinicContext.ClinicId));
            targetDefaults.AddRange(DentalCatalogDefaults.CreateDefaults(_clinicContext.TenantId, _clinicContext.ClinicId));
        }
        else
        {
            // Medical or default clinic: if no active services exist at all, seed general medical presets
            if (!allServices.Any(s => !s.IsDeleted))
            {
                targetDefaults.AddRange(GeneralMedicalCatalogDefaults.CreateDefaults(_clinicContext.TenantId, _clinicContext.ClinicId));
            }
        }

        foreach (var def in targetDefaults)
        {
            var codeUpper = def.Code.Trim().ToUpperInvariant();
            if (existingMap.TryGetValue(codeUpper, out var existingItem))
            {
                if (existingItem.IsDeleted)
                {
                    existingItem.IsDeleted = false;
                    existingItem.DeletedAt = null;
                    existingItem.DeletedBy = null;
                    existingItem.IsActive = true;
                    anyCreatedOrRestored = true;
                }
            }
            else
            {
                def.Id = def.Id == Guid.Empty ? Guid.NewGuid() : def.Id;
                await _serviceRepo.AddAsync(def, cancellationToken);
                existingMap[codeUpper] = def;
                allServices.Add(def);
                anyCreatedOrRestored = true;
            }
        }

        if (anyCreatedOrRestored)
        {
            try
            {
                await _unitOfWork.SaveChangesAsync(cancellationToken);
            }
            catch (DbUpdateException)
            {
                // Idempotent concurrency safety: another thread/request committed concurrently
            }
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
