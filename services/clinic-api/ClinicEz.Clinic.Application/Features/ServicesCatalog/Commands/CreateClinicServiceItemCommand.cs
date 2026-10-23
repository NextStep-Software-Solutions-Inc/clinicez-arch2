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

public record CreateClinicServiceItemCommand(
    string Code,
    string Name,
    string Category,
    decimal StandardPrice,
    string? Description = null,
    string? PhilHealthCode = null,
    string? PhilHealthDescription = null,
    bool IsPhilHealthFormulary = false
) : IRequest<ClinicServiceItemDto>;

public class CreateClinicServiceItemCommandHandler : IRequestHandler<CreateClinicServiceItemCommand, ClinicServiceItemDto>
{
    private readonly IRepository<ClinicServiceItem> _serviceRepo;
    private readonly IUnitOfWork _unitOfWork;
    private readonly IClinicContext _clinicContext;

    public CreateClinicServiceItemCommandHandler(
        IRepository<ClinicServiceItem> serviceRepo,
        IUnitOfWork unitOfWork,
        IClinicContext clinicContext)
    {
        _serviceRepo = serviceRepo;
        _unitOfWork = unitOfWork;
        _clinicContext = clinicContext;
    }

    public async Task<ClinicServiceItemDto> Handle(CreateClinicServiceItemCommand request, CancellationToken cancellationToken)
    {
        if (string.IsNullOrWhiteSpace(request.Code) || string.IsNullOrWhiteSpace(request.Name))
        {
            throw new BadRequestException("Service Code and Name are required.");
        }

        var codeUpper = request.Code.Trim().ToUpperInvariant();
        var exists = await _serviceRepo.Query(s => s.Code == codeUpper)
            .AnyAsync(cancellationToken);

        if (exists)
        {
            throw new ConflictException($"Service with code '{codeUpper}' already exists in this clinic.");
        }

        var philHealthCode = string.IsNullOrWhiteSpace(request.PhilHealthCode) ? null : request.PhilHealthCode.Trim();
        var philHealthDescription = string.IsNullOrWhiteSpace(request.PhilHealthDescription) ? null : request.PhilHealthDescription.Trim();
        var description = string.IsNullOrWhiteSpace(request.Description) ? null : request.Description.Trim();

        var entity = new ClinicServiceItem
        {
            TenantId = _clinicContext.TenantId,
            ClinicId = _clinicContext.ClinicId,
            Code = codeUpper,
            Name = request.Name.Trim(),
            Category = string.IsNullOrWhiteSpace(request.Category) ? "General" : request.Category.Trim(),
            StandardPrice = Math.Max(0m, request.StandardPrice),
            Description = description,
            IsActive = true,
            PhilHealthCode = philHealthCode,
            PhilHealthDescription = philHealthDescription,
            IsPhilHealthFormulary = request.IsPhilHealthFormulary || philHealthCode != null
        };

        await _serviceRepo.AddAsync(entity, cancellationToken);
        await _unitOfWork.SaveChangesAsync(cancellationToken);

        return new ClinicServiceItemDto(
            entity.Id,
            entity.TenantId ?? _clinicContext.TenantId,
            entity.ClinicId,
            entity.Code,
            entity.Name,
            entity.Category,
            entity.StandardPrice,
            entity.Description,
            entity.IsActive,
            entity.PhilHealthCode,
            entity.PhilHealthDescription,
            entity.IsPhilHealthFormulary
        );
    }
}
