using System;
using System.Collections.Generic;
using System.Linq;
using System.Text.Json;
using System.Threading;
using System.Threading.Tasks;
using ClinicEz.Clinic.Application.Features.Teleconsult.Queries;
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

public sealed record UpdateTeleconsultPaymentPolicyCommand(
    Guid AppointmentId,
    TeleconsultPaymentPolicy PaymentPolicy) : IRequest<TeleconsultStatusDto>;

public sealed class UpdateTeleconsultPaymentPolicyCommandHandler : IRequestHandler<UpdateTeleconsultPaymentPolicyCommand, TeleconsultStatusDto>
{
    private readonly IRepository<Appointment> _appointmentRepo;
    private readonly IRepository<Invoice> _invoiceRepo;
    private readonly IRepository<FacilitySettings> _settingsRepo;
    private readonly IRepository<Patient> _patientRepo;
    private readonly IRepository<AuditEntry> _auditRepo;
    private readonly IUnitOfWork _unitOfWork;
    private readonly IClinicContext _clinicContext;
    private readonly IInteropPublisher _publisher;
    private readonly ILogger<UpdateTeleconsultPaymentPolicyCommandHandler> _logger;
    private readonly IRepository<TeleconsultRecordingSession>? _sessionRepo;

    public UpdateTeleconsultPaymentPolicyCommandHandler(
        IRepository<Appointment> appointmentRepo,
        IRepository<Invoice> invoiceRepo,
        IRepository<FacilitySettings> settingsRepo,
        IRepository<Patient> patientRepo,
        IRepository<AuditEntry> auditRepo,
        IUnitOfWork unitOfWork,
        IClinicContext clinicContext,
        IInteropPublisher publisher,
        ILogger<UpdateTeleconsultPaymentPolicyCommandHandler> logger,
        IRepository<TeleconsultRecordingSession>? sessionRepo = null)
    {
        _appointmentRepo = appointmentRepo;
        _invoiceRepo = invoiceRepo;
        _settingsRepo = settingsRepo;
        _patientRepo = patientRepo;
        _auditRepo = auditRepo;
        _unitOfWork = unitOfWork;
        _clinicContext = clinicContext;
        _publisher = publisher;
        _logger = logger;
        _sessionRepo = sessionRepo;
    }

    public async Task<TeleconsultStatusDto> Handle(UpdateTeleconsultPaymentPolicyCommand request, CancellationToken ct)
    {
        // 1. Check permissions: AppointmentsManage or ConsultationsWrite required
        if (!_clinicContext.HasPermission(ClinicPermissions.AppointmentsManage) &&
            !_clinicContext.HasPermission(ClinicPermissions.ConsultationsWrite))
        {
            throw new ForbiddenException("Staff requires either appointments:manage or consultations:write permission to update teleconsult payment policy.");
        }

        // 2. Load appointment by ID scoped to current clinic tenant
        var appointment = await _appointmentRepo.Query()
            .FirstOrDefaultAsync(a => a.Id == request.AppointmentId && a.ClinicId == _clinicContext.ClinicId && !a.IsDeleted, ct)
            ?? throw new NotFoundException($"Appointment {request.AppointmentId} not found.");

        if (!appointment.IsTeleconsult)
        {
            throw new BadRequestException("Appointment is not a teleconsultation; payment policy cannot be updated.");
        }

        var previousPolicy = appointment.PaymentPolicy;
        var now = DateTime.UtcNow;

        // Ensure call ID exists for correlation
        var callId = appointment.CallId ?? Guid.NewGuid();
        appointment.CallId = callId;

        // 3. State transition logic
        switch (request.PaymentPolicy)
        {
            case TeleconsultPaymentPolicy.Exempt:
                appointment.PaymentPolicy = TeleconsultPaymentPolicy.Exempt;
                appointment.PaymentStatus = TeleconsultPaymentStatus.Exempt;

                // Emit CommsCallPaymentCleared event
                _publisher.Enqueue(
                    InteropTypes.CommsCallPaymentCleared,
                    Party.ForFacility(_clinicContext.TenantId, _clinicContext.ClinicId.ToString(), FacilityType.Clinic),
                    Party.ForFacility(_clinicContext.TenantId, _clinicContext.ClinicId.ToString(), FacilityType.Clinic, InteropServices.Comms),
                    callId,
                    new CommsCallPaymentClearedPayload(
                        callId,
                        _clinicContext.TenantId,
                        _clinicContext.ClinicId.ToString(),
                        appointment.InvoiceId,
                        "PolicyExempt",
                        now,
                        IsEmergencyOverride: false,
                        OverrideReason: null
                    ));
                break;

            case TeleconsultPaymentPolicy.Postpaid:
                appointment.PaymentPolicy = TeleconsultPaymentPolicy.Postpaid;
                if (appointment.PaymentStatus != TeleconsultPaymentStatus.Paid)
                {
                    appointment.PaymentStatus = TeleconsultPaymentStatus.Pending;
                }
                break;

            case TeleconsultPaymentPolicy.Prepaid:
                appointment.PaymentPolicy = TeleconsultPaymentPolicy.Prepaid;
                if (appointment.PaymentStatus != TeleconsultPaymentStatus.Paid &&
                    appointment.PaymentStatus != TeleconsultPaymentStatus.Overridden)
                {
                    appointment.PaymentStatus = TeleconsultPaymentStatus.Pending;
                }

                if (appointment.InvoiceId == null)
                {
                    var settings = await _settingsRepo.Query(s => s.ClinicId == _clinicContext.ClinicId)
                        .FirstOrDefaultAsync(ct);
                    var fee = settings?.TeleconsultDefaultFee ?? 400.00m;

                    var invoice = new Invoice
                    {
                        Id = Guid.NewGuid(),
                        InvoiceNumber = $"INV-{now:yyyyMMdd}-{Guid.NewGuid().ToString("N")[..6].ToUpperInvariant()}",
                        TenantId = _clinicContext.TenantId,
                        ClinicId = _clinicContext.ClinicId,
                        AppointmentId = appointment.Id,
                        PatientId = appointment.PatientId,
                        PatientName = appointment.PatientName,
                        GrossAmount = fee,
                        NetAmount = fee,
                        BalanceDue = fee,
                        AmountPaid = 0m,
                        Status = InvoiceStatus.Draft,
                        InvoiceDate = now,
                        BilledByStaffId = _clinicContext.StaffId,
                        BilledByStaffName = _clinicContext.StaffName,
                        LineItems = new List<InvoiceLineItem>
                        {
                            new InvoiceLineItem
                            {
                                Id = Guid.NewGuid(),
                                Description = "Teleconsultation Consultation Fee",
                                Category = "Teleconsultation",
                                UnitPrice = fee,
                                Quantity = 1,
                                TotalPrice = fee
                            }
                        }
                    };

                    await _invoiceRepo.AddAsync(invoice, ct);
                    appointment.InvoiceId = invoice.Id;
                    appointment.InvoiceRequestId = invoice.Id;
                }
                break;

            default:
                throw new BadRequestException($"Unsupported payment policy: {request.PaymentPolicy}");
        }

        // 4. Record WORM audit entry
        var audit = new AuditEntry
        {
            Id = Guid.NewGuid(),
            TenantId = _clinicContext.TenantId,
            ClinicId = _clinicContext.ClinicId,
            Timestamp = now,
            Category = ClinicAuditCategories.Appointments,
            Severity = ClinicAuditSeverities.Routine,
            Action = "teleconsult.payment_policy.updated",
            ActorStaffId = _clinicContext.StaffId,
            ActorName = _clinicContext.StaffName ?? "Clinic Staff",
            ActorRole = _clinicContext.StaffRole ?? "Staff",
            TargetEntityType = "Appointment",
            TargetEntityId = appointment.Id.ToString(),
            PatientId = appointment.PatientId,
            PatientNameMasked = MaskName(appointment.PatientName),
            Outcome = ClinicAuditOutcomes.Success,
            Description = $"Teleconsultation payment policy for appointment {appointment.Id} updated from {previousPolicy} to {request.PaymentPolicy} by {_clinicContext.StaffName ?? "Staff"}.",
            MetadataJson = JsonSerializer.Serialize(new
            {
                AppointmentId = appointment.Id,
                PreviousPolicy = previousPolicy.ToString(),
                NewPolicy = request.PaymentPolicy.ToString(),
                PaymentStatus = appointment.PaymentStatus.ToString(),
                InvoiceId = appointment.InvoiceId,
                UpdatedByStaffId = _clinicContext.StaffId,
                UpdatedAtUtc = now
            }, InteropJson.Options)
        };

        await _auditRepo.AddAsync(audit, ct);

        // 5. Persist changes
        await _unitOfWork.SaveChangesAsync(ct);

        _logger.LogInformation(
            "[TeleconsultPolicy] Appointment {AppointmentId} policy changed from {OldPolicy} to {NewPolicy}. Status: {Status}.",
            appointment.Id, previousPolicy, appointment.PaymentPolicy, appointment.PaymentStatus);

        // 6. Project and return updated TeleconsultStatusDto
        var patient = await _patientRepo.Query()
            .FirstOrDefaultAsync(p => p.Id == appointment.PatientId && p.ClinicId == _clinicContext.ClinicId, ct);
        var activeEnlistment = patient?.GetActiveYakapEnlistment(appointment.ScheduledAt);
        var hasActiveYakapEnlistment = activeEnlistment != null;

        var canAdmit = appointment.PaymentPolicy != TeleconsultPaymentPolicy.Prepaid
            || appointment.PaymentStatus is TeleconsultPaymentStatus.Paid or TeleconsultPaymentStatus.Exempt or TeleconsultPaymentStatus.Overridden;

        var currentSettings = await _settingsRepo.Query(s => s.ClinicId == _clinicContext.ClinicId).FirstOrDefaultAsync(ct);
        var recordingPolicy = currentSettings?.TeleconsultRecordingPolicy ?? "Disabled";
        var recordingConsentRequired = currentSettings?.TeleconsultRecordingConsentRequired ?? true;

        Guid? activeRecordingSessionId = null;
        if (_sessionRepo != null)
        {
            var session = await _sessionRepo.Query(s =>
                !s.IsDeleted && !s.IsPurged && s.ClinicId == _clinicContext.ClinicId &&
                ((appointment.CallId.HasValue && s.CallId == appointment.CallId.Value) ||
                 (s.AppointmentId.HasValue && s.AppointmentId.Value == appointment.Id)) &&
                s.RecordingState != "Completed" && s.RecordingState != "Aborted" && s.RecordingState != "Purged")
                .OrderByDescending(s => s.StartedAtUtc ?? s.CreatedAt)
                .FirstOrDefaultAsync(ct);
            activeRecordingSessionId = session?.Id;
        }

        return new TeleconsultStatusDto(
            appointment.Id,
            appointment.PatientId,
            appointment.PatientName,
            appointment.ScheduledAt,
            appointment.AppointmentType,
            appointment.PaymentPolicy,
            appointment.PaymentStatus,
            canAdmit,
            hasActiveYakapEnlistment,
            appointment.CallId,
            appointment.IsEmergencyOverride,
            appointment.EmergencyOverrideReasonCode,
            appointment.InvoiceId,
            recordingPolicy,
            recordingConsentRequired,
            activeRecordingSessionId
        );
    }

    private static string MaskName(string name)
    {
        if (string.IsNullOrWhiteSpace(name)) return "P***";
        var parts = name.Split(' ', StringSplitOptions.RemoveEmptyEntries);
        return string.Join(" ", parts.Select(p => p.Length > 1 ? $"{p[0]}***" : p));
    }
}
