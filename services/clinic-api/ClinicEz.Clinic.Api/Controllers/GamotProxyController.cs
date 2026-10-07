using System;
using System.Threading;
using System.Threading.Tasks;
using ClinicEz.Clinic.Api.Authorization;
using ClinicEz.Clinic.Application.Common.Interfaces;
using ClinicEz.Clinic.Domain.Constants;
using Microsoft.AspNetCore.Mvc;

namespace ClinicEz.Clinic.Api.Controllers;

/// <summary>
/// GAMOT (PhilHealth medicine benefit) lookups and dispensing for the clinic app. The pharmacy API is reached from
/// here, server to server, so devices only ever hold a clinic session and the pharmacy's service key stays private.
/// Only the routes below are forwarded; anything else is a 404.
/// </summary>
[ApiController]
[Route("api/v1/yakap/gamot")]
public sealed class GamotProxyController : ControllerBase
{
    private readonly IPharmacyGamotGateway _gateway;

    public GamotProxyController(IPharmacyGamotGateway gateway) => _gateway = gateway;

    [HttpGet("ledger/{pin}")]
    [HasPermission(ClinicPermissions.YakapRead)]
    public Task<IActionResult> GetLedger(string pin, CancellationToken ct) =>
        Forward("GET", $"ledger/{Uri.EscapeDataString(pin)}", null, ct);

    [HttpGet("formulary")]
    [HasPermission(ClinicPermissions.YakapRead)]
    public Task<IActionResult> GetFormulary(CancellationToken ct) => Forward("GET", "formulary", null, ct);

    [HttpPost("upsc/validate")]
    [HasPermission(ClinicPermissions.YakapRead)]
    public async Task<IActionResult> ValidateUpsc(CancellationToken ct) =>
        await Forward("POST", "upsc/validate", await ReadBodyAsync(ct), ct);

    [HttpPost("upsc/generate")]
    [HasPermission(ClinicPermissions.YakapWrite)]
    public async Task<IActionResult> GenerateUpsc(CancellationToken ct) =>
        await Forward("POST", "upsc/generate", await ReadBodyAsync(ct), ct);

    [HttpPost("dispense")]
    [HasPermission(ClinicPermissions.YakapWrite)]
    public async Task<IActionResult> Dispense(CancellationToken ct) =>
        await Forward("POST", "dispense", await ReadBodyAsync(ct), ct);

    [HttpPost("transactions/{id:guid}/reverse")]
    [HasPermission(ClinicPermissions.YakapWrite)]
    public async Task<IActionResult> Reverse(Guid id, CancellationToken ct) =>
        await Forward("POST", $"transactions/{id}/reverse", await ReadBodyAsync(ct), ct);

    private async Task<string> ReadBodyAsync(CancellationToken ct)
    {
        using var reader = new System.IO.StreamReader(Request.Body);
        return await reader.ReadToEndAsync(ct);
    }

    private async Task<IActionResult> Forward(string method, string path, string? body, CancellationToken ct)
    {
        var result = await _gateway.SendAsync(method, path, Request.QueryString.Value ?? string.Empty, body, ct);
        return new ContentResult
        {
            StatusCode = result.StatusCode,
            ContentType = result.ContentType ?? "application/json",
            Content = result.Body,
        };
    }
}
