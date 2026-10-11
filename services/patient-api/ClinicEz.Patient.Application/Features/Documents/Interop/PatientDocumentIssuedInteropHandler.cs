using System.Text.Json;
using ClinicEz.Patient.Application.Common.Interfaces;
using ClinicEz.Patient.Domain.Entities;
using ClinicEz.Patient.Domain.Enums;
using ClinicEz.Patient.Domain.Interfaces;
using ClinicEz.Shared.Interop;
using ClinicEz.Shared.Interop.Handling;
using ClinicEz.Shared.Interoperability;
using Microsoft.Extensions.Logging;

namespace ClinicEz.Patient.Application.Features.Documents.Interop;

/// <summary>
/// Keeps the patient's own copy of everything a facility issues to them (right of access): lab requests, prescriptions,
/// lab results, medical certificates and dispense receipts. Documents are upserted by their source id, so redelivery and
/// re-issue are harmless. A message is only honoured when the authenticated sender is the issuing facility named in the
/// payload, the envelope is addressed to the patient the payload is about, and the structured body agrees with both;
/// anything else is ignored (and acknowledged) rather than retried.
/// </summary>
public sealed class PatientDocumentIssuedInteropHandler : IInteropHandler<PatientDocumentIssuedPayload>
{
    private static readonly JsonSerializerOptions ItemJson = new(JsonSerializerDefaults.Web);

    private readonly IPatientRepository _patients;
    private readonly IPatientDocumentRepository _documents;
    private readonly PatientDocumentNotifier _notifier;
    private readonly IStorageService _storage;
    private readonly IUnitOfWork _unitOfWork;
    private readonly ILogger<PatientDocumentIssuedInteropHandler> _logger;

    public PatientDocumentIssuedInteropHandler(
        IPatientRepository patients,
        IPatientDocumentRepository documents,
        PatientDocumentNotifier notifier,
        IStorageService storage,
        IUnitOfWork unitOfWork,
        ILogger<PatientDocumentIssuedInteropHandler> logger)
    {
        _patients = patients;
        _documents = documents;
        _notifier = notifier;
        _storage = storage;
        _unitOfWork = unitOfWork;
        _logger = logger;
    }

    public async Task HandleAsync(PatientDocumentIssuedPayload payload, InteropMessageContext context, CancellationToken ct)
    {
        if (!DocumentInteropRules.IsFromFacility(context.From, payload.IssuerTenantId, payload.IssuerFacilityId))
        {
            _logger.LogWarning(
                "Ignoring patient.document.issued {MessageId}: sender {Sender} is not issuer {TenantId}/{FacilityId}.",
                context.MessageId, context.From.Address, payload.IssuerTenantId, payload.IssuerFacilityId);
            return;
        }

        if (!DocumentInteropRules.IsAddressedToPatient(context.To, payload.PatientId))
        {
            _logger.LogWarning(
                "Ignoring patient.document.issued {MessageId}: addressed to {Recipient}, payload is for patient {PatientId}.",
                context.MessageId, context.To.Address, payload.PatientId);
            return;
        }

        if (await _patients.GetByIdAsync(payload.PatientId, ct) is null)
        {
            _logger.LogWarning("Ignoring patient.document.issued {MessageId}: patient {PatientId} does not exist.", context.MessageId, payload.PatientId);
            return;
        }

        var accepted = payload.Kind switch
        {
            PatientDocumentKind.LabRequest => await ApplyLabRequestAsync(payload, ct),
            PatientDocumentKind.Prescription => await ApplyPrescriptionAsync(payload, ct),
            PatientDocumentKind.LabResult => await ApplyLabResultAsync(payload, ct),
            PatientDocumentKind.MedicalCertificate => await ApplyCertificateAsync(payload, ct),
            PatientDocumentKind.DispenseReceipt => await ApplyDispenseReceiptAsync(payload, ct),
            _ => false
        };

        if (!accepted)
        {
            _logger.LogWarning(
                "Ignoring patient.document.issued {MessageId}: the {Kind} body is missing, unreadable or contradicts the envelope.",
                context.MessageId, payload.Kind);
            return;
        }

        await _unitOfWork.SaveChangesAsync(ct);
    }

    private async Task<bool> ApplyLabRequestAsync(PatientDocumentIssuedPayload payload, CancellationToken ct)
    {
        var body = ReadBody<LabRequisitionIssuedEvent>(payload);
        if (body is null || body.RequisitionId != payload.DocumentId
            || !Same(body.TenantId, payload.IssuerTenantId) || !Same(body.OrderingFacilityId, payload.IssuerFacilityId))
            return false;

        var slip = await PatientDocumentStore.GetOrCreateLabSlipAsync(
            _documents, payload.PatientId, body.RequisitionId, body.TenantId, body.OrderingFacilityId,
            PatientDocumentStore.Utc(body.IssuedAt), ct);

        var isFirstSight = !slip.HasDetails;
        if (isFirstSight && slip.StageChangedAt is null)
        {
            slip.Stage = Enum.TryParse<LabSlipStage>(payload.Status, true, out var stage) ? stage : LabSlipStage.Issued;
            slip.StageChangedAt = PatientDocumentStore.Utc(body.IssuedAt);
        }

        slip.OrderingTenantId = body.TenantId;
        slip.OrderingFacilityId = body.OrderingFacilityId;
        slip.OrderingFacilityName = body.OrderingFacilityName;
        slip.AccessionNumber = body.AccessionNumber;
        slip.Title = TitleOr(payload, "Laboratory request");
        slip.Urgency = body.Urgency;
        slip.ItemsJson = JsonSerializer.Serialize(
            body.Items.Select(i => new LabRequestItemDto(i.ItemCode, i.ItemName, i.Category)), ItemJson);
        slip.ClaimToken = payload.ClaimToken ?? slip.ClaimToken;
        slip.IssuedAt = PatientDocumentStore.Utc(body.IssuedAt);
        slip.HasDetails = true;

        if (isFirstSight)
            await _notifier.NotifyAsync(
                payload.PatientId, NotificationType.LabResult, "New lab request",
                $"{body.OrderingFacilityName} issued a lab request: {slip.Title}.",
                "labRequest", body.RequisitionId, ct);

        return true;
    }

    private async Task<bool> ApplyPrescriptionAsync(PatientDocumentIssuedPayload payload, CancellationToken ct)
    {
        var body = ReadBody<PrescriptionIssuedEvent>(payload);
        if (body is null || body.PrescriptionId != payload.DocumentId
            || !Same(body.TenantId, payload.IssuerTenantId) || !Same(body.OrderingFacilityId, payload.IssuerFacilityId))
            return false;

        var issuedAt = PatientDocumentStore.Utc(body.IssuedAt);
        var rx = await PatientDocumentStore.GetOrCreatePrescriptionAsync(
            _documents, payload.PatientId, body.PrescriptionId, body.TenantId, body.OrderingFacilityId, issuedAt, ct);

        var isFirstSight = !rx.HasDetails;
        if (isFirstSight && rx.StageChangedAt is null)
            rx.StageChangedAt = issuedAt;

        rx.PrescriptionNumber = body.PrescriptionNumber;
        rx.OrderingTenantId = body.TenantId;
        rx.OrderingFacilityId = body.OrderingFacilityId;
        rx.OrderingFacilityName = body.OrderingFacilityName;
        rx.PrescriberName = body.PrescriberDoctor.DoctorName;
        rx.PrescriberPrcLicense = body.PrescriberDoctor.PrcLicenseNumber;
        rx.Diagnosis = body.ClinicalDiagnosis;
        rx.Instructions = body.SpecialInstructions;
        rx.ClaimToken = payload.ClaimToken ?? rx.ClaimToken;
        rx.VerificationUrl = FirstNonEmpty(payload.VerificationUrl, body.PublicVerificationUrl) ?? rx.VerificationUrl;
        rx.IssuedAt = issuedAt;
        rx.HasDetails = true;

        _documents.RemovePrescriptionLines(rx.Lines.ToList());
        var clinicId = Guid.TryParse(body.OrderingFacilityId, out var parsed) ? parsed : Guid.Empty;
        _documents.AddPrescriptionLines(body.Items.Select((item, index) => new Prescription
        {
            PrescriptionDocumentId = rx.Id,
            PatientId = payload.PatientId,
            ClinicId = clinicId,
            MedicationName = item.GenericName,
            GenericName = item.GenericName,
            BrandName = item.BrandName,
            Form = item.Form,
            SortOrder = index,
            Dosage = item.Dosage,
            Frequency = item.Sig,
            Duration = item.DurationDays?.ToString(System.Globalization.CultureInfo.InvariantCulture),
            Instructions = item.Remarks,
            Quantity = item.Quantity,
            IssuedAt = issuedAt
        }).ToList());

        if (isFirstSight)
            await _notifier.NotifyAsync(
                payload.PatientId, NotificationType.System, "New prescription",
                $"{body.PrescriberDoctor.DoctorName} of {body.OrderingFacilityName} issued prescription {body.PrescriptionNumber}.",
                "prescription", body.PrescriptionId, ct);

        return true;
    }

    private async Task<bool> ApplyLabResultAsync(PatientDocumentIssuedPayload payload, CancellationToken ct)
    {
        var body = ReadBody<DiagnosticReportFinalizedEvent>(payload);
        if (body is null || body.ReportId != payload.DocumentId
            || !Same(body.LaboratoryTenantId, payload.IssuerTenantId) || !Same(body.LaboratoryFacilityId, payload.IssuerFacilityId)
            || (body.PatientId is { } bodyPatient && bodyPatient != payload.PatientId))
            return false;

        var releasedAt = PatientDocumentStore.Utc(body.ReleasedAt);
        var report = await _documents.GetLabReportAsync(payload.PatientId, body.ReportId, ct);
        var isFirstSight = report is null;
        if (report is null)
        {
            var source = payload.Source ?? ResultSource.ClinicEzLab;
            report = new LabResultReport
            {
                PatientId = payload.PatientId,
                ReportId = body.ReportId,
                Source = PatientDocumentStore.ToDomain(source),
                Verification = PatientDocumentStore.ToDomain(
                    payload.Verification ?? (source == ResultSource.ClinicEzLab ? VerificationState.Verified : VerificationState.Unverified))
            };
            await _documents.AddLabReportAsync(report, ct);
        }
        else if (payload.Verification is { } verification)
        {
            report.Verification = PatientDocumentStore.ToDomain(verification);
        }

        report.RequisitionId = body.RequisitionId == Guid.Empty ? null : body.RequisitionId;
        report.LaboratoryName = string.IsNullOrWhiteSpace(body.LaboratoryName) ? payload.IssuerName : body.LaboratoryName;
        report.Title = TitleOr(payload, "Laboratory result");
        report.Impression = body.PathologistImpression;
        report.IsCritical = body.IsCriticalResult;
        report.ResultedAt = releasedAt;

        await AttachReportFileAsync(report, body, ct);

        _documents.RemoveLabObservations(report.Observations.ToList());
        var clinicId = Guid.TryParse(body.LaboratoryFacilityId, out var parsed) ? parsed : Guid.Empty;
        _documents.AddLabObservations(body.Observations.Select(o => new LabResult
        {
            PatientId = payload.PatientId,
            ClinicId = clinicId,
            LabResultReportId = report.Id,
            TestName = o.AnalyteName,
            Category = LabResultCategory.Other,
            Result = o.Value,
            ReferenceRange = o.ReferenceInterval,
            Unit = o.Unit,
            Panel = o.PanelName,
            Flag = o.Flag,
            Status = LabResultStatus.Final,
            ResultedAt = releasedAt
        }).ToList());

        if (isFirstSight)
            await _notifier.NotifyAsync(
                payload.PatientId, NotificationType.LabResult, "Lab result available",
                $"{report.LaboratoryName} released your result: {report.Title}.",
                "labResult", body.ReportId, ct);

        return true;
    }

    private async Task AttachReportFileAsync(LabResultReport report, DiagnosticReportFinalizedEvent body, CancellationToken ct)
    {
        if (string.IsNullOrEmpty(body.SignedPdfBase64))
            return;

        // Base64 inflates by a third; refuse oversized input before decoding it.
        if (body.SignedPdfBase64.Length / 4L * 3 > PatientFileLimits.MaxFileBytes)
        {
            _logger.LogWarning("Dropping the signed PDF of report {ReportId}: larger than {Limit} bytes.", report.ReportId, PatientFileLimits.MaxFileBytes);
            return;
        }

        byte[] bytes;
        try
        {
            bytes = Convert.FromBase64String(body.SignedPdfBase64);
        }
        catch (FormatException)
        {
            _logger.LogWarning("Dropping the signed PDF of report {ReportId}: not valid base64.", report.ReportId);
            return;
        }

        var key = $"patients/{report.PatientId}/lab-results/{report.ReportId}/report.pdf";
        await using var stream = new MemoryStream(bytes);
        report.FileStorageKey = await _storage.UploadAsync(stream, key, "application/pdf", ct);
        report.FileName = "report.pdf";
        report.FileContentType = "application/pdf";
    }

    private async Task<bool> ApplyCertificateAsync(PatientDocumentIssuedPayload payload, CancellationToken ct)
    {
        var body = ReadBody<MedicalCertificateIssuedPayload>(payload);
        if (body is null || body.CertificateId != payload.DocumentId || body.PatientId != payload.PatientId
            || !Same(body.IssuerTenantId, payload.IssuerTenantId) || !Same(body.IssuerFacilityId, payload.IssuerFacilityId))
            return false;

        var certificate = await _documents.GetCertificateAsync(payload.PatientId, body.CertificateId, ct);
        var isFirstSight = certificate is null;
        if (certificate is null)
        {
            certificate = new MedicalCertificate { PatientId = payload.PatientId, CertificateId = body.CertificateId };
            await _documents.AddCertificateAsync(certificate, ct);
        }

        certificate.CertificateNumber = body.CertificateNumber;
        certificate.IssuerTenantId = body.IssuerTenantId;
        certificate.IssuerFacilityId = body.IssuerFacilityId;
        certificate.IssuerName = body.IssuerName;
        certificate.DoctorName = body.DoctorName;
        certificate.DoctorPrcLicense = body.DoctorPrcLicense;
        certificate.DoctorPtrNumber = body.DoctorPtrNumber;
        certificate.Purpose = body.Purpose;
        certificate.Diagnosis = body.Diagnosis;
        certificate.Remarks = body.Remarks;
        certificate.RestDays = body.RestDays;
        certificate.ValidFrom = PatientDocumentStore.Utc(body.ValidFrom);
        certificate.ValidTo = PatientDocumentStore.Utc(body.ValidTo);
        certificate.IssuedAt = PatientDocumentStore.Utc(body.IssuedAtUtc);
        certificate.VerificationToken = FirstNonEmpty(payload.VerificationToken, body.VerificationToken);
        certificate.VerificationUrl = FirstNonEmpty(payload.VerificationUrl, body.VerificationUrl);

        if (isFirstSight)
            await _notifier.NotifyAsync(
                payload.PatientId, NotificationType.System, "Medical certificate issued",
                $"{body.DoctorName} of {body.IssuerName} issued a medical certificate.",
                "medicalCertificate", body.CertificateId, ct);

        return true;
    }

    private async Task<bool> ApplyDispenseReceiptAsync(PatientDocumentIssuedPayload payload, CancellationToken ct)
    {
        var body = ReadBody<PrescriptionDispensedEvent>(payload);
        if (body is null || body.PrescriptionId == Guid.Empty
            || !Same(body.PharmacyTenantId, payload.IssuerTenantId) || !Same(body.PharmacyFacilityId, payload.IssuerFacilityId)
            || (body.PatientId is { } bodyPatient && bodyPatient != payload.PatientId))
            return false;

        var dispensedAt = PatientDocumentStore.Utc(body.DispensedAt);
        var rx = await PatientDocumentStore.GetOrCreatePrescriptionAsync(
            _documents, payload.PatientId, body.PrescriptionId, body.OrderingTenantId, body.OrderingFacilityId, dispensedAt, ct);

        if (!PatientDocumentStore.IsCurrent(dispensedAt, rx.StageChangedAt))
            return true;

        var wasDispensed = rx.Stage == PrescriptionStage.Dispensed;
        rx.Stage = PrescriptionStage.Dispensed;
        rx.StageChangedAt = dispensedAt;
        rx.DispensedAt = dispensedAt;
        rx.ReceiptNumber = body.ReceiptNumber;
        rx.PharmacyName = body.PharmacyFacilityName;
        if (string.IsNullOrEmpty(rx.PrescriptionNumber))
            rx.PrescriptionNumber = body.PrescriptionNumber;

        if (!wasDispensed)
            await _notifier.NotifyAsync(
                payload.PatientId, NotificationType.System, "Prescription dispensed",
                $"{body.PharmacyFacilityName} dispensed your prescription{ReceiptSuffix(body.ReceiptNumber)}.",
                "prescription", body.PrescriptionId, ct);

        return true;
    }

    private static T? ReadBody<T>(PatientDocumentIssuedPayload payload) where T : class
    {
        if (payload.Body is not { ValueKind: JsonValueKind.Object } body)
            return null;

        try
        {
            return body.Deserialize<T>(InteropJson.Options);
        }
        catch (JsonException)
        {
            return null;
        }
    }

    private static bool Same(string? a, string? b) => string.Equals(a, b, StringComparison.OrdinalIgnoreCase);

    private static string TitleOr(PatientDocumentIssuedPayload payload, string fallback) =>
        string.IsNullOrWhiteSpace(payload.Title) ? fallback : payload.Title;

    private static string? FirstNonEmpty(params string?[] values) => values.FirstOrDefault(v => !string.IsNullOrWhiteSpace(v));

    private static string ReceiptSuffix(string? receiptNumber) =>
        string.IsNullOrWhiteSpace(receiptNumber) ? string.Empty : $" (receipt {receiptNumber})";
}
