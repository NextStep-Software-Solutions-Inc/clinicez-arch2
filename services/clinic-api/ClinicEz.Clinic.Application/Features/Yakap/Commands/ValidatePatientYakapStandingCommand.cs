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

/// <summary>
/// Service 02: Checks a patient's PhilHealth YAKAP standing (Selection, Identity Check/PCU, Empanelment, FPE),
/// reconciles the local <see cref="PatientYakapEnlistment"/> / <see cref="PatientIdentityVerification"/> rows,
/// and returns plain-English onboarding guidance.
/// </summary>
public sealed record ValidatePatientYakapStandingCommand(
    Guid PatientId,
    int? EffectiveYear = null,
    bool Consent = true) : IRequest<YakapStandingCheckDto>;

public sealed class ValidatePatientYakapStandingCommandHandler : IRequestHandler<ValidatePatientYakapStandingCommand, YakapStandingCheckDto>
{
    private readonly IRepository<Patient> _patientRepo;
    private readonly IRepository<PatientPhilHealthMembership> _membershipRepo;
    private readonly IRepository<PatientYakapEnlistment> _enlistmentRepo;
    private readonly IRepository<PatientIdentityVerification> _verificationRepo;
    private readonly IRepository<FacilitySettings> _settingsRepo;
    private readonly IYakapPcapiClient _pcapiClient;
    private readonly IPhilHealthSequenceGenerator _sequenceGenerator;
    private readonly IUnitOfWork _unitOfWork;
    private readonly IClinicContext _clinicContext;
    private readonly IWorkspaceProfileProvider? _workspaceProfiles;

    public ValidatePatientYakapStandingCommandHandler(
        IRepository<Patient> patientRepo,
        IRepository<PatientPhilHealthMembership> membershipRepo,
        IRepository<PatientYakapEnlistment> enlistmentRepo,
        IRepository<PatientIdentityVerification> verificationRepo,
        IRepository<FacilitySettings> settingsRepo,
        IYakapPcapiClient pcapiClient,
        IPhilHealthSequenceGenerator sequenceGenerator,
        IUnitOfWork unitOfWork,
        IClinicContext clinicContext,
        IWorkspaceProfileProvider? workspaceProfiles = null)
    {
        _patientRepo = patientRepo;
        _membershipRepo = membershipRepo;
        _enlistmentRepo = enlistmentRepo;
        _verificationRepo = verificationRepo;
        _settingsRepo = settingsRepo;
        _pcapiClient = pcapiClient;
        _sequenceGenerator = sequenceGenerator;
        _unitOfWork = unitOfWork;
        _clinicContext = clinicContext;
        _workspaceProfiles = workspaceProfiles;
    }

    public async Task<YakapStandingCheckDto> Handle(ValidatePatientYakapStandingCommand request, CancellationToken ct)
    {
        if (request.PatientId == Guid.Empty)
            throw new BadRequestException("Please select a valid patient.");

        var patient = await _patientRepo
            .Query(p => p.Id == request.PatientId && p.ClinicId == _clinicContext.ClinicId && !p.IsDeleted)
            .FirstOrDefaultAsync(ct)
            ?? throw new NotFoundException("Patient record was not found in this clinic.");

        var membership = await _membershipRepo
            .Query(m => m.PatientId == patient.Id && m.ClinicId == _clinicContext.ClinicId && !m.IsDeleted)
            .AsNoTracking()
            .FirstOrDefaultAsync(ct);

        var pin = HealthScreeningHelper.ResolvePatientPin(patient, membership);
        if (string.IsNullOrWhiteSpace(pin) || !PhilHealthPinNormalizer.IsValidPin(pin))
        {
            throw new BadRequestException("Enter a valid 12-digit PhilHealth number first before checking eligibility.");
        }

        var normalizedPin = PhilHealthPinNormalizer.Normalize(pin) ?? pin.Trim();
        var today = await YakapWorkflowHelpers.ResolveTodayAsync(_workspaceProfiles, _clinicContext.TenantId, _settingsRepo, ct);
        var effYear = request.EffectiveYear ?? today.Year;

        var response = await _pcapiClient.ValidateStandingAsync(
            new YakapValidateStandingRequest(normalizedPin, effYear.ToString(), request.Consent),
            ct);

        if (!response.Succeeded || response.Data == null)
        {
            throw new BadRequestException(
                string.IsNullOrWhiteSpace(response.Message)
                    ? "Could not check PhilHealth standing right now. Please try again or save a walk-in clinic assignment."
                    : response.Message);
        }

        var standing = response.Data;
        var settings = await _settingsRepo
            .Query(s => s.ClinicId == _clinicContext.ClinicId)
            .AsNoTracking()
            .FirstOrDefaultAsync(ct);
        var accre9 = YakapWorkflowHelpers.ResolveAccreditation9(settings?.AccreditationNumber);
        var nowUtc = DateTime.UtcNow;
        var actor = _clinicContext.StaffId?.ToString() ?? _clinicContext.StaffName ?? "ClinicStaff";

        // Reconcile PCU verification if PhilHealth reports VERIFIED
        var pcuStatus = standing.Pcu?.Status?.Trim().ToUpperInvariant() ?? "UNVERIFIED";
        if (pcuStatus == "VERIFIED")
        {
            var existingVerif = await YakapWorkflowHelpers.GetLatestVerifiedForPatientAsync(_verificationRepo, _clinicContext.ClinicId, patient.Id, ct);
            if (existingVerif == null || existingVerif.VerificationDate != today)
            {
                await _verificationRepo.AddAsync(new PatientIdentityVerification
                {
                    Id = Guid.NewGuid(),
                    TenantId = patient.TenantId ?? _clinicContext.TenantId,
                    ClinicId = _clinicContext.ClinicId,
                    PatientId = patient.Id,
                    VerificationDate = today,
                    VerifiedManilaDate = today,
                    Mode = YakapVerificationMode.PCU,
                    PcuTransactionId = YakapWorkflowHelpers.Clamp(standing.Pcu?.TransNo, 50),
                    PcuResultCode = "VERIFIED",
                    PcuPinMatched = true,
                    VerifiedAtUtc = nowUtc,
                    VerifiedByStaffId = _clinicContext.StaffId,
                    VerifiedByStaffName = _clinicContext.StaffName,
                    CreatedAt = nowUtc,
                    CreatedBy = actor
                }, ct);
            }
        }

        var selectionStatus = standing.Selection?.Status?.Trim().ToUpperInvariant() ?? "NOT_ASSIGNED";
        var empanelStatus = standing.Empanelment?.Status?.Trim().ToUpperInvariant() ?? "N";
        var fpeStatus = standing.Fpe?.Status?.Trim().ToUpperInvariant() ?? "N";
        var consultStatus = standing.Consultation?.Status?.Trim().ToUpperInvariant() ?? "N";

        var existingEnlistment = await _enlistmentRepo
            .Query(e => e.PatientId == patient.Id && e.ClinicId == _clinicContext.ClinicId && e.EffectiveYear == effYear && !e.IsDeleted)
            .FirstOrDefaultAsync(ct);

        Guid? localEnlistmentId = existingEnlistment?.Id;

        if (selectionStatus is "ASSIGNED" or "TRANSFERRED" or "CANCELLED")
        {
            var mappedStatus = selectionStatus switch
            {
                "TRANSFERRED" => YakapEnlistmentStatus.Transferred,
                "CANCELLED" => YakapEnlistmentStatus.Cancelled,
                _ => YakapEnlistmentStatus.Active
            };

            if (existingEnlistment == null && mappedStatus == YakapEnlistmentStatus.Active)
            {
                var caseNo = await _sequenceGenerator.GenerateCaseNumberAsync(
                    patient.TenantId ?? _clinicContext.TenantId,
                    _clinicContext.ClinicId,
                    accre9,
                    effYear.ToString(),
                    ct);
                var parsedSelDate = YakapWorkflowHelpers.ParseMmDdYyyy(standing.Selection?.Date) ?? today;

                var created = new PatientYakapEnlistment
                {
                    Id = Guid.NewGuid(),
                    TenantId = patient.TenantId ?? _clinicContext.TenantId,
                    ClinicId = _clinicContext.ClinicId,
                    PatientId = patient.Id,
                    EffectiveYear = effYear,
                    Status = YakapEnlistmentStatus.Active,
                    Source = YakapEnlistmentSource.PhilHealthMasterlist,
                    PackageType = YakapPackageType.YakapPrimaryCare,
                    EnlistmentDate = parsedSelDate,
                    ValidUntil = new DateOnly(effYear, 12, 31),
                    CaseNo = caseNo,
                    HciAccreditationNumber = accre9,
                    SelectionControlNumber = YakapWorkflowHelpers.Clamp(standing.Selection?.TransactionNo, 23),
                    YesReferenceNo = YakapWorkflowHelpers.Clamp(standing.Empanelment?.TransactionNo, 10),
                    RegistrationStatusCode = selectionStatus,
                    McaFlag = empanelStatus == "Y",
                    ProfilingTransNo = YakapWorkflowHelpers.Clamp(standing.Fpe?.TransactionNo, 50),
                    HasPatientConsent = request.Consent,
                    ConsentSignedAtUtc = nowUtc,
                    CreatedAt = nowUtc,
                    CreatedBy = actor
                };
                await _enlistmentRepo.AddAsync(created, ct);
                localEnlistmentId = created.Id;
            }
            else if (existingEnlistment != null)
            {
                existingEnlistment.Status = fpeStatus == "Y" && mappedStatus == YakapEnlistmentStatus.Active
                    ? YakapEnlistmentStatus.ProfilingCompleted
                    : mappedStatus;
                existingEnlistment.RegistrationStatusCode = selectionStatus;
                existingEnlistment.HciAccreditationNumber = accre9;
                if (!string.IsNullOrWhiteSpace(standing.Selection?.TransactionNo))
                    existingEnlistment.SelectionControlNumber = YakapWorkflowHelpers.Clamp(standing.Selection.TransactionNo, 23);
                if (!string.IsNullOrWhiteSpace(standing.Empanelment?.TransactionNo))
                {
                    existingEnlistment.YesReferenceNo = YakapWorkflowHelpers.Clamp(standing.Empanelment.TransactionNo, 10);
                    existingEnlistment.McaFlag = empanelStatus == "Y";
                }
                if (!string.IsNullOrWhiteSpace(standing.Fpe?.TransactionNo) && string.IsNullOrWhiteSpace(existingEnlistment.ProfilingTransNo))
                    existingEnlistment.ProfilingTransNo = YakapWorkflowHelpers.Clamp(standing.Fpe.TransactionNo, 50);
                existingEnlistment.UpdatedAt = nowUtc;
                existingEnlistment.UpdatedBy = actor;
                _enlistmentRepo.Update(existingEnlistment);
                localEnlistmentId = existingEnlistment.Id;
            }
        }

        await _unitOfWork.SaveChangesAsync(ct);

        var latestLocalVerif = await YakapWorkflowHelpers.GetLatestVerifiedForPatientAsync(_verificationRepo, _clinicContext.ClinicId, patient.Id, ct);
        bool hasVerifiedId = pcuStatus == "VERIFIED" || (latestLocalVerif != null && latestLocalVerif.VerifiedAtUtc.HasValue);
        bool isAssignedHere = selectionStatus == "ASSIGNED" || localEnlistmentId.HasValue;

        string summaryMessage = (isAssignedHere, hasVerifiedId, empanelStatus == "Y", fpeStatus == "Y") switch
        {
            (_, _, _, true) => "This patient has already completed their annual PhilHealth checkup for this year.",
            (true, true, true, false) => "Patient is verified, assigned, and ready for the PhilHealth annual checkup.",
            (true, false, _, false) => "Patient is assigned to this clinic. Confirm their identity before starting the checkup.",
            (false, false, _, false) => "Walk-in patient is not assigned to any clinic yet. Confirm their identity and assign them to this clinic.",
            (false, true, _, false) => "Identity confirmed. Assign this walk-in patient to this clinic to begin their checkup.",
            _ => "Patient eligibility checked."
        };

        return new YakapStandingCheckDto(
            Pin: normalizedPin,
            EffectiveYear: effYear,
            PatientLastName: standing.PatientLname,
            PatientFirstName: standing.PatientFname,
            PcuStatus: pcuStatus,
            PcuTransactionCode: standing.Pcu?.TransNo,
            SelectionStatus: selectionStatus,
            SelectionTransactionNo: standing.Selection?.TransactionNo,
            SelectionDate: standing.Selection?.Date,
            EmpanelmentStatus: empanelStatus,
            YesReferenceNo: standing.Empanelment?.TransactionNo,
            FpeStatus: fpeStatus,
            FpeTransactionNo: standing.Fpe?.TransactionNo,
            FpeUploadTransactionNo: standing.Fpe?.UploadTransactionNo,
            ConsultationStatus: consultStatus,
            LocalEnlistmentId: localEnlistmentId,
            NeedsClinicSelection: !isAssignedHere,
            NeedsIdentityCheck: !hasVerifiedId,
            CanStartCheckup: isAssignedHere && hasVerifiedId,
            SummaryMessage: summaryMessage);
    }
}
