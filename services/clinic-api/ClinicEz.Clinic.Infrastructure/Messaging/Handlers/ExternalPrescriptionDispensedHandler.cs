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
/// Records that the patient had a prescription filled outside ClinicEZ (<c>rx.external.dispensed</c>). The prescription is the
/// consultation whose id is the envelope correlation id inside the addressed (ordering) clinic, and only the patient it was
/// issued to may report it. A dispense by a ClinicEZ partner pharmacy is authoritative and is never overwritten; reporting the
/// same fill again is a no-op. The receipt link in the message is time-limited, so only the receipt number is kept.
/// </summary>
public sealed class ExternalPrescriptionDispensedHandler : IInteropHandler<ExternalPrescriptionDispensedEvent>
{
    private readonly ApplicationDbContext _dbContext;
    private readonly ClinicRecipientResolver _recipient;
    private readonly ILogger<ExternalPrescriptionDispensedHandler> _logger;

    public ExternalPrescriptionDispensedHandler(
        ApplicationDbContext dbContext,
        ClinicRecipientResolver recipient,
        ILogger<ExternalPrescriptionDispensedHandler> logger)
    {
        _dbContext = dbContext;
        _recipient = recipient;
        _logger = logger;
    }

    public async Task HandleAsync(ExternalPrescriptionDispensedEvent message, InteropMessageContext context, CancellationToken ct)
    {
        var clinic = await _recipient.ResolveAsync(context, ct);
        if (clinic == null) return;

        if (context.From.Kind != PartyKind.Patient || !Guid.TryParse(context.From.PatientId, out var senderPatientId))
        {
            Ignore(context, "the sender is not a patient");
            return;
        }

        var prescriptionId = context.CorrelationId;
        if (message.PrescriptionId != prescriptionId)
        {
            Ignore(context, $"prescription {message.PrescriptionId} does not match correlation {prescriptionId}");
            return;
        }

        var encounter = await _dbContext.Consultations
            .IgnoreQueryFilters()
            .FirstOrDefaultAsync(e => !e.IsDeleted && e.ClinicId == clinic.ClinicId && e.Id == prescriptionId, ct);
        if (encounter == null)
        {
            Ignore(context, $"prescription {prescriptionId} is unknown to clinic {clinic.ClinicId}");
            return;
        }

        var patientIsOwner = await _dbContext.Patients
            .IgnoreQueryFilters()
            .AnyAsync(p => !p.IsDeleted && p.ClinicId == clinic.ClinicId && p.Id == encounter.PatientId && p.SyncPatientId == senderPatientId, ct);
        if (!patientIsOwner)
        {
            Ignore(context, "the prescription was not issued to the sender");
            return;
        }

        if (encounter.RxDispenseStatus is PrescriptionDispenseStatus.DispensedAtPartnerPharmacy
            or PrescriptionDispenseStatus.DispensedExternally
            or PrescriptionDispenseStatus.Cancelled)
        {
            Ignore(context, $"prescription {prescriptionId} is already {encounter.RxDispenseStatus}");
            return;
        }

        var pharmacy = string.IsNullOrWhiteSpace(message.ExternalBranchLocation)
            ? message.ExternalPharmacyName
            : $"{message.ExternalPharmacyName} ({message.ExternalBranchLocation})";

        encounter.RxDispenseStatus = PrescriptionDispenseStatus.DispensedExternally;
        encounter.RxDispensedPharmacyName = pharmacy;
        encounter.RxDispensedPharmacistName = message.PharmacistName;
        encounter.RxDispensedPharmacistPrc = message.PharmacistPrcLicense;
        encounter.RxDispensedReceiptNumber = message.OfficialReceiptNumber;
        encounter.RxDispensedAt = message.DispensedAt;
        encounter.RxNotes = $"Filled outside Clinic EZ, reported by the patient. {message.Notes}".Trim();
        encounter.UpdatedAt = DateTime.UtcNow;

        await _dbContext.SaveChangesAsync(ct);

        _logger.LogInformation("[ClinicEz.Clinic] Prescription {PrescriptionId} was dispensed externally at {Pharmacy}.", prescriptionId, pharmacy);
    }

    private void Ignore(InteropMessageContext context, string reason) =>
        _logger.LogWarning("[ClinicEz.Clinic] Ignoring {Type} message {MessageId}: {Reason}.", context.Type, context.MessageId, reason);
}
