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

namespace ClinicEz.Clinic.Application.Features.ServicesCatalog.Commands;

public sealed record SeedDentalServicesCommand : IRequest<List<ClinicServiceItemDto>>;

public sealed class SeedDentalServicesCommandHandler : IRequestHandler<SeedDentalServicesCommand, List<ClinicServiceItemDto>>
{
    private readonly IRepository<ServiceItem> _serviceRepo;
    private readonly IUnitOfWork _unitOfWork;
    private readonly IClinicContext _clinicContext;

    public SeedDentalServicesCommandHandler(
        IRepository<ServiceItem> serviceRepo,
        IUnitOfWork unitOfWork,
        IClinicContext clinicContext)
    {
        _serviceRepo = serviceRepo;
        _unitOfWork = unitOfWork;
        _clinicContext = clinicContext;
    }

    public async Task<List<ClinicServiceItemDto>> Handle(SeedDentalServicesCommand request, CancellationToken cancellationToken)
    {
        var allServices = await _serviceRepo.Query()
            .IgnoreQueryFilters()
            .Where(s => s.ClinicId == _clinicContext.ClinicId)
            .ToListAsync(cancellationToken);

        var existingMap = allServices
            .Where(s => !string.IsNullOrWhiteSpace(s.Code))
            .GroupBy(s => s.Code.Trim().ToUpperInvariant())
            .ToDictionary(g => g.Key, g => g.First());

        bool anyCreatedOrRestored = false;
        var canonicalCodes = DentalCatalogDefaults.Defaults
            .Select(d => d.Code.Trim().ToUpperInvariant())
            .ToHashSet();

        foreach (var def in DentalCatalogDefaults.Defaults)
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
                var newItem = new ServiceItem
                {
                    Id = Guid.NewGuid(),
                    TenantId = _clinicContext.TenantId,
                    ClinicId = _clinicContext.ClinicId,
                    Code = def.Code,
                    Name = def.Name,
                    Category = def.Category,
                    StandardPrice = def.StandardPrice,
                    Description = def.Description,
                    IsActive = true
                };

                await _serviceRepo.AddAsync(newItem, cancellationToken);
                existingMap[codeUpper] = newItem;
                allServices.Add(newItem);
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
                // Idempotent recovery for concurrent execution
            }
        }

        var currentServices = await _serviceRepo.Query()
            .ToListAsync(cancellationToken);

        var activeDentalItems = currentServices
            .Where(s => !string.IsNullOrWhiteSpace(s.Code) && canonicalCodes.Contains(s.Code.Trim().ToUpperInvariant()))
            .OrderBy(s => s.Code)
            .ToList();

        return activeDentalItems.Select(s => new ClinicServiceItemDto(
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
            s.IsPhilHealthFormulary,
            s.IsNurseOrderable
        )).ToList();
    }
}
