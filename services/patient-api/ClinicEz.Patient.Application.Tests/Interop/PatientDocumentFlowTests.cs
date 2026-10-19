using System.Text.Json;
using ClinicEz.Patient.Domain.Entities;
using ClinicEz.Patient.Domain.Enums;
using ClinicEz.Shared.Common;
using ClinicEz.Shared.Interop;
using ClinicEz.Shared.Interoperability;
using FluentAssertions;
using Microsoft.EntityFrameworkCore;

namespace ClinicEz.Patient.Application.Tests.Interop;

using Patient = ClinicEz.Patient.Domain.Entities.Patient;

/// <summary>Everything facilities send to a patient: issued documents, status mirrors and doctor verdicts.</summary>
public sealed class PatientDocumentFlowTests
{
    private static readonly string TenantId = PatientInteropHarness.TenantA;

    private static async Task<Guid> SeedPatientAsync(PatientInteropHarness h)
    {
        var patientId = Guid.NewGuid();
        await h.WithDbAsync(async db =>
        {
            db.Patients.Add(new Patient { Id = patientId, ClerkUserId = "clerk_docs", FirstName = "Ana", LastName = "Reyes" });
            await db.SaveChangesAsync();
        });
        return patientId;
    }

    private static Party Clinic(Guid id) => Party.ForFacility(TenantId, id.ToString(), FacilityType.Clinic);

    private static Party Lab(Guid id) => Party.ForFacility(TenantId, id.ToString(), FacilityType.Laboratory);

    private static Party Pharmacy(Guid id) => Party.ForFacility(TenantId, id.ToString(), FacilityType.Pharmacy);

    private static InteropEnvelope Send<T>(string type, Party from, Guid patientId, Guid correlationId, T payload) where T : class =>
        InteropEnvelope.Create(type, from, PatientInteropHarness.Patient(patientId), correlationId, payload);

    private static JsonElement Body<T>(T body) => JsonSerializer.SerializeToElement(body, InteropJson.Options);

    private static PatientDocumentIssuedPayload Issued(
        PatientDocumentKind kind, Guid documentId, Guid patientId, Guid issuerId, JsonElement body, FacilityType type = FacilityType.Clinic) =>
        new()
        {
            DocumentId = documentId, Kind = kind, PatientId = patientId, IssuerTenantId = TenantId,
            IssuerFacilityId = issuerId.ToString(), IssuerFacilityType = type, IssuerName = "Issuer", Title = "Title", Body = body
        };

    private static LabRequisitionIssuedEvent Requisition(Guid requisitionId, Guid clinicId) => new()
    {
        RequisitionId = requisitionId, AccessionNumber = "ACC-1", TenantId = TenantId, OrderingFacilityId = clinicId.ToString(),
        OrderingFacilityName = "Sunrise Clinic",
        Items = [new RequisitionItemDto { ItemCode = "CBC", ItemName = "Complete blood count" }]
    };

    private static PrescriptionIssuedEvent PrescriptionBody(Guid prescriptionId, Guid clinicId) => new()
    {
        PrescriptionId = prescriptionId, PrescriptionNumber = "RX-1", TenantId = TenantId, OrderingFacilityId = clinicId.ToString(),
        OrderingFacilityName = "Sunrise Clinic",
        PrescriberDoctor = new PrescriberDoctorDto { DoctorName = "Dr. Cruz", PrcLicenseNumber = "0123456" },
        Items = [new PrescriptionItemDto { GenericName = "Amoxicillin", Dosage = "500 mg", Sig = "3x a day", Quantity = 21 }]
    };

    private static async Task<InteropEnvelope> DeliverAsync<T>(PatientInteropHarness h, string type, Party from, Guid patientId, Guid correlationId, T payload)
        where T : class
    {
        var envelope = Send(type, from, patientId, correlationId, payload);
        await h.DeliverAsync(envelope);
        return envelope;
    }

    [Fact]
    public async Task A_lab_request_is_stored_once_even_when_issued_twice_and_notifies_once()
    {
        using var h = new PatientInteropHarness();
        var patientId = await SeedPatientAsync(h);
        var clinicId = Guid.NewGuid();
        var requisitionId = Guid.NewGuid();
        var payload = Issued(PatientDocumentKind.LabRequest, requisitionId, patientId, clinicId, Body(Requisition(requisitionId, clinicId))) with
        {
            ClaimToken = "claim-1"
        };

        await DeliverAsync(h, InteropTypes.PatientDocumentIssued, Clinic(clinicId), patientId, requisitionId, payload);
        await DeliverAsync(h, InteropTypes.PatientDocumentIssued, Clinic(clinicId), patientId, requisitionId, payload);

        var slip = await h.WithDbAsync(db => db.LabRequestSlips.AsNoTracking().SingleAsync());
        slip.RequisitionId.Should().Be(requisitionId);
        slip.PatientId.Should().Be(patientId);
        slip.HasDetails.Should().BeTrue();
        slip.ClaimToken.Should().Be("claim-1");
        slip.OrderingFacilityName.Should().Be("Sunrise Clinic");
        slip.ItemsJson.Should().Contain("CBC");
        (await h.WithDbAsync(db => db.Notifications.CountAsync())).Should().Be(1);
    }

    [Fact]
    public async Task A_prescription_is_stored_with_its_lines_and_reissue_replaces_them_without_duplicates()
    {
        using var h = new PatientInteropHarness();
        var patientId = await SeedPatientAsync(h);
        var clinicId = Guid.NewGuid();
        var prescriptionId = Guid.NewGuid();
        var payload = Issued(PatientDocumentKind.Prescription, prescriptionId, patientId, clinicId, Body(PrescriptionBody(prescriptionId, clinicId)));

        await DeliverAsync(h, InteropTypes.PatientDocumentIssued, Clinic(clinicId), patientId, prescriptionId, payload);
        await DeliverAsync(h, InteropTypes.PatientDocumentIssued, Clinic(clinicId), patientId, prescriptionId, payload);

        var rx = await h.WithDbAsync(db => db.PrescriptionDocuments.AsNoTracking().Include(p => p.Lines).SingleAsync());
        rx.PrescriberName.Should().Be("Dr. Cruz");
        rx.Lines.Should().ContainSingle().Which.GenericName.Should().Be("Amoxicillin");
        (await h.WithDbAsync(db => db.Notifications.CountAsync())).Should().Be(1);
    }

    [Fact]
    public async Task A_clinic_ez_lab_result_arrives_verified_with_its_observations_and_signed_pdf_in_storage()
    {
        using var h = new PatientInteropHarness();
        var patientId = await SeedPatientAsync(h);
        var labId = Guid.NewGuid();
        var reportId = Guid.NewGuid();
        var report = new DiagnosticReportFinalizedEvent
        {
            ReportId = reportId, RequisitionId = Guid.NewGuid(), LaboratoryTenantId = TenantId, LaboratoryFacilityId = labId.ToString(),
            LaboratoryName = "Metro Lab", PatientId = patientId,
            Observations = [new AnalyteObservationDto { AnalyteName = "Hemoglobin", Value = "13.5", Unit = "g/dL", ReferenceInterval = "12-16" }],
            SignedPdfBase64 = Convert.ToBase64String("%PDF-1.4"u8.ToArray())
        };
        var payload = Issued(PatientDocumentKind.LabResult, reportId, patientId, labId, Body(report), FacilityType.Laboratory);

        await DeliverAsync(h, InteropTypes.PatientDocumentIssued, Lab(labId), patientId, reportId, payload);

        var stored = await h.WithDbAsync(db => db.LabResultReports.AsNoTracking().Include(r => r.Observations).SingleAsync());
        stored.Source.Should().Be(ResultProvenance.ClinicEzLab);
        stored.Verification.Should().Be(ResultVerification.Verified);
        stored.FileStorageKey.Should().Be($"patients/{patientId}/lab-results/{reportId}/report.pdf");
        stored.Observations.Should().ContainSingle().Which.TestName.Should().Be("Hemoglobin");
    }

    [Fact]
    public async Task An_external_lab_result_stays_unverified()
    {
        using var h = new PatientInteropHarness();
        var patientId = await SeedPatientAsync(h);
        var labId = Guid.NewGuid();
        var reportId = Guid.NewGuid();
        var report = new DiagnosticReportFinalizedEvent
        {
            ReportId = reportId, LaboratoryTenantId = TenantId, LaboratoryFacilityId = labId.ToString(), LaboratoryName = "Outside Lab", PatientId = patientId
        };
        var payload = Issued(PatientDocumentKind.LabResult, reportId, patientId, labId, Body(report), FacilityType.Laboratory) with
        {
            Source = ResultSource.ExternalLab
        };

        await DeliverAsync(h, InteropTypes.PatientDocumentIssued, Lab(labId), patientId, reportId, payload);

        var stored = await h.WithDbAsync(db => db.LabResultReports.AsNoTracking().SingleAsync());
        stored.Source.Should().Be(ResultProvenance.ExternalLab);
        stored.Verification.Should().Be(ResultVerification.Unverified);
    }

    [Fact]
    public async Task A_medical_certificate_is_stored_with_its_verification_link()
    {
        using var h = new PatientInteropHarness();
        var patientId = await SeedPatientAsync(h);
        var clinicId = Guid.NewGuid();
        var certificateId = Guid.NewGuid();
        var certificate = new MedicalCertificateIssuedPayload
        {
            CertificateId = certificateId, CertificateNumber = "MC-1", PatientId = patientId, IssuerTenantId = TenantId,
            IssuerFacilityId = clinicId.ToString(), IssuerName = "Sunrise Clinic", DoctorName = "Dr. Cruz", Purpose = "Work",
            VerificationUrl = "https://verify.example.test/mc-1"
        };

        await DeliverAsync(h, InteropTypes.PatientDocumentIssued, Clinic(clinicId), patientId, certificateId,
            Issued(PatientDocumentKind.MedicalCertificate, certificateId, patientId, clinicId, Body(certificate)));

        var stored = await h.WithDbAsync(db => db.MedicalCertificates.AsNoTracking().SingleAsync());
        stored.CertificateNumber.Should().Be("MC-1");
        stored.VerificationUrl.Should().Be("https://verify.example.test/mc-1");
    }

    [Fact]
    public async Task A_dispense_receipt_marks_the_prescription_dispensed()
    {
        using var h = new PatientInteropHarness();
        var patientId = await SeedPatientAsync(h);
        var pharmacyId = Guid.NewGuid();
        var prescriptionId = Guid.NewGuid();
        var receipt = new PrescriptionDispensedEvent
        {
            PrescriptionId = prescriptionId, PharmacyTenantId = TenantId, PharmacyFacilityId = pharmacyId.ToString(),
            PharmacyFacilityName = "Mercury Pharmacy", PatientId = patientId, ReceiptNumber = "OR-9"
        };

        await DeliverAsync(h, InteropTypes.PatientDocumentIssued, Pharmacy(pharmacyId), patientId, prescriptionId,
            Issued(PatientDocumentKind.DispenseReceipt, prescriptionId, patientId, pharmacyId, Body(receipt), FacilityType.Pharmacy));

        var rx = await h.WithDbAsync(db => db.PrescriptionDocuments.AsNoTracking().SingleAsync());
        rx.Stage.Should().Be(PrescriptionStage.Dispensed);
        rx.ReceiptNumber.Should().Be("OR-9");
        rx.PharmacyName.Should().Be("Mercury Pharmacy");
        rx.HasDetails.Should().BeFalse();
    }

    [Fact]
    public async Task A_document_from_a_facility_other_than_the_named_issuer_is_ignored()
    {
        using var h = new PatientInteropHarness();
        var patientId = await SeedPatientAsync(h);
        var clinicId = Guid.NewGuid();
        var requisitionId = Guid.NewGuid();
        var payload = Issued(PatientDocumentKind.LabRequest, requisitionId, patientId, clinicId, Body(Requisition(requisitionId, clinicId)));

        await DeliverAsync(h, InteropTypes.PatientDocumentIssued, Clinic(Guid.NewGuid()), patientId, requisitionId, payload);

        (await h.WithDbAsync(db => db.LabRequestSlips.CountAsync())).Should().Be(0);
    }

    [Fact]
    public async Task A_document_addressed_to_another_patient_than_its_payload_is_ignored()
    {
        using var h = new PatientInteropHarness();
        var patientId = await SeedPatientAsync(h);
        var otherPatientId = await SeedPatientAsync(h);
        var clinicId = Guid.NewGuid();
        var requisitionId = Guid.NewGuid();
        var payload = Issued(PatientDocumentKind.LabRequest, requisitionId, patientId, clinicId, Body(Requisition(requisitionId, clinicId)));

        await DeliverAsync(h, InteropTypes.PatientDocumentIssued, Clinic(clinicId), otherPatientId, requisitionId, payload);

        (await h.WithDbAsync(db => db.LabRequestSlips.CountAsync())).Should().Be(0);
    }

    [Fact]
    public async Task A_body_that_contradicts_the_envelope_is_ignored()
    {
        using var h = new PatientInteropHarness();
        var patientId = await SeedPatientAsync(h);
        var clinicId = Guid.NewGuid();
        var requisitionId = Guid.NewGuid();
        var mismatched = Requisition(Guid.NewGuid(), clinicId);

        await DeliverAsync(h, InteropTypes.PatientDocumentIssued, Clinic(clinicId), patientId, requisitionId,
            Issued(PatientDocumentKind.LabRequest, requisitionId, patientId, clinicId, Body(mismatched)));

        (await h.WithDbAsync(db => db.LabRequestSlips.CountAsync())).Should().Be(0);
    }

    [Fact]
    public async Task A_document_for_an_unknown_patient_is_ignored()
    {
        using var h = new PatientInteropHarness();
        var patientId = Guid.NewGuid();
        var clinicId = Guid.NewGuid();
        var requisitionId = Guid.NewGuid();

        await DeliverAsync(h, InteropTypes.PatientDocumentIssued, Clinic(clinicId), patientId, requisitionId,
            Issued(PatientDocumentKind.LabRequest, requisitionId, patientId, clinicId, Body(Requisition(requisitionId, clinicId))));

        (await h.WithDbAsync(db => db.LabRequestSlips.CountAsync())).Should().Be(0);
    }

    private static LabOrderStatusChangedPayload LabStatus(
        Guid requisitionId, Guid patientId, Guid labId, Guid clinicId, LabOrderStage stage, DateTime changedAt) => new()
    {
        RequisitionId = requisitionId, PatientId = patientId, OrderingTenantId = TenantId, OrderingFacilityId = clinicId.ToString(),
        LaboratoryTenantId = TenantId, LaboratoryFacilityId = labId.ToString(), LaboratoryName = "Metro Lab", Stage = stage,
        QuotedAmount = 450m, Currency = "PHP", PaymentRequired = true, ChangedAtUtc = changedAt
    };

    [Fact]
    public async Task A_lab_status_arriving_before_the_document_creates_a_stub_the_document_then_completes()
    {
        using var h = new PatientInteropHarness();
        var patientId = await SeedPatientAsync(h);
        var labId = Guid.NewGuid();
        var clinicId = Guid.NewGuid();
        var requisitionId = Guid.NewGuid();
        var changedAt = DateTime.UtcNow;

        await DeliverAsync(h, InteropTypes.LabOrderStatusChanged, Lab(labId), patientId, requisitionId,
            LabStatus(requisitionId, patientId, labId, clinicId, LabOrderStage.AwaitingPayment, changedAt));

        var stub = await h.WithDbAsync(db => db.LabRequestSlips.AsNoTracking().SingleAsync());
        stub.HasDetails.Should().BeFalse();
        stub.Stage.Should().Be(LabSlipStage.AwaitingPayment);
        stub.QuotedAmount.Should().Be(450m);

        await DeliverAsync(h, InteropTypes.PatientDocumentIssued, Clinic(clinicId), patientId, requisitionId,
            Issued(PatientDocumentKind.LabRequest, requisitionId, patientId, clinicId, Body(Requisition(requisitionId, clinicId))));

        var completed = await h.WithDbAsync(db => db.LabRequestSlips.AsNoTracking().SingleAsync());
        completed.HasDetails.Should().BeTrue();
        completed.Stage.Should().Be(LabSlipStage.AwaitingPayment);
        completed.OrderingFacilityName.Should().Be("Sunrise Clinic");
    }

    [Fact]
    public async Task An_older_lab_status_never_overwrites_a_newer_one()
    {
        using var h = new PatientInteropHarness();
        var patientId = await SeedPatientAsync(h);
        var labId = Guid.NewGuid();
        var clinicId = Guid.NewGuid();
        var requisitionId = Guid.NewGuid();
        var now = DateTime.UtcNow;

        await DeliverAsync(h, InteropTypes.LabOrderStatusChanged, Lab(labId), patientId, requisitionId,
            LabStatus(requisitionId, patientId, labId, clinicId, LabOrderStage.Paid, now));
        await DeliverAsync(h, InteropTypes.LabOrderStatusChanged, Lab(labId), patientId, requisitionId,
            LabStatus(requisitionId, patientId, labId, clinicId, LabOrderStage.AwaitingPayment, now.AddMinutes(-5)));

        (await h.WithDbAsync(db => db.LabRequestSlips.AsNoTracking().SingleAsync())).Stage.Should().Be(LabSlipStage.Paid);
    }

    [Fact]
    public async Task A_lab_status_from_a_facility_that_is_not_the_named_laboratory_is_ignored()
    {
        using var h = new PatientInteropHarness();
        var patientId = await SeedPatientAsync(h);
        var requisitionId = Guid.NewGuid();

        await DeliverAsync(h, InteropTypes.LabOrderStatusChanged, Lab(Guid.NewGuid()), patientId, requisitionId,
            LabStatus(requisitionId, patientId, Guid.NewGuid(), Guid.NewGuid(), LabOrderStage.Paid, DateTime.UtcNow));

        (await h.WithDbAsync(db => db.LabRequestSlips.CountAsync())).Should().Be(0);
    }

    [Fact]
    public async Task Finalizing_a_lab_order_notifies_the_patient_only_when_the_stage_changes()
    {
        using var h = new PatientInteropHarness();
        var patientId = await SeedPatientAsync(h);
        var labId = Guid.NewGuid();
        var requisitionId = Guid.NewGuid();
        var now = DateTime.UtcNow;

        await DeliverAsync(h, InteropTypes.LabOrderStatusChanged, Lab(labId), patientId, requisitionId,
            LabStatus(requisitionId, patientId, labId, Guid.NewGuid(), LabOrderStage.ResultFinalized, now));
        await DeliverAsync(h, InteropTypes.LabOrderStatusChanged, Lab(labId), patientId, requisitionId,
            LabStatus(requisitionId, patientId, labId, Guid.NewGuid(), LabOrderStage.ResultFinalized, now.AddSeconds(1)));

        (await h.WithDbAsync(db => db.Notifications.CountAsync())).Should().Be(1);
    }

    [Fact]
    public async Task A_pharmacy_status_updates_the_prescription_and_ignores_other_senders()
    {
        using var h = new PatientInteropHarness();
        var patientId = await SeedPatientAsync(h);
        var pharmacyId = Guid.NewGuid();
        var prescriptionId = Guid.NewGuid();
        var status = new RxStatusChangedPayload
        {
            PrescriptionId = prescriptionId, PatientId = patientId, PharmacyTenantId = TenantId, PharmacyFacilityId = pharmacyId.ToString(),
            PharmacyName = "Mercury Pharmacy", Stage = RxStage.Accepted, QuotedAmount = 120m, ChangedAtUtc = DateTime.UtcNow
        };

        await DeliverAsync(h, InteropTypes.RxStatusChanged, Pharmacy(Guid.NewGuid()), patientId, prescriptionId, status);
        (await h.WithDbAsync(db => db.PrescriptionDocuments.CountAsync())).Should().Be(0);

        await DeliverAsync(h, InteropTypes.RxStatusChanged, Pharmacy(pharmacyId), patientId, prescriptionId, status);

        var rx = await h.WithDbAsync(db => db.PrescriptionDocuments.AsNoTracking().SingleAsync());
        rx.Stage.Should().Be(PrescriptionStage.Accepted);
        rx.PharmacyName.Should().Be("Mercury Pharmacy");
        rx.QuotedAmount.Should().Be(120m);
    }

    private static async Task<Guid> SeedExternalResultAsync(PatientInteropHarness h, Guid patientId, Guid clinicId)
    {
        var requisitionId = Guid.NewGuid();
        var reportId = Guid.NewGuid();
        await h.WithDbAsync(async db =>
        {
            db.LabRequestSlips.Add(new LabRequestSlip
            {
                PatientId = patientId, RequisitionId = requisitionId, OrderingTenantId = TenantId, OrderingFacilityId = clinicId.ToString(),
                Stage = LabSlipStage.ExternalSubmitted, StageChangedAt = DateTime.UtcNow.AddHours(-1), HasDetails = true
            });
            db.LabResultReports.Add(new LabResultReport
            {
                PatientId = patientId, ReportId = reportId, RequisitionId = requisitionId, Source = ResultProvenance.PatientUploaded,
                Verification = ResultVerification.Unverified
            });
            await db.SaveChangesAsync();
        });
        return requisitionId;
    }

    [Fact]
    public async Task The_ordering_clinics_verdict_verifies_the_report_and_the_slip_and_notifies()
    {
        using var h = new PatientInteropHarness();
        var patientId = await SeedPatientAsync(h);
        var clinicId = Guid.NewGuid();
        var requisitionId = await SeedExternalResultAsync(h, patientId, clinicId);
        var verdict = new LabResultReviewedPayload
        {
            RequisitionId = requisitionId, PatientId = patientId, State = VerificationState.Verified, ReviewedByName = "Dr. Cruz",
            Remarks = "Looks fine", ReviewedAtUtc = DateTime.UtcNow
        };

        await DeliverAsync(h, InteropTypes.LabResultReviewed, Clinic(clinicId), patientId, requisitionId, verdict);

        var report = await h.WithDbAsync(db => db.LabResultReports.AsNoTracking().SingleAsync());
        report.Verification.Should().Be(ResultVerification.Verified);
        report.ReviewedByName.Should().Be("Dr. Cruz");
        report.ReviewRemarks.Should().Be("Looks fine");
        (await h.WithDbAsync(db => db.LabRequestSlips.AsNoTracking().SingleAsync())).Stage.Should().Be(LabSlipStage.Reviewed);
        (await h.WithDbAsync(db => db.Notifications.CountAsync())).Should().Be(1);
    }

    [Fact]
    public async Task A_rejection_keeps_the_remarks_on_the_slip()
    {
        using var h = new PatientInteropHarness();
        var patientId = await SeedPatientAsync(h);
        var clinicId = Guid.NewGuid();
        var requisitionId = await SeedExternalResultAsync(h, patientId, clinicId);
        var verdict = new LabResultReviewedPayload
        {
            RequisitionId = requisitionId, PatientId = patientId, State = VerificationState.Rejected, ReviewedByName = "Dr. Cruz",
            Remarks = "Photo unreadable", ReviewedAtUtc = DateTime.UtcNow
        };

        await DeliverAsync(h, InteropTypes.LabResultReviewed, Clinic(clinicId), patientId, requisitionId, verdict);

        (await h.WithDbAsync(db => db.LabResultReports.AsNoTracking().SingleAsync())).Verification.Should().Be(ResultVerification.Rejected);
        var slip = await h.WithDbAsync(db => db.LabRequestSlips.AsNoTracking().SingleAsync());
        slip.Stage.Should().Be(LabSlipStage.Rejected);
        slip.Reason.Should().Be("Photo unreadable");
    }

    [Fact]
    public async Task A_verdict_from_a_facility_that_did_not_order_the_tests_is_ignored()
    {
        using var h = new PatientInteropHarness();
        var patientId = await SeedPatientAsync(h);
        var requisitionId = await SeedExternalResultAsync(h, patientId, Guid.NewGuid());
        var verdict = new LabResultReviewedPayload
        {
            RequisitionId = requisitionId, PatientId = patientId, State = VerificationState.Verified, ReviewedByName = "Dr. Imposter"
        };

        await DeliverAsync(h, InteropTypes.LabResultReviewed, Clinic(Guid.NewGuid()), patientId, requisitionId, verdict);

        (await h.WithDbAsync(db => db.LabResultReports.AsNoTracking().SingleAsync())).Verification.Should().Be(ResultVerification.Unverified);
        (await h.WithDbAsync(db => db.Notifications.CountAsync())).Should().Be(0);
    }
}
