using System;
using System.Threading;
using System.Threading.Tasks;
using ClinicEz.Patient.Domain.Entities;
using ClinicEz.Patient.Domain.Enums;
using ClinicEz.Patient.Infrastructure.Persistence;
using ClinicEz.Shared.Interop;
using ClinicEz.Shared.Interop.Contracts;
using ClinicEz.Shared.Interop.Handling;
using Microsoft.EntityFrameworkCore;
using Microsoft.Extensions.Logging;

namespace ClinicEz.Patient.Infrastructure.Interop;

/// <summary>
/// Handles <c>clinical.immunization.administered</c>: clinic administered a vaccine or documented
/// an immunization for this patient. Upserts the patient's lifelong immunization record.
/// </summary>
public sealed class ClinicalImmunizationAdministeredInteropHandler : IInteropHandler<ClinicalImmunizationAdministeredPayload>
{
    private readonly ApplicationDbContext _dbContext;
    private readonly ILogger<ClinicalImmunizationAdministeredInteropHandler> _logger;

    public ClinicalImmunizationAdministeredInteropHandler(
        ApplicationDbContext dbContext,
        ILogger<ClinicalImmunizationAdministeredInteropHandler> logger)
    {
        _dbContext = dbContext;
        _logger = logger;
    }

    public async Task HandleAsync(ClinicalImmunizationAdministeredPayload message, InteropMessageContext context, CancellationToken ct)
    {
        if (context.To.Kind != PartyKind.Patient || context.To.PatientId != message.PatientId.ToString())
        {
            _logger.LogWarning(
                "Ignoring clinical.immunization.administered {MessageId} from {Sender} to {Recipient}: recipient does not match patient {PatientId}.",
                context.MessageId, context.From.Address, context.To.Address, message.PatientId);
            return;
        }

        var patientExists = await _dbContext.Patients.AnyAsync(p => p.Id == message.PatientId, ct);
        if (!patientExists)
        {
            _logger.LogWarning("Patient {PatientId} not found for clinical.immunization.administered {MessageId}.", message.PatientId, context.MessageId);
            return;
        }

        var serverId = message.ImmunizationId.ToString();

        // Idempotent upsert into VaccinationAdministered
        var existingAdministered = await _dbContext.VaccinationsAdministered
            .FirstOrDefaultAsync(v => v.ServerId == serverId && v.PatientId == message.PatientId, ct);

        var adminDate = DateOnly.FromDateTime(message.AdministeredAtUtc);

        if (existingAdministered == null)
        {
            var record = new VaccinationAdministered
            {
                Id = Guid.NewGuid(),
                PatientId = message.PatientId,
                ClinicId = message.ClinicId,
                VaccineName = message.VaccineName,
                DiseaseTargeted = message.PhilHealthLibrary,
                DoseNumber = message.DoseSequence.ToString(),
                DateAdministered = adminDate,
                LotBatchNumber = message.LotBatchNumber,
                AdministeredBy = message.AdministeredByStaffName,
                Facility = message.HistoricalFacilityName,
                Route = message.Route,
                InjectionSite = message.InjectionSite,
                SyncedAt = DateTime.UtcNow,
                ServerId = serverId
            };
            _dbContext.VaccinationsAdministered.Add(record);
        }
        else
        {
            existingAdministered.VaccineName = message.VaccineName;
            existingAdministered.DateAdministered = adminDate;
            existingAdministered.LotBatchNumber = message.LotBatchNumber;
            existingAdministered.AdministeredBy = message.AdministeredByStaffName;
            existingAdministered.SyncedAt = DateTime.UtcNow;
        }

        // Also ensure PatientImmunizationSelf has the entry
        var existingSelf = await _dbContext.PatientImmunizationsSelf
            .FirstOrDefaultAsync(s => s.PatientId == message.PatientId && s.LotNumber == message.LotBatchNumber && s.VaccineName == message.VaccineName, ct);

        if (existingSelf == null)
        {
            _dbContext.PatientImmunizationsSelf.Add(new PatientImmunizationSelf
            {
                Id = Guid.NewGuid(),
                PatientId = message.PatientId,
                ClientId = Guid.NewGuid(),
                VaccineName = message.VaccineName,
                DoseNumber = message.DoseSequence.ToString(),
                LotNumber = message.LotBatchNumber,
                Date = adminDate,
                AdministeredBy = message.AdministeredByStaffName
            });
        }

        // Notification for the patient
        var notificationSourceId = message.ImmunizationId.ToString();
        var notificationPayload = $"{{\"immunizationId\":\"{message.ImmunizationId}\",\"vaccine\":\"{message.VaccineName}\"}}";
        var alreadyNotified = await _dbContext.Notifications.AnyAsync(
            n => n.PatientId == message.PatientId && n.SourceId == notificationSourceId, ct);

        if (!alreadyNotified)
        {
            _dbContext.Notifications.Add(new Notification
            {
                Id = Guid.NewGuid(),
                PatientId = message.PatientId,
                Title = "New Immunization Record",
                Body = $"A new vaccination record ({message.VaccineName}, Dose {message.DoseSequence}) has been added to your health chart.",
                SourceId = notificationSourceId,
                Type = NotificationType.System,
                Category = NotificationCategory.System,
                Payload = notificationPayload,
                CreatedAt = DateTime.UtcNow
            });
        }

        await _dbContext.SaveChangesAsync(ct);
        _logger.LogInformation("Successfully ingested immunization {ImmunizationId} for patient {PatientId}.", message.ImmunizationId, message.PatientId);
    }
}
