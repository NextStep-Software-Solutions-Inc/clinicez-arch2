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

public sealed record DiagnosisInput(string Icd10Code, string Description, bool IsPrimary = false);

public sealed record PrescriptionInput(
    string GenericName,
    string? BrandName,
    string Dosage,
    string Form,
    string Sig,
    int Quantity,
    int? DurationDays = null,
    int Refills = 0,
    bool IsDangerousDrug = false,
    string? Remarks = null,
    string? PhilHealthDrugCode = null,
    int? ClinicDispensedQuantity = null,
    string? RosCategory = null);

public sealed record ConsultationRosItemInput(
    string? System = null,
    string? OptionCode = null,
    string? SymptomName = null,
    bool IsPertinentPositive = true,
    string? PainSite = null,
    string? OthersSpecifyText = null,
    string? Remarks = null);

public sealed record CreateConsultationCommand(
    Guid PatientId,
    string PatientName,
    Guid DoctorId,
    string DoctorName,
    Guid? QueueItemId = null,
    Guid? AppointmentId = null,
    string? Subjective = null,
    string? Objective = null,
    string? Assessment = null,
    string? Plan = null,
    List<DiagnosisInput>? Diagnoses = null,
    List<PrescriptionInput>? Prescriptions = null,
    string? HomeInstructions = null,
    bool IsYakapEligible = false,
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

public sealed class CreateConsultationCommandValidator : AbstractValidator<CreateConsultationCommand>
{
    public CreateConsultationCommandValidator()
    {
        RuleFor(x => x.PatientId).NotEmpty();
        RuleFor(x => x.PatientName).NotEmpty().MaximumLength(150);
        RuleFor(x => x.DoctorId).NotEmpty();
        RuleFor(x => x.DoctorName).NotEmpty().MaximumLength(150);
    }
}

public sealed class CreateConsultationCommandHandler : IRequestHandler<CreateConsultationCommand, ConsultationEncounterDto>
{
    private readonly IRepository<ConsultationEncounter> _consultationRepository;
    private readonly IRepository<QueueItem> _queueRepository;
    private readonly IUnitOfWork _unitOfWork;
    private readonly IClinicContext _clinicContext;
    private readonly IRepository<StaffMember>? _staffRepository;
    private readonly IRepository<FacilitySettings>? _settingsRepository;
    private readonly IPhilHealthSequenceGenerator? _sequenceGenerator;
    private readonly IRepository<TeleconsultRecordingSession>? _recordingSessionRepository;

    public CreateConsultationCommandHandler(
        IRepository<ConsultationEncounter> consultationRepository,
        IRepository<QueueItem> queueRepository,
        IUnitOfWork unitOfWork,
        IClinicContext clinicContext,
        IRepository<StaffMember>? staffRepository = null,
        IRepository<FacilitySettings>? settingsRepository = null,
        IPhilHealthSequenceGenerator? sequenceGenerator = null,
        IRepository<TeleconsultRecordingSession>? recordingSessionRepository = null)
    {
        _consultationRepository = consultationRepository;
        _queueRepository = queueRepository;
        _unitOfWork = unitOfWork;
        _clinicContext = clinicContext;
        _staffRepository = staffRepository;
        _settingsRepository = settingsRepository;
        _sequenceGenerator = sequenceGenerator;
        _recordingSessionRepository = recordingSessionRepository;
    }

    public async Task<ConsultationEncounterDto> Handle(CreateConsultationCommand request, CancellationToken cancellationToken)
    {
        string? doctorPrc = NullIfWhiteSpace(request.DoctorPrcLicense);
        string? doctorPtr = NullIfWhiteSpace(request.DoctorPtr);
        string? doctorS2 = NullIfWhiteSpace(request.DoctorS2License);
        string? doctorPan = NullIfWhiteSpace(request.DoctorPhilHealthPan);

        if (_staffRepository != null)
        {
            var doctor = await _staffRepository.Query(s => s.Id == request.DoctorId && s.ClinicId == _clinicContext.ClinicId)
                .FirstOrDefaultAsync(cancellationToken);
            if (doctor != null)
            {
                if (request.Prescriptions is { Count: > 0 } &&
                    doctor.Role != StaffRole.Doctor &&
                    doctor.Role != StaffRole.Admin)
                {
                    throw new ForbiddenException("Prescribing privileges are strictly restricted to physicians. Nurses may only log OTC medicines during a Vitals Check.");
                }

                doctorPrc ??= doctor.PrcLicenseNumber;
                doctorPtr ??= doctor.PtrNumber;
                doctorS2 ??= doctor.S2LicenseNumber;
                doctorPan ??= doctor.PhilHealthPan;
            }

            if (request.Prescriptions is { Count: > 0 } &&
                _clinicContext.StaffId.HasValue &&
                _clinicContext.StaffId.Value != request.DoctorId)
            {
                var callerStaff = await _staffRepository
                    .Query(s => s.Id == _clinicContext.StaffId.Value && s.ClinicId == _clinicContext.ClinicId)
                    .FirstOrDefaultAsync(cancellationToken);
                if (callerStaff != null && callerStaff.Role != StaffRole.Doctor && callerStaff.Role != StaffRole.Admin)
                {
                    throw new ForbiddenException("Prescribing privileges are strictly restricted to physicians. Nurses may only log OTC medicines during a Vitals Check.");
                }
            }
        }

        ValidatePrescriptionInputs(request.Prescriptions);
        var resolvedRosCategory = ResolveEncounterRosCategory(request.RosCategory, request.ReviewOfSystemsItems);
        var repoProvider = _unitOfWork as IRepositoryProvider;

        ConsultationEncounter? encounter = null;

        if (request.QueueItemId.HasValue)
        {
            encounter = await _consultationRepository
                .Query(c => c.QueueItemId == request.QueueItemId.Value && c.ClinicId == _clinicContext.ClinicId)
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

            if (encounter != null && encounter.IsSigned)
            {
                throw new ConflictException("A consultation encounter for this queue visit has already been signed and locked.");
            }
        }

        if (encounter != null)
        {
            encounter.AppointmentId = request.AppointmentId ?? encounter.AppointmentId;
            encounter.PatientId = request.PatientId;
            encounter.PatientName = ConsultationPlanManagementMapper.Truncate(request.PatientName, 150) ?? "Patient";
            encounter.DoctorId = request.DoctorId;
            encounter.DoctorName = ConsultationPlanManagementMapper.Truncate(request.DoctorName, 150) ?? "Doctor";
            encounter.DoctorPrcLicense = request.DoctorPrcLicense != null
                ? ConsultationPlanManagementMapper.Truncate(request.DoctorPrcLicense, 50)
                : ConsultationPlanManagementMapper.Truncate(doctorPrc ?? encounter.DoctorPrcLicense, 50);
            encounter.DoctorPtr = request.DoctorPtr != null
                ? ConsultationPlanManagementMapper.Truncate(request.DoctorPtr, 50)
                : ConsultationPlanManagementMapper.Truncate(doctorPtr ?? encounter.DoctorPtr, 50);
            encounter.DoctorS2License = request.DoctorS2License != null
                ? ConsultationPlanManagementMapper.Truncate(request.DoctorS2License, 50)
                : ConsultationPlanManagementMapper.Truncate(doctorS2 ?? encounter.DoctorS2License, 50);
            encounter.DoctorPhilHealthPan = request.DoctorPhilHealthPan != null
                ? ConsultationPlanManagementMapper.Truncate(request.DoctorPhilHealthPan, 50)
                : ConsultationPlanManagementMapper.Truncate(doctorPan ?? encounter.DoctorPhilHealthPan, 50);
            if (request.PhilHealthAtc != null)
            {
                encounter.PhilHealthAtc = ConsultationPlanManagementMapper.Truncate(request.PhilHealthAtc, 50);
            }
            if (request.HciCaseNo != null) encounter.PhilHealthCaseNo = ConsultationPlanManagementMapper.Truncate(request.HciCaseNo, 50);
            if (request.SoapTransNo != null) encounter.PhilHealthSoapTransNo = ConsultationPlanManagementMapper.Truncate(request.SoapTransNo, 50);

            encounter.Subjective = request.Subjective ?? string.Empty;
            encounter.Objective = request.Objective ?? string.Empty;
            encounter.Assessment = request.Assessment ?? string.Empty;
            encounter.Plan = request.Plan ?? string.Empty;
            if (request.HomeInstructions != null)
            {
                encounter.HomeInstructions = NullIfWhiteSpace(request.HomeInstructions);
            }

            ConsultationDraftPersistenceHelper.SyncWorkflowMode(
                encounter,
                request.VisitWorkflowMode,
                request.IsYakapEligible);

            encounter.PhilHealthSignSympCode = NullIfWhiteSpace(request.PhilHealthSignSympCode);
            encounter.PhilHealthOtherComplaint = NullIfWhiteSpace(request.PhilHealthOtherComplaint);
            encounter.PhilHealthPainSite = NullIfWhiteSpace(request.PhilHealthPainSite);
            if (resolvedRosCategory.HasValue)
            {
                encounter.RosCategory = resolvedRosCategory.Value;
            }
            else if (request.RosCategory != null && string.IsNullOrWhiteSpace(request.RosCategory))
            {
                encounter.RosCategory = null;
            }

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

            encounter.UpdatedAt = DateTime.UtcNow;
            encounter.UpdatedBy = request.DoctorName.Trim();

            var rosRepo = repoProvider?.GetRepository<EncounterReviewOfSystemsItem>();
            var diagnosisRepo = repoProvider?.GetRepository<EncounterDiagnosis>();
            var prescriptionRepo = repoProvider?.GetRepository<PrescriptionItem>();
            var dispensingLogRepo = repoProvider?.GetRepository<ClinicDispensingLog>();

            if (request.ReviewOfSystemsItems != null)
            {
                foreach (var existingRos in encounter.ReviewOfSystemsItems.ToList())
                {
                    rosRepo?.Remove(existingRos, hardDelete: true);
                }
                encounter.ReviewOfSystemsItems.Clear();
                foreach (var item in BuildRosEntities(encounter, request.ReviewOfSystemsItems, resolvedRosCategory))
                {
                    if (rosRepo != null)
                    {
                        await rosRepo.AddAsync(item, cancellationToken);
                    }
                    if (!encounter.ReviewOfSystemsItems.Contains(item))
                    {
                        encounter.ReviewOfSystemsItems.Add(item);
                    }
                }
            }

            foreach (var existingDiag in encounter.Diagnoses.ToList())
            {
                diagnosisRepo?.Remove(existingDiag, hardDelete: true);
            }
            encounter.Diagnoses.Clear();
            if (request.Diagnoses != null)
            {
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
                    if (diagnosisRepo != null)
                    {
                        await diagnosisRepo.AddAsync(newDiag, cancellationToken);
                    }
                    if (!encounter.Diagnoses.Contains(newDiag))
                    {
                        encounter.Diagnoses.Add(newDiag);
                    }
                }
            }

            var existingRxList = encounter.Prescriptions.ToList();
            if (existingRxList.Count > 0 && dispensingLogRepo != null)
            {
                var oldRxIds = existingRxList.Select(r => r.Id).ToHashSet();
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

            foreach (var existingRx in existingRxList)
            {
                prescriptionRepo?.Remove(existingRx, hardDelete: true);
            }
            encounter.Prescriptions.Clear();
            if (request.Prescriptions != null)
            {
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
                    if (prescriptionRepo != null)
                    {
                        await prescriptionRepo.AddAsync(newRx, cancellationToken);
                    }
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
        }
        else
        {
            var nowUtc = DateTime.UtcNow;
            var safePatientName = ConsultationPlanManagementMapper.Truncate(request.PatientName, 150) ?? "Patient";
            var safeDoctorName = ConsultationPlanManagementMapper.Truncate(request.DoctorName, 150) ?? "Doctor";
            encounter = new ConsultationEncounter
            {
                Id = Guid.NewGuid(),
                TenantId = _clinicContext.TenantId,
                ClinicId = _clinicContext.ClinicId,
                QueueItemId = request.QueueItemId,
                AppointmentId = request.AppointmentId,
                PatientId = request.PatientId,
                PatientName = safePatientName,
                DoctorId = request.DoctorId,
                DoctorName = safeDoctorName,
                DoctorPrcLicense = ConsultationPlanManagementMapper.Truncate(doctorPrc, 50),
                DoctorPtr = ConsultationPlanManagementMapper.Truncate(doctorPtr, 50),
                DoctorS2License = ConsultationPlanManagementMapper.Truncate(doctorS2, 50),
                DoctorPhilHealthPan = ConsultationPlanManagementMapper.Truncate(doctorPan, 50),
                PhilHealthAtc = ConsultationPlanManagementMapper.Truncate(request.PhilHealthAtc, 50),
                PhilHealthCaseNo = ConsultationPlanManagementMapper.Truncate(request.HciCaseNo, 50),
                PhilHealthSoapTransNo = ConsultationPlanManagementMapper.Truncate(request.SoapTransNo, 50),
                EncounterDate = nowUtc,
                Subjective = request.Subjective ?? string.Empty,
                Objective = request.Objective ?? string.Empty,
                Assessment = request.Assessment ?? string.Empty,
                Plan = request.Plan ?? string.Empty,
                HomeInstructions = NullIfWhiteSpace(request.HomeInstructions),
                PhilHealthSignSympCode = NullIfWhiteSpace(request.PhilHealthSignSympCode),
                PhilHealthOtherComplaint = NullIfWhiteSpace(request.PhilHealthOtherComplaint),
                PhilHealthPainSite = NullIfWhiteSpace(request.PhilHealthPainSite),
                RosCategory = resolvedRosCategory,
                IsSigned = false,
                CreatedAt = nowUtc,
                CreatedBy = safeDoctorName,
                UpdatedAt = nowUtc,
                UpdatedBy = safeDoctorName
            };

            ConsultationDraftPersistenceHelper.SyncWorkflowMode(
                encounter,
                request.VisitWorkflowMode,
                request.IsYakapEligible);

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
                isExistingEncounter: false,
                request.PhysicalExams,
                request.GeneralSurveyId,
                request.GeneralSurveyRemarks,
                request.PhysicalExamFindingsJson,
                repoProvider,
                cancellationToken);

            await ConsultationDraftPersistenceHelper.SyncCohortAssessmentsAsync(
                encounter,
                isExistingEncounter: false,
                request.ObGyneExam,
                request.PediatricMilestones,
                request.AdolescentAssessment,
                request.HeadsssAssessments,
                request.BpMonitoringLogs,
                repoProvider,
                cancellationToken);

            if (request.Diagnoses != null)
            {
                foreach (var diag in request.Diagnoses)
                {
                    encounter.Diagnoses.Add(new EncounterDiagnosis
                    {
                        Id = Guid.NewGuid(),
                        TenantId = encounter.TenantId,
                        ClinicId = encounter.ClinicId,
                        ConsultationEncounterId = encounter.Id,
                        Icd10Code = ConsultationPlanManagementMapper.Truncate(diag.Icd10Code.Trim().ToUpperInvariant(), 20) ?? "Z00.0",
                        Description = ConsultationPlanManagementMapper.Truncate(diag.Description, 255) ?? "Clinical diagnosis",
                        IsPrimary = diag.IsPrimary,
                        CreatedAt = nowUtc,
                        CreatedBy = encounter.DoctorName
                    });
                }
            }

            if (request.ReviewOfSystemsItems != null)
            {
                foreach (var item in BuildRosEntities(encounter, request.ReviewOfSystemsItems, resolvedRosCategory))
                {
                    encounter.ReviewOfSystemsItems.Add(item);
                }
            }

            if (request.Prescriptions != null)
            {
                foreach (var rx in request.Prescriptions)
                {
                    var rxRos = RosCategoryHelper.ParseNullable(rx.RosCategory) ?? encounter.RosCategory;
                    encounter.Prescriptions.Add(new PrescriptionItem
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
                        CreatedAt = nowUtc,
                        CreatedBy = encounter.DoctorName
                    });
                }
            }

            await _consultationRepository.AddAsync(encounter, cancellationToken);

            await ConsultationDraftPersistenceHelper.SyncDraftOrdersAndAssociateArtifactsAsync(
                encounter,
                request.DraftDiagnosticOrders,
                request.DraftProcedures,
                request.DraftDentalTeeth,
                request.DraftWorkspace,
                repoProvider,
                cancellationToken);
        }

        // Update queue item state & workflow mode if linked — preserve PendingProcedure / ReEvaluation / OnHold states!
        var targetQueueId = request.QueueItemId ?? encounter.QueueItemId;
        if (targetQueueId.HasValue)
        {
            var queueItem = await _queueRepository.Query(q =>
                q.Id == targetQueueId.Value &&
                q.ClinicId == _clinicContext.ClinicId)
                .FirstOrDefaultAsync(cancellationToken);

            if (queueItem != null)
            {
                bool modifiedQueue = false;
                if (queueItem.VisitWorkflowMode != encounter.VisitWorkflowMode)
                {
                    queueItem.VisitWorkflowMode = encounter.VisitWorkflowMode;
                    modifiedQueue = true;
                }

                if (queueItem.Status == QueueStatus.Waiting || queueItem.Status == QueueStatus.Triaged)
                {
                    queueItem.Status = QueueStatus.InConsultation;
                    queueItem.CalledTime ??= DateTime.UtcNow;
                    queueItem.DoctorId = request.DoctorId;
                    queueItem.DoctorName = ConsultationPlanManagementMapper.Truncate(request.DoctorName, 150);
                    modifiedQueue = true;
                }

                if (modifiedQueue)
                {
                    queueItem.UpdatedAt = DateTime.UtcNow;
                    _queueRepository.Update(queueItem);
                }
            }
        }

        var targetAppointmentId = request.AppointmentId ?? encounter.AppointmentId;
        if (targetAppointmentId.HasValue)
        {
            var recordingRepo = _recordingSessionRepository ?? (_unitOfWork as IRepositoryProvider)?.GetRepository<TeleconsultRecordingSession>();
            if (recordingRepo != null)
            {
                var linkedSessions = await recordingRepo.Query(s => s.AppointmentId == targetAppointmentId.Value && s.ClinicId == _clinicContext.ClinicId)
                    .ToListAsync(cancellationToken);

                foreach (var session in linkedSessions)
                {
                    if (session.ConsultationId.HasValue && session.ConsultationId.Value != encounter.Id)
                    {
                        throw new InvalidOperationException($"Recording session {session.Id} for appointment {targetAppointmentId.Value} is already linked to consultation {session.ConsultationId.Value}.");
                    }

                    if (session.ConsultationId != encounter.Id)
                    {
                        session.ConsultationId = encounter.Id;
                        session.UpdatedAt = DateTime.UtcNow;
                        recordingRepo.Update(session);
                    }
                }
            }
        }

        await _unitOfWork.SaveChangesAsync(cancellationToken);

        if (encounter.IsYakapEligible && _sequenceGenerator != null && _settingsRepository != null)
        {
            try
            {
                var settings = await _settingsRepository.Query(s => s.ClinicId == _clinicContext.ClinicId)
                    .FirstOrDefaultAsync(cancellationToken);
                var accreditationNo = !string.IsNullOrWhiteSpace(settings?.AccreditationNumber)
                    ? settings.AccreditationNumber
                    : "000000000";
                var year = encounter.EncounterDate.Year.ToString();
                var journey = await _sequenceGenerator.AssignPatientJourneyNumbersAsync(
                    _clinicContext.TenantId,
                    _clinicContext.ClinicId,
                    encounter.PatientId,
                    encounter.Id,
                    accreditationNo,
                    year,
                    cancellationToken);

                encounter.PhilHealthCaseNo = journey.CaseNumber;
                encounter.PhilHealthSoapTransNo = journey.SoapTransactionNumber;
                _consultationRepository.Update(encounter);
                await _unitOfWork.SaveChangesAsync(cancellationToken);
            }
            catch
            {
                // Graceful fallback for offline sequence generation
            }
        }

        return ConsultationPlanManagementMapper.ToDto(
            encounter,
            rxStatus: RxPharmacyStatusDto.From(encounter));
    }

    internal static string? NullIfWhiteSpace(string? value) =>
        string.IsNullOrWhiteSpace(value) ? null : value.Trim();

    internal static void ValidatePrescriptionInputs(List<PrescriptionInput>? prescriptions)
    {
        if (prescriptions == null) return;

        foreach (var rx in prescriptions)
        {
            if (rx.Quantity <= 0)
            {
                throw new BadRequestException($"Prescribed quantity for '{rx.GenericName}' must be greater than zero.");
            }

            if (rx.ClinicDispensedQuantity.HasValue)
            {
                if (rx.ClinicDispensedQuantity.Value < 0)
                {
                    throw new BadRequestException($"Clinic-dispensed quantity for '{rx.GenericName}' cannot be negative.");
                }

                if (rx.ClinicDispensedQuantity.Value > rx.Quantity)
                {
                    throw new BadRequestException($"Clinic-dispensed quantity ({rx.ClinicDispensedQuantity.Value}) cannot exceed prescribed quantity ({rx.Quantity}) for '{rx.GenericName}'.");
                }
            }
        }
    }

    internal static RosSystem? ResolveEncounterRosCategory(
        string? explicitRosCategory,
        List<ConsultationRosItemInput>? rosItems)
    {
        var parsed = RosCategoryHelper.ParseNullable(explicitRosCategory);
        if (parsed.HasValue)
        {
            return parsed.Value;
        }

        if (rosItems != null)
        {
            var positiveItems = rosItems.Where(i => i.IsPertinentPositive).ToList();
            if (positiveItems.Count == 0)
            {
                return RosSystem.EssentiallyNormal;
            }

            foreach (var item in positiveItems)
            {
                var itemSys = RosCategoryHelper.ParseNullable(item.System);
                if (itemSys.HasValue && itemSys.Value != RosSystem.EssentiallyNormal)
                {
                    return itemSys.Value;
                }

                var inferred = RosCategoryHelper.InferFromSymptom(item.SymptomName ?? item.OthersSpecifyText ?? item.OptionCode);
                if (inferred != RosSystem.EssentiallyNormal)
                {
                    return inferred;
                }
            }

            return RosSystem.General;
        }

        return null;
    }

    internal static List<EncounterReviewOfSystemsItem> BuildRosEntities(
        ConsultationEncounter encounter,
        List<ConsultationRosItemInput> inputs,
        RosSystem? fallbackSystem)
    {
        var list = new List<EncounterReviewOfSystemsItem>();

        if (inputs.Count == 0 && fallbackSystem == RosSystem.EssentiallyNormal)
        {
            list.Add(new EncounterReviewOfSystemsItem
            {
                Id = Guid.NewGuid(),
                TenantId = encounter.TenantId,
                ClinicId = encounter.ClinicId,
                ConsultationEncounterId = encounter.Id,
                System = RosSystem.EssentiallyNormal,
                SymptomCode = "00",
                SymptomTitle = "Essentially Normal",
                IsNormal = true,
                CreatedAt = DateTime.UtcNow,
                CreatedBy = encounter.DoctorName
            });
            return list;
        }

        foreach (var item in inputs)
        {
            var sys = RosCategoryHelper.ParseNullable(item.System)
                      ?? (item.IsPertinentPositive ? RosCategoryHelper.InferFromSymptom(item.SymptomName ?? item.OthersSpecifyText) : RosSystem.EssentiallyNormal);

            if (sys == RosSystem.EssentiallyNormal && item.IsPertinentPositive && fallbackSystem.HasValue && fallbackSystem.Value != RosSystem.EssentiallyNormal)
            {
                sys = fallbackSystem.Value;
            }

            var (extractedSite, cleanedRemarks) = ConsultationPlanManagementMapper.SplitPainSiteAndRemarks(item.Remarks);
            var effectivePainSite = !string.IsNullOrWhiteSpace(item.PainSite) ? item.PainSite.Trim() : extractedSite;

            var remarksParts = new List<string>();
            if (!string.IsNullOrWhiteSpace(effectivePainSite)) remarksParts.Add($"Site: {effectivePainSite}");
            if (!string.IsNullOrWhiteSpace(cleanedRemarks)) remarksParts.Add(cleanedRemarks);

            list.Add(new EncounterReviewOfSystemsItem
            {
                Id = Guid.NewGuid(),
                TenantId = encounter.TenantId,
                ClinicId = encounter.ClinicId,
                ConsultationEncounterId = encounter.Id,
                System = sys,
                SymptomCode = ConsultationPlanManagementMapper.Truncate(item.OptionCode, 20) ?? "00",
                SymptomTitle = ConsultationPlanManagementMapper.Truncate(item.SymptomName, 255)
                               ?? ConsultationPlanManagementMapper.Truncate(RosCategoryHelper.ToDisplayLabel(sys), 255),
                IsNormal = !item.IsPertinentPositive,
                OtherSpecification = NullIfWhiteSpace(item.OthersSpecifyText),
                Remarks = remarksParts.Count > 0
                    ? ConsultationPlanManagementMapper.Truncate(string.Join("; ", remarksParts), 500)
                    : null,
                CreatedAt = DateTime.UtcNow,
                CreatedBy = encounter.DoctorName
            });
        }

        return list;
    }
}
