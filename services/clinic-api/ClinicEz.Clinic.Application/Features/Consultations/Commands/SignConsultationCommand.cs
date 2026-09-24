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

    public SignConsultationCommandHandler(
        IRepository<ConsultationEncounter> consultationRepository,
        IRepository<StaffMember> staffRepository,
        IRepository<QueueItem> queueRepository,
        IRepository<Appointment> appointmentRepository,
        IUnitOfWork unitOfWork,
        IClinicContext clinicContext,
        IPatientWebhookNotifier webhookNotifier)
    {
        _consultationRepository = consultationRepository;
        _staffRepository = staffRepository;
        _queueRepository = queueRepository;
        _appointmentRepository = appointmentRepository;
        _unitOfWork = unitOfWork;
        _clinicContext = clinicContext;
        _webhookNotifier = webhookNotifier;
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

        // Outbound push notification to patient-api
        var apptId = appointment?.Id ?? encounter.QueueItemId ?? encounter.Id;
        var scheduledAtStr = (appointment?.ScheduledAt ?? encounter.EncounterDate).ToString("O");
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
                    encounter.Assessment
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
            encounter.Prescriptions.Select(p => new PrescriptionItemDto(p.Id, p.GenericName, p.BrandName, p.Dosage, p.Form, p.Sig, p.Quantity, p.DurationDays, p.Refills, p.IsDangerousDrug, p.Remarks)).ToList());
    }
}
