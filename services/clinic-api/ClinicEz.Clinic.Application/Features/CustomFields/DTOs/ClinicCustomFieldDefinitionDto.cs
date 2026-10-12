using System;
using System.Collections.Generic;
using ClinicEz.Clinic.Domain.Entities;

namespace ClinicEz.Clinic.Application.Features.CustomFields.DTOs;

public sealed record ClinicCustomFieldDefinitionDto(
    Guid Id,
    string TenantId,
    Guid ClinicId,
    string EntityType,
    string FieldKey,
    string Label,
    CustomFieldDataType DataType,
    string? Category,
    bool IsRequired,
    int DisplayOrder,
    string? OptionsJson,
    string? Placeholder,
    bool IsActive,
    DateTime CreatedAt,
    string? VisibilityRuleJson = null,
    string? ConditionalOptionsJson = null);

public sealed record CustomFieldTemplateDto(
    string Key,
    string Name,
    string Description,
    string EntityType,
    int FieldCount,
    IReadOnlyList<CustomFieldTemplateFieldDto> Fields);

public sealed record CustomFieldTemplateFieldDto(
    string FieldKey,
    string Label,
    CustomFieldDataType DataType,
    string? Category,
    bool IsRequired,
    int DisplayOrder,
    string? OptionsJson,
    string? Placeholder,
    string? VisibilityRuleJson,
    string? ConditionalOptionsJson);
