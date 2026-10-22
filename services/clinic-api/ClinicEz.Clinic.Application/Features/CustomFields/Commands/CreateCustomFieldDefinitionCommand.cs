using System;
using System.Text.Json;
using System.Text.RegularExpressions;
using System.Threading;
using System.Threading.Tasks;
using ClinicEz.Clinic.Application.Common.Interfaces;
using ClinicEz.Clinic.Application.Features.CustomFields.DTOs;
using ClinicEz.Clinic.Domain.Entities;
using ClinicEz.Clinic.Domain.Interfaces;
using ClinicEz.Shared.Exceptions;
using FluentValidation;
using MediatR;
using Microsoft.EntityFrameworkCore;
using ValidationException = ClinicEz.Shared.Exceptions.ValidationException;

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
    string? Placeholder = null,
    string? VisibilityRuleJson = null,
    string? ConditionalOptionsJson = null) : IRequest<ClinicCustomFieldDefinitionDto>;

public sealed class CreateCustomFieldDefinitionCommandValidator : AbstractValidator<CreateCustomFieldDefinitionCommand>
{
    public CreateCustomFieldDefinitionCommandValidator()
    {
        RuleFor(x => x.FieldKey)
            .NotEmpty().WithMessage("FieldKey is required.")
            .MaximumLength(100).WithMessage("FieldKey cannot exceed 100 characters.")
            .Matches(@"^[a-z0-9_]+$").WithMessage("Machine key must contain only lowercase alphanumeric characters and underscores.");

        RuleFor(x => x.Label)
            .NotEmpty().WithMessage("Label is required.")
            .MaximumLength(150).WithMessage("Label cannot exceed 150 characters.");

        RuleFor(x => x.EntityType)
            .MaximumLength(50).WithMessage("EntityType cannot exceed 50 characters.");

        RuleFor(x => x.Category)
            .MaximumLength(50).WithMessage("Category cannot exceed 50 characters.");

        RuleFor(x => x.Placeholder)
            .MaximumLength(200).WithMessage("Placeholder cannot exceed 200 characters.");

        RuleFor(x => x.DisplayOrder)
            .GreaterThanOrEqualTo(0).WithMessage("DisplayOrder must be 0 or greater.");

        RuleFor(x => x.OptionsJson)
            .Must(BeValidJsonOrNull).WithMessage("OptionsJson must be a valid JSON string or null.");

        RuleFor(x => x.VisibilityRuleJson)
            .Must(BeValidJsonOrNull).WithMessage("VisibilityRuleJson must be a valid JSON string or null.");

        RuleFor(x => x.ConditionalOptionsJson)
            .Must(BeValidJsonOrNull).WithMessage("ConditionalOptionsJson must be a valid JSON string or null.");
    }

    private static bool BeValidJsonOrNull(string? json)
    {
        if (string.IsNullOrWhiteSpace(json)) return true;
        try
        {
            using var doc = JsonDocument.Parse(json);
            return true;
        }
        catch
        {
            return false;
        }
    }
}

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
        var targetEntityType = string.IsNullOrWhiteSpace(request.EntityType) ? "ClinicPatient" : request.EntityType.Trim();
        var normalizedKey = (request.FieldKey ?? string.Empty).Trim().ToLowerInvariant().Replace(" ", "_");

        if (string.IsNullOrWhiteSpace(normalizedKey) || !Regex.IsMatch(normalizedKey, @"^[a-z0-9_]+$"))
        {
            throw new ValidationException("Machine key must contain only lowercase alphanumeric characters and underscores.");
        }

        var conflict = await _repo.Query().AnyAsync(f =>
            f.EntityType == targetEntityType &&
            f.FieldKey == normalizedKey, ct);

        if (conflict)
        {
            throw new ConflictException("A custom field with this machine key already exists.");
        }

        var entity = new ClinicCustomFieldDefinition
        {
            Id = Guid.NewGuid(),
            TenantId = _clinicContext.TenantId,
            ClinicId = _clinicContext.ClinicId,
            EntityType = targetEntityType,
            FieldKey = normalizedKey,
            Label = request.Label.Trim(),
            DataType = request.DataType,
            Category = request.Category?.Trim(),
            IsRequired = request.IsRequired,
            DisplayOrder = request.DisplayOrder,
            OptionsJson = request.OptionsJson,
            Placeholder = request.Placeholder?.Trim(),
            VisibilityRuleJson = request.VisibilityRuleJson,
            ConditionalOptionsJson = request.ConditionalOptionsJson,
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
            entity.CreatedAt,
            entity.VisibilityRuleJson,
            entity.ConditionalOptionsJson);
    }
}
