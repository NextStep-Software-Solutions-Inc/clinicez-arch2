using System;
using System.Collections.Generic;
using System.Linq;
using System.Threading;
using System.Threading.Tasks;
using ClinicEz.Clinic.Application.Common.Interfaces;
using ClinicEz.Clinic.Application.Features.CustomFields.DTOs;
using ClinicEz.Clinic.Domain.Entities;
using ClinicEz.Clinic.Domain.Interfaces;
using FluentValidation;
using MediatR;
using Microsoft.EntityFrameworkCore;

namespace ClinicEz.Clinic.Application.Features.CustomFields.Commands;

public sealed record CustomFieldOrderItem(Guid Id, int DisplayOrder);

public sealed record ReorderCustomFieldsCommand : IRequest<IReadOnlyList<ClinicCustomFieldDefinitionDto>>
{
    public string? EntityType { get; init; } = "ClinicPatient";
    public IReadOnlyList<CustomFieldOrderItem>? Items { get; init; }
    public IReadOnlyList<Guid>? OrderedIds { get; init; }

    public ReorderCustomFieldsCommand() { }

    public ReorderCustomFieldsCommand(
        IReadOnlyList<CustomFieldOrderItem>? items = null,
        IReadOnlyList<Guid>? orderedIds = null,
        string? entityType = "ClinicPatient")
    {
        Items = items;
        OrderedIds = orderedIds;
        EntityType = entityType ?? "ClinicPatient";
    }

    public ReorderCustomFieldsCommand(
        string? entityType,
        IReadOnlyList<CustomFieldOrderItem>? items = null,
        IReadOnlyList<Guid>? orderedIds = null)
    {
        EntityType = entityType ?? "ClinicPatient";
        Items = items;
        OrderedIds = orderedIds;
    }
}

public sealed class ReorderCustomFieldsCommandValidator : AbstractValidator<ReorderCustomFieldsCommand>
{
    public ReorderCustomFieldsCommandValidator()
    {
        RuleFor(x => x)
            .Must(x => (x.Items != null && x.Items.Count > 0) || (x.OrderedIds != null && x.OrderedIds.Count > 0))
            .WithMessage("Reorder payload must contain either 'items' or 'orderedIds'.");

        When(x => x.Items != null && x.Items.Count > 0, () =>
        {
            RuleForEach(x => x.Items!).ChildRules(item =>
            {
                item.RuleFor(i => i.Id).NotEmpty().WithMessage("Field ID in items cannot be empty.");
                item.RuleFor(i => i.DisplayOrder).GreaterThanOrEqualTo(0).WithMessage("DisplayOrder must be 0 or greater.");
            });
        });

        When(x => x.OrderedIds != null && x.OrderedIds.Count > 0, () =>
        {
            RuleForEach(x => x.OrderedIds!).NotEmpty().WithMessage("Field ID in orderedIds cannot be empty.");
        });
    }
}

public sealed class ReorderCustomFieldsCommandHandler : IRequestHandler<ReorderCustomFieldsCommand, IReadOnlyList<ClinicCustomFieldDefinitionDto>>
{
    private readonly IRepository<ClinicCustomFieldDefinition> _repo;
    private readonly IUnitOfWork _unitOfWork;
    private readonly IClinicContext? _clinicContext;

    public ReorderCustomFieldsCommandHandler(
        IRepository<ClinicCustomFieldDefinition> repo,
        IUnitOfWork unitOfWork,
        IClinicContext? clinicContext = null)
    {
        _repo = repo;
        _unitOfWork = unitOfWork;
        _clinicContext = clinicContext;
    }

    public async Task<IReadOnlyList<ClinicCustomFieldDefinitionDto>> Handle(ReorderCustomFieldsCommand request, CancellationToken ct)
    {
        var entityType = string.IsNullOrWhiteSpace(request.EntityType) ? "ClinicPatient" : request.EntityType.Trim();
        var allFields = await _repo.Query()
            .Where(f => f.EntityType == entityType && f.IsActive)
            .ToListAsync(ct);

        var fieldsMap = allFields.ToDictionary(f => f.Id);

        // Option 1: Sequence from OrderedIds (1-based index)
        if (request.OrderedIds is { Count: > 0 })
        {
            for (var i = 0; i < request.OrderedIds.Count; i++)
            {
                var id = request.OrderedIds[i];
                if (fieldsMap.TryGetValue(id, out var field))
                {
                    field.DisplayOrder = i + 1;
                    field.UpdatedAt = DateTime.UtcNow;
                    field.UpdatedBy = "ClinicAdmin";
                }
            }
        }
        // Option 2: Explicit display orders from Items
        else if (request.Items is { Count: > 0 })
        {
            foreach (var item in request.Items)
            {
                if (fieldsMap.TryGetValue(item.Id, out var field))
                {
                    field.DisplayOrder = item.DisplayOrder;
                    field.UpdatedAt = DateTime.UtcNow;
                    field.UpdatedBy = "ClinicAdmin";
                }
            }
        }

        await _unitOfWork.SaveChangesAsync(ct);

        return allFields
            .OrderBy(f => f.DisplayOrder)
            .ThenBy(f => f.Label)
            .Select(f => new ClinicCustomFieldDefinitionDto(
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
