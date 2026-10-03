using System;
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
    DateTime CreatedAt);
