using System;
using System.Threading;
using System.Threading.Tasks;
using ClinicEz.Clinic.Application.Common.Interfaces;
using ClinicEz.Clinic.Application.Features.LabOrders.DTOs;
using ClinicEz.Shared.Exceptions;
using ClinicEz.Shared.Interoperability;
using MediatR;

namespace ClinicEz.Clinic.Application.Features.LabOrders.Commands;

/// <summary>An anonymous upload through the public link. The grant decides who the uploader is, never the request.</summary>
public record SubmitPublicLabUploadCommand(
    string Token,
    string? ExternalLabName,
    byte[] Content,
    string ContentType,
    string? FileName,
    string? Notes,
    string? ContactNumber = null,
    string? PathologistName = null,
    string? PathologistPrcLicense = null
) : IRequest<PublicLabUploadReceipt>;

public class SubmitPublicLabUploadCommandHandler : IRequestHandler<SubmitPublicLabUploadCommand, PublicLabUploadReceipt>
{
    private readonly IUploadGrantService _grants;
    private readonly ILabResultIntake _intake;

    public SubmitPublicLabUploadCommandHandler(IUploadGrantService grants, ILabResultIntake intake)
    {
        _grants = grants;
        _intake = intake;
    }

    public async Task<PublicLabUploadReceipt> Handle(SubmitPublicLabUploadCommand request, CancellationToken cancellationToken)
    {
        if (string.IsNullOrWhiteSpace(request.Token))
        {
            throw new BadRequestException("Upload token is required.");
        }

        var grant = await _grants.ResolveAsync(request.Token, cancellationToken);
        if (grant == null || !grant.IsUsable(DateTime.UtcNow))
        {
            throw new NotFoundException("Invalid or expired laboratory upload link.");
        }

        var source = grant.Grant.Kind == UploaderKind.Patient ? ResultSource.PatientUploaded : ResultSource.ExternalLab;
        var outcome = await _intake.SubmitAsync(new LabResultSubmission(
            grant.Grant.ClinicId,
            grant.Order.Id,
            source,
            request.Content,
            request.FileName,
            request.ContentType,
            request.ExternalLabName,
            LabResultUploadFiles.ComposeNotes(request.Notes, request.ContactNumber, request.PathologistName, request.PathologistPrcLicense),
            grant.Grant), cancellationToken);

        return new PublicLabUploadReceipt(outcome.ResultId, outcome.OrderNumber, outcome.ReceivedAtUtc);
    }
}
