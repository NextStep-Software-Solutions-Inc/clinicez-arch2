using System;
using System.Linq;
using System.Threading;
using System.Threading.Tasks;
using ClinicEz.Clinic.Application.Features.HealthScreenings.Common;
using ClinicEz.Clinic.Application.Features.Yakap.Common;
using ClinicEz.Clinic.Application.Features.Yakap.DTOs;
using ClinicEz.Clinic.Application.Features.Yakap.Services;
using ClinicEz.Clinic.Domain.Entities;
using ClinicEz.Clinic.Domain.Enums;
using ClinicEz.Clinic.Domain.Interfaces;
using ClinicEz.Shared.Exceptions;
using ClinicEz.Shared.Workspace;
using MediatR;
using Microsoft.EntityFrameworkCore;

namespace ClinicEz.Clinic.Application.Features.Yakap.Commands;

// ── Service 01 (Part 1): Start Face Scan Liveness Check ──────────────────────
public sealed record StartPatientPcuSessionCommand(Guid PatientId) : IRequest<YakapPcuStartResultDto>;

public sealed class StartPatientPcuSessionCommandHandler : IRequestHandler<StartPatientPcuSessionCommand, YakapPcuStartResultDto>
{
    private readonly IRepository<Patient> _patientRepo;
    private readonly IRepository<PatientPhilHealthMembership> _membershipRepo;
    private readonly IRepository<PatientIdentityVerification> _verificationRepo;
    private readonly IRepository<FacilitySettings> _settingsRepo;
    private readonly IYakapPcapiClient _pcapiClient;
    private readonly IUnitOfWork _unitOfWork;
    private readonly IClinicContext _clinicContext;
    private readonly IWorkspaceProfileProvider? _workspaceProfiles;

    public StartPatientPcuSessionCommandHandler(
        IRepository<Patient> patientRepo,
        IRepository<PatientPhilHealthMembership> membershipRepo,
        IRepository<PatientIdentityVerification> verificationRepo,
        IRepository<FacilitySettings> settingsRepo,
        IYakapPcapiClient pcapiClient,
        IUnitOfWork unitOfWork,
        IClinicContext clinicContext,
        IWorkspaceProfileProvider? workspaceProfiles = null)
    {
        _patientRepo = patientRepo;
        _membershipRepo = membershipRepo;
        _verificationRepo = verificationRepo;
        _settingsRepo = settingsRepo;
        _pcapiClient = pcapiClient;
        _unitOfWork = unitOfWork;
        _clinicContext = clinicContext;
        _workspaceProfiles = workspaceProfiles;
    }

    public async Task<YakapPcuStartResultDto> Handle(StartPatientPcuSessionCommand request, CancellationToken ct)
    {
        var patient = await _patientRepo
            .Query(p => p.Id == request.PatientId && p.ClinicId == _clinicContext.ClinicId && !p.IsDeleted)
            .AsNoTracking()
            .FirstOrDefaultAsync(ct)
            ?? throw new NotFoundException("Patient record was not found.");

        var membership = await _membershipRepo
            .Query(m => m.PatientId == patient.Id && m.ClinicId == _clinicContext.ClinicId && !m.IsDeleted)
            .AsNoTracking()
            .FirstOrDefaultAsync(ct);

        var pin = HealthScreeningHelper.ResolvePatientPin(patient, membership);
        if (string.IsNullOrWhiteSpace(pin) || !PhilHealthPinNormalizer.IsValidPin(pin))
            throw new BadRequestException("Enter a valid 12-digit PhilHealth number before starting the face scan.");

        var normalizedPin = PhilHealthPinNormalizer.Normalize(pin) ?? pin.Trim();
        if (!patient.DateOfBirth.HasValue)
            throw new BadRequestException("Enter the patient's date of birth before starting the face scan.");

        var birthDateStr = YakapWorkflowHelpers.FormatMmDdYyyy(patient.DateOfBirth.Value);

        var pcapiRes = await _pcapiClient.StartPcuSessionAsync(
            new PcuStartRequest(
                Pin: normalizedPin,
                FirstName: patient.FirstName.Trim(),
                MiddleName: patient.MiddleName?.Trim(),
                LastName: patient.LastName.Trim(),
                Suffix: patient.Suffix?.Trim(),
                BirthDate: birthDateStr),
            ct);

        if (!pcapiRes.Succeeded || pcapiRes.Data == null)
        {
            throw new BadRequestException(
                string.IsNullOrWhiteSpace(pcapiRes.Message)
                    ? "Could not start the face scan check. You can confirm identity with a Text Code (OTP) or Photo ID instead."
                    : pcapiRes.Message);
        }

        var today = await YakapWorkflowHelpers.ResolveTodayAsync(_workspaceProfiles, _clinicContext.TenantId, _settingsRepo, ct);
        var nowUtc = DateTime.UtcNow;
        var entity = new PatientIdentityVerification
        {
            Id = Guid.NewGuid(),
            TenantId = patient.TenantId ?? _clinicContext.TenantId,
            ClinicId = _clinicContext.ClinicId,
            PatientId = patient.Id,
            VerificationDate = today,
            Mode = YakapVerificationMode.PCU,
            PcuAuthorizationId = pcapiRes.Data.LivenessAuthorizationId,
            PcuLaunchUrl = pcapiRes.Data.SdkUrl,
            PcuResultCode = pcapiRes.Data.Status ?? "PENDING",
            CreatedAt = nowUtc,
            CreatedBy = _clinicContext.StaffId?.ToString() ?? _clinicContext.StaffName ?? "ClinicStaff"
        };

        await _verificationRepo.AddAsync(entity, ct);
        await _unitOfWork.SaveChangesAsync(ct);

        return new YakapPcuStartResultDto(
            VerificationId: entity.Id,
            SdkUrl: pcapiRes.Data.SdkUrl,
            LivenessAuthorizationId: pcapiRes.Data.LivenessAuthorizationId,
            Status: pcapiRes.Data.Status ?? "PENDING",
            ExpiresInSeconds: pcapiRes.Data.ExpiresIn ?? 900);
    }
}

// ── Service 01 (Part 2): Verify Face Scan Result ─────────────────────────────
public sealed record VerifyPatientPcuSessionCommand(
    Guid PatientId,
    Guid? VerificationId = null,
    string? LivenessAuthorizationId = null) : IRequest<YakapIdentityVerificationDto>;

public sealed class VerifyPatientPcuSessionCommandHandler : IRequestHandler<VerifyPatientPcuSessionCommand, YakapIdentityVerificationDto>
{
    private readonly IRepository<PatientIdentityVerification> _verificationRepo;
    private readonly IRepository<PatientYakapEnlistment> _enlistmentRepo;
    private readonly IRepository<FacilitySettings> _settingsRepo;
    private readonly IYakapPcapiClient _pcapiClient;
    private readonly IUnitOfWork _unitOfWork;
    private readonly IClinicContext _clinicContext;
    private readonly IWorkspaceProfileProvider? _workspaceProfiles;

    public VerifyPatientPcuSessionCommandHandler(
        IRepository<PatientIdentityVerification> verificationRepo,
        IRepository<PatientYakapEnlistment> enlistmentRepo,
        IRepository<FacilitySettings> settingsRepo,
        IYakapPcapiClient pcapiClient,
        IUnitOfWork unitOfWork,
        IClinicContext clinicContext,
        IWorkspaceProfileProvider? workspaceProfiles = null)
    {
        _verificationRepo = verificationRepo;
        _enlistmentRepo = enlistmentRepo;
        _settingsRepo = settingsRepo;
        _pcapiClient = pcapiClient;
        _unitOfWork = unitOfWork;
        _clinicContext = clinicContext;
        _workspaceProfiles = workspaceProfiles;
    }

    public async Task<YakapIdentityVerificationDto> Handle(VerifyPatientPcuSessionCommand request, CancellationToken ct)
    {
        PatientIdentityVerification? record = null;
        if (request.VerificationId.HasValue && request.VerificationId.Value != Guid.Empty)
        {
            record = await _verificationRepo
                .Query(v => v.Id == request.VerificationId.Value && v.PatientId == request.PatientId && v.ClinicId == _clinicContext.ClinicId && !v.IsDeleted)
                .FirstOrDefaultAsync(ct);
        }
        else
        {
            record = await _verificationRepo
                .Query(v => v.PatientId == request.PatientId && v.ClinicId == _clinicContext.ClinicId && v.Mode == YakapVerificationMode.PCU && !v.IsDeleted)
                .OrderByDescending(v => v.CreatedAt)
                .FirstOrDefaultAsync(ct);
        }

        var authId = !string.IsNullOrWhiteSpace(request.LivenessAuthorizationId)
            ? request.LivenessAuthorizationId.Trim()
            : record?.PcuAuthorizationId;

        if (string.IsNullOrWhiteSpace(authId))
            throw new BadRequestException("Start the face scan check first before verifying it.");

        var res = await _pcapiClient.VerifyPcuTokenAsync(new PcuVerifyRequest(authId), ct);
        if (!res.Succeeded || res.Data == null)
        {
            throw new BadRequestException(
                string.IsNullOrWhiteSpace(res.Message)
                    ? "Could not confirm the face scan result. Try again or use a Text Code (OTP) or Photo ID."
                    : res.Message);
        }

        var today = await YakapWorkflowHelpers.ResolveTodayAsync(_workspaceProfiles, _clinicContext.TenantId, _settingsRepo, ct);
        var nowUtc = DateTime.UtcNow;
        var actor = _clinicContext.StaffId?.ToString() ?? _clinicContext.StaffName ?? "ClinicStaff";
        bool verified = res.Data.PinMatched && string.Equals(res.Data.Status, "VERIFIED", StringComparison.OrdinalIgnoreCase);

        if (record == null)
        {
            record = new PatientIdentityVerification
            {
                Id = Guid.NewGuid(),
                TenantId = _clinicContext.TenantId,
                ClinicId = _clinicContext.ClinicId,
                PatientId = request.PatientId,
                VerificationDate = today,
                Mode = YakapVerificationMode.PCU,
                PcuAuthorizationId = authId,
                CreatedAt = nowUtc,
                CreatedBy = actor
            };
            await _verificationRepo.AddAsync(record, ct);
        }

        record.PcuTransactionId = YakapWorkflowHelpers.Clamp(res.Data.TransNo, 50);
        record.PcuPinMatched = res.Data.PinMatched;
        record.PcuResultCode = res.Data.Status;
        record.VerifiedManilaDate = today;
        record.VerifiedAtUtc = verified ? nowUtc : null;
        record.VerifiedByStaffId = _clinicContext.StaffId;
        record.VerifiedByStaffName = _clinicContext.StaffName;
        record.UpdatedAt = nowUtc;
        record.UpdatedBy = actor;
        _verificationRepo.Update(record);

        if (verified)
        {
            var enlistments = await _enlistmentRepo
                .Query(e => e.PatientId == request.PatientId && e.ClinicId == _clinicContext.ClinicId && e.EffectiveYear == today.Year && !e.IsDeleted)
                .ToListAsync(ct);
            foreach (var e in enlistments)
            {
                e.IdentityVerificationId = record.Id;
                e.EmpanelmentMethod = "PCU";
                _enlistmentRepo.Update(e);
            }
        }

        await _unitOfWork.SaveChangesAsync(ct);

        if (!verified)
        {
            throw new BadRequestException("The face scan did not match the PhilHealth record. Try again or use a Text Code (OTP) or Photo ID.");
        }

        return new YakapIdentityVerificationDto(
            VerificationId: record.Id,
            PatientId: record.PatientId,
            Mode: "PCU",
            VerificationDate: record.VerificationDate,
            IsVerified: true,
            TransactionCode: record.PcuTransactionId,
            Status: record.PcuResultCode,
            ValidIdTypeCode: null,
            VerifiedAtUtc: record.VerifiedAtUtc);
    }
}

// ── Service 07: Validate SMS Text Code (OTP) ─────────────────────────────────
public sealed record ValidatePatientOtpCommand(
    Guid PatientId,
    string OneTimePin,
    bool Consent = true) : IRequest<YakapIdentityVerificationDto>;

public sealed class ValidatePatientOtpCommandHandler : IRequestHandler<ValidatePatientOtpCommand, YakapIdentityVerificationDto>
{
    private readonly IRepository<Patient> _patientRepo;
    private readonly IRepository<PatientPhilHealthMembership> _membershipRepo;
    private readonly IRepository<PatientIdentityVerification> _verificationRepo;
    private readonly IRepository<PatientYakapEnlistment> _enlistmentRepo;
    private readonly IRepository<FacilitySettings> _settingsRepo;
    private readonly IYakapPcapiClient _pcapiClient;
    private readonly IUnitOfWork _unitOfWork;
    private readonly IClinicContext _clinicContext;
    private readonly IWorkspaceProfileProvider? _workspaceProfiles;

    public ValidatePatientOtpCommandHandler(
        IRepository<Patient> patientRepo,
        IRepository<PatientPhilHealthMembership> membershipRepo,
        IRepository<PatientIdentityVerification> verificationRepo,
        IRepository<PatientYakapEnlistment> enlistmentRepo,
        IRepository<FacilitySettings> settingsRepo,
        IYakapPcapiClient pcapiClient,
        IUnitOfWork unitOfWork,
        IClinicContext clinicContext,
        IWorkspaceProfileProvider? workspaceProfiles = null)
    {
        _patientRepo = patientRepo;
        _membershipRepo = membershipRepo;
        _verificationRepo = verificationRepo;
        _enlistmentRepo = enlistmentRepo;
        _settingsRepo = settingsRepo;
        _pcapiClient = pcapiClient;
        _unitOfWork = unitOfWork;
        _clinicContext = clinicContext;
        _workspaceProfiles = workspaceProfiles;
    }

    public async Task<YakapIdentityVerificationDto> Handle(ValidatePatientOtpCommand request, CancellationToken ct)
    {
        if (string.IsNullOrWhiteSpace(request.OneTimePin))
            throw new BadRequestException("Enter the text verification code received by the patient.");

        var patient = await _patientRepo
            .Query(p => p.Id == request.PatientId && p.ClinicId == _clinicContext.ClinicId && !p.IsDeleted)
            .AsNoTracking()
            .FirstOrDefaultAsync(ct)
            ?? throw new NotFoundException("Patient record was not found.");

        var membership = await _membershipRepo
            .Query(m => m.PatientId == patient.Id && m.ClinicId == _clinicContext.ClinicId && !m.IsDeleted)
            .AsNoTracking()
            .FirstOrDefaultAsync(ct);

        var pin = HealthScreeningHelper.ResolvePatientPin(patient, membership);
        if (string.IsNullOrWhiteSpace(pin) || !PhilHealthPinNormalizer.IsValidPin(pin))
            throw new BadRequestException("Enter a valid 12-digit PhilHealth number before verifying an OTP code.");

        var normalizedPin = PhilHealthPinNormalizer.Normalize(pin) ?? pin.Trim();
        var today = await YakapWorkflowHelpers.ResolveTodayAsync(_workspaceProfiles, _clinicContext.TenantId, _settingsRepo, ct);

        var res = await _pcapiClient.ValidateVerificationCodeAsync(
            new VerificationCodeRequest(
                PatientPin: normalizedPin,
                OneTimePin: request.OneTimePin.Trim(),
                TransactionDate: YakapWorkflowHelpers.FormatMmDdYyyy(today),
                Consent: request.Consent),
            ct);

        if (!res.Succeeded || res.Data == null || !string.Equals(res.Data.Status, "VALID", StringComparison.OrdinalIgnoreCase))
        {
            throw new BadRequestException(
                string.IsNullOrWhiteSpace(res.Message)
                    ? "The text verification code was rejected. Check the code and try again, or verify using Photo ID."
                    : res.Message);
        }

        var nowUtc = DateTime.UtcNow;
        var actor = _clinicContext.StaffId?.ToString() ?? _clinicContext.StaffName ?? "ClinicStaff";
        var record = new PatientIdentityVerification
        {
            Id = Guid.NewGuid(),
            TenantId = patient.TenantId ?? _clinicContext.TenantId,
            ClinicId = _clinicContext.ClinicId,
            PatientId = patient.Id,
            VerificationDate = today,
            VerifiedManilaDate = today,
            Mode = YakapVerificationMode.OTP,
            OneTimePin = YakapWorkflowHelpers.Clamp(request.OneTimePin.Trim(), 20),
            OtpValidationStatus = res.Data.Status,
            VerifiedAtUtc = nowUtc,
            VerifiedByStaffId = _clinicContext.StaffId,
            VerifiedByStaffName = _clinicContext.StaffName,
            CreatedAt = nowUtc,
            CreatedBy = actor
        };

        await _verificationRepo.AddAsync(record, ct);

        var enlistments = await _enlistmentRepo
            .Query(e => e.PatientId == patient.Id && e.ClinicId == _clinicContext.ClinicId && e.EffectiveYear == today.Year && !e.IsDeleted)
            .ToListAsync(ct);
        foreach (var e in enlistments)
        {
            e.IdentityVerificationId = record.Id;
            e.EmpanelmentMethod = "OTP";
            _enlistmentRepo.Update(e);
        }

        await _unitOfWork.SaveChangesAsync(ct);

        return new YakapIdentityVerificationDto(
            VerificationId: record.Id,
            PatientId: record.PatientId,
            Mode: "OTP",
            VerificationDate: record.VerificationDate,
            IsVerified: true,
            TransactionCode: null,
            Status: res.Data.Status,
            ValidIdTypeCode: null,
            VerifiedAtUtc: record.VerifiedAtUtc);
    }
}

// ── Valid Government Photo ID Verification ───────────────────────────────────
public sealed record RecordValidIdVerificationCommand(
    Guid PatientId,
    string ValidIdTypeCode,
    string? ValidIdNumber = null,
    Guid? AttachmentId = null,
    bool Consent = true) : IRequest<YakapIdentityVerificationDto>;

public sealed class RecordValidIdVerificationCommandHandler : IRequestHandler<RecordValidIdVerificationCommand, YakapIdentityVerificationDto>
{
    private readonly IRepository<Patient> _patientRepo;
    private readonly IRepository<PatientIdentityVerification> _verificationRepo;
    private readonly IRepository<PatientYakapEnlistment> _enlistmentRepo;
    private readonly IRepository<FacilitySettings> _settingsRepo;
    private readonly IUnitOfWork _unitOfWork;
    private readonly IClinicContext _clinicContext;
    private readonly IWorkspaceProfileProvider? _workspaceProfiles;

    public RecordValidIdVerificationCommandHandler(
        IRepository<Patient> patientRepo,
        IRepository<PatientIdentityVerification> verificationRepo,
        IRepository<PatientYakapEnlistment> enlistmentRepo,
        IRepository<FacilitySettings> settingsRepo,
        IUnitOfWork unitOfWork,
        IClinicContext clinicContext,
        IWorkspaceProfileProvider? workspaceProfiles = null)
    {
        _patientRepo = patientRepo;
        _verificationRepo = verificationRepo;
        _enlistmentRepo = enlistmentRepo;
        _settingsRepo = settingsRepo;
        _unitOfWork = unitOfWork;
        _clinicContext = clinicContext;
        _workspaceProfiles = workspaceProfiles;
    }

    public async Task<YakapIdentityVerificationDto> Handle(RecordValidIdVerificationCommand request, CancellationToken ct)
    {
        if (!request.Consent)
            throw new BadRequestException("Patient permission is required to record identity confirmation.");

        if (string.IsNullOrWhiteSpace(request.ValidIdTypeCode))
            throw new BadRequestException("Select the type of government photo ID shown by the patient.");

        var patient = await _patientRepo
            .Query(p => p.Id == request.PatientId && p.ClinicId == _clinicContext.ClinicId && !p.IsDeleted)
            .AsNoTracking()
            .FirstOrDefaultAsync(ct)
            ?? throw new NotFoundException("Patient record was not found.");

        var today = await YakapWorkflowHelpers.ResolveTodayAsync(_workspaceProfiles, _clinicContext.TenantId, _settingsRepo, ct);
        var nowUtc = DateTime.UtcNow;
        var actor = _clinicContext.StaffId?.ToString() ?? _clinicContext.StaffName ?? "ClinicStaff";

        var record = new PatientIdentityVerification
        {
            Id = Guid.NewGuid(),
            TenantId = patient.TenantId ?? _clinicContext.TenantId,
            ClinicId = _clinicContext.ClinicId,
            PatientId = patient.Id,
            VerificationDate = today,
            VerifiedManilaDate = today,
            Mode = YakapVerificationMode.VALID_ID,
            ValidIdTypeCode = YakapWorkflowHelpers.Clamp(request.ValidIdTypeCode, 20),
            ValidIdNumber = YakapWorkflowHelpers.Clamp(request.ValidIdNumber, 100),
            ValidIdAttachmentId = request.AttachmentId,
            VerifiedAtUtc = nowUtc,
            VerifiedByStaffId = _clinicContext.StaffId,
            VerifiedByStaffName = _clinicContext.StaffName,
            CreatedAt = nowUtc,
            CreatedBy = actor
        };

        await _verificationRepo.AddAsync(record, ct);

        var enlistments = await _enlistmentRepo
            .Query(e => e.PatientId == patient.Id && e.ClinicId == _clinicContext.ClinicId && e.EffectiveYear == today.Year && !e.IsDeleted)
            .ToListAsync(ct);
        foreach (var e in enlistments)
        {
            e.IdentityVerificationId = record.Id;
            e.EmpanelmentMethod = "VALID_ID";
            _enlistmentRepo.Update(e);
        }

        await _unitOfWork.SaveChangesAsync(ct);

        return new YakapIdentityVerificationDto(
            VerificationId: record.Id,
            PatientId: record.PatientId,
            Mode: "VALID_ID",
            VerificationDate: record.VerificationDate,
            IsVerified: true,
            TransactionCode: null,
            Status: "VERIFIED",
            ValidIdTypeCode: record.ValidIdTypeCode,
            VerifiedAtUtc: record.VerifiedAtUtc);
    }
}
