using System.Threading;
using System.Threading.Tasks;
using ClinicEz.Clinic.Api.Authorization;
using ClinicEz.Clinic.Application.Common.Interfaces;
using ClinicEz.Clinic.Application.Features.Yakap.DTOs;
using ClinicEz.Clinic.Domain.Constants;
using ClinicEz.Shared.Common;
using Microsoft.AspNetCore.Mvc;

namespace ClinicEz.Clinic.Api.Controllers;

[ApiController]
[Route("api/v1/yakap/simulation")]
public sealed class YakapSimulationController(
    IPhilHealthProxyClient proxyClient)
    : ControllerBase
{
    /// <summary>
    /// Executes the full 7-step PhilHealth SOAP E2E sequence via the PhilHealth Proxy SOAP Sandbox.
    /// </summary>
    [HttpPost("run-e2e")]
    [HasPermission(ClinicPermissions.YakapRead)]
    public async Task<ActionResult<ApiResponse<SoapSimulationReportDto>>> RunFullE2e(
        [FromBody] RunSoapSimulationProxyRequest? request,
        CancellationToken ct)
    {
        var result = await proxyClient.RunSoapSimulationAsync(request ?? new(), ct);
        if (!result.Succeeded)
        {
            return BadRequest(result);
        }
        return Ok(result);
    }

    /// <summary>
    /// Retrieves current SOAP Sandbox status, call metrics, and active scenario.
    /// </summary>
    [HttpGet("status")]
    [HasPermission(ClinicPermissions.YakapRead)]
    public async Task<ActionResult<ApiResponse<SoapSandboxStatusDto>>> GetStatus(CancellationToken ct)
    {
        var result = await proxyClient.GetSoapSandboxStatusAsync(ct);
        if (!result.Succeeded)
        {
            return BadRequest(result);
        }
        return Ok(result);
    }

    /// <summary>
    /// Updates the active fault injection / simulation scenario.
    /// </summary>
    [HttpPost("scenario")]
    [HasPermission(ClinicPermissions.YakapWrite)]
    public async Task<ActionResult<ApiResponse<SoapSandboxStatusDto>>> SetScenario(
        [FromBody] SetSimulationScenarioRequest request,
        CancellationToken ct)
    {
        var result = await proxyClient.SetSoapSandboxScenarioAsync(request, ct);
        if (!result.Succeeded)
        {
            return BadRequest(result);
        }
        return Ok(result);
    }

    /// <summary>
    /// Resets simulation metrics and restores HappyPath scenario.
    /// </summary>
    [HttpPost("reset")]
    [HasPermission(ClinicPermissions.YakapWrite)]
    public async Task<ActionResult<ApiResponse<SoapSandboxStatusDto>>> Reset(CancellationToken ct)
    {
        var result = await proxyClient.ResetSoapSandboxAsync(ct);
        if (!result.Succeeded)
        {
            return BadRequest(result);
        }
        return Ok(result);
    }
}
