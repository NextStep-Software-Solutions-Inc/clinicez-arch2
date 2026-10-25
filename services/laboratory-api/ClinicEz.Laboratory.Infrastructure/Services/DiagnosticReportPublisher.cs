using System.Text.Json;
using ClinicEz.Laboratory.Application.Common.Interfaces;
using ClinicEz.Laboratory.Application.Interop;
using ClinicEz.Shared.Common;
using ClinicEz.Shared.Documents.Security;
using ClinicEz.Shared.Interop;
using ClinicEz.Shared.Interoperability;
using Microsoft.Extensions.Logging;

namespace ClinicEz.Laboratory.Infrastructure.Services;

public class DiagnosticReportPublisher : IDiagnosticReportPublisher
{
    private readonly IInteropPublisher _publisher;
    private readonly IDocumentSecurityService _securityService;
    private readonly ILogger<DiagnosticReportPublisher> _logger;

    public DiagnosticReportPublisher(
        IInteropPublisher publisher,
        ILogger<DiagnosticReportPublisher> logger,
        IDocumentSecurityService? securityService = null)
    {
        _publisher = publisher;
        _logger = logger;
        _securityService = securityService ?? new DocumentSecurityService();
    }

    public void EnqueueReportFinalized(DiagnosticReportFinalizedEvent reportEvent)
    {
        _logger.LogInformation(
            "[DiagnosticReportPublisher] Queueing {Type} for Accession {AccessionNumber} (Requisition {RequisitionId}, Pathologist {PathologistName}) to the ordering clinic",
            InteropTypes.LabResultFinalized, reportEvent.AccessionNumber, reportEvent.RequisitionId, reportEvent.PathologistName);

        var from = LabInteropParties.Laboratory(reportEvent.LaboratoryTenantId, reportEvent.LaboratoryFacilityId);

        _publisher.Enqueue(
            InteropTypes.LabResultFinalized,
            from,
            LabInteropParties.OrderingClinic(reportEvent.OrderingTenantId, reportEvent.OrderingFacilityId),
            reportEvent.RequisitionId,
            reportEvent);

        EnqueuePatientDocument(reportEvent, from);
        EnqueueDocumentAttestation(reportEvent, from);
    }

    /// <summary>The patient keeps a copy of every result issued to them; an unknown patient has no mailbox, so nothing is sent.</summary>
    private void EnqueuePatientDocument(DiagnosticReportFinalizedEvent reportEvent, Party from)
    {
        if (reportEvent.PatientId is not { } patientId || patientId == Guid.Empty)
        {
            _logger.LogDebug(
                "[DiagnosticReportPublisher] Report {ReportId} has no ClinicEZ patient; no {Type} queued.",
                reportEvent.ReportId, InteropTypes.PatientDocumentIssued);
            return;
        }

        var document = new PatientDocumentIssuedPayload
        {
            DocumentId = reportEvent.ReportId,
            Kind = PatientDocumentKind.LabResult,
            PatientId = patientId,
            IssuerTenantId = reportEvent.LaboratoryTenantId,
            IssuerFacilityId = reportEvent.LaboratoryFacilityId,
            IssuerFacilityType = FacilityType.Laboratory,
            IssuerName = reportEvent.LaboratoryName,
            Title = $"Laboratory result {reportEvent.AccessionNumber}",
            IssuedAtUtc = reportEvent.ReleasedAt,
            Status = "Final",
            Source = ResultSource.ClinicEzLab,
            Verification = VerificationState.Verified,
            Body = JsonSerializer.SerializeToElement(reportEvent, InteropJson.Options)
        };

        _publisher.Enqueue(
            InteropTypes.PatientDocumentIssued,
            from,
            Party.ForPatient(patientId.ToString()),
            reportEvent.RequisitionId,
            document);
    }

    private void EnqueueDocumentAttestation(DiagnosticReportFinalizedEvent reportEvent, Party from)
    {
        var digest = _securityService.ComputeDocumentDigest(
            reportEvent.LaboratoryTenantId,
            "LAB-REPORT",
            reportEvent.AccessionNumber,
            reportEvent.PatientId ?? Guid.Empty,
            reportEvent.PathologistPrcLicense ?? string.Empty,
            reportEvent.ReleasedAt);

        var attestation = new DocumentAttestationPublishedPayload
        {
            SourceDocumentId = reportEvent.ReportId,
            TenantId = reportEvent.LaboratoryTenantId,
            FacilityId = Guid.TryParse(reportEvent.LaboratoryFacilityId, out var fid) ? fid : Guid.Empty,
            DocumentKind = "lab-report",
            DocumentNumber = reportEvent.AccessionNumber,
            SecurityDigest = digest,
            VerificationTokenHash = null,
            ClinicName = reportEvent.LaboratoryName,
            ClinicAddress = null,
            ClinicContact = null,
            DoctorName = reportEvent.PathologistName,
            DoctorPrcLicense = reportEvent.PathologistPrcLicense,
            DoctorPtr = null,
            DoctorS2License = null,
            IssuedAtUtc = reportEvent.ReleasedAt,
            ExpiresAtUtc = null,
            Status = "VALID",
            IsAlreadyDispensed = false,
            DispenseStatus = null,
            DispensedPharmacyName = null,
            DispensedAtUtc = null,
            HasDangerousDrug = false,
            ItemCount = reportEvent.Observations?.Count ?? 0
        };

        _publisher.Enqueue(
            InteropTypes.DocumentAttestationPublished,
            from,
            Party.Portal,
            reportEvent.ReportId,
            attestation);
    }
}
