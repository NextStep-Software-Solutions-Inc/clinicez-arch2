using System;
using System.Threading;
using System.Threading.Tasks;
using ClinicEz.Clinic.Application.Common.Interfaces;
using ClinicEz.Clinic.Application.Features.ServicesCatalog.DTOs;
using ClinicEz.Clinic.Domain.Entities;
using ClinicEz.Clinic.Domain.Interfaces;
using ClinicEz.Shared.Common;
using ClinicEz.Shared.Exceptions;
using MediatR;
using Microsoft.EntityFrameworkCore;

namespace ClinicEz.Clinic.Application.Features.ServicesCatalog.Commands;

public record UpdateClinicServiceItemCommand(
    Guid Id,
    string Name,
    string Category,
    decimal StandardPrice,
    string? Description = null,
    bool IsActive = true,
    string? PhilHealthCode = null,
    string? PhilHealthDescription = null,
    bool IsPhilHealthFormulary = false,
    bool IsNurseOrderable = false,
    bool SkipPendingVerificationSync = false
) : IRequest<ClinicServiceItemDto>;

public class UpdateClinicServiceItemCommandHandler : IRequestHandler<UpdateClinicServiceItemCommand, ClinicServiceItemDto>
{
    private readonly IRepository<ServiceItem> _serviceRepo;
    private readonly IUnitOfWork _unitOfWork;
    private readonly IClinicContext _clinicContext;
    private readonly IRepository<FacilitySettings>? _settingsRepo;
    private readonly IClinicDirectorySyncService? _directorySyncService;

    public UpdateClinicServiceItemCommandHandler(
        IRepository<ServiceItem> serviceRepo,
        IUnitOfWork unitOfWork,
        IClinicContext clinicContext,
        IRepository<FacilitySettings>? settingsRepo = null,
        IClinicDirectorySyncService? directorySyncService = null)
    {
        _serviceRepo = serviceRepo;
        _unitOfWork = unitOfWork;
        _clinicContext = clinicContext;
        _settingsRepo = settingsRepo;
        _directorySyncService = directorySyncService;
    }

    public async Task<ClinicServiceItemDto> Handle(UpdateClinicServiceItemCommand request, CancellationToken cancellationToken)
    {
        if (string.IsNullOrWhiteSpace(request.Name))
        {
            throw new BadRequestException("Service Name is required.");
        }

        var item = await _serviceRepo.GetByIdAsync(request.Id, cancellationToken);
        if (item == null)
        {
            throw new NotFoundException($"Clinic service item with ID '{request.Id}' was not found.");
        }

        var prevName = item.Name;
        var prevCategory = item.Category;
        var prevPrice = item.StandardPrice;
        var prevIsActive = item.IsActive;

        var philHealthCode = string.IsNullOrWhiteSpace(request.PhilHealthCode) ? null : request.PhilHealthCode.Trim();
        var philHealthDescription = string.IsNullOrWhiteSpace(request.PhilHealthDescription) ? null : request.PhilHealthDescription.Trim();
        var description = string.IsNullOrWhiteSpace(request.Description) ? null : request.Description.Trim();

        item.Name = request.Name.Trim();
        item.Category = string.IsNullOrWhiteSpace(request.Category) ? "General" : request.Category.Trim();
        item.StandardPrice = Math.Max(0m, request.StandardPrice);
        item.Description = description;
        item.IsActive = request.IsActive;
        item.PhilHealthCode = philHealthCode;
        item.PhilHealthDescription = philHealthDescription;
        item.IsPhilHealthFormulary = request.IsPhilHealthFormulary || philHealthCode != null;
        item.IsNurseOrderable = request.IsNurseOrderable;

        _serviceRepo.Update(item);
        await _unitOfWork.SaveChangesAsync(cancellationToken);

        var directoryFieldsChanged = (prevIsActive || item.IsActive) && (
            !string.Equals(prevName, item.Name, StringComparison.Ordinal) ||
            !string.Equals(prevCategory, item.Category, StringComparison.Ordinal) ||
            prevPrice != item.StandardPrice ||
            prevIsActive != item.IsActive);

        if (!request.SkipPendingVerificationSync
            && directoryFieldsChanged
            && _settingsRepo != null
            && _directorySyncService != null)
        {
            var settings = await _settingsRepo.Query().FirstOrDefaultAsync(cancellationToken);
            if (settings?.PlatformVerificationStatus == PlatformVerificationStatus.PendingReview)
            {
                await _directorySyncService.SyncPendingFacilityVerificationAsync(
                    settings,
                    throwOnConflict: false,
                    _clinicContext.StaffId?.ToString(),
                    _clinicContext.StaffName,
                    cancellationToken);
            }
        }

        return new ClinicServiceItemDto(
            item.Id,
            item.TenantId ?? _clinicContext.TenantId,
            item.ClinicId,
            item.Code,
            item.Name,
            item.Category,
            item.StandardPrice,
            item.Description,
            item.IsActive,
            item.PhilHealthCode,
            item.PhilHealthDescription,
            item.IsPhilHealthFormulary,
            item.IsNurseOrderable
        );
    }
}
