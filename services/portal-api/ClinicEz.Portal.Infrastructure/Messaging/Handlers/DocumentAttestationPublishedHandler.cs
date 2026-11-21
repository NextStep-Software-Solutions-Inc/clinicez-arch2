using System;
using System.Threading;
using System.Threading.Tasks;
using ClinicEz.Portal.Application.Interfaces;
using ClinicEz.Portal.Domain.Entities;
using ClinicEz.Shared.Common;
using ClinicEz.Shared.Interop;
using ClinicEz.Shared.Interop.Handling;
using ClinicEz.Shared.Interoperability;
using Microsoft.EntityFrameworkCore;
using Microsoft.Extensions.Logging;

namespace ClinicEz.Portal.Infrastructure.Messaging.Handlers;

/// <summary>
/// Handles <c>document.attestation.published</c> (<c>InteropTypes.DocumentAttestationPublished</c>).
/// Idempotently upserts zero-PHI document attestation projections for public QR verification and prescription dispense validation.
/// </summary>
public sealed class DocumentAttestationPublishedHandler(
    IApplicationDbContext dbContext,
    ILogger<DocumentAttestationPublishedHandler> logger) : IInteropHandler<DocumentAttestationPublishedPayload>
{
    public async Task HandleAsync(DocumentAttestationPublishedPayload payload, InteropMessageContext context, CancellationToken ct)
    {
        var sender = context.From;
        if (sender.Kind != PartyKind.Facility
            || !Guid.TryParse(sender.TenantId, out var senderTenantId)
            || !Guid.TryParse(sender.FacilityId, out var senderFacilityId)
            || !Guid.TryParse(payload.TenantId, out var payloadTenantId)
            || senderTenantId != payloadTenantId
            || senderFacilityId != payload.FacilityId)
        {
            logger.LogWarning("Ignoring document.attestation.published from {Sender}: sender does not match facility {FacilityId} / tenant {TenantId}.",
                sender.Address, payload.FacilityId, payload.TenantId);
            return;
        }

        var normalizedKind = payload.DocumentKind.Trim().ToLowerInvariant();
        var normalizedTokenHash = string.IsNullOrWhiteSpace(payload.VerificationTokenHash)
            ? null
            : payload.VerificationTokenHash.Trim().ToLowerInvariant();

        var existing = await dbContext.DocumentAttestations
            .FirstOrDefaultAsync(d =>
                d.TenantId == payloadTenantId &&
                d.FacilityId == payload.FacilityId &&
                d.DocumentKind == normalizedKind &&
                d.SourceDocumentId == payload.SourceDocumentId, ct);

        if (existing is null)
        {
            var attestation = new DocumentAttestation
            {
                Id = Guid.NewGuid(),
                TenantId = payloadTenantId,
                FacilityId = payload.FacilityId,
                DocumentKind = normalizedKind,
                SourceDocumentId = payload.SourceDocumentId,
                DocumentNumber = payload.DocumentNumber.Trim(),
                SecurityDigest = payload.SecurityDigest.Trim(),
                VerificationTokenHash = normalizedTokenHash,
                ClinicName = payload.ClinicName,
                ClinicAddress = payload.ClinicAddress,
                ClinicContact = payload.ClinicContact,
                DoctorName = payload.DoctorName,
                DoctorPrcLicense = payload.DoctorPrcLicense,
                DoctorPtr = payload.DoctorPtr,
                DoctorS2License = payload.DoctorS2License,
                IssuedAtUtc = payload.IssuedAtUtc,
                ExpiresAtUtc = payload.ExpiresAtUtc,
                Status = payload.Status,
                IsAlreadyDispensed = payload.IsAlreadyDispensed,
                DispenseStatus = payload.DispenseStatus,
                DispensedPharmacyName = payload.DispensedPharmacyName,
                DispensedAtUtc = payload.DispensedAtUtc,
                HasDangerousDrug = payload.HasDangerousDrug,
                ItemCount = payload.ItemCount
            };
            dbContext.DocumentAttestations.Add(attestation);
        }
        else
        {
            existing.DocumentNumber = payload.DocumentNumber.Trim();
            existing.SecurityDigest = payload.SecurityDigest.Trim();
            if (!string.IsNullOrWhiteSpace(normalizedTokenHash))
                existing.VerificationTokenHash = normalizedTokenHash;

            existing.ClinicName = payload.ClinicName;
            existing.ClinicAddress = payload.ClinicAddress ?? existing.ClinicAddress;
            existing.ClinicContact = payload.ClinicContact ?? existing.ClinicContact;
            existing.DoctorName = payload.DoctorName ?? existing.DoctorName;
            existing.DoctorPrcLicense = payload.DoctorPrcLicense ?? existing.DoctorPrcLicense;
            existing.DoctorPtr = payload.DoctorPtr ?? existing.DoctorPtr;
            existing.DoctorS2License = payload.DoctorS2License ?? existing.DoctorS2License;
            existing.ExpiresAtUtc = payload.ExpiresAtUtc ?? existing.ExpiresAtUtc;
            existing.Status = payload.Status;
            existing.IsAlreadyDispensed = payload.IsAlreadyDispensed || existing.IsAlreadyDispensed;

            if (!string.IsNullOrWhiteSpace(payload.DispenseStatus))
                existing.DispenseStatus = payload.DispenseStatus;

            if (!string.IsNullOrWhiteSpace(payload.DispensedPharmacyName))
                existing.DispensedPharmacyName = payload.DispensedPharmacyName;

            if (payload.DispensedAtUtc.HasValue)
                existing.DispensedAtUtc = payload.DispensedAtUtc;

            existing.HasDangerousDrug = payload.HasDangerousDrug;
            existing.ItemCount = payload.ItemCount;
        }

        await dbContext.SaveChangesAsync(ct);
        logger.LogInformation("Successfully ingested DocumentAttestation {Kind}/{Number} for Facility {FacilityId}.",
            normalizedKind, payload.DocumentNumber, payload.FacilityId);
    }
}
