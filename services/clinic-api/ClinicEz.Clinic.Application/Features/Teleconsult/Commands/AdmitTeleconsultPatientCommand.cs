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
    string? ReasonCode = null,
    string? ReasonNote = null);

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
    private readonly IRepository<Patient> _patientRepo;
    private readonly IRepository<AuditEntry> _auditRepo;
    private readonly IUnitOfWork _unitOfWork;
    private readonly IClinicContext _clinicContext;
    private readonly IInteropPublisher _publisher;
    private readonly ILogger<AdmitTeleconsultPatientCommandHandler> _logger;

    public AdmitTeleconsultPatientCommandHandler(
        IRepository<Appointment> appointmentRepo,
        IRepository<Patient> patientRepo,
        IRepository<AuditEntry> auditRepo,
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

        // 1. Prepayment Gate Enforcement (Active YAKAP is informational only and does not auto-mutate policy)
        if (appointment.PaymentPolicy == TeleconsultPaymentPolicy.Prepaid &&
            appointment.PaymentStatus != TeleconsultPaymentStatus.Paid &&
            appointment.PaymentStatus != TeleconsultPaymentStatus.Exempt &&
            appointment.PaymentStatus != TeleconsultPaymentStatus.Overridden)
        {
            // Check for Emergency Clinical Override
            if (request.EmergencyOverride != null)
            {
                // Validate staff authority: allow ConsultationsSign OR ConsultationsWrite
                if (!_clinicContext.HasPermission(ClinicPermissions.ConsultationsSign) &&
                    !_clinicContext.HasPermission(ClinicPermissions.ConsultationsWrite))
                {
                    throw new ForbiddenException("Only attending clinicians or staff with consultation authority can authorize emergency clinical overrides.");
                }

                var reasonNote = request.EmergencyOverride.ReasonNote?.Trim();
                if (string.IsNullOrWhiteSpace(reasonNote) || reasonNote.Length < 5)
                {
                    throw new BadRequestException("Clinical reason note must provide substantive clinical justification (minimum 5 characters).");
                }

                // Default missing, empty, or unrecognized reason code to STAFF-OVERRIDE
                var rawCode = request.EmergencyOverride.ReasonCode?.Trim();
                var reasonCode = string.IsNullOrWhiteSpace(rawCode) ||
                                 (!EmergencyOverrideReasonCodes.Descriptions.ContainsKey(rawCode) && rawCode != "STAFF-OVERRIDE")
                    ? "STAFF-OVERRIDE"
                    : rawCode;

                var now = DateTime.UtcNow;
                var previousStatus = appointment.PaymentStatus;
                appointment.PaymentStatus = TeleconsultPaymentStatus.Overridden;
                appointment.IsEmergencyOverride = true;
                appointment.EmergencyOverrideReasonCode = reasonCode;
                appointment.EmergencyOverrideReasonNote = reasonNote;
                appointment.EmergencyOverrideDoctorId = _clinicContext.StaffId;
                appointment.EmergencyOverrideDoctorName = _clinicContext.StaffName ?? "Attending Clinician";
                appointment.EmergencyOverrideAtUtc = now;

                var callIdForOverride = appointment.CallId ?? Guid.NewGuid();
                appointment.CallId = callIdForOverride;

                // 2. Write Immutable WORM Audit Entry in ClinicAuditEntries
                var audit = new AuditEntry
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
                    Description = $"Emergency teleconsultation prepayment override authorized by {_clinicContext.StaffName}. Reason: [{reasonCode}] {reasonNote}",
                    MetadataJson = JsonSerializer.Serialize(new
                    {
                        AppointmentId = appointment.Id,
                        CallId = callIdForOverride,
                        ReasonCode = reasonCode,
                        ReasonNote = reasonNote,
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
                        OverrideReason: $"{reasonCode}: {reasonNote}"
                    ));

                _logger.LogWarning("[TeleconsultAdmission] Emergency override authorized for appointment {AppointmentId} by {DoctorName}. Reason: {ReasonCode}",
                    appointment.Id, _clinicContext.StaffName, reasonCode);
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
