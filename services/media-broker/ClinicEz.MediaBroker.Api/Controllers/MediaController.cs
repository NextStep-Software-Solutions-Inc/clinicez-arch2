using System;
using System.Threading;
using System.Threading.Tasks;
using ClinicEz.MediaBroker.Application.Common.Interfaces;
using ClinicEz.MediaBroker.Domain.Entities;
using ClinicEz.Shared.Common;
using ClinicEz.Shared.Exceptions;
using Microsoft.AspNetCore.Mvc;
using Microsoft.EntityFrameworkCore;

namespace ClinicEz.MediaBroker.Api.Controllers;

[ApiController]
[Route("api/v1/media")]
public sealed class MediaController : ControllerBase
{
    private readonly IMediaBrokerDbContext _db;

    public MediaController(IMediaBrokerDbContext db)
    {
        _db = db;
    }

    [HttpGet("entitlements/{tenantId}")]
    public async Task<ActionResult<ApiResponse<TenantMediaEntitlement>>> GetEntitlement(string tenantId, CancellationToken ct)
    {
        var entitlement = await _db.Entitlements
            .FirstOrDefaultAsync(e => e.TenantId == tenantId, ct);

        if (entitlement == null)
        {
            throw new NotFoundException($"Entitlement for tenant '{tenantId}' not found.");
        }

        return Ok(ApiResponse<TenantMediaEntitlement>.Success(entitlement));
    }

    public sealed record TransportFallbackAuditRequest(
        string TenantId,
        Guid CallId,
        string Reason);

    [HttpPost("audit/transport-fallback")]
    public async Task<ActionResult<ApiResponse<bool>>> AuditTransportFallback(
        [FromBody] TransportFallbackAuditRequest request,
        CancellationToken ct)
    {
        var entitlement = await _db.Entitlements
            .FirstOrDefaultAsync(e => e.TenantId == request.TenantId, ct);

        if (entitlement == null || !entitlement.AllowTransportOnlyFallback)
        {
            throw new ForbiddenException("Tenant policy strictly prohibits unencrypted transport-only fallback. Browser E2EE is mandatory.");
        }

        _db.AuditLogs.Add(new MediaAuditLog
        {
            TenantId = request.TenantId,
            CallId = request.CallId,
            EventType = "TransportFallbackAudited",
            Details = $"Transport-only fallback authorized: {request.Reason}",
            TimestampUtc = DateTime.UtcNow
        });

        await _db.SaveChangesAsync(ct);
        return Ok(ApiResponse<bool>.Success(true, "Transport fallback audited successfully."));
    }
}
