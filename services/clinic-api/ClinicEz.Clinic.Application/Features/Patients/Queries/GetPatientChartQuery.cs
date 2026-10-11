using System;
using System.Linq;
using System.Threading;
using System.Threading.Tasks;
using ClinicEz.Clinic.Application.Features.Billing.DTOs;
using ClinicEz.Clinic.Application.Features.Consultations.DTOs;
using ClinicEz.Clinic.Application.Features.LabOrders.Commands;
using ClinicEz.Clinic.Application.Features.LabOrders.DTOs;
using ClinicEz.Clinic.Application.Features.Patients.DTOs;
using ClinicEz.Clinic.Application.Features.Procedures.DTOs;
using ClinicEz.Clinic.Application.Features.Triage.DTOs;
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
    private readonly IRepository<PatientSurgicalHistory>? _surgicalRepo;
    private readonly IRepository<PatientSocialHistory>? _socialRepo;
    private readonly IRepository<PatientReproductiveHistory>? _reproductiveRepo;
    private readonly IRepository<NcdRiskAssessment>? _ncdRepo;
    private readonly Services.ILegacyPatientProfileIngestionService? _legacyIngestion;
    private readonly IClinicContext _clinicContext;

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
        Services.ILegacyPatientProfileIngestionService? legacyIngestion = null)
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

        var patientName = consultations.FirstOrDefault()?.PatientName
            ?? vitals.FirstOrDefault()?.QueueItem?.PatientName
            ?? procedures.FirstOrDefault()?.PatientName
            ?? invoices.FirstOrDefault()?.PatientName
            ?? "Registered Patient";

        var consultationDtos = consultations.Select(c => new ConsultationEncounterDto(
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
                p.Remarks
            )).ToList()
        )).ToList();

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
            v.Notes
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
            p.Complications
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
            i.AttendingDoctorName,
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
                    social.PhysicalActivityFrequency, social.DietaryHabits, social.Remarks);
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
                    ncd.UrineProteinDate, ncd.RiskBand, ncd.CalculatedRiskScorePercent, ncd.Remarks);
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
            latestNcdDto
        );
    }
}
