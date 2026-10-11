using ClinicEz.Patient.Application.Common.Errors;
using ClinicEz.Patient.Application.Common.Interfaces;
using ClinicEz.Patient.Domain.Enums;
using ClinicEz.Patient.Domain.Interfaces;
using ClinicEz.Shared.Common;
using ClinicEz.Shared.Exceptions;
using ClinicEz.Shared.Interop;
using ClinicEz.Shared.Interoperability;
using FluentValidation;
using MediatR;

namespace ClinicEz.Patient.Application.Features.Documents.Commands.MarkPrescriptionExternallyDispensed;

public sealed record ReceiptFile(Stream Content, string FileName, string ContentType, long Length);

/// <summary>The patient reports having a prescription filled at a pharmacy outside ClinicEZ, optionally with a photo of the receipt.</summary>
public sealed record MarkPrescriptionExternallyDispensedCommand(
    Guid PatientId,
    Guid PrescriptionId,
    string PharmacyName,
    string? BranchLocation,
    string? PharmacistName,
    string? ReceiptNumber,
    string? Notes,
    ReceiptFile? Receipt) : IRequest<ExternalDispenseAcceptedDto>;

public sealed record ExternalDispenseAcceptedDto(Guid PrescriptionId, string Stage);

public sealed class MarkPrescriptionExternallyDispensedCommandValidator : AbstractValidator<MarkPrescriptionExternallyDispensedCommand>
{
    public const int MaxFieldLength = 200;
    public const int MaxNotesLength = 1000;

    public MarkPrescriptionExternallyDispensedCommandValidator()
    {
        RuleFor(x => x.PharmacyName).NotEmpty().WithErrorCode(ErrorCodes.RequiredFieldMissing)
            .MaximumLength(MaxFieldLength).WithErrorCode(ErrorCodes.FieldTooLong);
        RuleFor(x => x.BranchLocation).MaximumLength(MaxFieldLength).WithErrorCode(ErrorCodes.FieldTooLong);
        RuleFor(x => x.PharmacistName).MaximumLength(MaxFieldLength).WithErrorCode(ErrorCodes.FieldTooLong);
        RuleFor(x => x.ReceiptNumber).MaximumLength(MaxFieldLength).WithErrorCode(ErrorCodes.FieldTooLong);
        RuleFor(x => x.Notes).MaximumLength(MaxNotesLength).WithErrorCode(ErrorCodes.FieldTooLong);

        When(x => x.Receipt is not null, () =>
        {
            RuleFor(x => x.Receipt!.Length)
                .GreaterThan(0).WithErrorCode(ErrorCodes.RequiredFieldMissing).WithMessage("The receipt file is empty.")
                .LessThanOrEqualTo(PatientFileLimits.MaxFileBytes).WithErrorCode(ErrorCodes.FileSizeExceeded)
                .WithMessage($"The receipt must be at most {PatientFileLimits.MaxFileBytes / (1024 * 1024)} MB.");
            RuleFor(x => x.Receipt!.ContentType)
                .Must(PatientFileLimits.IsPdfOrImage).WithErrorCode(ErrorCodes.FileTypeNotAllowed)
                .WithMessage("Only PDF, JPEG, PNG and HEIC files are accepted.");
        });
    }
}

public sealed class MarkPrescriptionExternallyDispensedCommandHandler
    : IRequestHandler<MarkPrescriptionExternallyDispensedCommand, ExternalDispenseAcceptedDto>
{
    private static readonly HashSet<PrescriptionStage> FilledStages = [PrescriptionStage.Dispensed, PrescriptionStage.ExternalDispensed];

    private readonly IPatientDocumentRepository _documents;
    private readonly IStorageService _storage;
    private readonly IInteropPublisher _publisher;
    private readonly IUnitOfWork _unitOfWork;
    private readonly TimeProvider _clock;

    public MarkPrescriptionExternallyDispensedCommandHandler(
        IPatientDocumentRepository documents, IStorageService storage, IInteropPublisher publisher, IUnitOfWork unitOfWork, TimeProvider clock)
    {
        _documents = documents;
        _storage = storage;
        _publisher = publisher;
        _unitOfWork = unitOfWork;
        _clock = clock;
    }

    public async Task<ExternalDispenseAcceptedDto> Handle(MarkPrescriptionExternallyDispensedCommand request, CancellationToken cancellationToken)
    {
        var prescription = await _documents.GetPrescriptionAsync(request.PatientId, request.PrescriptionId, cancellationToken)
            ?? throw new NotFoundException($"Prescription '{request.PrescriptionId}' was not found.");

        if (FilledStages.Contains(prescription.Stage))
            throw new ConflictException("This prescription has already been dispensed.");

        if (string.IsNullOrWhiteSpace(prescription.OrderingTenantId) || !Guid.TryParse(prescription.OrderingFacilityId, out _))
            throw new ConflictException("The clinic that issued this prescription is not known yet, so the report cannot be sent. Try again later.");

        var now = _clock.GetUtcNow().UtcDateTime;
        string? receiptKey = null;
        string? receiptUrl = null;

        if (request.Receipt is { } receipt)
        {
            receiptKey = $"patients/{request.PatientId}/prescriptions/{request.PrescriptionId}/receipt/{Guid.NewGuid():N}/{PatientFileLimits.SafeFileName(receipt.FileName)}";
            await _storage.UploadAsync(receipt.Content, receiptKey, receipt.ContentType, cancellationToken);
        }

        try
        {
            if (receiptKey is not null)
                receiptUrl = await _storage.GeneratePresignedDownloadUrlAsync(
                    receiptKey, PatientFileLimits.ClinicDownloadWindow, cancellationToken);

            prescription.Stage = PrescriptionStage.ExternalDispensed;
            prescription.StageChangedAt = now;
            prescription.DispensedAt = now;
            prescription.ExternalPharmacyName = request.PharmacyName.Trim();
            prescription.ReceiptNumber = request.ReceiptNumber;

            _publisher.Enqueue(
                InteropTypes.RxExternalDispensed,
                Party.ForPatient(request.PatientId.ToString()),
                Party.ForFacility(prescription.OrderingTenantId, prescription.OrderingFacilityId, FacilityType.Clinic),
                prescription.PrescriptionId,
                new ExternalPrescriptionDispensedEvent
                {
                    PrescriptionId = prescription.PrescriptionId,
                    PrescriptionNumber = prescription.PrescriptionNumber,
                    ExternalPharmacyName = request.PharmacyName.Trim(),
                    ExternalBranchLocation = request.BranchLocation,
                    PharmacistName = request.PharmacistName,
                    OfficialReceiptNumber = request.ReceiptNumber,
                    ReceiptDocumentUrl = receiptUrl,
                    Notes = request.Notes,
                    DispensedAt = now
                });

            await _unitOfWork.SaveChangesAsync(cancellationToken);
        }
        catch
        {
            if (receiptKey is not null)
                await _storage.DeleteAsync(receiptKey, CancellationToken.None);
            throw;
        }

        return new ExternalDispenseAcceptedDto(prescription.PrescriptionId, PatientDocumentMapper.Name(PrescriptionStage.ExternalDispensed));
    }
}
