using System;
using System.Collections.Generic;
using System.Linq;
using System.Text.Json;
using System.Threading;
using System.Threading.Tasks;
using ClinicEz.Clinic.Application.Common.Helpers;
using ClinicEz.Clinic.Application.Features.Consultations.Commands;
using ClinicEz.Clinic.Application.Features.Queue.DTOs;
using ClinicEz.Clinic.Domain.Entities;
using ClinicEz.Clinic.Domain.Enums;
using ClinicEz.Clinic.Domain.Interfaces;
using ClinicEz.Shared.Workspace;
using MediatR;
using Microsoft.EntityFrameworkCore;

namespace ClinicEz.Clinic.Application.Features.Queue.Commands;

public sealed record ReconcileEodCommand(
    DateOnly? Date = null,
    string TriggerType = "Manual",
    string? Reason = null
) : IRequest<ReconcileEodResultDto>;

public sealed class ReconcileEodCommandHandler : IRequestHandler<ReconcileEodCommand, ReconcileEodResultDto>
{
    private readonly IRepository<QueueItem> _queueRepository;
    private readonly IRepository<EodReconciliationAudit> _auditRepository;
    private readonly IUnitOfWork _unitOfWork;
    private readonly IClinicContext _clinicContext;
    private readonly IWorkspaceProfileProvider? _workspaceProfiles;
    private readonly IRepository<FacilitySettings>? _settingsRepository;
    private readonly IRepository<ConsultationEncounter>? _consultationRepository;
    private readonly IRepository<EncounterDiagnosis>? _diagnosisRepository;
    private readonly IRepository<PrescriptionItem>? _prescriptionRepository;
    private readonly IRepository<EncounterReviewOfSystemsItem>? _rosRepository;
    private readonly IRepository<PatientPhysicalExam>? _physicalExamRepository;
    private readonly IRepository<PatientPhysicalExamFinding>? _physicalExamFindingRepository;
    private readonly IRepository<ClinicDispensingLog>? _dispensingLogRepository;
    private readonly IRepository<MedicalCertificate>? _medCertRepository;
    private readonly IRepository<ReferralLetter>? _referralRepository;
    private readonly IRepository<LabOrder>? _labOrderRepository;
    private readonly IRepository<LabOrderItem>? _labOrderItemRepository;
    private readonly IRepository<UploadGrant>? _uploadGrantRepository;
    private readonly IRepository<DentalToothRecord>? _dentalRepository;
    private readonly IRepository<Procedure>? _procedureRepository;
    private readonly IRepository<Invoice>? _invoiceRepository;
    private readonly IRepository<InvoiceLineItem>? _invoiceLineItemRepository;

    public ReconcileEodCommandHandler(
        IRepository<QueueItem> queueRepository,
        IRepository<EodReconciliationAudit> auditRepository,
        IUnitOfWork unitOfWork,
        IClinicContext clinicContext,
        IWorkspaceProfileProvider? workspaceProfiles = null,
        IRepository<FacilitySettings>? settingsRepository = null,
        IRepository<ConsultationEncounter>? consultationRepository = null,
        IRepository<EncounterDiagnosis>? diagnosisRepository = null,
        IRepository<PrescriptionItem>? prescriptionRepository = null,
        IRepository<EncounterReviewOfSystemsItem>? rosRepository = null,
        IRepository<PatientPhysicalExam>? physicalExamRepository = null,
        IRepository<PatientPhysicalExamFinding>? physicalExamFindingRepository = null,
        IRepository<ClinicDispensingLog>? dispensingLogRepository = null,
        IRepository<MedicalCertificate>? medCertRepository = null,
        IRepository<ReferralLetter>? referralRepository = null,
        IRepository<LabOrder>? labOrderRepository = null,
        IRepository<LabOrderItem>? labOrderItemRepository = null,
        IRepository<UploadGrant>? uploadGrantRepository = null,
        IRepository<DentalToothRecord>? dentalRepository = null,
        IRepository<Procedure>? procedureRepository = null,
        IRepository<Invoice>? invoiceRepository = null,
        IRepository<InvoiceLineItem>? invoiceLineItemRepository = null)
    {
        _queueRepository = queueRepository;
        _auditRepository = auditRepository;
        _unitOfWork = unitOfWork;
        _clinicContext = clinicContext;
        _workspaceProfiles = workspaceProfiles;
        _settingsRepository = settingsRepository;
        _consultationRepository = consultationRepository;
        _diagnosisRepository = diagnosisRepository;
        _prescriptionRepository = prescriptionRepository;
        _rosRepository = rosRepository;
        _physicalExamRepository = physicalExamRepository;
        _physicalExamFindingRepository = physicalExamFindingRepository;
        _dispensingLogRepository = dispensingLogRepository;
        _medCertRepository = medCertRepository;
        _referralRepository = referralRepository;
        _labOrderRepository = labOrderRepository;
        _labOrderItemRepository = labOrderItemRepository;
        _uploadGrantRepository = uploadGrantRepository;
        _dentalRepository = dentalRepository;
        _procedureRepository = procedureRepository;
        _invoiceRepository = invoiceRepository;
        _invoiceLineItemRepository = invoiceLineItemRepository;
    }

    public async Task<ReconcileEodResultDto> Handle(ReconcileEodCommand request, CancellationToken ct)
    {
        var targetDate = request.Date
            ?? await ClinicTimeZoneResolver.ResolveTodayAsync(_workspaceProfiles, _clinicContext.TenantId, ct, _settingsRepository);
        var now = DateTime.UtcNow;

        // Fetch remaining active waiting tickets for the clinic and target date.
        // CRITICAL INVARIANT: Only Waiting, Triaged, and OnHold are transitioned.
        // InConsultation, Completed, DischargedNonDoctor, and Diverted tickets MUST NOT be modified or invalidated!
        var activeItems = await _queueRepository.Query(q =>
            q.ClinicId == _clinicContext.ClinicId &&
            q.QueueDate == targetDate &&
            (q.Status == QueueStatus.Waiting || q.Status == QueueStatus.Triaged || q.Status == QueueStatus.OnHold))
            .OrderBy(q => q.SequenceNumber)
            .ToListAsync(ct);

        var affectedTickets = new List<string>();

        foreach (var item in activeItems)
        {
            await ConsultationRevertHelper.PurgeUnsignedConsultationArtifactsAsync(
                _clinicContext.ClinicId,
                queueItemId: item.Id,
                consultationRepo: _consultationRepository,
                diagnosisRepo: _diagnosisRepository,
                prescriptionRepo: _prescriptionRepository,
                rosRepo: _rosRepository,
                physicalExamRepo: _physicalExamRepository,
                physicalExamFindingRepo: _physicalExamFindingRepository,
                dispensingLogRepo: _dispensingLogRepository,
                medCertRepo: _medCertRepository,
                referralRepo: _referralRepository,
                labOrderRepo: _labOrderRepository,
                labOrderItemRepo: _labOrderItemRepository,
                uploadGrantRepo: _uploadGrantRepository,
                dentalRepo: _dentalRepository,
                procedureRepo: _procedureRepository,
                invoiceRepo: _invoiceRepository,
                invoiceLineItemRepo: _invoiceLineItemRepository,
                unitOfWork: _unitOfWork,
                ct: ct);

            // Shield DischargedNonDoctor and Diverted (already terminal, excluded by query)
            // Differentiate consultation vs non-consultation visits:
            if (item.VisitType.IsPhysicianConsultation())
            {
                item.Status = QueueStatus.NoShow;
            }
            else
            {
                // Cleanly close stale non-consultation visits without false NoShow penalty
                item.Status = QueueStatus.Cancelled;
                item.DischargeNotes = string.IsNullOrWhiteSpace(item.DischargeNotes)
                    ? "Auto-closed during EOD reconciliation."
                    : item.DischargeNotes;
            }

            item.CompletedTime = now;
            item.UpdatedAt = now;
            item.UpdatedBy = request.TriggerType == "Automatic"
                ? "AutoEOD"
                : (_clinicContext.StaffId?.ToString() ?? "ClinicStaff");

            _queueRepository.Update(item);
            affectedTickets.Add(item.QueueNumber);
        }

        // Record Audit Trail
        var audit = new EodReconciliationAudit
        {
            Id = Guid.NewGuid(),
            TenantId = _clinicContext.TenantId,
            ClinicId = _clinicContext.ClinicId,
            ReconciliationDate = targetDate,
            ReconciledAt = now,
            TriggerType = request.TriggerType,
            ReconciledBy = request.TriggerType == "Automatic"
                ? "System / AutoEOD"
                : (_clinicContext.StaffId?.ToString() ?? "ClinicStaff"),
            StaffId = _clinicContext.StaffId,
            TotalTicketsProcessed = activeItems.Count,
            AffectedTicketNumbersJson = JsonSerializer.Serialize(affectedTickets),
            Notes = request.Reason ?? (request.TriggerType == "Automatic"
                ? "Scheduled EOD queue closure."
                : "Manual Force EOD triggered from workstation."),
            CreatedAt = now,
            CreatedBy = request.TriggerType == "Automatic" ? "AutoEOD" : "ClinicStaff"
        };

        await _auditRepository.AddAsync(audit, ct);
        await _unitOfWork.SaveChangesAsync(ct);

        var summary = activeItems.Count > 0
            ? $"Successfully reconciled {activeItems.Count} leftover ticket(s) to No-Show for {targetDate:yyyy-MM-dd}."
            : $"No active tickets found for {targetDate:yyyy-MM-dd}; audit entry recorded.";

        return new ReconcileEodResultDto(
            activeItems.Count,
            targetDate,
            now,
            affectedTickets.AsReadOnly(),
            summary);
    }
}
