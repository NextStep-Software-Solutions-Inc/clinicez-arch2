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
    string? Status = null,
    string? Acuity = null,
    string? Search = null,
    int? Page = null,
    int? PageSize = null,
    string? TableVisitType = null
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
    private readonly IRepository<ServiceItem>? _serviceItemRepo;

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
        IRepository<LabOrder>? labOrderRepo = null,
        IRepository<ServiceItem>? serviceItemRepo = null)
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
        _serviceItemRepo = serviceItemRepo;
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
        List<ServiceItem> serviceItems = new();
        Dictionary<Guid, DateTime> earliestLookup = new();

        FacilitySettings? settings = null;
        if (_settingsRepo != null)
        {
            settings = await _settingsRepo.Query().FirstOrDefaultAsync(cancellationToken);
        }

        if (_serviceItemRepo != null)
        {
            serviceItems = await _serviceItemRepo.Query(s => s.IsActive).ToListAsync(cancellationToken);
        }

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

            procedures = await _procedureRepo.Query(p =>
                    p.Status != ProcedureStatus.Cancelled &&
                    ((p.QueueItemId.HasValue && queueItemIds.Contains(p.QueueItemId.Value)) ||
                     (patientIds.Contains(p.PatientId) && p.ScheduledAt >= start && p.ScheduledAt < end)))
                .ToListAsync(cancellationToken);

            invoices = await _invoiceRepo.Query(i =>
                    i.Status != InvoiceStatus.Voided &&
                    i.Status != InvoiceStatus.Refunded &&
                    ((i.QueueItemId.HasValue && queueItemIds.Contains(i.QueueItemId.Value)) ||
                     (i.ConsultationId.HasValue && signedConsultIds.Contains(i.ConsultationId.Value)) ||
                     (i.PatientId.HasValue && patientIds.Contains(i.PatientId.Value) && i.InvoiceDate >= start && i.InvoiceDate < end)))
                .Include(i => i.LineItems)
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
                    .Include(o => o.Items)
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
            .Select(c => (QueueId: c.QueueItemId ?? PickClosestVisitQueueId(c.PatientId, c.EncounterDate, q => q.VisitType.IsPhysicianConsultation()), Consult: c))
            .Where(x => x.QueueId.HasValue)
            .ToLookup(x => x.QueueId!.Value, x => x.Consult);

        var procByQueueId = procedures
            .Select(p => (QueueId: p.QueueItemId ?? PickClosestVisitQueueId(p.PatientId, p.ScheduledAt), Proc: p))
            .Where(x => x.QueueId.HasValue)
            .ToLookup(x => x.QueueId!.Value, x => x.Proc);

        var invByQueueId = invoices
            .Where(i => i.QueueItemId.HasValue || !i.ConsultationId.HasValue)
            .Select(i => (QueueId: i.QueueItemId ?? (i.PatientId.HasValue ? PickClosestVisitQueueId(i.PatientId.Value, i.InvoiceDate) : null), Inv: i))
            .Where(x => x.QueueId.HasValue)
            .ToLookup(x => x.QueueId!.Value, x => x.Inv);
        var invByConsultId = invoices
            .Where(i => !i.QueueItemId.HasValue && i.ConsultationId.HasValue)
            .ToLookup(i => i.ConsultationId!.Value);

        var dispByQueueId = dispensingLogs.ToLookup(d => d.QueueItemId);
        var dispByConsultId = dispensingLogs.Where(d => d.ConsultationEncounterId.HasValue).ToLookup(d => d.ConsultationEncounterId!.Value);

        var medCertByQueueId = medCerts
            .Where(m => m.QueueItemId.HasValue || !m.ConsultationId.HasValue)
            .Select(m => (QueueId: m.QueueItemId ?? PickClosestVisitQueueId(m.PatientId, m.CreatedAt), Cert: m))
            .Where(x => x.QueueId.HasValue)
            .ToLookup(x => x.QueueId!.Value, x => x.Cert);
        var medCertByConsultId = medCerts.Where(m => !m.QueueItemId.HasValue && m.ConsultationId.HasValue).ToLookup(m => m.ConsultationId!.Value);

        var refByQueueId = referrals
            .Where(r => r.QueueItemId.HasValue || !r.ConsultationId.HasValue)
            .Select(r => (QueueId: r.QueueItemId ?? PickClosestVisitQueueId(r.PatientId, r.CreatedAt, q => q.VisitType.IsPhysicianConsultation()), Ref: r))
            .Where(x => x.QueueId.HasValue)
            .ToLookup(x => x.QueueId!.Value, x => x.Ref);
        var refByConsultId = referrals.Where(r => !r.QueueItemId.HasValue && r.ConsultationId.HasValue).ToLookup(r => r.ConsultationId!.Value);

        var labByQueueId = labOrders
            .Where(o => o.QueueItemId.HasValue || !o.ConsultationId.HasValue)
            .Select(o => (QueueId: o.QueueItemId ?? PickClosestVisitQueueId(o.PatientId, o.OrderDate), Lab: o))
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
            var visitInvoices = new List<Invoice>();
            visitInvoices.AddRange(invByQueueId[q.Id]);
            if (consult != null)
            {
                foreach (var ci in invByConsultId[consult.Id])
                {
                    if (visitInvoices.All(existing => existing.Id != ci.Id))
                        visitInvoices.Add(ci);
                }
            }

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
            var baseServiceLabel = q.VisitType.ToDisplayLabel();
            if (!string.IsNullOrWhiteSpace(baseServiceLabel))
                servicesAvailed.Add(baseServiceLabel);

            if (visitDispensings.Count > 0)
                servicesAvailed.Add("Medicine Dispensing");
            if (prescriptionsCount > 0)
                servicesAvailed.Add("Prescription");
            if (visitMedCerts.Count > 0 && !servicesAvailed.Contains("Medical Certificate"))
                servicesAvailed.Add("Medical Certificate");
            if (visitReferrals.Count > 0)
                servicesAvailed.Add("Referral");
            bool hasDiagnosticInvoiceLines = visitInvoices.Any(i =>
                i.LineItems != null && i.LineItems.Any(li => li.Category.Equals("Diagnostic", StringComparison.OrdinalIgnoreCase)));
            if (visitLabOrders.Count > 0 || hasDiagnosticInvoiceLines)
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
            else if (!q.VisitType.IsPhysicianConsultation())
            {
                docDiagnoses = string.Empty;
            }
            else
            {
                docDiagnoses = "Pending diagnosis";
            }

            // Review of Systems (ROS) Category & Systems Reviewed
            string? consultRosLabel = null;
            if (consult?.RosCategory.HasValue == true)
            {
                consultRosLabel = RosCategoryHelper.ToDisplayLabel(consult.RosCategory.Value);
            }
            else if (consult?.ReviewOfSystemsItems is { Count: > 0 })
            {
                var firstAbnormal = consult.ReviewOfSystemsItems.FirstOrDefault(r => !r.IsNormal);
                consultRosLabel = RosCategoryHelper.ToDisplayLabel((firstAbnormal ?? consult.ReviewOfSystemsItems.First()).System);
            }

            string? rosCategoryLabel = consultRosLabel;
            if (string.IsNullOrWhiteSpace(rosCategoryLabel))
            {
                if (vital?.RosCategory.HasValue == true)
                {
                    rosCategoryLabel = RosCategoryHelper.ToDisplayLabel(vital.RosCategory.Value);
                }
                else if (visitDispensings.Count > 0)
                {
                    rosCategoryLabel = RosCategoryHelper.ToDisplayLabel(visitDispensings[0].RosCategory);
                }
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

            var consultSysParts = new List<string>();
            var sysParts = new List<string>();
            if (consult != null)
            {
                if (consult.RosCategory.HasValue &&
                    (consult.ReviewOfSystemsItems == null || consult.ReviewOfSystemsItems.All(r => r.System != consult.RosCategory.Value)))
                {
                    consultSysParts.Add($"ROS Category: {RosCategoryHelper.ToDisplayLabel(consult.RosCategory.Value)}");
                }

                if (consult.ReviewOfSystemsItems != null)
                {
                    foreach (var ros in consult.ReviewOfSystemsItems)
                    {
                        var label = ros.System == RosSystem.EssentiallyNormal
                            ? "Essentially Normal"
                            : $"{ros.System}: {(ros.IsNormal ? "Normal" : (ros.Remarks ?? ros.SymptomTitle ?? "Abnormal"))}";
                        consultSysParts.Add(label);
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
                                consultSysParts.Add($"{f.System}: {f.Remarks}");
                            }
                        }
                    }
                }
                sysParts.AddRange(consultSysParts);
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

            // Billing (aggregate across all non-voided/non-refunded visit invoices)
            string billingStatus = "Unbilled";
            string? orNumber = null;
            decimal amountPaid = 0m, gross = 0m, net = 0m, balance = 0m;
            if (visitInvoices.Count > 0)
            {
                gross = visitInvoices.Sum(i => i.GrossAmount);
                net = visitInvoices.Sum(i => i.NetAmount);
                amountPaid = visitInvoices.Sum(i => i.AmountPaid);
                balance = visitInvoices.Sum(i => i.BalanceDue);

                var orNums = visitInvoices
                    .Where(i => i.Payments != null)
                    .SelectMany(i => i.Payments)
                    .Select(p => p.PaymentNumber)
                    .Where(s => !string.IsNullOrWhiteSpace(s))
                    .Distinct()
                    .ToList();
                if (orNums.Count > 0)
                {
                    orNumber = string.Join(", ", orNums);
                }

                if (visitInvoices.All(i => i.Status == InvoiceStatus.Paid) || (amountPaid > 0 && balance <= 0))
                    billingStatus = "Paid";
                else if (visitInvoices.Any(i => i.DiscountType == DiscountType.PhilHealthKonsulta) && balance <= 0)
                    billingStatus = "Zero-Balance / PhilHealth";
                else if (balance > 0 && amountPaid > 0)
                    billingStatus = "Partially Paid";
                else if (balance > 0 && amountPaid == 0)
                    billingStatus = "Unsettled / Promissory";
                else
                    billingStatus = visitInvoices[0].Status.ToString();
            }

            // Per-visit invoice line item claim tracker & catalog price fallback for accurate per-service fees
            var claimableLines = visitInvoices
                .Where(i => i.LineItems != null)
                .SelectMany(i => i.LineItems.Select(li => new
                {
                    InvoiceNumber = i.InvoiceNumber,
                    InvoiceDate = i.InvoiceDate,
                    Line = li,
                    UnitPrice = li.Quantity > 0 ? Math.Round(li.TotalPrice / li.Quantity, 2) : li.TotalPrice
                }))
                .ToList();
            var remainingQty = claimableLines.Select(x => Math.Max(1, x.Line.Quantity)).ToArray();

            bool HasUnclaimedInvoiceUnit(Func<InvoiceLineItem, bool> predicate)
            {
                for (int idx = 0; idx < claimableLines.Count; idx++)
                {
                    if (remainingQty[idx] > 0 && predicate(claimableLines[idx].Line))
                        return true;
                }
                return false;
            }

            decimal? TryClaimInvoiceUnit(Func<InvoiceLineItem, bool> predicate)
            {
                for (int idx = 0; idx < claimableLines.Count; idx++)
                {
                    if (remainingQty[idx] > 0 && predicate(claimableLines[idx].Line))
                    {
                        remainingQty[idx]--;
                        return claimableLines[idx].UnitPrice;
                    }
                }
                return null;
            }

            decimal LookupCatalogPrice(string? code, string? name, params string[] allowedCategories)
            {
                if (serviceItems.Count == 0) return 0m;
                IEnumerable<ServiceItem> pool = serviceItems;
                if (allowedCategories.Length > 0)
                {
                    var catMatches = serviceItems
                        .Where(s => allowedCategories.Any(cat => s.Category.Equals(cat, StringComparison.OrdinalIgnoreCase)))
                        .ToList();
                    if (catMatches.Count > 0)
                        pool = catMatches;
                }

                if (!string.IsNullOrWhiteSpace(code))
                {
                    var trimmedCode = code.Trim();
                    var byCode = pool.FirstOrDefault(s => s.Code.Equals(trimmedCode, StringComparison.OrdinalIgnoreCase))
                              ?? serviceItems.FirstOrDefault(s => s.Code.Equals(trimmedCode, StringComparison.OrdinalIgnoreCase));
                    if (byCode != null) return byCode.StandardPrice;
                }

                if (!string.IsNullOrWhiteSpace(name))
                {
                    var trimmedName = name.Trim();
                    var exact = pool.FirstOrDefault(s => s.Name.Equals(trimmedName, StringComparison.OrdinalIgnoreCase))
                             ?? serviceItems.FirstOrDefault(s => s.Name.Equals(trimmedName, StringComparison.OrdinalIgnoreCase));
                    if (exact != null) return exact.StandardPrice;

                    var partial = pool.FirstOrDefault(s =>
                        s.Name.Contains(trimmedName, StringComparison.OrdinalIgnoreCase) ||
                        trimmedName.Contains(s.Name, StringComparison.OrdinalIgnoreCase));
                    if (partial != null) return partial.StandardPrice;
                }

                return 0m;
            }

            decimal vitalsFee = TryClaimInvoiceUnit(li =>
                li.Category.Equals("NursingService", StringComparison.OrdinalIgnoreCase) &&
                (li.Description.Contains("Vital", StringComparison.OrdinalIgnoreCase) ||
                 li.Description.Contains("Triage", StringComparison.OrdinalIgnoreCase)))
                ?? ((q.VisitType == VisitType.PreventiveHealthAssessment && consult == null)
                    ? LookupCatalogPrice(null, "Vitals Check", "NursingService")
                    : 0m);

            decimal consultFee = TryClaimInvoiceUnit(li =>
                li.Category.Equals("Consultation", StringComparison.OrdinalIgnoreCase) ||
                li.Description.Contains("Consultation", StringComparison.OrdinalIgnoreCase))
                ?? (consult != null
                    ? (LookupCatalogPrice(null, q.VisitType.ToDisplayLabel(), "Consultation") is > 0 and var vtPrice
                        ? vtPrice
                        : (serviceItems.FirstOrDefault(s => s.Category.Equals("Consultation", StringComparison.OrdinalIgnoreCase))?.StandardPrice
                            ?? settings?.DefaultConsultationFee
                            ?? 0m))
                    : 0m);

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

            // Build additional per-service sub-rows availed on top of the parent visit row
            // (Parent visit row retains main attending MD, main attending RN, triage vitals, diagnosis, outcome, and billing)
            var serviceRows = new List<CensusServiceRowDto>();
            int subRowIdx = 0;

            // 1. In-Clinic Procedure sub-rows (1 of N per performed/ordered procedure with specific name & fee)
            var additionalProcs = procs;
            foreach (var p in additionalProcs)
            {
                var procDetailParts = new List<string> { p.ProcedureName };
                if (!string.IsNullOrWhiteSpace(p.Category))
                    procDetailParts.Add($"({p.Category})");
                if (p.ToothNumber.HasValue)
                    procDetailParts.Add($"Tooth #{p.ToothNumber}{(!string.IsNullOrWhiteSpace(p.ToothSurface) ? " (" + p.ToothSurface + ")" : "")}");
                if (!string.IsNullOrWhiteSpace(p.MedicationAdministered))
                    procDetailParts.Add($"Med: {p.MedicationAdministered}");
                if (!string.IsNullOrWhiteSpace(p.SiteRoute))
                    procDetailParts.Add($"Site: {p.SiteRoute}");
                if (!string.IsNullOrWhiteSpace(p.TargetRoomName))
                    procDetailParts.Add($"Room: {p.TargetRoomName}");
                if (!string.IsNullOrWhiteSpace(p.ClinicalNotes))
                    procDetailParts.Add(p.ClinicalNotes);

                decimal procFee = TryClaimInvoiceUnit(li =>
                    (!string.IsNullOrWhiteSpace(p.ProcedureCode) && string.Equals(li.ItemCode, p.ProcedureCode, StringComparison.OrdinalIgnoreCase)) ||
                    li.Description.Contains(p.ProcedureName, StringComparison.OrdinalIgnoreCase) ||
                    p.ProcedureName.Contains(li.Description, StringComparison.OrdinalIgnoreCase))
                    ?? LookupCatalogPrice(p.ProcedureCode, p.ProcedureName, "Procedure", "NursingService", "Dental");

                serviceRows.Add(new CensusServiceRowDto(
                    SubRowIndex: subRowIdx++,
                    ServiceName: "In-Clinic Procedure",
                    ServiceTime: p.PerformedAt ?? p.ScheduledAt,
                    ReferenceNumber: !string.IsNullOrWhiteSpace(p.ProcedureCode) ? p.ProcedureCode : null,
                    AttendingDoctor: p.OrderedByDoctorName ?? string.Empty,
                    AttendingNurse: p.PerformedByStaffName ?? string.Empty,
                    ChiefComplaint: string.Empty,
                    NurseAssessment: string.Empty,
                    VitalsSnapshot: string.Empty,
                    DoctorDiagnosis: string.Empty,
                    ClinicalAssessment: string.Empty,
                    RosCategory: string.Empty,
                    SystemsReviewed: string.Empty,
                    ServiceDetails: string.Join(" • ", procDetailParts),
                    Acuity: q.Priority.ToString(),
                    Disposition: p.Status.ToString(),
                    ServiceItemName: p.ProcedureName,
                    ServiceFee: procFee
                ));
            }

            // 2. Medicine Dispensing sub-rows (1 sub-row per dispensed item with dispensing staff; blank diagnosis)
            foreach (var d in visitDispensings)
            {
                bool dispensedByDoctor = d.DispensedByRole.Contains("Doctor", StringComparison.OrdinalIgnoreCase);
                var dispItemLabel = $"{d.ItemName}{(!string.IsNullOrWhiteSpace(d.DosageOrSpec) ? " " + d.DosageOrSpec : "")} (x{d.QuantityDispensed})";
                var dispDetail = $"{d.ItemName}{(!string.IsNullOrWhiteSpace(d.DosageOrSpec) ? " " + d.DosageOrSpec : "")} x{d.QuantityDispensed} {d.FormOrUnit}" +
                                 $"{(!string.IsNullOrWhiteSpace(d.DirectionsOrInstructions) ? " • " + d.DirectionsOrInstructions : "")}" +
                                 $" • ROS: {RosCategoryHelper.ToDisplayLabel(d.RosCategory)}";

                decimal dispFee = 0m;
                for (int idx = 0; idx < claimableLines.Count; idx++)
                {
                    if (remainingQty[idx] > 0 &&
                        (claimableLines[idx].Line.Category.Equals("Supply", StringComparison.OrdinalIgnoreCase) ||
                         claimableLines[idx].Line.Category.Equals("Pharmacy", StringComparison.OrdinalIgnoreCase) ||
                         claimableLines[idx].Line.Category.Equals("Medicine", StringComparison.OrdinalIgnoreCase) ||
                         claimableLines[idx].Line.Description.Contains(d.ItemName, StringComparison.OrdinalIgnoreCase)))
                    {
                        if (claimableLines[idx].Line.Description.Contains(d.ItemName, StringComparison.OrdinalIgnoreCase))
                        {
                            int take = Math.Min(remainingQty[idx], Math.Max(1, d.QuantityDispensed));
                            remainingQty[idx] -= take;
                            dispFee = Math.Round(claimableLines[idx].UnitPrice * take, 2);
                            break;
                        }
                    }
                }

                serviceRows.Add(new CensusServiceRowDto(
                    SubRowIndex: subRowIdx++,
                    ServiceName: "Medicine Dispensing",
                    ServiceTime: d.DispensedAt,
                    ReferenceNumber: null,
                    AttendingDoctor: dispensedByDoctor ? d.DispensedByStaffName : (d.ReviewedByDoctorName ?? string.Empty),
                    AttendingNurse: !dispensedByDoctor ? d.DispensedByStaffName : string.Empty,
                    ChiefComplaint: string.Empty,
                    NurseAssessment: string.Empty,
                    VitalsSnapshot: string.Empty,
                    DoctorDiagnosis: string.Empty,
                    ClinicalAssessment: string.Empty,
                    RosCategory: string.Empty,
                    SystemsReviewed: string.Empty,
                    ServiceDetails: dispDetail,
                    Acuity: q.Priority.ToString(),
                    Disposition: "Dispensed",
                    ServiceItemName: dispItemLabel,
                    ServiceFee: dispFee
                ));
            }

            // 3. Prescription sub-row (when signed Rx items were issued; blank diagnosis)
            if (consult?.Prescriptions is { Count: > 0 })
            {
                var rxSummary = string.Join("; ", consult.Prescriptions.Select(rx =>
                    $"{rx.GenericName}{(!string.IsNullOrWhiteSpace(rx.Dosage) ? " " + rx.Dosage : "")} {rx.Form} #{rx.Quantity}" +
                    $"{(!string.IsNullOrWhiteSpace(rx.Sig) ? " (" + rx.Sig + ")" : "")}"));

                serviceRows.Add(new CensusServiceRowDto(
                    SubRowIndex: subRowIdx++,
                    ServiceName: "Prescription",
                    ServiceTime: consult.SignedAt ?? consult.EncounterDate,
                    ReferenceNumber: !string.IsNullOrWhiteSpace(consult.PrescriptionNumber) ? consult.PrescriptionNumber : null,
                    AttendingDoctor: attendingDoc ?? string.Empty,
                    AttendingNurse: string.Empty,
                    ChiefComplaint: string.Empty,
                    NurseAssessment: string.Empty,
                    VitalsSnapshot: string.Empty,
                    DoctorDiagnosis: string.Empty,
                    ClinicalAssessment: string.Empty,
                    RosCategory: string.Empty,
                    SystemsReviewed: string.Empty,
                    ServiceDetails: rxSummary,
                    Acuity: q.Priority.ToString(),
                    Disposition: "Issued",
                    ServiceItemName: $"{consult.Prescriptions.Count} Rx item(s)",
                    ServiceFee: 0m
                ));
            }

            // 4. Medical Certificate sub-rows (1 sub-row per signed certificate with certificate fee; blank diagnosis)
            foreach (var mc in visitMedCerts)
            {
                var mcDoctor = !string.IsNullOrWhiteSpace(mc.PrcLicenseNumber)
                    ? $"{mc.DoctorName} (PRC: {mc.PrcLicenseNumber})"
                    : mc.DoctorName;
                var mcParts = new List<string>();
                var formattedFitness = MedicalCertificate.FormatFitnessStatus(mc.FitnessStatus);
                if (!string.IsNullOrWhiteSpace(formattedFitness))
                    mcParts.Add(formattedFitness);
                if (mc.RecommendedRestDays is > 0)
                    mcParts.Add($"{mc.RecommendedRestDays} rest day(s)");
                if (!string.IsNullOrWhiteSpace(mc.Purpose))
                    mcParts.Add($"Purpose: {mc.Purpose}");
                if (!string.IsNullOrWhiteSpace(mc.Remarks))
                    mcParts.Add(mc.Remarks);

                decimal medCertFee = TryClaimInvoiceUnit(li =>
                    (!string.IsNullOrWhiteSpace(mc.CertificateNumber) && li.Description.Contains(mc.CertificateNumber, StringComparison.OrdinalIgnoreCase)) ||
                    string.Equals(li.ItemCode, "MEDCERT", StringComparison.OrdinalIgnoreCase) ||
                    string.Equals(li.ItemCode, "MED-CERT", StringComparison.OrdinalIgnoreCase) ||
                    li.Description.Contains("Medical Certificate", StringComparison.OrdinalIgnoreCase) ||
                    li.Description.Contains("Med Cert", StringComparison.OrdinalIgnoreCase))
                    ?? (LookupCatalogPrice("MEDCERT", "Medical Certificate") is > 0 and var mcPrice
                        ? mcPrice
                        : LookupCatalogPrice("MED-CERT", "Med Cert"));

                var mcItemLabel = !string.IsNullOrWhiteSpace(mc.Purpose)
                    ? mc.Purpose
                    : (!string.IsNullOrWhiteSpace(formattedFitness) ? formattedFitness : "Medical Certificate");

                serviceRows.Add(new CensusServiceRowDto(
                    SubRowIndex: subRowIdx++,
                    ServiceName: "Medical Certificate",
                    ServiceTime: mc.SignedAt ?? mc.CreatedAt,
                    ReferenceNumber: mc.CertificateNumber,
                    AttendingDoctor: mcDoctor,
                    AttendingNurse: string.Empty,
                    ChiefComplaint: string.Empty,
                    NurseAssessment: string.Empty,
                    VitalsSnapshot: string.Empty,
                    DoctorDiagnosis: string.Empty,
                    ClinicalAssessment: string.Empty,
                    RosCategory: string.Empty,
                    SystemsReviewed: string.Empty,
                    ServiceDetails: string.Join(" • ", mcParts),
                    Acuity: q.Priority.ToString(),
                    Disposition: "Issued",
                    ServiceItemName: mcItemLabel,
                    ServiceFee: medCertFee
                ));
            }

            // 5. Referral sub-rows (1 sub-row per signed referral; blank diagnosis)
            foreach (var rf in visitReferrals)
            {
                var rfDoctor = !string.IsNullOrWhiteSpace(rf.ReferringDoctorPrcNumber)
                    ? $"{rf.ReferringDoctorName} (PRC: {rf.ReferringDoctorPrcNumber})"
                    : rf.ReferringDoctorName;
                var rfDetail = $"{rf.ReferredToFacility} ({rf.ReferredDepartment}) • [{rf.Urgency}] {rf.ReasonForReferral}";

                decimal referralFee = TryClaimInvoiceUnit(li =>
                    (!string.IsNullOrWhiteSpace(rf.ReferralNumber) && li.Description.Contains(rf.ReferralNumber, StringComparison.OrdinalIgnoreCase)) ||
                    li.Description.Contains("Referral", StringComparison.OrdinalIgnoreCase))
                    ?? LookupCatalogPrice("REFERRAL", "Referral");

                serviceRows.Add(new CensusServiceRowDto(
                    SubRowIndex: subRowIdx++,
                    ServiceName: "Referral",
                    ServiceTime: rf.SignedAt ?? rf.CreatedAt,
                    ReferenceNumber: rf.ReferralNumber,
                    AttendingDoctor: rfDoctor,
                    AttendingNurse: string.Empty,
                    ChiefComplaint: string.Empty,
                    NurseAssessment: string.Empty,
                    VitalsSnapshot: string.Empty,
                    DoctorDiagnosis: string.Empty,
                    ClinicalAssessment: string.Empty,
                    RosCategory: string.Empty,
                    SystemsReviewed: string.Empty,
                    ServiceDetails: rfDetail,
                    Acuity: q.Priority.ToString(),
                    Disposition: "Referred",
                    ServiceItemName: rf.ReferredToFacility,
                    ServiceFee: referralFee
                ));
            }

            // 6. Diagnostic Orders:
            //    - In-Clinic Diagnostics: 1 of N isolated sub-rows per performed/ordered in-clinic test with its per-test fee
            //    - Outside Diagnostic Orders: 1 grouped sub-row per outside requisition (₱0.00 clinic fee)
            int diagnosticGroupsAndTestsCount = 0;
            foreach (var lo in visitLabOrders)
            {
                var loDoctor = !string.IsNullOrWhiteSpace(lo.OrderedByDoctorName)
                    ? lo.OrderedByDoctorName
                    : (!string.IsNullOrWhiteSpace(lo.RequestingPhysicianName) ? lo.RequestingPhysicianName : (attendingDoc ?? string.Empty));
                var loTargetLab = !string.IsNullOrWhiteSpace(lo.LaboratoryName)
                    ? lo.LaboratoryName
                    : lo.ExternalLabName;

                bool orderLevelOutside = lo.TargetFacilityId.HasValue ||
                                         !string.IsNullOrWhiteSpace(lo.TargetTenantId) ||
                                         !string.IsNullOrWhiteSpace(lo.ExternalLabName) ||
                                         !string.IsNullOrWhiteSpace(lo.LaboratoryTenantId);
                bool orderMarkedInClinic = lo.Notes != null && lo.Notes.Contains("In-Clinic", StringComparison.OrdinalIgnoreCase);
                bool orderMarkedOutside = lo.Notes != null && lo.Notes.Contains("Outside", StringComparison.OrdinalIgnoreCase);

                if (lo.Items == null || lo.Items.Count == 0)
                {
                    var loFallbackDetail = !string.IsNullOrWhiteSpace(lo.Notes) ? lo.Notes : "Diagnostic Requisition";
                    if (!string.IsNullOrWhiteSpace(loTargetLab))
                        loFallbackDetail = $"{loFallbackDetail} • {loTargetLab}";

                    diagnosticGroupsAndTestsCount++;
                    serviceRows.Add(new CensusServiceRowDto(
                        SubRowIndex: subRowIdx++,
                        ServiceName: "Laboratory Requisition",
                        ServiceTime: lo.OrderDate,
                        ReferenceNumber: lo.OrderNumber,
                        AttendingDoctor: loDoctor,
                        AttendingNurse: string.Empty,
                        ChiefComplaint: string.Empty,
                        NurseAssessment: string.Empty,
                        VitalsSnapshot: string.Empty,
                        DoctorDiagnosis: string.Empty,
                        ClinicalAssessment: string.Empty,
                        RosCategory: string.Empty,
                        SystemsReviewed: string.Empty,
                        ServiceDetails: loFallbackDetail,
                        Acuity: q.Priority.ToString(),
                        Disposition: lo.Stage.ToString(),
                        ServiceItemName: null,
                        ServiceFee: 0m
                    ));
                    continue;
                }

                var inClinicDiagItems = new List<LabOrderItem>();
                var outsideDiagItems = new List<LabOrderItem>();

                foreach (var it in lo.Items)
                {
                    bool hasMatchingInvoiceLine = HasUnclaimedInvoiceUnit(li =>
                        (!string.IsNullOrWhiteSpace(it.TestCode) && string.Equals(li.ItemCode, it.TestCode, StringComparison.OrdinalIgnoreCase)) ||
                        li.Description.Contains(it.TestName, StringComparison.OrdinalIgnoreCase) ||
                        it.TestName.Contains(li.Description, StringComparison.OrdinalIgnoreCase));

                    bool explicitlyOutside = it.IsDoneOutsideFacility ||
                                             !string.IsNullOrWhiteSpace(it.ExternalFacilityName) ||
                                             orderLevelOutside ||
                                             orderMarkedOutside;

                    bool isInClinicItem = !explicitlyOutside && (
                        orderMarkedInClinic ||
                        it.DiagnosticFee.HasValue ||
                        hasMatchingInvoiceLine ||
                        it.Status == LabOrderStatus.Completed ||
                        !string.IsNullOrWhiteSpace(it.ResultRemarks) ||
                        it.PerformedDate.HasValue ||
                        LookupCatalogPrice(it.TestCode, it.TestName, "Diagnostic") > 0m);

                    if (isInClinicItem)
                        inClinicDiagItems.Add(it);
                    else
                        outsideDiagItems.Add(it);
                }

                foreach (var diagItem in inClinicDiagItems)
                {
                    decimal diagFee = TryClaimInvoiceUnit(li =>
                        (!string.IsNullOrWhiteSpace(diagItem.TestCode) && string.Equals(li.ItemCode, diagItem.TestCode, StringComparison.OrdinalIgnoreCase)) ||
                        li.Description.Contains(diagItem.TestName, StringComparison.OrdinalIgnoreCase) ||
                        diagItem.TestName.Contains(li.Description, StringComparison.OrdinalIgnoreCase))
                        ?? (diagItem.DiagnosticFee is > 0 ? diagItem.DiagnosticFee.Value : LookupCatalogPrice(diagItem.TestCode, diagItem.TestName, "Diagnostic"));

                    var diagParts = new List<string> { diagItem.TestName };
                    if (!string.IsNullOrWhiteSpace(diagItem.Category))
                        diagParts.Add($"({diagItem.Category})");
                    if (!string.IsNullOrWhiteSpace(diagItem.Instructions))
                        diagParts.Add(diagItem.Instructions);
                    if (!string.IsNullOrWhiteSpace(diagItem.ResultRemarks))
                        diagParts.Add($"Result: {diagItem.ResultRemarks}");

                    diagnosticGroupsAndTestsCount++;
                    serviceRows.Add(new CensusServiceRowDto(
                        SubRowIndex: subRowIdx++,
                        ServiceName: "In-Clinic Diagnostic",
                        ServiceTime: lo.OrderDate,
                        ReferenceNumber: lo.OrderNumber,
                        AttendingDoctor: loDoctor,
                        AttendingNurse: string.Empty,
                        ChiefComplaint: string.Empty,
                        NurseAssessment: string.Empty,
                        VitalsSnapshot: string.Empty,
                        DoctorDiagnosis: string.Empty,
                        ClinicalAssessment: string.Empty,
                        RosCategory: string.Empty,
                        SystemsReviewed: string.Empty,
                        ServiceDetails: string.Join(" • ", diagParts),
                        Acuity: q.Priority.ToString(),
                        Disposition: diagItem.Status.ToString(),
                        ServiceItemName: diagItem.TestName,
                        ServiceFee: diagFee
                    ));
                }

                foreach (var outItem in outsideDiagItems)
                {
                    var outsideTarget = !string.IsNullOrWhiteSpace(outItem.ExternalFacilityName)
                        ? outItem.ExternalFacilityName
                        : loTargetLab;
                    var outParts = new List<string> { outItem.TestName };
                    if (!string.IsNullOrWhiteSpace(outItem.Category))
                        outParts.Add($"({outItem.Category})");
                    if (!string.IsNullOrWhiteSpace(outItem.Instructions))
                        outParts.Add(outItem.Instructions);
                    if (!string.IsNullOrWhiteSpace(outsideTarget))
                        outParts.Add(outsideTarget);

                    diagnosticGroupsAndTestsCount++;
                    serviceRows.Add(new CensusServiceRowDto(
                        SubRowIndex: subRowIdx++,
                        ServiceName: "Diagnostic Order (Outside)",
                        ServiceTime: lo.OrderDate,
                        ReferenceNumber: lo.OrderNumber,
                        AttendingDoctor: loDoctor,
                        AttendingNurse: string.Empty,
                        ChiefComplaint: string.Empty,
                        NurseAssessment: string.Empty,
                        VitalsSnapshot: string.Empty,
                        DoctorDiagnosis: string.Empty,
                        ClinicalAssessment: string.Empty,
                        RosCategory: string.Empty,
                        SystemsReviewed: string.Empty,
                        ServiceDetails: string.Join(" • ", outParts),
                        Acuity: q.Priority.ToString(),
                        Disposition: lo.Stage.ToString(),
                        ServiceItemName: outItem.TestName,
                        ServiceFee: 0m
                    ));
                }
            }

            // 7. Emit any remaining unclaimed InvoiceLineItems (e.g. historical billed In-Clinic Diagnostics or standalone billed services)
            for (int idx = 0; idx < claimableLines.Count; idx++)
            {
                if (remainingQty[idx] <= 0) continue;
                var entry = claimableLines[idx];
                var li = entry.Line;

                if (li.Category.Equals("Diagnostic", StringComparison.OrdinalIgnoreCase))
                {
                    var cleanDiagName = li.Description.StartsWith("Diagnostic:", StringComparison.OrdinalIgnoreCase)
                        ? li.Description["Diagnostic:".Length..].Trim()
                        : li.Description.Trim();

                    for (int u = 0; u < remainingQty[idx]; u++)
                    {
                        diagnosticGroupsAndTestsCount++;
                        serviceRows.Add(new CensusServiceRowDto(
                            SubRowIndex: subRowIdx++,
                            ServiceName: "In-Clinic Diagnostic",
                            ServiceTime: entry.InvoiceDate,
                            ReferenceNumber: entry.InvoiceNumber,
                            AttendingDoctor: li.DoctorName ?? (attendingDoc ?? string.Empty),
                            AttendingNurse: string.Empty,
                            ChiefComplaint: string.Empty,
                            NurseAssessment: string.Empty,
                            VitalsSnapshot: string.Empty,
                            DoctorDiagnosis: string.Empty,
                            ClinicalAssessment: string.Empty,
                            RosCategory: string.Empty,
                            SystemsReviewed: string.Empty,
                            ServiceDetails: cleanDiagName,
                            Acuity: q.Priority.ToString(),
                            Disposition: "Completed",
                            ServiceItemName: cleanDiagName,
                            ServiceFee: entry.UnitPrice
                        ));
                    }
                    remainingQty[idx] = 0;
                }
                else
                {
                    var mappedSvcName = li.Category.Equals("Procedure", StringComparison.OrdinalIgnoreCase) || li.Category.Equals("Dental", StringComparison.OrdinalIgnoreCase)
                        ? "In-Clinic Procedure"
                        : (li.Description.Contains("Medical Certificate", StringComparison.OrdinalIgnoreCase) ? "Medical Certificate" : li.Category);
                    decimal lineRemainingFee = Math.Round(entry.UnitPrice * remainingQty[idx], 2);
                    remainingQty[idx] = 0;

                    serviceRows.Add(new CensusServiceRowDto(
                        SubRowIndex: subRowIdx++,
                        ServiceName: mappedSvcName,
                        ServiceTime: entry.InvoiceDate,
                        ReferenceNumber: entry.InvoiceNumber,
                        AttendingDoctor: li.DoctorName ?? string.Empty,
                        AttendingNurse: string.Empty,
                        ChiefComplaint: string.Empty,
                        NurseAssessment: string.Empty,
                        VitalsSnapshot: string.Empty,
                        DoctorDiagnosis: string.Empty,
                        ClinicalAssessment: string.Empty,
                        RosCategory: string.Empty,
                        SystemsReviewed: string.Empty,
                        ServiceDetails: li.Description,
                        Acuity: q.Priority.ToString(),
                        Disposition: "Billed",
                        ServiceItemName: li.Description,
                        ServiceFee: lineRemainingFee
                    ));
                }
            }

            decimal totalServiceFees = vitalsFee + consultFee + serviceRows.Sum(r => r.ServiceFee);
            int effectiveLabCount = Math.Max(visitLabOrders.Count, diagnosticGroupsAndTestsCount);

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
                VisitType: Enum.IsDefined(q.VisitType) ? q.VisitType.ToString() : string.Empty,
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
                LabRequisitionsCount: effectiveLabCount,
                ServiceRows: serviceRows,
                TotalServiceFees: totalServiceFees,
                ConsultationFee: consultFee,
                VitalsFee: vitalsFee
            ));
        }

        // 6. Aggregate Telemetry Summaries
        int totalCensus = items.Count;
        int newPatients = items.Count(i => i.IsNewPatient);
        int returningPatients = totalCensus - newPatients;
        int consultationCount = items.Count(i => VisitTypeExtensions.IsPhysicianConsultationString(i.VisitType));
        int standaloneProcedures = items.Count(i => i.ServicesAvailed != null && i.ServicesAvailed.Contains("In-Clinic Procedure") && !VisitTypeExtensions.IsPhysicianConsultationString(i.VisitType));
        int diagnosticsOrLab = items.Count(i => i.LabRequisitionsCount > 0);
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
        int vitalsCheckVisits = items.Count(i => i.VisitType == nameof(VisitType.PreventiveHealthAssessment));
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

        // 11. Aggregate Full-Period Itemized Procedures & Diagnostics (unaffected by table pagination)
        var procCountMap = new Dictionary<string, int>(StringComparer.OrdinalIgnoreCase);
        var inClinicDiagMap = new Dictionary<string, int>(StringComparer.OrdinalIgnoreCase);
        var outsideDiagMap = new Dictionary<string, int>(StringComparer.OrdinalIgnoreCase);

        foreach (var visitItem in items)
        {
            if (visitItem.ServiceRows == null) continue;
            foreach (var sr in visitItem.ServiceRows)
            {
                if (sr.ServiceName.Equals("In-Clinic Procedure", StringComparison.OrdinalIgnoreCase))
                {
                    var label = (sr.ServiceItemName ?? sr.ServiceDetails?.Split('•')[0] ?? string.Empty).Trim();
                    if (!string.IsNullOrWhiteSpace(label))
                        procCountMap[label] = procCountMap.GetValueOrDefault(label) + 1;
                }
                else if (sr.ServiceName.Equals("In-Clinic Diagnostic", StringComparison.OrdinalIgnoreCase))
                {
                    var label = (sr.ServiceItemName ?? sr.ServiceDetails?.Split('•')[0] ?? string.Empty).Trim();
                    if (!string.IsNullOrWhiteSpace(label))
                        inClinicDiagMap[label] = inClinicDiagMap.GetValueOrDefault(label) + 1;
                }
                else if (sr.ServiceName.Equals("Diagnostic Order (Outside)", StringComparison.OrdinalIgnoreCase) ||
                         sr.ServiceName.Equals("Laboratory Requisition", StringComparison.OrdinalIgnoreCase))
                {
                    var label = (sr.ServiceItemName ?? sr.ReferenceNumber ?? "Diagnostic Requisition").Trim();
                    if (!string.IsNullOrWhiteSpace(label))
                        outsideDiagMap[label] = outsideDiagMap.GetValueOrDefault(label) + 1;
                }
            }
        }

        var itemizedProcedures = procCountMap
            .OrderByDescending(kv => kv.Value)
            .ThenBy(kv => kv.Key, StringComparer.OrdinalIgnoreCase)
            .Select(kv => new CensusServiceItemBreakdownDto(kv.Key, kv.Value))
            .ToList();

        var itemizedInClinicDiagnostics = inClinicDiagMap
            .OrderByDescending(kv => kv.Value)
            .ThenBy(kv => kv.Key, StringComparer.OrdinalIgnoreCase)
            .Select(kv => new CensusServiceItemBreakdownDto(kv.Key, kv.Value))
            .ToList();

        var itemizedOutsideDiagnostics = outsideDiagMap
            .OrderByDescending(kv => kv.Value)
            .ThenBy(kv => kv.Key, StringComparer.OrdinalIgnoreCase)
            .Select(kv => new CensusServiceItemBreakdownDto(kv.Key, kv.Value))
            .ToList();

        var fullPeriodReport = new ClinicCensusReportDto(
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
            RosBreakdown: rosBreakdown,
            ItemizedProcedures: itemizedProcedures,
            ItemizedInClinicDiagnostics: itemizedInClinicDiagnostics,
            ItemizedOutsideDiagnostics: itemizedOutsideDiagnostics
        );

        var serviceBreakdown = ClinicCensusBreakdownResolver.ResolveServiceBreakdown(fullPeriodReport);

        // 12. Server-Side Census Register Filtering & Pagination
        IEnumerable<CensusItemDto> registerQuery = items;

        if (!string.IsNullOrWhiteSpace(request.Acuity) &&
            !request.Acuity.Equals("ALL", StringComparison.OrdinalIgnoreCase))
        {
            var acuityFilter = request.Acuity.Trim();
            registerQuery = registerQuery.Where(i =>
                i.Acuity.Equals(acuityFilter, StringComparison.OrdinalIgnoreCase));
        }

        if (!string.IsNullOrWhiteSpace(request.TableVisitType) &&
            !request.TableVisitType.Equals("ALL", StringComparison.OrdinalIgnoreCase))
        {
            var vtFilter = request.TableVisitType.Trim();
            registerQuery = registerQuery.Where(i =>
                i.VisitType.Equals(vtFilter, StringComparison.OrdinalIgnoreCase));
        }

        if (!string.IsNullOrWhiteSpace(request.Search))
        {
            var term = request.Search.Trim();
            bool ContainsTerm(string? value) =>
                !string.IsNullOrWhiteSpace(value) &&
                value.Contains(term, StringComparison.OrdinalIgnoreCase);

            registerQuery = registerQuery.Where(i =>
                ContainsTerm(i.PatientName) ||
                ContainsTerm(i.PatientCode) ||
                ContainsTerm(i.QueueNumber) ||
                ContainsTerm(i.ServicesAvailedSummary) ||
                ContainsTerm(i.RosCategory) ||
                ContainsTerm(i.DispensedMedicinesSummary) ||
                ContainsTerm(i.DoctorDiagnosis) ||
                ContainsTerm(i.ClinicalAssessment) ||
                ContainsTerm(i.NurseAssessment) ||
                ContainsTerm(i.AttendingDoctor) ||
                ContainsTerm(i.AttendingNurse) ||
                ContainsTerm(i.ChiefComplaint) ||
                ContainsTerm(i.SystemsReviewed) ||
                ContainsTerm(i.ProceduresPerformed) ||
                ContainsTerm(i.CustomFieldsSummary) ||
                ContainsTerm(i.Classification) ||
                (i.ServiceRows != null && i.ServiceRows.Any(sr =>
                    ContainsTerm(sr.ServiceName) ||
                    ContainsTerm(sr.ServiceItemName) ||
                    ContainsTerm(sr.ReferenceNumber) ||
                    ContainsTerm(sr.AttendingDoctor) ||
                    ContainsTerm(sr.AttendingNurse) ||
                    ContainsTerm(sr.ServiceDetails) ||
                    ContainsTerm(sr.Disposition))));
        }

        var filteredRegisterList = registerQuery.ToList();
        int totalRegisterItems = filteredRegisterList.Count;

        bool isPaginatedRequest = request.Page.HasValue || request.PageSize.HasValue;
        int effectivePageSize = isPaginatedRequest
            ? Math.Clamp(request.PageSize ?? 20, 1, 200)
            : totalRegisterItems;
        int totalPages = isPaginatedRequest && effectivePageSize > 0
            ? Math.Max(1, (int)Math.Ceiling(totalRegisterItems / (double)effectivePageSize))
            : 1;
        int effectivePage = isPaginatedRequest
            ? Math.Clamp(request.Page ?? 1, 1, totalPages)
            : 1;

        var resultItems = isPaginatedRequest
            ? filteredRegisterList
                .Skip((effectivePage - 1) * effectivePageSize)
                .Take(effectivePageSize)
                .ToList()
            : filteredRegisterList;

        return fullPeriodReport with
        {
            Items = resultItems,
            ServiceBreakdown = serviceBreakdown,
            PageNumber = effectivePage,
            PageSize = effectivePageSize,
            TotalItems = totalRegisterItems,
            TotalPages = totalPages,
            HasPreviousPage = isPaginatedRequest && effectivePage > 1,
            HasNextPage = isPaginatedRequest && effectivePage < totalPages
        };
    }
}
