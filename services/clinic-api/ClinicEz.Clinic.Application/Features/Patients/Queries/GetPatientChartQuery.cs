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
using ClinicEz.Clinic.Application.Features.Documents.DTOs;
using ClinicEz.Clinic.Application.Features.Immunizations.DTOs;
using ClinicEz.Clinic.Application.Features.LabOrders.Commands;
using ClinicEz.Clinic.Application.Features.LabOrders.DTOs;
using ClinicEz.Clinic.Application.Features.Patients.DTOs;
using ClinicEz.Clinic.Application.Features.Problems.Dtos;
using ClinicEz.Clinic.Application.Features.Procedures.DTOs;
using ClinicEz.Clinic.Application.Features.Records.DTOs;
using ClinicEz.Clinic.Application.Features.Triage.DTOs;
using ClinicEz.Clinic.Domain.Entities;
using ClinicEz.Clinic.Domain.Enums;
using ClinicEz.Clinic.Domain.Interfaces;
using ClinicEz.Shared.Exceptions;
using MediatR;
using Microsoft.EntityFrameworkCore;

namespace ClinicEz.Clinic.Application.Features.Patients.Queries;

public record GetPatientChartQuery(Guid PatientId) : IRequest<PatientChartDto>;

public class GetPatientChartQueryHandler : IRequestHandler<GetPatientChartQuery, PatientChartDto>
{
    private readonly IRepository<ConsultationEncounter> _consultationRepo;
    private readonly IRepository<PatientVitals> _triageRepo;
    private readonly IRepository<Procedure> _procedureRepo;
    private readonly IRepository<LabOrder> _labOrderRepo;
    private readonly IRepository<Invoice> _invoiceRepo;
    private readonly IClinicContext _clinicContext;
    private readonly IRepository<PatientSurgicalHistory>? _surgicalRepo;
    private readonly IRepository<PatientSocialHistory>? _socialRepo;
    private readonly IRepository<PatientReproductiveHistory>? _reproductiveRepo;
    private readonly IRepository<NcdRiskAssessment>? _ncdRepo;
    private readonly IRepository<Patient>? _patientRepo;
    private readonly IRepository<PatientMedicalHistory>? _medicalHistoryRepo;
    private readonly IRepository<PatientAllergy>? _allergyRepo;
    private readonly IRepository<PatientImmunization>? _immunizationRepo;
    private readonly IRepository<RecordAttachment>? _attachmentRepo;
    private readonly IRepository<PatientPhysicalExam>? _physicalExamRepo;
    private readonly IRepository<DentalToothRecord>? _dentalToothRepo;
    private readonly IRepository<MedicalCertificate>? _medCertRepo;
    private readonly IRepository<ReferralLetter>? _referralRepo;
    private readonly IRepository<PatientPhilHealthMembership>? _membershipRepo;
    private readonly IRepository<PatientYakapEnlistment>? _enlistmentRepo;
    private readonly IRepository<PatientAlert>? _alertRepo;

    public GetPatientChartQueryHandler(
        IRepository<ConsultationEncounter> consultationRepo,
        IRepository<PatientVitals> triageRepo,
        IRepository<Procedure> procedureRepo,
        IRepository<LabOrder> labOrderRepo,
        IRepository<Invoice> invoiceRepo,
        IClinicContext clinicContext,
        IRepository<PatientSurgicalHistory>? surgicalRepo = null,
        IRepository<PatientSocialHistory>? socialRepo = null,
        IRepository<PatientReproductiveHistory>? reproductiveRepo = null,
        IRepository<NcdRiskAssessment>? ncdRepo = null,
        IRepository<Patient>? patientRepo = null,
        IRepository<PatientMedicalHistory>? medicalHistoryRepo = null,
        IRepository<PatientAllergy>? allergyRepo = null,
        IRepository<PatientImmunization>? immunizationRepo = null,
        IRepository<RecordAttachment>? attachmentRepo = null,
        IRepository<PatientPhysicalExam>? physicalExamRepo = null,
        IRepository<DentalToothRecord>? dentalToothRepo = null,
        IRepository<MedicalCertificate>? medCertRepo = null,
        IRepository<ReferralLetter>? referralRepo = null,
        IRepository<PatientPhilHealthMembership>? membershipRepo = null,
        IRepository<PatientYakapEnlistment>? enlistmentRepo = null,
        IRepository<PatientAlert>? alertRepo = null,
        IRepository<PatientMedicalHistory>? problemRepo = null)
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
        _patientRepo = patientRepo;
        _medicalHistoryRepo = medicalHistoryRepo ?? problemRepo;
        _allergyRepo = allergyRepo;
        _immunizationRepo = immunizationRepo;
        _attachmentRepo = attachmentRepo;
        _physicalExamRepo = physicalExamRepo;
        _dentalToothRepo = dentalToothRepo;
        _medCertRepo = medCertRepo;
        _referralRepo = referralRepo;
        _membershipRepo = membershipRepo;
        _enlistmentRepo = enlistmentRepo;
        _alertRepo = alertRepo;
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
        Patient? patient = null;
        if (_patientRepo != null)
        {
            patient = await _patientRepo.Query(p => p.Id == request.PatientId)
                .AsNoTracking()
                .FirstOrDefaultAsync(cancellationToken);
        }

        // 1NF Collections
        PatientPhilHealthMembershipDto? philhealthDto = null;
        if (_membershipRepo != null)
        {
            var mem = await _membershipRepo.Query(m => m.PatientId == request.PatientId).FirstOrDefaultAsync(cancellationToken);
            if (mem != null)
            {
                philhealthDto = new PatientPhilHealthMembershipDto(
                    mem.Id,
                    mem.MemberType.ToString(),
                    mem.DependentRelationship?.ToString(),
                    mem.MemberPin,
                    mem.PrincipalMemberPin,
                    mem.PrincipalLastName,
                    mem.PrincipalFirstName,
                    mem.PrincipalMiddleName,
                    mem.PrincipalSuffix,
                    mem.PrincipalDateOfBirth,
                    mem.PrincipalSex?.ToString(),
                    mem.MembershipCategoryCode,
                    mem.MembershipCategoryDesc,
                    mem.EmployerPin,
                    mem.EmployerName,
                    mem.DefaultWalkInAtc
                );
            }
        }

        List<PatientYakapEnlistmentDto>? enlistmentDtos = null;
        if (_enlistmentRepo != null)
        {
            var enlistments = await _enlistmentRepo.Query(e => e.PatientId == request.PatientId)
                .OrderByDescending(e => e.EnlistmentDate)
                .ToListAsync(cancellationToken);
            enlistmentDtos = enlistments.Select(e => new PatientYakapEnlistmentDto(
                e.Id,
                e.EffectiveYear,
                e.Status.ToString(),
                e.Source.ToString(),
                e.PackageType.ToString(),
                e.EnlistmentDate,
                e.ValidUntil,
                e.CaseNo,
                e.EnlistmentTransNo,
                e.ProfilingTransNo,
                e.ProfilingDate,
                e.ProfilingAtc,
                e.IsWalkedIn,
                e.HasPatientConsent,
                e.ConsentSignedAtUtc,
                e.CreatedByStaffId,
                e.CreatedByStaffName,
                e.EnlistmentTransDate
            )).ToList();
        }

        List<PatientAlertDto>? alertDtos = null;
        if (_alertRepo != null)
        {
            var alerts = await _alertRepo.Query(a => a.PatientId == request.PatientId)
                .OrderByDescending(a => a.Severity)
                .ThenByDescending(a => a.CreatedAt)
                .ToListAsync(cancellationToken);
            alertDtos = alerts.Select(a => new PatientAlertDto(
                a.Id,
                a.Category.ToString(),
                a.Code,
                a.Title,
                a.Severity.ToString(),
                a.Status.ToString(),
                a.ExpiresAt,
                a.Notes,
                a.RecordedByStaffId,
                a.RecordedByStaffName
            )).ToList();
        }

        List<PatientMedicalHistoryDto>? medicalHistoryDtos = null;
        var problemDtos = new List<PatientProblemDto>();
        if (_medicalHistoryRepo != null)
        {
            var medHistories = await _medicalHistoryRepo.Query(m => m.PatientId == request.PatientId)
                .AsNoTracking()
                .OrderByDescending(m => m.OnsetDate ?? DateOnly.MinValue)
                .ThenByDescending(m => m.CreatedAt)
                .ToListAsync(cancellationToken);
            medicalHistoryDtos = medHistories.Select(m => new PatientMedicalHistoryDto(
                m.Id,
                m.Category.ToString(),
                m.VerificationStatus.ToString(),
                m.ConditionTitle,
                m.Icd10Code,
                m.SnomedCode,
                m.PhilHealthMdiseaseCode,
                m.SpecificDescription,
                m.Status.ToString(),
                m.Severity?.ToString(),
                m.IsChronicNcd,
                m.OnsetDate,
                m.ResolvedDate,
                m.ConsultationEncounterId,
                m.ClinicalNotes,
                m.RecordedByStaffId,
                m.RecordedByStaffName
            )).ToList();

            problemDtos = medHistories
                .Where(p => p.Category == MedicalHistoryCategory.ProblemListItem)
                .Select(p => new PatientProblemDto(
                    p.Id,
                    p.ClinicId,
                    p.PatientId,
                    p.ConsultationEncounterId,
                    p.Icd10Code ?? string.Empty,
                    p.ConditionTitle,
                    p.PhilHealthMdiseaseCode,
                    p.Status.ToString(),
                    p.Severity?.ToString() ?? "Moderate",
                    p.IsChronicNcd,
                    p.OnsetDate,
                    p.ResolvedDate,
                    p.ClinicalNotes,
                    p.RecordedByStaffId ?? Guid.Empty,
                    p.RecordedByStaffName ?? string.Empty,
                    p.CreatedAt
                )).ToList();

            if (problemDtos.Count == 0)
            {
                problemDtos = medHistories
                    .Where(p => p.Category == MedicalHistoryCategory.MedicalHistory)
                    .Select(p => new PatientProblemDto(
                        p.Id,
                        p.ClinicId,
                        p.PatientId,
                        p.ConsultationEncounterId,
                        p.Icd10Code ?? string.Empty,
                        p.ConditionTitle,
                        p.PhilHealthMdiseaseCode,
                        p.Status.ToString(),
                        p.Severity?.ToString() ?? "Moderate",
                        p.IsChronicNcd,
                        p.OnsetDate,
                        p.ResolvedDate,
                        p.ClinicalNotes,
                        p.RecordedByStaffId ?? Guid.Empty,
                        p.RecordedByStaffName ?? string.Empty,
                        p.CreatedAt
                    )).ToList();
            }
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

            var activeCaseNo = enlistmentDtos?.FirstOrDefault(e => e.Status == "Active")?.CaseNo
                ?? ResolveActiveCaseNo(patient)
                ?? consultations.FirstOrDefault(c => !string.IsNullOrWhiteSpace(c.PhilHealthCaseNo))?.PhilHealthCaseNo
                ?? (string.IsNullOrWhiteSpace(patient.PhilHealthNumber) ? null : $"C{patient.PatientCode.Replace("-", string.Empty)}");

            var memberStatus = philhealthDto?.MemberType
                ?? (!string.IsNullOrWhiteSpace(patient.PhilHealthNumber) ? "Member" : "Non-Member");

            var atc = consultations.FirstOrDefault(c => !string.IsNullOrWhiteSpace(c.PhilHealthAtc))?.PhilHealthAtc
                ?? philhealthDto?.DefaultWalkInAtc
                ?? (string.IsNullOrWhiteSpace(patient.PhilHealthNumber) ? null : "A");

            var alertsSummary = alertDtos != null && alertDtos.Count > 0
                ? string.Join("; ", alertDtos.Where(a => a.IsActive).Select(a => $"{a.Category}: {a.Title}"))
                : null;

            demographicsDto = new PatientDemographicsDto(
                Dob: patient.DateOfBirth,
                Age: age,
                Sex: patient.Sex.ToString(),
                CivilStatus: patient.CivilStatus?.ToString(),
                ContactNumber: patient.ContactNumber,
                Email: patient.Email,
                AddressLine: patient.Addresses.FirstOrDefault()?.StreetAddress ?? GetCustomFieldString(patient, "primary_address_line"),
                Barangay: patient.Addresses.FirstOrDefault()?.BarangayName ?? GetCustomFieldString(patient, "primary_barangay"),
                City: GetCustomFieldString(patient, "primary_city"),
                Province: GetCustomFieldString(patient, "primary_province"),
                PhilHealthNumber: philhealthDto?.PhilHealthPin ?? patient.PhilHealthNumber,
                SeniorCitizenId: patient.SeniorCitizenId,
                PwdId: patient.PwdId,
                BloodType: patient.BloodType.HasValue ? patient.BloodType.Value switch
                {
                    BloodType.APositive => "A+",
                    BloodType.ANegative => "A-",
                    BloodType.BPositive => "B+",
                    BloodType.BNegative => "B-",
                    BloodType.ABPositive => "AB+",
                    BloodType.ABNegative => "AB-",
                    BloodType.OPositive => "O+",
                    BloodType.ONegative => "O-",
                    _ => patient.BloodType.Value.ToString()
                } : null,
                MemberStatus: memberStatus,
                PhilHealthAtc: atc,
                ActiveCaseNo: activeCaseNo,
                EmergencyContactName: patient.EmergencyContactName ?? GetCustomFieldString(patient, "emergency_contact_name"),
                EmergencyContactPhone: patient.EmergencyContactNumber ?? GetCustomFieldString(patient, "emergency_contact_phone"),
                EmergencyContactRelationship: patient.EmergencyContactRelationship ?? GetCustomFieldString(patient, "emergency_contact_relationship"),
                Alerts: alertsSummary,
                PatientCode: patient.PatientCode,
                ClinicEzId: patient.ClinicEzId,
                VerificationStatus: patient.VerificationStatus.ToString(),
                GenderIdentity: patient.GenderIdentity
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
                c.PhilHealthCaseNo,
                c.PhilHealthSoapTransNo,
                c.DoctorPhilHealthPan,
                c.PhilHealthAtc,
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

        List<PatientPhysicalExamDto>? physicalExamDtos = null;
        PatientPhysicalExamProfileDto? physicalExamDto = null;
        PatientPhysicalExamDto? latestPhysicalExamDto = null;
        if (_physicalExamRepo != null)
        {
            var peList = await _physicalExamRepo.Query(p => p.PatientId == request.PatientId)
                .Include(p => p.Findings)
                .OrderByDescending(p => p.ExamDate)
                .ToListAsync(cancellationToken);

            physicalExamDtos = peList.Select(pe => new PatientPhysicalExamDto(
                pe.Id,
                DateOnly.FromDateTime(pe.ExamDate),
                pe.ConsultationEncounterId,
                pe.ExaminedByStaffId,
                pe.ExaminedByStaffName,
                pe.GeneralSurveyStatus.ToString(),
                pe.GeneralSurveyRemarks,
                pe.MusculoskeletalRemarks,
                pe.PsychiatricRemarks,
                pe.LymphaticRemarks,
                pe.HeentRemarks,
                pe.ChestLungsRemarks,
                pe.HeartRemarks,
                pe.AbdomenRemarks,
                pe.GenitourinaryRemarks,
                pe.DigitalRectalRemarks,
                pe.SkinRemarks,
                pe.NeurologicalRemarks,
                pe.Findings.Select(f => new PatientPhysicalExamFindingDto(
                    f.Id,
                    f.System.ToString(),
                    f.IsNormal,
                    f.FindingTitle,
                    f.PhilHealthFindingCode,
                    f.BodySite,
                    f.Laterality
                )).ToList()
            )).ToList();

            latestPhysicalExamDto = physicalExamDtos.FirstOrDefault();
            var latestPe = peList.FirstOrDefault();
            if (latestPe != null)
            {
                physicalExamDto = new PatientPhysicalExamProfileDto(
                    latestPe.Id,
                    latestPe.PatientId,
                    ((int)latestPe.GeneralSurveyStatus).ToString(),
                    latestPe.GeneralSurveyRemarks,
                    latestPe.Findings?.FirstOrDefault(f => f.System == PhysicalExamSystem.Skin)?.PhilHealthFindingCode ?? "1",
                    latestPe.SkinRemarks,
                    latestPe.Findings?.FirstOrDefault(f => f.System == PhysicalExamSystem.Heent)?.PhilHealthFindingCode ?? "11",
                    latestPe.HeentRemarks,
                    latestPe.Findings?.FirstOrDefault(f => f.System == PhysicalExamSystem.Chest)?.PhilHealthFindingCode ?? "6",
                    latestPe.ChestLungsRemarks,
                    latestPe.Findings?.FirstOrDefault(f => f.System == PhysicalExamSystem.Heart)?.PhilHealthFindingCode ?? "5",
                    latestPe.HeartRemarks,
                    latestPe.Findings?.FirstOrDefault(f => f.System == PhysicalExamSystem.Abdomen)?.PhilHealthFindingCode ?? "7",
                    latestPe.AbdomenRemarks,
                    latestPe.Findings?.FirstOrDefault(f => f.System == PhysicalExamSystem.Neurological)?.PhilHealthFindingCode ?? "6",
                    latestPe.NeurologicalRemarks,
                    latestPe.Findings?.FirstOrDefault(f => f.System == PhysicalExamSystem.Rectal)?.PhilHealthFindingCode ?? "1",
                    latestPe.DigitalRectalRemarks,
                    latestPe.Findings?.FirstOrDefault(f => f.System == PhysicalExamSystem.Genitourinary)?.PhilHealthFindingCode ?? "1",
                    latestPe.GenitourinaryRemarks,
                    latestPe.CreatedAt,
                    latestPe.UpdatedAt
                );
            }
        }

        List<MedicalCertificateDto>? medicalCertificateDtos = null;
        if (_medCertRepo != null)
        {
            var medCerts = await _medCertRepo.Query(m => m.PatientId == request.PatientId)
                .OrderByDescending(m => m.CreatedAt)
                .ToListAsync(cancellationToken);

            medicalCertificateDtos = medCerts.Select(cert => new MedicalCertificateDto(
                cert.Id,
                cert.TenantId,
                cert.ClinicId,
                cert.CertificateNumber,
                cert.PatientId,
                cert.PatientName,
                cert.ConsultationId,
                cert.DoctorId,
                cert.DoctorName,
                cert.PrcLicenseNumber,
                cert.PtrNumber,
                cert.IssueDate,
                cert.Diagnosis,
                cert.ClinicalFindings,
                cert.FitnessStatus,
                cert.RecommendedRestDays,
                cert.RestStartDate,
                cert.RestEndDate,
                cert.Purpose,
                cert.Remarks,
                cert.IsSigned,
                cert.SignedAt,
                cert.CreatedAt,
                cert.SecurityDigest
            )).ToList();
        }

        List<ReferralLetterDto>? referralLetterDtos = null;
        if (_referralRepo != null)
        {
            var referrals = await _referralRepo.Query(r => r.PatientId == request.PatientId)
                .OrderByDescending(r => r.CreatedAt)
                .ToListAsync(cancellationToken);

            referralLetterDtos = referrals.Select(referral => new ReferralLetterDto(
                referral.Id,
                referral.TenantId,
                referral.ClinicId,
                referral.ReferralNumber,
                referral.PatientId,
                referral.PatientName,
                referral.ConsultationId,
                referral.ReferringDoctorId,
                referral.ReferringDoctorName,
                referral.ReferredToDoctor,
                referral.ReferredToFacility,
                referral.ReferredDepartment,
                referral.ReferralDate,
                referral.Urgency,
                referral.ReasonForReferral,
                referral.ProvisionalDiagnosis,
                referral.ClinicalSummary,
                referral.CurrentMedications,
                referral.AttachedDiagnostics,
                referral.IsSigned,
                referral.SignedAt,
                referral.CreatedAt,
                referral.SecurityDigest
            )).ToList();
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
            DentalProcedures: procedureDtos.Where(p => p.Category == "Dental" || p.ToothNumber.HasValue).ToList(),
            MedicalCertificates: medicalCertificateDtos,
            ReferralLetters: referralLetterDtos,
            PhilHealthMembership: philhealthDto,
            YakapEnlistments: enlistmentDtos,
            Alerts: alertDtos,
            MedicalHistories: medicalHistoryDtos,
            PhysicalExams: physicalExamDtos,
            LatestPhysicalExam: latestPhysicalExamDto
        );
    }

    private static string? GetCustomFieldString(Patient patient, string key)
    {
        if (patient.CustomFields == null) return null;
        if (!patient.CustomFields.TryGetValue(key, out var val) || val == null) return null;

        if (val is System.Text.Json.JsonElement elem)
        {
            if (elem.ValueKind == System.Text.Json.JsonValueKind.String)
                return elem.GetString();
            if (elem.ValueKind == System.Text.Json.JsonValueKind.Null || elem.ValueKind == System.Text.Json.JsonValueKind.Undefined)
                return null;
            return elem.ToString();
        }

        var str = val.ToString();
        return string.IsNullOrWhiteSpace(str) ? null : str;
    }

    private static string? ResolveActiveCaseNo(Patient patient)
    {
        if (patient.YakapEnlistments != null && patient.YakapEnlistments.Count > 0)
        {
            var active = patient.YakapEnlistments.LastOrDefault(e => e.Status == YakapEnlistmentStatus.Active && !string.IsNullOrWhiteSpace(e.CaseNo));
            if (active != null) return active.CaseNo;
        }

        if (patient.CustomFields != null)
        {
            if (patient.CustomFields.TryGetValue("active_case_no", out var acn) && acn != null && !string.IsNullOrWhiteSpace(acn.ToString()))
                return acn.ToString()!.Trim();

            if (patient.CustomFields.TryGetValue("philhealth_case_no", out var pcn) && pcn != null && !string.IsNullOrWhiteSpace(pcn.ToString()))
                return pcn.ToString()!.Trim();

            if (patient.CustomFields.TryGetValue("case_no", out var cn) && cn != null && !string.IsNullOrWhiteSpace(cn.ToString()))
                return cn.ToString()!.Trim();

            if (patient.CustomFields.TryGetValue("yakap_enlistments", out var raw) && raw != null)
            {
                if (raw is System.Text.Json.JsonElement je)
                {
                    if (je.ValueKind == System.Text.Json.JsonValueKind.Array)
                    {
                        foreach (var item in je.EnumerateArray())
                        {
                            var status = item.TryGetProperty("status", out var st) ? st.GetString() : null;
                            if (string.Equals(status, "Active", StringComparison.OrdinalIgnoreCase) || status == null)
                            {
                                if ((item.TryGetProperty("case_no", out var c) || item.TryGetProperty("caseNo", out c) || item.TryGetProperty("hciCaseNo", out c)) && !string.IsNullOrWhiteSpace(c.GetString()))
                                {
                                    return c.GetString()!.Trim();
                                }
                            }
                        }
                    }
                }
                else if (raw is IEnumerable<Dictionary<string, object?>> list)
                {
                    foreach (var item in list)
                    {
                        var status = item.TryGetValue("status", out var st) ? st?.ToString() : null;
                        if (string.Equals(status, "Active", StringComparison.OrdinalIgnoreCase) || status == null)
                        {
                            if ((item.TryGetValue("case_no", out var c) || item.TryGetValue("caseNo", out c) || item.TryGetValue("hciCaseNo", out c)) && c != null && !string.IsNullOrWhiteSpace(c.ToString()))
                            {
                                return c.ToString()!.Trim();
                            }
                        }
                    }
                }
                else if (raw is IEnumerable<object> objList)
                {
                    foreach (var item in objList)
                    {
                        if (item is Dictionary<string, object?> dict)
                        {
                            var status = dict.TryGetValue("status", out var st) ? st?.ToString() : null;
                            if (string.Equals(status, "Active", StringComparison.OrdinalIgnoreCase) || status == null)
                            {
                                if ((dict.TryGetValue("case_no", out var c) || dict.TryGetValue("caseNo", out c) || dict.TryGetValue("hciCaseNo", out c)) && c != null && !string.IsNullOrWhiteSpace(c.ToString()))
                                {
                                    return c.ToString()!.Trim();
                                }
                            }
                        }
                    }
                }
            }
        }

        return null;
    }
}
