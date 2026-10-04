using System;
using System.Collections.Generic;
using System.Linq;
using System.Threading;
using System.Threading.Tasks;
using ClinicEz.Clinic.Application.Common.DTOs;
using ClinicEz.Clinic.Application.Common.Interfaces;
using ClinicEz.Clinic.Application.Features.Consultations.DTOs;
using ClinicEz.Clinic.Domain.Entities;
using ClinicEz.Clinic.Domain.Enums;
using ClinicEz.Clinic.Domain.Interfaces;
using ClinicEz.Shared.Exceptions;
using FluentValidation;
using MediatR;
using Microsoft.EntityFrameworkCore;

namespace ClinicEz.Clinic.Application.Features.Consultations.Commands;

public sealed record SignConsultationCommand(
    Guid Id,
    string? PrcLicenseNumber = null,
    string? PtrNumber = null,
    string? S2LicenseNumber = null) : IRequest<ConsultationEncounterDto>;

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
    private readonly IUnitOfWork _unitOfWork;
    private readonly IClinicContext _clinicContext;
    private readonly IPatientWebhookNotifier _webhookNotifier;
    private readonly IPrescriptionPublisher? _prescriptionPublisher;

    public SignConsultationCommandHandler(
        IRepository<ConsultationEncounter> consultationRepository,
        IRepository<StaffMember> staffRepository,
        IRepository<QueueItem> queueRepository,
        IRepository<Appointment> appointmentRepository,
        IUnitOfWork unitOfWork,
        IClinicContext clinicContext,
        IPatientWebhookNotifier webhookNotifier,
        IPrescriptionPublisher? prescriptionPublisher = null)
    {
        _consultationRepository = consultationRepository;
        _staffRepository = staffRepository;
        _queueRepository = queueRepository;
        _appointmentRepository = appointmentRepository;
        _unitOfWork = unitOfWork;
        _clinicContext = clinicContext;
        _webhookNotifier = webhookNotifier;
        _prescriptionPublisher = prescriptionPublisher;
    }

    public async Task<ConsultationEncounterDto> Handle(SignConsultationCommand request, CancellationToken cancellationToken)
    {
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

        // PDEA Dangerous Drugs compliance: S2 license must be present if prescribing dangerous drugs
        var hasDangerousDrugs = encounter.Prescriptions.Any(p => p.IsDangerousDrug);
        if (hasDangerousDrugs && string.IsNullOrWhiteSpace(encounter.DoctorS2License))
        {
            throw new BadRequestException("Encounter includes PDEA controlled/dangerous drug prescriptions, but Doctor S2 License number is missing.");
        }

        encounter.IsSigned = true;
        encounter.SignedAt = DateTime.UtcNow;
        encounter.UpdatedAt = DateTime.UtcNow;
        encounter.UpdatedBy = encounter.DoctorName;

        if (encounter.Prescriptions.Any())
        {
            encounter.PrescriptionNumber ??= $"RX-{encounter.EncounterDate:yyyyMMdd}-{encounter.Id.ToString("N")[..6].ToUpper()}";
            encounter.RxPublicVerificationToken ??= Guid.NewGuid().ToString("N");
            encounter.RxDispenseStatus = PrescriptionDispenseStatus.Issued;
        }

        _consultationRepository.Update(encounter);

        // Update queue item to Completed
        if (encounter.QueueItemId.HasValue)
        {
            var queueItem = await _queueRepository.Query(q => q.Id == encounter.QueueItemId.Value && q.ClinicId == _clinicContext.ClinicId)
                .FirstOrDefaultAsync(cancellationToken);

            if (queueItem != null)
            {
                queueItem.Status = QueueStatus.Completed;
                queueItem.CompletedTime = DateTime.UtcNow;
                queueItem.UpdatedAt = DateTime.UtcNow;
                _queueRepository.Update(queueItem);
            }
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

        await _unitOfWork.SaveChangesAsync(cancellationToken);

        // Outbound event publishing to RabbitMQ for Partner Pharmacy (Path A)
        if (encounter.Prescriptions.Any() && _prescriptionPublisher != null)
        {
            var rxEvent = new ClinicEz.Shared.Interoperability.PrescriptionIssuedEvent
            {
                PrescriptionId = encounter.Id,
                PrescriptionNumber = encounter.PrescriptionNumber!,
                OrderingFacilityId = _clinicContext.ClinicId.ToString(),
                OrderingFacilityName = "Clinic Operations Hub",
                TenantId = _clinicContext.TenantId,
                PrescriberDoctor = new ClinicEz.Shared.Interoperability.PrescriberDoctorDto
                {
                    DoctorId = encounter.DoctorId.ToString(),
                    DoctorName = encounter.DoctorName,
                    PrcLicenseNumber = encounter.DoctorPrcLicense ?? string.Empty,
                    PtrNumber = encounter.DoctorPtr,
                    S2LicenseNumber = encounter.DoctorS2License,
                    Specialization = doctor?.Specialty
                },
                Patient = new ClinicEz.Shared.Interoperability.PrescriptionPatientDto
                {
                    PatientId = encounter.PatientId,
                    FullName = encounter.PatientName,
                    Age = 35
                },
                ClinicalDiagnosis = encounter.Assessment,
                SpecialInstructions = encounter.Plan,
                PublicVerificationToken = encounter.RxPublicVerificationToken!,
                PublicVerificationUrl = $"/api/v1/public/rx-verify/{encounter.RxPublicVerificationToken}",
                QrPayload = $"CLINICEZ:RX:{encounter.PrescriptionNumber}:{encounter.RxPublicVerificationToken}",
                IssuedAt = encounter.SignedAt ?? DateTime.UtcNow,
                Items = encounter.Prescriptions.Select(p => new ClinicEz.Shared.Interoperability.PrescriptionItemDto
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

            _ = _prescriptionPublisher.PublishPrescriptionIssuedAsync(rxEvent, CancellationToken.None);
        }

        // Outbound push notification to patient-api
        var apptId = appointment?.Id ?? encounter.QueueItemId ?? encounter.Id;
        var scheduledAtStr = (appointment?.ScheduledAt ?? encounter.EncounterDate).ToString("O");
        var rxSummary = encounter.Prescriptions.Any()
            ? string.Join("; ", encounter.Prescriptions.Select(p => $"{p.GenericName} {p.Dosage} {p.Form} ({p.Sig}) - Qty: {p.Quantity}".Trim()))
            : null;
        var rxUrl = !string.IsNullOrWhiteSpace(encounter.RxPublicVerificationToken)
            ? $"/api/v1/public/rx-verify/{encounter.RxPublicVerificationToken}"
            : null;

        var pushPayload = new ClinicPushAppointmentsPayload(
            _clinicContext.ClinicId,
            encounter.PatientId,
            new List<ClinicAppointmentWebhookDto>
            {
                new(
                    apptId.ToString(),
                    _clinicContext.ClinicId.ToString(),
                    "Clinic Operational Facility",
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
                    PrescriptionPublicVerificationUrl: rxUrl
                )
            }
        );

        _ = _webhookNotifier.PushAppointmentUpdateAsync(pushPayload, CancellationToken.None);

        return MapToDto(encounter);
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
            encounter.PhilHealthCaseNo,
            encounter.PhilHealthSoapTransNo);
    }
}
