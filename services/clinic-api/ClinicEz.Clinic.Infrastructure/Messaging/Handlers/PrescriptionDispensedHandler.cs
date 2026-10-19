using System;
using System.Threading;
using System.Threading.Tasks;
using ClinicEz.Clinic.Domain.Enums;
using ClinicEz.Clinic.Infrastructure.Persistence;
using ClinicEz.Shared.Interop;
using ClinicEz.Shared.Interop.Handling;
using ClinicEz.Shared.Interoperability;
using Microsoft.EntityFrameworkCore;
using Microsoft.Extensions.Logging;

namespace ClinicEz.Clinic.Infrastructure.Messaging;

/// <summary>
/// Records that a partner pharmacy dispensed a prescription (<c>rx.dispensed</c>). The consultation is identified
/// only by the envelope correlation id (the prescription id the clinic issued); the prescription number is a
/// display value and is never used to match. Re-applying the same dispense is a no-op.
/// </summary>
public sealed class PrescriptionDispensedHandler : IInteropHandler<PrescriptionDispensedEvent>
{
    private readonly ApplicationDbContext _dbContext;
    private readonly ClinicRecipientResolver _recipient;
    private readonly ILogger<PrescriptionDispensedHandler> _logger;

    public PrescriptionDispensedHandler(
        ApplicationDbContext dbContext,
        ClinicRecipientResolver recipient,
        ILogger<PrescriptionDispensedHandler> logger)
    {
        _dbContext = dbContext;
        _recipient = recipient;
        _logger = logger;
    }

    public async Task HandleAsync(PrescriptionDispensedEvent message, InteropMessageContext context, CancellationToken ct)
    {
        var clinic = await _recipient.ResolveAsync(context, ct);
        if (clinic == null) return;

        var prescriptionId = context.CorrelationId;
        if (message.PrescriptionId != Guid.Empty && message.PrescriptionId != prescriptionId)
        {
            _logger.LogWarning(
                "[ClinicEz.Clinic] Ignoring dispense {MessageId}: prescription {PayloadPrescriptionId} does not match correlation {CorrelationId}.",
                context.MessageId, message.PrescriptionId, prescriptionId);
            return;
        }

        _logger.LogInformation("[ClinicEz.Clinic] Ingesting PrescriptionDispensedEvent for prescription {PrescriptionId} from Pharmacy {PharmacyName}",
            prescriptionId, message.PharmacyFacilityName);

        var encounter = await _dbContext.Consultations
            .IgnoreQueryFilters()
            .FirstOrDefaultAsync(e => !e.IsDeleted && e.ClinicId == clinic.ClinicId && e.Id == prescriptionId, ct);

        if (encounter == null)
        {
            _logger.LogWarning("[ClinicEz.Clinic] Consultation encounter for prescription {PrescriptionId} not found in clinic {ClinicId}. Skipping.",
                prescriptionId, clinic.ClinicId);
            return;
        }

        encounter.RxStage = RxStage.Dispensed;
        encounter.RxStageReportedAt = message.DispensedAt;
        encounter.RxDispenseStatus = PrescriptionDispenseStatus.DispensedAtPartnerPharmacy;
        encounter.RxDispensedPharmacyName = message.PharmacyFacilityName;
        encounter.RxDispensedPharmacistName = message.DispensingPharmacistName;
        encounter.RxDispensedPharmacistPrc = message.DispensingPharmacistPrcLicense;
        encounter.RxDispensedReceiptNumber = message.ReceiptNumber;
        encounter.RxDispensedAt = message.DispensedAt;
        encounter.RxNotes = $"Dispensed ₱{message.TotalAmount:N2}. {message.Notes}".Trim();
        encounter.UpdatedAt = DateTime.UtcNow;

        await _dbContext.SaveChangesAsync(ct);

        _logger.LogInformation("[ClinicEz.Clinic] Successfully updated EMR with partner pharmacy dispense record for prescription {PrescriptionId}",
            prescriptionId);
    }
}
