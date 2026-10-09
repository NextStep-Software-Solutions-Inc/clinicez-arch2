using ClinicEz.Patient.Application.Common.Errors;
using ClinicEz.Patient.Application.Common.Interfaces;
using ClinicEz.Patient.Domain.Entities;
using ClinicEz.Patient.Domain.Enums;
using ClinicEz.Patient.Domain.Interfaces;
using ClinicEz.Shared.Common;
using ClinicEz.Shared.Exceptions;
using ClinicEz.Shared.Interop;
using ClinicEz.Shared.Interoperability;
using FluentValidation;
using MediatR;

namespace ClinicEz.Patient.Application.Features.Documents.Commands.UploadLabResult;

/// <summary>The patient attaches the result of a lab request they had done elsewhere. The file is stored here and only referenced to the ordering clinic.</summary>
public sealed record UploadLabResultCommand(
    Guid PatientId, Guid RequisitionId, Stream Content, string FileName, string ContentType, long Length, string? Notes)
    : IRequest<LabResultUploadAcceptedDto>;

public sealed record LabResultUploadAcceptedDto(Guid ResultId, string Verification, string Source);

public sealed class UploadLabResultCommandValidator : AbstractValidator<UploadLabResultCommand>
{
    public const int MaxNotesLength = 1000;

    public UploadLabResultCommandValidator()
    {
        RuleFor(x => x.FileName).NotEmpty().WithErrorCode(ErrorCodes.RequiredFieldMissing);
        RuleFor(x => x.Length)
            .GreaterThan(0).WithErrorCode(ErrorCodes.RequiredFieldMissing).WithMessage("The file is empty.")
            .LessThanOrEqualTo(PatientFileLimits.MaxFileBytes).WithErrorCode(ErrorCodes.FileSizeExceeded)
            .WithMessage($"The file must be at most {PatientFileLimits.MaxFileBytes / (1024 * 1024)} MB.");
        RuleFor(x => x.ContentType)
            .Must(PatientFileLimits.IsPdfOrImage).WithErrorCode(ErrorCodes.FileTypeNotAllowed)
            .WithMessage("Only PDF, JPEG, PNG and HEIC files are accepted.");
        RuleFor(x => x.Notes).MaximumLength(MaxNotesLength).WithErrorCode(ErrorCodes.FieldTooLong);
    }
}

public sealed class UploadLabResultCommandHandler : IRequestHandler<UploadLabResultCommand, LabResultUploadAcceptedDto>
{
    private static readonly HashSet<LabSlipStage> ClosedStages = [LabSlipStage.Reviewed, LabSlipStage.Cancelled];

    private readonly IPatientDocumentRepository _documents;
    private readonly IStorageService _storage;
    private readonly IInteropPublisher _publisher;
    private readonly IUnitOfWork _unitOfWork;
    private readonly TimeProvider _clock;

    public UploadLabResultCommandHandler(
        IPatientDocumentRepository documents, IStorageService storage, IInteropPublisher publisher, IUnitOfWork unitOfWork, TimeProvider clock)
    {
        _documents = documents;
        _storage = storage;
        _publisher = publisher;
        _unitOfWork = unitOfWork;
        _clock = clock;
    }

    public async Task<LabResultUploadAcceptedDto> Handle(UploadLabResultCommand request, CancellationToken cancellationToken)
    {
        var slip = await _documents.GetLabSlipAsync(request.PatientId, request.RequisitionId, cancellationToken)
            ?? throw new NotFoundException($"Lab request '{request.RequisitionId}' was not found.");

        if (ClosedStages.Contains(slip.Stage))
            throw new ConflictException("This lab request is already closed, so a result can no longer be attached.");

        if (string.IsNullOrWhiteSpace(slip.OrderingTenantId) || !Guid.TryParse(slip.OrderingFacilityId, out _))
            throw new ConflictException("The clinic that ordered this lab request is not known yet, so the result cannot be sent. Try again later.");

        var now = _clock.GetUtcNow().UtcDateTime;
        var uploadId = Guid.NewGuid();
        var fileName = PatientFileLimits.SafeFileName(request.FileName);
        var key = $"patients/{request.PatientId}/lab-results/{uploadId}/{fileName}";

        await _storage.UploadAsync(request.Content, key, request.ContentType, cancellationToken);

        try
        {
            await _documents.AddLabReportAsync(new LabResultReport
            {
                PatientId = request.PatientId,
                ReportId = uploadId,
                RequisitionId = slip.RequisitionId,
                LaboratoryName = slip.LaboratoryName ?? "Uploaded by you",
                Title = slip.Title,
                ResultedAt = now,
                Source = ResultProvenance.PatientUploaded,
                Verification = ResultVerification.Unverified,
                FileStorageKey = key,
                FileName = fileName,
                FileContentType = request.ContentType
            }, cancellationToken);

            slip.Stage = LabSlipStage.ExternalSubmitted;
            slip.StageChangedAt = now;

            var downloadUrl = await _storage.GeneratePresignedDownloadUrlAsync(key, PatientFileLimits.ClinicDownloadWindow, cancellationToken);
            _publisher.Enqueue(
                InteropTypes.LabResultExternalSubmitted,
                Party.ForPatient(request.PatientId.ToString()),
                Party.ForFacility(slip.OrderingTenantId, slip.OrderingFacilityId, FacilityType.Clinic),
                slip.RequisitionId,
                new ExternalLabResultUploadedEvent
                {
                    UploadId = uploadId,
                    RequisitionId = slip.RequisitionId,
                    AccessionNumber = slip.AccessionNumber,
                    PatientId = request.PatientId,
                    UploadedBy = nameof(UploaderKind.Patient),
                    UploaderKind = UploaderKind.Patient,
                    FileName = fileName,
                    ContentType = request.ContentType,
                    DocumentType = request.ContentType == "application/pdf" ? "PDF" : "Photo",
                    DocumentUrl = downloadUrl,
                    Notes = request.Notes,
                    UploadedAt = now
                });

            await _unitOfWork.SaveChangesAsync(cancellationToken);
        }
        catch
        {
            await _storage.DeleteAsync(key, CancellationToken.None);
            throw;
        }

        return new LabResultUploadAcceptedDto(
            uploadId, PatientDocumentMapper.Name(ResultVerification.Unverified), PatientDocumentMapper.Name(ResultProvenance.PatientUploaded));
    }
}
