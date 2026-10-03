using System;
using System.Collections.Generic;
using System.Threading;
using System.Threading.Tasks;
using ClinicEz.Clinic.Api.Authorization;
using ClinicEz.Clinic.Application.Features.CustomFields.Commands;
using ClinicEz.Clinic.Application.Features.CustomFields.DTOs;
using ClinicEz.Clinic.Application.Features.CustomFields.Queries;
using ClinicEz.Clinic.Domain.Constants;
using ClinicEz.Shared.Common;
using MediatR;
using Microsoft.AspNetCore.Mvc;

namespace ClinicEz.Clinic.Api.Controllers;

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
