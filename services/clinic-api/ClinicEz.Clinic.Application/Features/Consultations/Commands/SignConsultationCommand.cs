using System;
using System.Collections.Generic;
using System.Linq;
using System.Threading;
using System.Threading.Tasks;
using ClinicEz.Clinic.Application.Common;
using ClinicEz.Clinic.Application.Common.DTOs;
using ClinicEz.Clinic.Application.Common.Interfaces;
using ClinicEz.Clinic.Application.Features.Consultations.DTOs;
using ClinicEz.Clinic.Application.Features.Prescriptions.DTOs;
using ClinicEz.Clinic.Domain.Common;
using ClinicEz.Clinic.Domain.Entities;
using ClinicEz.Clinic.Domain.Enums;
using ClinicEz.Clinic.Domain.Interfaces;
using ClinicEz.Shared.Common;
using ClinicEz.Shared.Exceptions;
using ClinicEz.Shared.Interop;
using ClinicEz.Shared.Interop.Contracts;
using FluentValidation;
using MediatR;
using Microsoft.EntityFrameworkCore;
using Microsoft.Extensions.Configuration;
using ClinicEz.Shared.Documents.Security;
using Interop = ClinicEz.Shared.Interoperability;

namespace ClinicEz.Clinic.Application.Features.Consultations.Commands;

public sealed record SignConsultationCommand(
    Guid Id,
    string? PrcLicenseNumber = null,
    string? PtrNumber = null,
    string? S2LicenseNumber = null,
    string? TargetPharmacyFacilityId = null,
    string? TargetPharmacyTenantId = null,
    string? DoctorPhilHealthPan = null,
    string? PhilHealthAtc = null) : IRequest<ConsultationEncounterDto>;

public sealed class SignConsultationCommandValidator : AbstractValidator<SignConsultationCommand>
{
    public SignConsultationCommandValidator()
    {
        RuleFor(x => x.Id).NotEmpty();
    }
}

public sealed class SignConsultationCommandHandler : IRequestHandler<SignConsultationCommand, ConsultationEncounterDto>
{
    private readonly IRepository<ConsultationEncounter> _consultationRepository;
    private readonly IRepository<StaffMember> _staffRepository;
    private readonly IRepository<QueueItem> _queueRepository;
    private readonly IRepository<Appointment> _appointmentRepository;
    private readonly IRepository<Patient> _patientRepository;
    private readonly IUnitOfWork _unitOfWork;
    private readonly IClinicContext _clinicContext;
    private readonly IClinicIdentityProvider _clinicIdentity;
    private readonly IPatientAppointmentPublisher _appointmentPublisher;
    private readonly IPrescriptionPublisher _prescriptionPublisher;
    private readonly IClaimSlipService _claims;
    private readonly IPatientDocumentPublisher _documents;
    private readonly IInteropPublisher? _publisher;
    private readonly IConfiguration? _configuration;
    private readonly IRepository<Procedure>? _procedureRepository;
    private readonly IRepository<ClinicDispensingLog>? _dispensingLogRepository;
    private readonly IRepository<MedicalCertificate>? _medCertRepository;
    private readonly IRepository<ReferralLetter>? _referralRepository;
    private readonly IRepository<LabOrder>? _labOrderRepository;
    private readonly IUploadGrantService? _uploadGrantService;
    private readonly ILabRequisitionPublisher? _labRequisitionPublisher;
    private readonly IDocumentSecurityService? _documentSecurityService;

    public SignConsultationCommandHandler(
        IRepository<ConsultationEncounter> consultationRepository,
        IRepository<StaffMember> staffRepository,
        IRepository<QueueItem> queueRepository,
        IRepository<Appointment> appointmentRepository,
        IRepository<Patient> patientRepository,
        IUnitOfWork unitOfWork,
        IClinicContext clinicContext,
        IClinicIdentityProvider clinicIdentity,
        IPatientAppointmentPublisher appointmentPublisher,
        IPrescriptionPublisher prescriptionPublisher,
        IClaimSlipService claims,
        IPatientDocumentPublisher documents,
        IInteropPublisher? publisher = null,
        IConfiguration? configuration = null,
        IRepository<Procedure>? procedureRepository = null,
        IRepository<ClinicDispensingLog>? dispensingLogRepository = null,
        IRepository<MedicalCertificate>? medCertRepository = null,
        IRepository<ReferralLetter>? referralRepository = null,
        IRepository<LabOrder>? labOrderRepository = null,
        IUploadGrantService? uploadGrantService = null,
        ILabRequisitionPublisher? labRequisitionPublisher = null,
        IDocumentSecurityService? documentSecurityService = null)
    {
        _consultationRepository = consultationRepository;
        _staffRepository = staffRepository;
        _queueRepository = queueRepository;
        _appointmentRepository = appointmentRepository;
        _patientRepository = patientRepository;
        _unitOfWork = unitOfWork;
        _clinicContext = clinicContext;
        _clinicIdentity = clinicIdentity;
        _appointmentPublisher = appointmentPublisher;
        _prescriptionPublisher = prescriptionPublisher;
        _claims = claims;
        _documents = documents;
        _publisher = publisher;
        _configuration = configuration;
        _procedureRepository = procedureRepository;
        _dispensingLogRepository = dispensingLogRepository;
        _medCertRepository = medCertRepository;
        _referralRepository = referralRepository;
        _labOrderRepository = labOrderRepository;
        _uploadGrantService = uploadGrantService;
        _labRequisitionPublisher = labRequisitionPublisher;
        _documentSecurityService = documentSecurityService;
    }

    public async Task<ConsultationEncounterDto> Handle(SignConsultationCommand request, CancellationToken cancellationToken)
    {
        var targetPharmacy = ParseTargetPharmacy(request);

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
            throw new NotFoundException($"Encounter '{request.Id}' was not found in this clinic.");
        }

        if (encounter.IsSigned)
        {
            // Already signed
            return MapToDto(encounter);
        }

        // Fetch Doctor staff record to lock credentials
        var doctor = await _staffRepository.Query(s => s.Id == encounter.DoctorId && s.ClinicId == _clinicContext.ClinicId)
            .FirstOrDefaultAsync(cancellationToken);

        // Pre-resolve associated queue item to validate procedure bay status before signing
        QueueItem? queueItem = null;
        if (encounter.QueueItemId.HasValue)
        {
            queueItem = await _queueRepository.Query(q => q.Id == encounter.QueueItemId.Value && q.ClinicId == _clinicContext.ClinicId)
                .FirstOrDefaultAsync(cancellationToken);
        }
        else
        {
            var today = DateOnly.FromDateTime(DateTime.UtcNow);
            var manilaToday = DateOnly.FromDateTime(DateTime.UtcNow.AddHours(8));
            QueueStatus[] activeStatuses =
            [
                QueueStatus.Waiting,
                QueueStatus.Triaged,
                QueueStatus.InConsultation,
                QueueStatus.PendingProcedure,
                QueueStatus.ReEvaluation,
                QueueStatus.OnHold
            ];

            queueItem = await _queueRepository.Query(q =>
                q.ClinicId == _clinicContext.ClinicId &&
                (q.QueueDate == today || q.QueueDate == manilaToday) &&
                q.PatientId == encounter.PatientId &&
                activeStatuses.Contains(q.Status))
                .OrderByDescending(q => q.CheckInTime)
                .FirstOrDefaultAsync(cancellationToken);

            if (queueItem != null)
            {
                encounter.QueueItemId = queueItem.Id;
            }
        }

        // Procedure Bay Guard: Patient cannot be signed while actively in the procedure bay
        if (queueItem != null && queueItem.Status == QueueStatus.PendingProcedure)
        {
            throw new BadRequestException("Cannot sign consultation encounter while patient is still in the Procedure Bay (Pending Procedure). All ordered in-clinic procedures must be executed or cancelled first.");
        }

        // Procedure Bay Guard: Reject signing if any in-clinic procedures are still ordered or in-progress
        if (_procedureRepository != null)
        {
            var hasPendingProcedures = await _procedureRepository.Query(p =>
                p.ClinicId == _clinicContext.ClinicId &&
                (p.ConsultationId == encounter.Id ||
                 (encounter.QueueItemId.HasValue && p.QueueItemId == encounter.QueueItemId.Value) ||
                 (queueItem != null && p.QueueItemId == queueItem.Id)) &&
                (p.Status == ProcedureStatus.Ordered || p.Status == ProcedureStatus.InProgress)
            ).AnyAsync(cancellationToken);

            if (hasPendingProcedures)
            {
                throw new BadRequestException("Cannot sign consultation encounter while in-clinic procedures are still pending in the Procedure Bay. All ordered in-clinic procedures must be executed or cancelled first.");
            }
        }

        static string? FirstNonEmpty(params string?[] candidates) =>
            candidates.FirstOrDefault(s => !string.IsNullOrWhiteSpace(s))?.Trim();

        var prcLicense = FirstNonEmpty(request.PrcLicenseNumber, encounter.DoctorPrcLicense, doctor?.PrcLicenseNumber);
        var ptr = FirstNonEmpty(request.PtrNumber, encounter.DoctorPtr, doctor?.PtrNumber);
        var s2License = FirstNonEmpty(request.S2LicenseNumber, encounter.DoctorS2License, doctor?.S2LicenseNumber);
        var pan = FirstNonEmpty(request.DoctorPhilHealthPan, encounter.DoctorPhilHealthPan, doctor?.PhilHealthPan);
        var atc = FirstNonEmpty(request.PhilHealthAtc, encounter.PhilHealthAtc);

        // PDEA Dangerous Drugs compliance: S2 license must be present if prescribing dangerous drugs
        var hasDangerousDrugs = encounter.Prescriptions.Any(p => p.IsDangerousDrug);
        if (hasDangerousDrugs && string.IsNullOrWhiteSpace(s2License))
        {
            throw new BadRequestException("Encounter includes PDEA controlled/dangerous drug prescriptions, but Doctor S2 License number is missing.");
        }

        encounter.Sign(prcLicense, ptr, s2License, pan, atc);
        encounter.BranchId ??= _clinicContext.BranchId;
        var signedAt = encounter.SignedAt ?? DateTime.UtcNow;

        var defaultRos = encounter.RosCategory
                         ?? encounter.ReviewOfSystemsItems.FirstOrDefault(r => !r.IsNormal)?.System
                         ?? RosSystem.EssentiallyNormal;

        if (!encounter.RosCategory.HasValue && encounter.ReviewOfSystemsItems.Count > 0)
        {
            encounter.RosCategory = defaultRos;
        }

        var dispensedPrescriptions = encounter.Prescriptions
            .Where(p => p.ClinicDispensedQuantity is > 0)
            .ToList();

        var createdDirectQueue = false;
        if (queueItem == null && !encounter.QueueItemId.HasValue)
        {
            var directQueue = new QueueItem
            {
                Id = Guid.NewGuid(),
                TenantId = encounter.TenantId,
                ClinicId = encounter.ClinicId,
                QueueNumber = $"DIR-{signedAt:HHmmss}",
                SequenceNumber = 1,
                QueueDate = DateOnly.FromDateTime(encounter.EncounterDate),
                PatientId = encounter.PatientId,
                PatientName = encounter.PatientName,
                DoctorId = encounter.DoctorId,
                DoctorName = encounter.DoctorName,
                Priority = QueuePriority.Routine,
                Status = QueueStatus.Completed,
                VisitType = VisitType.RoutineCheckup,
                IsDirectVisit = true,
                CheckInTime = encounter.EncounterDate,
                CalledTime = encounter.EncounterDate,
                CompletedTime = signedAt,
                ChiefComplaint = string.IsNullOrWhiteSpace(encounter.Subjective) ? "Direct Consultation" : encounter.Subjective,
                CreatedAt = signedAt,
                CreatedBy = encounter.DoctorName
            };
            await _queueRepository.AddAsync(directQueue, cancellationToken);
            queueItem = directQueue;
            encounter.QueueItemId = directQueue.Id;
            createdDirectQueue = true;
        }

        var dispensingLogRepo = _dispensingLogRepository ?? (_unitOfWork as IRepositoryProvider)?.GetRepository<ClinicDispensingLog>();
        foreach (var rx in dispensedPrescriptions)
        {
            rx.IsClinicDispensed = true;
            rx.ClinicDispensedAt = signedAt;
            rx.ClinicDispensedBy = encounter.DoctorName;
            rx.RosCategory ??= defaultRos;

            if (dispensingLogRepo != null && encounter.QueueItemId.HasValue)
            {
                var alreadyLogged = await dispensingLogRepo
                    .Query(d => d.PrescriptionItemId == rx.Id && d.ClinicId == _clinicContext.ClinicId)
                    .AnyAsync(cancellationToken);

                if (!alreadyLogged)
                {
                    var itemDisplay = !string.IsNullOrWhiteSpace(rx.BrandName)
                        ? $"{rx.GenericName} ({rx.BrandName})"
                        : rx.GenericName;

                    await dispensingLogRepo.AddAsync(new ClinicDispensingLog
                    {
                        Id = Guid.NewGuid(),
                        TenantId = encounter.TenantId,
                        ClinicId = encounter.ClinicId,
                        PatientId = encounter.PatientId,
                        PatientName = encounter.PatientName,
                        QueueItemId = encounter.QueueItemId.Value,
                        Source = ClinicDispenseSource.DoctorConsultation,
                        ConsultationEncounterId = encounter.Id,
                        PrescriptionItemId = rx.Id,
                        ItemName = itemDisplay,
                        ItemCategory = ClinicDispenseItemCategory.Medicine,
                        DosageOrSpec = rx.Dosage,
                        FormOrUnit = rx.Form,
                        QuantityDispensed = rx.ClinicDispensedQuantity!.Value,
                        DirectionsOrInstructions = rx.Sig,
                        RosCategory = rx.RosCategory ?? defaultRos,
                        IsConsultationValidated = true,
                        DispensedByStaffId = encounter.DoctorId,
                        DispensedByStaffName = encounter.DoctorName,
                        DispensedByRole = "Doctor",
                        DispensedAt = signedAt,
                        RequiresDoctorReview = false,
                        CreatedAt = signedAt,
                        CreatedBy = encounter.DoctorName
                    }, cancellationToken);
                }
            }
        }

        if (encounter.Prescriptions.Any())
        {
            encounter.PrescriptionNumber ??= $"RX-{encounter.EncounterDate:yyyyMMdd}-{encounter.Id.ToString("N")[..6].ToUpper()}";
            encounter.RxPublicVerificationToken ??= $"{encounter.ClinicId:N}.{Guid.NewGuid():N}";
            encounter.RxDispenseStatus = PrescriptionDispenseStatus.Issued;
        }

        _consultationRepository.Update(encounter);

        // Update existing queue item to Completed (newly added directQueue is already Completed & in Added state)
        if (queueItem != null && !createdDirectQueue)
        {
            queueItem.Status = QueueStatus.Completed;
            queueItem.CompletedTime = signedAt;
            queueItem.UpdatedAt = signedAt;
            _queueRepository.Update(queueItem);
        }

        // Update appointment to Completed
        Appointment? appointment = null;
        if (encounter.AppointmentId.HasValue)
        {
            appointment = await _appointmentRepository.Query(a => a.Id == encounter.AppointmentId.Value && a.ClinicId == _clinicContext.ClinicId)
                .FirstOrDefaultAsync(cancellationToken);

            if (appointment != null)
            {
                appointment.Status = AppointmentStatus.Completed;
                appointment.UpdatedAt = DateTime.UtcNow;
                _appointmentRepository.Update(appointment);
            }
        }

        // Messages are queued in the interop outbox and commit in the same SaveChanges as the signed consultation.
        var clinic = await _clinicIdentity.GetAsync(cancellationToken);

        await FinalizePendingConsultationArtifactsAsync(encounter, doctor, clinic, signedAt, cancellationToken);

        if (encounter.Prescriptions.Any())
        {
            var rxEvent = await BuildPrescriptionEventAsync(encounter, doctor, clinic, targetPharmacy, cancellationToken);
            if (rxEvent != null)
            {
                if (targetPharmacy != null)
                {
                    _prescriptionPublisher.PublishPrescriptionIssued(rxEvent);
                }
                else
                {
                    var claim = await _claims.CreateRxClaimAsync(rxEvent, cancellationToken);
                    encounter.RxClaimToken = claim.Token;
                    encounter.RxClaimExpiresAt = claim.ExpiresAtUtc;
                }

                await _documents.PublishAsync(new PatientDocumentDraft(
                    encounter.ClinicId,
                    encounter.PatientId,
                    encounter.Id,
                    Interop.PatientDocumentKind.Prescription,
                    $"Prescription {encounter.PrescriptionNumber}",
                    rxEvent.IssuedAt,
                    Status: encounter.RxDispenseStatus.ToString(),
                    VerificationToken: rxEvent.PublicVerificationToken,
                    VerificationUrl: rxEvent.PublicVerificationUrl,
                    ClaimToken: encounter.RxClaimToken,
                    Body: rxEvent), cancellationToken);
            }
        }

        // Patient app notification. A clinic that has not been provisioned yet has no identity to announce.
        if (clinic != null)
        {
            var apptId = appointment?.Id ?? encounter.QueueItemId ?? encounter.Id;
            var scheduledAtStr = (appointment?.ScheduledAt ?? encounter.EncounterDate).ToString("O");
            var rxSummary = encounter.Prescriptions.Any()
                ? string.Join("; ", encounter.Prescriptions.Select(p => $"{p.GenericName} {p.Dosage} {p.Form} ({p.Sig}) - Qty: {p.Quantity}".Trim()))
                : null;
            var portalBase = VerificationUrlResolver.Resolve(_configuration);
            var rxUrl = !string.IsNullOrWhiteSpace(encounter.RxPublicVerificationToken)
                ? PublicRoutes.VerifyRx(encounter.RxPublicVerificationToken, portalBase)
                : null;

            var pushPayload = new ClinicPushAppointmentsPayload(
                _clinicContext.ClinicId,
                encounter.PatientId,
                new List<ClinicAppointmentWebhookDto>
                {
                    new(
                        apptId.ToString(),
                        _clinicContext.ClinicId.ToString(),
                        clinic.Name,
                        new ClinicProviderSnapshotDto(
                            encounter.DoctorId.ToString(),
                            encounter.DoctorName,
                            doctor?.Specialty,
                            null
                        ),
                        appointment?.ServiceType ?? "Consultation",
                        scheduledAtStr,
                        appointment?.DurationMinutes ?? 30,
                        AppointmentStatus.Completed.ToString(),
                        $"Consultation completed and signed by {encounter.DoctorName}",
                        encounter.DoctorName,
                        encounter.Assessment,
                        ClinicalAssessment: encounter.Assessment,
                        DoctorPlan: encounter.Plan,
                        PrescriptionsSummary: rxSummary,
                        PrescriptionPublicVerificationUrl: rxUrl,
                        DraftId: appointment?.DraftId
                    )
                }
            );

            await _appointmentPublisher.PublishAppointmentUpdatedAsync(pushPayload, cancellationToken);
        }

        if (_publisher != null)
        {
            var grantId = CommsGrantIdGenerator.Create(encounter.TenantId, encounter.ClinicId.ToString(), "Encounter", encounter.Id.ToString());
            var from = Party.ForFacility(encounter.TenantId, encounter.ClinicId.ToString(), FacilityType.Clinic);
            var to = Party.ForFacility(encounter.TenantId, encounter.ClinicId.ToString(), FacilityType.Clinic, service: InteropServices.Comms);
            var grantPayload = new CommsEligibilityGrantedPayload(
                GrantId: grantId,
                TenantId: encounter.TenantId,
                FacilityId: encounter.ClinicId.ToString(),
                FacilityType: "Clinic",
                PatientId: encounter.PatientId,
                ContextType: "Encounter",
                ContextId: encounter.Id.ToString(),
                WindowStartUtc: DateTime.UtcNow,
                WindowEndUtc: DateTime.UtcNow.AddDays(14),
                Version: 1);
            _publisher.Enqueue(InteropTypes.CommsEligibilityGranted, from, to, correlationId: grantId, grantPayload);
        }

        await _unitOfWork.SaveChangesAsync(cancellationToken);

        return MapToDto(encounter);
    }

    private static (string TenantId, Guid FacilityId)? ParseTargetPharmacy(SignConsultationCommand request)
    {
        var facility = request.TargetPharmacyFacilityId?.Trim();
        var tenant = request.TargetPharmacyTenantId?.Trim();
        if (string.IsNullOrEmpty(facility) && string.IsNullOrEmpty(tenant))
        {
            return null;
        }

        if (string.IsNullOrEmpty(facility) || string.IsNullOrEmpty(tenant))
        {
            throw new BadRequestException("TargetPharmacyFacilityId and TargetPharmacyTenantId must be provided together to send a prescription to a pharmacy.");
        }

        if (!Guid.TryParse(facility, out var facilityId) || facilityId == Guid.Empty)
        {
            throw new BadRequestException("TargetPharmacyFacilityId must be a valid pharmacy facility id.");
        }

        return (tenant, facilityId);
    }

    /// <summary>
    /// A prescription routed to a pharmacy must be fully formed or signing is rejected. A patient-carried one only becomes
    /// claimable when the clinic is provisioned and the patient and the prescriber's PRC license are on file; otherwise it
    /// stays a local paper prescription without a claim.
    /// </summary>
    private async Task<Interop.PrescriptionIssuedEvent?> BuildPrescriptionEventAsync(
        ConsultationEncounter encounter,
        StaffMember? doctor,
        ClinicIdentity? clinic,
        (string TenantId, Guid FacilityId)? pharmacy,
        CancellationToken cancellationToken)
    {
        var routed = pharmacy != null;
        if (clinic == null)
        {
            return routed
                ? throw new BadRequestException("This clinic has not been provisioned on this server, so a prescription cannot be sent to a pharmacy.")
                : null;
        }

        var patient = await _patientRepository.GetByIdAsync(encounter.PatientId, cancellationToken);
        if (patient == null)
        {
            return routed
                ? throw new BadRequestException($"Patient '{encounter.PatientId}' was not found in this clinic; a prescription sent to a pharmacy needs the patient's demographics.")
                : null;
        }

        if (string.IsNullOrWhiteSpace(encounter.DoctorPrcLicense))
        {
            return routed
                ? throw new BadRequestException("The prescribing doctor's PRC license number is required to send a prescription to a pharmacy.")
                : null;
        }

        var portalBase = VerificationUrlResolver.Resolve(_configuration);
        var rxVerifyUrl = PublicRoutes.VerifyRx(encounter.RxPublicVerificationToken!, portalBase);

        return new Interop.PrescriptionIssuedEvent
        {
            PrescriptionId = encounter.Id,
            PrescriptionNumber = encounter.PrescriptionNumber!,
            OrderingFacilityId = clinic.ClinicId.ToString(),
            OrderingFacilityName = clinic.Name,
            TenantId = clinic.TenantId,
            BranchId = _clinicContext.BranchId?.ToString(),
            VisitKey = (encounter.QueueItemId ?? encounter.Id).ToString(),
            TargetPharmacyFacilityId = pharmacy?.FacilityId.ToString(),
            TargetPharmacyTenantId = pharmacy?.TenantId,
            PrescriberDoctor = new Interop.PrescriberDoctorDto
            {
                DoctorId = encounter.DoctorId.ToString(),
                DoctorName = encounter.DoctorName,
                PrcLicenseNumber = encounter.DoctorPrcLicense,
                PtrNumber = encounter.DoctorPtr,
                S2LicenseNumber = encounter.DoctorS2License,
                Specialization = doctor?.Specialty
            },
            Patient = new Interop.PrescriptionPatientDto
            {
                PatientId = patient.CloudPatientId ?? Guid.Empty,
                FullName = encounter.PatientName,
                PhilHealthPin = patient.PhilHealthNumber,
                NationalId = patient.SeniorCitizenId ?? patient.PwdId,
                DateOfBirth = patient.DateOfBirth.ToString("yyyy-MM-dd"),
                Age = PatientAge.InYears(patient.DateOfBirth, DateOnly.FromDateTime(DateTime.UtcNow)),
                Gender = patient.Sex.ToString(),
                Allergies = patient.Allergies != null && patient.Allergies.Count > 0
                    ? string.Join(", ", patient.Allergies.Select(a => a.Allergen))
                    : "None"
            },
            ClinicalDiagnosis = encounter.Assessment,
            SpecialInstructions = encounter.Plan,
            PublicVerificationToken = encounter.RxPublicVerificationToken!,
            PublicVerificationUrl = rxVerifyUrl,
            QrPayload = rxVerifyUrl,
            IssuedAt = encounter.SignedAt ?? DateTime.UtcNow,
            Items = encounter.Prescriptions.Select(p => new Interop.PrescriptionItemDto
            {
                ItemId = p.Id,
                GenericName = p.GenericName,
                BrandName = p.BrandName,
                Dosage = p.Dosage,
                Form = p.Form,
                Sig = p.Sig,
                Quantity = p.Quantity,
                DurationDays = p.DurationDays,
                Refills = p.Refills,
                IsDangerousDrug = p.IsDangerousDrug,
                Remarks = p.Remarks
            }).ToList()
        };
    }

    private async Task FinalizePendingConsultationArtifactsAsync(
        ConsultationEncounter encounter,
        StaffMember? doctor,
        ClinicIdentity? clinic,
        DateTime signedAt,
        CancellationToken cancellationToken)
    {
        var security = _documentSecurityService ?? new DocumentSecurityService();
        var queueItemId = encounter.QueueItemId;

        if (_medCertRepository != null)
        {
            var pendingCerts = await _medCertRepository
                .Query(m => m.ClinicId == _clinicContext.ClinicId &&
                            !m.IsSigned &&
                            (m.ConsultationId == encounter.Id ||
                             (queueItemId.HasValue && m.QueueItemId == queueItemId.Value)))
                .ToListAsync(cancellationToken);

            foreach (var cert in pendingCerts)
            {
                cert.ConsultationId ??= encounter.Id;
                cert.QueueItemId ??= queueItemId;
                cert.IsSigned = true;
                cert.SignedAt = signedAt;
                cert.SecurityDigest = security.ComputeDocumentDigest(
                    cert.TenantId, "MED-CERT", cert.CertificateNumber, cert.PatientId, cert.PrcLicenseNumber, signedAt);
                _medCertRepository.Update(cert);

                if (clinic != null)
                {
                    var verifyUrl = security.GenerateVerificationUrl(
                        VerificationUrlResolver.Resolve(_configuration), "med-cert", cert.CertificateNumber, cert.SecurityDigest);

                    await _documents.PublishAsync(new PatientDocumentDraft(
                        cert.ClinicId,
                        cert.PatientId,
                        cert.Id,
                        Interop.PatientDocumentKind.MedicalCertificate,
                        $"Medical certificate {cert.CertificateNumber}",
                        signedAt,
                        Status: "Issued",
                        VerificationToken: cert.CertificateNumber,
                        VerificationUrl: verifyUrl,
                        Body: new Interop.MedicalCertificateIssuedPayload
                        {
                            CertificateId = cert.Id,
                            CertificateNumber = cert.CertificateNumber,
                            PatientId = cert.PatientId,
                            PatientName = cert.PatientName,
                            IssuerTenantId = clinic.TenantId,
                            IssuerFacilityId = clinic.ClinicId.ToString(),
                            IssuerName = clinic.Name,
                            DoctorName = cert.DoctorName,
                            DoctorPrcLicense = cert.PrcLicenseNumber,
                            DoctorPtrNumber = cert.PtrNumber,
                            Purpose = cert.Purpose,
                            Diagnosis = cert.Diagnosis,
                            Remarks = cert.Remarks,
                            RestDays = cert.RecommendedRestDays,
                            ValidFrom = cert.RestStartDate?.ToDateTime(TimeOnly.MinValue),
                            ValidTo = cert.RestEndDate?.ToDateTime(TimeOnly.MinValue),
                            IssuedAtUtc = signedAt,
                            VerificationToken = cert.CertificateNumber,
                            VerificationUrl = verifyUrl
                        }), cancellationToken);
                }
            }
        }

        if (_referralRepository != null)
        {
            var pendingReferrals = await _referralRepository
                .Query(r => r.ClinicId == _clinicContext.ClinicId &&
                            !r.IsSigned &&
                            (r.ConsultationId == encounter.Id ||
                             (queueItemId.HasValue && r.QueueItemId == queueItemId.Value)))
                .ToListAsync(cancellationToken);

            foreach (var referral in pendingReferrals)
            {
                referral.ConsultationId ??= encounter.Id;
                referral.QueueItemId ??= queueItemId;
                referral.IsSigned = true;
                referral.SignedAt = signedAt;
                var prc = referral.ReferringDoctorPrcNumber ?? encounter.DoctorPrcLicense ?? doctor?.PrcLicenseNumber ?? "PRC-DOCTOR";
                referral.ReferringDoctorPrcNumber = prc;
                referral.SecurityDigest = security.ComputeDocumentDigest(
                    referral.TenantId, "REFERRAL", referral.ReferralNumber, referral.PatientId, prc, signedAt);
                _referralRepository.Update(referral);
            }
        }

        if (_labOrderRepository != null)
        {
            var pendingOrders = await _labOrderRepository
                .Query(o => o.ClinicId == _clinicContext.ClinicId &&
                            !o.IsSigned &&
                            (o.ConsultationId == encounter.Id ||
                             (queueItemId.HasValue && o.QueueItemId == queueItemId.Value)))
                .Include(o => o.Items)
                .ToListAsync(cancellationToken);

            if (pendingOrders.Count > 0)
            {
                var patient = await _patientRepository.GetByIdAsync(encounter.PatientId, cancellationToken);

                foreach (var order in pendingOrders)
                {
                    order.ConsultationId ??= encounter.Id;
                    order.QueueItemId ??= queueItemId;
                    order.IsSigned = true;
                    order.StageChangedAt = signedAt;

                    if (_uploadGrantService != null)
                    {
                        var upload = await _uploadGrantService.MintAsync(order, Interop.UploaderKind.ExternalLab, cancellationToken);
                        var isRouted = order.TargetFacilityId.HasValue && !string.IsNullOrWhiteSpace(order.TargetTenantId);
                        var prc = encounter.DoctorPrcLicense ?? doctor?.PrcLicenseNumber;

                        if (clinic != null && patient != null && !string.IsNullOrWhiteSpace(prc))
                        {
                            var requisition = new Interop.LabRequisitionIssuedEvent
                            {
                                RequisitionId = order.Id,
                                AccessionNumber = order.OrderNumber,
                                OrderingFacilityId = clinic.ClinicId.ToString(),
                                OrderingFacilityName = clinic.Name,
                                TenantId = clinic.TenantId,
                                BranchId = _clinicContext.BranchId?.ToString(),
                                VisitKey = (order.QueueItemId ?? encounter.Id).ToString(),
                                TargetFacilityId = order.TargetFacilityId?.ToString(),
                                TargetTenantId = order.TargetTenantId,
                                OrderingDoctor = new Interop.OrderingDoctorDto
                                {
                                    DoctorId = (order.OrderedByDoctorId ?? encounter.DoctorId).ToString(),
                                    DoctorName = order.OrderedByDoctorName ?? encounter.DoctorName,
                                    PrcLicenseNumber = prc.Trim(),
                                    PtrNumber = encounter.DoctorPtr ?? doctor?.PtrNumber,
                                    Specialization = doctor?.Specialty
                                },
                                Patient = new Interop.RequisitionPatientDto
                                {
                                    PatientId = patient.CloudPatientId ?? Guid.Empty,
                                    FullName = order.PatientName,
                                    PhilHealthPin = patient.PhilHealthNumber,
                                    NationalId = patient.SeniorCitizenId ?? patient.PwdId,
                                    DateOfBirth = patient.DateOfBirth.ToString("yyyy-MM-dd"),
                                    Age = PatientAge.InYears(patient.DateOfBirth, DateOnly.FromDateTime(DateTime.UtcNow)),
                                    Gender = patient.Sex.ToString(),
                                    ContactNumber = patient.ContactNumber
                                },
                                Icd10Code = order.ClinicalDiagnosis,
                                ProvisionalDiagnosis = order.ClinicalDiagnosis,
                                FastingInstructions = order.Notes,
                                Urgency = "Routine",
                                Items = order.Items.Select(i => new Interop.RequisitionItemDto
                                {
                                    ItemCode = i.TestName.ToUpperInvariant().Replace(" ", "_")[..Math.Min(i.TestName.Length, 15)],
                                    ItemName = i.TestName,
                                    Category = i.Category,
                                    Urgency = "Routine",
                                    SpecimenRequirement = i.Instructions
                                }).ToList(),
                                PublicUploadToken = upload.Token,
                                PublicUploadUrl = upload.Url,
                                IssuedAt = signedAt
                            };

                            if (isRouted)
                            {
                                _labRequisitionPublisher?.PublishRequisitionIssued(requisition);
                            }
                            else
                            {
                                var claim = await _claims.CreateLabClaimAsync(requisition, cancellationToken);
                                order.ClaimToken = claim.Token;
                                order.ClaimExpiresAt = claim.ExpiresAtUtc;
                            }

                            await _documents.PublishAsync(new PatientDocumentDraft(
                                order.ClinicId,
                                order.PatientId,
                                order.Id,
                                Interop.PatientDocumentKind.LabRequest,
                                $"Laboratory request {order.OrderNumber}",
                                signedAt,
                                Status: order.Stage.ToString(),
                                ClaimToken: order.ClaimToken,
                                Body: requisition), cancellationToken);
                        }
                    }

                    _labOrderRepository.Update(order);
                }
            }
        }
    }

    private static ConsultationEncounterDto MapToDto(ConsultationEncounter encounter)
    {
        return ConsultationPlanManagementMapper.ToDto(
            encounter,
            rxStatus: RxPharmacyStatusDto.From(encounter));
    }
}
