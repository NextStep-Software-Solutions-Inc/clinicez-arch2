using System;
using System.Collections.Generic;
using System.Threading;
using System.Threading.Tasks;
using ClinicEz.Clinic.Api.Authorization;
using ClinicEz.Clinic.Application.Common.Interfaces;
using ClinicEz.Clinic.Application.Features.Yakap.DTOs;
using ClinicEz.Clinic.Application.Features.Yakap.Queries.GetEligibleYakapEncounters;
using ClinicEz.Clinic.Application.Features.Yakap.Services;
using ClinicEz.Clinic.Domain.Constants;
using ClinicEz.Clinic.Domain.Interfaces;
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
    private readonly IPhilHealthMasterlistSyncService? _syncService;
    private readonly IClinicContext? _clinicContext;

    public YakapTransmittalsController(
        ISender sender,
        IPhilHealthProxyClient proxyClient,
        IPhilHealthMasterlistSyncService? syncService = null,
        IClinicContext? clinicContext = null)
    {
        _sender = sender;
        _proxyClient = proxyClient;
        _syncService = syncService;
        _clinicContext = clinicContext;
    }

    /// <summary>
    /// Retrieves signed clinical encounters eligible for Yakap Submission.
    /// </summary>
    [HttpGet("encounters/eligible")]
    [HasPermission(ClinicPermissions.YakapRead)]
    public async Task<ActionResult<ApiResponse<List<EligibleYakapEncounterDto>>>> GetEligibleEncounters(
        [FromQuery] string reportTagging = "2",
        [FromQuery] DateTime? startDate = null,
        [FromQuery] DateTime? endDate = null,
        [FromQuery] Guid? patientId = null,
        [FromQuery] Guid? branchId = null,
        CancellationToken ct = default)
    {
        var result = await _sender.Send(new GetEligibleYakapEncountersQuery(reportTagging, startDate, endDate, patientId, branchId), ct);
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
    /// Extracts and parses the beneficiary registration masterlist from PhilHealth.
    /// </summary>
    [HttpPost("masterlist/extract")]
    [HasPermission(ClinicPermissions.YakapRead)]
    public async Task<ActionResult<ApiResponse<YakapMasterlistProxyResponse>>> ExtractMasterlist(
        [FromBody] ExtractMasterlistProxyRequest request,
        CancellationToken ct)
    {
        var result = await _proxyClient.ExtractMasterlistAsync(request, ct);
        if (!result.Succeeded || result.Data == null)
        {
            return BadRequest(result);
        }

        if (_syncService != null)
        {
            var tenantId = _clinicContext?.TenantId ?? string.Empty;
            var clinicId = _clinicContext?.ClinicId;
            await _syncService.SyncProxyResponseAsync(tenantId, clinicId, result.Data, ct);
        }

        return Ok(result);
    }
}
