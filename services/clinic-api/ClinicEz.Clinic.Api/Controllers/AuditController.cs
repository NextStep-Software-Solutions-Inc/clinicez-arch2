namespace ClinicEz.Clinic.Api.Controllers;

using System;
using System.Text.Json;
using System.Threading;
using System.Threading.Tasks;
using ClinicEz.Clinic.Api.Authorization;
using ClinicEz.Clinic.Application.Common.Audit;
using ClinicEz.Clinic.Application.Common.Interfaces;
using ClinicEz.Clinic.Application.Features.Audit.DTOs;
using ClinicEz.Clinic.Application.Features.Audit.Queries;
using ClinicEz.Clinic.Domain.Constants;
using ClinicEz.Clinic.Domain.Entities;
using ClinicEz.Clinic.Domain.Interfaces;
using ClinicEz.Shared.Common;
using MediatR;
using Microsoft.AspNetCore.Authorization;
using Microsoft.AspNetCore.Mvc;

[ApiController]
[Route("api/v1/audit")]
public sealed class AuditController : ControllerBase
{
    private static readonly JsonSerializerOptions JsonOptions = new() { PropertyNamingPolicy = JsonNamingPolicy.CamelCase };

    private readonly ISender _sender;
    private readonly IClinicContext _clinicContext;
    private readonly IAuditLogQueue _auditQueue;

    public AuditController(
        ISender sender,
        IClinicContext clinicContext,
        IAuditLogQueue auditQueue)
    {
        _sender = sender ?? throw new ArgumentNullException(nameof(sender));
        _clinicContext = clinicContext ?? throw new ArgumentNullException(nameof(clinicContext));
        _auditQueue = auditQueue ?? throw new ArgumentNullException(nameof(auditQueue));
    }

    /// <summary>
    /// Lists clinic audit trail entries using backward cursor-based pagination and multi-dimensional filtering.
    /// Access is strictly restricted to clinic administrators and compliance personnel.
    /// </summary>
    [HttpGet]
    [Authorize(Policy = ClinicPermissions.AuditRead)]
    [HasPermission(ClinicPermissions.AuditRead)]
    public async Task<ActionResult<ApiResponse<AuditLogListDto>>> GetAuditLogs(
        [FromQuery] string? category,
        [FromQuery] string? severity,
        [FromQuery] string? action,
        [FromQuery] Guid? actorId,
        [FromQuery] string? entityId,
        [FromQuery] string? search,
        [FromQuery] DateTime? startDate,
        [FromQuery] DateTime? endDate,
        [FromQuery] string? before,
        [FromQuery] int pageSize = 50,
        CancellationToken ct = default)
    {
        if (startDate.HasValue && endDate.HasValue && startDate.Value > endDate.Value)
        {
            return BadRequest(ApiResponse<AuditLogListDto>.Fail(
                "startDate must be earlier than or equal to endDate.",
                new[] { new ApiFieldError("startDate", "INVALID_DATE_RANGE", "Start date cannot exceed end date.") }));
        }

        var clampedPageSize = Math.Clamp(pageSize, 1, 100);

        var query = new GetAuditLogsQuery(
            Category: category,
            Severity: severity,
            Action: action,
            ActorId: actorId,
            EntityId: entityId,
            Search: search,
            StartDate: startDate,
            EndDate: endDate,
            Before: before,
            PageSize: clampedPageSize);

        var result = await _sender.Send(query, ct);

        // Auditing the Auditor: Asynchronously record audit log viewing
        EnqueueAuditViewedEvent(
            targetEntityId: null,
            filterSummary: $"category={category ?? "all"}, severity={severity ?? "all"}, search={search ?? "none"}, before={before ?? "latest"}",
            metadata: new
            {
                Category = category,
                Severity = severity,
                Action = action,
                ActorId = actorId,
                EntityId = entityId,
                Search = search,
                StartDate = startDate,
                EndDate = endDate,
                Before = before,
                PageSize = clampedPageSize,
                ReturnedCount = result.Items.Count,
                HasMore = result.HasMore
            });

        return Ok(ApiResponse<AuditLogListDto>.Success(result));
    }

    /// <summary>
    /// Retrieves complete forensic details for a single audit log entry, including full sanitized metadata,
    /// cryptographic SHA-256 prose checksums, and actor credentials.
    /// </summary>
    [HttpGet("{id:guid}")]
    [Authorize(Policy = ClinicPermissions.AuditRead)]
    [HasPermission(ClinicPermissions.AuditRead)]
    public async Task<ActionResult<ApiResponse<ClinicAuditEntryDetailDto>>> GetAuditLogDetail(
        [FromRoute] Guid id,
        CancellationToken ct = default)
    {
        var result = await _sender.Send(new GetAuditLogDetailQuery(id), ct);
        if (result == null)
        {
            return NotFound(ApiResponse<ClinicAuditEntryDetailDto>.Fail(
                $"Audit log entry with ID '{id}' was not found.",
                new[] { new ApiFieldError("id", "NOT_FOUND", $"Audit entry {id} does not exist in current clinic jurisdiction.") }));
        }

        // Auditing the Auditor: Record specific entry forensic inspection
        EnqueueAuditViewedEvent(
            targetEntityId: id.ToString(),
            filterSummary: $"Inspected entry {id}",
            metadata: new
            {
                TargetAuditId = id,
                InspectedCategory = result.Category,
                InspectedAction = result.Action
            });

        return Ok(ApiResponse<ClinicAuditEntryDetailDto>.Success(result));
    }

    /// <summary>
    /// Exports forensic audit log entries matching filter criteria in streaming CSV or JSON format.
    /// Restricted to users holding the audit:export permission.
    /// </summary>
    [HttpGet("export")]
    [Authorize(Policy = ClinicPermissions.AuditExport)]
    [HasPermission(ClinicPermissions.AuditExport)]
    public async Task<IActionResult> ExportAuditLogs(
        [FromQuery] string? format = "csv",
        [FromQuery] string? category = null,
        [FromQuery] string? severity = null,
        [FromQuery] string? action = null,
        [FromQuery] Guid? actorId = null,
        [FromQuery] string? entityId = null,
        [FromQuery] string? search = null,
        [FromQuery] DateTime? startDate = null,
        [FromQuery] DateTime? endDate = null,
        [FromQuery] int limit = 5000,
        CancellationToken ct = default)
    {
        var normalizedFormat = (format ?? "csv").Trim().ToLowerInvariant();
        if (normalizedFormat != "csv" && normalizedFormat != "json")
        {
            return BadRequest(ApiResponse<object>.Fail(
                "Invalid export format. Supported formats are 'csv' and 'json'.",
                new[] { new ApiFieldError("format", "INVALID_FORMAT", "format must be 'csv' or 'json'.") }));
        }

        if (startDate.HasValue && endDate.HasValue && startDate.Value > endDate.Value)
        {
            return BadRequest(ApiResponse<object>.Fail(
                "startDate must be earlier than or equal to endDate.",
                new[] { new ApiFieldError("startDate", "INVALID_DATE_RANGE", "Start date cannot exceed end date.") }));
        }

        var clampedLimit = Math.Clamp(limit, 1, 10000);

        var query = new ExportAuditLogsQuery(
            Format: normalizedFormat,
            Category: category,
            Severity: severity,
            Action: action,
            ActorId: actorId,
            EntityId: entityId,
            Search: search,
            StartDate: startDate,
            EndDate: endDate,
            Limit: clampedLimit);

        var result = await _sender.Send(query, ct);

        // Auditing the Auditor: High-urgency export audit event
        EnqueueAuditExportedEvent(
            format: normalizedFormat,
            rowCount: result.RowCount,
            metadata: new
            {
                Format = normalizedFormat,
                RowCount = result.RowCount,
                Category = category,
                Severity = severity,
                Search = search,
                StartDate = startDate,
                EndDate = endDate,
                Limit = clampedLimit
            });

        return File(result.ContentBytes, result.ContentType, result.FileName);
    }

    // ── Auditing the Auditor Helpers ─────────────────────────────────────────

    private void EnqueueAuditViewedEvent(string? targetEntityId, string filterSummary, object metadata)
    {
        var (actorName, actorRole) = ResolveActorCredentials();
        var clientIp = ResolveClientIpAddress();
        var userAgent = Request.Headers.UserAgent.ToString();

        _auditQueue.TryEnqueue(new AuditLogMessage
        {
            TenantId = _clinicContext.TenantId,
            ClinicId = _clinicContext.ClinicId,
            Timestamp = DateTime.UtcNow,
            Category = ClinicAuditCategories.Audit,
            Severity = ClinicAuditSeverities.Routine,
            Action = "audit.log.viewed",
            ActorStaffId = _clinicContext.StaffId,
            ActorName = actorName,
            ActorRole = actorRole,
            ClientIpAddress = clientIp,
            UserAgent = string.IsNullOrWhiteSpace(userAgent) ? "Internal/AuditApi" : userAgent,
            TargetEntityType = "ClinicAuditEntry",
            TargetEntityId = targetEntityId,
            Outcome = ClinicAuditOutcomes.Success,
            Description = $"Audit log accessed by {actorName} ({actorRole}) - {filterSummary}",
            MetadataJson = JsonSerializer.Serialize(metadata, JsonOptions)
        });
    }

    private void EnqueueAuditExportedEvent(string format, int rowCount, object metadata)
    {
        var (actorName, actorRole) = ResolveActorCredentials();
        var clientIp = ResolveClientIpAddress();
        var userAgent = Request.Headers.UserAgent.ToString();

        _auditQueue.TryEnqueue(new AuditLogMessage
        {
            TenantId = _clinicContext.TenantId,
            ClinicId = _clinicContext.ClinicId,
            Timestamp = DateTime.UtcNow,
            Category = ClinicAuditCategories.Audit,
            Severity = ClinicAuditSeverities.Urgent,
            Action = "audit.log.exported",
            ActorStaffId = _clinicContext.StaffId,
            ActorName = actorName,
            ActorRole = actorRole,
            ClientIpAddress = clientIp,
            UserAgent = string.IsNullOrWhiteSpace(userAgent) ? "Internal/AuditApi" : userAgent,
            TargetEntityType = "ClinicAuditEntry",
            TargetEntityId = null,
            Outcome = ClinicAuditOutcomes.Success,
            Description = $"Audit log exported in {format.ToUpperInvariant()} format ({rowCount} records) by {actorName} ({actorRole})",
            MetadataJson = JsonSerializer.Serialize(metadata, JsonOptions)
        });
    }

    private (string Name, string Role) ResolveActorCredentials()
    {
        var name = User.FindFirst("name")?.Value
                   ?? User.Identity?.Name
                   ?? "Clinic Administrator";

        var role = User.FindFirst("staff_role")?.Value
                   ?? "Administrator";

        return (name, role);
    }

    private string? ResolveClientIpAddress()
    {
        if (Request.Headers.TryGetValue("X-Forwarded-For", out var forwarded) && !string.IsNullOrWhiteSpace(forwarded))
        {
            var first = forwarded.ToString().Split(',')[0].Trim();
            if (!string.IsNullOrEmpty(first)) return first;
        }

        return HttpContext.Connection.RemoteIpAddress?.ToString() ?? "127.0.0.1";
    }
}
