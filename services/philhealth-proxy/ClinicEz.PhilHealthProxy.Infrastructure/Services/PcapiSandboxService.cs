using System;
using System.Collections.Concurrent;
using System.Collections.Generic;
using System.Linq;
using System.Net;
using System.Net.Http;
using System.Text;
using System.Text.Json;
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
        public bool PinMatched { get; set; } = true;
        public string Status { get; set; } = "PENDING";
    }

    private sealed record SandboxUploadMarker(string TransactionNo, string UploadTransactionNo);

    private readonly ConcurrentDictionary<string, SandboxBeneficiary> _beneficiaries = new();
    private readonly ConcurrentDictionary<string, SandboxSelection> _selections = new();
    private readonly ConcurrentDictionary<string, SandboxEmpanelment> _empanelments = new();
    private readonly ConcurrentDictionary<string, SandboxUpload> _uploads = new();
    private readonly ConcurrentDictionary<string, SandboxPcuSession> _pcuSessions = new();
    private readonly ConcurrentDictionary<string, SandboxPcuSession> _verifiedPcuByPin = new();
    private readonly ConcurrentDictionary<string, SandboxUploadMarker> _fpeUploads = new();
    private readonly ConcurrentDictionary<string, SandboxUploadMarker> _consultations = new();

    private static string NormalizePin(string? pin)
    {
        if (string.IsNullOrWhiteSpace(pin)) return string.Empty;
        var digits = new string(pin.Where(char.IsDigit).ToArray());
        return digits.Length > 0 ? digits : pin.Trim();
    }

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

        // Pre-seed 987654321098 (Maria Clara Santos) as an already-assigned & empaneled YAKAP member,
        // while 123456789012 (Juan Dela Cruz), 112233445566 (Pedro Reyes), and unseen PINs start as NOT_ASSIGNED walk-ins.
        _selections.TryAdd("987654321098", new SandboxSelection
        {
            PatientPin = "987654321098",
            AccreNo = "H10000001",
            TransactionNo = $"KH10000001{DateTime.UtcNow:yyyyMMdd}00001",
            Date = DateTime.UtcNow.ToString("MM/dd/yyyy"),
            Status = "ASSIGNED"
        });
        _verifiedPcuByPin.TryAdd("987654321098", new SandboxPcuSession
        {
            LivenessAuthorizationId = "SEED-PCU-987654321098",
            Pin = "987654321098",
            TransNo = "PCU0000001",
            PinMatched = true,
            Status = "VERIFIED"
        });
        _empanelments.TryAdd("987654321098", new SandboxEmpanelment
        {
            YesReferenceNo = "MCAH100001",
            PatientPin = "987654321098",
            AccreNo = "H10000001",
            EffYear = DateTime.UtcNow.Year.ToString(),
            PcuTransactionCode = "PCU0000001"
        });
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

        var normalizedPin = NormalizePin(req.Pin);
        var authId = Guid.NewGuid().ToString("N");
        var transNo = $"PCU{Interlocked.Increment(ref _pcuSeries):D7}";

        _pcuSessions[authId] = new SandboxPcuSession
        {
            LivenessAuthorizationId = authId,
            Pin = normalizedPin,
            TransNo = transNo,
            PinMatched = true,
            Status = "PENDING"
        };

        var sdkUrl = $"https://pcapi-pcu.philhealth.gov.ph/sdk?auth={authId}";
        return Task.FromResult(new PcuStartResponse(sdkUrl, authId, "PENDING", 900));
    }

    public Task<PcuVerifyResponse> VerifyPcuAsync(PcuVerifyRequest req, string accreNo, CancellationToken ct = default)
    {
        CheckFaultScenario();

        if (_pcuSessions.TryGetValue(req.LivenessAuthorizationId, out var session))
        {
            session.Status = "VERIFIED";
            session.PinMatched = true;
            _verifiedPcuByPin[NormalizePin(session.Pin)] = session;
            return Task.FromResult(new PcuVerifyResponse(session.TransNo, session.PinMatched, session.Status, session.Pin));
        }

        var fallbackTransNo = $"PCU{Interlocked.Increment(ref _pcuSeries):D7}";
        var fallback = new SandboxPcuSession
        {
            LivenessAuthorizationId = req.LivenessAuthorizationId,
            Pin = "123456789012",
            TransNo = fallbackTransNo,
            PinMatched = true,
            Status = "VERIFIED"
        };
        _verifiedPcuByPin["123456789012"] = fallback;
        return Task.FromResult(new PcuVerifyResponse(fallbackTransNo, true, "VERIFIED", "123456789012"));
    }

    public Task<YakapValidatorResponse> ValidateStandingAsync(YakapValidateStandingRequest req, string accreNo, CancellationToken ct = default)
    {
        CheckFaultScenario();

        var normalizedPin = NormalizePin(req.PatientPin);

        if (_scenario == PcapiFaultScenario.BeneficiaryNotFound)
        {
            throw new KeyNotFoundException($"Beneficiary with PIN '{req.PatientPin}' not found in PhilHealth registry.");
        }

        if (!req.Consent && _scenario == PcapiFaultScenario.ConsentRequired)
        {
            throw new InvalidOperationException("403 consent_required: Patient consent is required to query PhilHealth standing.");
        }

        _beneficiaries.TryGetValue(normalizedPin, out var beneficiary);
        var lastName = beneficiary?.LastName ?? "DELA CRUZ";
        var firstName = beneficiary?.FirstName ?? "JUAN";
        var middleName = beneficiary?.MiddleName ?? "SANTOS";
        var extName = beneficiary?.ExtName ?? "";

        _verifiedPcuByPin.TryGetValue(normalizedPin, out var pcu);
        _selections.TryGetValue(normalizedPin, out var selection);
        _empanelments.TryGetValue(normalizedPin, out var empanelment);
        _fpeUploads.TryGetValue(normalizedPin, out var fpe);
        _consultations.TryGetValue(normalizedPin, out var consultation);

        var response = new YakapValidatorResponse(
            req.PatientPin,
            lastName,
            firstName,
            middleName,
            extName,
            new PcuStatusInfo(pcu?.Status ?? "UNVERIFIED", pcu?.TransNo),
            selection != null
                ? new SelectionStatusInfo(selection.Status, selection.TransactionNo, selection.Date)
                : new SelectionStatusInfo("NOT_ASSIGNED"),
            new EmpanelmentStatusInfo(empanelment != null ? "Y" : "N", empanelment?.YesReferenceNo),
            fpe != null
                ? new FpeStatusInfo("Y", fpe.TransactionNo, fpe.UploadTransactionNo)
                : new FpeStatusInfo("N"),
            consultation != null
                ? new ConsultationStatusInfo("Y", consultation.TransactionNo, consultation.UploadTransactionNo)
                : new ConsultationStatusInfo("N")
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

        var normalizedPin = NormalizePin(req.PatientPin);
        var prefix = accreNo.Length >= 4 ? accreNo[..4] : "9999";
        var yesRefNo = $"MCA{prefix}{Interlocked.Increment(ref _empanelSeries):D3}";
        var effYear = DateTime.UtcNow.Year.ToString();
        _fpeUploads.TryGetValue(normalizedPin, out var fpe);

        var empanelment = new SandboxEmpanelment
        {
            YesReferenceNo = yesRefNo,
            PatientPin = normalizedPin,
            AccreNo = accreNo,
            EffYear = effYear,
            FpeTransactionNo = fpe?.TransactionNo,
            PcuTransactionCode = req.PcuTransactionCode
        };

        _empanelments[normalizedPin] = empanelment;

        return Task.FromResult(new YakapEmpanelmentResponse(
            yesRefNo,
            req.PatientPin,
            accreNo,
            effYear,
            WithYes: true,
            WithFpe: fpe != null,
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

        var normalizedPin = NormalizePin(req.PatientPin);
        var txNo = $"K{accreNo}{DateTime.UtcNow:yyyyMMdd}{Interlocked.Increment(ref _selectionSeries):D5}";
        var selection = new SandboxSelection
        {
            PatientPin = normalizedPin,
            AccreNo = accreNo,
            TransactionNo = txNo,
            Date = req.SelectionDate,
            Status = "ASSIGNED"
        };

        _selections[normalizedPin] = selection;

        return Task.FromResult(new YakapSelectionResponse(
            req.PatientPin,
            accreNo,
            new SelectionDetails("ASSIGNED", txNo, req.SelectionDate)));
    }

    public Task<MasterlistDownloadResponse> DownloadIndividualMasterlistAsync(MasterlistIndividualRequest req, string accreNo, CancellationToken ct = default)
    {
        CheckFaultScenario();

        _beneficiaries.TryGetValue(NormalizePin(req.PatientPin), out var b);
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
        var effectiveCipherKey = string.IsNullOrWhiteSpace(cipherKey)
            ? Application.Common.TenantResolutionHelper.SandboxDefaultCipherKey
            : cipherKey;
        var caseNo = $"CASE-{uploadTxNo[..Math.Min(10, uploadTxNo.Length)]}";

        TryRecordUploadedMarker(form, envelope, effectiveCipherKey, uploadTxNo, ref caseNo);

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
            caseNo,
            upload.ReceivedAt));
    }

    private void TryRecordUploadedMarker(
        string form,
        PhilHealthEncryptedPayload envelope,
        string cipherKey,
        string uploadTxNo,
        ref string caseNo)
    {
        try
        {
            var plainJson = _encryptor.DecryptJson(envelope, cipherKey);
            using var doc = JsonDocument.Parse(plainJson);
            var root = doc.RootElement;
            string? pin = null;
            string? txNo = null;

            if (root.TryGetProperty("enlistment", out var enlistment) && enlistment.TryGetProperty("patient_pin", out var ep))
            {
                pin = ep.GetString();
            }
            else if (root.TryGetProperty("patient_pin", out var p))
            {
                pin = p.GetString();
            }
            else if (root.TryGetProperty("pPatientPin", out var pPin))
            {
                pin = pPin.GetString();
            }

            if (root.TryGetProperty("case", out var caseEl) && caseEl.TryGetProperty("case_no", out var cNo))
            {
                caseNo = cNo.GetString() ?? caseNo;
            }
            else if (root.TryGetProperty("pHciCaseNo", out var cWireNo) && !string.IsNullOrWhiteSpace(cWireNo.GetString()))
            {
                caseNo = cWireNo.GetString()!;
            }

            if (form.Equals("fpe", StringComparison.OrdinalIgnoreCase))
            {
                if (root.TryGetProperty("profiling", out var prof) && prof.TryGetProperty("fpe_transaction_no", out var fpeTx))
                {
                    txNo = fpeTx.GetString();
                }
                else if (root.TryGetProperty("pProfilingTransNo", out var wireFpeTx))
                {
                    txNo = wireFpeTx.GetString();
                }
            }
            else if (form.Equals("consultation", StringComparison.OrdinalIgnoreCase)
                && root.TryGetProperty("consultation", out var cons)
                && cons.TryGetProperty("consult_transaction_no", out var consTx))
            {
                txNo = consTx.GetString();
            }

            if (!string.IsNullOrWhiteSpace(pin))
            {
                var normalizedPin = NormalizePin(pin);
                var marker = new SandboxUploadMarker(txNo ?? uploadTxNo, uploadTxNo);
                if (form.Equals("fpe", StringComparison.OrdinalIgnoreCase))
                {
                    _fpeUploads[normalizedPin] = marker;
                }
                else if (form.Equals("consultation", StringComparison.OrdinalIgnoreCase))
                {
                    _consultations[normalizedPin] = marker;
                }
            }
        }
        catch
        {
            // Ignore synthetic unit test payloads with dummy ciphertexts (e.g. "doc123").
        }
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

        var effectiveCipherKey = string.IsNullOrWhiteSpace(cipherKey)
            ? Application.Common.TenantResolutionHelper.SandboxDefaultCipherKey
            : cipherKey;
        var pdfContent = $"%PDF-1.4\n1 0 obj\n<< /Title (ClinicEZ PhilHealth YAKAP Confirmation Slip) /Author (PhilHealth) /Pin ({req.PatientPin}) /Year ({req.EffYear}) /Accre ({accreNo}) >>\nendobj\nxref\n0 1\n0000000000 65535 f\ntrailer\n<< /Root 1 0 R >>\n%%EOF\n";
        byte[] pdfBytes = Encoding.ASCII.GetBytes(pdfContent);

        var encryptedEnvelope = _encryptor.EncryptBytes(pdfBytes, "application/pdf", effectiveCipherKey);
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
        _verifiedPcuByPin.Clear();
        _fpeUploads.Clear();
        _consultations.Clear();
        _beneficiaries.Clear();
        SeedDefaults();
        _logger.LogInformation("[PcapiSandbox] State reset to initial defaults");
    }
}
