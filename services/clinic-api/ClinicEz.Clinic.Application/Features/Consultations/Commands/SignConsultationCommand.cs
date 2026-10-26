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
    private readonly IRepository<ClinicPatient> _patientRepository;
    private readonly IUnitOfWork _unitOfWork;
    private readonly IClinicContext _clinicContext;
    private readonly IClinicIdentityProvider _clinicIdentity;
    private readonly IPatientAppointmentPublisher _appointmentPublisher;
    private readonly IPrescriptionPublisher _prescriptionPublisher;
    private readonly IClaimSlipService _claims;
    private readonly IPatientDocumentPublisher _documents;
    private readonly IInteropPublisher? _publisher;
    private readonly IConfiguration? _configuration;

    public SignConsultationCommandHandler(
        IRepository<ConsultationEncounter> consultationRepository,
        IRepository<StaffMember> staffRepository,
        IRepository<QueueItem> queueRepository,
        IRepository<Appointment> appointmentRepository,
        IRepository<ClinicPatient> patientRepository,
        IUnitOfWork unitOfWork,
        IClinicContext clinicContext,
        IClinicIdentityProvider clinicIdentity,
        IPatientAppointmentPublisher appointmentPublisher,
        IPrescriptionPublisher prescriptionPublisher,
        IClaimSlipService claims,
        IPatientDocumentPublisher documents,
        IInteropPublisher? publisher = null,
        IConfiguration? configuration = null)
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
    }

    public async Task<ConsultationEncounterDto> Handle(SignConsultationCommand request, CancellationToken cancellationToken)
    {
        var targetPharmacy = ParseTargetPharmacy(request);

        var encounter = await _consultationRepository.Query(c => c.Id == request.Id && c.ClinicId == _clinicContext.ClinicId)
            .Include(c => c.Diagnoses)
            .Include(c => c.Prescriptions)
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

        encounter.DoctorPrcLicense = request.PrcLicenseNumber ?? doctor?.PrcLicenseNumber;
        encounter.DoctorPtr = request.PtrNumber ?? doctor?.PtrNumber;
        encounter.DoctorS2License = request.S2LicenseNumber ?? doctor?.S2LicenseNumber;
        encounter.DoctorPhilHealthPan = request.DoctorPhilHealthPan ?? encounter.DoctorPhilHealthPan ?? doctor?.PhilHealthPan;
        if (request.PhilHealthAtc != null) encounter.PhilHealthAtc = request.PhilHealthAtc;

        // PDEA Dangerous Drugs compliance: S2 license must be present if prescribing dangerous drugs
        var hasDangerousDrugs = encounter.Prescriptions.Any(p => p.IsDangerousDrug);
        if (hasDangerousDrugs && string.IsNullOrWhiteSpace(encounter.DoctorS2License))
        {
            throw new BadRequestException("Encounter includes PDEA controlled/dangerous drug prescriptions, but Doctor S2 License number is missing.");
        }

        encounter.IsSigned = true;
        encounter.SignedAt = DateTime.UtcNow;
        encounter.BranchId ??= _clinicContext.BranchId;
        encounter.UpdatedAt = DateTime.UtcNow;
        encounter.UpdatedBy = encounter.DoctorName;

        if (encounter.Prescriptions.Any())
        {
            encounter.PrescriptionNumber ??= $"RX-{encounter.EncounterDate:yyyyMMdd}-{encounter.Id.ToString("N")[..6].ToUpper()}";
            encounter.RxPublicVerificationToken ??= $"{encounter.ClinicId:N}.{Guid.NewGuid():N}";
            encounter.RxDispenseStatus = PrescriptionDispenseStatus.Issued;
        }

        _consultationRepository.Update(encounter);

        // Update queue item to Completed
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

        if (queueItem != null)
        {
            queueItem.Status = QueueStatus.Completed;
            queueItem.CompletedTime = DateTime.UtcNow;
            queueItem.UpdatedAt = DateTime.UtcNow;
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
            VisitKey = encounter.Id.ToString(),
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
                PatientId = patient.SyncPatientId ?? Guid.Empty,
                FullName = encounter.PatientName,
                PhilHealthPin = patient.PhilHealthNumber,
                NationalId = patient.SeniorCitizenId ?? patient.PwdId,
                DateOfBirth = patient.DateOfBirth.ToString("yyyy-MM-dd"),
                Age = PatientAge.InYears(patient.DateOfBirth, DateOnly.FromDateTime(DateTime.UtcNow)),
                Gender = patient.Gender,
                ContactNumber = patient.ContactNumber,
                Allergies = patient.Allergies
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

    private static ConsultationEncounterDto MapToDto(ConsultationEncounter encounter)
    {
        return new ConsultationEncounterDto(
            encounter.Id,
            encounter.TenantId,
            encounter.ClinicId,
            encounter.QueueItemId,
            encounter.AppointmentId,
            encounter.PatientId,
            encounter.PatientName,
            encounter.DoctorId,
            encounter.DoctorName,
            encounter.EncounterDate,
            encounter.Subjective,
            encounter.Objective,
            encounter.Assessment,
            encounter.Plan,
            encounter.HomeInstructions,
            encounter.DoctorPrcLicense,
            encounter.DoctorPtr,
            encounter.DoctorS2License,
            encounter.IsSigned,
            encounter.SignedAt,
            encounter.Diagnoses.Select(d => new EncounterDiagnosisDto(d.Id, d.Icd10Code, d.Description, d.IsPrimary)).ToList(),
            encounter.Prescriptions.Select(p => new PrescriptionItemDto(p.Id, p.GenericName, p.BrandName, p.Dosage, p.Form, p.Sig, p.Quantity, p.DurationDays, p.Refills, p.IsDangerousDrug, p.Remarks, p.PhilHealthDrugCode)).ToList(),
            encounter.IsYakapEligible,
            encounter.PhilHealthSignSympCode,
            encounter.PhilHealthOtherComplaint,
            encounter.PhilHealthPainSite,
            encounter.PhilHealthCaseNo ?? encounter.HciCaseNo,
            encounter.PhilHealthSoapTransNo ?? encounter.SoapTransNo,
            encounter.DoctorPhilHealthPan,
            encounter.PhilHealthAtc,
            encounter.HciCaseNo ?? encounter.PhilHealthCaseNo,
            encounter.HciTransNo,
            encounter.SoapTransNo ?? encounter.PhilHealthSoapTransNo,
            encounter.GeneralSurveyId,
            encounter.GeneralSurveyRemarks,
            encounter.PhysicalExamFindingsJson,
            RxPharmacyStatusDto.From(encounter));
    }
}
