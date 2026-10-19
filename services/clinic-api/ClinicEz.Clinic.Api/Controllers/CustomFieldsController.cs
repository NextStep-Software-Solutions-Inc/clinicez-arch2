using System;
using System.Collections.Generic;
using System.Threading;
using System.Threading.Tasks;
using ClinicEz.Clinic.Api.Authorization;
using ClinicEz.Clinic.Application.Features.CustomFields.Commands;
using ClinicEz.Clinic.Application.Features.CustomFields.DTOs;
using ClinicEz.Clinic.Application.Features.CustomFields.Queries;
using ClinicEz.Clinic.Domain.Constants;
using ClinicEz.Clinic.Domain.Entities;
using ClinicEz.Shared.Common;
using MediatR;
using Microsoft.AspNetCore.Mvc;

namespace ClinicEz.Clinic.Api.Controllers;

public sealed record UpdateCustomFieldDefinitionRequest(
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
    string? FieldKey = null);

public sealed record ReorderCustomFieldsRequest(
    IReadOnlyList<CustomFieldOrderItem>? Items = null,
    IReadOnlyList<Guid>? OrderedIds = null,
    string? EntityType = "ClinicPatient");

[ApiController]
[Route("api/v1/custom-fields")]
public sealed class CustomFieldsController : ControllerBase
{
    private readonly ISender _sender;

    public CustomFieldsController(ISender sender)
    {
        _sender = sender;
    }

    [HttpGet]
    [HasPermission(ClinicPermissions.SettingsRead)]
    public async Task<ActionResult<ApiResponse<IReadOnlyList<ClinicCustomFieldDefinitionDto>>>> GetCustomFields(
        [FromQuery] string? entityType = "ClinicPatient",
        [FromQuery] string? category = null,
        CancellationToken ct = default)
    {
        var result = await _sender.Send(new GetClinicCustomFieldsQuery(entityType, category), ct);
        return Ok(ApiResponse<IReadOnlyList<ClinicCustomFieldDefinitionDto>>.Success(result));
    }

    [HttpPost]
    [HasPermission(ClinicPermissions.SettingsManage)]
    public async Task<ActionResult<ApiResponse<ClinicCustomFieldDefinitionDto>>> CreateCustomField(
        [FromBody] CreateCustomFieldDefinitionCommand command,
        CancellationToken ct = default)
    {
        var result = await _sender.Send(command, ct);
        return Ok(ApiResponse<ClinicCustomFieldDefinitionDto>.Success(result, "Custom field created successfully."));
    }

    [HttpPut("{id:guid}")]
    [HasPermission(ClinicPermissions.SettingsManage)]
    public async Task<ActionResult<ApiResponse<ClinicCustomFieldDefinitionDto>>> UpdateCustomField(
        Guid id,
        [FromBody] UpdateCustomFieldDefinitionRequest request,
        CancellationToken ct = default)
    {
        var command = new UpdateCustomFieldDefinitionCommand(
            id,
            request.Label,
            request.DataType,
            request.Category,
            request.IsRequired,
            request.DisplayOrder,
            request.OptionsJson,
            request.Placeholder,
            request.IsActive,
            request.VisibilityRuleJson,
            request.ConditionalOptionsJson,
            request.FieldKey);

        var result = await _sender.Send(command, ct);
        return Ok(ApiResponse<ClinicCustomFieldDefinitionDto>.Success(result, "Custom field updated successfully."));
    }

    [HttpPut("reorder")]
    [HasPermission(ClinicPermissions.SettingsManage)]
    public async Task<ActionResult<ApiResponse<IReadOnlyList<ClinicCustomFieldDefinitionDto>>>> ReorderCustomFields(
        [FromBody] ReorderCustomFieldsRequest request,
        CancellationToken ct = default)
    {
        var command = new ReorderCustomFieldsCommand(
            request.Items,
            request.OrderedIds,
            request.EntityType ?? "ClinicPatient");

        var result = await _sender.Send(command, ct);
        return Ok(ApiResponse<IReadOnlyList<ClinicCustomFieldDefinitionDto>>.Success(result, "Custom fields reordered successfully."));
    }

    [HttpGet("templates")]
    [HasPermission(ClinicPermissions.SettingsRead)]
    public async Task<ActionResult<ApiResponse<IReadOnlyList<CustomFieldTemplateDto>>>> GetTemplates(
        [FromQuery] string? entityType = "ClinicPatient",
        CancellationToken ct = default)
    {
        var result = await _sender.Send(new GetCustomFieldTemplatesQuery(entityType), ct);
        return Ok(ApiResponse<IReadOnlyList<CustomFieldTemplateDto>>.Success(result));
    }

    [HttpPost("templates/install")]
    [HasPermission(ClinicPermissions.SettingsManage)]
    public async Task<ActionResult<ApiResponse<IReadOnlyList<ClinicCustomFieldDefinitionDto>>>> InstallTemplate(
        [FromBody] InstallCustomFieldTemplateCommand command,
        CancellationToken ct = default)
    {
        var result = await _sender.Send(command, ct);
        return Ok(ApiResponse<IReadOnlyList<ClinicCustomFieldDefinitionDto>>.Success(result, $"Template '{command.TemplateKey}' installed successfully."));
    }

    [HttpDelete("{id:guid}")]
    [HasPermission(ClinicPermissions.SettingsManage)]
    public async Task<ActionResult<ApiResponse<bool>>> DeleteCustomField(
        Guid id,
        CancellationToken ct = default)
    {
        var result = await _sender.Send(new DeleteCustomFieldDefinitionCommand(id), ct);
        if (!result)
        {
            return NotFound(ApiResponse<bool>.Fail("Custom field not found."));
        }
        return Ok(ApiResponse<bool>.Success(true, "Custom field deleted successfully."));
    }
}
