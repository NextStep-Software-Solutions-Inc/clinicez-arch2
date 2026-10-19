using System;
using System.Collections.Generic;
using System.Linq;
using System.Threading;
using System.Threading.Tasks;
using ClinicEz.Clinic.Application.Common.Interfaces;
using ClinicEz.Clinic.Application.Features.CustomFields.DTOs;
using ClinicEz.Clinic.Application.Features.CustomFields.Templates;
using ClinicEz.Clinic.Domain.Entities;
using ClinicEz.Clinic.Domain.Interfaces;
using FluentValidation;
using MediatR;
using Microsoft.EntityFrameworkCore;

namespace ClinicEz.Clinic.Application.Features.CustomFields.Commands;

public sealed record InstallCustomFieldTemplateCommand(
    string TemplateKey,
    string? EntityType = "ClinicPatient") : IRequest<IReadOnlyList<ClinicCustomFieldDefinitionDto>>;

public sealed class InstallCustomFieldTemplateCommandValidator : AbstractValidator<InstallCustomFieldTemplateCommand>
{
    public InstallCustomFieldTemplateCommandValidator()
    {
        RuleFor(x => x.TemplateKey)
            .NotEmpty().WithMessage("Template key is required.");
    }
}

public sealed class InstallCustomFieldTemplateCommandHandler : IRequestHandler<InstallCustomFieldTemplateCommand, IReadOnlyList<ClinicCustomFieldDefinitionDto>>
{
    private readonly IRepository<ClinicCustomFieldDefinition> _repo;
    private readonly IUnitOfWork _unitOfWork;
    private readonly IClinicContext _clinicContext;

    public InstallCustomFieldTemplateCommandHandler(
        IRepository<ClinicCustomFieldDefinition> repo,
        IUnitOfWork unitOfWork,
        IClinicContext clinicContext)
    {
        _repo = repo;
        _unitOfWork = unitOfWork;
        _clinicContext = clinicContext;
    }

    public async Task<IReadOnlyList<ClinicCustomFieldDefinitionDto>> Handle(InstallCustomFieldTemplateCommand request, CancellationToken ct)
    {
        var template = ClinicCustomFieldTemplatesCatalog.GetTemplate(request.TemplateKey);
        if (template == null)
        {
            throw new KeyNotFoundException($"Template '{request.TemplateKey}' was not found in the custom field templates catalog.");
        }

        var targetEntityType = string.IsNullOrWhiteSpace(request.EntityType) ? template.EntityType : request.EntityType.Trim();

        var existingFields = await _repo.Query()
            .Where(f => f.EntityType == targetEntityType)
            .ToListAsync(ct);

        var existingMap = existingFields.ToDictionary(f => f.FieldKey, StringComparer.OrdinalIgnoreCase);

        foreach (var fieldTemplate in template.Fields)
        {
            if (existingMap.TryGetValue(fieldTemplate.FieldKey, out var existing))
            {
                // Update in place (idempotent installation)
                existing.Label = fieldTemplate.Label;
                existing.DataType = fieldTemplate.DataType;
                existing.Category = fieldTemplate.Category;
                existing.IsRequired = fieldTemplate.IsRequired;
                existing.DisplayOrder = fieldTemplate.DisplayOrder;
                existing.OptionsJson = fieldTemplate.OptionsJson;
                existing.Placeholder = fieldTemplate.Placeholder;
                existing.VisibilityRuleJson = fieldTemplate.VisibilityRuleJson;
                existing.ConditionalOptionsJson = fieldTemplate.ConditionalOptionsJson;
                existing.IsActive = true;
                existing.IsDeleted = false;
                existing.DeletedAt = null;
                existing.DeletedBy = null;
                existing.UpdatedAt = DateTime.UtcNow;
                existing.UpdatedBy = "ClinicAdmin";
            }
            else
            {
                // Create new field definition
                var newEntity = new ClinicCustomFieldDefinition
                {
                    Id = Guid.NewGuid(),
                    TenantId = _clinicContext.TenantId,
                    ClinicId = _clinicContext.ClinicId,
                    EntityType = targetEntityType,
                    FieldKey = fieldTemplate.FieldKey,
                    Label = fieldTemplate.Label,
                    DataType = fieldTemplate.DataType,
                    Category = fieldTemplate.Category,
                    IsRequired = fieldTemplate.IsRequired,
                    DisplayOrder = fieldTemplate.DisplayOrder,
                    OptionsJson = fieldTemplate.OptionsJson,
                    Placeholder = fieldTemplate.Placeholder,
                    VisibilityRuleJson = fieldTemplate.VisibilityRuleJson,
                    ConditionalOptionsJson = fieldTemplate.ConditionalOptionsJson,
                    IsActive = true,
                    CreatedAt = DateTime.UtcNow,
                    CreatedBy = "ClinicAdmin"
                };

                await _repo.AddAsync(newEntity, ct);
            }
        }

        await _unitOfWork.SaveChangesAsync(ct);

        // Return all active definitions for this entity type ordered deterministically
        var activeFields = await _repo.Query()
            .AsNoTracking()
            .Where(f => f.EntityType == targetEntityType && f.IsActive)
            .OrderBy(f => f.DisplayOrder)
            .ThenBy(f => f.Label)
            .ToListAsync(ct);

        return activeFields.Select(f => new ClinicCustomFieldDefinitionDto(
            f.Id,
            f.TenantId,
            f.ClinicId,
            f.EntityType,
            f.FieldKey,
            f.Label,
            f.DataType,
            f.Category,
            f.IsRequired,
            f.DisplayOrder,
            f.OptionsJson,
            f.Placeholder,
            f.IsActive,
            f.CreatedAt,
            f.VisibilityRuleJson,
            f.ConditionalOptionsJson
        )).ToList().AsReadOnly();
    }
}
