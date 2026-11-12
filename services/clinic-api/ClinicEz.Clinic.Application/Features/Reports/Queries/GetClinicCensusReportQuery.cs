using System;
using System.Collections.Generic;
using System.Linq;
using System.Threading;
using System.Threading.Tasks;
using ClinicEz.Clinic.Application.Features.Reports.DTOs;
using ClinicEz.Clinic.Domain.Common;
using ClinicEz.Clinic.Domain.Entities;
using ClinicEz.Clinic.Domain.Enums;
using ClinicEz.Clinic.Domain.Interfaces;
using ClinicEz.Shared.Common;
using MediatR;
using Microsoft.EntityFrameworkCore;

namespace ClinicEz.Clinic.Application.Features.Reports.Queries;

public sealed record GetClinicCensusReportQuery(
    DateTime? StartDate = null,
    DateTime? EndDate = null,
    Guid? DoctorId = null,
    Guid? NurseId = null,
    string? VisitType = null,
    string? Status = null
) : IRequest<ClinicCensusReportDto>
{
    public GetClinicCensusReportQuery(
        DateTime? startDate,
        DateTime? endDate,
        Guid? doctorId,
        Guid? nurseId,
        VisitType? visitType,
        QueueStatus? status)
        : this(startDate, endDate, doctorId, nurseId, visitType?.ToString(), status?.ToString())
    {
    }
}

public sealed class GetClinicCensusReportQueryHandler : IRequestHandler<GetClinicCensusReportQuery, ClinicCensusReportDto>
{
    private readonly IRepository<QueueItem> _queueRepo;
    private readonly IRepository<Patient> _patientRepo;
    private readonly IRepository<PatientVitals> _vitalsRepo;
    private readonly IRepository<ConsultationEncounter> _consultationRepo;
    private readonly IRepository<Procedure> _procedureRepo;
    private readonly IRepository<Invoice> _invoiceRepo;
    private readonly IClinicContext _clinicContext;
    private readonly IRepository<FacilitySettings>? _settingsRepo;
    private readonly IRepository<ClinicDispensingLog>? _dispensingLogRepo;
    private readonly IRepository<MedicalCertificate>? _medCertRepo;
    private readonly IRepository<ReferralLetter>? _referralRepo;
    private readonly IRepository<LabOrder>? _labOrderRepo;

    public GetClinicCensusReportQueryHandler(
        IRepository<QueueItem> queueRepo,
        IRepository<Patient> patientRepo,
        IRepository<PatientVitals> vitalsRepo,
        IRepository<ConsultationEncounter> consultationRepo,
        IRepository<Procedure> procedureRepo,
        IRepository<Invoice> invoiceRepo,
        IClinicContext clinicContext,
        IRepository<FacilitySettings>? settingsRepo = null,
        IRepository<ClinicDispensingLog>? dispensingLogRepo = null,
        IRepository<MedicalCertificate>? medCertRepo = null,
        IRepository<ReferralLetter>? referralRepo = null,
        IRepository<LabOrder>? labOrderRepo = null)
    {
        _queueRepo = queueRepo;
        _patientRepo = patientRepo;
        _vitalsRepo = vitalsRepo;
        _consultationRepo = consultationRepo;
        _procedureRepo = procedureRepo;
        _invoiceRepo = invoiceRepo;
        _clinicContext = clinicContext;
        _settingsRepo = settingsRepo;
        _dispensingLogRepo = dispensingLogRepo;
        _medCertRepo = medCertRepo;
        _referralRepo = referralRepo;
        _labOrderRepo = labOrderRepo;
    }

    public async Task<ClinicCensusReportDto> Handle(GetClinicCensusReportQuery request, CancellationToken cancellationToken)
    {
        // 1. Resolve date boundaries
        DateTime start, end;
        if (request.StartDate.HasValue && request.EndDate.HasValue)
        {
            start = request.StartDate.Value.ToStartOfDayUtc();
            end = request.EndDate.Value.ToEndOfDayExclusiveUtc();
        }
        else if (request.StartDate.HasValue)
        {
            start = request.StartDate.Value.ToStartOfDayUtc();
            end = start.AddDays(1);
        }
        else
        {
            var today = DateTime.UtcNow.ToStartOfDayUtc();
            start = today;
            end = today.AddDays(1);
        }

        // 2. Query Queue Items
        var queueQuery = _queueRepo.Query(q => q.CheckInTime >= start && q.CheckInTime < end);

        if (request.DoctorId.HasValue)
            queueQuery = queueQuery.Where(q => q.DoctorId == request.DoctorId.Value);

        if (!string.IsNullOrWhiteSpace(request.VisitType) && Enum.TryParse<VisitType>(request.VisitType, true, out var vt))
            queueQuery = queueQuery.Where(q => q.VisitType == vt);

        if (!string.IsNullOrWhiteSpace(request.Status) && Enum.TryParse<QueueStatus>(request.Status, true, out var qs))
            queueQuery = queueQuery.Where(q => q.Status == qs);

        var queueItems = await queueQuery
            .OrderBy(q => q.CheckInTime)
            .ToListAsync(cancellationToken);

        var queueItemIds = queueItems.Select(q => q.Id).ToList();
        var patientIds = queueItems.Select(q => q.PatientId).Distinct().ToList();

        // 3. Batched Queries for correlated clinical & financial entities
        List<Patient> patients = new();
        List<PatientVitals> vitals = new();
        List<ConsultationEncounter> consultations = new();
        List<Procedure> procedures = new();
        List<Invoice> invoices = new();
        List<ClinicDispensingLog> dispensingLogs = new();
        List<MedicalCertificate> medCerts = new();
        List<ReferralLetter> referrals = new();
        List<LabOrder> labOrders = new();
        Dictionary<Guid, DateTime> earliestLookup = new();

        if (patientIds.Count > 0)
        {
            patients = await _patientRepo.Query(p => patientIds.Contains(p.Id))
                .Include(p => p.PhilHealthMembership)
                .ToListAsync(cancellationToken);

            vitals = await _vitalsRepo.Query(v => (v.QueueItemId.HasValue && queueItemIds.Contains(v.QueueItemId.Value)) ||
                                                  (patientIds.Contains(v.PatientId) && v.RecordedAt >= start && v.RecordedAt < end))
                .ToListAsync(cancellationToken);

            // Only signed consultation encounters are clinically valid for census reporting
            consultations = await _consultationRepo.Query(c =>
                    c.IsSigned &&
                    ((c.QueueItemId.HasValue && queueItemIds.Contains(c.QueueItemId.Value)) ||
                     (patientIds.Contains(c.PatientId) && c.EncounterDate >= start && c.EncounterDate < end)))
                .Include(c => c.Diagnoses)
                .Include(c => c.Prescriptions)
                .Include(c => c.ReviewOfSystemsItems)
                .Include(c => c.PhysicalExams)
                    .ThenInclude(pe => pe.Findings)
                .ToListAsync(cancellationToken);

            var signedConsultIds = consultations.Select(c => c.Id).ToList();

            procedures = await _procedureRepo.Query(p => (p.QueueItemId.HasValue && queueItemIds.Contains(p.QueueItemId.Value)) ||
                                                         (patientIds.Contains(p.PatientId) && p.ScheduledAt >= start && p.ScheduledAt < end))
                .ToListAsync(cancellationToken);

            invoices = await _invoiceRepo.Query(i => (i.QueueItemId.HasValue && queueItemIds.Contains(i.QueueItemId.Value)) ||
                                                     (i.PatientId.HasValue && patientIds.Contains(i.PatientId.Value) && i.InvoiceDate >= start && i.InvoiceDate < end))
                .Include(i => i.Payments)
                .ToListAsync(cancellationToken);

            var startDateOnly = DateOnly.FromDateTime(start);
            var endDateOnly = DateOnly.FromDateTime(end.AddTicks(-1));

            if (_dispensingLogRepo != null)
            {
                dispensingLogs = await _dispensingLogRepo.Query(d =>
                        d.IsConsultationValidated &&
                        (!d.ConsultationEncounterId.HasValue || signedConsultIds.Contains(d.ConsultationEncounterId.Value)) &&
                        (queueItemIds.Contains(d.QueueItemId) ||
                         (d.ConsultationEncounterId.HasValue && signedConsultIds.Contains(d.ConsultationEncounterId.Value)) ||
                         (patientIds.Contains(d.PatientId) && d.DispensedAt >= start && d.DispensedAt < end)))
                    .OrderBy(d => d.DispensedAt)
                    .ToListAsync(cancellationToken);
            }

            if (_medCertRepo != null)
            {
                medCerts = await _medCertRepo.Query(m =>
                        m.IsSigned &&
                        ((m.QueueItemId.HasValue && queueItemIds.Contains(m.QueueItemId.Value)) ||
                         (m.ConsultationId.HasValue && signedConsultIds.Contains(m.ConsultationId.Value)) ||
                         (!m.QueueItemId.HasValue && !m.ConsultationId.HasValue && patientIds.Contains(m.PatientId) && m.IssueDate >= startDateOnly && m.IssueDate <= endDateOnly)))
                    .ToListAsync(cancellationToken);
            }

            if (_referralRepo != null)
            {
                referrals = await _referralRepo.Query(r =>
                        r.IsSigned &&
                        ((r.QueueItemId.HasValue && queueItemIds.Contains(r.QueueItemId.Value)) ||
                         (r.ConsultationId.HasValue && signedConsultIds.Contains(r.ConsultationId.Value)) ||
                         (!r.QueueItemId.HasValue && !r.ConsultationId.HasValue && patientIds.Contains(r.PatientId) && r.ReferralDate >= startDateOnly && r.ReferralDate <= endDateOnly)))
                    .ToListAsync(cancellationToken);
            }

            if (_labOrderRepo != null)
            {
                labOrders = await _labOrderRepo.Query(o =>
                        o.IsSigned &&
                        o.Status != LabOrderStatus.Cancelled &&
                        ((o.QueueItemId.HasValue && queueItemIds.Contains(o.QueueItemId.Value)) ||
                         (o.ConsultationId.HasValue && signedConsultIds.Contains(o.ConsultationId.Value)) ||
                         (!o.QueueItemId.HasValue && !o.ConsultationId.HasValue && patientIds.Contains(o.PatientId) && o.OrderDate >= start && o.OrderDate < end)))
                    .ToListAsync(cancellationToken);
            }

            // 4. Earliest Lifetime Check-in for New vs. Returning Patients
            var earliestVisits = await _queueRepo.Query(q => patientIds.Contains(q.PatientId))
                .Select(q => new { q.PatientId, q.CheckInTime })
                .ToListAsync(cancellationToken);

            earliestLookup = earliestVisits
                .GroupBy(x => x.PatientId)
                .ToDictionary(g => g.Key, g => g.Min(x => x.CheckInTime));
        }

        var patientMap = patients.ToDictionary(p => p.Id);
        var queueByPatientId = queueItems.ToLookup(q => q.PatientId);

        Guid? PickClosestVisitQueueId(Guid patientId, DateTime timestamp, Func<QueueItem, bool>? predicate = null)
        {
            var candidates = queueByPatientId[patientId];
            if (predicate != null)
            {
                candidates = candidates.Where(predicate);
            }

            return candidates
                .OrderBy(q => q.Status is QueueStatus.Cancelled or QueueStatus.NoShow ? 1 : 0)
                .ThenBy(q => Math.Abs((q.CheckInTime - timestamp).Ticks))
                .FirstOrDefault()?.Id;
        }

        var vitalsByQueueId = vitals
            .Select(v => (QueueId: v.QueueItemId ?? PickClosestVisitQueueId(v.PatientId, v.RecordedAt), Vital: v))
            .Where(x => x.QueueId.HasValue)
            .ToLookup(x => x.QueueId!.Value, x => x.Vital);

        var consultByQueueId = consultations
            .Select(c => (QueueId: c.QueueItemId ?? PickClosestVisitQueueId(c.PatientId, c.EncounterDate, q => q.VisitType == VisitType.Consultation), Consult: c))
            .Where(x => x.QueueId.HasValue)
            .ToLookup(x => x.QueueId!.Value, x => x.Consult);

        var procByQueueId = procedures
            .Select(p => (QueueId: p.QueueItemId ?? PickClosestVisitQueueId(p.PatientId, p.ScheduledAt), Proc: p))
            .Where(x => x.QueueId.HasValue)
            .ToLookup(x => x.QueueId!.Value, x => x.Proc);

        var invByQueueId = invoices
            .Select(i => (QueueId: i.QueueItemId ?? (i.PatientId.HasValue ? PickClosestVisitQueueId(i.PatientId.Value, i.InvoiceDate) : null), Inv: i))
            .Where(x => x.QueueId.HasValue)
            .ToLookup(x => x.QueueId!.Value, x => x.Inv);

        var dispByQueueId = dispensingLogs.ToLookup(d => d.QueueItemId);
        var dispByConsultId = dispensingLogs.Where(d => d.ConsultationEncounterId.HasValue).ToLookup(d => d.ConsultationEncounterId!.Value);

        var medCertByQueueId = medCerts
            .Where(m => m.QueueItemId.HasValue || !m.ConsultationId.HasValue)
            .Select(m => (QueueId: m.QueueItemId ?? PickClosestVisitQueueId(m.PatientId, m.CreatedAt, q => q.VisitType == VisitType.AdministrativeDocument || q.VisitType == VisitType.Consultation), Cert: m))
            .Where(x => x.QueueId.HasValue)
            .ToLookup(x => x.QueueId!.Value, x => x.Cert);
        var medCertByConsultId = medCerts.Where(m => !m.QueueItemId.HasValue && m.ConsultationId.HasValue).ToLookup(m => m.ConsultationId!.Value);

        var refByQueueId = referrals
            .Where(r => r.QueueItemId.HasValue || !r.ConsultationId.HasValue)
            .Select(r => (QueueId: r.QueueItemId ?? PickClosestVisitQueueId(r.PatientId, r.CreatedAt, q => q.VisitType == VisitType.Consultation), Ref: r))
            .Where(x => x.QueueId.HasValue)
            .ToLookup(x => x.QueueId!.Value, x => x.Ref);
        var refByConsultId = referrals.Where(r => !r.QueueItemId.HasValue && r.ConsultationId.HasValue).ToLookup(r => r.ConsultationId!.Value);

        var labByQueueId = labOrders
            .Where(o => o.QueueItemId.HasValue || !o.ConsultationId.HasValue)
            .Select(o => (QueueId: o.QueueItemId ?? PickClosestVisitQueueId(o.PatientId, o.OrderDate, q => q.VisitType == VisitType.Consultation || q.VisitType == VisitType.LaboratorySpecimen), Lab: o))
            .Where(x => x.QueueId.HasValue)
            .ToLookup(x => x.QueueId!.Value, x => x.Lab);
        var labByConsultId = labOrders.Where(o => !o.QueueItemId.HasValue && o.ConsultationId.HasValue).ToLookup(o => o.ConsultationId!.Value);

        // Optional Nurse Filter
        if (request.NurseId.HasValue)
        {
            var matchedQueueIds = new HashSet<Guid>();
            foreach (var q in queueItems)
            {
                var v = vitalsByQueueId[q.Id].FirstOrDefault();
                if (v?.NurseId == request.NurseId.Value) matchedQueueIds.Add(q.Id);
                var procs = procByQueueId[q.Id];
                if (procs.Any(p => p.PerformedByStaffId == request.NurseId.Value)) matchedQueueIds.Add(q.Id);
                var disps = dispByQueueId[q.Id];
                if (disps.Any(d => d.DispensedByStaffId == request.NurseId.Value)) matchedQueueIds.Add(q.Id);
            }
            queueItems = queueItems.Where(q => matchedQueueIds.Contains(q.Id)).ToList();
        }

        // 5. Correlate and Build Census Items (Strictly One Row Per Patient Visit, Zero Multi-Visit Double Counting)
        var items = new List<CensusItemDto>(queueItems.Count);
        var visitLedgerRows = new List<CensusDispensingLedgerItemDto>();
        var claimedDispensingIds = new HashSet<Guid>();
        var rosVisitTracker = new Dictionary<string, HashSet<Guid>>(StringComparer.OrdinalIgnoreCase);
        int totalProceduresPerformedCount = 0;
        int seq = 1;

        void RecordVisitRos(Guid queueId, string? rosLabel)
        {
            if (string.IsNullOrWhiteSpace(rosLabel)) return;
            var normalized = rosLabel.Trim();
            if (!rosVisitTracker.TryGetValue(normalized, out var qSet))
            {
                qSet = new HashSet<Guid>();
                rosVisitTracker[normalized] = qSet;
            }
            qSet.Add(queueId);
        }

        foreach (var q in queueItems)
        {
            patientMap.TryGetValue(q.PatientId, out var patient);
            var vital = vitalsByQueueId[q.Id].FirstOrDefault();
            var consult = consultByQueueId[q.Id].FirstOrDefault();
            var procs = procByQueueId[q.Id].ToList();
            var inv = invByQueueId[q.Id].FirstOrDefault();

            var visitDispensings = new List<ClinicDispensingLog>();
            foreach (var qd in dispByQueueId[q.Id])
            {
                if (claimedDispensingIds.Add(qd.Id))
                    visitDispensings.Add(qd);
            }
            if (consult != null)
            {
                foreach (var cd in dispByConsultId[consult.Id])
                {
                    if (claimedDispensingIds.Add(cd.Id))
                        visitDispensings.Add(cd);
                }
            }

            var visitMedCerts = new List<MedicalCertificate>();
            visitMedCerts.AddRange(medCertByQueueId[q.Id]);
            if (consult != null)
            {
                foreach (var mc in medCertByConsultId[consult.Id])
                {
                    if (visitMedCerts.All(existing => existing.Id != mc.Id))
                        visitMedCerts.Add(mc);
                }
            }

            var visitReferrals = new List<ReferralLetter>();
            visitReferrals.AddRange(refByQueueId[q.Id]);
            if (consult != null)
            {
                foreach (var rf in refByConsultId[consult.Id])
                {
                    if (visitReferrals.All(existing => existing.Id != rf.Id))
                        visitReferrals.Add(rf);
                }
            }

            var visitLabOrders = new List<LabOrder>();
            visitLabOrders.AddRange(labByQueueId[q.Id]);
            if (consult != null)
            {
                foreach (var lo in labByConsultId[consult.Id])
                {
                    if (visitLabOrders.All(existing => existing.Id != lo.Id))
                        visitLabOrders.Add(lo);
                }
            }

            int prescriptionsCount = consult?.Prescriptions?.Count ?? 0;

            var servicesAvailed = new List<string>();
            var baseServiceLabel = q.VisitType switch
            {
                VisitType.Consultation => "Consultation",
                VisitType.VitalsCheckOnly => "Vitals Check",
                VisitType.StandaloneProcedure => "In-Clinic Procedure",
                VisitType.LaboratorySpecimen => "Laboratory Specimen",
                VisitType.AdministrativeDocument => "Administrative Document",
                VisitType.RetailPurchase => "Retail Purchase",
                VisitType.CashierSettlement => "Cashier Settlement",
                _ => q.VisitType.ToString()
            };
            servicesAvailed.Add(baseServiceLabel);

            if (visitDispensings.Count > 0)
                servicesAvailed.Add("Medicine Dispensing");
            if (prescriptionsCount > 0)
                servicesAvailed.Add("Prescription");
            if (visitMedCerts.Count > 0 && !servicesAvailed.Contains("Medical Certificate"))
                servicesAvailed.Add("Medical Certificate");
            if (visitReferrals.Count > 0)
                servicesAvailed.Add("Referral");
            if (visitLabOrders.Count > 0)
                servicesAvailed.Add("Laboratory Requisition");
            if (procs.Count > 0 && !servicesAvailed.Contains("In-Clinic Procedure"))
                servicesAvailed.Add("In-Clinic Procedure");

            var servicesAvailedSummary = string.Join(" + ", servicesAvailed);

            // Check-in & completion
            var completion = q.CompletedTime ?? q.DischargedAt ?? consult?.SignedAt;
            int? turnaround = completion.HasValue
                ? (int)Math.Max(0, Math.Round((completion.Value - q.CheckInTime).TotalMinutes))
                : null;

            // Age calculation
            var visitDate = DateOnly.FromDateTime(q.CheckInTime);
            int age = 0;
            if (patient != null)
            {
                age = visitDate.Year - patient.DateOfBirth.Year;
                if (patient.DateOfBirth > visitDate.AddYears(-age)) age--;
            }

            // Classification
            var classList = new List<string>();
            if (age < 18) classList.Add("Pediatric");
            if (age >= 60 || (patient != null && !string.IsNullOrWhiteSpace(patient.SeniorCitizenId))) classList.Add("Senior");
            if (patient != null && !string.IsNullOrWhiteSpace(patient.PwdId)) classList.Add("PWD");
            if (patient != null && (!string.IsNullOrWhiteSpace(patient.PhilHealthNumber) || patient.PhilHealthMembership != null)) classList.Add("PhilHealth");
            var classification = classList.Count > 0 ? string.Join(", ", classList) : "Regular";

            // Custom fields summary
            var customFields = patient?.CustomFields ?? new Dictionary<string, object?>();
            var customSummary = string.Join("; ", customFields
                .Where(kv => kv.Value != null && !string.IsNullOrWhiteSpace(kv.Value.ToString()))
                .Select(kv => $"{kv.Key.Replace('_', ' ')}: {kv.Value}"));

            // Nurse Assessment & Snapshot
            var nurseRemarks = new[]
                {
                    vital?.Notes,
                    vital?.PreAssessmentNotes,
                    vital?.PreAssessmentRemarks,
                    vital?.TriageAcuityReason,
                    !string.IsNullOrWhiteSpace(vital?.HomeInstructions) ? $"Home Care: {vital.HomeInstructions}" : null
                }
                .Where(s => !string.IsNullOrWhiteSpace(s))
                .ToList();
            var nurseAssessment = nurseRemarks.Count > 0 ? string.Join(" | ", nurseRemarks) : (q.ChiefComplaint ?? "—");

            var vparts = new List<string>();
            if (vital != null)
            {
                if (vital.SystolicBp.HasValue && vital.DiastolicBp.HasValue) vparts.Add($"BP {vital.SystolicBp}/{vital.DiastolicBp}");
                if (vital.HeartRateBpm.HasValue) vparts.Add($"HR {vital.HeartRateBpm}bpm");
                if (vital.RespiratoryRateBreathsPerMin.HasValue) vparts.Add($"RR {vital.RespiratoryRateBreathsPerMin}cpm");
                if (vital.TemperatureCelsius.HasValue) vparts.Add($"T {vital.TemperatureCelsius:0.0}°C");
                if (vital.OxygenSaturationPercent.HasValue) vparts.Add($"SpO2 {vital.OxygenSaturationPercent:0}%");
                if (vital.Bmi.HasValue) vparts.Add($"BMI {vital.Bmi:0.0}");
            }
            var vitalsSnapshot = vparts.Count > 0 ? string.Join(", ", vparts) : "No vitals recorded";

            // Doctor details & diagnoses
            var attendingDoc = consult?.DoctorName ?? q.DoctorName;
            if (!string.IsNullOrWhiteSpace(attendingDoc) && !string.IsNullOrWhiteSpace(consult?.DoctorPrcLicense))
                attendingDoc = $"{attendingDoc} (PRC: {consult.DoctorPrcLicense})";

            string? docDiagnoses;
            if (consult != null && consult.Diagnoses != null && consult.Diagnoses.Count > 0)
            {
                docDiagnoses = string.Join("; ", consult.Diagnoses
                    .OrderByDescending(d => d.IsPrimary)
                    .Select(d => $"[{d.Icd10Code}] {d.Description}{(d.IsPrimary ? " (Primary)" : "")}"));
            }
            else if (q.VisitType != VisitType.Consultation)
            {
                docDiagnoses = "N/A - Non-doctor visit";
            }
            else
            {
                docDiagnoses = "Pending diagnosis";
            }

            // Review of Systems (ROS) Category & Systems Reviewed
            string? rosCategoryLabel = null;
            if (consult?.RosCategory.HasValue == true)
            {
                rosCategoryLabel = RosCategoryHelper.ToDisplayLabel(consult.RosCategory.Value);
            }
            else if (vital?.RosCategory.HasValue == true)
            {
                rosCategoryLabel = RosCategoryHelper.ToDisplayLabel(vital.RosCategory.Value);
            }
            else if (visitDispensings.Count > 0)
            {
                rosCategoryLabel = RosCategoryHelper.ToDisplayLabel(visitDispensings[0].RosCategory);
            }
            else if (consult?.ReviewOfSystemsItems is { Count: > 0 })
            {
                var firstAbnormal = consult.ReviewOfSystemsItems.FirstOrDefault(r => !r.IsNormal);
                rosCategoryLabel = RosCategoryHelper.ToDisplayLabel((firstAbnormal ?? consult.ReviewOfSystemsItems.First()).System);
            }

            RecordVisitRos(q.Id, rosCategoryLabel);
            if (consult?.RosCategory.HasValue == true)
            {
                RecordVisitRos(q.Id, RosCategoryHelper.ToDisplayLabel(consult.RosCategory.Value));
            }
            if (vital?.RosCategory.HasValue == true)
            {
                RecordVisitRos(q.Id, RosCategoryHelper.ToDisplayLabel(vital.RosCategory.Value));
            }
            if (consult?.ReviewOfSystemsItems != null)
            {
                foreach (var rosItem in consult.ReviewOfSystemsItems)
                {
                    RecordVisitRos(q.Id, RosCategoryHelper.ToDisplayLabel(rosItem.System));
                }
            }
            foreach (var disp in visitDispensings)
            {
                RecordVisitRos(q.Id, RosCategoryHelper.ToDisplayLabel(disp.RosCategory));
            }

            var sysParts = new List<string>();
            if (consult != null)
            {
                if (consult.RosCategory.HasValue &&
                    (consult.ReviewOfSystemsItems == null || consult.ReviewOfSystemsItems.All(r => r.System != consult.RosCategory.Value)))
                {
                    sysParts.Add($"ROS Category: {RosCategoryHelper.ToDisplayLabel(consult.RosCategory.Value)}");
                }

                if (consult.ReviewOfSystemsItems != null)
                {
                    foreach (var ros in consult.ReviewOfSystemsItems)
                    {
                        var label = ros.System == RosSystem.EssentiallyNormal
                            ? "Essentially Normal"
                            : $"{ros.System}: {(ros.IsNormal ? "Normal" : (ros.Remarks ?? ros.SymptomTitle ?? "Abnormal"))}";
                        sysParts.Add(label);
                    }
                }
                if (consult.PhysicalExams != null)
                {
                    foreach (var pe in consult.PhysicalExams)
                    {
                        if (pe.Findings != null)
                        {
                            foreach (var f in pe.Findings.Where(x => !x.IsNormal && !string.IsNullOrWhiteSpace(x.Remarks)))
                            {
                                sysParts.Add($"{f.System}: {f.Remarks}");
                            }
                        }
                    }
                }
            }
            else if (vital?.RosCategory.HasValue == true)
            {
                sysParts.Add($"ROS Category: {RosCategoryHelper.ToDisplayLabel(vital.RosCategory.Value)}");
            }
            else if (visitDispensings.Count > 0)
            {
                sysParts.Add($"ROS Category: {RosCategoryHelper.ToDisplayLabel(visitDispensings[0].RosCategory)}");
            }
            var systemsReviewed = sysParts.Count > 0 ? string.Join("; ", sysParts) : "None recorded";

            // Procedures & Dispensed Medicines Summary
            totalProceduresPerformedCount += procs.Count;
            var procNames = procs.Select(p => p.ProcedureName).Distinct().ToList();
            var proceduresPerformed = procNames.Count > 0 ? string.Join(", ", procNames) : "None";

            string? dispensedSummary = visitDispensings.Count > 0
                ? string.Join("; ", visitDispensings.Select(d =>
                    $"{d.ItemName}{(!string.IsNullOrWhiteSpace(d.DosageOrSpec) ? " " + d.DosageOrSpec : "")} x{d.QuantityDispensed} {d.FormOrUnit}"))
                : null;

            // Disposition
            string disposition;
            if (!string.IsNullOrWhiteSpace(q.DivertedToFacility))
                disposition = $"Emergency Diversion to {q.DivertedToFacility} ({q.TransportMode ?? "Ambulance"})";
            else if (!string.IsNullOrWhiteSpace(consult?.ClinicalDisposition))
                disposition = consult.ClinicalDisposition;
            else if (!string.IsNullOrWhiteSpace(q.DischargeNotes))
                disposition = q.DischargeNotes;
            else if (q.Status == QueueStatus.Completed)
                disposition = "Treated & Discharged";
            else
                disposition = q.Status.ToString();

            // Billing
            string billingStatus = "Unbilled";
            string? orNumber = null;
            decimal amountPaid = 0m, gross = 0m, net = 0m, balance = 0m;
            if (inv != null)
            {
                gross = inv.GrossAmount;
                net = inv.NetAmount;
                amountPaid = inv.AmountPaid;
                balance = inv.BalanceDue;
                if (inv.Payments != null && inv.Payments.Count > 0)
                {
                    orNumber = string.Join(", ", inv.Payments.Select(p => p.PaymentNumber));
                }

                if (inv.Status == InvoiceStatus.Paid || (amountPaid > 0 && balance <= 0))
                    billingStatus = "Paid";
                else if (inv.DiscountType == DiscountType.PhilHealthKonsulta && balance <= 0)
                    billingStatus = "Zero-Balance / PhilHealth";
                else if (balance > 0 && amountPaid > 0)
                    billingStatus = "Partially Paid";
                else if (balance > 0 && amountPaid == 0)
                    billingStatus = "Unsettled / Promissory";
                else
                    billingStatus = inv.Status.ToString();
            }

            // New vs Returning
            bool isNew = earliestLookup.TryGetValue(q.PatientId, out var firstCheckIn) && q.CheckInTime <= firstCheckIn;

            var fullName = patient != null
                ? $"{patient.LastName}, {patient.FirstName}{(string.IsNullOrWhiteSpace(patient.MiddleName) ? "" : " " + patient.MiddleName[0] + ".")}"
                : q.PatientName;

            foreach (var d in visitDispensings)
            {
                visitLedgerRows.Add(new CensusDispensingLedgerItemDto(
                    Id: d.Id,
                    DispensedAt: d.DispensedAt,
                    QueueItemId: q.Id,
                    QueueNumber: q.QueueNumber,
                    PatientName: fullName,
                    VisitType: servicesAvailedSummary,
                    Source: d.Source == ClinicDispenseSource.DoctorConsultation ? "Doctor Consultation" : "Nurse Vitals Check",
                    ItemName: d.ItemName,
                    ItemCategory: d.ItemCategory == ClinicDispenseItemCategory.MedicalSupply ? "Medical Supply" : "Medicine",
                    DosageOrSpec: d.DosageOrSpec,
                    FormOrUnit: d.FormOrUnit,
                    QuantityDispensed: d.QuantityDispensed,
                    DirectionsOrInstructions: d.DirectionsOrInstructions,
                    RosCategory: RosCategoryHelper.ToDisplayLabel(d.RosCategory),
                    DispensedByStaffName: d.DispensedByStaffName,
                    DispensedByRole: d.DispensedByRole,
                    RequiresDoctorReview: d.RequiresDoctorReview,
                    IsReviewedByDoctor: d.ReviewedAt.HasValue,
                    ReviewedByDoctorName: d.ReviewedByDoctorName,
                    InterventionFlagged: d.InterventionFlagged
                ));
            }

            items.Add(new CensusItemDto(
                SequenceNumber: seq++,
                CheckInTime: q.CheckInTime,
                TriageTime: vital?.RecordedAt,
                CalledTime: q.CalledTime,
                CompletedTime: completion,
                TurnaroundMinutes: turnaround,
                QueueNumber: q.QueueNumber,
                PatientCode: patient?.PatientCode ?? "PAT-UNKNOWN",
                PatientName: fullName,
                Age: age,
                Sex: patient?.Sex.ToString() ?? "Unknown",
                CivilStatus: patient?.CivilStatus?.ToString() ?? "Unknown",
                Classification: classification,
                CustomFields: customFields,
                CustomFieldsSummary: string.IsNullOrWhiteSpace(customSummary) ? "None" : customSummary,
                VisitType: q.VisitType.ToString(),
                ChiefComplaint: q.ChiefComplaint,
                NurseAssessment: nurseAssessment,
                AttendingNurse: vital?.RecordedByNurseName ?? visitDispensings.FirstOrDefault(d => d.Source == ClinicDispenseSource.NurseVitalsCheck)?.DispensedByStaffName ?? procs.FirstOrDefault()?.PerformedByStaffName ?? "—",
                VitalsSnapshot: vitalsSnapshot,
                AttendingDoctor: string.IsNullOrWhiteSpace(attendingDoc) ? "—" : attendingDoc,
                DoctorDiagnosis: docDiagnoses,
                ClinicalAssessment: string.IsNullOrWhiteSpace(consult?.Assessment) ? "—" : consult.Assessment,
                SystemsReviewed: systemsReviewed,
                ProceduresPerformed: proceduresPerformed,
                Acuity: q.Priority.ToString(),
                Disposition: disposition,
                BillingStatus: billingStatus,
                OfficialReceiptNumber: orNumber,
                AmountPaid: amountPaid,
                GrossAmount: gross,
                NetAmount: net,
                BalanceDue: balance,
                IsNewPatient: isNew,
                ServicesAvailed: servicesAvailed,
                ServicesAvailedSummary: servicesAvailedSummary,
                RosCategory: rosCategoryLabel,
                DispensedMedicinesSummary: dispensedSummary,
                PrescriptionsCount: prescriptionsCount,
                MedicalCertificatesCount: visitMedCerts.Count,
                ReferralsCount: visitReferrals.Count,
                LabRequisitionsCount: visitLabOrders.Count
            ));
        }

        // 6. Aggregate Telemetry Summaries
        int totalCensus = items.Count;
        int newPatients = items.Count(i => i.IsNewPatient);
        int returningPatients = totalCensus - newPatients;
        int consultationCount = items.Count(i => i.VisitType == "Consultation");
        int standaloneProcedures = items.Count(i => i.VisitType == "StandaloneProcedure");
        int diagnosticsOrLab = items.Count(i => i.VisitType == "LaboratorySpecimen");
        int nonDoctorVisits = totalCensus - consultationCount;
        int completedVisits = items.Count(i => i.CompletedTime.HasValue);
        int inConsultOrWaiting = items.Count(i => !i.CompletedTime.HasValue && (i.Disposition == "Waiting" || i.Disposition == "InConsultation" || i.Disposition == "Triaged"));
        int divertedVisits = queueItems.Count(q => !string.IsNullOrWhiteSpace(q.DivertedToFacility) || q.DivertedAt.HasValue);
        int cancelledOrNoShow = queueItems.Count(q => q.Status == QueueStatus.Cancelled || q.Status == QueueStatus.NoShow);

        var completedItems = items.Where(i => i.TurnaroundMinutes.HasValue).ToList();
        double avgTurnaround = completedItems.Count > 0 ? Math.Round(completedItems.Average(i => i.TurnaroundMinutes!.Value), 1) : 0.0;

        int routineCount = items.Count(i => i.Acuity.Equals("Routine", StringComparison.OrdinalIgnoreCase));
        int urgentCount = items.Count(i => i.Acuity.Equals("Urgent", StringComparison.OrdinalIgnoreCase));
        int emergencyCount = items.Count(i => i.Acuity.Equals("Emergency", StringComparison.OrdinalIgnoreCase));

        int visitsWithDispensing = items.Count(i => !string.IsNullOrWhiteSpace(i.DispensedMedicinesSummary));
        int totalDispensedLineItems = visitLedgerRows.Count;
        int totalDispensedUnits = visitLedgerRows.Sum(d => d.QuantityDispensed);
        int prescriptionsIssued = items.Sum(i => i.PrescriptionsCount);
        int medCertsIssued = items.Sum(i => i.MedicalCertificatesCount);
        int referralsIssued = items.Sum(i => i.ReferralsCount);
        int labRequisitionsIssued = items.Sum(i => i.LabRequisitionsCount);
        int vitalsCheckVisits = items.Count(i => i.VisitType == "VitalsCheckOnly");
        int inClinicProcedureVisits = items.Count(i => i.ServicesAvailed != null && i.ServicesAvailed.Contains("In-Clinic Procedure"));
        int inClinicProceduresCount = Math.Max(inClinicProcedureVisits, totalProceduresPerformedCount);

        var summary = new CensusSummaryDto(
            TotalCensus: totalCensus,
            NewPatients: newPatients,
            ReturningPatients: returningPatients,
            Consultations: consultationCount,
            StandaloneProcedures: standaloneProcedures,
            DiagnosticsOrLab: diagnosticsOrLab,
            NonDoctorVisits: nonDoctorVisits,
            CompletedVisits: completedVisits,
            InConsultationOrWaiting: inConsultOrWaiting,
            DivertedVisits: divertedVisits,
            CancelledOrNoShow: cancelledOrNoShow,
            AverageTurnaroundMinutes: avgTurnaround,
            DistinctPatientsCount: patientIds.Count,
            UrgentAcuityCount: urgentCount,
            EmergencyAcuityCount: emergencyCount,
            VisitsWithMedicineDispensing: visitsWithDispensing,
            TotalDispensedLineItems: totalDispensedLineItems,
            TotalDispensedUnits: totalDispensedUnits,
            PrescriptionsIssued: prescriptionsIssued,
            MedicalCertificatesIssued: medCertsIssued,
            ReferralsIssued: referralsIssued,
            LabRequisitionsIssued: labRequisitionsIssued,
            VitalsCheckVisits: vitalsCheckVisits,
            InClinicProceduresCount: inClinicProceduresCount
        );

        // 7. Aggregate Demographics Breakdown
        int pedCount = items.Count(i => i.Age < 18);
        int seniorCount = items.Count(i => i.Age >= 60 || i.Classification.Contains("Senior"));
        int adultCount = totalCensus - (pedCount + seniorCount);
        if (adultCount < 0) adultCount = 0;

        int maleCount = items.Count(i => i.Sex.Equals("Male", StringComparison.OrdinalIgnoreCase));
        int femaleCount = items.Count(i => i.Sex.Equals("Female", StringComparison.OrdinalIgnoreCase));
        int otherGenderCount = totalCensus - (maleCount + femaleCount);

        var demographics = new CensusDemographicsBreakdownDto(
            PediatricCount: pedCount,
            PediatricPercentage: totalCensus > 0 ? Math.Round(((double)pedCount / totalCensus) * 100, 1) : 0.0,
            AdultCount: adultCount,
            AdultPercentage: totalCensus > 0 ? Math.Round(((double)adultCount / totalCensus) * 100, 1) : 0.0,
            SeniorCount: seniorCount,
            SeniorPercentage: totalCensus > 0 ? Math.Round(((double)seniorCount / totalCensus) * 100, 1) : 0.0,
            MaleCount: maleCount,
            MalePercentage: totalCensus > 0 ? Math.Round(((double)maleCount / totalCensus) * 100, 1) : 0.0,
            FemaleCount: femaleCount,
            FemalePercentage: totalCensus > 0 ? Math.Round(((double)femaleCount / totalCensus) * 100, 1) : 0.0,
            OtherGenderCount: otherGenderCount,
            OtherGenderPercentage: totalCensus > 0 ? Math.Round(((double)otherGenderCount / totalCensus) * 100, 1) : 0.0,
            SeniorCitizenCount: seniorCount,
            PwdCount: items.Count(i => i.Classification.Contains("PWD")),
            PhilHealthCount: items.Count(i => i.Classification.Contains("PhilHealth"))
        );

        // 8. Aggregate Acuity Breakdown
        var acuity = new CensusAcuityBreakdownDto(
            RoutineCount: routineCount,
            RoutinePercentage: totalCensus > 0 ? Math.Round(((double)routineCount / totalCensus) * 100, 1) : 0.0,
            UrgentCount: urgentCount,
            UrgentPercentage: totalCensus > 0 ? Math.Round(((double)urgentCount / totalCensus) * 100, 1) : 0.0,
            EmergencyCount: emergencyCount,
            EmergencyPercentage: totalCensus > 0 ? Math.Round(((double)emergencyCount / totalCensus) * 100, 1) : 0.0
        );

        // 9. Visit Types Breakdown
        var visitTypes = items.GroupBy(i => i.VisitType)
            .Select(g => new CensusVisitTypeBreakdownDto(
                VisitType: g.Key,
                Count: g.Count(),
                Percentage: totalCensus > 0 ? Math.Round(((double)g.Count() / totalCensus) * 100, 1) : 0.0
            ))
            .OrderByDescending(v => v.Count)
            .ToList();

        // 10. Provider Workload Breakdown
        var providerList = new List<CensusProviderBreakdownDto>();

        var docEncounters = items.Where(i => i.AttendingDoctor != "—")
            .GroupBy(i => i.AttendingDoctor!.Split('(')[0].Trim())
            .Select(g => new CensusProviderBreakdownDto(
                StaffName: g.Key,
                Role: "Doctor",
                TotalEncounters: g.Count(),
                CompletedEncounters: g.Count(x => x.CompletedTime.HasValue)
            ));
        providerList.AddRange(docEncounters);

        var nurseEncounters = items.Where(i => i.AttendingNurse != "—")
            .GroupBy(i => i.AttendingNurse!)
            .Select(g => new CensusProviderBreakdownDto(
                StaffName: g.Key,
                Role: "Nurse",
                TotalEncounters: g.Count(),
                CompletedEncounters: g.Count(x => x.CompletedTime.HasValue)
            ));
        providerList.AddRange(nurseEncounters);

        // Facility metadata
        FacilitySettings? settings = null;
        if (_settingsRepo != null)
        {
            settings = await _settingsRepo.Query().FirstOrDefaultAsync(cancellationToken);
        }

        var orderedLedger = visitLedgerRows
            .OrderBy(r => r.DispensedAt)
            .ToList();

        var dispCountByRos = orderedLedger
            .Where(r => !string.IsNullOrWhiteSpace(r.RosCategory))
            .GroupBy(r => r.RosCategory.Trim(), StringComparer.OrdinalIgnoreCase)
            .ToDictionary(g => g.Key, g => g.Count(), StringComparer.OrdinalIgnoreCase);

        var allRosKeys = rosVisitTracker.Keys
            .Union(dispCountByRos.Keys, StringComparer.OrdinalIgnoreCase)
            .ToList();

        var rosBreakdown = allRosKeys
            .Select(cat =>
            {
                int vCount = rosVisitTracker.TryGetValue(cat, out var qSet) ? qSet.Count : 0;
                int dCount = dispCountByRos.GetValueOrDefault(cat);
                double pct = totalCensus > 0 ? Math.Round(((double)vCount / totalCensus) * 100.0, 1) : 0.0;
                return new CensusRosBreakdownDto(cat, vCount, dCount, pct);
            })
            .OrderByDescending(r => r.VisitCount)
            .ThenByDescending(r => r.DispensingCount)
            .ThenBy(r => r.RosCategory, StringComparer.OrdinalIgnoreCase)
            .ToList();

        var preliminaryReport = new ClinicCensusReportDto(
            StartDate: start,
            EndDate: end.AddDays(-1),
            TenantId: _clinicContext.TenantId,
            ClinicId: _clinicContext.ClinicId,
            ClinicName: settings?.ClinicName ?? "Clinic",
            GeneratedAt: DateTime.UtcNow,
            Summary: summary,
            Demographics: demographics,
            Acuity: acuity,
            VisitTypes: visitTypes,
            Providers: providerList.OrderByDescending(p => p.TotalEncounters).ToList(),
            Items: items,
            DispensingLedger: orderedLedger,
            RosBreakdown: rosBreakdown
        );

        return preliminaryReport with
        {
            ServiceBreakdown = ClinicCensusBreakdownResolver.ResolveServiceBreakdown(preliminaryReport)
        };
    }
}
