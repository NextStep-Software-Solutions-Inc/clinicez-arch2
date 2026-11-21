using System;
using System.IO;
using System.Net;
using System.Net.Http;
using System.Text;
using System.Text.Json;
using System.Threading;
using System.Threading.Tasks;
using ClinicEz.PhilHealthProxy.Application.Features.AvailmentSlip.Queries;
using ClinicEz.PhilHealthProxy.Application.Features.DataUpload.Commands;
using ClinicEz.PhilHealthProxy.Application.Features.Validator.Queries;
using ClinicEz.PhilHealthProxy.Domain.Entities;
using ClinicEz.PhilHealthProxy.Domain.Exceptions;
using ClinicEz.PhilHealthProxy.Domain.Interfaces;
using ClinicEz.PhilHealthProxy.Domain.Models;
using ClinicEz.PhilHealthProxy.Infrastructure.Interop;
using ClinicEz.PhilHealthProxy.Infrastructure.Services;
using ClinicEz.Shared.Common;
using ClinicEz.Shared.Interop;
using ClinicEz.Shared.Interop.Handling;
using ClinicEz.Shared.Interop.Requests;
using ClinicEz.Shared.Interoperability;
using FluentAssertions;
using MediatR;
using Microsoft.AspNetCore.DataProtection;
using Microsoft.Extensions.Logging.Abstractions;
using NSubstitute;
using Xunit;

namespace ClinicEz.PhilHealthProxy.Application.Tests.Services;

public sealed class Yakap2ResponderAndSandboxTests
{
    private static readonly JsonSerializerOptions JsonOpts = new()
    {
        PropertyNameCaseInsensitive = true
    };

    private static (PcapiSandboxService Sandbox, PhilHealthPayloadEncryptor Encryptor) CreateSandbox()
    {
        var encryptor = new PhilHealthPayloadEncryptor();
        var sandbox = new PcapiSandboxService(encryptor, NullLogger<PcapiSandboxService>.Instance);
        return (sandbox, encryptor);
    }

    [Fact]
    public async Task Sandbox_WalkInPin_StartsUnverifiedAndNotAssigned_ThenProgressesAuthentically()
    {
        var (sandbox, encryptor) = CreateSandbox();
        const string walkInPin = "123456789012";
        const string accreNo = "H10000001";
        const string cipherKey = "CLINICEZ-SANDBOX-CIPHER-KEY-32CH!";

        // 1. Seeded walk-in starts unverified & NOT_ASSIGNED
        var initial = await sandbox.ValidateStandingAsync(new YakapValidateStandingRequest(walkInPin, "2026"), accreNo);
        initial.Pcu!.Status.Should().Be("UNVERIFIED");
        initial.Selection!.Status.Should().Be("NOT_ASSIGNED");
        initial.Empanelment!.Status.Should().Be("N");
        initial.Fpe!.Status.Should().Be("N");

        // Pre-seeded returning beneficiary 987654321098 starts ASSIGNED & VERIFIED
        var returning = await sandbox.ValidateStandingAsync(new YakapValidateStandingRequest("987654321098", "2026"), accreNo);
        returning.Pcu!.Status.Should().Be("VERIFIED");
        returning.Selection!.Status.Should().Be("ASSIGNED");
        returning.Empanelment!.Status.Should().Be("Y");

        // 2. Service 01: Start & Verify PCU
        var start = await sandbox.StartPcuAsync(new PcuStartRequest(walkInPin, "JUAN", "SANTOS", "DELA CRUZ", null, "01/15/1990"), accreNo);
        start.Status.Should().Be("PENDING");
        var verify = await sandbox.VerifyPcuAsync(new PcuVerifyRequest(start.LivenessAuthorizationId), accreNo);
        verify.PinMatched.Should().BeTrue();
        verify.Status.Should().Be("VERIFIED");

        // 3. Service 04: Submit Selection
        var sel = await sandbox.SubmitSelectionAsync(new YakapSelectionRequest(walkInPin, "11/20/2026"), accreNo);
        sel.Selection.Status.Should().Be("ASSIGNED");

        // 4. Service 06: Upload encrypted FPE payload
        var fpeJson = JsonSerializer.Serialize(new
        {
            enlistment = new { patient_pin = walkInPin },
            @case = new { case_no = "CH100000012026112000001" },
            profiling = new { fpe_transaction_no = "PH100000012026112000001" }
        });
        var env = encryptor.EncryptJson(fpeJson, cipherKey);
        var upload = await sandbox.UploadDataAsync("fpe", env, accreNo, cipherKey);
        upload.ProcessingStatus.Should().Be("queued");

        // 5. Service 03: Submit Empanelment
        var emp = await sandbox.SubmitEmpanelmentAsync(new YakapEmpanelmentRequest(walkInPin, true, "PCU", verify.TransNo), accreNo);
        emp.WithYes.Should().BeTrue();
        emp.WithFpe.Should().BeTrue();
        emp.FpeTransactionNo.Should().Be("PH100000012026112000001");

        // 6. Standing reflects full completion
        var finalStanding = await sandbox.ValidateStandingAsync(new YakapValidateStandingRequest(walkInPin, "2026"), accreNo);
        finalStanding.Pcu!.Status.Should().Be("VERIFIED");
        finalStanding.Selection!.Status.Should().Be("ASSIGNED");
        finalStanding.Empanelment!.Status.Should().Be("Y");
        finalStanding.Empanelment.TransactionNo.Should().Be(emp.YesReferenceNo);
        finalStanding.Fpe!.Status.Should().Be("Y");

        // 7. Reset clears walk-in state cleanly
        sandbox.Reset();
        var afterReset = await sandbox.ValidateStandingAsync(new YakapValidateStandingRequest(walkInPin, "2026"), accreNo);
        afterReset.Pcu!.Status.Should().Be("UNVERIFIED");
        afterReset.Selection!.Status.Should().Be("NOT_ASSIGNED");
    }

    [Fact]
    public async Task GenerateAvailmentSlip_InSandbox_WithEmptyCipherKey_FallsBackAndProducesDecryptablePdf()
    {
        var (sandbox, encryptor) = CreateSandbox();
        var encrypted = await sandbox.GenerateAvailmentSlipAsync(new AvailmentSlipRequest("123456789012", "2026"), "H10000001", string.Empty);

        var pdfBytes = encryptor.DecryptPdf(encrypted, ClinicEz.PhilHealthProxy.Application.Common.TenantResolutionHelper.SandboxDefaultCipherKey);
        var pdfText = Encoding.ASCII.GetString(pdfBytes);
        pdfText.Should().StartWith("%PDF-1.4");
        pdfText.Should().Contain("%%EOF");
        pdfText.Should().Contain("123456789012");
    }

    [Fact]
    public async Task Responder_WrapsResponsesInApiResponse_EncryptsPlainUploadJson_AndDecryptsAvailmentSlip()
    {
        var encryptor = new PhilHealthPayloadEncryptor();
        var sandbox = new PcapiSandboxService(encryptor, NullLogger<PcapiSandboxService>.Instance);
        var dataProtection = new EphemeralDataProtectionProvider();

        var tenantId = Guid.NewGuid();
        var branchId = Guid.NewGuid();
        var tenant = new PhilHealthTenant
        {
            TenantId = tenantId,
            BranchId = branchId,
            AccreditationNumber = "H10000001",
            PmccNumber = "Z15445",
            SoftwareCertificateId = "KON-DUMMYCERTS-Z15445",
            EncryptedCipherKey = dataProtection.CreateProtector("PhilHealthTenantProtection").Protect("MY-32-BYTE-SECRET-CIPHER-KEY-26!"),
            BaseUrl = "https://pcapi-sandbox.philhealth.gov.ph",
            IsActive = true
        };

        var currentTenant = new CurrentTenantService();
        var tenantRepo = Substitute.For<ITenantRepository>();
        tenantRepo.GetByBranchIdAsync(branchId, Arg.Any<CancellationToken>()).Returns(tenant);
        tenantRepo.GetByTenantIdAsync(tenantId, Arg.Any<CancellationToken>()).Returns(tenant);

        var pcapiClient = Substitute.For<IPhilHealthPcapiClient>();
        pcapiClient.UploadDataAsync("fpe", Arg.Any<PhilHealthEncryptedPayload>(), tenant, Arg.Any<CancellationToken>())
            .Returns(ci => sandbox.UploadDataAsync("fpe", ci.ArgAt<PhilHealthEncryptedPayload>(1), tenant.AccreditationNumber, "MY-32-BYTE-SECRET-CIPHER-KEY-26!"));
        pcapiClient.GenerateAvailmentSlipAsync(Arg.Any<AvailmentSlipRequest>(), tenant, Arg.Any<CancellationToken>())
            .Returns(ci => sandbox.GenerateAvailmentSlipAsync(ci.ArgAt<AvailmentSlipRequest>(0), tenant.AccreditationNumber, "MY-32-BYTE-SECRET-CIPHER-KEY-26!"));
        pcapiClient.ValidateStandingAsync(Arg.Any<YakapValidateStandingRequest>(), tenant, Arg.Any<CancellationToken>())
            .Returns(ci => sandbox.ValidateStandingAsync(ci.ArgAt<YakapValidateStandingRequest>(0), tenant.AccreditationNumber));

        var mediator = Substitute.For<IMediator>();
        mediator.Send(Arg.Any<UploadPlainJsonDataCommand>(), Arg.Any<CancellationToken>())
            .Returns(ci => new UploadPlainJsonDataCommandHandler(currentTenant, tenantRepo, pcapiClient, encryptor, dataProtection)
                .Handle(ci.ArgAt<UploadPlainJsonDataCommand>(0), ci.ArgAt<CancellationToken>(1)));
        mediator.Send(Arg.Any<GenerateDecryptedAvailmentSlipQuery>(), Arg.Any<CancellationToken>())
            .Returns(ci => new GenerateDecryptedAvailmentSlipQueryHandler(currentTenant, tenantRepo, pcapiClient, encryptor, dataProtection)
                .Handle(ci.ArgAt<GenerateDecryptedAvailmentSlipQuery>(0), ci.ArgAt<CancellationToken>(1)));

        var responder = new PhilHealthRequestResponder(mediator, currentTenant, NullLogger<PhilHealthRequestResponder>.Instance);
        var context = new InteropMessageContext(new InteropEnvelope
        {
            MessageId = Guid.NewGuid(),
            CorrelationId = Guid.NewGuid(),
            Type = InteropTypes.PhilHealthRequest,
            From = Party.ForFacility(tenantId.ToString(), branchId.ToString(), FacilityType.Clinic),
            To = Party.PhilHealth,
            SentAtUtc = DateTime.UtcNow
        });

        // 1. Plain JSON FPE upload -> responder routes to UploadPlainJsonDataCommand -> wraps in ApiResponse<DataUploadResponse>
        var uploadReply = await responder.RespondAsync(
            new PhilHealthRequestPayload
            {
                Operation = PhilHealthOperations.DataUploadFpe,
                Body = "{\"enlistment\":{\"patient_pin\":\"123456789012\"},\"case\":{\"case_no\":\"CH100000012026112000001\"}}"
            },
            context,
            CancellationToken.None);

        uploadReply.StatusCode.Should().Be(200);
        var uploadApi = JsonSerializer.Deserialize<ApiResponse<DataUploadResponse>>(uploadReply.Body!, JsonOpts);
        uploadApi!.Succeeded.Should().BeTrue();
        uploadApi.Data!.ProcessingStatus.Should().Be("queued");
        uploadApi.Data.CaseNo.Should().Be("CH100000012026112000001");

        // 2. Service 08 slip -> responder returns decrypted AvailmentSlipResponse inside ApiResponse<AvailmentSlipResponse>
        var slipReply = await responder.RespondAsync(
            new PhilHealthRequestPayload
            {
                Operation = PhilHealthOperations.GenerateAvailmentSlip,
                Body = JsonSerializer.Serialize(new AvailmentSlipRequest("123456789012", "2026"))
            },
            context,
            CancellationToken.None);

        slipReply.StatusCode.Should().Be(200);
        var slipApi = JsonSerializer.Deserialize<ApiResponse<AvailmentSlipResponse>>(slipReply.Body!, JsonOpts);
        slipApi!.Succeeded.Should().BeTrue();
        slipApi.Data!.MimeType.Should().Be("application/pdf");
        var decodedPdf = Encoding.ASCII.GetString(Convert.FromBase64String(slipApi.Data.PdfBase64));
        decodedPdf.Should().Contain("%%EOF");
    }

    private sealed class StubHttpMessageHandler(Func<HttpRequestMessage, HttpResponseMessage> handler) : HttpMessageHandler
    {
        protected override Task<HttpResponseMessage> SendAsync(HttpRequestMessage request, CancellationToken cancellationToken) =>
            Task.FromResult(handler(request));
    }

    [Fact]
    public async Task PcapiClientAndResponder_EmitClearErrors_ForMissingConnectionUrl_AndUpstreamAuth404()
    {
        var encryptor = new PhilHealthPayloadEncryptor();
        var sandbox = new PcapiSandboxService(encryptor, NullLogger<PcapiSandboxService>.Instance);
        var dataProtection = new EphemeralDataProtectionProvider();
        var tokenCache = new PhilHealthTokenCache(NullLogger<PhilHealthTokenCache>.Instance);
        var rateLimiter = new PhilHealthRateLimiter(NullLogger<PhilHealthRateLimiter>.Instance);

        var httpClient = new HttpClient(new StubHttpMessageHandler(req =>
        {
            if (req.RequestUri!.AbsolutePath.EndsWith("/api/v1/auth/token", StringComparison.OrdinalIgnoreCase))
            {
                return new HttpResponseMessage(HttpStatusCode.NotFound) { Content = new StringContent("Not Found") };
            }
            return new HttpResponseMessage(HttpStatusCode.OK);
        }));

        var pcapiClient = new PhilHealthPcapiClient(
            httpClient,
            tokenCache,
            rateLimiter,
            sandbox,
            dataProtection,
            NullLogger<PhilHealthPcapiClient>.Instance);

        var tenantMissingUrl = new PhilHealthTenant
        {
            TenantId = Guid.NewGuid(),
            AccreditationNumber = "P10038831",
            PmccNumber = "Z15445",
            SoftwareCertificateId = "CERT-01",
            BaseUrl = string.Empty,
            IsActive = true
        };

        // 1. Blank Connection URL must throw PHILHEALTH_CONNECTION_URL_MISSING (never silently fake sandbox)
        var missingAct = () => pcapiClient.ValidateStandingAsync(new YakapValidateStandingRequest("123456789012", "2026"), tenantMissingUrl);
        var missingEx = await missingAct.Should().ThrowAsync<PhilHealthGatewayException>();
        missingEx.Which.ErrorCode.Should().Be("PHILHEALTH_CONNECTION_URL_MISSING");
        missingEx.Which.Message.Should().Contain("PhilHealth Connection URL is not configured");

        // 2. Responder surfaces PHILHEALTH_ENDPOINT_NOT_FOUND when auth endpoint returns HTTP 404 (not PIN_NOT_FOUND)
        var tenantId = Guid.NewGuid();
        var branchId = Guid.NewGuid();
        var tenantWithBrokenAuthUrl = new PhilHealthTenant
        {
            TenantId = tenantId,
            BranchId = branchId,
            AccreditationNumber = "P10038831",
            PmccNumber = "Z15445",
            SoftwareCertificateId = "CERT-01",
            EncryptedSecretKey = "secret-123",
            BaseUrl = "https://pcapi.philhealth.gov.ph",
            IsActive = true
        };
        var tenantRepo = Substitute.For<ITenantRepository>();
        tenantRepo.GetByBranchIdAsync(branchId, Arg.Any<CancellationToken>()).Returns(tenantWithBrokenAuthUrl);
        tenantRepo.GetByTenantIdAsync(tenantId, Arg.Any<CancellationToken>()).Returns(tenantWithBrokenAuthUrl);
        var currentTenant = new CurrentTenantService();
        var mediator = Substitute.For<IMediator>();
        mediator.Send(Arg.Any<ValidateYakapStandingQuery>(), Arg.Any<CancellationToken>())
            .Returns(ci => new ValidateYakapStandingQueryHandler(currentTenant, tenantRepo, pcapiClient)
                .Handle(ci.ArgAt<ValidateYakapStandingQuery>(0), ci.ArgAt<CancellationToken>(1)));

        var responder = new PhilHealthRequestResponder(mediator, currentTenant, NullLogger<PhilHealthRequestResponder>.Instance);
        var ctx = new InteropMessageContext(new InteropEnvelope
        {
            MessageId = Guid.NewGuid(),
            CorrelationId = Guid.NewGuid(),
            Type = InteropTypes.PhilHealthRequest,
            From = Party.ForFacility(tenantId.ToString(), branchId.ToString(), FacilityType.Clinic),
            To = Party.PhilHealth,
            SentAtUtc = DateTime.UtcNow
        });

        var reply = await responder.RespondAsync(
            new PhilHealthRequestPayload
            {
                Operation = PhilHealthOperations.YakapValidateStanding,
                Body = JsonSerializer.Serialize(new YakapValidateStandingRequest("123456789012", "2026"))
            },
            ctx,
            CancellationToken.None);

        reply.StatusCode.Should().Be(502);
        var apiErr = JsonSerializer.Deserialize<ApiResponse<object>>(reply.Body!, JsonOpts);
        apiErr!.Succeeded.Should().BeFalse();
        apiErr.ErrorCode.Should().Be("PHILHEALTH_ENDPOINT_NOT_FOUND");
        apiErr.Message.Should().Contain("authentication endpoint was not found");
    }
}
