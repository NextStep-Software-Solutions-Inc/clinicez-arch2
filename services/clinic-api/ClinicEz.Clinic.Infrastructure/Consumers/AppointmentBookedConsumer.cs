using System;
using System.Threading.Tasks;
using ClinicEz.Clinic.Domain.Entities;
using ClinicEz.Clinic.Domain.Enums;
using ClinicEz.Clinic.Domain.Interfaces;
using ClinicEz.Clinic.Infrastructure.Persistence;
using ClinicEz.Shared.Common;
using MassTransit;
using Microsoft.EntityFrameworkCore;
using Microsoft.Extensions.Logging;

namespace ClinicEz.Clinic.Infrastructure.Consumers;

public sealed class AppointmentBookedConsumer : IConsumer<AppointmentBookedEvent>
{
    private readonly ApplicationDbContext _dbContext;
    private readonly IClinicContext _clinicContext;
    private readonly ILogger<AppointmentBookedConsumer> _logger;

    public AppointmentBookedConsumer(
        ApplicationDbContext dbContext,
        IClinicContext clinicContext,
        ILogger<AppointmentBookedConsumer> logger)
    {
        _dbContext = dbContext;
        _clinicContext = clinicContext;
        _logger = logger;
    }

    public async Task Consume(ConsumeContext<AppointmentBookedEvent> context)
    {
        var message = context.Message;

        // Clinic jurisdiction validation: Only ingest appointments intended for this clinic facility
        if (_clinicContext.ClinicId != Guid.Empty && message.ClinicId != _clinicContext.ClinicId)
        {
            _logger.LogInformation(
                "[AppointmentBookedConsumer] Ignoring event for clinic {MessageClinicId}, current clinic is {CurrentClinicId}",
                message.ClinicId, _clinicContext.ClinicId);
            return;
        }

        _logger.LogInformation(
            "[AppointmentBookedConsumer] Ingesting appointment booking Draft {DraftId} for Patient {PatientId} at Clinic {ClinicId}",
            message.DraftId, message.PatientId, message.ClinicId);

        // Check if already ingested idempotently
        var existing = await _dbContext.Appointments
            .IgnoreQueryFilters()
            .FirstOrDefaultAsync(a => a.DraftId == message.DraftId, context.CancellationToken);

        if (existing != null)
        {
            _logger.LogInformation("[AppointmentBookedConsumer] Appointment for draft {DraftId} already exists ({Id}). Skipping.", message.DraftId, existing.Id);
            return;
        }

        // Parse scheduled time
        var scheduledAt = DateTime.UtcNow;
        if (message.PreferredDate.HasValue)
        {
            var date = message.PreferredDate.Value;
            if (!string.IsNullOrWhiteSpace(message.PreferredTime) &&
                TimeOnly.TryParse(message.PreferredTime, out var parsedTime))
            {
                scheduledAt = new DateTime(date.Year, date.Month, date.Day, parsedTime.Hour, parsedTime.Minute, 0, DateTimeKind.Utc);
            }
            else
            {
                scheduledAt = new DateTime(date.Year, date.Month, date.Day, 9, 0, 0, DateTimeKind.Utc);
            }
        }

        var appointment = new Appointment
        {
            Id = Guid.NewGuid(),
            DraftId = message.DraftId,
            TenantId = message.TenantId ?? _clinicContext.TenantId,
            ClinicId = message.ClinicId,
            PatientId = message.PatientId,
            PatientName = $"Patient-{message.PatientId.ToString()[..8]}", // Enriched name or identifier
            ScheduledAt = scheduledAt,
            DurationMinutes = 30,
            Status = AppointmentStatus.Confirmed,
            Reason = message.Reason ?? "General Consultation",
            Notes = message.Notes,
            ShareFieldsJson = message.ShareFieldsJson,
            AttachedFileIdsJson = message.AttachedFileIdsJson,
            CreatedAt = message.CreatedAt,
            CreatedBy = "System:PatientBookingEvent"
        };

        await _dbContext.Appointments.AddAsync(appointment, context.CancellationToken);
        await _dbContext.SaveChangesAsync(context.CancellationToken);

        _logger.LogInformation("[AppointmentBookedConsumer] Ingested appointment {AppointmentId} successfully", appointment.Id);
    }
}
