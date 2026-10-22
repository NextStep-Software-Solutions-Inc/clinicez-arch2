using System.Text.Json;
using ClinicEz.Patient.Application.Common.DTOs;
using ClinicEz.Patient.Application.Common.Interfaces;
using ClinicEz.Patient.Domain.Entities;
using ClinicEz.Patient.Domain.Enums;

namespace ClinicEz.Patient.Application.Features.Documents;

/// <summary>Maps stored documents to the shapes the app consumes. Files are exposed as short-lived download links, never inline.</summary>
public sealed class PatientDocumentMapper
{
    /// <summary>How long a result-file download link stays valid.</summary>
    public static readonly TimeSpan FileLinkLifetime = TimeSpan.FromMinutes(15);

    private static readonly JsonSerializerOptions Json = new(JsonSerializerDefaults.Web);

    private static readonly HashSet<LabSlipStage> PaidStages =
    [
        LabSlipStage.Paid, LabSlipStage.SpecimenCollected, LabSlipStage.InProcess,
        LabSlipStage.ResultFinalized, LabSlipStage.Reviewed
    ];

    private readonly IStorageService _storage;

    public PatientDocumentMapper(IStorageService storage) => _storage = storage;

    public static string Name<TEnum>(TEnum value) where TEnum : struct, Enum => value.ToString();

    public static LabRequestDto ToDto(LabRequestSlip slip) => new(
        slip.Id,
        slip.RequisitionId,
        slip.OrderingTenantId,
        slip.OrderingFacilityId,
        slip.OrderingFacilityName,
        slip.AccessionNumber,
        slip.Title,
        slip.Urgency,
        ParseItems(slip.ItemsJson),
        Name(slip.Stage),
        slip.QuotedAmount,
        slip.Currency,
        slip.PaymentRequired,
        PaymentStatusOf(slip),
        slip.LaboratoryName,
        slip.ClaimToken,
        slip.Reason,
        slip.IssuedAt,
        slip.UpdatedAt ?? slip.CreatedAt);

    public static PrescriptionDto ToDto(PrescriptionDocument rx) => new(
        rx.Id,
        rx.PrescriptionNumber,
        rx.OrderingTenantId,
        rx.OrderingFacilityId,
        rx.OrderingFacilityName,
        rx.PrescriberName,
        rx.PrescriberPrcLicense,
        rx.Diagnosis,
        rx.Instructions,
        rx.Lines.OrderBy(l => l.SortOrder).Select(l => new PrescriptionItemViewDto(
            l.GenericName ?? l.MedicationName,
            l.BrandName,
            l.Dosage ?? string.Empty,
            l.Form ?? string.Empty,
            l.Frequency ?? string.Empty,
            l.Quantity ?? 0,
            int.TryParse(l.Duration, out var days) ? days : null,
            l.Instructions)).ToList(),
        Name(rx.Stage),
        rx.QuotedAmount,
        rx.PharmacyName,
        rx.ClaimToken,
        rx.VerificationUrl,
        rx.ReceiptNumber,
        rx.DispensedAt,
        rx.ExternalPharmacyName,
        rx.IssuedAt,
        rx.UpdatedAt ?? rx.CreatedAt);

    public static MedicalCertificateDto ToDto(MedicalCertificate certificate) => new(
        certificate.Id,
        certificate.CertificateNumber,
        certificate.IssuerName,
        certificate.DoctorName,
        certificate.DoctorPrcLicense,
        certificate.Purpose,
        certificate.Diagnosis,
        certificate.Remarks,
        certificate.RestDays,
        certificate.ValidFrom,
        certificate.ValidTo,
        certificate.VerificationUrl,
        certificate.IssuedAt,
        certificate.UpdatedAt ?? certificate.CreatedAt);

    public static NotificationDto ToDto(Notification n) =>
        new(n.Id, n.Type.ToString(), n.Title, n.Body, n.IsRead, n.ReadAt, n.Payload, n.CreatedAt);

    public async Task<LabResultDto> ToDtoAsync(LabResultReport report, CancellationToken cancellationToken)
    {
        var fileUrl = string.IsNullOrEmpty(report.FileStorageKey)
            ? null
            : $"/api/v1/patients/{report.PatientId}/documents/lab-results/{report.Id}/stream";

        return new LabResultDto(
            report.Id,
            report.RequisitionId,
            report.LaboratoryName,
            report.Title,
            Name(report.Source),
            Name(report.Verification),
            report.ReviewedByName,
            report.ReviewedAt,
            report.ReviewRemarks,
            report.Impression,
            report.IsCritical,
            report.ResultedAt,
            fileUrl,
            report.Observations.Select(o => new LabObservationDto(
                o.Panel ?? string.Empty, o.TestName, o.Result ?? string.Empty,
                o.Unit ?? string.Empty, o.ReferenceRange ?? string.Empty, o.Flag ?? string.Empty)).ToList(),
            report.UpdatedAt ?? report.CreatedAt);
    }

    private static string PaymentStatusOf(LabRequestSlip slip) =>
        (!slip.PaymentRequired ? LabPaymentStatus.None : PaidStages.Contains(slip.Stage) ? LabPaymentStatus.Paid : LabPaymentStatus.Pending).ToString();

    private static IReadOnlyList<LabRequestItemDto> ParseItems(string itemsJson)
    {
        try
        {
            return JsonSerializer.Deserialize<List<LabRequestItemDto>>(itemsJson, Json) ?? [];
        }
        catch (JsonException)
        {
            return [];
        }
    }
}