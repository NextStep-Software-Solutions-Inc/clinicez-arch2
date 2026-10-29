using System;
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
    bool IsYakapExempt,
    Guid? CallId,
    bool IsEmergencyOverride,
    string? EmergencyOverrideReasonCode);

public sealed record GetTeleconsultStatusQuery(Guid AppointmentId) : IRequest<TeleconsultStatusDto>;

public sealed class GetTeleconsultStatusQueryHandler : IRequestHandler<GetTeleconsultStatusQuery, TeleconsultStatusDto>
{
    private readonly IRepository<Appointment> _appointmentRepo;
    private readonly IRepository<Patient> _patientRepo;
    private readonly IClinicContext _clinicContext;

    public GetTeleconsultStatusQueryHandler(
        IRepository<Appointment> appointmentRepo,
        IRepository<Patient> patientRepo,
        IClinicContext clinicContext)
    {
        _appointmentRepo = appointmentRepo;
        _patientRepo = patientRepo;
        _clinicContext = clinicContext;
    }

    public async Task<TeleconsultStatusDto> Handle(GetTeleconsultStatusQuery request, CancellationToken ct)
    {
        var appointment = await _appointmentRepo.Query()
            .FirstOrDefaultAsync(a => a.Id == request.AppointmentId && a.ClinicId == _clinicContext.ClinicId && !a.IsDeleted, ct)
            ?? throw new NotFoundException($"Appointment {request.AppointmentId} not found.");

        var patient = await _patientRepo.Query()
            .FirstOrDefaultAsync(p => p.Id == appointment.PatientId && p.ClinicId == _clinicContext.ClinicId, ct);

        var activeEnlistment = patient?.GetActiveYakapEnlistment(appointment.ScheduledAt);
        var isYakapExempt = activeEnlistment != null;

        var canAdmit = appointment.PaymentPolicy != TeleconsultPaymentPolicy.Prepaid
            || appointment.PaymentStatus is TeleconsultPaymentStatus.Paid or TeleconsultPaymentStatus.Exempt or TeleconsultPaymentStatus.Overridden
            || isYakapExempt;

        return new TeleconsultStatusDto(
            appointment.Id,
            appointment.PatientId,
            appointment.PatientName,
            appointment.ScheduledAt,
            appointment.AppointmentType,
            appointment.PaymentPolicy,
            appointment.PaymentStatus,
            canAdmit,
            isYakapExempt,
            appointment.CallId,
            appointment.IsEmergencyOverride,
            appointment.EmergencyOverrideReasonCode
        );
    }
}
