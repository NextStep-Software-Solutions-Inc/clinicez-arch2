using System;
using System.Collections.Generic;
using System.Linq;
using System.Text.Json;
using System.Threading;
using System.Threading.Tasks;
using ClinicEz.Clinic.Application.Features.Allergies.Dtos;
using ClinicEz.Clinic.Application.Features.Billing.DTOs;
using ClinicEz.Clinic.Application.Features.Consultations.DTOs;
using ClinicEz.Clinic.Application.Features.Dental.DTOs;
using ClinicEz.Clinic.Application.Features.Immunizations.DTOs;
using ClinicEz.Clinic.Application.Features.LabOrders.Commands;
using ClinicEz.Clinic.Application.Features.LabOrders.DTOs;
using ClinicEz.Clinic.Application.Features.Patients.DTOs;
using ClinicEz.Clinic.Application.Features.Problems.Dtos;
using ClinicEz.Clinic.Application.Features.Procedures.DTOs;
using ClinicEz.Clinic.Application.Features.Records.DTOs;
using ClinicEz.Clinic.Application.Features.Triage.DTOs;
using ClinicEz.Clinic.Application.Features.Yakap.DTOs;
using ClinicEz.Clinic.Domain.Entities;
using ClinicEz.Clinic.Domain.Interfaces;
using ClinicEz.Shared.Exceptions;
using MediatR;
using Microsoft.EntityFrameworkCore;

namespace ClinicEz.Clinic.Application.Features.Patients.Queries;

public record GetPatientChartQuery(Guid PatientId) : IRequest<PatientChartDto>;

public class GetPatientChartQueryHandler : IRequestHandler<GetPatientChartQuery, PatientChartDto>
{
    private readonly IRepository<ConsultationEncounter> _consultationRepo;
    private readonly IRepository<TriageVitals> _triageRepo;
    private readonly IRepository<ClinicalProcedure> _procedureRepo;
    private readonly IRepository<ClinicLabOrder> _labOrderRepo;
    private readonly IRepository<Invoice> _invoiceRepo;
    private readonly IClinicContext _clinicContext;
    private readonly IRepository<PatientSurgicalHistory>? _surgicalRepo;
    private readonly IRepository<PatientSocialHistory>? _socialRepo;
    private readonly IRepository<PatientReproductiveHistory>? _reproductiveRepo;
    private readonly IRepository<NcdRiskAssessment>? _ncdRepo;
    private readonly Services.ILegacyPatientProfileIngestionService? _legacyIngestion;
    private readonly IRepository<ClinicPatient>? _patientRepo;
    private readonly IRepository<PatientProblem>? _problemRepo;
    private readonly IRepository<PatientAllergy>? _allergyRepo;
    private readonly IRepository<PatientImmunization>? _immunizationRepo;
    private readonly IRepository<ClinicRecordAttachment>? _attachmentRepo;
    private readonly IRepository<PatientPhysicalExamProfile>? _physicalExamRepo;
    private readonly IRepository<DentalToothRecord>? _dentalToothRepo;

    public GetPatientChartQueryHandler(
        IRepository<ConsultationEncounter> consultationRepo,
        IRepository<TriageVitals> triageRepo,
        IRepository<ClinicalProcedure> procedureRepo,
        IRepository<ClinicLabOrder> labOrderRepo,
        IRepository<Invoice> invoiceRepo,
        IClinicContext clinicContext,
        IRepository<PatientSurgicalHistory>? surgicalRepo = null,
        IRepository<PatientSocialHistory>? socialRepo = null,
        IRepository<PatientReproductiveHistory>? reproductiveRepo = null,
        IRepository<NcdRiskAssessment>? ncdRepo = null,
        Services.ILegacyPatientProfileIngestionService? legacyIngestion = null,
        IRepository<ClinicPatient>? patientRepo = null,
        IRepository<PatientProblem>? problemRepo = null,
        IRepository<PatientAllergy>? allergyRepo = null,
        IRepository<PatientImmunization>? immunizationRepo = null,
        IRepository<ClinicRecordAttachment>? attachmentRepo = null,
        IRepository<PatientPhysicalExamProfile>? physicalExamRepo = null,
        IRepository<DentalToothRecord>? dentalToothRepo = null)
    {
        _consultationRepo = consultationRepo;
        _triageRepo = triageRepo;
        _procedureRepo = procedureRepo;
        _labOrderRepo = labOrderRepo;
        _invoiceRepo = invoiceRepo;
        _clinicContext = clinicContext;
        _surgicalRepo = surgicalRepo;
        _socialRepo = socialRepo;
        _reproductiveRepo = reproductiveRepo;
        _ncdRepo = ncdRepo;
        _legacyIngestion = legacyIngestion;
        _patientRepo = patientRepo;
        _problemRepo = problemRepo;
        _allergyRepo = allergyRepo;
        _immunizationRepo = immunizationRepo;
        _attachmentRepo = attachmentRepo;
        _physicalExamRepo = physicalExamRepo;
        _dentalToothRepo = dentalToothRepo;
    }

    public async Task<PatientChartDto> Handle(GetPatientChartQuery request, CancellationToken cancellationToken)
    {
        if (request.PatientId == Guid.Empty)
        {
            throw new BadRequestException("PatientId is required to query patient chart.");
        }

        // Consultations
        var consultations = await _consultationRepo.Query(c => c.PatientId == request.PatientId)
            .Include(c => c.Diagnoses)
            .Include(c => c.Prescriptions)
            .OrderByDescending(c => c.EncounterDate)
            .ToListAsync(cancellationToken);

        // Vitals
        var vitals = await _triageRepo.Query(v => v.PatientId == request.PatientId)
            .OrderByDescending(v => v.RecordedAt)
            .ToListAsync(cancellationToken);

        // Procedures
        var procedures = await _procedureRepo.Query(p => p.PatientId == request.PatientId)
            .OrderByDescending(p => p.ScheduledAt)
            .ToListAsync(cancellationToken);

        // Lab Orders
        var labOrders = await _labOrderRepo.Query(l => l.PatientId == request.PatientId)
            .Include(l => l.Items)
            .OrderByDescending(l => l.OrderDate)
            .ToListAsync(cancellationToken);

        // Invoices
        var invoices = await _invoiceRepo.Query(i => i.PatientId == request.PatientId)
            .Include(i => i.LineItems)
            .Include(i => i.Payments)
            .OrderByDescending(i => i.InvoiceDate)
            .ToListAsync(cancellationToken);

        // Demographics & Verified Patient Profile
        ClinicPatient? patient = null;
        if (_patientRepo != null)
        {
            patient = await _patientRepo.Query(p => p.Id == request.PatientId)
                .AsNoTracking()
                .FirstOrDefaultAsync(cancellationToken);
        }

        string patientName;
        PatientDemographicsDto? demographicsDto = null;

        if (patient != null)
        {
            var middleInitial = !string.IsNullOrWhiteSpace(patient.MiddleName) ? $" {patient.MiddleName[0]}." : "";
            var suffix = !string.IsNullOrWhiteSpace(patient.Suffix) ? $" {patient.Suffix}" : "";
            patientName = $"{patient.LastName}, {patient.FirstName}{middleInitial}{suffix}";

            var today = DateOnly.FromDateTime(DateTime.UtcNow);
            var age = today.Year - patient.DateOfBirth.Year;
            if (patient.DateOfBirth > today.AddYears(-age)) age--;

            var customProfile = ExtractCustomProfile(patient);
            var memberStatus = ResolveMemberStatus(patient, customProfile);

            var atc = consultations.FirstOrDefault(c => !string.IsNullOrWhiteSpace(c.PhilHealthAtc))?.PhilHealthAtc
                ?? customProfile?.Atc
                ?? (string.IsNullOrWhiteSpace(patient.PhilHealthNumber) ? null : "A");

            var activeCaseNo = !string.IsNullOrWhiteSpace(patient.PhilHealthCaseNo)
                ? patient.PhilHealthCaseNo
                : consultations.FirstOrDefault(c => !string.IsNullOrWhiteSpace(c.PhilHealthCaseNo))?.PhilHealthCaseNo
                ?? (string.IsNullOrWhiteSpace(patient.PhilHealthNumber) ? null : $"C{patient.PatientCode.Replace("-", string.Empty)}");

            demographicsDto = new PatientDemographicsDto(
                Dob: patient.DateOfBirth,
                Age: age,
                Gender: patient.Gender,
                CivilStatus: patient.CivilStatus,
                ContactNumber: patient.ContactNumber,
                Email: patient.Email,
                AddressLine: patient.AddressLine,
                Barangay: patient.Barangay,
                City: patient.City,
                Province: patient.Province,
                PhilHealthNumber: !string.IsNullOrWhiteSpace(patient.PhilHealthNumber) ? patient.PhilHealthNumber : customProfile?.Pin,
                SeniorCitizenId: patient.SeniorCitizenId,
                PwdId: patient.PwdId,
                BloodType: !string.IsNullOrWhiteSpace(patient.BloodType) ? patient.BloodType : customProfile?.BloodType,
                MemberStatus: memberStatus,
                PhilHealthAtc: atc,
                ActiveCaseNo: activeCaseNo,
                EmergencyContactName: patient.EmergencyContactName,
                EmergencyContactPhone: patient.EmergencyContactPhone,
                EmergencyContactRelationship: patient.EmergencyContactRelationship,
                Alerts: patient.Alerts,
                PatientCode: patient.PatientCode,
                ClinicEzId: patient.ClinicEzId,
                VerificationStatus: patient.VerificationStatus ?? "Verified"
            );
        }
        else
        {
            patientName = consultations.FirstOrDefault()?.PatientName
                ?? vitals.FirstOrDefault()?.QueueItem?.PatientName
                ?? procedures.FirstOrDefault()?.PatientName
                ?? invoices.FirstOrDefault()?.PatientName
                ?? "Registered Patient";
        }

        // Problems
        var problemDtos = new List<PatientProblemDto>();
        if (_problemRepo != null)
        {
            var problems = await _problemRepo.Query(p => p.PatientId == request.PatientId)
                .AsNoTracking()
                .OrderByDescending(p => p.OnsetDate ?? DateOnly.MinValue)
                .ThenByDescending(p => p.CreatedAt)
                .ToListAsync(cancellationToken);

            problemDtos = problems.Select(p => new PatientProblemDto(
                p.Id,
                p.ClinicId,
                p.PatientId,
                p.ConsultationEncounterId,
                p.Icd10Code,
                p.ProblemTitle,
                p.PhilHealthMdiseaseCode,
                p.Status.ToString(),
                p.Severity.ToString(),
                p.IsChronicNcd,
                p.OnsetDate,
                p.ResolvedDate,
                p.ClinicalNotes,
                p.RecordedByDoctorId,
                p.RecordedByDoctorName,
                p.CreatedAt
            )).ToList();
        }

        // Allergies
        var allergyDtos = new List<PatientAllergyDto>();
        if (_allergyRepo != null)
        {
            var allergies = await _allergyRepo.Query(a => a.PatientId == request.PatientId)
                .AsNoTracking()
                .OrderByDescending(a => a.IsAnaphylactic)
                .ThenBy(a => a.Allergen)
                .ToListAsync(cancellationToken);

            allergyDtos = allergies.Select(a => new PatientAllergyDto(
                a.Id,
                a.ClinicId,
                a.PatientId,
                a.Category.ToString(),
                a.Allergen,
                a.AllergenDrugCode,
                a.Severity.ToString(),
                a.ReactionManifestation,
                a.IsAnaphylactic,
                a.Status.ToString(),
                a.OnsetDate,
                a.Notes,
                a.CreatedAt
            )).ToList();
        }

        if (_legacyIngestion != null)
        {
            await _legacyIngestion.EnsureIngestedAsync(request.PatientId, cancellationToken);
        }

        // Immunizations
        var immunizationDtos = new List<PatientImmunizationDto>();
        if (_immunizationRepo != null)
        {
            immunizationDtos = await _immunizationRepo.Query(i => i.PatientId == request.PatientId)
                .AsNoTracking()
                .OrderByDescending(i => i.AdministeredAtUtc)
                .Select(i => new PatientImmunizationDto(
                    i.Id,
                    i.PatientId,
                    i.PatientName,
                    i.ConsultationEncounterId,
                    i.PhilHealthLibrary,
                    i.PhilHealthCode,
                    i.VaccineName,
                    i.BrandName,
                    i.Manufacturer,
                    i.LotBatchNumber,
                    i.ExpirationDate,
                    i.DoseSequence,
                    i.IsSeriesCompleted,
                    i.Route,
                    i.InjectionSite,
                    i.AdministeredAtUtc,
                    i.AdministeredByStaffId,
                    i.AdministeredByStaffName,
                    i.AdministeredByPrcLicense,
                    i.HasAdverseReaction,
                    i.AdverseReactionSeverity,
                    i.AdverseReactionRemarks,
                    i.AdverseReactionRecordedAtUtc,
                    i.IsHistorical,
                    i.HistoricalFacilityName,
                    i.Remarks,
                    i.IsSynchronizedToPatientApp,
                    i.SynchronizedAtUtc
                ))
                .ToListAsync(cancellationToken);
        }

        // Attachments
        var attachmentDtos = new List<ClinicRecordAttachmentDto>();
        if (_attachmentRepo != null)
        {
            var attachments = await _attachmentRepo.Query(a => a.PatientId == request.PatientId)
                .AsNoTracking()
                .OrderByDescending(a => a.DocumentDate)
                .ThenByDescending(a => a.CreatedAt)
                .ToListAsync(cancellationToken);

            attachmentDtos = attachments.Select(a => new ClinicRecordAttachmentDto(
                a.Id,
                a.TenantId,
                a.ClinicId,
                a.PatientId,
                a.ConsultationId,
                a.RecordType,
                a.Title,
                a.FileName,
                a.ContentType,
                a.FileSizeBytes,
                a.StorageUri,
                a.DocumentDate,
                a.Notes,
                a.UploadedByStaffId,
                a.UploadedByStaffName,
                a.CreatedAt,
                a.VerificationStatus,
                a.RejectionReason,
                a.VerifiedAt,
                a.VerifiedByStaffId,
                a.VerifiedByStaffName,
                a.EncryptionAlgorithm,
                a.EncryptionKeyId,
                a.EncryptedSizeBytes,
                a.EncryptedHash
            )).ToList();
        }

        // Dental Tooth Records
        var dentalToothDtos = new List<DentalToothRecordDto>();
        if (_dentalToothRepo != null)
        {
            var dentalRecords = await _dentalToothRepo
                .Query(t => t.ClinicId == _clinicContext.ClinicId && t.PatientId == request.PatientId && !t.IsDeleted)
                .AsNoTracking()
                .OrderBy(t => t.ToothNumber)
                .ThenBy(t => t.CreatedAt)
                .ToListAsync(cancellationToken);

            dentalToothDtos = dentalRecords.Select(r => new DentalToothRecordDto(
                r.Id,
                r.TenantId ?? _clinicContext.TenantId,
                r.ClinicId,
                r.PatientId,
                r.ConsultationId,
                r.ToothNumber,
                r.Status,
                r.Surface,
                r.Notes,
                r.CreatedAt,
                r.UpdatedAt,
                r.PatientName,
                r.RecordedBy ?? r.UpdatedBy ?? r.CreatedBy,
                r.IsCurrent && !r.IsVoided ? (r.ActiveSurface ?? r.Surface) : null,
                r.IsCurrent && !r.IsVoided,
                r.SupersededAt,
                r.SupersededByRecordId,
                r.IsVoided,
                r.VoidedAt,
                r.VoidedBy,
                r.VoidReason
            )).ToList();
        }

        var dentalFindingsByConsultationId = dentalToothDtos
            .Where(d => d.ConsultationId.HasValue)
            .GroupBy(d => d.ConsultationId!.Value)
            .ToDictionary(g => g.Key, g => g.ToList());

        var consultationDtos = consultations.Select(c =>
        {
            var encounterFindings = new List<DentalToothRecordDto>();
            if (dentalFindingsByConsultationId.TryGetValue(c.Id, out var findings))
            {
                encounterFindings.AddRange(findings);
            }

            var dateMatches = dentalToothDtos
                .Where(d => !d.ConsultationId.HasValue && DateOnly.FromDateTime(d.CreatedAt) == DateOnly.FromDateTime(c.EncounterDate));
            encounterFindings.AddRange(dateMatches);

            return new ConsultationEncounterDto(
                c.Id,
                c.TenantId ?? _clinicContext.TenantId,
                c.ClinicId,
                c.QueueItemId,
                c.AppointmentId,
                c.PatientId,
                c.PatientName,
                c.DoctorId,
                c.DoctorName,
                c.EncounterDate,
                c.Subjective,
                c.Objective,
                c.Assessment,
                c.Plan,
                c.HomeInstructions,
                c.DoctorPrcLicense,
                c.DoctorPtr,
                c.DoctorS2License,
                c.IsSigned,
                c.SignedAt,
                c.Diagnoses.Select(d => new EncounterDiagnosisDto(d.Id, d.Icd10Code, d.Description, d.IsPrimary)).ToList(),
                c.Prescriptions.Select(p => new PrescriptionItemDto(
                    p.Id,
                    p.GenericName,
                    p.BrandName,
                    p.Dosage,
                    p.Form,
                    p.Sig,
                    p.Quantity,
                    p.DurationDays,
                    p.Refills,
                    p.IsDangerousDrug,
                    p.Remarks,
                    p.PhilHealthDrugCode
                )).ToList(),
                c.IsYakapEligible,
                c.PhilHealthSignSympCode,
                c.PhilHealthOtherComplaint,
                c.PhilHealthPainSite,
                c.PhilHealthCaseNo ?? c.HciCaseNo,
                c.PhilHealthSoapTransNo ?? c.SoapTransNo,
                c.DoctorPhilHealthPan,
                c.PhilHealthAtc,
                c.HciCaseNo ?? c.PhilHealthCaseNo,
                c.HciTransNo,
                c.SoapTransNo ?? c.PhilHealthSoapTransNo,
                c.GeneralSurveyId,
                c.GeneralSurveyRemarks,
                c.PhysicalExamFindingsJson,
                DentalFindings: encounterFindings.Count > 0 ? encounterFindings : null
            );
        }).ToList();

        var vitalsDtos = vitals.Select(v => new TriageVitalsDto(
            v.Id,
            v.TenantId ?? _clinicContext.TenantId,
            v.ClinicId,
            v.QueueItemId,
            v.PatientId,
            v.NurseId,
            v.RecordedByNurseName,
            v.RecordedAt,
            v.SystolicBp,
            v.DiastolicBp,
            v.HeartRateBpm,
            v.TemperatureCelsius,
            v.RespiratoryRateBreathsPerMin,
            v.OxygenSaturationPercent,
            v.HeightCm,
            v.WeightKg,
            v.Bmi,
            v.PainScore,
            v.Notes,
            v.VisualAcuityLeft,
            v.VisualAcuityRight,
            v.HeadCircumferenceCm,
            v.MidUpperArmCircumferenceCm,
            v.IsMeasuredRecumbent,
            v.ZScoreWeightForAge,
            v.ZScoreLengthForAge,
            v.ZScoreWeightForLength,
            v.GrowthZScoreCategory,
            v.GrowthZScoreCode,
            v.WaistCircumferenceCm,
            v.HipCircumferenceCm,
            v.BodyLengthCm,
            v.SkinfoldThicknessMm,
            v.LimbsCircumferenceCm,
            v.PreAssessmentNotes,
            v.PreAssessmentRemarks,
            v.TriageAcuityReason
        )).ToList();

        var procedureDtos = procedures.Select(p => new ClinicalProcedureDto(
            p.Id,
            p.TenantId ?? _clinicContext.TenantId,
            p.ClinicId,
            p.PatientId,
            p.PatientName,
            p.QueueItemId,
            p.ConsultationId,
            p.ProcedureCode,
            p.ProcedureName,
            p.Category,
            p.OrderedByDoctorId,
            p.OrderedByDoctorName,
            p.PerformedByStaffId,
            p.PerformedByStaffName,
            p.PerformedAt,
            p.ScheduledAt,
            p.Status,
            p.PreProcedureVitalsJson,
            p.PostProcedureVitalsJson,
            p.MedicationAdministered,
            p.LotNumber,
            p.ExpirationDate,
            p.SiteRoute,
            p.ClinicalNotes,
            p.Complications,
            p.TargetRoomId,
            p.TargetRoomName,
            p.ToothNumber,
            p.ToothSurface
        )).ToList();

        var labOrderDtos = labOrders.Select(o => CreateClinicLabOrderCommandHandler.MapToDto(o)).ToList();

        var invoiceDtos = invoices.Select(i => new InvoiceDto(
            i.Id,
            i.TenantId ?? _clinicContext.TenantId,
            i.ClinicId,
            i.InvoiceNumber,
            i.InvoiceDate,
            i.PatientId,
            i.PatientName,
            i.QueueItemId,
            i.AppointmentId,
            i.ConsultationId,
            i.AttendingDoctorId,
            i.GrossAmount,
            i.DiscountType,
            i.DiscountIdNumber,
            i.DiscountPercentage,
            i.DiscountAmount,
            i.NetAmount,
            i.AmountPaid,
            i.BalanceDue,
            i.Status,
            i.Notes,
            i.BilledByStaffName,
            i.LineItems.Select(li => new InvoiceLineItemDto(
                li.Id,
                li.DoctorId,
                li.DoctorName,
                li.ServiceItemId,
                li.ItemCode,
                li.Description,
                li.Category,
                li.UnitPrice,
                li.Quantity,
                li.TotalPrice
            )).ToList(),
            i.Payments.Select(p => new PaymentRecordDto(
                p.Id,
                p.PaymentNumber,
                p.PaymentDate,
                p.Amount,
                p.Method,
                p.ReferenceNumber,
                p.ReceivedByStaffName,
                p.Notes
            )).ToList()
        )).ToList();

        // Relational Patient Profile Histories
        List<PatientSurgicalHistoryDto>? surgicalDtos = null;
        PatientSocialHistoryDto? socialDto = null;
        PatientReproductiveHistoryDto? reproductiveDto = null;
        NcdRiskAssessmentDto? latestNcdDto = null;

        if (_legacyIngestion != null)
        {
            await _legacyIngestion.EnsureIngestedAsync(request.PatientId, cancellationToken);
        }

        if (_surgicalRepo != null)
        {
            var surgeries = await _surgicalRepo.Query(s => s.PatientId == request.PatientId)
                .OrderByDescending(s => s.SurgeryDate)
                .ToListAsync(cancellationToken);
            surgicalDtos = surgeries.Select(s => new PatientSurgicalHistoryDto(
                s.Id, s.PatientId, s.ProcedureName, s.SurgeryDate, s.HospitalName, s.Findings, s.Complications, s.Remarks)).ToList();
        }

        if (_socialRepo != null)
        {
            var social = await _socialRepo.Query(s => s.PatientId == request.PatientId).FirstOrDefaultAsync(cancellationToken);
            if (social != null)
            {
                socialDto = new PatientSocialHistoryDto(
                    social.Id, social.PatientId, social.IsSmoker, social.PacksPerDay, social.CigarettesPerDay,
                    social.YearsSmoking, social.SmokingPackYears, social.SmokingStoppedDate, social.IsAlcoholDrinker,
                    social.AlcoholDrinksPerWeek, social.AlcoholBottlesPerDay, social.AlcoholFrequency, social.UsesIllicitDrugs,
                    social.SubstanceUseHistory, social.DrugTypes, social.IsSexuallyActive, social.CoitarcheAge,
                    social.PhysicalActivityFrequency, social.DietaryHabits, social.Remarks,
                    social.SmokingStatus, social.AlcoholStatus);
            }

        }

        if (_reproductiveRepo != null)
        {
            var repro = await _reproductiveRepo.Query(r => r.PatientId == request.PatientId).FirstOrDefaultAsync(cancellationToken);
            if (repro != null)
            {
                reproductiveDto = new PatientReproductiveHistoryDto(
                    repro.Id, repro.PatientId, repro.IsApplicable, repro.MenarcheAge, repro.LastMenstrualPeriod,
                    repro.PeriodDurationDays, repro.CycleIntervalDays, repro.PadsPerDay, repro.IsMenopausal, repro.MenopauseAge,
                    repro.ContraceptiveMethod, repro.Gravidity, repro.Parity, repro.TermBirths, repro.PretermBirths,
                    repro.Abortions, repro.LivingChildren, repro.DeliveryType, repro.HadPreEclampsiaHypertension,
                    repro.ReceivedFamilyPlanningCounseling, repro.Remarks);
            }
        }

        if (_ncdRepo != null)
        {
            var ncd = await _ncdRepo.Query(n => n.PatientId == request.PatientId)
                .OrderByDescending(n => n.AssessmentDate)
                .FirstOrDefaultAsync(cancellationToken);
            if (ncd != null)
            {
                latestNcdDto = new NcdRiskAssessmentDto(
                    ncd.Id, ncd.PatientId, ncd.ConsultationEncounterId, ncd.AssessmentDate, ncd.AssessedByStaffId,
                    ncd.AssessedByStaffName, ncd.EatsProcessedFoodWeekly, ncd.ThreeServingsVegetablesDaily,
                    ncd.TwoToThreeServingsFruitDaily, ncd.PhysicalActivityAtLeast150MinsWeekly, ncd.DiagnosedDiabetes,
                    ncd.HasPolyphagia, ncd.HasPolydipsia, ncd.HasPolyuria, ncd.DiabetesMedicationStatus,
                    ncd.HasRaisedBloodGlucose, ncd.FastingBloodSugarMgDl, ncd.FastingBloodSugarMmolL,
                    ncd.FastingBloodSugarDate, ncd.HasChestPain, ncd.PainInCenterOfChestOrLeftArm,
                    ncd.PainWhenWalkingUphill, ncd.SlowsDownWhenPainOccurs, ncd.PainRelievedWithin10Mins,
                    ncd.PainRelievedByNitrates, ncd.SevereChestPainOver30Mins, ncd.TransientNeurologicalDeficits,
                    ncd.HasRaisedBloodLipids, ncd.TotalCholesterolMgDl, ncd.TotalCholesterolDate,
                    ncd.HasHistoryAnginaHeartAttack, ncd.HasHistoryStrokeOrTia, ncd.UrineKetonesPresent,
                    ncd.UrineKetonesValue, ncd.UrineKetonesDate, ncd.UrineProteinPresent, ncd.UrineProteinValue,
                    ncd.UrineProteinDate, ncd.RiskBand, ncd.CalculatedRiskScorePercent, ncd.Remarks, ncd.CreatedAt);
            }
        }

        PatientPhysicalExamProfileDto? physicalExamDto = null;
        if (_physicalExamRepo != null)
        {
            var pe = await _physicalExamRepo.Query(p => p.PatientId == request.PatientId).FirstOrDefaultAsync(cancellationToken);
            if (pe != null)
            {
                physicalExamDto = new PatientPhysicalExamProfileDto(
                    pe.Id,
                    pe.PatientId,
                    pe.GenSurveyId,
                    pe.GenSurveyRemarks,
                    pe.SkinId,
                    pe.SkinRemarks,
                    pe.HeentId,
                    pe.HeentRemarks,
                    pe.ChestId,
                    pe.ChestRemarks,
                    pe.HeartId,
                    pe.HeartRemarks,
                    pe.AbdomenId,
                    pe.AbdomenRemarks,
                    pe.NeuroId,
                    pe.NeuroRemarks,
                    pe.RectalId,
                    pe.RectalRemarks,
                    pe.GuId,
                    pe.GuRemarks,
                    pe.CreatedAt,
                    pe.UpdatedAt
                );
            }
        }

        return new PatientChartDto(
            request.PatientId,
            patientName,
            consultations.Count,
            consultationDtos,
            vitalsDtos,
            procedureDtos,
            labOrderDtos,
            invoiceDtos,
            surgicalDtos,
            socialDto,
            reproductiveDto,
            latestNcdDto,
            demographicsDto,
            problemDtos,
            allergyDtos,
            immunizationDtos,
            attachmentDtos,
            PhysicalExamProfile: physicalExamDto,
            DentalTeeth: dentalToothDtos,
            DentalProcedures: procedureDtos.Where(p => p.Category == "Dental" || p.ToothNumber.HasValue).ToList()
        );
    }

    private static PhilHealthPatientProfileDto? ExtractCustomProfile(ClinicPatient patient)
    {
        if (patient.CustomFields == null || !patient.CustomFields.TryGetValue("philhealth_profile", out var profObj) || profObj == null)
            return null;

        if (profObj is PhilHealthPatientProfileDto typed)
            return typed;

        try
        {
            var json = profObj.ToString();
            if (!string.IsNullOrWhiteSpace(json))
            {
                return JsonSerializer.Deserialize<PhilHealthPatientProfileDto>(json,
                    new JsonSerializerOptions { PropertyNameCaseInsensitive = true });
            }
        }
        catch
        {
            // Fall through gracefully
        }

        return null;
    }

    private static string? ResolveMemberStatus(ClinicPatient patient, PhilHealthPatientProfileDto? customProfile)
    {
        if (!string.IsNullOrWhiteSpace(customProfile?.MemberType))
        {
            return customProfile.MemberType.Equals("DD", StringComparison.OrdinalIgnoreCase) ? "Dependent" : "Member";
        }

        if (patient.CustomFields != null)
        {
            if (patient.CustomFields.TryGetValue("member_status", out var ms) && ms != null && !string.IsNullOrWhiteSpace(ms.ToString()))
                return ms.ToString();

            if (patient.CustomFields.TryGetValue("member_type", out var mt) && mt != null && !string.IsNullOrWhiteSpace(mt.ToString()))
                return mt.ToString()!.Equals("DD", StringComparison.OrdinalIgnoreCase) ? "Dependent" : "Member";
        }

        if (!string.IsNullOrWhiteSpace(patient.PhilHealthNumber))
            return "Member";

        return "Non-Member";
    }
}
