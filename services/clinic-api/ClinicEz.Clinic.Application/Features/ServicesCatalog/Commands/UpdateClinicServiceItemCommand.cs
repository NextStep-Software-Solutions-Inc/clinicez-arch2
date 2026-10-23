using System;
using System.Threading;
using System.Threading.Tasks;
using ClinicEz.Clinic.Application.Features.ServicesCatalog.DTOs;
using ClinicEz.Clinic.Domain.Entities;
using ClinicEz.Clinic.Domain.Interfaces;
using ClinicEz.Shared.Exceptions;
using MediatR;
using Microsoft.EntityFrameworkCore;

namespace ClinicEz.Clinic.Application.Features.ServicesCatalog.Commands;

public record UpdateClinicServiceItemCommand(
    string Name,
    string Category,
    decimal StandardPrice,
    Guid Id = default,
    string? Description = null,
    bool IsActive = true,
    string? PhilHealthCode = null,
    string? PhilHealthDescription = null,
    bool IsPhilHealthFormulary = false
) : IRequest<ClinicServiceItemDto>;

public class UpdateClinicServiceItemCommandHandler : IRequestHandler<UpdateClinicServiceItemCommand, ClinicServiceItemDto>
{
    private readonly IRepository<ClinicServiceItem> _serviceRepo;
    private readonly IUnitOfWork _unitOfWork;
    private readonly IClinicContext _clinicContext;

    public UpdateClinicServiceItemCommandHandler(
        IRepository<ClinicServiceItem> serviceRepo,
        IUnitOfWork unitOfWork,
        IClinicContext clinicContext)
    {
        _serviceRepo = serviceRepo;
        _unitOfWork = unitOfWork;
        _clinicContext = clinicContext;
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

        _serviceRepo.Update(item);
        await _unitOfWork.SaveChangesAsync(cancellationToken);

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
            item.IsPhilHealthFormulary
        );
    }
}
