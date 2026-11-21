namespace ClinicEz.Clinic.Application.Tests.Features.Audit;

using System;
using System.Collections.Generic;
using System.Security.Claims;
using System.Text.Json;
using System.Threading;
using System.Threading.Tasks;
using ClinicEz.Clinic.Application.Common.Audit;
using ClinicEz.Clinic.Application.Common.Interfaces;
using ClinicEz.Clinic.Application.Common.Privacy;
using ClinicEz.Clinic.Application.Features.Yakap.DTOs;
using ClinicEz.Clinic.Application.Features.Yakap.Services;
using ClinicEz.Clinic.Domain.Constants;
using ClinicEz.Clinic.Domain.Entities;
using ClinicEz.Clinic.Domain.Enums;
using ClinicEz.Clinic.Domain.Interfaces;
using ClinicEz.Clinic.Infrastructure.PhilHealth.Auditing;
using ClinicEz.Shared.Common;
using FluentAssertions;
using Microsoft.AspNetCore.Http;
using Microsoft.Extensions.Logging;
using NSubstitute;
using Xunit;

public class PhilHealthAuditInterceptionTests
{
    private readonly IAuditLogQueue _auditQueue;
    private readonly IClinicContext _clinicContext;
    private readonly IPhiRedactionService _redactionService;
    private readonly IHttpContextAccessor _httpContextAccessor;
    private readonly Guid _clinicId = Guid.NewGuid();
    private readonly Guid _staffId = Guid.NewGuid();
    private readonly string _tenantId = "tenant_yakap_test";

    public PhilHealthAuditInterceptionTests()
    {
        _auditQueue = Substitute.For<IAuditLogQueue>();
        _clinicContext = Substitute.For<IClinicContext>();
        _redactionService = Substitute.For<IPhiRedactionService>();
        _httpContextAccessor = Substitute.For<IHttpContextAccessor>();

        _clinicContext.ClinicId.Returns(_clinicId);
        _clinicContext.StaffId.Returns(_staffId);
        _clinicContext.TenantId.Returns(_tenantId);

        _redactionService.MaskPhilHealthPin(Arg.Any<string>())
            .Returns(callInfo =>
            {
                var pin = callInfo.Arg<string>();
                if (string.IsNullOrEmpty(pin) || pin.Length < 10) return pin ?? "";
                return $"{pin[..3]}****{pin[^4..]}";
            });

        _redactionService.MaskPatientName(Arg.Any<string>())
            .Returns(callInfo => "J*** D***");

        var httpContext = new DefaultHttpContext();
        httpContext.Connection.RemoteIpAddress = System.Net.IPAddress.Parse("127.0.0.1");
        httpContext.Request.Headers.UserAgent = "PhilHealthTest/1.0";

        var claims = new[]
        {
            new Claim("sub", _staffId.ToString()),
            new Claim("name", "Dr. PhilHealth Compliance"),
            new Claim("staff_role", "Administrator"),
            new Claim("tenant_id", _tenantId),
            new Claim("clinic_id", _clinicId.ToString())
        };
        httpContext.User = new ClaimsPrincipal(new ClaimsIdentity(claims, "TestAuth"));
        _httpContextAccessor.HttpContext.Returns(httpContext);
    }

    [Fact]
    public async Task ValidatePin_ValidPin_EnqueuesYakapPinVerified_WithRoutineSeverityAndSuccess()
    {
        // Arrange
        var inner = Substitute.For<IPhilHealthProxyClient>();
        inner.ValidatePinAsync(Arg.Any<string>(), Arg.Any<CancellationToken>())
            .Returns(ApiResponse<bool>.Success(true));

        var logger = Substitute.For<ILogger<AuditablePhilHealthProxyClient>>();
        var client = new AuditablePhilHealthProxyClient(
            inner, _auditQueue, _clinicContext, _redactionService, _httpContextAccessor, logger);

        _auditQueue.TryEnqueue(Arg.Any<AuditLogMessage>()).Returns(true);

        // Act
        var result = await client.ValidatePinAsync("12-345678901-2", CancellationToken.None);

        // Assert
        result.Succeeded.Should().BeTrue();
        result.Data.Should().BeTrue();

        _auditQueue.Received(1).TryEnqueue(Arg.Is<AuditLogMessage>(msg =>
            msg.Action == PhilHealthAuditEvents.PinVerified &&
            msg.Category == ClinicAuditCategories.PhilHealth &&
            msg.Severity == ClinicAuditSeverities.Routine &&
            msg.Outcome == "Success" &&
            msg.Description.Contains("passed format check")));
    }

    [Fact]
    public async Task ValidatePin_InvalidPin_EnqueuesYakapPinVerified_WithUrgentSeverityAndWarning()
    {
        // Arrange
        var inner = Substitute.For<IPhilHealthProxyClient>();
        inner.ValidatePinAsync(Arg.Any<string>(), Arg.Any<CancellationToken>())
            .Returns(ApiResponse<bool>.Fail("Invalid check digit"));

        var logger = Substitute.For<ILogger<AuditablePhilHealthProxyClient>>();
        var client = new AuditablePhilHealthProxyClient(
            inner, _auditQueue, _clinicContext, _redactionService, _httpContextAccessor, logger);

        _auditQueue.TryEnqueue(Arg.Any<AuditLogMessage>()).Returns(true);

        // Act
        var result = await client.ValidatePinAsync("12-000000000-0", CancellationToken.None);

        // Assert
        result.Succeeded.Should().BeFalse();

        _auditQueue.Received(1).TryEnqueue(Arg.Is<AuditLogMessage>(msg =>
            msg.Action == PhilHealthAuditEvents.PinVerified &&
            msg.Category == ClinicAuditCategories.PhilHealth &&
            msg.Severity == ClinicAuditSeverities.Urgent &&
            msg.Outcome == "Warning" &&
            msg.Description.Contains("failed format check")));
    }

    [Fact]
    public async Task DownloadBatchMasterlist_EnqueuesYakapMasterlistSynced_WithTotalRecords()
    {
        // Arrange
        var inner = Substitute.For<IPhilHealthProxyClient>();
        var pcapiInner = Substitute.For<IYakapPcapiClient>();
        pcapiInner.DownloadBatchMasterlistAsync(Arg.Any<MasterlistBatchRequest>(), Arg.Any<CancellationToken>())
            .Returns(ApiResponse<MasterlistDownloadResponse>.Success(new MasterlistDownloadResponse(
                AccreNo: "H00099214",
                TransmittalNo: "RH000992142026011500001",
                EffYear: "2026",
                StartDate: "01/01/2026",
                EndDate: "01/07/2026",
                TotalRecords: 150,
                Assignments: new List<MasterlistAssignmentItem>())));

        var logger = Substitute.For<ILogger<AuditablePhilHealthProxyClient>>();
        var client = new AuditablePhilHealthProxyClient(
            inner, _auditQueue, _clinicContext, _redactionService, _httpContextAccessor, logger, pcapiInner);

        _auditQueue.TryEnqueue(Arg.Any<AuditLogMessage>()).Returns(true);

        var request = new MasterlistBatchRequest("01/01/2026", "01/07/2026", Consent: true);

        // Act
        var result = await client.DownloadBatchMasterlistAsync(request, CancellationToken.None);

        // Assert
        result.Succeeded.Should().BeTrue();
        result.Data!.TotalRecords.Should().Be(150);

        _auditQueue.Received(1).TryEnqueue(Arg.Is<AuditLogMessage>(msg =>
            msg.Action == PhilHealthAuditEvents.MasterlistSynced &&
            msg.Category == ClinicAuditCategories.PhilHealth &&
            msg.Severity == ClinicAuditSeverities.Routine &&
            msg.Outcome == "Success" &&
            msg.Description.Contains("150 members") &&
            msg.MetadataJson.Contains("RH000992142026011500001")));
    }

    [Fact]
    public async Task ValidateStanding_MasksPin_AndEnqueuesStandingValidated()
    {
        // Arrange
        var inner = Substitute.For<IPhilHealthProxyClient>();
        var pcapiInner = Substitute.For<IYakapPcapiClient>();
        const string rawPin = "12-345678901-2";

        pcapiInner.ValidateStandingAsync(Arg.Any<YakapValidateStandingRequest>(), Arg.Any<CancellationToken>())
            .Returns(ApiResponse<YakapValidatorResponse>.Success(new YakapValidatorResponse(
                PatientPin: "123456789012",
                PatientLname: "DELA CRUZ",
                PatientFname: "JUAN",
                PatientMname: null,
                PatientExtname: null,
                Pcu: new PcuStatusInfo("VERIFIED", "PCU-001"),
                Selection: new SelectionStatusInfo("ASSIGNED", "KH000992142026011500001", "2026-01-15"),
                Empanelment: new EmpanelmentStatusInfo("N"),
                Fpe: new FpeStatusInfo("N"),
                Consultation: null)));

        var logger = Substitute.For<ILogger<AuditablePhilHealthProxyClient>>();
        var client = new AuditablePhilHealthProxyClient(
            inner, _auditQueue, _clinicContext, _redactionService, _httpContextAccessor, logger, pcapiInner);

        _auditQueue.TryEnqueue(Arg.Any<AuditLogMessage>()).Returns(true);

        // Act
        var result = await client.ValidateStandingAsync(
            new YakapValidateStandingRequest(rawPin, "2026", Consent: true),
            CancellationToken.None);

        // Assert
        result.Succeeded.Should().BeTrue();
        _auditQueue.Received(1).TryEnqueue(Arg.Is<AuditLogMessage>(msg =>
            msg.Action == PhilHealthAuditEvents.StandingValidated &&
            msg.Category == ClinicAuditCategories.PhilHealth &&
            msg.Outcome == "Success" &&
            !msg.Description.Contains("12345678901") &&
            !msg.MetadataJson.Contains("12345678901")));
    }

    [Fact]
    public async Task UploadPlainJsonAsync_FpeFailure_EnqueuesUrgentFailureAudit()
    {
        // Arrange
        var inner = Substitute.For<IPhilHealthProxyClient>();
        var pcapiInner = Substitute.For<IYakapPcapiClient>();

        pcapiInner.UploadPlainJsonAsync("fpe", Arg.Any<string>(), Arg.Any<CancellationToken>())
            .Returns(ApiResponse<DataUploadResponse>.Fail("Mandatory field missing in health screening record."));

        var logger = Substitute.For<ILogger<AuditablePhilHealthProxyClient>>();
        var client = new AuditablePhilHealthProxyClient(
            inner, _auditQueue, _clinicContext, _redactionService, _httpContextAccessor, logger, pcapiInner);

        _auditQueue.TryEnqueue(Arg.Any<AuditLogMessage>()).Returns(true);

        // Act
        var result = await client.UploadPlainJsonAsync("fpe", "{\"pPatientPin\":\"123456789012\"}", CancellationToken.None);

        // Assert
        result.Succeeded.Should().BeFalse();

        _auditQueue.Received(1).TryEnqueue(Arg.Is<AuditLogMessage>(msg =>
            msg.Action == PhilHealthAuditEvents.FpeUploaded &&
            msg.Category == ClinicAuditCategories.PhilHealth &&
            msg.Severity == ClinicAuditSeverities.Urgent &&
            msg.Outcome == "Failure" &&
            msg.Description.Contains("Mandatory field missing")));
    }

    [Fact]
    public async Task UploadPlainJsonAsync_FpeSuccess_EnqueuesFpeUploadedWithUploadTransactionNo()
    {
        // Arrange
        var inner = Substitute.For<IPhilHealthProxyClient>();
        var pcapiInner = Substitute.For<IYakapPcapiClient>();
        pcapiInner.UploadPlainJsonAsync("fpe", Arg.Any<string>(), Arg.Any<CancellationToken>())
            .Returns(ApiResponse<DataUploadResponse>.Success(new DataUploadResponse(
                UploadTransactionNo: "UH000992142026032000001",
                Form: "fpe",
                ProcessingStatus: "on_queue",
                CaseNo: "CH000992142026032000001",
                ReceivedAt: DateTime.UtcNow)));

        var logger = Substitute.For<ILogger<AuditablePhilHealthProxyClient>>();
        var client = new AuditablePhilHealthProxyClient(
            inner, _auditQueue, _clinicContext, _redactionService, _httpContextAccessor, logger, pcapiInner);

        _auditQueue.TryEnqueue(Arg.Any<AuditLogMessage>()).Returns(true);

        // Act
        var result = await client.UploadPlainJsonAsync("fpe", "{\"pPatientPin\":\"123456789012\"}", CancellationToken.None);

        // Assert
        result.Succeeded.Should().BeTrue();

        _auditQueue.Received(1).TryEnqueue(Arg.Is<AuditLogMessage>(msg =>
            msg.Action == PhilHealthAuditEvents.FpeUploaded &&
            msg.Category == ClinicAuditCategories.PhilHealth &&
            msg.Severity == ClinicAuditSeverities.Routine &&
            msg.Outcome == "Success" &&
            msg.TargetEntityId == "UH000992142026032000001" &&
            msg.Description.Contains("UH000992142026032000001")));
    }

    [Fact]
    public async Task AssignPatientJourneyNumbers_EnqueuesEkasCreatedWithJourneyNumbers()
    {
        // Arrange
        var inner = Substitute.For<IPhilHealthSequenceGenerator>();
        var patientId = Guid.NewGuid();
        var encounterId = Guid.NewGuid();

        var journeyNumbers = new PhilHealthPatientJourneyNumbers(
            CaseNumber: "CH000992142026032000001",
            ProfilingTransactionNumber: "PH000992142026032000001",
            SoapTransactionNumber: "SH000992142026032000001");

        inner.AssignPatientJourneyNumbersAsync(
            Arg.Any<string>(), Arg.Any<Guid>(), Arg.Any<Guid>(), Arg.Any<Guid?>(), Arg.Any<string>(), Arg.Any<string>(), Arg.Any<CancellationToken>())
            .Returns(journeyNumbers);

        var logger = Substitute.For<ILogger<AuditablePhilHealthSequenceGenerator>>();
        var generator = new AuditablePhilHealthSequenceGenerator(
            inner, _auditQueue, _clinicContext, _httpContextAccessor, logger);

        _auditQueue.TryEnqueue(Arg.Any<AuditLogMessage>()).Returns(true);

        // Act
        var result = await generator.AssignPatientJourneyNumbersAsync(
            _tenantId, _clinicId, patientId, encounterId, "H00099214", "2026", CancellationToken.None);

        // Assert
        result.CaseNumber.Should().Be("CH000992142026032000001");

        _auditQueue.Received(1).TryEnqueue(Arg.Is<AuditLogMessage>(msg =>
            msg.Action == PhilHealthAuditEvents.EkasCreated &&
            msg.Category == ClinicAuditCategories.PhilHealth &&
            msg.Severity == ClinicAuditSeverities.Routine &&
            msg.Outcome == "Success" &&
            msg.PatientId == patientId &&
            msg.MetadataJson.Contains("CH000992142026032000001") &&
            msg.MetadataJson.Contains("PH000992142026032000001")));
    }

    [Fact]
    public async Task PharmacyGateway_Dispense_EnqueuesGamotDispensed()
    {
        // Arrange
        var inner = Substitute.For<IPharmacyGamotGateway>();
        var dispenseJson = JsonSerializer.Serialize(new
        {
            pin = "12-345678901-2",
            philHealthDrugCode = "AMOX-500MG-CAP",
            quantity = 21
        });

        inner.SendAsync("POST", "dispense", "", dispenseJson, Arg.Any<CancellationToken>())
            .Returns(new GamotGatewayResult(200, "application/json", "{\"transactionId\":\"GAMOT-TXN-001\"}"));

        var logger = Substitute.For<ILogger<AuditablePharmacyGamotGateway>>();
        var gateway = new AuditablePharmacyGamotGateway(
            inner, _auditQueue, _clinicContext, _redactionService, _httpContextAccessor, logger);

        _auditQueue.TryEnqueue(Arg.Any<AuditLogMessage>()).Returns(true);

        // Act
        var result = await gateway.SendAsync("POST", "dispense", "", dispenseJson, CancellationToken.None);

        // Assert
        result.StatusCode.Should().Be(200);

        _auditQueue.Received(1).TryEnqueue(Arg.Is<AuditLogMessage>(msg =>
            msg.Action == PhilHealthAuditEvents.GamotDispensed &&
            msg.Category == ClinicAuditCategories.PhilHealth &&
            msg.Severity == ClinicAuditSeverities.Routine &&
            msg.Outcome == "Success" &&
            msg.TargetEntityId == "GAMOT-TXN-001" &&
            msg.Description.Contains("AMOX-500MG-CAP")));
    }

    [Fact]
    public async Task PharmacyGateway_Reverse_EnqueuesClaimVoided()
    {
        // Arrange
        var inner = Substitute.For<IPharmacyGamotGateway>();
        var reverseJson = JsonSerializer.Serialize(new
        {
            reason = "Patient allergic reaction adverse event"
        });

        inner.SendAsync("POST", "dispense/reverse/123", "", reverseJson, Arg.Any<CancellationToken>())
            .Returns(new GamotGatewayResult(200, "application/json", "{\"status\":\"reversed\"}"));

        var logger = Substitute.For<ILogger<AuditablePharmacyGamotGateway>>();
        var gateway = new AuditablePharmacyGamotGateway(
            inner, _auditQueue, _clinicContext, _redactionService, _httpContextAccessor, logger);

        _auditQueue.TryEnqueue(Arg.Any<AuditLogMessage>()).Returns(true);

        // Act
        var result = await gateway.SendAsync("POST", "dispense/reverse/123", "", reverseJson, CancellationToken.None);

        // Assert
        result.StatusCode.Should().Be(200);

        _auditQueue.Received(1).TryEnqueue(Arg.Is<AuditLogMessage>(msg =>
            msg.Action == PhilHealthAuditEvents.ClaimVoided &&
            msg.Category == ClinicAuditCategories.PhilHealth &&
            msg.Severity == ClinicAuditSeverities.Emergency &&
            msg.Outcome == "Success" &&
            msg.Description.Contains("Patient allergic reaction adverse event")));
    }
}
