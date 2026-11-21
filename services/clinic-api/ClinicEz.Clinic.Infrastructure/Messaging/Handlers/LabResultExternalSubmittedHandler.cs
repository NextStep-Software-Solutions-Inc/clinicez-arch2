using System;
using System.Threading;
using System.Threading.Tasks;
using ClinicEz.Clinic.Application.Common.Interfaces;
using ClinicEz.Clinic.Application.Features.LabOrders;
using ClinicEz.Clinic.Domain.Entities;
using ClinicEz.Clinic.Infrastructure.Persistence;
using ClinicEz.Shared.Exceptions;
using ClinicEz.Shared.Interop;
using ClinicEz.Shared.Interop.Handling;
using ClinicEz.Shared.Interoperability;
using Microsoft.EntityFrameworkCore;
using Microsoft.Extensions.Logging;

namespace ClinicEz.Clinic.Infrastructure.Messaging;

/// <summary>
/// A result uploaded outside the clinic (<c>lab.result.external.submitted</c>). Two channels are accepted and the result source
/// is derived from the channel, never from the payload:
/// <list type="bullet">
/// <item>the portal relaying an anonymous external-lab upload: the payload must carry a valid, unexpired, unexhausted
/// <c>UploadToken</c> (an ExternalLab grant) of this very order;</item>
/// <item>a ClinicEZ patient: no token, but the requisition must belong to that patient.</item>
/// </list>
/// Anything else, and any file that fails the configured size/type rules, is acknowledged and ignored with a warning.
/// </summary>
public sealed class LabResultExternalSubmittedHandler : IInteropHandler<ExternalLabResultUploadedEvent>
{
    private readonly ApplicationDbContext _dbContext;
    private readonly ClinicRecipientResolver _recipient;
    private readonly IUploadGrantService _grants;
    private readonly ILabResultIntake _intake;
    private readonly ILogger<LabResultExternalSubmittedHandler> _logger;

    public LabResultExternalSubmittedHandler(
        ApplicationDbContext dbContext,
        ClinicRecipientResolver recipient,
        IUploadGrantService grants,
        ILabResultIntake intake,
        ILogger<LabResultExternalSubmittedHandler> logger)
    {
        _dbContext = dbContext;
        _recipient = recipient;
        _grants = grants;
        _intake = intake;
        _logger = logger;
    }

    public async Task HandleAsync(ExternalLabResultUploadedEvent message, InteropMessageContext context, CancellationToken ct)
    {
        var clinic = await _recipient.ResolveAsync(context, ct);
        if (clinic == null) return;

        var requisitionId = context.CorrelationId;
        if (message.RequisitionId != requisitionId)
        {
            Ignore(context, $"requisition {message.RequisitionId} does not match correlation {requisitionId}");
            return;
        }

        ResultSource source;
        UploadGrant? grant = null;
        Guid? patientAccountId = null;

        if (context.From.Kind == PartyKind.ControlPlane && context.From.Service == InteropServices.Portal)
        {
            var resolved = string.IsNullOrWhiteSpace(message.UploadToken)
                ? null
                : await _grants.ResolveAsync(message.UploadToken, ct);
            if (resolved == null
                || resolved.Grant.ClinicId != clinic.ClinicId
                || resolved.Order.Id != requisitionId
                || resolved.Grant.Kind != UploaderKind.ExternalLab
                || !resolved.IsUsable(DateTime.UtcNow))
            {
                Ignore(context, "the portal relayed an upload without a valid external-lab upload grant for this requisition");
                return;
            }

            source = ResultSource.ExternalLab;
            grant = resolved.Grant;
        }
        else if (context.From.Kind == PartyKind.Patient && Guid.TryParse(context.From.PatientId, out var senderId))
        {
            var owned = await (
                from order in _dbContext.LabOrders.IgnoreQueryFilters()
                join patient in _dbContext.Patients.IgnoreQueryFilters() on order.PatientId equals patient.Id
                where !order.IsDeleted && order.ClinicId == clinic.ClinicId && order.Id == requisitionId
                      && !patient.IsDeleted && patient.ClinicId == clinic.ClinicId && patient.CloudPatientId == senderId
                select order.Id).AnyAsync(ct);
            if (!owned)
            {
                Ignore(context, "the requisition does not belong to the uploading patient");
                return;
            }

            source = ResultSource.PatientUploaded;
            patientAccountId = senderId;
        }
        else
        {
            Ignore(context, "the sender may not upload results");
            return;
        }

        try
        {
            var (content, contentType) = LabResultUploadFiles.Decode(message.FileBase64, message.ContentType, message.DocumentType);
            await _intake.SubmitAsync(new LabResultSubmission(
                clinic.ClinicId,
                requisitionId,
                source,
                content,
                message.FileName,
                contentType,
                message.ExternalLabName,
                message.Notes,
                grant,
                patientAccountId), ct);
        }
        catch (Exception ex) when (ex is BadRequestException or NotFoundException)
        {
            Ignore(context, ex.Message);
        }
    }

    private void Ignore(InteropMessageContext context, string reason) =>
        _logger.LogWarning("[ClinicEz.Clinic] Ignoring {Type} message {MessageId}: {Reason}.", context.Type, context.MessageId, reason);
}
