using System;
using System.Security.Cryptography;
using System.Text;
using System.Threading;
using System.Threading.Tasks;
using ClinicEz.Clinic.Application.Common.Interfaces;
using ClinicEz.Clinic.Domain.Entities;
using ClinicEz.Clinic.Domain.Enums;
using ClinicEz.Clinic.Infrastructure.Persistence;
using ClinicEz.Shared.Interop;
using ClinicEz.Shared.Interop.Handling;
using ClinicEz.Shared.Interoperability;
using Microsoft.EntityFrameworkCore;
using Microsoft.Extensions.Logging;

namespace ClinicEz.Clinic.Infrastructure.Messaging;

/// <summary>
/// Records that a prescription was filled outside ClinicEZ (<c>rx.external.dispensed</c>).
/// Accepts messages from:
/// 1. Patient: reporting their own fill (verified against SyncPatientId).
/// 2. Portal: relayed from an external pharmacy dropzone (verified via constant-time token check and optional encrypted receipt).
/// </summary>
public sealed class ExternalPrescriptionDispensedHandler : IInteropHandler<ExternalPrescriptionDispensedEvent>
{
    private readonly ApplicationDbContext _dbContext;
    private readonly ClinicRecipientResolver _recipient;
    private readonly ILogger<ExternalPrescriptionDispensedHandler> _logger;
    private readonly IRecordAttachmentStorage? _attachmentStorage;

    public ExternalPrescriptionDispensedHandler(
        ApplicationDbContext dbContext,
        ClinicRecipientResolver recipient,
        ILogger<ExternalPrescriptionDispensedHandler> logger)
        : this(dbContext, recipient, logger, null)
    {
    }

    public ExternalPrescriptionDispensedHandler(
        ApplicationDbContext dbContext,
        ClinicRecipientResolver recipient,
        ILogger<ExternalPrescriptionDispensedHandler> logger,
        IRecordAttachmentStorage? attachmentStorage)
    {
        _dbContext = dbContext;
        _recipient = recipient;
        _logger = logger;
        _attachmentStorage = attachmentStorage;
    }

    public async Task HandleAsync(ExternalPrescriptionDispensedEvent message, InteropMessageContext context, CancellationToken ct)
    {
        var clinic = await _recipient.ResolveAsync(context, ct);
        if (clinic == null) return;

        // 1. Patient reporting branch (100% backward compatible for Phase3FlowsTests)
        if (context.From.Kind == PartyKind.Patient)
        {
            if (!Guid.TryParse(context.From.PatientId, out var senderPatientId))
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
            return;
        }

        // 2. Portal dispense relay branch
        if (context.From == Party.Portal || (context.From.Kind == PartyKind.ControlPlane && context.From.Service == InteropServices.Portal))
        {
            ConsultationEncounter? encounter = null;
            if (message.PrescriptionId != Guid.Empty)
            {
                encounter = await _dbContext.Consultations
                    .IgnoreQueryFilters()
                    .FirstOrDefaultAsync(e => !e.IsDeleted && e.ClinicId == clinic.ClinicId && e.Id == message.PrescriptionId, ct);
            }
            else if (context.CorrelationId != Guid.Empty)
            {
                encounter = await _dbContext.Consultations
                    .IgnoreQueryFilters()
                    .FirstOrDefaultAsync(e => !e.IsDeleted && e.ClinicId == clinic.ClinicId && e.Id == context.CorrelationId, ct);
            }

            if (encounter == null && !string.IsNullOrWhiteSpace(message.VerificationToken))
            {
                var tokenCandidate = message.VerificationToken.Trim();
                encounter = await _dbContext.Consultations
                    .IgnoreQueryFilters()
                    .FirstOrDefaultAsync(e => !e.IsDeleted && e.ClinicId == clinic.ClinicId && e.RxPublicVerificationToken == tokenCandidate, ct);
            }

            if (encounter == null)
            {
                Ignore(context, $"prescription is unknown to clinic {clinic.ClinicId}");
                return;
            }

            // Constant-time cryptographic verification token check
            if (string.IsNullOrWhiteSpace(message.VerificationToken) || string.IsNullOrWhiteSpace(encounter.RxPublicVerificationToken))
            {
                Ignore(context, "verification token is missing");
                return;
            }

            var tokenBytes = Encoding.UTF8.GetBytes(message.VerificationToken.Trim());
            var expectedBytes = Encoding.UTF8.GetBytes(encounter.RxPublicVerificationToken.Trim());
            if (!CryptographicOperations.FixedTimeEquals(tokenBytes, expectedBytes))
            {
                Ignore(context, "verification token mismatch");
                return;
            }

            if (encounter.RxDispenseStatus is PrescriptionDispenseStatus.DispensedAtPartnerPharmacy
                or PrescriptionDispenseStatus.DispensedExternally
                or PrescriptionDispenseStatus.Cancelled)
            {
                Ignore(context, $"prescription {encounter.Id} is already {encounter.RxDispenseStatus}");
                return;
            }

            var pharmacy = string.IsNullOrWhiteSpace(message.ExternalBranchLocation)
                ? message.ExternalPharmacyName
                : $"{message.ExternalPharmacyName} ({message.ExternalBranchLocation})";

            // Encrypt and persist receipt under CMK if provided
            if (!string.IsNullOrWhiteSpace(message.ReceiptDocumentBase64) && _attachmentStorage != null)
            {
                try
                {
                    var receiptBytes = Convert.FromBase64String(message.ReceiptDocumentBase64);
                    if (receiptBytes.Length > 0)
                    {
                        var fileName = string.IsNullOrWhiteSpace(message.ReceiptFileName)
                            ? $"dispense-receipt-{encounter.PrescriptionNumber ?? encounter.Id.ToString("N")[..8]}.jpg"
                            : message.ReceiptFileName.Trim();
                        var contentType = string.IsNullOrWhiteSpace(message.ReceiptContentType)
                            ? "image/jpeg"
                            : message.ReceiptContentType.Trim();

                        var attachment = await _attachmentStorage.EncryptAndStoreAsync(
                            clinic.TenantId,
                            clinic.ClinicId,
                            encounter.PatientId,
                            encounter.Id,
                            fileName,
                            contentType,
                            receiptBytes,
                            "Receipt",
                            $"Prescription dispense official receipt #{message.OfficialReceiptNumber ?? "N/A"} from {pharmacy}",
                            "External Pharmacy Portal",
                            ct);

                        encounter.RxDispensedReceiptUrl = attachment.StorageUri;
                    }
                }
                catch (FormatException)
                {
                    _logger.LogWarning("[ClinicEz.Clinic] Failed to decode base64 receipt for prescription {PrescriptionId}.", encounter.Id);
                }
            }
            else if (!string.IsNullOrWhiteSpace(message.ReceiptDocumentUrl))
            {
                encounter.RxDispensedReceiptUrl = message.ReceiptDocumentUrl;
            }

            encounter.RxDispenseStatus = PrescriptionDispenseStatus.DispensedExternally;
            encounter.RxDispensedPharmacyName = pharmacy;
            encounter.RxDispensedPharmacistName = message.PharmacistName;
            encounter.RxDispensedPharmacistPrc = message.PharmacistPrcLicense;
            encounter.RxDispensedReceiptNumber = message.OfficialReceiptNumber;
            encounter.RxDispensedAt = message.DispensedAt;
            encounter.RxNotes = $"Filled outside Clinic EZ, relayed via Portal. {message.Notes}".Trim();
            encounter.UpdatedAt = DateTime.UtcNow;

            await _dbContext.SaveChangesAsync(ct);

            _logger.LogInformation("[ClinicEz.Clinic] Prescription {PrescriptionId} was dispensed externally via portal relay at {Pharmacy}.", encounter.Id, pharmacy);
            return;
        }

        Ignore(context, "the sender is neither a patient nor the portal");
    }

    private void Ignore(InteropMessageContext context, string reason) =>
        _logger.LogWarning("[ClinicEz.Clinic] Ignoring {Type} message {MessageId}: {Reason}.", context.Type, context.MessageId, reason);
}
