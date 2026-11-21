using System;
using System.Security.Claims;
using System.Threading;
using System.Threading.Tasks;
using ClinicEz.Comms.Application.Common.Interfaces;
using ClinicEz.Comms.Application.Features.Attachments.Commands;
using ClinicEz.Comms.Application.Models;
using ClinicEz.Comms.Domain.Entities;
using ClinicEz.Comms.Domain.Enums;
using ClinicEz.Shared.Common;
using ClinicEz.Shared.Exceptions;
using ClinicEz.Shared.Interop;
using ClinicEz.Shared.Interop.Contracts;
using MediatR;
using Microsoft.AspNetCore.Authorization;
using Microsoft.AspNetCore.Http;
using Microsoft.AspNetCore.Mvc;
using Microsoft.EntityFrameworkCore;

namespace ClinicEz.Comms.Api.Controllers;

[ApiController]
[Route("api/v1/comms/attachments")]
[Authorize]
public class AttachmentsController : ControllerBase
{
    private readonly IMediator _mediator;
    private readonly ICommsDbContext _db;
    private readonly ICommsStorageService _storage;
    private readonly IInteropPublisher? _publisher;

    public AttachmentsController(
        IMediator mediator,
        ICommsDbContext db,
        ICommsStorageService storage,
        IInteropPublisher? publisher = null)
    {
        _mediator = mediator;
        _db = db;
        _storage = storage;
        _publisher = publisher;
    }

    [HttpPost("upload")]
    [RequestSizeLimit(10 * 1024 * 1024)]
    public async Task<ActionResult<CommsAttachmentDto>> Upload(
        IFormFile file,
        CancellationToken ct)
    {
        if (file == null || file.Length == 0)
        {
            return BadRequest(new { message = "No file uploaded or file is empty." });
        }

        var tenantId = User.FindFirstValue("tenant_id") ?? User.FindFirstValue("TenantId") ?? "default";
        var facilityId = User.FindFirstValue("facility_id") ?? User.FindFirstValue("FacilityId") ?? "default";

        using var stream = file.OpenReadStream();
        var command = new UploadAttachmentCommand(
            stream,
            file.FileName,
            file.ContentType,
            file.Length,
            tenantId,
            facilityId);

        var result = await _mediator.Send(command, ct);
        return Ok(result);
    }

    [HttpGet("{id:guid}/download")]
    public async Task<IActionResult> Download(Guid id, CancellationToken ct)
    {
        var tenantId = User.FindFirstValue("tenant_id") ?? User.FindFirstValue("TenantId") ?? string.Empty;

        var attachment = await _db.MessageAttachments
            .FirstOrDefaultAsync(a => a.Id == id && a.TenantId == tenantId, ct);

        if (attachment == null) return NotFound();

        if (attachment.Status == AttachmentStatus.Quarantined)
        {
            return StatusCode(StatusCodes.Status403Forbidden, new { message = "Attachment is quarantined due to security violation." });
        }

        var bytes = await _storage.ReadEncryptedAttachmentAsync(attachment.StoragePath, ct);
        if (bytes == null) return NotFound();

        return File(bytes, "application/octet-stream", attachment.SafeFileName);
    }

    [HttpPost("{id:guid}/file-to-chart")]
    public async Task<IActionResult> FileToChart(
        Guid id,
        [FromBody] FileToChartRequest request,
        CancellationToken ct)
    {
        var tenantId = User.FindFirstValue("tenant_id") ?? User.FindFirstValue("TenantId") ?? string.Empty;
        var staffId = User.FindFirstValue(ClaimTypes.NameIdentifier) ?? User.FindFirstValue("sub") ?? "system";
        var staffName = User.FindFirstValue(ClaimTypes.Name) ?? User.FindFirstValue("name") ?? "Staff Member";

        var attachment = await _db.MessageAttachments
            .Include(a => a.Message)
            .FirstOrDefaultAsync(a => a.Id == id && a.TenantId == tenantId, ct);

        if (attachment == null) return NotFound();

        if (attachment.Status != AttachmentStatus.Clean)
        {
            return BadRequest(new { message = $"Cannot file attachment with status '{attachment.Status}' to chart; scan status must be Clean." });
        }

        Conversation? conversation = null;
        if (attachment.Message != null)
        {
            conversation = await _db.Conversations.FirstOrDefaultAsync(c => c.Id == attachment.Message.ConversationId, ct);
        }

        attachment.IsFiledToChart = true;
        attachment.FiledAtUtc = DateTime.UtcNow;
        attachment.FiledByStaffId = staffId;

        if (_publisher != null)
        {
            var from = Party.ForFacility(attachment.TenantId, attachment.FacilityId, FacilityType.Clinic, service: InteropServices.Comms);
            var toFacility = Party.ForFacility(attachment.TenantId, attachment.FacilityId, FacilityType.Clinic);

            var payload = new CommsAttachmentFiledPayload(
                AttachmentId: attachment.Id,
                MessageId: attachment.MessageId,
                ConversationId: conversation?.Id ?? Guid.Empty,
                TenantId: attachment.TenantId,
                FacilityId: attachment.FacilityId,
                PatientId: conversation?.PatientId ?? Guid.Empty,
                ConsultationId: request.ConsultationId,
                RecordType: request.RecordType ?? "CommunicationAttachment",
                Title: string.IsNullOrWhiteSpace(request.Title) ? attachment.SafeFileName : request.Title.Trim(),
                OriginalFileName: attachment.OriginalFileName,
                SafeFileName: attachment.SafeFileName,
                ContentType: attachment.ContentType,
                FileSizeBytes: attachment.SanitizedSizeBytes > 0 ? attachment.SanitizedSizeBytes : attachment.OriginalSizeBytes,
                SHA256Checksum: attachment.SHA256Checksum,
                StoragePath: attachment.StoragePath,
                FiledByStaffId: staffId,
                FiledByStaffName: staffName,
                FiledAtUtc: DateTime.UtcNow,
                Notes: request.Notes,
                Version: 1);

            _publisher.Enqueue(
                InteropTypes.CommsAttachmentFiled,
                from,
                toFacility,
                correlationId: attachment.Id,
                payload);
        }

        await _db.SaveChangesAsync(ct);

        return Ok(new
        {
            message = "Attachment successfully filed to chart.",
            attachmentId = attachment.Id,
            filedAtUtc = attachment.FiledAtUtc
        });
    }
}

public sealed record FileToChartRequest(
    Guid? ConsultationId = null,
    string? RecordType = "CommunicationAttachment",
    string? Title = null,
    string? Notes = null);
