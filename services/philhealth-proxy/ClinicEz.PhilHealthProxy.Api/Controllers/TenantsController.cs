using System;
using System.Collections.Generic;
using System.Net;
using System.Threading;
using System.Threading.Tasks;
using ClinicEz.PhilHealthProxy.Application.Features.Tenants.Commands;
using ClinicEz.PhilHealthProxy.Application.Features.Tenants.Queries;
using ClinicEz.PhilHealthProxy.Domain.Models;
using ClinicEz.Shared.Common;
using MediatR;
using Microsoft.AspNetCore.Http;
using Microsoft.AspNetCore.Mvc;
using Microsoft.Extensions.Hosting;

namespace ClinicEz.PhilHealthProxy.Api.Controllers;

public static class PcapiUrlValidator
{
    private static readonly HashSet<string> AllowedHosts = new(StringComparer.OrdinalIgnoreCase)
    {
        "philhealth.gov.ph",
        "staging.philhealth.gov.ph",
        "pcapi.philhealth.gov.ph",
        "pcapi-staging.philhealth.gov.ph"
    };

    public static bool IsSafeEndpoint(string? endpoint, IHostEnvironment? env)
    {
        if (string.IsNullOrWhiteSpace(endpoint)) return false;
        if (!Uri.TryCreate(endpoint.Trim(), UriKind.Absolute, out var uri)) return false;

        // In Development or Testing environments, allow localhost / simulator / sandbox
        if (env != null && (env.IsDevelopment() || env.IsEnvironment("Testing")))
        {
            if (uri.Host.Equals("localhost", StringComparison.OrdinalIgnoreCase) ||
                uri.Host.Equals("127.0.0.1") ||
                uri.Host.Contains("sandbox", StringComparison.OrdinalIgnoreCase) ||
                uri.Host.Contains("simulator", StringComparison.OrdinalIgnoreCase))
            {
                return true;
            }
        }

        // Must be HTTPS in Production
        if (env != null && env.IsProduction() && uri.Scheme != Uri.UriSchemeHttps)
        {
            return false;
        }

        var host = uri.DnsSafeHost;

        // Reject IP addresses directly in Production or non-dev
        if (IPAddress.TryParse(host, out var ip))
        {
            if (IPAddress.IsLoopback(ip) || IsPrivateSubnet(ip)) return false;
        }

        // Allow PhilHealth domains
        if (AllowedHosts.Contains(host) || host.EndsWith(".philhealth.gov.ph", StringComparison.OrdinalIgnoreCase))
        {
            return true;
        }

        // Check if simulated or sandbox endpoint
        if (host.Contains("sandbox", StringComparison.OrdinalIgnoreCase) || host.Contains("simulator", StringComparison.OrdinalIgnoreCase))
        {
            return true;
        }

        return false;
    }

    private static bool IsPrivateSubnet(IPAddress ip)
    {
        if (ip.IsIPv4MappedToIPv6) ip = ip.MapToIPv4();
        var bytes = ip.GetAddressBytes();
        if (bytes.Length != 4) return false;

        // 10.0.0.0/8
        if (bytes[0] == 10) return true;
        // 172.16.0.0/12
        if (bytes[0] == 172 && bytes[1] >= 16 && bytes[1] <= 31) return true;
        // 192.168.0.0/16
        if (bytes[0] == 192 && bytes[1] == 168) return true;
        // 169.254.0.0/16 (Link Local / Cloud Metadata)
        if (bytes[0] == 169 && bytes[1] == 254) return true;

        return false;
    }
}

[ApiController]
[Route("api/[controller]")]
public sealed class TenantsController(
    IMediator mediator,
    IHostEnvironment? environment = null)
    : ControllerBase
{
    [HttpPost]
    [ProducesResponseType<ApiResponse<TenantConfigurationStatusResponse>>(StatusCodes.Status200OK)]
    [ProducesResponseType(StatusCodes.Status400BadRequest)]
    [ProducesResponseType(StatusCodes.Status422UnprocessableEntity)]
    public async Task<IActionResult> Configure(
        [FromBody] ConfigureTenantCredentialsRequest request,
        CancellationToken ct)
    {
        if (!string.IsNullOrWhiteSpace(request.BaseUrl) && !PcapiUrlValidator.IsSafeEndpoint(request.BaseUrl, environment))
        {
            return BadRequest(ApiResponse<TenantConfigurationStatusResponse>.Fail(
                $"The provided BaseUrl '{request.BaseUrl}' is not permitted by proxy SSRF security policy."));
        }

        var result = await mediator.Send(new ConfigureTenantCredentialsCommand(request), ct);
        return Ok(ApiResponse<TenantConfigurationStatusResponse>.Success(result));
    }

    [HttpGet("status")]
    [ProducesResponseType<ApiResponse<TenantConfigurationStatusResponse>>(StatusCodes.Status200OK)]
    public async Task<IActionResult> GetStatus(
        [FromQuery] Guid tenantId,
        [FromQuery] Guid? branchId,
        CancellationToken ct)
    {
        var result = await mediator.Send(new GetTenantStatusQuery(tenantId, branchId), ct);
        return Ok(ApiResponse<TenantConfigurationStatusResponse>.Success(result));
    }

    [HttpPost("test-connection")]
    [ProducesResponseType<ApiResponse<TestTenantConnectionResponse>>(StatusCodes.Status200OK)]
    public async Task<IActionResult> TestConnection(
        [FromQuery] Guid tenantId,
        [FromQuery] Guid? branchId,
        CancellationToken ct)
    {
        var result = await mediator.Send(new TestTenantConnectionCommand(tenantId, branchId), ct);
        return Ok(ApiResponse<TestTenantConnectionResponse>.Success(result));
    }
}
