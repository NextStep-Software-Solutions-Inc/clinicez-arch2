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
            msg.Description.Contains("successfully verified")));
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
            msg.Description.Contains("verification failed")));
    }

    [Fact]
    public async Task ExtractMasterlist_EnqueuesYakapMasterlistSynced_WithSanitizedSecrets()
    {
        // Arrange
        var inner = Substitute.For<IPhilHealthProxyClient>();
        inner.ExtractMasterlistAsync(Arg.Any<ExtractMasterlistProxyRequest>(), Arg.Any<CancellationToken>())
            .Returns(ApiResponse<YakapMasterlistProxyResponse>.Success(new YakapMasterlistProxyResponse(
                IsSuccess: true,
                AccreditationNumber: "H99214",
                EffectiveYear: "2026",
                TotalCount: 150,
                Beneficiaries: new List<YakapBeneficiaryDto>(),
                RawXml: "<xml></xml>",
                ErrorMessage: null)));

        var logger = Substitute.For<ILogger<AuditablePhilHealthProxyClient>>();
        var client = new AuditablePhilHealthProxyClient(
            inner, _auditQueue, _clinicContext, _redactionService, _httpContextAccessor, logger);

        _auditQueue.TryEnqueue(Arg.Any<AuditLogMessage>()).Returns(true);

        var request = new ExtractMasterlistProxyRequest
        {
            AccreditationNumber = "H99214",
            EffectiveYear = "2026",
            Password = "SuperSecretPassword123!",
            CipherKey = "AESKeySecret456!",
            SoftwareCertificationId = "CERT-999"
        };

        // Act
        var result = await client.ExtractMasterlistAsync(request, CancellationToken.None);

        // Assert
        result.Succeeded.Should().BeTrue();
        result.Data!.TotalCount.Should().Be(150);

        _auditQueue.Received(1).TryEnqueue(Arg.Is<AuditLogMessage>(msg =>
            msg.Action == PhilHealthAuditEvents.MasterlistSynced &&
            msg.Category == ClinicAuditCategories.PhilHealth &&
            msg.Severity == ClinicAuditSeverities.Routine &&
            msg.Outcome == "Success" &&
            msg.Description.Contains("150 beneficiaries loaded") &&
            !msg.MetadataJson.Contains("SuperSecretPassword123!") &&
            !msg.MetadataJson.Contains("AESKeySecret456!") &&
            msg.MetadataJson.Contains("H99214")));
    }

    [Fact]
    public async Task ValidateReport_ValidXml_EnqueuesTransmittalGeneratedAndEncrypted()
    {
        // Arrange
        var inner = Substitute.For<IPhilHealthProxyClient>();
        var sampleXml = "<KONSULTADATA pSoftwareCertId=\"CERT-1\"></KONSULTADATA>";
        var sampleEncrypted = "YWVzLTI1Ni1lbmNyeXB0ZWQtYnl0ZXMtZHVtbXktcGF5bG9hZA==";

        inner.ValidateReportAsync(Arg.Any<GenerateAndValidateReportProxyRequest>(), Arg.Any<CancellationToken>())
            .Returns(ApiResponse<YakapValidationProxyResponse>.Success(new YakapValidationProxyResponse(
                IsValid: true,
                TransmittalNumber: "RHCI09214202600001",
                RawXml: sampleXml,
                EncryptedPayload: sampleEncrypted,
                PhilHealthSoapResponse: null,
                ValidationErrors: null)));

        var logger = Substitute.For<ILogger<AuditablePhilHealthProxyClient>>();
        var client = new AuditablePhilHealthProxyClient(
            inner, _auditQueue, _clinicContext, _redactionService, _httpContextAccessor, logger);

        _auditQueue.TryEnqueue(Arg.Any<AuditLogMessage>()).Returns(true);

        var request = new GenerateAndValidateReportProxyRequest
        {
            ReportTagging = "1",
            Document = new YakapReportDocumentDto(
                Username: "HCI001",
                Password: "Password",
                HciAccreNo: "H99214",
                PmccNo: "PMCC01",
                CertificationId: "CERT-1",
                HciTransmittalNumber: "RHCI09214202600001",
                Enlistments: new List<YakapEnlistmentDto>(),
                Profiles: new List<YakapProfileDto>(),
                Soaps: new List<YakapSoapDto>(),
                DiagnosticResults: new List<YakapDiagnosticResultDto>(),
                Medicines: new List<YakapMedicineDto>())
        };

        // Act
        var result = await client.ValidateReportAsync(request, CancellationToken.None);

        // Assert
        result.Succeeded.Should().BeTrue();

        // 1. yakap.transmittal.generated
        _auditQueue.Received(1).TryEnqueue(Arg.Is<AuditLogMessage>(msg =>
            msg.Action == PhilHealthAuditEvents.TransmittalGenerated &&
            msg.Category == ClinicAuditCategories.PhilHealth &&
            msg.Outcome == "Success" &&
            msg.MetadataJson.Contains("KonsultaData_v1.14.dtd")));

        // 2. yakap.transmittal.encrypted
        _auditQueue.Received(1).TryEnqueue(Arg.Is<AuditLogMessage>(msg =>
            msg.Action == PhilHealthAuditEvents.TransmittalEncrypted &&
            msg.Category == ClinicAuditCategories.PhilHealth &&
            msg.Outcome == "Success" &&
            msg.MetadataJson.Contains("AES-256-CBC")));
    }

    [Fact]
    public async Task ValidateReport_InvalidXml_EnqueuesClaimRejectedWithDeficiencies()
    {
        // Arrange
        var inner = Substitute.For<IPhilHealthProxyClient>();
        var errors = new List<string> { "Element 'SOAP' missing mandatory attribute 'pSoapTransNo'." };

        inner.ValidateReportAsync(Arg.Any<GenerateAndValidateReportProxyRequest>(), Arg.Any<CancellationToken>())
            .Returns(ApiResponse<YakapValidationProxyResponse>.Success(new YakapValidationProxyResponse(
                IsValid: false,
                TransmittalNumber: "RHCI09214202600001",
                RawXml: "<xml></xml>",
                EncryptedPayload: null,
                PhilHealthSoapResponse: null,
                ValidationErrors: errors)));

        var logger = Substitute.For<ILogger<AuditablePhilHealthProxyClient>>();
        var client = new AuditablePhilHealthProxyClient(
            inner, _auditQueue, _clinicContext, _redactionService, _httpContextAccessor, logger);

        _auditQueue.TryEnqueue(Arg.Any<AuditLogMessage>()).Returns(true);

        var request = new GenerateAndValidateReportProxyRequest
        {
            ReportTagging = "1",
            Document = new YakapReportDocumentDto(
                Username: "HCI001",
                Password: "Password",
                HciAccreNo: "H99214",
                PmccNo: "PMCC01",
                CertificationId: "CERT-1",
                HciTransmittalNumber: "RHCI09214202600001",
                Enlistments: new List<YakapEnlistmentDto>(),
                Profiles: new List<YakapProfileDto>(),
                Soaps: new List<YakapSoapDto>(),
                DiagnosticResults: new List<YakapDiagnosticResultDto>(),
                Medicines: new List<YakapMedicineDto>())
        };

        // Act
        var result = await client.ValidateReportAsync(request, CancellationToken.None);

        // Assert
        result.Data!.IsValid.Should().BeFalse();

        _auditQueue.Received(1).TryEnqueue(Arg.Is<AuditLogMessage>(msg =>
            msg.Action == PhilHealthAuditEvents.ClaimRejected &&
            msg.Category == ClinicAuditCategories.PhilHealth &&
            msg.Severity == ClinicAuditSeverities.Urgent &&
            msg.Outcome == "Failure" &&
            msg.Description.Contains("missing mandatory attribute")));
    }

    [Fact]
    public async Task SubmitReport_SoapSuccess_EnqueuesSoapSubmittedWithTransactionNumber()
    {
        // Arrange
        var inner = Substitute.For<IPhilHealthProxyClient>();
        inner.SubmitReportAsync(Arg.Any<GenerateAndSubmitReportProxyRequest>(), Arg.Any<CancellationToken>())
            .Returns(ApiResponse<YakapSubmissionProxyResponse>.Success(new YakapSubmissionProxyResponse(
                IsSuccess: true,
                TransmittalNumber: "RHCI09214202600001",
                TransactionNumber: "TXN-2026-99214-001",
                RawXml: "<xml></xml>",
                PhilHealthSoapResponse: "<response>OK</response>",
                ValidationErrors: null)));

        var logger = Substitute.For<ILogger<AuditablePhilHealthProxyClient>>();
        var client = new AuditablePhilHealthProxyClient(
            inner, _auditQueue, _clinicContext, _redactionService, _httpContextAccessor, logger);

        _auditQueue.TryEnqueue(Arg.Any<AuditLogMessage>()).Returns(true);

        var request = new GenerateAndSubmitReportProxyRequest
        {
            ReportTagging = "2",
            Document = new YakapReportDocumentDto(
                Username: "HCI001",
                Password: "Password",
                HciAccreNo: "H99214",
                PmccNo: "PMCC01",
                CertificationId: "CERT-1",
                HciTransmittalNumber: "RHCI09214202600001",
                Enlistments: new List<YakapEnlistmentDto>(),
                Profiles: new List<YakapProfileDto>(),
                Soaps: new List<YakapSoapDto>(),
                DiagnosticResults: new List<YakapDiagnosticResultDto>(),
                Medicines: new List<YakapMedicineDto>())
        };

        // Act
        var result = await client.SubmitReportAsync(request, CancellationToken.None);

        // Assert
        result.Succeeded.Should().BeTrue();

        _auditQueue.Received(1).TryEnqueue(Arg.Is<AuditLogMessage>(msg =>
            msg.Action == PhilHealthAuditEvents.SoapSubmitted &&
            msg.Category == ClinicAuditCategories.PhilHealth &&
            msg.Severity == ClinicAuditSeverities.Routine &&
            msg.Outcome == "Success" &&
            msg.TargetEntityId == "TXN-2026-99214-001" &&
            msg.Description.Contains("TXN-2026-99214-001")));
    }

    [Fact]
    public async Task AssignPatientJourneyNumbers_EnqueuesEkasCreatedWithJourneyNumbers()
    {
        // Arrange
        var inner = Substitute.For<IPhilHealthSequenceGenerator>();
        var patientId = Guid.NewGuid();
        var encounterId = Guid.NewGuid();

        var journeyNumbers = new PhilHealthPatientJourneyNumbers(
            CaseNumber: "C00921202600001",
            EnlistmentTransactionNumber: "E00921202600001",
            ProfilingTransactionNumber: "P00921202600001",
            SoapTransactionNumber: "S00921202600001");

        inner.AssignPatientJourneyNumbersAsync(
            Arg.Any<string>(), Arg.Any<Guid>(), Arg.Any<Guid>(), Arg.Any<Guid?>(), Arg.Any<string>(), Arg.Any<string>(), Arg.Any<CancellationToken>())
            .Returns(journeyNumbers);

        var logger = Substitute.For<ILogger<AuditablePhilHealthSequenceGenerator>>();
        var generator = new AuditablePhilHealthSequenceGenerator(
            inner, _auditQueue, _clinicContext, _httpContextAccessor, logger);

        _auditQueue.TryEnqueue(Arg.Any<AuditLogMessage>()).Returns(true);

        // Act
        var result = await generator.AssignPatientJourneyNumbersAsync(
            _tenantId, _clinicId, patientId, encounterId, "H99214", "2026", CancellationToken.None);

        // Assert
        result.CaseNumber.Should().Be("C00921202600001");

        _auditQueue.Received(1).TryEnqueue(Arg.Is<AuditLogMessage>(msg =>
            msg.Action == PhilHealthAuditEvents.EkasCreated &&
            msg.Category == ClinicAuditCategories.PhilHealth &&
            msg.Severity == ClinicAuditSeverities.Routine &&
            msg.Outcome == "Success" &&
            msg.PatientId == patientId &&
            msg.MetadataJson.Contains("C00921202600001") &&
            msg.MetadataJson.Contains("E00921202600001")));
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
