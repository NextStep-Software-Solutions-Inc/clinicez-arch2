using System;
using System.Collections.Generic;
using System.Linq;
using System.Threading;
using System.Threading.Tasks;
using ClinicEz.Clinic.Application.Features.ServicesCatalog.DTOs;
using ClinicEz.Clinic.Domain.Entities;
using ClinicEz.Clinic.Domain.Interfaces;
using ClinicEz.Shared.Exceptions;
using MediatR;
using Microsoft.EntityFrameworkCore;

namespace ClinicEz.Clinic.Application.Features.ServicesCatalog.Commands;

public record BulkImportServicesCommand(
    List<BulkImportServiceItemDto> Items
) : IRequest<BulkImportResultDto>;

public class BulkImportServicesCommandHandler : IRequestHandler<BulkImportServicesCommand, BulkImportResultDto>
{
    private readonly IRepository<ServiceItem> _serviceRepo;
    private readonly IUnitOfWork _unitOfWork;
    private readonly IClinicContext _clinicContext;

    public BulkImportServicesCommandHandler(
        IRepository<ServiceItem> serviceRepo,
        IUnitOfWork unitOfWork,
        IClinicContext clinicContext)
    {
        _serviceRepo = serviceRepo;
        _unitOfWork = unitOfWork;
        _clinicContext = clinicContext;
    }

    public async Task<BulkImportResultDto> Handle(BulkImportServicesCommand request, CancellationToken cancellationToken)
    {
        if (request.Items == null || !request.Items.Any())
        {
            throw new BadRequestException("No items provided for bulk import.");
        }

        // Fetch existing items for the clinic to allow idempotent upsert
        var existingItems = await _serviceRepo.Query()
            .ToListAsync(cancellationToken);

        var existingMap = existingItems
            .GroupBy(s => s.Code.ToUpperInvariant())
            .ToDictionary(g => g.Key, g => g.First());

        int createdCount = 0;
        int updatedCount = 0;
        int mappedCount = 0;
        int nonFormularyCount = 0;
        var resultList = new List<ClinicServiceItemDto>();

        foreach (var row in request.Items)
        {
            if (string.IsNullOrWhiteSpace(row.Code) || string.IsNullOrWhiteSpace(row.Name))
            {
                continue;
            }

            var codeUpper = row.Code.Trim().ToUpperInvariant();
            var category = string.IsNullOrWhiteSpace(row.Category) ? "General" : row.Category.Trim();
            var standardPrice = Math.Max(0m, row.StandardPrice);
            var isPhilHealth = row.IsPhilHealthFormulary || !string.IsNullOrWhiteSpace(row.PhilHealthCode);

            if (isPhilHealth)
            {
                mappedCount++;
            }
            else
            {
                nonFormularyCount++;
            }

            if (existingMap.TryGetValue(codeUpper, out var existing))
            {
                existing.Name = row.Name.Trim();
                existing.Category = category;
                existing.StandardPrice = standardPrice;
                existing.Description = row.Description?.Trim();
                existing.IsActive = true;
                existing.PhilHealthCode = row.PhilHealthCode?.Trim();
                existing.PhilHealthDescription = row.PhilHealthDescription?.Trim();
                existing.IsPhilHealthFormulary = row.IsPhilHealthFormulary;
                existing.IsNurseOrderable = row.IsNurseOrderable;

                _serviceRepo.Update(existing);
                updatedCount++;

                resultList.Add(new ClinicServiceItemDto(
                    existing.Id,
                    existing.TenantId ?? _clinicContext.TenantId,
                    existing.ClinicId,
                    existing.Code,
                    existing.Name,
                    existing.Category,
                    existing.StandardPrice,
                    existing.Description,
                    existing.IsActive,
                    existing.PhilHealthCode,
                    existing.PhilHealthDescription,
                    existing.IsPhilHealthFormulary,
                    existing.IsNurseOrderable
                ));
            }
            else
            {
                var newItem = new ServiceItem
                {
                    TenantId = _clinicContext.TenantId,
                    ClinicId = _clinicContext.ClinicId,
                    Code = codeUpper,
                    Name = row.Name.Trim(),
                    Category = category,
                    StandardPrice = standardPrice,
                    Description = row.Description?.Trim(),
                    IsActive = true,
                    PhilHealthCode = row.PhilHealthCode?.Trim(),
                    PhilHealthDescription = row.PhilHealthDescription?.Trim(),
                    IsPhilHealthFormulary = row.IsPhilHealthFormulary,
                    IsNurseOrderable = row.IsNurseOrderable
                };

                await _serviceRepo.AddAsync(newItem, cancellationToken);
                existingMap[codeUpper] = newItem; // track in-memory in case of duplicate codes within batch
                createdCount++;

                resultList.Add(new ClinicServiceItemDto(
                    newItem.Id,
                    newItem.TenantId ?? _clinicContext.TenantId,
                    newItem.ClinicId,
                    newItem.Code,
                    newItem.Name,
                    newItem.Category,
                    newItem.StandardPrice,
                    newItem.Description,
                    newItem.IsActive,
                    newItem.PhilHealthCode,
                    newItem.PhilHealthDescription,
                    newItem.IsPhilHealthFormulary,
                    newItem.IsNurseOrderable
                ));
            }
        }

        await _unitOfWork.SaveChangesAsync(cancellationToken);

        return new BulkImportResultDto(
            TotalProcessed: createdCount + updatedCount,
            TotalCreated: createdCount,
            TotalUpdated: updatedCount,
            TotalMappedToPhilHealth: mappedCount,
            TotalNonFormulary: nonFormularyCount,
            Items: resultList
        );
    }
}
