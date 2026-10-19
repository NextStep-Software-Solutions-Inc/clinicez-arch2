using System;
using System.Linq;
using System.Threading;
using System.Threading.Tasks;
using ClinicEz.Clinic.Application.Common.DTOs;
using ClinicEz.Clinic.Application.Common.Interfaces;
using ClinicEz.Clinic.Infrastructure.Messaging;
using ClinicEz.Shared.Interop;
using ClinicEz.Shared.Interoperability;
using Microsoft.Extensions.Logging;

namespace ClinicEz.Clinic.Infrastructure.Services;

public sealed class PatientAppointmentPublisher : IPatientAppointmentPublisher
{
    private readonly IInteropPublisher _publisher;
    private readonly ClinicPatientAddressResolver _addresses;
    private readonly ILogger<PatientAppointmentPublisher> _logger;

    public PatientAppointmentPublisher(
        IInteropPublisher publisher,
        ClinicPatientAddressResolver addresses,
        ILogger<PatientAppointmentPublisher> logger)
    {
        _publisher = publisher;
        _addresses = addresses;
        _logger = logger;
    }

    public async Task<bool> PublishAppointmentUpdatedAsync(ClinicPushAppointmentsPayload payload, CancellationToken cancellationToken = default)
    {
        var address = await _addresses.ResolveAsync(payload.ClinicId, payload.PatientId, cancellationToken);
        if (address == null)
        {
            _logger.LogInformation(
                "Appointment updated for clinic patient {PatientId}; the patient has no patient-app account to notify.",
                payload.PatientId);
            return false;
        }

        var updated = new ClinicAppointmentUpdatedEvent
        {
            ClinicId = payload.ClinicId,
            TenantId = address.Clinic.TenantId,
            PatientId = address.SyncPatientId,
            Appointments = payload.Appointments.Select(ToSnapshot).ToList()
        };

        var firstId = payload.Appointments.Count > 0 ? payload.Appointments[0].Id : null;
        var correlationId = Guid.TryParse(firstId, out var appointmentId) ? appointmentId : Guid.NewGuid();

        _publisher.Enqueue(InteropTypes.ClinicAppointmentUpdated, address.From, address.To, correlationId, updated);
        return true;
    }

    private static ClinicAppointmentSnapshotDto ToSnapshot(ClinicAppointmentWebhookDto a) => new()
    {
        Id = a.Id,
        ClinicId = a.ClinicId,
        ClinicName = a.ClinicName,
        Provider = new ClinicAppointmentProviderDto
        {
            Id = a.Provider.Id,
            Name = a.Provider.Name,
            Specialty = a.Provider.Specialty,
            AvatarUrl = a.Provider.AvatarUrl
        },
        ServiceType = a.ServiceType,
        ScheduledAt = a.ScheduledAt,
        DurationMinutes = a.DurationMinutes,
        Status = a.Status,
        Notes = a.Notes,
        Subject = a.Subject,
        ChiefComplaint = a.ChiefComplaint,
        ClinicalAssessment = a.ClinicalAssessment,
        DoctorPlan = a.DoctorPlan,
        PrescriptionsSummary = a.PrescriptionsSummary,
        PrescriptionPublicVerificationUrl = a.PrescriptionPublicVerificationUrl,
        DraftId = a.DraftId
    };
}
