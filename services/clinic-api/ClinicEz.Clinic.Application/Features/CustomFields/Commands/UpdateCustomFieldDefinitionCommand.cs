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

public sealed record UpdateCustomFieldDefinitionCommand(
    Guid Id,
    string Label,
    CustomFieldDataType DataType,
    string? Category = null,
    bool IsRequired = false,
    int DisplayOrder = 0,
    string? OptionsJson = null,
    string? Placeholder = null,
    bool IsActive = true,
    string? VisibilityRuleJson = null,
    string? ConditionalOptionsJson = null,
    string? FieldKey = null,
    string? BoundaryMode = null) : IRequest<ClinicCustomFieldDefinitionDto>;

public sealed class UpdateCustomFieldDefinitionCommandValidator : AbstractValidator<UpdateCustomFieldDefinitionCommand>
{
    private static readonly System.Collections.Generic.HashSet<string> AllowedBoundaryModes = new(StringComparer.Ordinal)
    {
        "pastOrToday",
        "futureOrToday",
        "futureOnly",
        "any"
    };

    public UpdateCustomFieldDefinitionCommandValidator()
    {
        RuleFor(x => x.Id)
            .NotEmpty().WithMessage("Field ID is required.");

        RuleFor(x => x.Label)
            .NotEmpty().WithMessage("Label is required.")
            .MaximumLength(150).WithMessage("Label cannot exceed 150 characters.");

        RuleFor(x => x.Category)
            .MaximumLength(50).WithMessage("Category cannot exceed 50 characters.");

        RuleFor(x => x.Placeholder)
            .MaximumLength(200).WithMessage("Placeholder cannot exceed 200 characters.");

        RuleFor(x => x.DisplayOrder)
            .GreaterThanOrEqualTo(0).WithMessage("DisplayOrder must be 0 or greater.");

        RuleFor(x => x.FieldKey)
            .MaximumLength(100).WithMessage("FieldKey cannot exceed 100 characters.")
            .Matches(@"\A[a-z0-9_]+\z").When(x => x.FieldKey is not null)
            .WithMessage("Machine key must contain only lowercase alphanumeric characters and underscores.");

        RuleFor(x => x.OptionsJson)
            .Must(BeValidJsonOrNull).WithMessage("OptionsJson must be a valid JSON string or null.");

        RuleFor(x => x.VisibilityRuleJson)
            .Must(BeValidJsonOrNull).WithMessage("VisibilityRuleJson must be a valid JSON string or null.");

        RuleFor(x => x.ConditionalOptionsJson)
            .Must(BeValidJsonOrNull).WithMessage("ConditionalOptionsJson must be a valid JSON string or null.");

        RuleFor(x => x.BoundaryMode)
            .MaximumLength(50).WithMessage("BoundaryMode cannot exceed 50 characters.")
            .Must(mode => string.IsNullOrWhiteSpace(mode) || AllowedBoundaryModes.Contains(mode.Trim()))
            .WithMessage("BoundaryMode must be one of: pastOrToday, futureOrToday, futureOnly, any.");
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

public sealed class UpdateCustomFieldDefinitionCommandHandler : IRequestHandler<UpdateCustomFieldDefinitionCommand, ClinicCustomFieldDefinitionDto>
{
    private readonly IRepository<ClinicCustomFieldDefinition> _repo;
    private readonly IUnitOfWork _unitOfWork;

    public UpdateCustomFieldDefinitionCommandHandler(
        IRepository<ClinicCustomFieldDefinition> repo,
        IUnitOfWork unitOfWork)
    {
        _repo = repo;
        _unitOfWork = unitOfWork;
    }

    public async Task<ClinicCustomFieldDefinitionDto> Handle(UpdateCustomFieldDefinitionCommand request, CancellationToken ct)
    {
        var field = await _repo.Query().FirstOrDefaultAsync(f => f.Id == request.Id, ct);
        if (field == null)
        {
            throw new NotFoundException($"Custom field definition with ID '{request.Id}' was not found.");
        }

        if (request.FieldKey is not null)
        {
            var normalizedKey = request.FieldKey.Trim().ToLowerInvariant().Replace(" ", "_");
            if (string.IsNullOrWhiteSpace(normalizedKey) || !Regex.IsMatch(normalizedKey, @"\A[a-z0-9_]+\z"))
            {
                throw new ValidationException("Machine key must contain only lowercase alphanumeric characters and underscores.");
            }

            if (normalizedKey.Length > 100)
            {
                throw new ValidationException("FieldKey cannot exceed 100 characters.");
            }

            if (normalizedKey != field.FieldKey)
            {
                var conflict = await _repo.Query().AnyAsync(f =>
                    f.Id != request.Id &&
                    f.EntityType == field.EntityType &&
                    f.FieldKey == normalizedKey, ct);

                if (conflict)
                {
                    throw new ConflictException("A custom field with this machine key already exists.");
                }

                field.FieldKey = normalizedKey;
            }
        }

        field.Label = request.Label.Trim();
        field.DataType = request.DataType;
        field.Category = request.Category?.Trim();
        field.IsRequired = request.IsRequired;
        field.DisplayOrder = request.DisplayOrder;
        field.OptionsJson = request.OptionsJson;
        field.Placeholder = request.Placeholder?.Trim();
        field.IsActive = request.IsActive;
        field.VisibilityRuleJson = request.VisibilityRuleJson;
        field.ConditionalOptionsJson = request.ConditionalOptionsJson;
        field.BoundaryMode = string.IsNullOrWhiteSpace(request.BoundaryMode) ? null : request.BoundaryMode.Trim();
        field.UpdatedAt = DateTime.UtcNow;
        field.UpdatedBy = "ClinicAdmin";

        try
        {
            await _unitOfWork.SaveChangesAsync(ct);
        }
        catch (DbUpdateException ex) when (CreateCustomFieldDefinitionCommandHandler.IsUniqueConstraintViolation(ex))
        {
            throw new ConflictException("A custom field with this machine key already exists.");
        }

        return new ClinicCustomFieldDefinitionDto(
            field.Id,
            field.TenantId,
            field.ClinicId,
            field.EntityType,
            field.FieldKey,
            field.Label,
            field.DataType,
            field.Category,
            field.IsRequired,
            field.DisplayOrder,
            field.OptionsJson,
            field.Placeholder,
            field.IsActive,
            field.CreatedAt,
            field.VisibilityRuleJson,
            field.ConditionalOptionsJson,
            field.BoundaryMode);
    }
}
