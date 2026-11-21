using System;
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
/// Service 04: Assigns a walk-in patient to this clinic in PhilHealth YAKAP 2.0.
/// If PhilHealth is reachable (Sandbox or live), commits immediately and stores SelectionControlNumber (K...).
/// If PhilHealth cannot be reached right now, saves a local Walk-In Selection draft with a 23B CaseNo and queues sync
/// so the patient is never turned away at the front desk.
/// </summary>
public sealed record SubmitPatientYakapSelectionCommand(
    Guid PatientId,
    DateOnly? SelectionDate = null,
    bool Consent = true) : IRequest<YakapSelectionResultDto>;

public sealed class SubmitPatientYakapSelectionCommandHandler : IRequestHandler<SubmitPatientYakapSelectionCommand, YakapSelectionResultDto>
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

    public SubmitPatientYakapSelectionCommandHandler(
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

    public async Task<YakapSelectionResultDto> Handle(SubmitPatientYakapSelectionCommand request, CancellationToken ct)
    {
        if (!request.Consent)
            throw new BadRequestException("Patient permission is required before assigning them to this clinic.");

        var patient = await _patientRepo
            .Query(p => p.Id == request.PatientId && p.ClinicId == _clinicContext.ClinicId && !p.IsDeleted)
            .FirstOrDefaultAsync(ct)
            ?? throw new NotFoundException("Patient record was not found.");

        var membership = await _membershipRepo
            .Query(m => m.PatientId == patient.Id && m.ClinicId == _clinicContext.ClinicId && !m.IsDeleted)
            .AsNoTracking()
            .FirstOrDefaultAsync(ct);

        var pin = HealthScreeningHelper.ResolvePatientPin(patient, membership);
        if (string.IsNullOrWhiteSpace(pin) || !PhilHealthPinNormalizer.IsValidPin(pin))
            throw new BadRequestException("Enter a valid 12-digit PhilHealth number before assigning this patient.");

        var normalizedPin = PhilHealthPinNormalizer.Normalize(pin) ?? pin.Trim();
        var today = await YakapWorkflowHelpers.ResolveTodayAsync(_workspaceProfiles, _clinicContext.TenantId, _settingsRepo, ct);
        var selDate = request.SelectionDate ?? today;
        var effYear = selDate.Year;

        var settings = await _settingsRepo
            .Query(s => s.ClinicId == _clinicContext.ClinicId)
            .AsNoTracking()
            .FirstOrDefaultAsync(ct);
        var accre9 = YakapWorkflowHelpers.ResolveAccreditation9(settings?.AccreditationNumber);

        var latestVerif = await YakapWorkflowHelpers.GetLatestVerifiedForPatientAsync(_verificationRepo, _clinicContext.ClinicId, patient.Id, ct);
        if (latestVerif == null)
            throw new BadRequestException("Confirm patient identity (Face Scan, Text Code, or Photo ID) before assigning them to this clinic.");

        var modeStr = YakapWorkflowHelpers.MapVerificationModeString(latestVerif.Mode);
        var res = await _pcapiClient.SubmitSelectionAsync(
            new YakapSelectionRequest(
                PatientPin: normalizedPin,
                SelectionDate: YakapWorkflowHelpers.FormatMmDdYyyy(selDate),
                Consent: request.Consent,
                PatientVerificationMode: modeStr,
                PcuTransactionCode: latestVerif.Mode == YakapVerificationMode.PCU ? latestVerif.PcuTransactionId : null,
                OneTimePin: latestVerif.Mode == YakapVerificationMode.OTP ? latestVerif.OneTimePin : null,
                ValidIdType: latestVerif.Mode == YakapVerificationMode.VALID_ID ? latestVerif.ValidIdTypeCode : null),
            ct);

        bool assignedOnline = res.Succeeded && res.Data?.Selection != null;
        var nowUtc = DateTime.UtcNow;
        var actor = _clinicContext.StaffId?.ToString() ?? _clinicContext.StaffName ?? "ClinicStaff";

        var enlistment = await _enlistmentRepo
            .Query(e => e.PatientId == patient.Id && e.ClinicId == _clinicContext.ClinicId && e.EffectiveYear == effYear && !e.IsDeleted)
            .FirstOrDefaultAsync(ct);

        var caseNo = enlistment?.CaseNo;
        if (string.IsNullOrWhiteSpace(caseNo))
        {
            caseNo = await _sequenceGenerator.GenerateCaseNumberAsync(
                patient.TenantId ?? _clinicContext.TenantId,
                _clinicContext.ClinicId,
                accre9,
                effYear.ToString(),
                ct);
        }

        bool isNewEnlistment = enlistment == null;
        if (enlistment == null)
        {
            enlistment = new PatientYakapEnlistment
            {
                Id = Guid.NewGuid(),
                TenantId = patient.TenantId ?? _clinicContext.TenantId,
                ClinicId = _clinicContext.ClinicId,
                PatientId = patient.Id,
                EffectiveYear = effYear,
                Source = YakapEnlistmentSource.WalkIn,
                PackageType = YakapPackageType.YakapPrimaryCare,
                EnlistmentDate = selDate,
                ValidUntil = new DateOnly(effYear, 12, 31),
                CaseNo = caseNo,
                CreatedAt = nowUtc,
                CreatedBy = actor
            };
        }

        enlistment.IsWalkedIn = true;
        enlistment.HasPatientConsent = request.Consent;
        enlistment.ConsentSignedAtUtc ??= nowUtc;
        enlistment.HciAccreditationNumber = accre9;
        enlistment.IdentityVerificationId = latestVerif.Id;
        enlistment.EmpanelmentMethod = modeStr;
        enlistment.UpdatedAt = nowUtc;
        enlistment.UpdatedBy = actor;

        if (assignedOnline)
        {
            enlistment.Status = YakapEnlistmentStatus.Active;
            enlistment.SelectionControlNumber = YakapWorkflowHelpers.Clamp(res.Data!.Selection.TransactionNo, 23);
            enlistment.RegistrationStatusCode = res.Data.Selection.Status;
        }
        else
        {
            // Non-blocking Walk-In Draft when gateway cannot be reached immediately
            enlistment.Status = YakapEnlistmentStatus.Active;
            enlistment.RegistrationStatusCode = "LOCAL_WALKIN_DRAFT";
            enlistment.Remarks = res.Message;
        }

        if (isNewEnlistment)
            await _enlistmentRepo.AddAsync(enlistment, ct);
        else
            _enlistmentRepo.Update(enlistment);
        await _unitOfWork.SaveChangesAsync(ct);

        return new YakapSelectionResultDto(
            EnlistmentId: enlistment.Id,
            PatientId: patient.Id,
            EffectiveYear: effYear,
            SelectionStatus: assignedOnline ? res.Data!.Selection.Status : "LOCAL_WALKIN_DRAFT",
            SelectionTransactionNo: enlistment.SelectionControlNumber,
            SelectionDate: selDate,
            CaseNo: enlistment.CaseNo,
            QueuedForSync: !assignedOnline,
            Message: assignedOnline
                ? "Patient assigned to this clinic for PhilHealth YAKAP."
                : "Walk-in clinic assignment saved locally. It will sync with PhilHealth automatically.");
    }
}
