using System;
using System.Collections.Generic;
using System.Linq;
using System.Security.Cryptography;
using System.Text;
using System.Threading;
using System.Threading.Tasks;
using ClinicEz.Clinic.Application.Common.Helpers;
using ClinicEz.Clinic.Domain.Entities;
using ClinicEz.Clinic.Domain.Enums;
using ClinicEz.Clinic.Infrastructure.Persistence;
using ClinicEz.Shared.Common;
using ClinicEz.Shared.Documents.Security;
using ClinicEz.Shared.Interop;
using ClinicEz.Shared.Interop.Persistence;
using ClinicEz.Shared.Interoperability;
using Microsoft.EntityFrameworkCore;
using Microsoft.EntityFrameworkCore.ChangeTracking;
using Microsoft.EntityFrameworkCore.Diagnostics;

namespace ClinicEz.Clinic.Infrastructure.Persistence.Interceptors;

public sealed class ClinicPortalProjectionInterceptor : SaveChangesInterceptor
{
    private readonly IDocumentSecurityService _securityService;

    public ClinicPortalProjectionInterceptor(IDocumentSecurityService? securityService = null)
    {
        _securityService = securityService ?? new DocumentSecurityService();
    }

    public override InterceptionResult<int> SavingChanges(DbContextEventData eventData, InterceptionResult<int> result)
    {
        StageProjectionsAsync(eventData.Context, CancellationToken.None).GetAwaiter().GetResult();
        return result;
    }

    public override async ValueTask<InterceptionResult<int>> SavingChangesAsync(
        DbContextEventData eventData,
        InterceptionResult<int> result,
        CancellationToken cancellationToken = default)
    {
        await StageProjectionsAsync(eventData.Context, cancellationToken);
        return result;
    }

    private async Task StageProjectionsAsync(DbContext? context, CancellationToken cancellationToken)
    {
        if (context is not ApplicationDbContext db) return;

        db.ChangeTracker.DetectChanges();

        var settingEntries = db.ChangeTracker.Entries<FacilitySettings>()
            .Where(e => e.State is EntityState.Added or EntityState.Modified or EntityState.Deleted)
            .ToList();

        var queueEntries = db.ChangeTracker.Entries<QueueItem>()
            .Where(e => e.State is EntityState.Added or EntityState.Modified or EntityState.Deleted)
            .ToList();

        var medCertEntries = db.ChangeTracker.Entries<MedicalCertificate>()
            .Where(e => e.State is EntityState.Added or EntityState.Modified or EntityState.Deleted)
            .ToList();

        var referralEntries = db.ChangeTracker.Entries<ReferralLetter>()
            .Where(e => e.State is EntityState.Added or EntityState.Modified or EntityState.Deleted)
            .ToList();

        var encounterEntries = db.ChangeTracker.Entries<ConsultationEncounter>()
            .Where(e => e.State is EntityState.Added or EntityState.Modified or EntityState.Deleted)
            .ToList();

        var labOrderEntries = db.ChangeTracker.Entries<LabOrder>()
            .Where(e => e.State is EntityState.Added or EntityState.Modified or EntityState.Deleted)
            .ToList();

        var invoiceEntries = db.ChangeTracker.Entries<Invoice>()
            .Where(e => e.State is EntityState.Added or EntityState.Modified or EntityState.Deleted)
            .ToList();

        if (settingEntries.Count == 0 && queueEntries.Count == 0 &&
            medCertEntries.Count == 0 && referralEntries.Count == 0 &&
            encounterEntries.Count == 0 && labOrderEntries.Count == 0 &&
            invoiceEntries.Count == 0)
        {
            return;
        }

        var publisher = new InteropPublisher(db);
        var clinicSettingsCache = new Dictionary<Guid, FacilitySettings>();

        // Cache existing outbox correlations already queued in this transaction to prevent duplicates
        var alreadyStaged = db.ChangeTracker.Entries<InteropOutboxMessage>()
            .Where(e => e.State == EntityState.Added)
            .Select(e => (e.Entity.Type, e.Entity.CorrelationId))
            .ToHashSet();

        // 1. Process ClinicSettings -> FacilityJoinSettingsUpdated
        foreach (var entry in settingEntries)
        {
            var settings = entry.Entity;
            clinicSettingsCache[settings.ClinicId] = settings;

            if (entry.State == EntityState.Deleted) continue;

            // Prefix auto-generated join code with 4-char clinic discriminator if un-prefixed
            var discriminator = settings.ClinicId.ToString("N")[..4].ToUpperInvariant();
            if (!string.IsNullOrWhiteSpace(settings.JoinCode) && !settings.JoinCode.Contains('-'))
            {
                settings.JoinCode = $"{discriminator}-{settings.JoinCode.Trim().ToUpperInvariant()}";
            }

            if (alreadyStaged.Contains((InteropTypes.FacilityJoinSettingsUpdated, settings.ClinicId)))
            {
                continue;
            }

            var joinPayload = new FacilityJoinSettingsUpdatedPayload
            {
                TenantId = settings.TenantId,
                FacilityId = settings.ClinicId,
                IsJoinEnabled = settings.IsJoinEnabled,
                JoinCode = settings.JoinCode,
                JoinCodeExpiresAtUtc = settings.JoinCodeExpiresAt,
                FacilityAddress = settings.LetterheadAddress,
                OperatingHours = settings.OperatingHours,
                UpdatedAtUtc = DateTime.UtcNow
            };

            publisher.Enqueue(
                InteropTypes.FacilityJoinSettingsUpdated,
                Party.ForFacility(settings.TenantId, settings.ClinicId.ToString(), FacilityType.Clinic),
                Party.Portal,
                settings.ClinicId,
                joinPayload);

            alreadyStaged.Add((InteropTypes.FacilityJoinSettingsUpdated, settings.ClinicId));
        }

        // 2. Process QueueItems & ClinicSettings -> QueueBoardUpdated (Zero PHI, Manila Day)
        var affectedClinicsForQueue = queueEntries.Select(q => (q.Entity.TenantId, q.Entity.ClinicId))
            .Concat(settingEntries.Select(s => (s.Entity.TenantId, s.Entity.ClinicId)))
            .Distinct()
            .ToList();

        if (affectedClinicsForQueue.Count > 0)
        {
            var tz = ClinicTimeZoneResolver.ResolveTimeZone("Asia/Manila");
            var todayManila = DateOnly.FromDateTime(TimeZoneInfo.ConvertTimeFromUtc(DateTime.UtcNow, tz));

            foreach (var (tenantId, clinicId) in affectedClinicsForQueue)
            {
                var settings = await GetClinicSettingsAsync(db, clinicId, clinicSettingsCache, cancellationToken);
                var isAcceptingWalkIns = settings == null || !settings.IsOnlineBookingPaused;

                // Load existing persisted tickets for today Manila
                var dbTickets = await db.QueueItems.IgnoreQueryFilters().AsNoTracking()
                    .Where(q => q.ClinicId == clinicId && q.QueueDate == todayManila && !q.IsDeleted)
                    .ToListAsync(cancellationToken);

                // Overlay change tracker modifications
                var activeTickets = dbTickets.ToDictionary(t => t.Id);

                foreach (var qEntry in queueEntries.Where(e => e.Entity.ClinicId == clinicId))
                {
                    if (qEntry.State == EntityState.Deleted || qEntry.Entity.IsDeleted)
                    {
                        activeTickets.Remove(qEntry.Entity.Id);
                    }
                    else if (qEntry.Entity.QueueDate == todayManila)
                    {
                        activeTickets[qEntry.Entity.Id] = qEntry.Entity;
                    }
                }

                var allTickets = activeTickets.Values.ToList();

                var nowServing = allTickets
                    .Where(q => q.Status == QueueStatus.InConsultation)
                    .OrderByDescending(q => q.CalledTime ?? DateTime.MinValue)
                    .ThenBy(q => q.SequenceNumber)
                    .Select(q => new QueueBoardServingItemDto
                    {
                        QueueItemId = q.Id,
                        TicketNumber = q.QueueNumber,
                        DoctorName = q.DoctorName,
                        RoomOrStation = q.RoomOrStation,
                        CalledTime = q.CalledTime,
                        Status = q.Status.ToString()
                    })
                    .ToList();

                var upNext = allTickets
                    .Where(q => q.Status != QueueStatus.Diverted &&
                                q.Status != QueueStatus.DischargedNonDoctor &&
                                ((q.VisitType == VisitType.Consultation &&
                                  (q.Status == QueueStatus.Waiting || q.Status == QueueStatus.Triaged || q.Status == QueueStatus.OnHold))
                                 || q.Status == QueueStatus.PendingProcedure
                                 || q.Status == QueueStatus.ReEvaluation))
                    .OrderByDescending(q => q.Priority)
                    .ThenBy(q => q.SequenceNumber)
                    .Select(q => new QueueBoardUpcomingItemDto
                    {
                        QueueItemId = q.Id,
                        TicketNumber = q.QueueNumber,
                        DisplayName = null, // STRICT ZERO PHI ENFORCEMENT
                        Priority = q.Priority.ToString(),
                        Status = q.Status.ToString(),
                        SequenceNumber = q.SequenceNumber,
                        CheckInTime = q.CheckInTime
                    })
                    .ToList();

                var queuePayload = new QueueBoardUpdatedPayload
                {
                    TenantId = tenantId,
                    FacilityId = clinicId,
                    QueueDate = todayManila,
                    GeneratedAtUtc = DateTime.UtcNow,
                    IsAcceptingWalkIns = isAcceptingWalkIns,
                    PatientsWaitingCount = upNext.Count,
                    TvDisplayPin = settings?.TvDisplayPin,
                    NowServing = nowServing,
                    UpNext = upNext
                };

                publisher.Enqueue(
                    InteropTypes.QueueBoardUpdated,
                    Party.ForFacility(tenantId, clinicId.ToString(), FacilityType.Clinic),
                    Party.Portal,
                    Guid.NewGuid(),
                    queuePayload);
            }
        }

        // 3. Process Medical Certificates -> DocumentAttestationPublished
        foreach (var entry in medCertEntries)
        {
            var cert = entry.Entity;
            if (!cert.IsSigned && !cert.IsDeleted) continue;

            if (alreadyStaged.Contains((InteropTypes.DocumentAttestationPublished, cert.Id))) continue;

            var settings = await GetClinicSettingsAsync(db, cert.ClinicId, clinicSettingsCache, cancellationToken);
            var issuedAt = cert.SignedAt ?? cert.CreatedAt;

            cert.SecurityDigest ??= _securityService.ComputeDocumentDigest(
                cert.TenantId,
                "MED-CERT",
                cert.CertificateNumber,
                cert.PatientId,
                cert.PrcLicenseNumber,
                issuedAt);

            var payload = new DocumentAttestationPublishedPayload
            {
                SourceDocumentId = cert.Id,
                TenantId = cert.TenantId,
                FacilityId = cert.ClinicId,
                DocumentKind = "medical-certificate",
                DocumentNumber = cert.CertificateNumber,
                SecurityDigest = cert.SecurityDigest,
                VerificationTokenHash = null,
                ClinicName = settings?.ClinicName ?? "Clinic EZ Medical Facility",
                ClinicAddress = settings?.LetterheadAddress,
                ClinicContact = settings?.LetterheadContact,
                DoctorName = cert.DoctorName,
                DoctorPrcLicense = cert.PrcLicenseNumber,
                DoctorPtr = cert.PtrNumber,
                DoctorS2License = null,
                IssuedAtUtc = issuedAt,
                ExpiresAtUtc = cert.RestEndDate?.ToDateTime(TimeOnly.MinValue, DateTimeKind.Utc),
                Status = cert.IsDeleted ? "REVOKED" : "VALID",
                IsAlreadyDispensed = false,
                DispenseStatus = null,
                DispensedPharmacyName = null,
                DispensedAtUtc = null,
                HasDangerousDrug = false,
                ItemCount = 1
            };

            publisher.Enqueue(
                InteropTypes.DocumentAttestationPublished,
                Party.ForFacility(cert.TenantId, cert.ClinicId.ToString(), FacilityType.Clinic),
                Party.Portal,
                cert.Id,
                payload);

            alreadyStaged.Add((InteropTypes.DocumentAttestationPublished, cert.Id));
        }

        // 4. Process Referral Letters -> DocumentAttestationPublished
        foreach (var entry in referralEntries)
        {
            var referral = entry.Entity;
            if (!referral.IsSigned && !referral.IsDeleted) continue;

            if (alreadyStaged.Contains((InteropTypes.DocumentAttestationPublished, referral.Id))) continue;

            var settings = await GetClinicSettingsAsync(db, referral.ClinicId, clinicSettingsCache, cancellationToken);
            var issuedAt = referral.SignedAt ?? referral.CreatedAt;

            referral.SecurityDigest ??= _securityService.ComputeDocumentDigest(
                referral.TenantId,
                "REFERRAL",
                referral.ReferralNumber,
                referral.PatientId,
                referral.ReferringDoctorPrcNumber ?? "PHYSICIAN",
                issuedAt);

            var payload = new DocumentAttestationPublishedPayload
            {
                SourceDocumentId = referral.Id,
                TenantId = referral.TenantId,
                FacilityId = referral.ClinicId,
                DocumentKind = "referral",
                DocumentNumber = referral.ReferralNumber,
                SecurityDigest = referral.SecurityDigest,
                VerificationTokenHash = null,
                ClinicName = settings?.ClinicName ?? "Clinic EZ Medical Facility",
                ClinicAddress = settings?.LetterheadAddress,
                ClinicContact = settings?.LetterheadContact,
                DoctorName = referral.ReferringDoctorName,
                DoctorPrcLicense = referral.ReferringDoctorPrcNumber,
                DoctorPtr = null,
                DoctorS2License = null,
                IssuedAtUtc = issuedAt,
                ExpiresAtUtc = null,
                Status = referral.IsDeleted ? "REVOKED" : "VALID",
                IsAlreadyDispensed = false,
                DispenseStatus = null,
                DispensedPharmacyName = null,
                DispensedAtUtc = null,
                HasDangerousDrug = false,
                ItemCount = 1
            };

            publisher.Enqueue(
                InteropTypes.DocumentAttestationPublished,
                Party.ForFacility(referral.TenantId, referral.ClinicId.ToString(), FacilityType.Clinic),
                Party.Portal,
                referral.Id,
                payload);

            alreadyStaged.Add((InteropTypes.DocumentAttestationPublished, referral.Id));
        }

        // 5. Process Consultation Encounters (Prescriptions) -> DocumentAttestationPublished
        foreach (var entry in encounterEntries)
        {
            var encounter = entry.Entity;
            if (!encounter.IsSigned && !encounter.IsDeleted) continue;
            if (string.IsNullOrWhiteSpace(encounter.PrescriptionNumber) && encounter.Prescriptions.Count == 0) continue;

            if (alreadyStaged.Contains((InteropTypes.DocumentAttestationPublished, encounter.Id))) continue;

            var settings = await GetClinicSettingsAsync(db, encounter.ClinicId, clinicSettingsCache, cancellationToken);
            var issuedAt = encounter.SignedAt ?? encounter.EncounterDate;
            var rxNumber = encounter.PrescriptionNumber ?? $"RX-{encounter.EncounterDate:yyyyMMdd}-{encounter.Id.ToString("N")[..6].ToUpper()}";

            var digest = _securityService.ComputeDocumentDigest(
                encounter.TenantId,
                "PRESCRIPTION",
                rxNumber,
                encounter.PatientId,
                encounter.DoctorPrcLicense ?? "PHYSICIAN",
                issuedAt);

            // Mint RxPublicVerificationToken as {clinicId:N}.{secret} if null
            if (string.IsNullOrWhiteSpace(encounter.RxPublicVerificationToken))
            {
                encounter.RxPublicVerificationToken = $"{encounter.ClinicId:N}.{Guid.NewGuid():N}";
            }

            var tokenHash = Convert.ToHexString(SHA256.HashData(Encoding.UTF8.GetBytes(encounter.RxPublicVerificationToken))).ToLowerInvariant();
            var isAlreadyDispensed = encounter.RxDispenseStatus is PrescriptionDispenseStatus.DispensedAtPartnerPharmacy or PrescriptionDispenseStatus.DispensedExternally;

            var payload = new DocumentAttestationPublishedPayload
            {
                SourceDocumentId = encounter.Id,
                TenantId = encounter.TenantId,
                FacilityId = encounter.ClinicId,
                DocumentKind = "rx",
                DocumentNumber = rxNumber,
                SecurityDigest = digest,
                VerificationTokenHash = tokenHash,
                ClinicName = settings?.ClinicName ?? "Clinic EZ Medical Facility",
                ClinicAddress = settings?.LetterheadAddress,
                ClinicContact = settings?.LetterheadContact,
                DoctorName = encounter.DoctorName,
                DoctorPrcLicense = encounter.DoctorPrcLicense,
                DoctorPtr = encounter.DoctorPtr,
                DoctorS2License = encounter.DoctorS2License,
                IssuedAtUtc = issuedAt,
                ExpiresAtUtc = issuedAt.AddDays(30),
                Status = encounter.IsDeleted ? "REVOKED" : (isAlreadyDispensed ? "DISPENSED" : "VALID"),
                IsAlreadyDispensed = isAlreadyDispensed,
                DispenseStatus = encounter.RxDispenseStatus.ToString(),
                DispensedPharmacyName = encounter.RxDispensedPharmacyName ?? encounter.RxPharmacyName,
                DispensedAtUtc = encounter.RxDispensedAt,
                HasDangerousDrug = encounter.Prescriptions.Any(p => p.IsDangerousDrug),
                ItemCount = encounter.Prescriptions.Count
            };

            publisher.Enqueue(
                InteropTypes.DocumentAttestationPublished,
                Party.ForFacility(encounter.TenantId, encounter.ClinicId.ToString(), FacilityType.Clinic),
                Party.Portal,
                encounter.Id,
                payload);

            alreadyStaged.Add((InteropTypes.DocumentAttestationPublished, encounter.Id));
        }

        // 6. Process Lab Orders -> DocumentAttestationPublished
        foreach (var entry in labOrderEntries)
        {
            var order = entry.Entity;
            if (alreadyStaged.Contains((InteropTypes.DocumentAttestationPublished, order.Id))) continue;

            var settings = await GetClinicSettingsAsync(db, order.ClinicId, clinicSettingsCache, cancellationToken);
            var issuedAt = order.OrderDate;

            var digest = _securityService.ComputeDocumentDigest(
                order.TenantId ?? "default",
                "LAB-SLIP",
                order.OrderNumber,
                order.PatientId,
                "UNASSIGNED",
                issuedAt);

            var payload = new DocumentAttestationPublishedPayload
            {
                SourceDocumentId = order.Id,
                TenantId = order.TenantId ?? "default",
                FacilityId = order.ClinicId,
                DocumentKind = "lab-order",
                DocumentNumber = order.OrderNumber,
                SecurityDigest = digest,
                VerificationTokenHash = null,
                ClinicName = settings?.ClinicName ?? "Clinic EZ Medical Facility",
                ClinicAddress = settings?.LetterheadAddress,
                ClinicContact = settings?.LetterheadContact,
                DoctorName = order.OrderedByDoctorName,
                DoctorPrcLicense = null,
                DoctorPtr = null,
                DoctorS2License = null,
                IssuedAtUtc = issuedAt,
                ExpiresAtUtc = null,
                Status = order.IsDeleted ? "REVOKED" : "VALID",
                IsAlreadyDispensed = false,
                DispenseStatus = null,
                DispensedPharmacyName = null,
                DispensedAtUtc = null,
                HasDangerousDrug = false,
                ItemCount = order.Items.Count
            };

            publisher.Enqueue(
                InteropTypes.DocumentAttestationPublished,
                Party.ForFacility(order.TenantId ?? "default", order.ClinicId.ToString(), FacilityType.Clinic),
                Party.Portal,
                order.Id,
                payload);

            alreadyStaged.Add((InteropTypes.DocumentAttestationPublished, order.Id));
        }

        // 7. Process Invoices (Official Receipts) -> DocumentAttestationPublished
        foreach (var entry in invoiceEntries)
        {
            var invoice = entry.Entity;
            var isPaid = invoice.Status == InvoiceStatus.Paid;
            var wasPaidAndVoided = (invoice.Status == InvoiceStatus.Voided || invoice.Status == InvoiceStatus.Refunded) &&
                                   entry.OriginalValues.Properties.Any(p => p.Name == nameof(Invoice.Status)) &&
                                   entry.OriginalValues.GetValue<InvoiceStatus>(nameof(Invoice.Status)) == InvoiceStatus.Paid;
            var isDeletedPaid = invoice.IsDeleted && isPaid;

            if (!isPaid && !wasPaidAndVoided && !isDeletedPaid)
            {
                continue;
            }

            if (alreadyStaged.Contains((InteropTypes.DocumentAttestationPublished, invoice.Id))) continue;

            var settings = await GetClinicSettingsAsync(db, invoice.ClinicId, clinicSettingsCache, cancellationToken);
            var issuedAt = invoice.CreatedAt != default ? invoice.CreatedAt : invoice.InvoiceDate;

            var digest = _securityService.ComputeDocumentDigest(
                invoice.TenantId ?? "default",
                "OFFICIAL-RECEIPT",
                invoice.InvoiceNumber,
                invoice.PatientId,
                "CASHIER",
                issuedAt);

            var payload = new DocumentAttestationPublishedPayload
            {
                SourceDocumentId = invoice.Id,
                TenantId = invoice.TenantId ?? "default",
                FacilityId = invoice.ClinicId,
                DocumentKind = "receipt",
                DocumentNumber = invoice.InvoiceNumber,
                SecurityDigest = digest,
                VerificationTokenHash = null,
                ClinicName = settings?.ClinicName ?? "Clinic EZ Medical Facility",
                ClinicAddress = settings?.LetterheadAddress,
                ClinicContact = settings?.LetterheadContact,
                DoctorName = invoice.BilledByStaffName ?? "Cashier Staff",
                DoctorPrcLicense = null,
                DoctorPtr = null,
                DoctorS2License = null,
                IssuedAtUtc = issuedAt,
                ExpiresAtUtc = null,
                Status = (invoice.IsDeleted || invoice.Status == InvoiceStatus.Voided || invoice.Status == InvoiceStatus.Refunded) ? "REVOKED" : "VALID",
                IsAlreadyDispensed = false,
                DispenseStatus = null,
                DispensedPharmacyName = null,
                DispensedAtUtc = null,
                HasDangerousDrug = false,
                ItemCount = invoice.LineItems.Count
            };

            publisher.Enqueue(
                InteropTypes.DocumentAttestationPublished,
                Party.ForFacility(invoice.TenantId ?? "default", invoice.ClinicId.ToString(), FacilityType.Clinic),
                Party.Portal,
                invoice.Id,
                payload);

            alreadyStaged.Add((InteropTypes.DocumentAttestationPublished, invoice.Id));
        }
    }

    private static async Task<FacilitySettings?> GetClinicSettingsAsync(
        ApplicationDbContext db,
        Guid clinicId,
        Dictionary<Guid, FacilitySettings> cache,
        CancellationToken ct)
    {
        if (cache.TryGetValue(clinicId, out var existing)) return existing;

        var loaded = await db.Settings.IgnoreQueryFilters().AsNoTracking()
            .FirstOrDefaultAsync(s => s.ClinicId == clinicId && !s.IsDeleted, ct);

        if (loaded != null) cache[clinicId] = loaded;
        return loaded;
    }
}
