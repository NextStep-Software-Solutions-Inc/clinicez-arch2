using System;
using System.Linq;
using System.Threading;
using System.Threading.Tasks;
using ClinicEz.Clinic.Application.Common;
using ClinicEz.Clinic.Application.Common.Interfaces;
using ClinicEz.Clinic.Domain.Entities;
using ClinicEz.Clinic.Domain.Enums;
using ClinicEz.Clinic.Infrastructure.Messaging;
using ClinicEz.Clinic.Infrastructure.Persistence;
using ClinicEz.Clinic.Infrastructure.Services;
using ClinicEz.Shared.Exceptions;
using ClinicEz.Shared.Interop;
using ClinicEz.Shared.Interoperability;
using FluentAssertions;
using Microsoft.EntityFrameworkCore;
using Microsoft.Extensions.Logging.Abstractions;
using Xunit;

namespace ClinicEz.Clinic.Application.Tests;

public class UploadGrantServiceTests
{
    private const string Tenant = "tenant-a";
    private readonly Guid _clinicId = Guid.NewGuid();
    private readonly ApplicationDbContext _db = MessagingTestKit.CreateDbContext();

    private ClinicLabOrder SeedOrder(Guid? clinicId = null, string number = "LAB-1")
    {
        var order = Phase3TestKit.NewLabOrder(clinicId ?? _clinicId, Tenant, Guid.NewGuid(), number);
        _db.LabOrders.Add(order);
        _db.SaveChanges();
        return order;
    }

    [Fact]
    public async Task Minted_Token_Is_Stored_Only_As_A_Hash_And_Carries_The_Clinic()
    {
        var order = SeedOrder();
        var grants = Phase3TestKit.Grants(_db);

        var minted = await grants.MintAsync(order, UploaderKind.ExternalLab, CancellationToken.None);
        await _db.SaveChangesAsync();

        minted.Url.Should().Be($"{Phase3TestKit.UploadBaseUrl}/{minted.Token}");
        minted.Token.Should().StartWith($"{_clinicId:N}.");
        var stored = await _db.UploadGrants.IgnoreQueryFilters().SingleAsync();
        stored.TokenHash.Should().Equal(UploadGrantService.Hash(minted.Token));
        System.Text.Encoding.UTF8.GetString(stored.TokenHash).Should().NotContain(minted.Token);
        stored.MaxUploads.Should().Be(3);
        stored.ExpiresAt.Should().BeCloseTo(DateTime.UtcNow.AddDays(30), TimeSpan.FromMinutes(1));
    }

    [Fact]
    public async Task Minting_Again_Revokes_The_Previous_Unused_Link_Of_The_Same_Kind()
    {
        var order = SeedOrder();
        var grants = Phase3TestKit.Grants(_db);

        var first = await grants.MintAsync(order, UploaderKind.ExternalLab, CancellationToken.None);
        await _db.SaveChangesAsync();
        var patientLink = await grants.MintAsync(order, UploaderKind.Patient, CancellationToken.None);
        var second = await grants.MintAsync(order, UploaderKind.ExternalLab, CancellationToken.None);
        await _db.SaveChangesAsync();

        (await grants.ResolveAsync(first.Token, CancellationToken.None)).Should().BeNull();
        (await grants.ResolveAsync(second.Token, CancellationToken.None)).Should().NotBeNull();
        (await grants.ResolveAsync(patientLink.Token, CancellationToken.None)).Should().NotBeNull();
    }

    [Fact]
    public async Task Minting_Fails_Fast_Without_An_Absolute_Public_Base_Url()
    {
        var order = SeedOrder();

        foreach (var url in new[] { null, "", "   ", "/relative/upload", "ftp://example.test/up" })
        {
            var grants = Phase3TestKit.Grants(_db, Phase3TestKit.UploadOptions(o => o.PublicUploadBaseUrl = url));
            var act = () => grants.MintAsync(order, UploaderKind.ExternalLab, CancellationToken.None);
            await act.Should().ThrowAsync<InvalidOperationException>().WithMessage("*PublicUploadBaseUrl*");
        }
    }

    [Fact]
    public async Task Resolve_Rejects_Malformed_Unknown_And_Cross_Clinic_Tokens()
    {
        var order = SeedOrder();
        var grants = Phase3TestKit.Grants(_db);
        var minted = await grants.MintAsync(order, UploaderKind.ExternalLab, CancellationToken.None);
        await _db.SaveChangesAsync();

        (await grants.ResolveAsync("", CancellationToken.None)).Should().BeNull();
        (await grants.ResolveAsync("not-a-token", CancellationToken.None)).Should().BeNull();
        (await grants.ResolveAsync($"{_clinicId:N}.AAAAAAAAAAAAAAAAAAAAAAAA", CancellationToken.None)).Should().BeNull();

        var secret = minted.Token[(minted.Token.IndexOf('.') + 1)..];
        var forged = $"{Guid.NewGuid():N}.{secret}";
        (await grants.ResolveAsync(forged, CancellationToken.None)).Should().BeNull("the clinic prefix is part of the hashed token");
    }

    [Fact]
    public async Task A_Grant_Is_Not_Usable_Once_Expired_Revoked_Or_Exhausted()
    {
        var order = SeedOrder();
        var grants = Phase3TestKit.Grants(_db);
        var minted = await grants.MintAsync(order, UploaderKind.ExternalLab, CancellationToken.None);
        await _db.SaveChangesAsync();
        var context = (await grants.ResolveAsync(minted.Token, CancellationToken.None))!;
        var now = DateTime.UtcNow;

        context.IsUsable(now).Should().BeTrue();
        context.IsUsable(now.AddDays(31)).Should().BeFalse("expired");

        context.Grant.Used = context.Grant.MaxUploads;
        context.IsUsable(now).Should().BeFalse("exhausted");

        context.Grant.Used = 0;
        context.Grant.RevokedAt = now;
        context.IsUsable(now).Should().BeFalse("revoked");
    }

    [Theory]
    [InlineData("https://x.test/up/", "https://x.test/up")]
    [InlineData("  http://x.test/up  ", "http://x.test/up")]
    public async Task The_Base_Url_Is_Trimmed(string configured, string expected)
    {
        var order = SeedOrder();
        var grants = Phase3TestKit.Grants(_db, Phase3TestKit.UploadOptions(o => o.PublicUploadBaseUrl = configured));

        var minted = await grants.MintAsync(order, UploaderKind.Patient, CancellationToken.None);

        minted.Url.Should().StartWith($"{expected}/");
    }

    [Fact]
    public async Task Order_Numbers_Shared_By_Two_Clinics_Never_Cross_Over()
    {
        var otherClinic = Guid.NewGuid();
        var mine = SeedOrder(_clinicId, "LAB-SAME");
        var theirs = SeedOrder(otherClinic, "LAB-SAME");
        var grants = Phase3TestKit.Grants(_db);

        var theirToken = await grants.MintAsync(theirs, UploaderKind.ExternalLab, CancellationToken.None);
        await _db.SaveChangesAsync();

        var resolved = await grants.ResolveAsync(theirToken.Token, CancellationToken.None);
        resolved!.Order.Id.Should().Be(theirs.Id);
        resolved.Order.Id.Should().NotBe(mine.Id);
        resolved.Grant.ClinicId.Should().Be(otherClinic);
    }
}

public class LabResultIntakeTests
{
    private const string Tenant = "tenant-a";
    private static readonly byte[] Pdf = System.Text.Encoding.ASCII.GetBytes("%PDF-1.4 test");
    private readonly Guid _clinicId = Guid.NewGuid();
    private readonly ApplicationDbContext _db = MessagingTestKit.CreateDbContext();
    private readonly Phase3TestKit.InMemoryFileStore _files = new();

    private async Task<(ClinicLabOrder Order, UploadGrant Grant)> SeedAsync(Action<ClinicUploadOptions>? configure = null)
    {
        MessagingTestKit.SeedClinic(_db, _clinicId, Tenant);
        var patient = Phase3TestKit.NewPatient(_clinicId, Tenant, Guid.NewGuid());
        _db.Patients.Add(patient);
        var order = Phase3TestKit.NewLabOrder(_clinicId, Tenant, patient.Id);
        _db.LabOrders.Add(order);
        var minted = await Phase3TestKit.Grants(_db, Phase3TestKit.UploadOptions(configure))
            .MintAsync(order, UploaderKind.ExternalLab, CancellationToken.None);
        await _db.SaveChangesAsync();
        var grant = await _db.UploadGrants.IgnoreQueryFilters().SingleAsync(g => g.TokenHash == UploadGrantService.Hash(minted.Token));
        return (order, grant);
    }

    private LabResultSubmission Submission(ClinicLabOrder order, UploadGrant? grant, byte[]? content = null, string contentType = "application/pdf",
        ResultSource source = ResultSource.ExternalLab) =>
        new(_clinicId, order.Id, source, content ?? Pdf, "../../report.pdf", contentType, "Quest Labs", "note", grant);

    [Fact]
    public async Task An_External_Result_Is_Stored_Unverified_And_The_Grant_Is_Consumed()
    {
        var (order, grant) = await SeedAsync();
        var intake = Phase3TestKit.Intake(_db, _files);

        var outcome = await intake.SubmitAsync(Submission(order, grant), CancellationToken.None);

        outcome.OrderNumber.Should().Be(order.OrderNumber);
        var result = await _db.LabResults.IgnoreQueryFilters().SingleAsync();
        result.Source.Should().Be(ResultSource.ExternalLab);
        result.Verification.Should().Be(VerificationState.Unverified);
        result.FileName.Should().Be("report.pdf", "path segments are stripped");
        result.ExternalLabName.Should().Be("Quest Labs");
        _files.Count.Should().Be(1);

        var saved = await _db.LabOrders.IgnoreQueryFilters().SingleAsync(o => o.Id == order.Id);
        saved.Stage.Should().Be(LabOrderStage.ExternalSubmitted);
        saved.Status.Should().Be(LabOrderStatus.CompletedWithExternalReport);
        (await _db.UploadGrants.IgnoreQueryFilters().SingleAsync()).Used.Should().Be(1);
    }

    [Fact]
    public async Task The_Document_Sync_Message_Is_Queued_With_The_Result()
    {
        var (order, grant) = await SeedAsync();

        await Phase3TestKit.Intake(_db, _files).SubmitAsync(Submission(order, grant), CancellationToken.None);

        var queued = await _db.InteropOutbox.SingleAsync(m => m.Type == InteropTypes.PatientDocumentIssued);
        queued.Should().NotBeNull();
    }

    [Fact]
    public async Task The_Grant_Stops_Working_After_Max_Uploads()
    {
        var (order, grant) = await SeedAsync(o => o.UploadMaxUploads = 2);
        var intake = Phase3TestKit.Intake(_db, _files);

        await intake.SubmitAsync(Submission(order, grant), CancellationToken.None);
        await intake.SubmitAsync(Submission(order, grant), CancellationToken.None);
        var third = () => intake.SubmitAsync(Submission(order, grant), CancellationToken.None);

        await third.Should().ThrowAsync<NotFoundException>();
        (await _db.LabResults.IgnoreQueryFilters().CountAsync()).Should().Be(2);
    }

    [Fact]
    public async Task An_Expired_Or_Revoked_Grant_Is_Refused()
    {
        var (order, grant) = await SeedAsync();
        var intake = Phase3TestKit.Intake(_db, _files);

        grant.ExpiresAt = DateTime.UtcNow.AddMinutes(-1);
        await _db.SaveChangesAsync();
        var expired = () => intake.SubmitAsync(Submission(order, grant), CancellationToken.None);
        await expired.Should().ThrowAsync<NotFoundException>();

        grant.ExpiresAt = DateTime.UtcNow.AddDays(1);
        grant.RevokedAt = DateTime.UtcNow;
        await _db.SaveChangesAsync();
        var revoked = () => intake.SubmitAsync(Submission(order, grant), CancellationToken.None);
        await revoked.Should().ThrowAsync<NotFoundException>();

        _files.Count.Should().Be(0);
    }

    [Fact]
    public async Task A_Grant_Of_Another_Order_Is_Refused()
    {
        var (order, grant) = await SeedAsync();
        var otherOrder = Phase3TestKit.NewLabOrder(_clinicId, Tenant, order.PatientId, "LAB-OTHER");
        _db.LabOrders.Add(otherOrder);
        await _db.SaveChangesAsync();

        var act = () => Phase3TestKit.Intake(_db, _files).SubmitAsync(Submission(otherOrder, grant), CancellationToken.None);

        await act.Should().ThrowAsync<NotFoundException>();
    }

    [Theory]
    [InlineData("text/html")]
    [InlineData("application/x-msdownload")]
    [InlineData("")]
    public async Task Disallowed_Content_Types_Are_Rejected(string contentType)
    {
        var (order, grant) = await SeedAsync();

        var act = () => Phase3TestKit.Intake(_db, _files).SubmitAsync(Submission(order, grant, contentType: contentType), CancellationToken.None);

        await act.Should().ThrowAsync<BadRequestException>();
        (await _db.UploadGrants.IgnoreQueryFilters().SingleAsync()).Used.Should().Be(0, "a rejected file does not burn the link");
    }

    [Fact]
    public async Task Content_Type_Parameters_And_Case_Are_Normalized()
    {
        var (order, grant) = await SeedAsync();

        await Phase3TestKit.Intake(_db, _files).SubmitAsync(Submission(order, grant, contentType: "Application/PDF; charset=binary"), CancellationToken.None);

        (await _db.LabResults.IgnoreQueryFilters().SingleAsync()).ContentType.Should().Be("application/pdf");
    }

    [Fact]
    public async Task Empty_And_Oversized_Files_Are_Rejected()
    {
        var (order, grant) = await SeedAsync(o => o.UploadMaxBytes = 8);
        var intake = Phase3TestKit.Intake(_db, _files, Phase3TestKit.UploadOptions(o => o.UploadMaxBytes = 8));

        var empty = () => intake.SubmitAsync(Submission(order, grant, content: Array.Empty<byte>()), CancellationToken.None);
        var large = () => intake.SubmitAsync(Submission(order, grant, content: new byte[9]), CancellationToken.None);

        await empty.Should().ThrowAsync<BadRequestException>();
        await large.Should().ThrowAsync<BadRequestException>().WithMessage("*limit*");
    }

    [Fact]
    public async Task A_ClinicEz_Source_Cannot_Come_Through_The_Upload_Intake()
    {
        var (order, grant) = await SeedAsync();

        var act = () => Phase3TestKit.Intake(_db, _files).SubmitAsync(Submission(order, grant, source: ResultSource.ClinicEzLab), CancellationToken.None);

        await act.Should().ThrowAsync<ArgumentException>();
    }

    [Fact]
    public async Task An_Order_Of_Another_Clinic_Is_Not_Found()
    {
        var (order, grant) = await SeedAsync();
        var submission = Submission(order, grant) with { ClinicId = Guid.NewGuid() };

        var act = () => Phase3TestKit.Intake(_db, _files).SubmitAsync(submission, CancellationToken.None);

        await act.Should().ThrowAsync<NotFoundException>();
    }

    [Fact]
    public async Task A_Finalized_Order_Keeps_Its_Stage_When_An_External_File_Arrives()
    {
        var (order, grant) = await SeedAsync();
        order.Stage = LabOrderStage.ResultFinalized;
        await _db.SaveChangesAsync();

        await Phase3TestKit.Intake(_db, _files).SubmitAsync(Submission(order, grant), CancellationToken.None);

        (await _db.LabOrders.IgnoreQueryFilters().SingleAsync(o => o.Id == order.Id)).Stage.Should().Be(LabOrderStage.ResultFinalized);
    }
}

public class LabResultExternalSubmittedHandlerTests
{
    private const string Tenant = "tenant-a";
    private readonly Guid _clinicId = Guid.NewGuid();
    private readonly ApplicationDbContext _db = MessagingTestKit.CreateDbContext();
    private readonly Phase3TestKit.InMemoryFileStore _files = new();
    private readonly string _file = Convert.ToBase64String(System.Text.Encoding.ASCII.GetBytes("%PDF-1.4 test"));

    private LabResultExternalSubmittedHandler Handler() =>
        new(_db, MessagingTestKit.Recipient(_db), Phase3TestKit.Grants(_db), Phase3TestKit.Intake(_db, _files),
            NullLogger<LabResultExternalSubmittedHandler>.Instance);

    private async Task<(ClinicLabOrder Order, ClinicPatient Patient, string Token)> SeedAsync()
    {
        MessagingTestKit.SeedClinic(_db, _clinicId, Tenant);
        var patient = Phase3TestKit.NewPatient(_clinicId, Tenant, Guid.NewGuid());
        _db.Patients.Add(patient);
        var order = Phase3TestKit.NewLabOrder(_clinicId, Tenant, patient.Id);
        _db.LabOrders.Add(order);
        var minted = await Phase3TestKit.Grants(_db).MintAsync(order, UploaderKind.ExternalLab, CancellationToken.None);
        await _db.SaveChangesAsync();
        return (order, patient, minted.Token);
    }

    private Task Deliver(ClinicLabOrder order, Party from, string? token, Guid? correlation = null)
    {
        var payload = new ExternalLabResultUploadedEvent
        {
            RequisitionId = order.Id,
            UploadToken = token,
            ExternalLabName = "Quest Labs",
            ContentType = "application/pdf",
            FileName = "r.pdf",
            FileBase64 = _file
        };
        return Handler().HandleAsync(payload,
            MessagingTestKit.Delivered(InteropTypes.LabResultExternalSubmitted, from, MessagingTestKit.ClinicParty(Tenant, _clinicId),
                correlation ?? order.Id, payload),
            CancellationToken.None);
    }

    private Task<int> ResultCount() => _db.LabResults.IgnoreQueryFilters().CountAsync();

    [Fact]
    public async Task The_Portal_Relaying_A_Valid_Grant_Stores_An_Unverified_External_Result()
    {
        var (order, _, token) = await SeedAsync();

        await Deliver(order, Party.Portal, token);

        var result = await _db.LabResults.IgnoreQueryFilters().SingleAsync();
        result.Source.Should().Be(ResultSource.ExternalLab);
        result.Verification.Should().Be(VerificationState.Unverified);
        (await _db.UploadGrants.IgnoreQueryFilters().SingleAsync()).Used.Should().Be(1);
    }

    [Fact]
    public async Task The_Portal_Without_A_Token_Or_With_A_Bad_Token_Is_Ignored()
    {
        var (order, _, token) = await SeedAsync();

        await Deliver(order, Party.Portal, null);
        await Deliver(order, Party.Portal, "garbage");
        await Deliver(order, Party.Portal, token + "x");

        (await ResultCount()).Should().Be(0);
    }

    [Fact]
    public async Task A_Grant_Of_One_Order_Cannot_Upload_To_Another_Order()
    {
        var (order, patient, token) = await SeedAsync();
        var other = Phase3TestKit.NewLabOrder(_clinicId, Tenant, patient.Id, "LAB-2");
        _db.LabOrders.Add(other);
        await _db.SaveChangesAsync();

        await Deliver(other, Party.Portal, token);

        (await ResultCount()).Should().Be(0);
        order.Should().NotBeNull();
    }

    [Fact]
    public async Task A_Patient_Grant_Is_Not_Accepted_On_The_External_Lab_Channel()
    {
        var (order, _, _) = await SeedAsync();
        var patientLink = await Phase3TestKit.Grants(_db).MintAsync(order, UploaderKind.Patient, CancellationToken.None);
        await _db.SaveChangesAsync();

        await Deliver(order, Party.Portal, patientLink.Token);

        (await ResultCount()).Should().Be(0);
    }

    [Fact]
    public async Task The_Owning_Patient_Uploads_Without_A_Token_And_It_Is_Marked_Patient_Uploaded()
    {
        var (order, patient, _) = await SeedAsync();

        await Deliver(order, Party.ForPatient(patient.SyncPatientId!.Value.ToString()), null);

        var result = await _db.LabResults.IgnoreQueryFilters().SingleAsync();
        result.Source.Should().Be(ResultSource.PatientUploaded);
        result.Verification.Should().Be(VerificationState.Unverified);
        result.UploadedByPatientId.Should().Be(patient.SyncPatientId);
    }

    [Fact]
    public async Task Another_Patient_Cannot_Upload_To_Someone_Elses_Order()
    {
        var (order, _, _) = await SeedAsync();

        await Deliver(order, Party.ForPatient(Guid.NewGuid().ToString()), null);

        (await ResultCount()).Should().Be(0);
    }

    [Fact]
    public async Task Facilities_And_Mismatched_Correlations_Are_Ignored()
    {
        var (order, patient, token) = await SeedAsync();

        await Deliver(order, MessagingTestKit.LabParty(), token);
        await Deliver(order, Party.Portal, token, correlation: Guid.NewGuid());
        await Deliver(order, Party.ForPatient(patient.SyncPatientId!.Value.ToString()), null, correlation: Guid.NewGuid());

        (await ResultCount()).Should().Be(0);
    }

    [Fact]
    public async Task A_File_Failing_The_Rules_Is_Acknowledged_Not_Thrown()
    {
        var (order, _, token) = await SeedAsync();
        var payload = new ExternalLabResultUploadedEvent
        {
            RequisitionId = order.Id,
            UploadToken = token,
            ContentType = "text/html",
            FileBase64 = _file
        };

        var act = () => Handler().HandleAsync(payload,
            MessagingTestKit.Delivered(InteropTypes.LabResultExternalSubmitted, Party.Portal, MessagingTestKit.ClinicParty(Tenant, _clinicId), order.Id, payload),
            CancellationToken.None);

        await act.Should().NotThrowAsync();
        (await ResultCount()).Should().Be(0);
    }
}
