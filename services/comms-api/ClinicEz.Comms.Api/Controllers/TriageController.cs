using System;
using System.Collections.Generic;
using System.Linq;
using System.Security.Claims;
using System.Threading;
using System.Threading.Tasks;
using ClinicEz.Comms.Application.Features.Triage.Commands;
using ClinicEz.Comms.Application.Models;
using ClinicEz.Shared.Interop.Contracts;
using MediatR;
using Microsoft.AspNetCore.Authorization;
using Microsoft.AspNetCore.Mvc;

namespace ClinicEz.Comms.Api.Controllers;

[ApiController]
[Route("api/v1/comms/triage")]
[Authorize]
public class TriageController : ControllerBase
{
    private readonly IMediator _mediator;

    public TriageController(IMediator mediator)
    {
        _mediator = mediator;
    }

    [HttpPost("submit")]
    public async Task<ActionResult<SubmitPatientRequestResult>> Submit(
        [FromBody] SubmitPatientRequestApiRequest request,
        CancellationToken ct)
    {
        var tenantId = User.FindFirstValue("tenant_id") ?? User.FindFirstValue("TenantId") ?? request.TenantId;
        var facilityId = User.FindFirstValue("facility_id") ?? User.FindFirstValue("FacilityId") ?? request.FacilityId;

        var command = new SubmitPatientRequestCommand(
            tenantId,
            facilityId,
            request.FacilityType ?? "Clinic",
            request.PatientId,
            request.SubmittingAccountId,
            request.Relationship,
            request.Category,
            request.ContentText,
            request.IsEmergencyConfirmed,
            request.Attachments);

        var result = await _mediator.Send(command, ct);
        return Ok(result);
    }

    [HttpPost("{id:guid}/disposition")]
    public async Task<ActionResult<ConversationDto>> RecordDisposition(
        Guid id,
        [FromBody] RecordDispositionApiRequest request,
        CancellationToken ct)
    {
        var tenantId = User.FindFirstValue("tenant_id") ?? User.FindFirstValue("TenantId") ?? string.Empty;
        var staffId = User.FindFirstValue(ClaimTypes.NameIdentifier) ?? User.FindFirstValue("sub") ?? string.Empty;
        var staffName = User.FindFirstValue(ClaimTypes.Name) ?? User.FindFirstValue("name") ?? "Staff Member";
        var permissions = User.FindAll("permissions").Select(c => c.Value).ToList();
        if (User.IsInRole("Admin"))
        {
            permissions.Add("admin");
        }

        var command = new RecordTriageDispositionCommand(
            id,
            tenantId,
            staffId,
            staffName,
            permissions,
            request.Disposition,
            request.DeclineReasonCode,
            request.AssignedStaffId,
            request.AssignedStaffName,
            request.Priority,
            request.InternalNote,
            request.PublicResponseText);

        var result = await _mediator.Send(command, ct);
        return Ok(result);
    }

    [HttpPost("{id:guid}/reopen")]
    public async Task<ActionResult<ConversationDto>> Reopen(
        Guid id,
        [FromBody] ReopenConversationApiRequest request,
        CancellationToken ct)
    {
        var tenantId = User.FindFirstValue("tenant_id") ?? User.FindFirstValue("TenantId") ?? string.Empty;

        var command = new ReopenConversationCommand(
            id,
            tenantId,
            request.PatientId,
            request.IsEmergencyConfirmed,
            request.Reason);

        var result = await _mediator.Send(command, ct);
        return Ok(result);
    }
}

public sealed record SubmitPatientRequestApiRequest(
    string TenantId,
    string FacilityId,
    string? FacilityType,
    Guid PatientId,
    Guid? SubmittingAccountId,
    string? Relationship,
    MessageCategory Category,
    string ContentText,
    bool? IsEmergencyConfirmed,
    IReadOnlyList<CommsAttachmentReference>? Attachments = null);

public sealed record RecordDispositionApiRequest(
    TriageDisposition Disposition,
    string? DeclineReasonCode = null,
    string? AssignedStaffId = null,
    string? AssignedStaffName = null,
    string? Priority = null,
    string? InternalNote = null,
    string? PublicResponseText = null);

public sealed record ReopenConversationApiRequest(
    Guid PatientId,
    bool? IsEmergencyConfirmed,
    string Reason);
