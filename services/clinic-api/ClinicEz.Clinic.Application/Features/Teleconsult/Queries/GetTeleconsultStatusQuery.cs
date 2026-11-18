using System;
using System.Linq;
using System.Threading;
using System.Threading.Tasks;
using ClinicEz.Clinic.Domain.Entities;
using ClinicEz.Clinic.Domain.Enums;
using ClinicEz.Clinic.Domain.Interfaces;
using ClinicEz.Shared.Exceptions;
using ClinicEz.Shared.Interop.Contracts;
using MediatR;
using Microsoft.EntityFrameworkCore;

namespace ClinicEz.Clinic.Application.Features.Teleconsult.Queries;

public sealed record TeleconsultStatusDto(
    Guid AppointmentId,
    Guid PatientId,
    string PatientName,
    DateTime ScheduledAt,
    AppointmentType AppointmentType,
    TeleconsultPaymentPolicy PaymentPolicy,
    TeleconsultPaymentStatus PaymentStatus,
    bool CanAdmit,
    bool HasActiveYakapEnlistment,
    Guid? CallId,
    bool IsEmergencyOverride,
    string? EmergencyOverrideReasonCode,
    Guid? InvoiceId = null,
    string RecordingPolicy = "Disabled",
    bool RecordingConsentRequired = true,
    Guid? ActiveRecordingSessionId = null)
{
    /// <summary>Backward compatibility alias for legacy consumers.</summary>
    public bool IsYakapExempt => HasActiveYakapEnlistment;
}

public sealed record GetTeleconsultStatusQuery(Guid AppointmentId) : IRequest<TeleconsultStatusDto>;

public sealed class GetTeleconsultStatusQueryHandler : IRequestHandler<GetTeleconsultStatusQuery, TeleconsultStatusDto>
{
    private readonly IRepository<Appointment> _appointmentRepo;
    private readonly IRepository<Patient> _patientRepo;
    private readonly IClinicContext _clinicContext;
    private readonly IRepository<FacilitySettings>? _settingsRepo;
    private readonly IRepository<TeleconsultRecordingSession>? _sessionRepo;
    private readonly IRepository<Invoice>? _invoiceRepo;

    public GetTeleconsultStatusQueryHandler(
        IRepository<Appointment> appointmentRepo,
        IRepository<Patient> patientRepo,
        IClinicContext clinicContext)
        : this(appointmentRepo, patientRepo, clinicContext, null, null, null)
    {
    }

    public GetTeleconsultStatusQueryHandler(
        IRepository<Appointment> appointmentRepo,
        IRepository<Patient> patientRepo,
        IClinicContext clinicContext,
        IRepository<FacilitySettings>? settingsRepo,
        IRepository<TeleconsultRecordingSession>? sessionRepo = null,
        IRepository<Invoice>? invoiceRepo = null)
    {
        _appointmentRepo = appointmentRepo;
        _patientRepo = patientRepo;
        _clinicContext = clinicContext;
        _settingsRepo = settingsRepo;
        _sessionRepo = sessionRepo;
        _invoiceRepo = invoiceRepo;
    }

    public async Task<TeleconsultStatusDto> Handle(GetTeleconsultStatusQuery request, CancellationToken ct)
    {
        var appointment = await _appointmentRepo.Query()
            .FirstOrDefaultAsync(a => a.Id == request.AppointmentId && a.ClinicId == _clinicContext.ClinicId && !a.IsDeleted, ct)
            ?? throw new NotFoundException($"Appointment {request.AppointmentId} not found.");

        var patient = await _patientRepo.Query()
            .FirstOrDefaultAsync(p => p.Id == appointment.PatientId && p.ClinicId == _clinicContext.ClinicId, ct);

        var activeEnlistment = patient?.GetActiveYakapEnlistment(appointment.ScheduledAt);
        var hasActiveYakapEnlistment = activeEnlistment != null;

        // Active YAKAP is informational only; it does NOT auto-grant admission
        var canAdmit = appointment.PaymentPolicy != TeleconsultPaymentPolicy.Prepaid
            || appointment.PaymentStatus is TeleconsultPaymentStatus.Paid or TeleconsultPaymentStatus.Exempt or TeleconsultPaymentStatus.Overridden;

        var invoiceId = appointment.InvoiceId;
        if (!invoiceId.HasValue && _invoiceRepo != null)
        {
            invoiceId = await _invoiceRepo.Query(i => !i.IsDeleted && i.ClinicId == _clinicContext.ClinicId && i.AppointmentId == appointment.Id)
                .Select(i => (Guid?)i.Id)
                .FirstOrDefaultAsync(ct);
        }

        var settings = _settingsRepo != null
            ? await _settingsRepo.Query(s => s.ClinicId == _clinicContext.ClinicId).FirstOrDefaultAsync(ct)
            : null;
        var recordingPolicy = settings?.TeleconsultRecordingPolicy ?? "Disabled";
        var recordingConsentRequired = settings?.TeleconsultRecordingConsentRequired ?? true;

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
            invoiceId,
            recordingPolicy,
            recordingConsentRequired,
            activeRecordingSessionId
        );
    }
}
