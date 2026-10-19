using ClinicEz.Portal.Application.Features.PublicUploads;
using ClinicEz.Portal.Domain.Entities;
using ClinicEz.Portal.Infrastructure.Persistence;
using ClinicEz.Portal.Tests.Support;
using ClinicEz.Shared.Common;
using ClinicEz.Shared.Interop;
using ClinicEz.Shared.Interoperability;
using Microsoft.Extensions.Logging.Abstractions;
using Microsoft.Extensions.Options;
using Xunit;

namespace ClinicEz.Portal.Tests.PublicUploads;

public class LabUploadRelayTests : IDisposable
{
    private static readonly byte[] Pdf = [0x25, 0x50, 0x44, 0x46, 0x2D, 0x31, 0x2E, 0x34];
    private static readonly byte[] Png = [0x89, 0x50, 0x4E, 0x47, 0x0D, 0x0A, 0x1A, 0x0A, 0x00];

    private readonly ApplicationDbContext _context = TestSupport.NewContext();
    private readonly LabUploadOptions _options = new();
    private readonly Tenant _tenant = new() { Id = Guid.NewGuid(), TenantSlug = "metro", Name = "Metro", OwnerId = "owner", Email = "o@metro.ph" };
    private readonly Facility _clinic;

    public LabUploadRelayTests()
    {
        _clinic = new Facility { Id = Guid.NewGuid(), TenantId = _tenant.Id, Name = "Clinic", FacilityType = FacilityType.Clinic, Status = FacilityStatus.Active };
        _context.Tenants.Add(_tenant);
        _context.Facilities.Add(_clinic);
        _context.SaveChanges();
    }

    public void Dispose()
    {
        _context.Database.EnsureDeleted();
        _context.Dispose();
    }

    private string TokenFor(Facility facility) => $"{facility.Id:N}.s3cr3t-part";

    private Task RelayAsync(string token, byte[]? content = null, string? contentType = "application/pdf", string? fileName = "result.pdf", string? labName = "Acme Labs") =>
        new RelayExternalLabUploadCommandHandler(_context, new InteropPublisher(_context), Options.Create(_options), NullLogger<RelayExternalLabUploadCommandHandler>.Instance)
            .Handle(new RelayExternalLabUploadCommand(token, fileName, contentType, content ?? Pdf, labName), CancellationToken.None);

    [Fact]
    public async Task ValidUpload_IsRelayedToTheIssuingClinicsCell_WithoutStoringTheFile()
    {
        var token = TokenFor(_clinic);

        await RelayAsync(token, labName: "  Acme Labs  ");

        var envelope = Assert.Single(TestSupport.Outbox(_context, InteropTypes.LabResultExternalSubmitted));
        Assert.Equal(Party.Portal, envelope.From);
        Assert.Equal(Party.ForFacility(_tenant.Id.ToString(), _clinic.Id.ToString(), FacilityType.Clinic), envelope.To);
        var payload = envelope.GetPayload<ExternalLabResultUploadedEvent>();
        Assert.Equal(token, payload.UploadToken);
        Assert.Equal(UploaderKind.ExternalLab, payload.UploaderKind);
        Assert.Equal("application/pdf", payload.ContentType);
        Assert.Equal("PDF", payload.DocumentType);
        Assert.Equal("Acme Labs", payload.ExternalLabName);
        Assert.Equal(Convert.ToBase64String(Pdf), payload.FileBase64);
        Assert.Equal(payload.UploadId, envelope.CorrelationId);
    }

    [Fact]
    public async Task ImageUpload_IsLabelledAsAPhoto_AndTheContentTypeIsNormalised()
    {
        await RelayAsync(TokenFor(_clinic), Png, "IMAGE/PNG; charset=binary", "../../etc/passwd\\scan.png");

        var payload = Assert.Single(TestSupport.OutboxPayloads<ExternalLabResultUploadedEvent>(_context, InteropTypes.LabResultExternalSubmitted));
        Assert.Equal("Photo", payload.DocumentType);
        Assert.Equal("image/png", payload.ContentType);
        Assert.Equal("scan.png", payload.FileName);
    }

    [Fact]
    public async Task LabName_IsTrimmedAndCapped_AndBlankMeansUnknown()
    {
        await RelayAsync(TokenFor(_clinic), labName: new string('x', 300));
        await RelayAsync(TokenFor(_clinic), labName: "   ");

        var payloads = TestSupport.OutboxPayloads<ExternalLabResultUploadedEvent>(_context, InteropTypes.LabResultExternalSubmitted);
        Assert.Equal(120, payloads.Select(p => p.ExternalLabName).First(n => n is not null)!.Length);
        Assert.Contains(payloads, p => p.ExternalLabName is null);
    }

    [Theory]
    [InlineData("")]
    [InlineData("nodot")]
    [InlineData("tooshort.secret")]
    [InlineData("zzzzzzzzzzzzzzzzzzzzzzzzzzzzzzzz.secret")]
    [InlineData("00000000000000000000000000000001.")]
    public async Task MalformedOrUnknownTokens_DropTheUpload(string token)
    {
        await RelayAsync(token);

        Assert.Empty(TestSupport.Outbox(_context, InteropTypes.LabResultExternalSubmitted));
    }

    [Fact]
    public async Task OverlongToken_DropsTheUpload()
    {
        await RelayAsync(TokenFor(_clinic) + new string('a', 250));

        Assert.Empty(TestSupport.Outbox(_context, InteropTypes.LabResultExternalSubmitted));
    }

    [Fact]
    public async Task TokenOfANonClinicOrInactiveOrUnknownFacility_DropsTheUpload()
    {
        var lab = new Facility { Id = Guid.NewGuid(), TenantId = _tenant.Id, Name = "Lab", FacilityType = FacilityType.Laboratory, Status = FacilityStatus.Active };
        var provisioning = new Facility { Id = Guid.NewGuid(), TenantId = _tenant.Id, Name = "New", FacilityType = FacilityType.Clinic, Status = FacilityStatus.Provisioning };
        var suspended = new Facility { Id = Guid.NewGuid(), TenantId = _tenant.Id, Name = "Old", FacilityType = FacilityType.Clinic, Status = FacilityStatus.Suspended };
        _context.Facilities.AddRange(lab, provisioning, suspended);
        await _context.SaveChangesAsync();

        await RelayAsync(TokenFor(lab));
        await RelayAsync(TokenFor(provisioning));
        await RelayAsync(TokenFor(suspended));
        await RelayAsync($"{Guid.NewGuid():N}.secret");

        Assert.Empty(TestSupport.Outbox(_context, InteropTypes.LabResultExternalSubmitted));
    }

    [Fact]
    public async Task FileChecks_RunBeforeTheTokenIsLookedAt_SoNothingIsQueuedForABadFile()
    {
        var token = TokenFor(_clinic);

        await RelayAsync(token, [], "application/pdf");
        await RelayAsync(token, Pdf, "text/html");
        await RelayAsync(token, Png, "application/pdf");
        await RelayAsync(token, new byte[_options.MaxFileBytes + 1].Select(_ => (byte)0x25).ToArray(), "application/pdf");

        Assert.Empty(TestSupport.Outbox(_context, InteropTypes.LabResultExternalSubmitted));
    }

    [Theory]
    [InlineData("application/pdf", 0, LabUploadVerdict.EmptyFile)]
    [InlineData("text/plain", 10, LabUploadVerdict.UnsupportedType)]
    [InlineData(null, 10, LabUploadVerdict.UnsupportedType)]
    [InlineData("image/jpeg", 6, LabUploadVerdict.ContentMismatch)]
    public void Validator_ReportsTheFirstFailedCheck(string? contentType, int length, LabUploadVerdict expected)
    {
        var content = new byte[length];
        Array.Fill(content, (byte)'a');

        Assert.Equal(expected, LabUploadValidator.Validate(_options, contentType, content));
    }

    [Fact]
    public void Validator_AcceptsFilesWithMatchingMagicBytes_AndRefusesOversizedOnes()
    {
        var jpeg = new byte[] { 0xFF, 0xD8, 0xFF, 0xE0, 0x00 };
        var oversized = new byte[_options.MaxFileBytes + 1];
        oversized[0] = 0xFF; oversized[1] = 0xD8; oversized[2] = 0xFF;

        Assert.Equal(LabUploadVerdict.Accepted, LabUploadValidator.Validate(_options, "image/jpeg", jpeg));
        Assert.Equal(LabUploadVerdict.Accepted, LabUploadValidator.Validate(_options, "application/pdf", Pdf));
        Assert.Equal(LabUploadVerdict.TooLarge, LabUploadValidator.Validate(_options, "image/jpeg", oversized));
    }

    [Theory]
    [InlineData(null, "application/pdf", "result.pdf")]
    [InlineData("  ", "image/jpeg", "result.jpg")]
    [InlineData("C:\\temp\\a.pdf", "application/pdf", "a.pdf")]
    public void SafeFileName_StripsPathsAndFallsBackToADefault(string? name, string contentType, string expected) =>
        Assert.Equal(expected, LabUploadValidator.SafeFileName(name, contentType));
}
