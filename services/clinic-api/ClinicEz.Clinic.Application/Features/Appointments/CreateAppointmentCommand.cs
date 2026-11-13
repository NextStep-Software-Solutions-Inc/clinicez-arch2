using System;
using System.Collections.Generic;
using System.Threading;
using System.Threading.Tasks;
using ClinicEz.Clinic.Application.Common.Interfaces;
using ClinicEz.Clinic.Application.Features.Appointments.Services;
using ClinicEz.Clinic.Domain.Entities;
using ClinicEz.Clinic.Domain.Enums;
using ClinicEz.Clinic.Domain.Interfaces;
using ClinicEz.Shared.Common;
using ClinicEz.Shared.Exceptions;
using ClinicEz.Shared.Interop;
using ClinicEz.Shared.Interop.Contracts;
using ClinicEz.Shared.Interoperability;
using MediatR;
using Microsoft.EntityFrameworkCore;

namespace ClinicEz.Clinic.Application.Features.Appointments;

public sealed record CreateAppointmentCommand(
    Guid PatientId,
    string PatientName,
    Guid? DoctorId,
    string? DoctorName,
    DateTime ScheduledAt,
    int DurationMinutes = 30,
    string? ServiceType = "Consultation",
    string? Reason = null,
    string? Notes = null,
    AppointmentType? AppointmentType = null,
    TeleconsultPaymentPolicy? PaymentPolicy = null) : IRequest<AppointmentDto>;

public sealed class CreateAppointmentCommandHandler : IRequestHandler<CreateAppointmentCommand, AppointmentDto>
{
    private readonly IRepository<Appointment> _appointmentRepo;
    private readonly IUnitOfWork _unitOfWork;
    private readonly IClinicContext _clinicContext;
    private readonly IAppointmentNotificationDispatcher? _dispatcher;
    private readonly IInteropPublisher? _publisher;
    private readonly IRepository<FacilitySettings>? _settingsRepo;
    private readonly IRepository<Invoice>? _invoiceRepo;
    private readonly IBillingRequestPublisher? _billingPublisher;

    public CreateAppointmentCommandHandler(
        IRepository<Appointment> appointmentRepo,
        IUnitOfWork unitOfWork,
        IClinicContext clinicContext,
        IAppointmentNotificationDispatcher? dispatcher = null,
        IInteropPublisher? publisher = null,
        IRepository<FacilitySettings>? settingsRepo = null,
        IRepository<Invoice>? invoiceRepo = null,
        IBillingRequestPublisher? billingPublisher = null)
    {
        _appointmentRepo = appointmentRepo;
        _unitOfWork = unitOfWork;
        _clinicContext = clinicContext;
        _dispatcher = dispatcher;
        _publisher = publisher;
        _settingsRepo = settingsRepo;
        _invoiceRepo = invoiceRepo;
        _billingPublisher = billingPublisher;
    }

    public async Task<AppointmentDto> Handle(CreateAppointmentCommand request, CancellationToken ct)
    {
        var duration = request.DurationMinutes > 0 ? request.DurationMinutes : 30;
        var scheduledStartUtc = request.ScheduledAt.ToUniversalTime();
        var scheduledEndUtc = scheduledStartUtc.AddMinutes(duration);

        if (request.DoctorId.HasValue)
        {
            var hasCollision = await _appointmentRepo.Query()
                .AnyAsync(a =>
                    a.ClinicId == _clinicContext.ClinicId &&
                    a.DoctorId == request.DoctorId &&
                    a.Status != AppointmentStatus.Cancelled &&
                    !a.IsDeleted &&
                    a.ScheduledAt < scheduledEndUtc &&
                    scheduledStartUtc < a.EndTimeUtc, ct);

            if (hasCollision)
            {
                throw new ConflictException("The selected doctor already has an appointment during this time window.");
            }
        }

        var isTeleconsultService =
            string.Equals(request.ServiceType, "Teleconsult", StringComparison.OrdinalIgnoreCase) ||
            string.Equals(request.ServiceType, "Teleconsultation", StringComparison.OrdinalIgnoreCase);

        var resolvedAppointmentType = request.AppointmentType
            ?? (isTeleconsultService ? AppointmentType.Teleconsult : AppointmentType.InPerson);

        var isTeleconsult = resolvedAppointmentType == AppointmentType.Teleconsult || isTeleconsultService;

        var appointmentId = Guid.NewGuid();
        Guid? callId = isTeleconsult ? Guid.NewGuid() : null;

        FacilitySettings? settings = null;
        if (isTeleconsult && _settingsRepo != null)
        {
            settings = await _settingsRepo.Query(s => s.ClinicId == _clinicContext.ClinicId)
                .FirstOrDefaultAsync(ct);
        }

        var defaultPolicyStr = settings?.TeleconsultPaymentPolicy ?? "Prepaid";
        var defaultPolicy = Enum.TryParse<TeleconsultPaymentPolicy>(defaultPolicyStr, true, out var pol)
            ? pol
            : TeleconsultPaymentPolicy.Prepaid;

        var paymentPolicy = request.PaymentPolicy ?? defaultPolicy;
        var paymentStatus = isTeleconsult
            ? (paymentPolicy == TeleconsultPaymentPolicy.Exempt ? TeleconsultPaymentStatus.Exempt : TeleconsultPaymentStatus.Pending)
            : TeleconsultPaymentStatus.Pending;

        Guid? invoiceId = null;
        Guid? invoiceRequestId = null;

        if (isTeleconsult && paymentPolicy == TeleconsultPaymentPolicy.Prepaid && _invoiceRepo != null)
        {
            var fee = settings?.TeleconsultDefaultFee ?? 400.00m;
            invoiceId = Guid.NewGuid();
            invoiceRequestId = invoiceId;

            var now = DateTime.UtcNow;
            var invoice = new Invoice
            {
                Id = invoiceId.Value,
                InvoiceNumber = $"INV-{now:yyyyMMdd}-{Guid.NewGuid().ToString("N")[..6].ToUpperInvariant()}",
                TenantId = _clinicContext.TenantId,
                ClinicId = _clinicContext.ClinicId,
                AppointmentId = appointmentId,
                PatientId = request.PatientId,
                PatientName = request.PatientName.Trim(),
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
                        InvoiceId = invoiceId.Value,
                        TenantId = _clinicContext.TenantId,
                        ClinicId = _clinicContext.ClinicId,
                        Description = "Teleconsultation Consultation Fee",
                        Category = "Teleconsultation",
                        UnitPrice = fee,
                        Quantity = 1,
                        TotalPrice = fee
                    }
                }
            };

            await _invoiceRepo.AddAsync(invoice, ct);

            if (string.Equals(settings?.CashierMode, "CashierCounter", StringComparison.OrdinalIgnoreCase))
            {
                invoice.BillingRequestedAt = now;
                var billingPayload = new BillingInvoiceRequestedPayload
                {
                    InvoiceRequestId = invoice.Id,
                    TenantId = _clinicContext.TenantId,
                    FacilityId = _clinicContext.ClinicId.ToString(),
                    FacilityType = FacilityType.Clinic,
                    BranchId = _clinicContext.BranchId?.ToString(),
                    PatientId = request.PatientId,
                    PatientName = request.PatientName.Trim(),
                    VisitKey = appointmentId.ToString(),
                    SourceType = "Teleconsult",
                    SourceId = appointmentId,
                    Lines = new List<BillingLineDto>
                    {
                        new BillingLineDto
                        {
                            Code = "TELECONSULT",
                            Description = "Teleconsultation Fee",
                            Quantity = 1,
                            UnitPrice = fee
                        }
                    }
                };

                if (_billingPublisher != null)
                {
                    await _billingPublisher.PublishInvoiceRequestedAsync(billingPayload, ct);
                }
                else if (_publisher != null && !string.IsNullOrWhiteSpace(_clinicContext.TenantId))
                {
                    var facilityId = _clinicContext.ClinicId.ToString();
                    _publisher.Enqueue(
                        InteropTypes.BillingInvoiceRequested,
                        Party.ForFacility(_clinicContext.TenantId, facilityId, FacilityType.Clinic),
                        Party.ForFacility(_clinicContext.TenantId, facilityId, FacilityType.Clinic, InteropServices.Billing),
                        invoice.Id,
                        billingPayload);
                }
            }
        }

        var appointment = new Appointment
        {
            Id = appointmentId,
            TenantId = _clinicContext.TenantId,
            ClinicId = _clinicContext.ClinicId,
            PatientId = request.PatientId,
            PatientName = request.PatientName.Trim(),
            DoctorId = request.DoctorId,
            DoctorName = request.DoctorName?.Trim(),
            ScheduledAt = scheduledStartUtc,
            DurationMinutes = duration,
            EndTimeUtc = scheduledEndUtc,
            Status = AppointmentStatus.Confirmed,
            AppointmentType = resolvedAppointmentType,
            ServiceType = request.ServiceType?.Trim() ?? (isTeleconsult ? "Teleconsult" : null),
            PaymentPolicy = paymentPolicy,
            PaymentStatus = paymentStatus,
            InvoiceId = invoiceId,
            InvoiceRequestId = invoiceRequestId,
            CallId = callId,
            Reason = request.Reason?.Trim(),
            Notes = request.Notes?.Trim(),
            CreatedAt = DateTime.UtcNow,
            CreatedBy = "ClinicStaff"
        };

        try
        {
            await _appointmentRepo.AddAsync(appointment, ct);
            if (_dispatcher != null)
            {
                await _dispatcher.DispatchAlertAsync(appointment, AppointmentAlertKinds.Booked, ct);
                await _dispatcher.DispatchStaffNotificationAsync(appointment, "booked", ct);
            }

            if (_publisher != null)
            {
                var grantId = CommsGrantIdGenerator.Create(appointment.TenantId, appointment.ClinicId.ToString(), "Appointment", appointment.Id.ToString());
                var from = Party.ForFacility(appointment.TenantId, appointment.ClinicId.ToString(), FacilityType.Clinic);
                var to = Party.ForFacility(appointment.TenantId, appointment.ClinicId.ToString(), FacilityType.Clinic, service: InteropServices.Comms);
                var grantPayload = new CommsEligibilityGrantedPayload(
                    GrantId: grantId,
                    TenantId: appointment.TenantId,
                    FacilityId: appointment.ClinicId.ToString(),
                    FacilityType: "Clinic",
                    PatientId: appointment.PatientId,
                    ContextType: "Appointment",
                    ContextId: appointment.Id.ToString(),
                    WindowStartUtc: DateTime.UtcNow,
                    WindowEndUtc: appointment.ScheduledAt.AddDays(7),
                    Version: 1);
                _publisher.Enqueue(InteropTypes.CommsEligibilityGranted, from, to, correlationId: grantId, grantPayload);
            }

            await _unitOfWork.SaveChangesAsync(ct);
        }
        catch (DbUpdateException ex) when (ex.InnerException is Npgsql.PostgresException { SqlState: "23P01" })
        {
            throw new ConflictException("The selected doctor already has an appointment during this time window.", ex);
        }

        return AppointmentDto.From(appointment);
    }
}
