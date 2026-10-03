using System;
using System.Collections.Generic;
using System.Threading;
using System.Threading.Tasks;
using ClinicEz.Clinic.Api.Authorization;
using ClinicEz.Clinic.Application.Common.Interfaces;
using ClinicEz.Clinic.Application.Features.Yakap.Commands.CreateYakapTransmittal;
using ClinicEz.Clinic.Application.Features.Yakap.Commands.SubmitYakapTransmittal;
using ClinicEz.Clinic.Application.Features.Yakap.Commands.ValidateYakapTransmittal;
using ClinicEz.Clinic.Application.Features.Yakap.DTOs;
using ClinicEz.Clinic.Application.Features.Yakap.Queries.GetYakapTransmittalById;
using ClinicEz.Clinic.Application.Features.Yakap.Queries.GetYakapTransmittals;
using ClinicEz.Clinic.Domain.Constants;
using ClinicEz.Clinic.Domain.Enums;
using ClinicEz.Shared.Common;
using MediatR;
using Microsoft.AspNetCore.Mvc;

namespace ClinicEz.Clinic.Api.Controllers;

[ApiController]
[Route("api/v1/yakap")]
public sealed class YakapTransmittalsController : ControllerBase
{
    private readonly ISender _sender;
    private readonly IPhilHealthProxyClient _proxyClient;

    public YakapTransmittalsController(
        ISender sender,
        IPhilHealthProxyClient proxyClient)
    {
        _sender = sender;
        _proxyClient = proxyClient;
    }

    /// <summary>
    /// Aggregates signed consultations and drafts a PhilHealth Yakap transmittal.
    /// </summary>
    [HttpPost("transmittals")]
    [HasPermission(ClinicPermissions.YakapWrite)]
    public async Task<ActionResult<ApiResponse<YakapTransmittalDto>>> CreateTransmittal(
        [FromBody] CreateYakapTransmittalCommand command,
        CancellationToken ct)
    {
        var result = await _sender.Send(command, ct);
        if (!result.Succeeded || result.Data == null)
        {
            return BadRequest(result);
        }

        return CreatedAtAction(nameof(GetTransmittalById), new { id = result.Data.Id }, result);
    }

    /// <summary>
    /// Lists PhilHealth Yakap transmittals for the clinic.
    /// </summary>
    [HttpGet("transmittals")]
    [HasPermission(ClinicPermissions.YakapRead)]
    public async Task<ActionResult<ApiResponse<IReadOnlyList<YakapTransmittalDto>>>> GetTransmittals(
        [FromQuery] YakapTransmittalStatus? status,
        [FromQuery] string? reportTagging,
        CancellationToken ct)
    {
        var result = await _sender.Send(new GetYakapTransmittalsQuery(status, reportTagging), ct);
        return Ok(result);
    }

    /// <summary>
    /// Gets detailed information for a specific Yakap transmittal including its line items.
    /// </summary>
    [HttpGet("transmittals/{id:guid}")]
    [HasPermission(ClinicPermissions.YakapRead)]
    public async Task<ActionResult<ApiResponse<YakapTransmittalDto>>> GetTransmittalById(
        Guid id,
        CancellationToken ct)
    {
        var result = await _sender.Send(new GetYakapTransmittalByIdQuery(id), ct);
        if (!result.Succeeded)
        {
            return NotFound(result);
        }

        return Ok(result);
    }

    /// <summary>
    /// Validates the Yakap transmittal against PhilHealth KonsultaData DTD and PhilHealth SOAP validateReport.
    /// </summary>
    [HttpPost("transmittals/{id:guid}/validate")]
    [HasPermission(ClinicPermissions.YakapWrite)]
    public async Task<ActionResult<ApiResponse<YakapValidationResultDto>>> ValidateTransmittal(
        Guid id,
        CancellationToken ct)
    {
        var result = await _sender.Send(new ValidateYakapTransmittalCommand(id), ct);
        if (!result.Succeeded)
        {
            return BadRequest(result);
        }

        return Ok(result);
    }

    /// <summary>
    /// Submits the Yakap transmittal to PhilHealth and receives the transaction number.
    /// </summary>
    [HttpPost("transmittals/{id:guid}/submit")]
    [HasPermission(ClinicPermissions.YakapSubmit)]
    public async Task<ActionResult<ApiResponse<YakapSubmissionResultDto>>> SubmitTransmittal(
        Guid id,
        CancellationToken ct)
    {
        var result = await _sender.Send(new SubmitYakapTransmittalCommand(id), ct);
        if (!result.Succeeded)
        {
            return BadRequest(result);
        }

        return Ok(result);
    }

    /// <summary>
    /// Validates a PhilHealth Identification Number (PIN) format and Modulus-11 check digit.
    /// </summary>
    [HttpGet("pin/{pin}/validate")]
    [HasPermission(ClinicPermissions.YakapRead)]
    public async Task<ActionResult<ApiResponse<bool>>> ValidatePin(string pin, CancellationToken ct)
    {
        var result = await _proxyClient.ValidatePinAsync(pin, ct);
        return Ok(result);
    }

    /// <summary>
    /// Retrieves standard reference catalogs from PhilHealth (diseases, symptoms, diagnostics, management, gamot).
    /// </summary>
    [HttpGet("catalogs/{type}")]
    [HasPermission(ClinicPermissions.YakapRead)]
    public async Task<ActionResult<ApiResponse<IReadOnlyList<YakapCatalogItemDto>>>> GetCatalog(string type, CancellationToken ct)
    {
        var result = await _proxyClient.GetCatalogAsync(type, ct);
        return Ok(result);
    }

    /// <summary>
    /// Extracts and parses the beneficiary registration masterlist from PhilHealth.
    /// </summary>
    [HttpPost("masterlist/extract")]
    [HasPermission(ClinicPermissions.YakapRead)]
    public async Task<ActionResult<ApiResponse<YakapMasterlistProxyResponse>>> ExtractMasterlist(
        [FromBody] ExtractMasterlistProxyRequest request,
        CancellationToken ct)
    {
        var result = await _proxyClient.ExtractMasterlistAsync(request, ct);
        if (!result.Succeeded)
        {
            return BadRequest(result);
        }

        return Ok(result);
    }
}
