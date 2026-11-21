using System.Text.Json;
using ClinicEz.Patient.Application.Features.Documents;
using ClinicEz.Patient.Application.Features.Documents.Commands.MarkPrescriptionExternallyDispensed;
using ClinicEz.Patient.Application.Features.Documents.Commands.UploadLabResult;
using ClinicEz.Patient.Application.Features.Sync.Queries.GetSyncChanges;
using ClinicEz.Patient.Application.Tests.Interop;
using ClinicEz.Patient.Domain.Entities;
using ClinicEz.Patient.Domain.Enums;
using ClinicEz.Shared.Exceptions;
using ClinicEz.Shared.Interop;
using ClinicEz.Shared.Interoperability;
using FluentAssertions;
using Microsoft.EntityFrameworkCore;
using Microsoft.Extensions.DependencyInjection;
using NSubstitute;
using NSubstitute.ExceptionExtensions;

namespace ClinicEz.Patient.Application.Tests.Features.Documents;

using Patient = ClinicEz.Patient.Domain.Entities.Patient;

/// <summary>The patient's own document actions (upload a result, report an outside dispense) and the incremental sync that feeds the app inbox.</summary>
public sealed class DocumentCommandsTests
{
    private static readonly string TenantId = PatientInteropHarness.TenantA;

    private static async Task<Guid> SeedPatientAsync(PatientInteropHarness h)
    {
        var patientId = Guid.NewGuid();
        await h.WithDbAsync(async db =>
        {
            db.Patients.Add(new Patient { Id = patientId, ClerkUserId = $"clerk_{patientId:N}", FirstName = "Ana", LastName = "Reyes" });
            await db.SaveChangesAsync();
        });
        return patientId;
    }

    private static async Task<(Guid RequisitionId, Guid ClinicId)> SeedSlipAsync(
        PatientInteropHarness h, Guid patientId, LabSlipStage stage = LabSlipStage.Issued, string? facilityId = null)
    {
        var clinicId = Guid.NewGuid();
        var requisitionId = Guid.NewGuid();
        await h.WithDbAsync(async db =>
        {
            db.LabRequestSlips.Add(new LabRequestSlip
            {
                PatientId = patientId, RequisitionId = requisitionId, OrderingTenantId = TenantId,
                OrderingFacilityId = facilityId ?? clinicId.ToString(), AccessionNumber = "ACC-7", Title = "CBC", Stage = stage, HasDetails = true
            });
            await db.SaveChangesAsync();
        });
        return (requisitionId, clinicId);
    }

    private static async Task<(Guid PrescriptionId, Guid ClinicId)> SeedPrescriptionAsync(
        PatientInteropHarness h, Guid patientId, PrescriptionStage stage = PrescriptionStage.Issued)
    {
        var clinicId = Guid.NewGuid();
        var prescriptionId = Guid.NewGuid();
        await h.WithDbAsync(async db =>
        {
            db.PrescriptionDocuments.Add(new PrescriptionDocument
            {
                PatientId = patientId, PrescriptionId = prescriptionId, PrescriptionNumber = "RX-5", OrderingTenantId = TenantId,
                OrderingFacilityId = clinicId.ToString(), Stage = stage, HasDetails = true
            });
            await db.SaveChangesAsync();
        });
        return (prescriptionId, clinicId);
    }

    private static async Task<T> RunAsync<T>(PatientInteropHarness h, Func<IServiceProvider, Task<T>> action)
    {
        using var scope = h.Provider.CreateScope();
        return await action(scope.ServiceProvider);
    }

    private static Task<LabResultUploadAcceptedDto> UploadAsync(
        PatientInteropHarness h, Guid patientId, Guid requisitionId, string name = "result.pdf", string type = "application/pdf") =>
        RunAsync(h, sp =>
        {
            using var content = new MemoryStream("%PDF-1.4"u8.ToArray());
            return ActivatorUtilities.CreateInstance<UploadLabResultCommandHandler>(sp)
                .Handle(new UploadLabResultCommand(patientId, requisitionId, content, name, type, content.Length, "from home"), default);
        });

    [Fact]
    public async Task Uploading_a_result_stores_the_file_marks_the_slip_and_sends_a_reference_to_the_ordering_clinic()
    {
        using var h = new PatientInteropHarness();
        var patientId = await SeedPatientAsync(h);
        var (requisitionId, clinicId) = await SeedSlipAsync(h, patientId);

        var accepted = await UploadAsync(h, patientId, requisitionId, "../my result.pdf");

        accepted.Verification.Should().Be("Unverified");
        accepted.Source.Should().Be("PatientUploaded");
        var report = await h.WithDbAsync(db => db.LabResultReports.AsNoTracking().SingleAsync());
        report.Source.Should().Be(ResultProvenance.PatientUploaded);
        report.Verification.Should().Be(ResultVerification.Unverified);
        report.FileName.Should().Be("my_result.pdf");
        report.FileStorageKey.Should().StartWith($"patients/{patientId}/lab-results/").And.EndWith(".cez");
        report.EncryptionAlgorithm.Should().Be("AES-256-GCM");
        report.EncryptionIvBase64.Should().NotBeNullOrWhiteSpace();
        (await h.WithDbAsync(db => db.LabRequestSlips.AsNoTracking().SingleAsync())).Stage.Should().Be(LabSlipStage.ExternalSubmitted);

        await h.Relay.RunOnceAsync(default);
        var sent = h.Hub.Sent.Should().ContainSingle(e => e.Type == InteropTypes.LabResultExternalSubmitted).Subject;
        sent.From.Should().Be(PatientInteropHarness.Patient(patientId));
        sent.To.FacilityId.Should().Be(clinicId.ToString());
        sent.To.TenantId.Should().Be(TenantId);
        sent.CorrelationId.Should().Be(requisitionId);
        var payload = sent.GetPayload<ExternalLabResultUploadedEvent>();
        payload.UploaderKind.Should().Be(UploaderKind.Patient);
        payload.UploadId.Should().Be(accepted.ResultId);
        payload.DocumentUrl.Should().StartWith("https://files.example.test/patients/");
        payload.FileBase64.Should().NotBeNullOrWhiteSpace();
        payload.Notes.Should().Be("from home");
    }

    [Fact]
    public async Task Uploading_to_another_patients_slip_is_not_found_and_sends_nothing()
    {
        using var h = new PatientInteropHarness();
        var owner = await SeedPatientAsync(h);
        var stranger = await SeedPatientAsync(h);
        var (requisitionId, _) = await SeedSlipAsync(h, owner);

        var act = () => UploadAsync(h, stranger, requisitionId);

        await act.Should().ThrowAsync<NotFoundException>();
        await h.Relay.RunOnceAsync(default);
        h.Hub.Sent.Should().NotContain(e => e.Type == InteropTypes.LabResultExternalSubmitted);
        (await h.WithDbAsync(db => db.LabResultReports.CountAsync())).Should().Be(0);
    }

    [Theory]
    [InlineData(LabSlipStage.Reviewed)]
    [InlineData(LabSlipStage.Cancelled)]
    public async Task Uploading_to_a_closed_slip_is_a_conflict(LabSlipStage stage)
    {
        using var h = new PatientInteropHarness();
        var patientId = await SeedPatientAsync(h);
        var (requisitionId, _) = await SeedSlipAsync(h, patientId, stage);

        var act = () => UploadAsync(h, patientId, requisitionId);

        await act.Should().ThrowAsync<ConflictException>();
    }

    [Fact]
    public async Task Uploading_when_the_ordering_clinic_is_unknown_is_a_conflict()
    {
        using var h = new PatientInteropHarness();
        var patientId = await SeedPatientAsync(h);
        var (requisitionId, _) = await SeedSlipAsync(h, patientId, facilityId: string.Empty);

        var act = () => UploadAsync(h, patientId, requisitionId);

        await act.Should().ThrowAsync<ConflictException>();
    }

    [Fact]
    public async Task A_failed_save_removes_the_stored_file_again()
    {
        using var h = new PatientInteropHarness();
        var patientId = await SeedPatientAsync(h);
        var (requisitionId, _) = await SeedSlipAsync(h, patientId);
        h.Storage.GeneratePresignedDownloadUrlAsync(Arg.Any<string>(), Arg.Any<TimeSpan>(), Arg.Any<CancellationToken>())
            .ThrowsAsync(new InvalidOperationException("storage down"));

        var act = () => UploadAsync(h, patientId, requisitionId);

        await act.Should().ThrowAsync<InvalidOperationException>();
        await h.Storage.Received(1).DeleteAsync(Arg.Is<string>(k => k.StartsWith($"patients/{patientId}/lab-results/")), Arg.Any<CancellationToken>());
        (await h.WithDbAsync(db => db.LabResultReports.CountAsync())).Should().Be(0);
    }

    [Theory]
    [InlineData(0L, "application/pdf", "pdf is empty")]
    [InlineData(PatientFileLimits.MaxFileBytes + 1, "application/pdf", "pdf is too large")]
    [InlineData(1024L, "application/zip", "zip is not allowed")]
    [InlineData(1024L, "text/html", "html is not allowed")]
    public void The_upload_validator_enforces_size_and_type(long length, string contentType, string because)
    {
        var command = new UploadLabResultCommand(Guid.NewGuid(), Guid.NewGuid(), Stream.Null, "f", contentType, length, null);

        new UploadLabResultCommandValidator().Validate(command).IsValid.Should().BeFalse(because);
    }

    [Theory]
    [InlineData("application/pdf")]
    [InlineData("image/jpeg")]
    [InlineData("image/png")]
    [InlineData("image/heic")]
    public void The_upload_validator_accepts_pdf_and_images_up_to_the_limit(string contentType)
    {
        var command = new UploadLabResultCommand(Guid.NewGuid(), Guid.NewGuid(), Stream.Null, "f", contentType, PatientFileLimits.MaxFileBytes, null);

        new UploadLabResultCommandValidator().Validate(command).IsValid.Should().BeTrue();
    }

    private static Task<ExternalDispenseAcceptedDto> DispenseAsync(
        PatientInteropHarness h, Guid patientId, Guid prescriptionId, string pharmacy = "Watsons", bool withReceipt = false) =>
        RunAsync(h, sp =>
        {
            using var content = new MemoryStream([1, 2, 3]);
            var receipt = withReceipt ? new ReceiptFile(content, "receipt.png", "image/png", content.Length) : null;
            return ActivatorUtilities.CreateInstance<MarkPrescriptionExternallyDispensedCommandHandler>(sp)
                .Handle(new MarkPrescriptionExternallyDispensedCommand(patientId, prescriptionId, pharmacy, "Makati", "Ben", "OR-77", "all items", receipt), default);
        });

    [Fact]
    public async Task Reporting_an_outside_dispense_marks_the_prescription_and_tells_the_ordering_clinic()
    {
        using var h = new PatientInteropHarness();
        var patientId = await SeedPatientAsync(h);
        var (prescriptionId, clinicId) = await SeedPrescriptionAsync(h, patientId);

        var accepted = await DispenseAsync(h, patientId, prescriptionId, "  Watsons  ", withReceipt: true);

        accepted.Stage.Should().Be("ExternalDispensed");
        var rx = await h.WithDbAsync(db => db.PrescriptionDocuments.AsNoTracking().SingleAsync());
        rx.Stage.Should().Be(PrescriptionStage.ExternalDispensed);
        rx.ExternalPharmacyName.Should().Be("Watsons");
        rx.ReceiptNumber.Should().Be("OR-77");

        await h.Relay.RunOnceAsync(default);
        var sent = h.Hub.Sent.Should().ContainSingle(e => e.Type == InteropTypes.RxExternalDispensed).Subject;
        sent.To.FacilityId.Should().Be(clinicId.ToString());
        sent.CorrelationId.Should().Be(prescriptionId);
        var payload = sent.GetPayload<ExternalPrescriptionDispensedEvent>();
        payload.ExternalPharmacyName.Should().Be("Watsons");
        payload.OfficialReceiptNumber.Should().Be("OR-77");
        payload.ReceiptDocumentUrl.Should().StartWith("https://files.example.test/patients/");
    }

    [Fact]
    public async Task Reporting_an_outside_dispense_without_a_receipt_sends_no_receipt_link()
    {
        using var h = new PatientInteropHarness();
        var patientId = await SeedPatientAsync(h);
        var (prescriptionId, _) = await SeedPrescriptionAsync(h, patientId);

        await DispenseAsync(h, patientId, prescriptionId);

        await h.Relay.RunOnceAsync(default);
        h.Hub.Sent.Single(e => e.Type == InteropTypes.RxExternalDispensed).GetPayload<ExternalPrescriptionDispensedEvent>()
            .ReceiptDocumentUrl.Should().BeNull();
    }

    [Theory]
    [InlineData(PrescriptionStage.Dispensed)]
    [InlineData(PrescriptionStage.ExternalDispensed)]
    public async Task A_prescription_that_is_already_filled_cannot_be_reported_again(PrescriptionStage stage)
    {
        using var h = new PatientInteropHarness();
        var patientId = await SeedPatientAsync(h);
        var (prescriptionId, _) = await SeedPrescriptionAsync(h, patientId, stage);

        var act = () => DispenseAsync(h, patientId, prescriptionId);

        await act.Should().ThrowAsync<ConflictException>();
        await h.Relay.RunOnceAsync(default);
        h.Hub.Sent.Should().NotContain(e => e.Type == InteropTypes.RxExternalDispensed);
    }

    [Fact]
    public async Task Another_patient_cannot_report_a_dispense_for_a_prescription_that_is_not_theirs()
    {
        using var h = new PatientInteropHarness();
        var owner = await SeedPatientAsync(h);
        var stranger = await SeedPatientAsync(h);
        var (prescriptionId, _) = await SeedPrescriptionAsync(h, owner);

        var act = () => DispenseAsync(h, stranger, prescriptionId);

        await act.Should().ThrowAsync<NotFoundException>();
    }

    [Fact]
    public void The_dispense_validator_requires_a_pharmacy_name_and_a_valid_receipt()
    {
        var validator = new MarkPrescriptionExternallyDispensedCommandValidator();
        var valid = new MarkPrescriptionExternallyDispensedCommand(Guid.NewGuid(), Guid.NewGuid(), "Watsons", null, null, null, null, null);

        validator.Validate(valid).IsValid.Should().BeTrue();
        validator.Validate(valid with { PharmacyName = " " }).IsValid.Should().BeFalse();
        validator.Validate(valid with { Receipt = new ReceiptFile(Stream.Null, "r.exe", "application/octet-stream", 10) }).IsValid.Should().BeFalse();
        validator.Validate(valid with { Receipt = new ReceiptFile(Stream.Null, "r.png", "image/png", PatientFileLimits.MaxFileBytes + 1) }).IsValid.Should().BeFalse();
    }

    private static Task<SyncChangesDto> ChangesAsync(PatientInteropHarness h, Guid patientId, string? since, int take = 200) =>
        RunAsync(h, sp => ActivatorUtilities.CreateInstance<GetSyncChangesQueryHandler>(sp)
            .Handle(new GetSyncChangesQuery(patientId, since, take), default));

    private static async Task AddSlipAsync(PatientInteropHarness h, Guid patientId, string title)
    {
        await h.WithDbAsync(async db =>
        {
            db.LabRequestSlips.Add(new LabRequestSlip
            {
                PatientId = patientId, RequisitionId = Guid.NewGuid(), OrderingTenantId = TenantId, OrderingFacilityId = Guid.NewGuid().ToString(),
                Title = title, HasDetails = true
            });
            await db.SaveChangesAsync();
        });
        await Task.Delay(20);
    }

    [Fact]
    public async Task The_first_pull_returns_everything_and_a_pull_from_its_cursor_returns_nothing_new()
    {
        using var h = new PatientInteropHarness();
        var patientId = await SeedPatientAsync(h);
        await AddSlipAsync(h, patientId, "first");
        await SeedPrescriptionAsync(h, patientId);

        var first = await ChangesAsync(h, patientId, null);
        var again = await ChangesAsync(h, patientId, first.Cursor);

        first.HasMore.Should().BeFalse();
        first.LabRequests.Should().ContainSingle();
        first.Prescriptions.Should().ContainSingle();
        again.LabRequests.Should().BeEmpty();
        again.Prescriptions.Should().BeEmpty();
        again.Cursor.Should().Be(first.Cursor);
    }

    [Fact]
    public async Task A_row_that_changes_after_the_cursor_is_returned_again()
    {
        using var h = new PatientInteropHarness();
        var patientId = await SeedPatientAsync(h);
        var (requisitionId, _) = await SeedSlipAsync(h, patientId);
        var first = await ChangesAsync(h, patientId, null);
        await Task.Delay(20);

        await h.WithDbAsync(async db =>
        {
            (await db.LabRequestSlips.SingleAsync()).Stage = LabSlipStage.Paid;
            await db.SaveChangesAsync();
        });
        var next = await ChangesAsync(h, patientId, first.Cursor);

        next.LabRequests.Should().ContainSingle().Which.RequisitionId.Should().Be(requisitionId);
        next.LabRequests[0].Stage.Should().Be("Paid");
    }

    [Fact]
    public async Task Paging_walks_through_every_row_exactly_once()
    {
        using var h = new PatientInteropHarness();
        var patientId = await SeedPatientAsync(h);
        foreach (var title in new[] { "a", "b", "c", "d", "e" })
            await AddSlipAsync(h, patientId, title);

        var seen = new List<string>();
        string? cursor = null;
        var pages = 0;
        bool hasMore;
        do
        {
            var page = await ChangesAsync(h, patientId, cursor, take: 2);
            seen.AddRange(page.LabRequests.Select(l => l.Title));
            cursor = page.Cursor;
            hasMore = page.HasMore;
            pages++;
        }
        while (hasMore && pages < 10);

        seen.Should().BeEquivalentTo(["a", "b", "c", "d", "e"]).And.OnlyHaveUniqueItems();
        pages.Should().Be(3);
    }

    [Fact]
    public async Task Changes_never_include_another_patients_documents()
    {
        using var h = new PatientInteropHarness();
        var patientId = await SeedPatientAsync(h);
        var other = await SeedPatientAsync(h);
        await AddSlipAsync(h, other, "not mine");

        (await ChangesAsync(h, patientId, null)).LabRequests.Should().BeEmpty();
    }

    [Theory]
    [InlineData("abc")]
    [InlineData("-5")]
    [InlineData("99999999999999999999999999")]
    public async Task A_malformed_cursor_is_a_bad_request(string cursor)
    {
        using var h = new PatientInteropHarness();
        var patientId = await SeedPatientAsync(h);

        var act = () => ChangesAsync(h, patientId, cursor);

        await act.Should().ThrowAsync<BadRequestException>();
    }

    [Fact]
    public async Task The_changes_payload_serialises_with_the_documented_property_names()
    {
        using var h = new PatientInteropHarness();
        var patientId = await SeedPatientAsync(h);
        await AddSlipAsync(h, patientId, "x");

        var json = JsonSerializer.SerializeToElement(await ChangesAsync(h, patientId, null), new JsonSerializerOptions(JsonSerializerDefaults.Web));

        json.EnumerateObject().Select(p => p.Name).Should().Contain(
            ["cursor", "hasMore", "labRequests", "prescriptions", "labResults", "medicalCertificates", "grants", "notifications"]);
    }
}
