using System;
using System.Linq;
using System.Text.Json;
using System.Threading;
using System.Threading.Tasks;
using ClinicEz.Clinic.Application.Common.Exceptions;
using ClinicEz.Clinic.Domain.Constants;
using ClinicEz.Clinic.Domain.Entities;
using ClinicEz.Clinic.Domain.Enums;
using ClinicEz.Clinic.Domain.Interfaces;
using ClinicEz.Shared.Common;
using ClinicEz.Shared.Exceptions;
using ClinicEz.Shared.Interop;
using ClinicEz.Shared.Interop.Contracts;
using MediatR;
using Microsoft.EntityFrameworkCore;
using Microsoft.Extensions.Logging;

namespace ClinicEz.Clinic.Application.Features.Teleconsult.Commands;

public sealed record EmergencyOverrideDto(
    string ReasonCode,
    string ReasonNote);

public sealed record AdmitTeleconsultPatientCommand(
    Guid AppointmentId,
    EmergencyOverrideDto? EmergencyOverride = null) : IRequest<TeleconsultAdmissionResultDto>;

public sealed record TeleconsultAdmissionResultDto(
    Guid AppointmentId,
    Guid CallId,
    string RoomName,
    DateTime AdmittedAtUtc,
    TeleconsultPaymentStatus PaymentStatus,
    bool IsEmergencyOverride);

public sealed class AdmitTeleconsultPatientCommandHandler : IRequestHandler<AdmitTeleconsultPatientCommand, TeleconsultAdmissionResultDto>
{
    private readonly IRepository<Appointment> _appointmentRepo;
    private readonly IRepository<ClinicPatient> _patientRepo;
    private readonly IRepository<ClinicAuditEntry> _auditRepo;
    private readonly IUnitOfWork _unitOfWork;
    private readonly IClinicContext _clinicContext;
    private readonly IInteropPublisher _publisher;
    private readonly ILogger<AdmitTeleconsultPatientCommandHandler> _logger;

    public AdmitTeleconsultPatientCommandHandler(
        IRepository<Appointment> appointmentRepo,
        IRepository<ClinicPatient> patientRepo,
        IRepository<ClinicAuditEntry> auditRepo,
        IUnitOfWork unitOfWork,
        IClinicContext clinicContext,
        IInteropPublisher publisher,
        ILogger<AdmitTeleconsultPatientCommandHandler> logger)
    {
        _appointmentRepo = appointmentRepo;
        _patientRepo = patientRepo;
        _auditRepo = auditRepo;
        _unitOfWork = unitOfWork;
        _clinicContext = clinicContext;
        _publisher = publisher;
        _logger = logger;
    }

    public async Task<TeleconsultAdmissionResultDto> Handle(AdmitTeleconsultPatientCommand request, CancellationToken ct)
    {
        var appointment = await _appointmentRepo.Query()
            .FirstOrDefaultAsync(a => a.Id == request.AppointmentId && a.ClinicId == _clinicContext.ClinicId && !a.IsDeleted, ct)
            ?? throw new NotFoundException($"Appointment {request.AppointmentId} not found.");

        if (!appointment.IsTeleconsult)
        {
            throw new BadRequestException("Appointment is not a teleconsultation; teleconsult admission gate does not apply.");
        }

        // 1. Evaluate PhilHealth Konsulta YAKAP Auto-Exemption
        if (appointment.PaymentStatus == TeleconsultPaymentStatus.Pending)
        {
            var patient = await _patientRepo.Query()
                .FirstOrDefaultAsync(p => p.Id == appointment.PatientId && p.ClinicId == _clinicContext.ClinicId, ct);
            if (patient != null)
            {
                var activeEnlistment = patient.GetActiveYakapEnlistment(appointment.ScheduledAt);
                if (activeEnlistment != null)
                {
                    appointment.PaymentPolicy = TeleconsultPaymentPolicy.Exempt;
                    appointment.PaymentStatus = TeleconsultPaymentStatus.Exempt;
                    appointment.PaymentMethod = "PhilHealthKonsulta";
                    _logger.LogInformation("[TeleconsultAdmission] Patient {PatientId} auto-exempted under PhilHealth Konsulta benefit year {Year}.",
                        patient.Id, activeEnlistment.EffectiveYear);
                }
            }
        }

        // 2. Prepayment Gate Enforcement
        if (appointment.PaymentPolicy == TeleconsultPaymentPolicy.Prepaid &&
            appointment.PaymentStatus != TeleconsultPaymentStatus.Paid &&
            appointment.PaymentStatus != TeleconsultPaymentStatus.Exempt &&
            appointment.PaymentStatus != TeleconsultPaymentStatus.Overridden)
        {
            // Check for Emergency Clinical Override
            if (request.EmergencyOverride != null)
            {
                // Validate clinician authority
                if (!_clinicContext.HasPermission(ClinicPermissions.ConsultationsSign))
                {
                    throw new ForbiddenException("Only attending clinicians or doctors with signing authority can authorize emergency clinical overrides.");
                }

                if (string.IsNullOrWhiteSpace(request.EmergencyOverride.ReasonCode))
                {
                    throw new BadRequestException("Emergency override reason code is mandatory.");
                }

                if (!EmergencyOverrideReasonCodes.Descriptions.ContainsKey(request.EmergencyOverride.ReasonCode.Trim()))
                {
                    throw new BadRequestException($"Emergency override reason code '{request.EmergencyOverride.ReasonCode}' is not a recognized statutory reason code.");
                }

                if (string.IsNullOrWhiteSpace(request.EmergencyOverride.ReasonNote) || request.EmergencyOverride.ReasonNote.Trim().Length < 5)
                {
                    throw new BadRequestException("Clinical reason note must provide substantive clinical justification (minimum 5 characters).");
                }

                var now = DateTime.UtcNow;
                var previousStatus = appointment.PaymentStatus;
                appointment.PaymentStatus = TeleconsultPaymentStatus.Overridden;
                appointment.IsEmergencyOverride = true;
                appointment.EmergencyOverrideReasonCode = request.EmergencyOverride.ReasonCode.Trim();
                appointment.EmergencyOverrideReasonNote = request.EmergencyOverride.ReasonNote.Trim();
                appointment.EmergencyOverrideDoctorId = _clinicContext.StaffId;
                appointment.EmergencyOverrideDoctorName = _clinicContext.StaffName ?? "Attending Clinician";
                appointment.EmergencyOverrideAtUtc = now;

                var callIdForOverride = appointment.CallId ?? Guid.NewGuid();
                appointment.CallId = callIdForOverride;

                // 3. Write Immutable WORM Audit Entry in ClinicAuditEntries
                var audit = new ClinicAuditEntry
                {
                    Id = Guid.NewGuid(),
                    TenantId = _clinicContext.TenantId,
                    ClinicId = _clinicContext.ClinicId,
                    Timestamp = now,
                    Category = ClinicAuditCategories.Clinical,
                    Severity = ClinicAuditSeverities.Emergency,
                    Action = "teleconsult.admission.emergency_override",
                    ActorStaffId = _clinicContext.StaffId,
                    ActorName = _clinicContext.StaffName ?? "Attending Clinician",
                    ActorRole = _clinicContext.HasPermission(ClinicPermissions.ConsultationsSign) ? "Doctor" : "Staff",
                    TargetEntityType = "Appointment",
                    TargetEntityId = appointment.Id.ToString(),
                    PatientId = appointment.PatientId,
                    PatientNameMasked = MaskName(appointment.PatientName),
                    Outcome = ClinicAuditOutcomes.Success,
                    Description = $"Emergency teleconsultation prepayment override authorized by {_clinicContext.StaffName}. Reason: [{request.EmergencyOverride.ReasonCode}] {request.EmergencyOverride.ReasonNote.Trim()}",
                    MetadataJson = JsonSerializer.Serialize(new
                    {
                        AppointmentId = appointment.Id,
                        CallId = callIdForOverride,
                        ReasonCode = request.EmergencyOverride.ReasonCode.Trim(),
                        ReasonNote = request.EmergencyOverride.ReasonNote.Trim(),
                        PreviousPaymentStatus = previousStatus.ToString(),
                        PaymentPolicy = appointment.PaymentPolicy.ToString(),
                        AuthorizedByStaffId = _clinicContext.StaffId,
                        AuthorizedAtUtc = now
                    }, InteropJson.Options)
                };

                await _auditRepo.AddAsync(audit, ct);

                // Publish comms.call.payment.cleared event
                _publisher.Enqueue(
                    InteropTypes.CommsCallPaymentCleared,
                    Party.ForFacility(_clinicContext.TenantId, _clinicContext.ClinicId.ToString(), FacilityType.Clinic),
                    Party.ForFacility(_clinicContext.TenantId, _clinicContext.ClinicId.ToString(), FacilityType.Clinic, InteropServices.Comms),
                    callIdForOverride,
                    new CommsCallPaymentClearedPayload(
                        callIdForOverride,
                        _clinicContext.TenantId,
                        _clinicContext.ClinicId.ToString(),
                        appointment.InvoiceId,
                        "EmergencyOverride",
                        now,
                        IsEmergencyOverride: true,
                        OverrideReason: $"{request.EmergencyOverride.ReasonCode}: {request.EmergencyOverride.ReasonNote.Trim()}"
                    ));

                _logger.LogWarning("[TeleconsultAdmission] Emergency override authorized for appointment {AppointmentId} by {DoctorName}. Reason: {ReasonCode}",
                    appointment.Id, _clinicContext.StaffName, request.EmergencyOverride.ReasonCode);
            }
            else
            {
                // Block admission with HTTP 409 payment_required
                throw new TeleconsultPaymentRequiredException(appointment.Id, appointment.PaidAmount ?? 400.00m);
            }
        }

        // 4. Finalize Admission
        var callId = appointment.CallId ?? Guid.NewGuid();
        appointment.CallId = callId;
        appointment.AdmittedAtUtc = DateTime.UtcNow;
        appointment.AdmittedByDoctorId = _clinicContext.StaffId;
        appointment.Status = AppointmentStatus.InConsultation;

        await _unitOfWork.SaveChangesAsync(ct);

        return new TeleconsultAdmissionResultDto(
            appointment.Id,
            callId,
            $"call-{callId:N}",
            appointment.AdmittedAtUtc.Value,
            appointment.PaymentStatus,
            appointment.IsEmergencyOverride);
    }

    private static string MaskName(string name)
    {
        if (string.IsNullOrWhiteSpace(name)) return "P***";
        var parts = name.Split(' ', StringSplitOptions.RemoveEmptyEntries);
        return string.Join(" ", parts.Select(p => p.Length > 1 ? $"{p[0]}***" : p));
    }
}
