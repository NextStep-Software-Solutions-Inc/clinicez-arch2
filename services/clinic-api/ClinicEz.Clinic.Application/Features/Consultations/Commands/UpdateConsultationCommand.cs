using System;
using System.Collections.Generic;
using System.Linq;
using System.Threading;
using System.Threading.Tasks;
using ClinicEz.Clinic.Application.Features.Consultations.DTOs;
using ClinicEz.Clinic.Application.Features.Prescriptions.DTOs;
using ClinicEz.Clinic.Domain.Common;
using ClinicEz.Clinic.Domain.Entities;
using ClinicEz.Clinic.Domain.Enums;
using ClinicEz.Clinic.Domain.Interfaces;
using ClinicEz.Shared.Exceptions;
using FluentValidation;
using MediatR;
using Microsoft.EntityFrameworkCore;

namespace ClinicEz.Clinic.Application.Features.Consultations.Commands;

public sealed record UpdateConsultationCommand(
    Guid Id,
    string? Subjective,
    string? Objective,
    string? Assessment,
    string? Plan,
    List<DiagnosisInput>? Diagnoses = null,
    List<PrescriptionInput>? Prescriptions = null,
    string? HomeInstructions = null,
    bool? IsYakapEligible = null,
    string? PhilHealthSignSympCode = null,
    string? PhilHealthOtherComplaint = null,
    string? PhilHealthPainSite = null,
    string? DoctorPhilHealthPan = null,
    string? PhilHealthAtc = null,
    string? HciCaseNo = null,
    string? HciTransNo = null,
    string? SoapTransNo = null,
    string? GeneralSurveyId = null,
    string? GeneralSurveyRemarks = null,
    string? PhysicalExamFindingsJson = null,
    string? CounselingCodes = null,
    string? RoutineVaccineName = null,
    string? RoutineVaccineDate = null,
    string? AdultsRoutineScreeningCode = null,
    string? PediatricRoutineScreeningCode = null,
    string? PrenatalScreeningServicesCode = null,
    string? CancerScreeningCodes = null,
    string? DiagnosticServicesOption = null,
    bool? HasMedicationPrescription = null,
    bool? HasReferral = null,
    string? OtherMedicalAdviceSpec = null,
    bool? HasFollowUp = null,
    string? FollowUpDate = null,
    string? FollowUpScheduleText = null,
    string? FollowUpReason = null,
    string? FollowUpVaccineName = null,
    string? FollowUpVaccineNextDate = null,
    string? RosCategory = null,
    List<ConsultationRosItemInput>? ReviewOfSystemsItems = null,
    string? VisitWorkflowMode = null,
    string? DoctorPrcLicense = null,
    string? DoctorPtr = null,
    string? DoctorS2License = null,
    List<ConsultationPhysicalExamDto>? PhysicalExams = null,
    ConsultationObGyneExamDto? ObGyneExam = null,
    List<ConsultationPediatricMilestoneDto>? PediatricMilestones = null,
    ConsultationAdolescentAssessmentDto? AdolescentAssessment = null,
    List<ConsultationHeadsssAssessmentDto>? HeadsssAssessments = null,
    List<ConsultationBpMonitoringLogDto>? BpMonitoringLogs = null,
    List<DraftDiagnosticOrderDto>? DraftDiagnosticOrders = null,
    List<DraftProcedureOrderDto>? DraftProcedures = null,
    List<DraftDentalToothDto>? DraftDentalTeeth = null,
    ConsultationDraftWorkspaceDto? DraftWorkspace = null) : IRequest<ConsultationEncounterDto>;

public sealed class UpdateConsultationCommandValidator : AbstractValidator<UpdateConsultationCommand>
{
    public UpdateConsultationCommandValidator()
    {
        RuleFor(x => x.Id).NotEmpty();
    }
}

public sealed class UpdateConsultationCommandHandler : IRequestHandler<UpdateConsultationCommand, ConsultationEncounterDto>
{
    private readonly IRepository<ConsultationEncounter> _consultationRepository;
    private readonly IRepository<EncounterDiagnosis> _diagnosisRepository;
    private readonly IRepository<PrescriptionItem> _prescriptionRepository;
    private readonly IUnitOfWork _unitOfWork;
    private readonly IClinicContext _clinicContext;
    private readonly IRepository<StaffMember>? _staffRepository;
    private readonly IRepository<FacilitySettings>? _settingsRepository;
    private readonly IPhilHealthSequenceGenerator? _sequenceGenerator;
    private readonly IRepository<EncounterReviewOfSystemsItem>? _rosRepository;
    private readonly IRepository<QueueItem>? _queueRepository;

    public UpdateConsultationCommandHandler(
        IRepository<ConsultationEncounter> consultationRepository,
        IRepository<EncounterDiagnosis> diagnosisRepository,
        IRepository<PrescriptionItem> prescriptionRepository,
        IUnitOfWork unitOfWork,
        IClinicContext clinicContext,
        IRepository<StaffMember>? staffRepository = null,
        IRepository<FacilitySettings>? settingsRepository = null,
        IPhilHealthSequenceGenerator? sequenceGenerator = null,
        IRepository<EncounterReviewOfSystemsItem>? rosRepository = null,
        IRepository<QueueItem>? queueRepository = null)
    {
        _consultationRepository = consultationRepository;
        _diagnosisRepository = diagnosisRepository;
        _prescriptionRepository = prescriptionRepository;
        _unitOfWork = unitOfWork;
        _clinicContext = clinicContext;
        _staffRepository = staffRepository;
        _settingsRepository = settingsRepository;
        _sequenceGenerator = sequenceGenerator;
        _rosRepository = rosRepository;
        _queueRepository = queueRepository;
    }

    public async Task<ConsultationEncounterDto> Handle(UpdateConsultationCommand request, CancellationToken cancellationToken)
    {
        var encounter = await _consultationRepository.Query(c => c.Id == request.Id && c.ClinicId == _clinicContext.ClinicId)
            .Include(c => c.Diagnoses)
            .Include(c => c.Prescriptions)
            .Include(c => c.ReviewOfSystemsItems)
            .Include(c => c.PhysicalExams)
                .ThenInclude(p => p.Findings)
            .Include(c => c.ObGyneExam)
            .Include(c => c.PediatricMilestones)
                .ThenInclude(m => m.DangerSigns)
            .Include(c => c.AdolescentAssessment)
            .Include(c => c.HeadsssAssessments)
            .Include(c => c.BpMonitoringLogs)
                .ThenInclude(b => b.Days)
            .FirstOrDefaultAsync(cancellationToken);

        if (encounter == null)
        {
            throw new NotFoundException($"Consultation encounter '{request.Id}' was not found in this clinic.");
        }

        if (encounter.IsSigned)
        {
            throw new BadRequestException("Encounter is already signed and locked. Amendments cannot overwrite a signed record.");
        }

        if (request.Prescriptions is { Count: > 0 } && _staffRepository != null && _clinicContext.StaffId.HasValue)
        {
            var callerStaff = await _staffRepository
                .Query(s => s.Id == _clinicContext.StaffId.Value && s.ClinicId == _clinicContext.ClinicId)
                .FirstOrDefaultAsync(cancellationToken);
            if (callerStaff != null && callerStaff.Role != StaffRole.Doctor && callerStaff.Role != StaffRole.Admin)
            {
                throw new ForbiddenException("Prescribing privileges are strictly restricted to physicians. Nurses may only log OTC medicines during a Vitals Check.");
            }
        }

        var repoProvider = _unitOfWork as IRepositoryProvider;
        CreateConsultationCommandHandler.ValidatePrescriptionInputs(request.Prescriptions);
        var resolvedRosCategory = CreateConsultationCommandHandler.ResolveEncounterRosCategory(request.RosCategory, request.ReviewOfSystemsItems);
        if (resolvedRosCategory.HasValue)
        {
            encounter.RosCategory = resolvedRosCategory.Value;
        }
        else if (request.RosCategory != null && string.IsNullOrWhiteSpace(request.RosCategory))
        {
            encounter.RosCategory = null;
        }

        if (request.Subjective != null) encounter.Subjective = request.Subjective;
        if (request.Objective != null) encounter.Objective = request.Objective;
        if (request.Assessment != null) encounter.Assessment = request.Assessment;
        if (request.Plan != null) encounter.Plan = request.Plan;
        if (request.HomeInstructions != null) encounter.HomeInstructions = CreateConsultationCommandHandler.NullIfWhiteSpace(request.HomeInstructions);
        ConsultationDraftPersistenceHelper.SyncWorkflowMode(
            encounter,
            request.VisitWorkflowMode,
            request.IsYakapEligible);
        await ConsultationDraftPersistenceHelper.SyncQueueWorkflowModeAsync(
            encounter,
            _queueRepository ?? repoProvider?.GetRepository<QueueItem>(),
            cancellationToken);
        if (request.PhilHealthSignSympCode != null) encounter.PhilHealthSignSympCode = CreateConsultationCommandHandler.NullIfWhiteSpace(request.PhilHealthSignSympCode);
        if (request.PhilHealthOtherComplaint != null) encounter.PhilHealthOtherComplaint = CreateConsultationCommandHandler.NullIfWhiteSpace(request.PhilHealthOtherComplaint);
        if (request.PhilHealthPainSite != null) encounter.PhilHealthPainSite = CreateConsultationCommandHandler.NullIfWhiteSpace(request.PhilHealthPainSite);
        if (request.DoctorPhilHealthPan != null) encounter.DoctorPhilHealthPan = ConsultationPlanManagementMapper.Truncate(request.DoctorPhilHealthPan, 50);
        if (request.PhilHealthAtc != null) encounter.PhilHealthAtc = ConsultationPlanManagementMapper.Truncate(request.PhilHealthAtc, 50);
        if (request.DoctorPrcLicense != null) encounter.DoctorPrcLicense = ConsultationPlanManagementMapper.Truncate(request.DoctorPrcLicense, 50);
        if (request.DoctorPtr != null) encounter.DoctorPtr = ConsultationPlanManagementMapper.Truncate(request.DoctorPtr, 50);
        if (request.DoctorS2License != null) encounter.DoctorS2License = ConsultationPlanManagementMapper.Truncate(request.DoctorS2License, 50);
        if (request.HciCaseNo != null) encounter.PhilHealthCaseNo = ConsultationPlanManagementMapper.Truncate(request.HciCaseNo, 50);
        if (request.SoapTransNo != null) encounter.PhilHealthSoapTransNo = ConsultationPlanManagementMapper.Truncate(request.SoapTransNo, 50);
        ConsultationPlanManagementMapper.Apply(
            encounter,
            request.CounselingCodes,
            request.RoutineVaccineName,
            request.RoutineVaccineDate,
            request.AdultsRoutineScreeningCode,
            request.PediatricRoutineScreeningCode,
            request.PrenatalScreeningServicesCode,
            request.CancerScreeningCodes,
            request.DiagnosticServicesOption,
            request.HasMedicationPrescription,
            request.HasReferral,
            request.OtherMedicalAdviceSpec,
            request.HasFollowUp,
            request.FollowUpDate,
            request.FollowUpScheduleText,
            request.FollowUpReason,
            request.FollowUpVaccineName,
            request.FollowUpVaccineNextDate);

        await ConsultationDraftPersistenceHelper.SyncPhysicalExamsAsync(
            encounter,
            isExistingEncounter: true,
            request.PhysicalExams,
            request.GeneralSurveyId,
            request.GeneralSurveyRemarks,
            request.PhysicalExamFindingsJson,
            repoProvider,
            cancellationToken);

        await ConsultationDraftPersistenceHelper.SyncCohortAssessmentsAsync(
            encounter,
            isExistingEncounter: true,
            request.ObGyneExam,
            request.PediatricMilestones,
            request.AdolescentAssessment,
            request.HeadsssAssessments,
            request.BpMonitoringLogs,
            repoProvider,
            cancellationToken);

        PhilHealthPatientJourneyNumbers? journey = null;
        if (encounter.IsYakapEligible)
        {
            // Auto-snapshot Doctor PhilHealth PAN if not yet set
            if (string.IsNullOrWhiteSpace(encounter.DoctorPhilHealthPan) && _staffRepository != null)
            {
                var doctor = await _staffRepository.Query(s => s.Id == encounter.DoctorId && s.ClinicId == _clinicContext.ClinicId)
                    .FirstOrDefaultAsync(cancellationToken);
                if (doctor != null && !string.IsNullOrWhiteSpace(doctor.PhilHealthPan))
                {
                    encounter.DoctorPhilHealthPan = doctor.PhilHealthPan;
                }
            }

            // Automatically derive and link pHciCaseNo and pSoapTransNo
            if (_sequenceGenerator != null && _settingsRepository != null &&
                (string.IsNullOrWhiteSpace(encounter.PhilHealthCaseNo) || string.IsNullOrWhiteSpace(encounter.PhilHealthSoapTransNo)))
            {
                try
                {
                    var settings = await _settingsRepository.Query(s => s.ClinicId == _clinicContext.ClinicId)
                        .FirstOrDefaultAsync(cancellationToken);
                    var accreditationNo = !string.IsNullOrWhiteSpace(settings?.AccreditationNumber)
                        ? settings.AccreditationNumber
                        : "000000000";
                    var year = encounter.EncounterDate.Year.ToString();
                    journey = await _sequenceGenerator.AssignPatientJourneyNumbersAsync(
                        _clinicContext.TenantId,
                        _clinicContext.ClinicId,
                        encounter.PatientId,
                        encounter.Id,
                        accreditationNo,
                        year,
                        cancellationToken);

                    encounter.PhilHealthCaseNo = journey.CaseNumber;
                    encounter.PhilHealthSoapTransNo = journey.SoapTransactionNumber;
                }
                catch
                {
                    // Graceful fallback for offline sequence generation
                }
            }
        }

        encounter.UpdatedAt = DateTime.UtcNow;
        encounter.UpdatedBy = _clinicContext.StaffId?.ToString() ?? "Doctor";

        var rosRepo = _rosRepository ?? repoProvider?.GetRepository<EncounterReviewOfSystemsItem>();
        var dispensingLogRepo = repoProvider?.GetRepository<ClinicDispensingLog>();

        if (request.Diagnoses != null)
        {
            // Hard-remove previous draft diagnoses and replace with updated set
            foreach (var diag in encounter.Diagnoses.ToList())
            {
                _diagnosisRepository.Remove(diag, hardDelete: true);
            }
            encounter.Diagnoses.Clear();

            foreach (var diag in request.Diagnoses)
            {
                var newDiag = new EncounterDiagnosis
                {
                    Id = Guid.NewGuid(),
                    TenantId = encounter.TenantId,
                    ClinicId = encounter.ClinicId,
                    ConsultationEncounterId = encounter.Id,
                    Icd10Code = ConsultationPlanManagementMapper.Truncate(diag.Icd10Code.Trim().ToUpperInvariant(), 20) ?? "Z00.0",
                    Description = ConsultationPlanManagementMapper.Truncate(diag.Description, 255) ?? "Clinical diagnosis",
                    IsPrimary = diag.IsPrimary,
                    CreatedAt = DateTime.UtcNow,
                    CreatedBy = encounter.DoctorName
                };
                await _diagnosisRepository.AddAsync(newDiag, cancellationToken);
                if (!encounter.Diagnoses.Contains(newDiag))
                {
                    encounter.Diagnoses.Add(newDiag);
                }
            }
        }

        if (request.ReviewOfSystemsItems != null)
        {
            foreach (var existingRos in encounter.ReviewOfSystemsItems.ToList())
            {
                rosRepo?.Remove(existingRos, hardDelete: true);
            }
            encounter.ReviewOfSystemsItems.Clear();

            var newRosItems = CreateConsultationCommandHandler.BuildRosEntities(encounter, request.ReviewOfSystemsItems, resolvedRosCategory ?? encounter.RosCategory);
            foreach (var ros in newRosItems)
            {
                if (rosRepo != null)
                {
                    await rosRepo.AddAsync(ros, cancellationToken);
                }
                if (!encounter.ReviewOfSystemsItems.Contains(ros))
                {
                    encounter.ReviewOfSystemsItems.Add(ros);
                }
            }
        }

        if (request.Prescriptions != null)
        {
            var previousRx = encounter.Prescriptions.ToList();
            if (previousRx.Count > 0 && dispensingLogRepo != null)
            {
                var oldRxIds = previousRx.Select(r => r.Id).ToHashSet();
                var draftDispenseLogs = await dispensingLogRepo
                    .Query(d => d.ClinicId == encounter.ClinicId &&
                                d.PrescriptionItemId.HasValue &&
                                oldRxIds.Contains(d.PrescriptionItemId.Value))
                    .IgnoreQueryFilters()
                    .ToListAsync(cancellationToken);
                foreach (var dLog in draftDispenseLogs)
                {
                    if (dLog.Source == ClinicDispenseSource.DoctorConsultation && !dLog.IsConsultationValidated)
                    {
                        dispensingLogRepo.Remove(dLog, hardDelete: true);
                    }
                    else
                    {
                        dLog.PrescriptionItemId = null;
                        dLog.PrescriptionItem = null;
                    }
                }
            }

            // Remove previous prescriptions and replace with updated set
            foreach (var rx in previousRx)
            {
                _prescriptionRepository.Remove(rx, hardDelete: true);
            }
            encounter.Prescriptions.Clear();

            foreach (var rx in request.Prescriptions)
            {
                var rxRos = RosCategoryHelper.ParseNullable(rx.RosCategory) ?? encounter.RosCategory;
                var newRx = new PrescriptionItem
                {
                    Id = Guid.NewGuid(),
                    TenantId = encounter.TenantId,
                    ClinicId = encounter.ClinicId,
                    ConsultationEncounterId = encounter.Id,
                    GenericName = ConsultationPlanManagementMapper.Truncate(rx.GenericName, 150) ?? "Medication",
                    BrandName = ConsultationPlanManagementMapper.Truncate(rx.BrandName, 150),
                    Dosage = ConsultationPlanManagementMapper.Truncate(rx.Dosage, 50) ?? "As directed",
                    Form = ConsultationPlanManagementMapper.Truncate(rx.Form, 50) ?? "Tablet",
                    Sig = ConsultationPlanManagementMapper.Truncate(rx.Sig, 255) ?? "As directed",
                    Quantity = rx.Quantity,
                    DurationDays = rx.DurationDays,
                    Refills = rx.Refills,
                    IsDangerousDrug = rx.IsDangerousDrug,
                    Remarks = rx.Remarks?.Trim(),
                    PhilHealthDrugCode = rx.PhilHealthDrugCode?.Trim(),
                    IsClinicDispensed = false,
                    ClinicDispensedQuantity = rx.ClinicDispensedQuantity is > 0 ? rx.ClinicDispensedQuantity : null,
                    RosCategory = rxRos,
                    CreatedAt = DateTime.UtcNow,
                    CreatedBy = encounter.DoctorName
                };
                await _prescriptionRepository.AddAsync(newRx, cancellationToken);
                if (!encounter.Prescriptions.Contains(newRx))
                {
                    encounter.Prescriptions.Add(newRx);
                }
            }
        }

        await ConsultationDraftPersistenceHelper.SyncDraftOrdersAndAssociateArtifactsAsync(
            encounter,
            request.DraftDiagnosticOrders,
            request.DraftProcedures,
            request.DraftDentalTeeth,
            request.DraftWorkspace,
            repoProvider,
            cancellationToken);

        await _unitOfWork.SaveChangesAsync(cancellationToken);

        return ConsultationPlanManagementMapper.ToDto(
            encounter,
            hciTransNo: journey?.EnlistmentTransactionNumber,
            rxStatus: RxPharmacyStatusDto.From(encounter));
    }
}
