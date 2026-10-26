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
using ClinicEz.Shared.Interoperability;
using Microsoft.EntityFrameworkCore;
using Microsoft.Extensions.DependencyInjection;
using Microsoft.Extensions.Hosting;
using Microsoft.Extensions.Logging;

namespace ClinicEz.Clinic.Infrastructure.Services;

/// <summary>
/// Background service executing on application boot to idempotently backfill portal projections:
/// 1. Facility join settings with 4-char clinic discriminator.
/// 2. Active Manila queue board snapshots (zero-PHI).
/// 3. Document attestations for recent (last 365 days) issued documents.
/// </summary>
public sealed class ClinicPortalStartupBackfillHostedService : BackgroundService
{
    private readonly IServiceProvider _services;
    private readonly ILogger<ClinicPortalStartupBackfillHostedService> _logger;

    public ClinicPortalStartupBackfillHostedService(
        IServiceProvider services,
        ILogger<ClinicPortalStartupBackfillHostedService> logger)
    {
        _services = services;
        _logger = logger;
    }

    protected override async Task ExecuteAsync(CancellationToken stoppingToken)
    {
        try
        {
            using var scope = _services.CreateScope();
            var db = scope.ServiceProvider.GetRequiredService<ApplicationDbContext>();
            var securityService = scope.ServiceProvider.GetRequiredService<IDocumentSecurityService>();

            _logger.LogInformation("[ClinicEz.Clinic] ClinicPortalStartupBackfillHostedService: Starting portal projection backfill...");

            var clinics = await db.ClinicSettings.IgnoreQueryFilters()
                .Where(s => !s.IsDeleted)
                .ToListAsync(stoppingToken);

            if (clinics.Count == 0)
            {
                _logger.LogInformation("[ClinicEz.Clinic] ClinicPortalStartupBackfillHostedService: No clinics found to backfill.");
                return;
            }

            var publisher = new InteropPublisher(db);
            var tz = ClinicTimeZoneResolver.ResolveTimeZone("Asia/Manila");
            var todayManila = DateOnly.FromDateTime(TimeZoneInfo.ConvertTimeFromUtc(DateTime.UtcNow, tz));
            var cutoff = DateTime.UtcNow.AddDays(-365);

            foreach (var clinic in clinics)
            {
                // Phase 1: Join settings
                var disc = clinic.ClinicId.ToString("N")[..4].ToUpperInvariant();
                if (!string.IsNullOrWhiteSpace(clinic.JoinCode) && !clinic.JoinCode.Contains('-'))
                {
                    clinic.JoinCode = $"{disc}-{clinic.JoinCode.Trim().ToUpperInvariant()}";
                }

                publisher.Enqueue(
                    InteropTypes.FacilityJoinSettingsUpdated,
                    Party.ForFacility(clinic.TenantId, clinic.ClinicId.ToString(), FacilityType.Clinic),
                    Party.Portal,
                    clinic.ClinicId,
                    new FacilityJoinSettingsUpdatedPayload
                    {
                        TenantId = clinic.TenantId,
                        FacilityId = clinic.ClinicId,
                        IsJoinEnabled = clinic.IsJoinEnabled,
                        JoinCode = clinic.JoinCode,
                        JoinCodeExpiresAtUtc = clinic.JoinCodeExpiresAt,
                        FacilityAddress = clinic.LetterheadAddress,
                        OperatingHours = clinic.OperatingHours,
                        UpdatedAtUtc = DateTime.UtcNow
                    });

                // Phase 2: Active Manila queue board snapshot
                var dbTickets = await db.QueueItems.IgnoreQueryFilters().AsNoTracking()
                    .Where(q => q.ClinicId == clinic.ClinicId && q.QueueDate == todayManila && !q.IsDeleted)
                    .ToListAsync(stoppingToken);

                var nowServing = dbTickets
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

                var upNext = dbTickets
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

                publisher.Enqueue(
                    InteropTypes.QueueBoardUpdated,
                    Party.ForFacility(clinic.TenantId, clinic.ClinicId.ToString(), FacilityType.Clinic),
                    Party.Portal,
                    Guid.NewGuid(),
                    new QueueBoardUpdatedPayload
                    {
                        TenantId = clinic.TenantId,
                        FacilityId = clinic.ClinicId,
                        QueueDate = todayManila,
                        GeneratedAtUtc = DateTime.UtcNow,
                        IsAcceptingWalkIns = !clinic.IsOnlineBookingPaused,
                        PatientsWaitingCount = upNext.Count,
                        NowServing = nowServing,
                        UpNext = upNext
                    });

                // Phase 3: Recent issued attestations (last 365 days, capped at 500 per type per clinic)
                // 3a. Medical Certificates
                var medCerts = await db.MedicalCertificates.IgnoreQueryFilters()
                    .Where(m => m.ClinicId == clinic.ClinicId && !m.IsDeleted && m.IsSigned && (m.SignedAt ?? m.CreatedAt) >= cutoff)
                    .OrderByDescending(m => m.SignedAt ?? m.CreatedAt)
                    .Take(500)
                    .ToListAsync(stoppingToken);

                foreach (var cert in medCerts)
                {
                    var issuedAt = cert.SignedAt ?? cert.CreatedAt;
                    cert.SecurityDigest ??= securityService.ComputeDocumentDigest(
                        cert.TenantId, "MED-CERT", cert.CertificateNumber, cert.PatientId, cert.PrcLicenseNumber, issuedAt);

                    publisher.Enqueue(
                        InteropTypes.DocumentAttestationPublished,
                        Party.ForFacility(cert.TenantId, cert.ClinicId.ToString(), FacilityType.Clinic),
                        Party.Portal,
                        cert.Id,
                        new DocumentAttestationPublishedPayload
                        {
                            SourceDocumentId = cert.Id,
                            TenantId = cert.TenantId,
                            FacilityId = cert.ClinicId,
                            DocumentKind = "medical-certificate",
                            DocumentNumber = cert.CertificateNumber,
                            SecurityDigest = cert.SecurityDigest,
                            VerificationTokenHash = null,
                            ClinicName = clinic.ClinicName,
                            ClinicAddress = clinic.LetterheadAddress,
                            ClinicContact = clinic.LetterheadContact,
                            DoctorName = cert.DoctorName,
                            DoctorPrcLicense = cert.PrcLicenseNumber,
                            DoctorPtr = cert.PtrNumber,
                            DoctorS2License = null,
                            IssuedAtUtc = issuedAt,
                            ExpiresAtUtc = cert.RestEndDate?.ToDateTime(TimeOnly.MinValue, DateTimeKind.Utc),
                            Status = "VALID",
                            IsAlreadyDispensed = false,
                            DispenseStatus = null,
                            DispensedPharmacyName = null,
                            DispensedAtUtc = null,
                            HasDangerousDrug = false,
                            ItemCount = 1
                        });
                }

                // 3b. Referral Letters
                var referrals = await db.ReferralLetters.IgnoreQueryFilters()
                    .Where(r => r.ClinicId == clinic.ClinicId && !r.IsDeleted && r.IsSigned && (r.SignedAt ?? r.CreatedAt) >= cutoff)
                    .OrderByDescending(r => r.SignedAt ?? r.CreatedAt)
                    .Take(500)
                    .ToListAsync(stoppingToken);

                foreach (var referral in referrals)
                {
                    var issuedAt = referral.SignedAt ?? referral.CreatedAt;
                    referral.SecurityDigest ??= securityService.ComputeDocumentDigest(
                        referral.TenantId, "REFERRAL", referral.ReferralNumber, referral.PatientId, referral.ReferringDoctorPrcNumber ?? "PHYSICIAN", issuedAt);

                    publisher.Enqueue(
                        InteropTypes.DocumentAttestationPublished,
                        Party.ForFacility(referral.TenantId, referral.ClinicId.ToString(), FacilityType.Clinic),
                        Party.Portal,
                        referral.Id,
                        new DocumentAttestationPublishedPayload
                        {
                            SourceDocumentId = referral.Id,
                            TenantId = referral.TenantId,
                            FacilityId = referral.ClinicId,
                            DocumentKind = "referral",
                            DocumentNumber = referral.ReferralNumber,
                            SecurityDigest = referral.SecurityDigest,
                            VerificationTokenHash = null,
                            ClinicName = clinic.ClinicName,
                            ClinicAddress = clinic.LetterheadAddress,
                            ClinicContact = clinic.LetterheadContact,
                            DoctorName = referral.ReferringDoctorName,
                            DoctorPrcLicense = referral.ReferringDoctorPrcNumber,
                            DoctorPtr = null,
                            DoctorS2License = null,
                            IssuedAtUtc = issuedAt,
                            ExpiresAtUtc = null,
                            Status = "VALID",
                            IsAlreadyDispensed = false,
                            DispenseStatus = null,
                            DispensedPharmacyName = null,
                            DispensedAtUtc = null,
                            HasDangerousDrug = false,
                            ItemCount = 1
                        });
                }

                // 3c. Consultation Encounters (Prescriptions)
                var encounters = await db.Consultations.IgnoreQueryFilters()
                    .Include(e => e.Prescriptions)
                    .Where(e => e.ClinicId == clinic.ClinicId && !e.IsDeleted && e.IsSigned && (e.SignedAt ?? e.EncounterDate) >= cutoff &&
                                (!string.IsNullOrEmpty(e.PrescriptionNumber) || e.Prescriptions.Any()))
                    .OrderByDescending(e => e.SignedAt ?? e.EncounterDate)
                    .Take(500)
                    .ToListAsync(stoppingToken);

                foreach (var encounter in encounters)
                {
                    var issuedAt = encounter.SignedAt ?? encounter.EncounterDate;
                    var rxNumber = encounter.PrescriptionNumber ?? $"RX-{encounter.EncounterDate:yyyyMMdd}-{encounter.Id.ToString("N")[..6].ToUpper()}";
                    var digest = securityService.ComputeDocumentDigest(
                        encounter.TenantId, "PRESCRIPTION", rxNumber, encounter.PatientId, encounter.DoctorPrcLicense ?? "PHYSICIAN", issuedAt);

                    if (string.IsNullOrWhiteSpace(encounter.RxPublicVerificationToken))
                    {
                        encounter.RxPublicVerificationToken = $"{encounter.ClinicId:N}.{Guid.NewGuid():N}";
                    }

                    var tokenHash = Convert.ToHexString(SHA256.HashData(Encoding.UTF8.GetBytes(encounter.RxPublicVerificationToken))).ToLowerInvariant();
                    var isAlreadyDispensed = encounter.RxDispenseStatus is PrescriptionDispenseStatus.DispensedAtPartnerPharmacy or PrescriptionDispenseStatus.DispensedExternally;

                    publisher.Enqueue(
                        InteropTypes.DocumentAttestationPublished,
                        Party.ForFacility(encounter.TenantId, encounter.ClinicId.ToString(), FacilityType.Clinic),
                        Party.Portal,
                        encounter.Id,
                        new DocumentAttestationPublishedPayload
                        {
                            SourceDocumentId = encounter.Id,
                            TenantId = encounter.TenantId,
                            FacilityId = encounter.ClinicId,
                            DocumentKind = "rx",
                            DocumentNumber = rxNumber,
                            SecurityDigest = digest,
                            VerificationTokenHash = tokenHash,
                            ClinicName = clinic.ClinicName,
                            ClinicAddress = clinic.LetterheadAddress,
                            ClinicContact = clinic.LetterheadContact,
                            DoctorName = encounter.DoctorName,
                            DoctorPrcLicense = encounter.DoctorPrcLicense,
                            DoctorPtr = encounter.DoctorPtr,
                            DoctorS2License = encounter.DoctorS2License,
                            IssuedAtUtc = issuedAt,
                            ExpiresAtUtc = issuedAt.AddDays(30),
                            Status = isAlreadyDispensed ? "DISPENSED" : "VALID",
                            IsAlreadyDispensed = isAlreadyDispensed,
                            DispenseStatus = encounter.RxDispenseStatus.ToString(),
                            DispensedPharmacyName = encounter.RxDispensedPharmacyName ?? encounter.RxPharmacyName,
                            DispensedAtUtc = encounter.RxDispensedAt,
                            HasDangerousDrug = encounter.Prescriptions.Any(p => p.IsDangerousDrug),
                            ItemCount = encounter.Prescriptions.Count
                        });
                }

                // 3d. Clinic Lab Orders
                var labOrders = await db.LabOrders.IgnoreQueryFilters()
                    .Include(o => o.Items)
                    .Where(o => o.ClinicId == clinic.ClinicId && !o.IsDeleted && o.OrderDate >= cutoff)
                    .OrderByDescending(o => o.OrderDate)
                    .Take(500)
                    .ToListAsync(stoppingToken);

                foreach (var order in labOrders)
                {
                    var issuedAt = order.OrderDate;
                    var digest = securityService.ComputeDocumentDigest(
                        order.TenantId ?? clinic.TenantId, "LAB-SLIP", order.OrderNumber, order.PatientId, "UNASSIGNED", issuedAt);

                    publisher.Enqueue(
                        InteropTypes.DocumentAttestationPublished,
                        Party.ForFacility(order.TenantId ?? clinic.TenantId, order.ClinicId.ToString(), FacilityType.Clinic),
                        Party.Portal,
                        order.Id,
                        new DocumentAttestationPublishedPayload
                        {
                            SourceDocumentId = order.Id,
                            TenantId = order.TenantId ?? clinic.TenantId,
                            FacilityId = order.ClinicId,
                            DocumentKind = "lab-order",
                            DocumentNumber = order.OrderNumber,
                            SecurityDigest = digest,
                            VerificationTokenHash = null,
                            ClinicName = clinic.ClinicName,
                            ClinicAddress = clinic.LetterheadAddress,
                            ClinicContact = clinic.LetterheadContact,
                            DoctorName = order.OrderedByDoctorName,
                            DoctorPrcLicense = null,
                            DoctorPtr = null,
                            DoctorS2License = null,
                            IssuedAtUtc = issuedAt,
                            ExpiresAtUtc = null,
                            Status = "VALID",
                            IsAlreadyDispensed = false,
                            DispenseStatus = null,
                            DispensedPharmacyName = null,
                            DispensedAtUtc = null,
                            HasDangerousDrug = false,
                            ItemCount = order.Items.Count
                        });
                }

                // 3e. Invoices (Paid Receipts)
                var invoices = await db.Invoices.IgnoreQueryFilters()
                    .Include(i => i.LineItems)
                    .Where(i => i.ClinicId == clinic.ClinicId && !i.IsDeleted && i.Status == InvoiceStatus.Paid && (i.CreatedAt >= cutoff || i.InvoiceDate >= cutoff))
                    .OrderByDescending(i => i.CreatedAt)
                    .Take(500)
                    .ToListAsync(stoppingToken);

                foreach (var invoice in invoices)
                {
                    var issuedAt = invoice.CreatedAt != default ? invoice.CreatedAt : invoice.InvoiceDate;
                    var digest = securityService.ComputeDocumentDigest(
                        invoice.TenantId ?? clinic.TenantId, "OFFICIAL-RECEIPT", invoice.InvoiceNumber, invoice.PatientId, "CASHIER", issuedAt);

                    publisher.Enqueue(
                        InteropTypes.DocumentAttestationPublished,
                        Party.ForFacility(invoice.TenantId ?? clinic.TenantId, invoice.ClinicId.ToString(), FacilityType.Clinic),
                        Party.Portal,
                        invoice.Id,
                        new DocumentAttestationPublishedPayload
                        {
                            SourceDocumentId = invoice.Id,
                            TenantId = invoice.TenantId ?? clinic.TenantId,
                            FacilityId = invoice.ClinicId,
                            DocumentKind = "receipt",
                            DocumentNumber = invoice.InvoiceNumber,
                            SecurityDigest = digest,
                            VerificationTokenHash = null,
                            ClinicName = clinic.ClinicName,
                            ClinicAddress = clinic.LetterheadAddress,
                            ClinicContact = clinic.LetterheadContact,
                            DoctorName = invoice.BilledByStaffName ?? "Cashier Staff",
                            DoctorPrcLicense = null,
                            DoctorPtr = null,
                            DoctorS2License = null,
                            IssuedAtUtc = issuedAt,
                            ExpiresAtUtc = null,
                            Status = "VALID",
                            IsAlreadyDispensed = false,
                            DispenseStatus = null,
                            DispensedPharmacyName = null,
                            DispensedAtUtc = null,
                            HasDangerousDrug = false,
                            ItemCount = invoice.LineItems.Count
                        });
                }
            }

            await db.SaveChangesAsync(stoppingToken);
            _logger.LogInformation("[ClinicEz.Clinic] ClinicPortalStartupBackfillHostedService: Completed portal projection backfill successfully.");
        }
        catch (Exception ex)
        {
            _logger.LogError(ex, "[ClinicEz.Clinic] ClinicPortalStartupBackfillHostedService: Failed to backfill portal projections.");
        }
    }
}
