using System;
using System.Threading;
using System.Threading.Tasks;
using ClinicEz.Clinic.Application.Common.Interfaces;
using ClinicEz.Clinic.Application.Features.CustomFields.DTOs;
using ClinicEz.Clinic.Domain.Entities;
using ClinicEz.Clinic.Domain.Interfaces;
using MediatR;

namespace ClinicEz.Clinic.Application.Features.CustomFields.Commands;

public sealed record CreateCustomFieldDefinitionCommand(
    string FieldKey,
    string Label,
    CustomFieldDataType DataType,
    string? EntityType = "ClinicPatient",
    string? Category = null,
    bool IsRequired = false,
    int DisplayOrder = 0,
    string? OptionsJson = null,
    string? Placeholder = null) : IRequest<ClinicCustomFieldDefinitionDto>;

public sealed class CreateCustomFieldDefinitionCommandHandler : IRequestHandler<CreateCustomFieldDefinitionCommand, ClinicCustomFieldDefinitionDto>
{
    private readonly IRepository<ClinicCustomFieldDefinition> _repo;
    private readonly IUnitOfWork _unitOfWork;
    private readonly IClinicContext _clinicContext;

    public CreateCustomFieldDefinitionCommandHandler(
        IRepository<ClinicCustomFieldDefinition> repo,
        IUnitOfWork unitOfWork,
        IClinicContext clinicContext)
    {
        _repo = repo;
        _unitOfWork = unitOfWork;
        _clinicContext = clinicContext;
    }

    public async Task<ClinicCustomFieldDefinitionDto> Handle(CreateCustomFieldDefinitionCommand request, CancellationToken ct)
    {
        var entity = new ClinicCustomFieldDefinition
        {
            Id = Guid.NewGuid(),
            TenantId = _clinicContext.TenantId,
            ClinicId = _clinicContext.ClinicId,
            EntityType = string.IsNullOrWhiteSpace(request.EntityType) ? "ClinicPatient" : request.EntityType.Trim(),
            FieldKey = request.FieldKey.Trim().ToLowerInvariant().Replace(" ", "_"),
            Label = request.Label.Trim(),
            DataType = request.DataType,
            Category = request.Category?.Trim(),
            IsRequired = request.IsRequired,
            DisplayOrder = request.DisplayOrder,
            OptionsJson = request.OptionsJson,
            Placeholder = request.Placeholder?.Trim(),
            IsActive = true,
            CreatedAt = DateTime.UtcNow,
            CreatedBy = "ClinicAdmin"
        };

        await _repo.AddAsync(entity, ct);
        await _unitOfWork.SaveChangesAsync(ct);

        return new ClinicCustomFieldDefinitionDto(
            entity.Id,
            entity.TenantId,
            entity.ClinicId,
            entity.EntityType,
            entity.FieldKey,
            entity.Label,
            entity.DataType,
            entity.Category,
            entity.IsRequired,
            entity.DisplayOrder,
            entity.OptionsJson,
            entity.Placeholder,
            entity.IsActive,
            entity.CreatedAt);
    }
}
