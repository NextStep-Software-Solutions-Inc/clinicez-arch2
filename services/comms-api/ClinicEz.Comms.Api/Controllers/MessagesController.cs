using System;
using System.Security.Claims;
using System.Threading;
using System.Threading.Tasks;
using ClinicEz.Comms.Application.Features.Messages.Commands;
using ClinicEz.Comms.Application.Features.Reactions.Commands;
using ClinicEz.Comms.Application.Models;
using MediatR;
using Microsoft.AspNetCore.Authorization;
using Microsoft.AspNetCore.Mvc;

namespace ClinicEz.Comms.Api.Controllers;

[ApiController]
[Route("api/v1/comms/messages")]
[Authorize]
public class MessagesController : ControllerBase
{
    private readonly IMediator _mediator;

    public MessagesController(IMediator mediator)
    {
        _mediator = mediator;
    }

    [HttpPost("{id:guid}/confirm-delivery")]
    public async Task<IActionResult> ConfirmDelivery(Guid id, [FromBody] ConfirmDeliveryRequest? request, CancellationToken ct)
    {
        var command = new ConfirmDeliveryCommand(id, request?.RecipientPartyAddress, request?.ReceivedAtUtc);
        var result = await _mediator.Send(command, ct);
        return Ok(new { success = result });
    }

    [HttpPost("{id:guid}/acknowledge")]
    public async Task<IActionResult> Acknowledge(Guid id, CancellationToken ct)
    {
        var staffId = User.FindFirstValue(ClaimTypes.NameIdentifier) ?? User.FindFirstValue("sub") ?? Guid.NewGuid().ToString();
        var displayName = User.FindFirstValue(ClaimTypes.Name) ?? User.FindFirstValue("name") ?? "Staff Member";
        var accountId = Guid.TryParse(staffId, out var g) ? g : Guid.NewGuid();

        var command = new AcknowledgeMessageCommand(id, accountId, displayName);
        var result = await _mediator.Send(command, ct);
        return Ok(new { success = result });
    }

    [HttpPost("{id:guid}/reactions")]
    public async Task<IActionResult> SendReaction(Guid id, [FromBody] SendReactionRequest request, CancellationToken ct)
    {
        var staffId = User.FindFirstValue(ClaimTypes.NameIdentifier) ?? User.FindFirstValue("sub") ?? string.Empty;
        var displayName = User.FindFirstValue(ClaimTypes.Name) ?? User.FindFirstValue("name") ?? "Staff Member";

        var command = new SendReactionCommand(id, staffId, displayName, request.Reaction);
        var isAdded = await _mediator.Send(command, ct);
        return Ok(new { isAdded });
    }

    [HttpPost("{id:guid}/resend")]
    public async Task<ActionResult<MessageDto>> Resend(Guid id, CancellationToken ct)
    {
        var tenantId = User.FindFirstValue("tenant_id") ?? User.FindFirstValue("TenantId") ?? string.Empty;
        var command = new ResendMessageCommand(id, tenantId);
        var result = await _mediator.Send(command, ct);
        return Ok(result);
    }
}

public sealed record ConfirmDeliveryRequest(
    string? RecipientPartyAddress,
    DateTime? ReceivedAtUtc);

public sealed record SendReactionRequest(string Reaction);
