using System;
using System.Collections.Concurrent;
using System.Collections.Generic;
using System.Linq;
using System.Net;
using System.Net.Http;
using System.Text;
using System.Threading;
using System.Threading.Tasks;
using ClinicEz.PhilHealthProxy.Domain.Interfaces;
using ClinicEz.PhilHealthProxy.Domain.Models;
using FluentValidation;
using Microsoft.Extensions.Logging;

namespace ClinicEz.PhilHealthProxy.Infrastructure.Services;

public sealed class PcapiSandboxService : IPcapiSandboxService
{
    private readonly IPhilHealthPayloadEncryptor _encryptor;
    private readonly ILogger<PcapiSandboxService> _logger;

    private volatile PcapiFaultScenario _scenario = PcapiFaultScenario.HappyPath;

    private long _selectionSeries = 1000;
    private long _uploadSeries = 2000;
    private long _empanelSeries = 500;
    private long _pcuSeries = 100;

    private record SandboxBeneficiary(
        string Pin,
        string LastName,
        string FirstName,
        string? MiddleName,
        string? ExtName,
        string BirthDate,
        string Sex);

    private sealed class SandboxSelection
    {
        public required string PatientPin { get; init; }
        public required string AccreNo { get; init; }
        public required string TransactionNo { get; init; }
        public required string Date { get; init; }
        public string Status { get; set; } = "ASSIGNED";
    }

    private sealed class SandboxEmpanelment
    {
        public required string YesReferenceNo { get; init; }
        public required string PatientPin { get; init; }
        public required string AccreNo { get; init; }
        public required string EffYear { get; init; }
        public string? FpeTransactionNo { get; init; }
        public string? PcuTransactionCode { get; init; }
    }

    private sealed class SandboxUpload
    {
        public required string UploadTransactionNo { get; init; }
        public required string Form { get; init; }
        public required string AccreNo { get; init; }
        public string ProcessingStatus { get; set; } = "queued";
        public DateTime ReceivedAt { get; init; } = DateTime.UtcNow;
        public DateTime? ProcessedAt { get; set; }
        public int PollCount { get; set; }
        public List<DataUploadFieldError>? Errors { get; set; }
    }

    private sealed class SandboxPcuSession
    {
        public required string LivenessAuthorizationId { get; init; }
        public required string Pin { get; init; }
        public required string TransNo { get; init; }
        public bool PinMatched { get; init; } = true;
        public string Status { get; init; } = "VERIFIED";
    }

    private readonly ConcurrentDictionary<string, SandboxBeneficiary> _beneficiaries = new();
    private readonly ConcurrentDictionary<string, SandboxSelection> _selections = new();
    private readonly ConcurrentDictionary<string, SandboxEmpanelment> _empanelments = new();
    private readonly ConcurrentDictionary<string, SandboxUpload> _uploads = new();
    private readonly ConcurrentDictionary<string, SandboxPcuSession> _pcuSessions = new();

    public PcapiSandboxService(
        IPhilHealthPayloadEncryptor encryptor,
        ILogger<PcapiSandboxService> logger)
    {
        _encryptor = encryptor;
        _logger = logger;
        SeedDefaults();
    }

    private void SeedDefaults()
    {
        _beneficiaries.TryAdd("123456789012", new SandboxBeneficiary(
            "123456789012", "DELA CRUZ", "JUAN", "SANTOS", "", "01/15/1990", "M"));
        _beneficiaries.TryAdd("987654321098", new SandboxBeneficiary(
            "987654321098", "SANTOS", "MARIA", "CLARA", "", "05/20/1985", "F"));
        _beneficiaries.TryAdd("112233445566", new SandboxBeneficiary(
            "112233445566", "REYES", "PEDRO", "PENDUKO", "JR", "11/30/1992", "M"));
    }

    private void CheckFaultScenario()
    {
        switch (_scenario)
        {
            case PcapiFaultScenario.AuthFailed:
                throw new UnauthorizedAccessException("401 invalid_credentials: PCAPI authentication failed");
            case PcapiFaultScenario.RateLimited:
                throw new HttpRequestException("429 rate_limit_exceeded: Too many requests to PhilHealth PCAPI", null, HttpStatusCode.TooManyRequests);
            case PcapiFaultScenario.ValidationError:
                throw new ValidationException("422 validation_error: Payload failed PhilHealth validation");
            case PcapiFaultScenario.ServerError:
                throw new HttpRequestException("500 internal_server_error: PhilHealth gateway encountered an internal error", null, HttpStatusCode.InternalServerError);
            case PcapiFaultScenario.Timeout:
                throw new TimeoutException("PCAPI gateway operation timed out");
            default:
                break;
        }
    }

    public Task<PcuStartResponse> StartPcuAsync(PcuStartRequest req, string accreNo, CancellationToken ct = default)
    {
        CheckFaultScenario();

        var authId = Guid.NewGuid().ToString("N");
        var transNo = $"PCU{Interlocked.Increment(ref _pcuSeries):D7}";

        _pcuSessions[authId] = new SandboxPcuSession
        {
            LivenessAuthorizationId = authId,
            Pin = req.Pin,
            TransNo = transNo,
            PinMatched = true,
            Status = "VERIFIED"
        };

        var sdkUrl = $"https://pcapi-pcu.philhealth.gov.ph/sdk?auth={authId}";
        return Task.FromResult(new PcuStartResponse(sdkUrl, authId, "PENDING", 900));
    }

    public Task<PcuVerifyResponse> VerifyPcuAsync(PcuVerifyRequest req, string accreNo, CancellationToken ct = default)
    {
        CheckFaultScenario();

        if (_pcuSessions.TryGetValue(req.LivenessAuthorizationId, out var session))
        {
            return Task.FromResult(new PcuVerifyResponse(session.TransNo, session.PinMatched, session.Status, session.Pin));
        }

        var fallbackTransNo = $"PCU{Interlocked.Increment(ref _pcuSeries):D7}";
        return Task.FromResult(new PcuVerifyResponse(fallbackTransNo, true, "VERIFIED", "123456789012"));
    }

    public Task<YakapValidatorResponse> ValidateStandingAsync(YakapValidateStandingRequest req, string accreNo, CancellationToken ct = default)
    {
        CheckFaultScenario();

        if (_scenario == PcapiFaultScenario.BeneficiaryNotFound)
        {
            throw new KeyNotFoundException($"Beneficiary with PIN '{req.PatientPin}' not found in PhilHealth registry.");
        }

        if (!req.Consent && _scenario == PcapiFaultScenario.ConsentRequired)
        {
            throw new InvalidOperationException("403 consent_required: Patient consent is required to query PhilHealth standing.");
        }

        _beneficiaries.TryGetValue(req.PatientPin, out var beneficiary);
        var lastName = beneficiary?.LastName ?? "DELA CRUZ";
        var firstName = beneficiary?.FirstName ?? "JUAN";
        var middleName = beneficiary?.MiddleName ?? "SANTOS";
        var extName = beneficiary?.ExtName ?? "";

        var selection = _selections.GetOrAdd(req.PatientPin, pin => new SandboxSelection
        {
            PatientPin = pin,
            AccreNo = accreNo,
            TransactionNo = $"K{accreNo}{DateTime.UtcNow:yyyyMMdd}{Interlocked.Increment(ref _selectionSeries):D5}",
            Date = DateTime.UtcNow.ToString("MM/dd/yyyy"),
            Status = "ASSIGNED"
        });

        _empanelments.TryGetValue(req.PatientPin, out var empanelment);

        var response = new YakapValidatorResponse(
            req.PatientPin,
            lastName,
            firstName,
            middleName,
            extName,
            new PcuStatusInfo("VERIFIED", $"PCU{Interlocked.Increment(ref _pcuSeries):D7}"),
            new SelectionStatusInfo(selection.Status, selection.TransactionNo, selection.Date),
            new EmpanelmentStatusInfo(empanelment != null ? "Y" : "N", empanelment?.YesReferenceNo),
            new FpeStatusInfo("Y", $"P{accreNo}{DateTime.UtcNow:yyyyMMdd}0001", $"U{accreNo}{DateTime.UtcNow:yyyyMMdd}0001"),
            new ConsultationStatusInfo("Y", $"S{accreNo}{DateTime.UtcNow:yyyyMMdd}0001", $"U{accreNo}{DateTime.UtcNow:yyyyMMdd}0002")
        );

        return Task.FromResult(response);
    }

    public Task<YakapEmpanelmentResponse> SubmitEmpanelmentAsync(YakapEmpanelmentRequest req, string accreNo, CancellationToken ct = default)
    {
        CheckFaultScenario();

        if (!req.Consent && _scenario == PcapiFaultScenario.ConsentRequired)
        {
            throw new InvalidOperationException("403 consent_required: Patient consent required for empanelment.");
        }

        var prefix = accreNo.Length >= 4 ? accreNo[..4] : "9999";
        var yesRefNo = $"MCA{prefix}{Interlocked.Increment(ref _empanelSeries):D3}";
        var effYear = DateTime.UtcNow.Year.ToString();

        var empanelment = new SandboxEmpanelment
        {
            YesReferenceNo = yesRefNo,
            PatientPin = req.PatientPin,
            AccreNo = accreNo,
            EffYear = effYear,
            FpeTransactionNo = $"P{accreNo}{DateTime.UtcNow:yyyyMMdd}0001",
            PcuTransactionCode = req.PcuTransactionCode
        };

        _empanelments[req.PatientPin] = empanelment;

        return Task.FromResult(new YakapEmpanelmentResponse(
            yesRefNo,
            req.PatientPin,
            accreNo,
            effYear,
            WithYes: true,
            WithFpe: true,
            empanelment.FpeTransactionNo,
            req.PcuTransactionCode));
    }

    public Task<YakapSelectionResponse> SubmitSelectionAsync(YakapSelectionRequest req, string accreNo, CancellationToken ct = default)
    {
        CheckFaultScenario();

        if (!req.Consent && _scenario == PcapiFaultScenario.ConsentRequired)
        {
            throw new InvalidOperationException("403 consent_required: Patient consent required for selection.");
        }

        var txNo = $"K{accreNo}{DateTime.UtcNow:yyyyMMdd}{Interlocked.Increment(ref _selectionSeries):D5}";
        var selection = new SandboxSelection
        {
            PatientPin = req.PatientPin,
            AccreNo = accreNo,
            TransactionNo = txNo,
            Date = req.SelectionDate,
            Status = "ASSIGNED"
        };

        _selections[req.PatientPin] = selection;

        return Task.FromResult(new YakapSelectionResponse(
            req.PatientPin,
            accreNo,
            new SelectionDetails("ASSIGNED", txNo, req.SelectionDate)));
    }

    public Task<MasterlistDownloadResponse> DownloadIndividualMasterlistAsync(MasterlistIndividualRequest req, string accreNo, CancellationToken ct = default)
    {
        CheckFaultScenario();

        _beneficiaries.TryGetValue(req.PatientPin, out var b);
        var item = new MasterlistAssignmentItem(
            req.PatientPin,
            b?.LastName ?? "DELA CRUZ",
            b?.FirstName ?? "JUAN",
            b?.MiddleName ?? "SANTOS",
            b?.ExtName ?? "",
            b?.BirthDate ?? "01/15/1990",
            b?.Sex ?? "M",
            DateTime.UtcNow.ToString("MM/dd/yyyy"),
            "ASSIGNED");

        var response = new MasterlistDownloadResponse(
            accreNo,
            $"TRANS-{DateTime.UtcNow:yyyyMMdd}-{Interlocked.Increment(ref _uploadSeries):D4}",
            req.EffYear,
            null,
            null,
            1,
            new[] { item });

        return Task.FromResult(response);
    }

    public Task<MasterlistDownloadResponse> DownloadBatchMasterlistAsync(MasterlistBatchRequest req, string accreNo, CancellationToken ct = default)
    {
        CheckFaultScenario();

        var items = _beneficiaries.Values.Select(b => new MasterlistAssignmentItem(
            b.Pin,
            b.LastName,
            b.FirstName,
            b.MiddleName,
            b.ExtName,
            b.BirthDate,
            b.Sex,
            DateTime.UtcNow.ToString("MM/dd/yyyy"),
            "ASSIGNED")).ToList();

        var response = new MasterlistDownloadResponse(
            accreNo,
            $"BATCH-{DateTime.UtcNow:yyyyMMdd}-{Interlocked.Increment(ref _uploadSeries):D4}",
            DateTime.UtcNow.Year.ToString(),
            req.StartDate,
            req.EndDate,
            items.Count,
            items);

        return Task.FromResult(response);
    }

    public Task<DataUploadResponse> UploadDataAsync(
        string form,
        PhilHealthEncryptedPayload envelope,
        string accreNo,
        string cipherKey,
        CancellationToken ct = default)
    {
        CheckFaultScenario();

        var uploadTxNo = $"U{accreNo}{DateTime.UtcNow:yyyyMMdd}{Interlocked.Increment(ref _uploadSeries):D5}";

        var upload = new SandboxUpload
        {
            UploadTransactionNo = uploadTxNo,
            Form = form,
            AccreNo = accreNo,
            ProcessingStatus = "queued",
            ReceivedAt = DateTime.UtcNow,
            PollCount = 0
        };

        _uploads[uploadTxNo] = upload;

        return Task.FromResult(new DataUploadResponse(
            uploadTxNo,
            form,
            "queued",
            $"CASE-{uploadTxNo[..Math.Min(10, uploadTxNo.Length)]}",
            upload.ReceivedAt));
    }

    public Task<DataUploadStatusResponse> GetUploadStatusAsync(string uploadTxNo, string accreNo, CancellationToken ct = default)
    {
        CheckFaultScenario();

        if (!_uploads.TryGetValue(uploadTxNo, out var upload))
        {
            upload = new SandboxUpload
            {
                UploadTransactionNo = uploadTxNo,
                Form = "fpe",
                AccreNo = accreNo,
                ProcessingStatus = "queued",
                ReceivedAt = DateTime.UtcNow,
                PollCount = 0
            };
            _uploads[uploadTxNo] = upload;
        }

        upload.PollCount++;

        if (upload.PollCount == 1)
        {
            upload.ProcessingStatus = "processing";
        }
        else
        {
            if (_scenario == PcapiFaultScenario.UploadRejected)
            {
                upload.ProcessingStatus = "rejected";
                upload.Errors = new List<DataUploadFieldError>
                {
                    new("data.encounter", "Encounter validation failed statutory rules.")
                };
            }
            else if (_scenario == PcapiFaultScenario.StuckProcessing)
            {
                upload.ProcessingStatus = "processing";
            }
            else
            {
                upload.ProcessingStatus = "completed";
                upload.ProcessedAt = DateTime.UtcNow;
            }
        }

        var response = new DataUploadStatusResponse(
            upload.UploadTransactionNo,
            upload.Form,
            upload.ProcessingStatus,
            upload.ReceivedAt,
            upload.ProcessedAt,
            new[] { $"REC-{upload.UploadTransactionNo[..Math.Min(12, upload.UploadTransactionNo.Length)]}" },
            upload.Errors);

        return Task.FromResult(response);
    }

    public Task<VerificationCodeResponse> ValidateVerificationCodeAsync(VerificationCodeRequest req, string accreNo, CancellationToken ct = default)
    {
        CheckFaultScenario();

        return Task.FromResult(new VerificationCodeResponse(
            req.PatientPin,
            accreNo,
            req.TransactionDate,
            "VALID"));
    }

    public Task<PhilHealthEncryptedPayload> GenerateAvailmentSlipAsync(
        AvailmentSlipRequest req,
        string accreNo,
        string cipherKey,
        CancellationToken ct = default)
    {
        CheckFaultScenario();

        var pdfContent = $"%PDF-1.4\n1 0 obj\n<< /Title (ClinicEZ Electronic Konsulta Availment Slip) /Author (PhilHealth) /Pin ({req.PatientPin}) /Year ({req.EffYear}) /Accre ({accreNo}) >>\nendobj\nxref\n0 1\n0000000000 65535 f\ntrailer\n<< /Root 1 0 R >>\n%%EOF\n";
        byte[] pdfBytes = Encoding.ASCII.GetBytes(pdfContent);

        var encryptedEnvelope = _encryptor.EncryptBytes(pdfBytes, "application/pdf", cipherKey);
        return Task.FromResult(encryptedEnvelope);
    }

    public SandboxStatus GetStatus()
    {
        return new SandboxStatus(
            _scenario.ToString(),
            _beneficiaries.Count,
            _selections.Count,
            _empanelments.Count,
            _uploads.Count,
            _pcuSessions.Count);
    }

    public void SetScenario(PcapiFaultScenario scenario)
    {
        _scenario = scenario;
        _logger.LogInformation("[PcapiSandbox] Fault scenario set to {Scenario}", scenario);
    }

    public void Reset()
    {
        _scenario = PcapiFaultScenario.HappyPath;
        _selections.Clear();
        _empanelments.Clear();
        _uploads.Clear();
        _pcuSessions.Clear();
        _beneficiaries.Clear();
        SeedDefaults();
        _logger.LogInformation("[PcapiSandbox] State reset to initial defaults");
    }
}
