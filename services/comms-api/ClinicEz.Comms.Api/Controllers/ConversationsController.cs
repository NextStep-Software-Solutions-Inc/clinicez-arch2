using System;
using System.Collections.Generic;
using System.Linq;
using System.Security.Claims;
using System.Threading;
using System.Threading.Tasks;
using ClinicEz.Comms.Application.Features.Conversations.Commands;
using ClinicEz.Comms.Application.Features.Conversations.Queries;
using ClinicEz.Comms.Application.Features.Messages.Commands;
using ClinicEz.Comms.Application.Features.Triage.Commands;
using ClinicEz.Comms.Application.Models;
using ClinicEz.Shared.Interop.Contracts;
using MediatR;
using Microsoft.AspNetCore.Authorization;
using Microsoft.AspNetCore.Mvc;

namespace ClinicEz.Comms.Api.Controllers;

[ApiController]
[Route("api/v1/comms/conversations")]
[Authorize]
public class ConversationsController : ControllerBase
{
    private readonly IMediator _mediator;

    public ConversationsController(IMediator mediator)
    {
        _mediator = mediator;
    }

    [HttpPost]
    public async Task<ActionResult<ConversationDto>> Create(
        [FromBody] CreateConversationRequest request,
        CancellationToken ct)
    {
        var tenantId = User.FindFirstValue("tenant_id") ?? User.FindFirstValue("TenantId") ?? request.TenantId;
        var facilityId = User.FindFirstValue("facility_id") ?? User.FindFirstValue("FacilityId") ?? request.FacilityId;
        var staffId = User.FindFirstValue(ClaimTypes.NameIdentifier) ?? User.FindFirstValue("sub") ?? "system";

        var command = new CreateConversationCommand(
            tenantId,
            facilityId,
            request.BranchId,
            request.Scope,
            request.Kind,
            request.Title,
            request.ContextType,
            request.ContextId,
            request.Category,
            request.IsEmergencyConfirmed,
            request.IsLocalOnly,
            staffId,
            request.Participants);

        var result = await _mediator.Send(command, ct);
        return CreatedAtAction(nameof(GetById), new { id = result.Id }, result);
    }

    [HttpGet]
    public async Task<ActionResult<IReadOnlyList<ConversationDto>>> GetList(
        [FromQuery] string? facilityId,
        [FromQuery] string? participantId,
        [FromQuery] ConversationScope? scope,
        CancellationToken ct)
    {
        var tenantId = User.FindFirstValue("tenant_id") ?? User.FindFirstValue("TenantId") ?? string.Empty;
        var staffId = User.FindFirstValue(ClaimTypes.NameIdentifier) ?? User.FindFirstValue("sub");
        var hasTriagePerm = User.HasClaim("permissions", "messaging:triage") || User.IsInRole("Admin");
        var query = new GetConversationsQuery(tenantId, facilityId, participantId, scope, IncludeUnassignedTriage: hasTriagePerm, StaffId: staffId);
        var result = await _mediator.Send(query, ct);
        return Ok(result);
    }

    [HttpGet("{id:guid}")]
    public async Task<ActionResult<ConversationDto>> GetById(Guid id, CancellationToken ct)
    {
        var tenantId = User.FindFirstValue("tenant_id") ?? User.FindFirstValue("TenantId") ?? string.Empty;
        var query = new GetConversationByIdQuery(id, tenantId);
        var result = await _mediator.Send(query, ct);
        if (result == null) return NotFound();
        return Ok(result);
    }

    [HttpPost("{id:guid}/messages")]
    public async Task<ActionResult<MessageDto>> SendMessage(
        Guid id,
        [FromBody] SendMessageApiRequest request,
        CancellationToken ct)
    {
        var tenantId = User.FindFirstValue("tenant_id") ?? User.FindFirstValue("TenantId") ?? string.Empty;
        var facilityId = User.FindFirstValue("facility_id") ?? User.FindFirstValue("FacilityId") ?? string.Empty;
        var staffId = User.FindFirstValue(ClaimTypes.NameIdentifier) ?? User.FindFirstValue("sub") ?? string.Empty;
        var displayName = User.FindFirstValue(ClaimTypes.Name) ?? User.FindFirstValue("name") ?? "Staff Member";

        var command = new SendMessageCommand(
            id,
            tenantId,
            facilityId,
            "Staff",
            staffId,
            displayName,
            request.ContentText,
            request.Visibility,
            request.RequiresAcknowledgement,
            request.Attachments,
            request.ClientMessageId);

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

    [HttpPost("{id:guid}/close")]
    public async Task<ActionResult<ConversationDto>> Close(
        Guid id,
        [FromBody] CloseConversationApiRequest? request,
        CancellationToken ct)
    {
        var tenantId = User.FindFirstValue("tenant_id") ?? User.FindFirstValue("TenantId") ?? string.Empty;
        var staffId = User.FindFirstValue(ClaimTypes.NameIdentifier) ?? User.FindFirstValue("sub") ?? "system";
        var staffName = User.FindFirstValue(ClaimTypes.Name) ?? User.FindFirstValue("name") ?? "Staff Member";

        var command = new CloseConversationCommand(
            id,
            tenantId,
            staffId,
            staffName,
            request?.Notes);

        var result = await _mediator.Send(command, ct);
        return Ok(result);
    }
}

public sealed record CloseConversationApiRequest(string? Notes = null);

public sealed record CreateConversationRequest(
    string TenantId,
    string FacilityId,
    string? BranchId,
    ConversationScope Scope,
    ConversationKind Kind,
    string Title,
    string? ContextType,
    string? ContextId,
    MessageCategory? Category,
    bool IsEmergencyConfirmed,
    bool IsLocalOnly,
    IReadOnlyList<ParticipantInput>? Participants);

public sealed record SendMessageApiRequest(
    string ContentText,
    MessageVisibility Visibility = MessageVisibility.Public,
    bool RequiresAcknowledgement = false,
    IReadOnlyList<CommsAttachmentReference>? Attachments = null,
    Guid? ClientMessageId = null);
