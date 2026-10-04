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

        item.Name = request.Name.Trim();
        item.Category = string.IsNullOrWhiteSpace(request.Category) ? "General" : request.Category.Trim();
        item.StandardPrice = Math.Max(0m, request.StandardPrice);
        item.Description = request.Description?.Trim();
        item.IsActive = request.IsActive;
        item.PhilHealthCode = request.PhilHealthCode?.Trim();
        item.PhilHealthDescription = request.PhilHealthDescription?.Trim();
        item.IsPhilHealthFormulary = request.IsPhilHealthFormulary;

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
