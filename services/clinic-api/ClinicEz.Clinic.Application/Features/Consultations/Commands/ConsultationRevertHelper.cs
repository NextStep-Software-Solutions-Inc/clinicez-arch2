using System;
using System.Collections.Generic;
using System.Linq;
using System.Threading;
using System.Threading.Tasks;
using ClinicEz.Clinic.Domain.Common;
using ClinicEz.Clinic.Domain.Entities;
using ClinicEz.Clinic.Domain.Enums;
using ClinicEz.Clinic.Domain.Interfaces;
using Microsoft.EntityFrameworkCore;

namespace ClinicEz.Clinic.Application.Features.Consultations.Commands;

public static class ConsultationRevertHelper
{
    public static async Task<int> PurgeUnsignedConsultationArtifactsAsync(
        Guid clinicId,
        Guid? consultationId = null,
        Guid? queueItemId = null,
        IRepository<ConsultationEncounter>? consultationRepo = null,
        IRepository<EncounterDiagnosis>? diagnosisRepo = null,
        IRepository<PrescriptionItem>? prescriptionRepo = null,
        IRepository<EncounterReviewOfSystemsItem>? rosRepo = null,
        IRepository<PatientPhysicalExam>? physicalExamRepo = null,
        IRepository<PatientPhysicalExamFinding>? physicalExamFindingRepo = null,
        IRepository<ClinicDispensingLog>? dispensingLogRepo = null,
        IRepository<MedicalCertificate>? medCertRepo = null,
        IRepository<ReferralLetter>? referralRepo = null,
        IRepository<LabOrder>? labOrderRepo = null,
        IRepository<LabOrderItem>? labOrderItemRepo = null,
        IRepository<UploadGrant>? uploadGrantRepo = null,
        IRepository<DentalToothRecord>? dentalRepo = null,
        IRepository<Procedure>? procedureRepo = null,
        IRepository<Invoice>? invoiceRepo = null,
        IRepository<InvoiceLineItem>? invoiceLineItemRepo = null,
        IUnitOfWork? unitOfWork = null,
        IRepository<EncounterAdolescentAssessment>? adolescentRepo = null,
        IRepository<EncounterHeadsssDomainAssessment>? headsssRepo = null,
        IRepository<EncounterObGyneExam>? obGyneRepo = null,
        IRepository<EncounterPediatricMilestone>? pediatricMilestoneRepo = null,
        IRepository<EncounterPediatricDangerSign>? pediatricDangerSignRepo = null,
        IRepository<PatientBpMonitoringLog>? bpLogRepo = null,
        IRepository<PatientBpMonitoringDay>? bpDayRepo = null,
        IRepository<YakapSubmission>? yakapRepo = null,
        IRepository<YakapSubmissionError>? yakapErrorRepo = null,
        IRepository<PatientVitals>? vitalsRepo = null,
        IRepository<TeleconsultRecordingSession>? recordingSessionRepo = null,
        IRepository<LabObservation>? labObservationRepo = null,
        IRepository<LabResult>? labResultRepo = null,
        IRepository<PatientMedicalHistory>? medicalHistoryRepo = null,
        IRepository<NcdRiskAssessment>? ncdRiskRepo = null,
        IRepository<PatientImmunization>? immunizationRepo = null,
        IRepository<RecordAttachment>? attachmentRepo = null,
        CancellationToken ct = default)
    {
        if (!consultationId.HasValue && !queueItemId.HasValue)
        {
            return 0;
        }

        var repoProvider = unitOfWork as IRepositoryProvider;
        IRepository<T>? Resolve<T>(IRepository<T>? explicitRepo) where T : BaseEntity =>
            explicitRepo ?? repoProvider?.GetRepository<T>();

        consultationRepo = Resolve(consultationRepo);
        diagnosisRepo = Resolve(diagnosisRepo);
        prescriptionRepo = Resolve(prescriptionRepo);
        rosRepo = Resolve(rosRepo);
        physicalExamRepo = Resolve(physicalExamRepo);
        physicalExamFindingRepo = Resolve(physicalExamFindingRepo);
        dispensingLogRepo = Resolve(dispensingLogRepo);
        medCertRepo = Resolve(medCertRepo);
        referralRepo = Resolve(referralRepo);
        labOrderRepo = Resolve(labOrderRepo);
        labOrderItemRepo = Resolve(labOrderItemRepo);
        uploadGrantRepo = Resolve(uploadGrantRepo);
        dentalRepo = Resolve(dentalRepo);
        procedureRepo = Resolve(procedureRepo);
        invoiceRepo = Resolve(invoiceRepo);
        invoiceLineItemRepo = Resolve(invoiceLineItemRepo);
        adolescentRepo = Resolve(adolescentRepo);
        headsssRepo = Resolve(headsssRepo);
        obGyneRepo = Resolve(obGyneRepo);
        pediatricMilestoneRepo = Resolve(pediatricMilestoneRepo);
        pediatricDangerSignRepo = Resolve(pediatricDangerSignRepo);
        bpLogRepo = Resolve(bpLogRepo);
        bpDayRepo = Resolve(bpDayRepo);
        yakapRepo = Resolve(yakapRepo);
        yakapErrorRepo = Resolve(yakapErrorRepo);
        vitalsRepo = Resolve(vitalsRepo);
        recordingSessionRepo = Resolve(recordingSessionRepo);
        labObservationRepo = Resolve(labObservationRepo);
        labResultRepo = Resolve(labResultRepo);
        medicalHistoryRepo = Resolve(medicalHistoryRepo);
        ncdRiskRepo = Resolve(ncdRiskRepo);
        immunizationRepo = Resolve(immunizationRepo);
        attachmentRepo = Resolve(attachmentRepo);

        int removedCount = 0;
        var removedIds = new HashSet<Guid>();
        void HardRemove<T>(IRepository<T> repo, T entity) where T : BaseEntity
        {
            if (removedIds.Add(entity.Id))
            {
                repo.Remove(entity, hardDelete: true);
                removedCount++;
            }
        }

        var unsignedEncounterIds = new HashSet<Guid>();
        var unsignedEncounters = new List<ConsultationEncounter>();

        if (consultationRepo != null)
        {
            var query = consultationRepo
                .Query(c => c.ClinicId == clinicId && !c.IsSigned)
                .IgnoreQueryFilters()
                .Include(c => c.Diagnoses)
                .Include(c => c.Prescriptions)
                .Include(c => c.ReviewOfSystemsItems)
                .Include(c => c.PhysicalExams)
                    .ThenInclude(pe => pe.Findings)
                .Where(c =>
                    (consultationId.HasValue && c.Id == consultationId.Value) ||
                    (queueItemId.HasValue && c.QueueItemId == queueItemId.Value));

            unsignedEncounters = await query.ToListAsync(ct);
            foreach (var enc in unsignedEncounters)
            {
                unsignedEncounterIds.Add(enc.Id);
                if (!queueItemId.HasValue && enc.QueueItemId.HasValue)
                {
                    queueItemId = enc.QueueItemId;
                }
            }
        }
        else if (consultationId.HasValue)
        {
            unsignedEncounterIds.Add(consultationId.Value);
        }

        bool hasSignedConsultationOnQueue = false;
        if (queueItemId.HasValue && consultationRepo != null)
        {
            var qId = queueItemId.Value;
            hasSignedConsultationOnQueue = await consultationRepo
                .Query(c => c.ClinicId == clinicId && c.QueueItemId == qId && c.IsSigned && !c.IsDeleted)
                .AnyAsync(ct);
        }

        // 0. Unlink longitudinal / triage / medico-legal records that reference unsigned ConsultationEncounters.
        //    CRITICAL: Triage PatientVitals MUST NEVER be deleted when reverting an unsigned consultation,
        //    but ConsultationEncounterId MUST be unlinked to null so PostgreSQL's NO ACTION FK does not block DELETE.
        if (unsignedEncounterIds.Count > 0)
        {
            foreach (var enc in unsignedEncounters)
            {
                enc.Vitals.Clear();
            }

            if (vitalsRepo != null)
            {
                var linkedVitals = await vitalsRepo
                    .Query(v => v.ClinicId == clinicId &&
                                v.ConsultationEncounterId.HasValue &&
                                unsignedEncounterIds.Contains(v.ConsultationEncounterId.Value))
                    .IgnoreQueryFilters()
                    .ToListAsync(ct);

                foreach (var v in linkedVitals)
                {
                    v.ConsultationEncounterId = null;
                    v.ConsultationEncounter = null;
                }
            }

            if (recordingSessionRepo != null)
            {
                var linkedSessions = await recordingSessionRepo
                    .Query(s => s.ClinicId == clinicId &&
                                s.ConsultationId.HasValue &&
                                unsignedEncounterIds.Contains(s.ConsultationId.Value))
                    .IgnoreQueryFilters()
                    .ToListAsync(ct);

                foreach (var session in linkedSessions)
                {
                    session.ConsultationId = null;
                    session.Consultation = null;
                }
            }

            if (medicalHistoryRepo != null)
            {
                var linkedHistory = await medicalHistoryRepo
                    .Query(m => m.ClinicId == clinicId &&
                                m.ConsultationEncounterId.HasValue &&
                                unsignedEncounterIds.Contains(m.ConsultationEncounterId.Value))
                    .IgnoreQueryFilters()
                    .ToListAsync(ct);

                foreach (var hist in linkedHistory)
                {
                    hist.ConsultationEncounterId = null;
                    hist.ConsultationEncounter = null;
                }
            }

            if (ncdRiskRepo != null)
            {
                var linkedNcd = await ncdRiskRepo
                    .Query(n => n.ClinicId == clinicId &&
                                n.ConsultationEncounterId.HasValue &&
                                unsignedEncounterIds.Contains(n.ConsultationEncounterId.Value))
                    .IgnoreQueryFilters()
                    .ToListAsync(ct);

                foreach (var ncd in linkedNcd)
                {
                    ncd.ConsultationEncounterId = null;
                }
            }

            if (immunizationRepo != null)
            {
                var linkedImmunizations = await immunizationRepo
                    .Query(im => im.ClinicId == clinicId &&
                                 im.ConsultationEncounterId.HasValue &&
                                 unsignedEncounterIds.Contains(im.ConsultationEncounterId.Value))
                    .IgnoreQueryFilters()
                    .ToListAsync(ct);

                foreach (var im in linkedImmunizations)
                {
                    im.ConsultationEncounterId = null;
                }
            }

            if (attachmentRepo != null)
            {
                var linkedAttachments = await attachmentRepo
                    .Query(ra => ra.ClinicId == clinicId &&
                                 ra.ConsultationId.HasValue &&
                                 unsignedEncounterIds.Contains(ra.ConsultationId.Value))
                    .IgnoreQueryFilters()
                    .ToListAsync(ct);

                foreach (var ra in linkedAttachments)
                {
                    ra.ConsultationId = null;
                }
            }
        }

        // 1. Purge Restrict / encounter-owned clinical assessment dependents of unsigned ConsultationEncounters
        //    (always child-before-parent, using IgnoreQueryFilters so soft-deleted physical rows never trigger 23503 FK errors).
        if (unsignedEncounterIds.Count > 0)
        {
            // 1a. EncounterPediatricDangerSign -> EncounterPediatricMilestone [Restrict]
            if (pediatricMilestoneRepo != null)
            {
                var milestones = await pediatricMilestoneRepo
                    .Query(m => m.ClinicId == clinicId && unsignedEncounterIds.Contains(m.ConsultationEncounterId))
                    .IgnoreQueryFilters()
                    .ToListAsync(ct);

                if (milestones.Count > 0)
                {
                    var milestoneIds = milestones.Select(m => m.Id).ToHashSet();
                    if (pediatricDangerSignRepo != null)
                    {
                        var dangerSigns = await pediatricDangerSignRepo
                            .Query(ds => milestoneIds.Contains(ds.PediatricMilestoneId))
                            .IgnoreQueryFilters()
                            .ToListAsync(ct);

                        foreach (var ds in dangerSigns)
                        {
                            HardRemove(pediatricDangerSignRepo, ds);
                        }
                    }

                    foreach (var m in milestones)
                    {
                        HardRemove(pediatricMilestoneRepo, m);
                    }
                }
            }

            // 1b. EncounterAdolescentAssessment [Restrict]
            if (adolescentRepo != null)
            {
                var adolescentItems = await adolescentRepo
                    .Query(a => a.ClinicId == clinicId && unsignedEncounterIds.Contains(a.ConsultationEncounterId))
                    .IgnoreQueryFilters()
                    .ToListAsync(ct);

                foreach (var a in adolescentItems)
                {
                    HardRemove(adolescentRepo, a);
                }
            }

            // 1c. EncounterHeadsssDomainAssessment [Restrict]
            if (headsssRepo != null)
            {
                var headsssItems = await headsssRepo
                    .Query(h => h.ClinicId == clinicId && unsignedEncounterIds.Contains(h.ConsultationEncounterId))
                    .IgnoreQueryFilters()
                    .ToListAsync(ct);

                foreach (var h in headsssItems)
                {
                    HardRemove(headsssRepo, h);
                }
            }

            // 1d. EncounterObGyneExam [Restrict]
            if (obGyneRepo != null)
            {
                var obGyneItems = await obGyneRepo
                    .Query(o => o.ClinicId == clinicId && unsignedEncounterIds.Contains(o.ConsultationEncounterId))
                    .IgnoreQueryFilters()
                    .ToListAsync(ct);

                foreach (var o in obGyneItems)
                {
                    HardRemove(obGyneRepo, o);
                }
            }

            // 1e. PatientBpMonitoringDay -> PatientBpMonitoringLog [Restrict]
            if (bpLogRepo != null)
            {
                var bpLogs = await bpLogRepo
                    .Query(b => b.ClinicId == clinicId &&
                                b.ConsultationEncounterId.HasValue &&
                                unsignedEncounterIds.Contains(b.ConsultationEncounterId.Value))
                    .IgnoreQueryFilters()
                    .ToListAsync(ct);

                if (bpLogs.Count > 0)
                {
                    var bpLogIds = bpLogs.Select(b => b.Id).ToHashSet();
                    if (bpDayRepo != null)
                    {
                        var bpDays = await bpDayRepo
                            .Query(day => bpLogIds.Contains(day.BpMonitoringLogId))
                            .IgnoreQueryFilters()
                            .ToListAsync(ct);

                        foreach (var day in bpDays)
                        {
                            HardRemove(bpDayRepo, day);
                        }
                    }

                    foreach (var b in bpLogs)
                    {
                        HardRemove(bpLogRepo, b);
                    }
                }
            }

            // 1f. YakapSubmissionError -> YakapSubmission [Restrict]
            if (yakapRepo != null)
            {
                var yakapSubmissions = await yakapRepo
                    .Query(y => y.ClinicId == clinicId &&
                                y.ConsultationEncounterId.HasValue &&
                                unsignedEncounterIds.Contains(y.ConsultationEncounterId.Value))
                    .IgnoreQueryFilters()
                    .ToListAsync(ct);

                if (yakapSubmissions.Count > 0)
                {
                    var draftSubmissions = new List<YakapSubmission>();
                    foreach (var y in yakapSubmissions)
                    {
                        if (y.SubmittedAtUtc.HasValue ||
                            !string.IsNullOrWhiteSpace(y.YesReferenceNo) ||
                            !string.IsNullOrWhiteSpace(y.UploadTransactionNo))
                        {
                            // Preserve external submission audit record while severing the Restrict FK
                            y.ConsultationEncounterId = null;
                            y.ConsultationEncounter = null;
                        }
                        else
                        {
                            draftSubmissions.Add(y);
                        }
                    }

                    if (draftSubmissions.Count > 0)
                    {
                        var draftYakapIds = draftSubmissions.Select(y => y.Id).ToHashSet();
                        if (yakapErrorRepo != null)
                        {
                            var yakapErrors = await yakapErrorRepo
                                .Query(err => draftYakapIds.Contains(err.YakapSubmissionId))
                                .IgnoreQueryFilters()
                                .ToListAsync(ct);

                            foreach (var err in yakapErrors)
                            {
                                HardRemove(yakapErrorRepo, err);
                            }
                        }

                        foreach (var y in draftSubmissions)
                        {
                            HardRemove(yakapRepo, y);
                        }
                    }
                }
            }
        }

        // 2. Purge consultation-sourced ClinicDispensingLogs BEFORE PrescriptionItems so PrescriptionItemId FKs are cleared first
        if (dispensingLogRepo != null)
        {
            var dispLogs = await dispensingLogRepo
                .Query(d => d.ClinicId == clinicId &&
                            d.Source == ClinicDispenseSource.DoctorConsultation &&
                            ((d.ConsultationEncounterId.HasValue && unsignedEncounterIds.Contains(d.ConsultationEncounterId.Value)) ||
                             (!d.IsConsultationValidated && queueItemId.HasValue && d.QueueItemId == queueItemId.Value)))
                .IgnoreQueryFilters()
                .ToListAsync(ct);

            foreach (var log in dispLogs)
            {
                HardRemove(dispensingLogRepo, log);
            }

            if (unsignedEncounterIds.Count > 0)
            {
                var remainingLinkedLogs = await dispensingLogRepo
                    .Query(d => d.ClinicId == clinicId &&
                                d.Source != ClinicDispenseSource.DoctorConsultation &&
                                d.ConsultationEncounterId.HasValue &&
                                unsignedEncounterIds.Contains(d.ConsultationEncounterId.Value))
                    .IgnoreQueryFilters()
                    .ToListAsync(ct);

                foreach (var log in remainingLinkedLogs)
                {
                    log.ConsultationEncounterId = null;
                    log.ConsultationEncounter = null;
                    log.PrescriptionItemId = null;
                    log.PrescriptionItem = null;
                }
            }
        }

        // 3. Purge Diagnoses, Prescriptions, ROS items, PhysicalExams (+ Findings), Dental records, and Pending Procedures
        foreach (var enc in unsignedEncounters)
        {
            if (diagnosisRepo != null)
            {
                foreach (var d in enc.Diagnoses.ToList())
                {
                    HardRemove(diagnosisRepo, d);
                }
            }

            if (prescriptionRepo != null)
            {
                foreach (var rx in enc.Prescriptions.ToList())
                {
                    HardRemove(prescriptionRepo, rx);
                }
            }

            if (rosRepo != null)
            {
                foreach (var ros in enc.ReviewOfSystemsItems.ToList())
                {
                    HardRemove(rosRepo, ros);
                }
            }

            if (physicalExamRepo != null)
            {
                foreach (var pe in enc.PhysicalExams.ToList())
                {
                    if (physicalExamFindingRepo != null && pe.Findings != null)
                    {
                        foreach (var f in pe.Findings.ToList())
                        {
                            HardRemove(physicalExamFindingRepo, f);
                        }
                    }
                    HardRemove(physicalExamRepo, pe);
                }
            }
        }

        if (unsignedEncounterIds.Count > 0)
        {
            if (diagnosisRepo != null)
            {
                var extraDiags = await diagnosisRepo
                    .Query(d => unsignedEncounterIds.Contains(d.ConsultationEncounterId))
                    .IgnoreQueryFilters()
                    .ToListAsync(ct);
                foreach (var d in extraDiags)
                {
                    HardRemove(diagnosisRepo, d);
                }
            }

            if (prescriptionRepo != null)
            {
                var extraRx = await prescriptionRepo
                    .Query(p => unsignedEncounterIds.Contains(p.ConsultationEncounterId))
                    .IgnoreQueryFilters()
                    .ToListAsync(ct);

                if (extraRx.Count > 0 && dispensingLogRepo != null)
                {
                    var rxIds = extraRx.Select(p => p.Id).ToHashSet();
                    var logsPointingToRx = await dispensingLogRepo
                        .Query(d => d.PrescriptionItemId.HasValue && rxIds.Contains(d.PrescriptionItemId.Value))
                        .IgnoreQueryFilters()
                        .ToListAsync(ct);
                    foreach (var log in logsPointingToRx)
                    {
                        if (!removedIds.Contains(log.Id))
                        {
                            log.PrescriptionItemId = null;
                            log.PrescriptionItem = null;
                        }
                    }
                }

                foreach (var p in extraRx)
                {
                    HardRemove(prescriptionRepo, p);
                }
            }

            if (rosRepo != null)
            {
                var extraRos = await rosRepo
                    .Query(r => unsignedEncounterIds.Contains(r.ConsultationEncounterId))
                    .IgnoreQueryFilters()
                    .ToListAsync(ct);
                foreach (var r in extraRos)
                {
                    HardRemove(rosRepo, r);
                }
            }

            if (physicalExamRepo != null)
            {
                var extraPes = await physicalExamRepo
                    .Query(pe => pe.ClinicId == clinicId &&
                                 pe.ConsultationEncounterId.HasValue &&
                                 unsignedEncounterIds.Contains(pe.ConsultationEncounterId.Value))
                    .IgnoreQueryFilters()
                    .ToListAsync(ct);

                if (extraPes.Count > 0)
                {
                    var peIds = extraPes.Select(pe => pe.Id).ToHashSet();
                    if (physicalExamFindingRepo != null)
                    {
                        var extraFindings = await physicalExamFindingRepo
                            .Query(f => peIds.Contains(f.PhysicalExamId))
                            .IgnoreQueryFilters()
                            .ToListAsync(ct);
                        foreach (var f in extraFindings)
                        {
                            HardRemove(physicalExamFindingRepo, f);
                        }
                    }

                    foreach (var pe in extraPes)
                    {
                        HardRemove(physicalExamRepo, pe);
                    }
                }
            }

            if (dentalRepo != null)
            {
                var dentalRecords = await dentalRepo
                    .Query(t => t.ClinicId == clinicId && t.ConsultationId.HasValue && unsignedEncounterIds.Contains(t.ConsultationId.Value))
                    .IgnoreQueryFilters()
                    .ToListAsync(ct);

                if (dentalRecords.Count > 0)
                {
                    var deletedDentalIds = dentalRecords.Select(t => t.Id).ToHashSet();
                    var supersededRecords = await dentalRepo
                        .Query(t => t.ClinicId == clinicId &&
                                    !deletedDentalIds.Contains(t.Id) &&
                                    t.SupersededByRecordId.HasValue &&
                                    deletedDentalIds.Contains(t.SupersededByRecordId.Value))
                        .IgnoreQueryFilters()
                        .ToListAsync(ct);

                    foreach (var prev in supersededRecords)
                    {
                        prev.IsCurrent = true;
                        prev.SupersededAt = null;
                        prev.SupersededByRecordId = null;
                        prev.ActiveSurface = prev.Surface;
                        dentalRepo.Update(prev);
                    }

                    foreach (var t in dentalRecords)
                    {
                        HardRemove(dentalRepo, t);
                    }
                }
            }

            if (procedureRepo != null)
            {
                var linkedProcedures = await procedureRepo
                    .Query(p => p.ClinicId == clinicId &&
                                p.ConsultationId.HasValue &&
                                unsignedEncounterIds.Contains(p.ConsultationId.Value))
                    .IgnoreQueryFilters()
                    .ToListAsync(ct);

                foreach (var proc in linkedProcedures)
                {
                    if (proc.Status != ProcedureStatus.Completed)
                    {
                        HardRemove(procedureRepo, proc);
                    }
                    else
                    {
                        proc.ConsultationId = null;
                        procedureRepo.Update(proc);
                    }
                }
            }
        }

        // 4. Purge unsigned MedicalCertificates tied to the unsigned consultation / consultation visit
        if (medCertRepo != null)
        {
            var certs = await medCertRepo
                .Query(m => m.ClinicId == clinicId &&
                            !m.IsSigned &&
                            ((m.ConsultationId.HasValue && unsignedEncounterIds.Contains(m.ConsultationId.Value)) ||
                             (!hasSignedConsultationOnQueue && queueItemId.HasValue && m.QueueItemId == queueItemId.Value)))
                .IgnoreQueryFilters()
                .ToListAsync(ct);

            foreach (var cert in certs)
            {
                HardRemove(medCertRepo, cert);
            }

            if (unsignedEncounterIds.Count > 0)
            {
                var signedLinkedCerts = await medCertRepo
                    .Query(m => m.ClinicId == clinicId &&
                                m.IsSigned &&
                                m.ConsultationId.HasValue &&
                                unsignedEncounterIds.Contains(m.ConsultationId.Value))
                    .IgnoreQueryFilters()
                    .ToListAsync(ct);

                foreach (var cert in signedLinkedCerts)
                {
                    cert.ConsultationId = null;
                    medCertRepo.Update(cert);
                }
            }
        }

        // 5. Purge unsigned ReferralLetters tied to the unsigned consultation / consultation visit
        if (referralRepo != null)
        {
            var referrals = await referralRepo
                .Query(r => r.ClinicId == clinicId &&
                            !r.IsSigned &&
                            ((r.ConsultationId.HasValue && unsignedEncounterIds.Contains(r.ConsultationId.Value)) ||
                             (!hasSignedConsultationOnQueue && queueItemId.HasValue && r.QueueItemId == queueItemId.Value)))
                .IgnoreQueryFilters()
                .ToListAsync(ct);

            foreach (var referral in referrals)
            {
                HardRemove(referralRepo, referral);
            }

            if (unsignedEncounterIds.Count > 0)
            {
                var signedLinkedReferrals = await referralRepo
                    .Query(r => r.ClinicId == clinicId &&
                                r.IsSigned &&
                                r.ConsultationId.HasValue &&
                                unsignedEncounterIds.Contains(r.ConsultationId.Value))
                    .IgnoreQueryFilters()
                    .ToListAsync(ct);

                foreach (var referral in signedLinkedReferrals)
                {
                    referral.ConsultationId = null;
                    referralRepo.Update(referral);
                }
            }
        }

        // 6. Purge unsigned LabOrders (LabObservations -> LabResults -> UploadGrants -> LabOrderItems -> LabOrders)
        if (labOrderRepo != null)
        {
            var labOrders = await labOrderRepo
                .Query(o => o.ClinicId == clinicId &&
                            !o.IsSigned &&
                            ((o.ConsultationId.HasValue && unsignedEncounterIds.Contains(o.ConsultationId.Value)) ||
                             (!hasSignedConsultationOnQueue && queueItemId.HasValue && o.QueueItemId == queueItemId.Value)))
                .IgnoreQueryFilters()
                .Include(o => o.Items)
                .ToListAsync(ct);

            if (labOrders.Count > 0)
            {
                var orderIds = labOrders.Select(o => o.Id).ToHashSet();
                var allOrderItems = new List<LabOrderItem>();
                foreach (var order in labOrders)
                {
                    if (order.Items != null)
                    {
                        allOrderItems.AddRange(order.Items);
                    }
                }

                if (labOrderItemRepo != null)
                {
                    var dbOrderItems = await labOrderItemRepo
                        .Query(i => orderIds.Contains(i.LabOrderId))
                        .IgnoreQueryFilters()
                        .ToListAsync(ct);
                    allOrderItems.AddRange(dbOrderItems);
                }

                var itemIds = allOrderItems.Select(i => i.Id).ToHashSet();

                // LabObservation has NO ACTION FK on LabOrderItemId; MUST be purged before LabOrderItems!
                if (labObservationRepo != null)
                {
                    var observations = await labObservationRepo
                        .Query(obs => orderIds.Contains(obs.LabOrderId) ||
                                      (obs.LabOrderItemId.HasValue && itemIds.Contains(obs.LabOrderItemId.Value)))
                        .IgnoreQueryFilters()
                        .ToListAsync(ct);

                    foreach (var obs in observations)
                    {
                        HardRemove(labObservationRepo, obs);
                    }
                }

                if (labResultRepo != null)
                {
                    var results = await labResultRepo
                        .Query(r => orderIds.Contains(r.LabOrderId))
                        .IgnoreQueryFilters()
                        .ToListAsync(ct);

                    foreach (var res in results)
                    {
                        HardRemove(labResultRepo, res);
                    }
                }

                if (uploadGrantRepo != null)
                {
                    var grants = await uploadGrantRepo
                        .Query(g => orderIds.Contains(g.LabOrderId))
                        .IgnoreQueryFilters()
                        .ToListAsync(ct);

                    foreach (var g in grants)
                    {
                        HardRemove(uploadGrantRepo, g);
                    }
                }

                if (labOrderItemRepo != null)
                {
                    foreach (var item in allOrderItems)
                    {
                        HardRemove(labOrderItemRepo, item);
                    }
                }

                foreach (var order in labOrders)
                {
                    HardRemove(labOrderRepo, order);
                }
            }

            if (unsignedEncounterIds.Count > 0)
            {
                var signedLinkedOrders = await labOrderRepo
                    .Query(o => o.ClinicId == clinicId &&
                                o.IsSigned &&
                                o.ConsultationId.HasValue &&
                                unsignedEncounterIds.Contains(o.ConsultationId.Value))
                    .IgnoreQueryFilters()
                    .ToListAsync(ct);

                foreach (var order in signedLinkedOrders)
                {
                    order.ConsultationId = null;
                    labOrderRepo.Update(order);
                }
            }
        }

        // 7. Purge unpaid Draft consultation Invoices (+ LineItems) tied to the unsigned consultation
        if (invoiceRepo != null && (unsignedEncounterIds.Count > 0 || (!hasSignedConsultationOnQueue && queueItemId.HasValue)))
        {
            var draftInvoices = await invoiceRepo
                .Query(i => i.ClinicId == clinicId &&
                            i.Status == InvoiceStatus.Draft &&
                            i.AmountPaid == 0m &&
                            !i.BillingRequestedAt.HasValue &&
                            ((i.ConsultationId.HasValue && unsignedEncounterIds.Contains(i.ConsultationId.Value)) ||
                             (!hasSignedConsultationOnQueue && queueItemId.HasValue && i.QueueItemId == queueItemId.Value && i.ConsultationId.HasValue)))
                .IgnoreQueryFilters()
                .Include(i => i.LineItems)
                .Include(i => i.Payments)
                .ToListAsync(ct);

            foreach (var inv in draftInvoices)
            {
                if (inv.Payments != null && inv.Payments.Count > 0)
                {
                    inv.ConsultationId = null;
                    invoiceRepo.Update(inv);
                    continue;
                }

                if (invoiceLineItemRepo != null)
                {
                    if (inv.LineItems != null)
                    {
                        foreach (var li in inv.LineItems.ToList())
                        {
                            HardRemove(invoiceLineItemRepo, li);
                        }
                    }

                    var extraLines = await invoiceLineItemRepo
                        .Query(li => li.InvoiceId == inv.Id)
                        .IgnoreQueryFilters()
                        .ToListAsync(ct);
                    foreach (var li in extraLines)
                    {
                        HardRemove(invoiceLineItemRepo, li);
                    }
                }

                HardRemove(invoiceRepo, inv);
            }

            if (unsignedEncounterIds.Count > 0)
            {
                var retainedInvoices = await invoiceRepo
                    .Query(i => i.ClinicId == clinicId &&
                                i.ConsultationId.HasValue &&
                                unsignedEncounterIds.Contains(i.ConsultationId.Value))
                    .IgnoreQueryFilters()
                    .ToListAsync(ct);

                foreach (var inv in retainedInvoices)
                {
                    if (!removedIds.Contains(inv.Id))
                    {
                        inv.ConsultationId = null;
                        invoiceRepo.Update(inv);
                    }
                }
            }
        }

        // 8. Hard-delete the unsigned ConsultationEncounters themselves
        if (consultationRepo != null)
        {
            foreach (var enc in unsignedEncounters)
            {
                enc.AdolescentAssessment = null;
                enc.ObGyneExam = null;
                enc.HeadsssAssessments.Clear();
                enc.PediatricMilestones.Clear();
                enc.BpMonitoringLogs.Clear();
                enc.ReviewOfSystemsItems.Clear();
                enc.Diagnoses.Clear();
                enc.Prescriptions.Clear();
                enc.PhysicalExams.Clear();
                enc.Vitals.Clear();
                HardRemove(consultationRepo, enc);
            }
        }

        return removedCount;
    }
}
