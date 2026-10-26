using System;
using System.Collections.Generic;
using System.IO;
using System.Linq;
using System.Reflection;
using System.Security.Cryptography;
using System.Text;
using System.Text.Json;
using System.Threading;
using System.Threading.Tasks;
using ClinicEz.Portal.Api.Endpoints;
using ClinicEz.Portal.Domain.Entities;
using ClinicEz.Portal.Infrastructure.Messaging.Handlers;
using ClinicEz.Portal.Infrastructure.Persistence;
using ClinicEz.Portal.Tests.Support;
using ClinicEz.Shared.Common;
using ClinicEz.Shared.Interop;
using ClinicEz.Shared.Interop.Contracts;
using ClinicEz.Shared.Interop.Handling;
using ClinicEz.Shared.Interoperability;
using Microsoft.AspNetCore.Http;
using Microsoft.AspNetCore.Http.HttpResults;
using Microsoft.EntityFrameworkCore;
using Microsoft.Extensions.Logging.Abstractions;
using Xunit;

namespace ClinicEz.Portal.Tests.Adversarial;

/// <summary>
/// Milestone 3 Empirical Challenger Adversarial Verification Suite:
/// 1. Zero-PHI reflection and serialized payload audit across entities and DTOs.
/// 2. Schema and idempotent outbox ingestion resilience.
/// 3. Offline Edge Cell Fallback in PublicRxEndpoints ({clinicId:N}.{secret} -> 200 OK PendingClinicSync, zero 404).
/// 4. Edge Cell tampering, case insensitivity, receipt file validation, and midnight queue clearing.
/// </summary>
public class ChallengerM3ZeroPhiAndOfflineSyncAdversarialTests : IDisposable
{
    private readonly ApplicationDbContext _context = TestSupport.NewContext();
    private readonly InteropPublisher _publisher;
    private readonly Tenant _tenant;
    private readonly Facility _clinic;
    private readonly string _validSecret = "abcdef0123456789abcdef0123456789"; // 32 hex chars
    private readonly string _validToken;
    private readonly string _tokenHash;

    public ChallengerM3ZeroPhiAndOfflineSyncAdversarialTests()
    {
        _publisher = new InteropPublisher(_context);

        _tenant = new Tenant
        {
            Id = Guid.NewGuid(),
            TenantSlug = "adversarial-health",
            Name = "Adversarial Health Network",
            OwnerId = "owner-adv",
            Email = "compliance@adversarial-health.test"
        };

        _clinic = new Facility
        {
            Id = Guid.NewGuid(),
            TenantId = _tenant.Id,
            Slug = "main-opd",
            Name = "Adversarial Main OPD Clinic",
            StreetAddress = "100 Medical Plaza, Manila",
            ContactNumber = "+63 2 8123 4567",
            FacilityType = FacilityType.Clinic,
            Status = FacilityStatus.Active,
            IsJoinEnabled = true
        };

        _context.Tenants.Add(_tenant);
        _context.Facilities.Add(_clinic);
        _context.SaveChanges();

        // 32-char hex clinicId + '.' + 32-char hex secret = 65-char lower-hex token
        _validToken = $"{_clinic.Id:N}.{_validSecret}".ToLowerInvariant();
        using var sha = SHA256.Create();
        _tokenHash = Convert.ToHexString(sha.ComputeHash(Encoding.UTF8.GetBytes(_validToken))).ToLowerInvariant();
    }

    public void Dispose()
    {
        _context.Database.EnsureDeleted();
        _context.Dispose();
    }

    #region Pillar 1: Zero-PHI Audit

    [Fact]
    public void ZeroPhi_DomainEntities_PropertiesContainZeroForbiddenPhiKeywords()
    {
        // Assert that DocumentAttestation and FacilityQueueBoard never contain patient PHI columns
        var entityTypes = new[] { typeof(DocumentAttestation), typeof(FacilityQueueBoard) };
        var forbiddenKeywords = new[]
        {
            "PatientName", "FirstName", "LastName", "MiddleName", "FullName",
            "Diagnosis", "Icd", "ClinicalNote", "Notes", "ChiefComplaint",
            "PhilHealthPin", "Pin", "Allergy", "Allergies",
            "Medication", "Medications", "PrescriptionItem", "PrescriptionItems",
            "ReceiptBytes", "RawReceipt", "MedicalHistory", "SocialHistory"
        };

        foreach (var type in entityTypes)
        {
            var properties = type.GetProperties(BindingFlags.Public | BindingFlags.Instance);
            foreach (var prop in properties)
            {
                foreach (var forbidden in forbiddenKeywords)
                {
                    Assert.False(
                        prop.Name.Equals(forbidden, StringComparison.OrdinalIgnoreCase) ||
                        prop.Name.StartsWith(forbidden, StringComparison.OrdinalIgnoreCase),
                        $"Violation: Entity {type.Name} contains forbidden PHI property '{prop.Name}' matching keyword '{forbidden}'."
                    );
                }
            }
        }
    }

    [Fact]
    public void ZeroPhi_PublicProjectionDtos_EnforceZeroPatientNamesAndDiagnoses()
    {
        var dtoTypes = new[]
        {
            typeof(RxAttestationInfo),
            typeof(DocumentVerificationResult),
            typeof(PublicQueueDisplayData),
            typeof(QueueBoardServingItemDto),
            typeof(QueueBoardUpcomingItemDto)
        };

        var strictlyForbidden = new[]
        {
            "PatientName", "PatientFullName", "Diagnosis", "Diagnoses", "IcdCode", "ChiefComplaint",
            "MedicationName", "MedicationList", "PrescriptionItems", "ReceiptBytes"
        };

        foreach (var type in dtoTypes)
        {
            var properties = type.GetProperties(BindingFlags.Public | BindingFlags.Instance);
            foreach (var prop in properties)
            {
                foreach (var forbidden in strictlyForbidden)
                {
                    Assert.False(
                        prop.Name.Equals(forbidden, StringComparison.OrdinalIgnoreCase),
                        $"Violation: DTO {type.Name} contains forbidden PHI property '{prop.Name}' matching '{forbidden}'."
                    );
                }
            }
        }
    }

    [Fact]
    public void ZeroPhi_QueueBoardUpcomingItemDto_DisplayNameIsStrictlyNullByDefault()
    {
        var upcoming = new QueueBoardUpcomingItemDto
        {
            QueueItemId = Guid.NewGuid(),
            TicketNumber = "A-042",
            Priority = "Routine",
            Status = "Waiting",
            SequenceNumber = 42
        };

        Assert.Null(upcoming.DisplayName);

        var json = JsonSerializer.Serialize(upcoming);
        Assert.DoesNotContain("Juan", json);
        Assert.DoesNotContain("Dela Cruz", json);
    }

    [Fact]
    public async Task ZeroPhi_PublicQueueDisplayEndpoint_SanitizesDisplayNameEvenIfInjectedIntoDbJson()
    {
        // Adversarial scenario: An attacker or legacy system somehow injected a real patient name into UpNextJson
        var maliciousUpNextJson = JsonSerializer.Serialize(new[]
        {
            new
            {
                queueItemId = Guid.NewGuid(),
                ticketNumber = "T-999",
                displayName = "SECRET_PATIENT_JUAN_DELA_CRUZ",
                priority = "Emergency",
                status = "Waiting",
                sequenceNumber = 1
            }
        });

        var board = new FacilityQueueBoard
        {
            TenantId = _tenant.Id,
            FacilityId = _clinic.Id,
            QueueDate = DateOnly.FromDateTime(DateTime.UtcNow.AddHours(8)), // Manila today
            IsAcceptingWalkIns = true,
            PatientsWaitingCount = 1,
            NowServingJson = "[]",
            UpNextJson = maliciousUpNextJson,
            GeneratedAtUtc = DateTime.UtcNow,
            UpdatedAtUtc = DateTime.UtcNow
        };
        _context.FacilityQueueBoards.Add(board);
        await _context.SaveChangesAsync();

        // Query the endpoint
        var result = await PublicQueueDisplayEndpoints.GetDisplayBySlugsAsync(_tenant.TenantSlug, _clinic.Slug, _context);
        var okResult = Assert.IsAssignableFrom<IValueHttpResult>(result);
        var response = Assert.IsAssignableFrom<ApiResponse<PublicQueueDisplayData>>(okResult.Value);

        Assert.True(response.Succeeded);
        Assert.NotNull(response.Data);
        Assert.Single(response.Data.UpNext);

        // Crucial empirical check: DisplayName MUST be sanitized to null!
        Assert.Null(response.Data.UpNext[0].DisplayName);
        Assert.Equal("T-999", response.Data.UpNext[0].TicketNumber);

        // Check serialized output
        var serializedResponse = JsonSerializer.Serialize(response.Data);
        Assert.DoesNotContain("SECRET_PATIENT_JUAN_DELA_CRUZ", serializedResponse);
    }

    [Fact]
    public async Task ZeroPhi_PublicDocumentVerify_MasksPatientNameToPrescriptionBearer()
    {
        var attestation = new DocumentAttestation
        {
            Id = Guid.NewGuid(),
            TenantId = _tenant.Id,
            FacilityId = _clinic.Id,
            DocumentKind = "prescription",
            DocumentNumber = "RX-20261025-9999",
            SecurityDigest = "SEC-SHA256-1122334455667788",
            VerificationTokenHash = _tokenHash,
            ClinicName = _clinic.Name,
            ClinicAddress = _clinic.StreetAddress,
            DoctorName = "Dr. Pedro Santos",
            DoctorPrcLicense = "PRC-998877",
            IssuedAtUtc = DateTime.UtcNow,
            Status = "VALID"
        };
        _context.DocumentAttestations.Add(attestation);
        await _context.SaveChangesAsync();

        var result = await PublicDocumentVerifyEndpoints.VerifyDocumentAsync("prescription", "RX-20261025-9999", null, _context);
        var okResult = Assert.IsAssignableFrom<IValueHttpResult>(result);
        var response = Assert.IsAssignableFrom<ApiResponse<DocumentVerificationResult>>(okResult.Value);

        Assert.True(response.Succeeded);
        Assert.NotNull(response.Data);
        Assert.Equal("Prescription Bearer", response.Data.PatientMaskedName);
    }

    #endregion

    #region Pillar 2: Schema & Resilience

    [Fact]
    public async Task Schema_MidnightExpiration_PurgesStaleYesterdayTickets()
    {
        // Board has QueueDate in the past (yesterday in Manila)
        var yesterdayManila = DateOnly.FromDateTime(DateTime.UtcNow.AddHours(8)).AddDays(-1);

        var staleBoard = new FacilityQueueBoard
        {
            TenantId = _tenant.Id,
            FacilityId = _clinic.Id,
            QueueDate = yesterdayManila,
            IsAcceptingWalkIns = true,
            PatientsWaitingCount = 10,
            NowServingJson = JsonSerializer.Serialize(new[]
            {
                new QueueBoardServingItemDto
                {
                    QueueItemId = Guid.NewGuid(),
                    TicketNumber = "YESTERDAY-01",
                    DoctorName = "Dr. Old",
                    Status = "InConsultation"
                }
            }),
            UpNextJson = JsonSerializer.Serialize(new[]
            {
                new QueueBoardUpcomingItemDto
                {
                    QueueItemId = Guid.NewGuid(),
                    TicketNumber = "YESTERDAY-02",
                    Priority = "Routine",
                    Status = "Waiting"
                }
            }),
            GeneratedAtUtc = DateTime.UtcNow.AddDays(-1),
            UpdatedAtUtc = DateTime.UtcNow.AddDays(-1)
        };
        _context.FacilityQueueBoards.Add(staleBoard);
        await _context.SaveChangesAsync();

        var result = await PublicQueueDisplayEndpoints.GetDisplayBySlugsAsync(_tenant.TenantSlug, _clinic.Slug, _context);
        var okResult = Assert.IsAssignableFrom<IValueHttpResult>(result);
        var response = Assert.IsAssignableFrom<ApiResponse<PublicQueueDisplayData>>(okResult.Value);

        Assert.True(response.Succeeded);
        Assert.NotNull(response.Data);
        // Stale yesterday tickets must be purged to empty lists
        Assert.Empty(response.Data.NowServing);
        Assert.Empty(response.Data.UpNext);
        Assert.Equal(0, response.Data.PatientsWaitingCount);
    }

    [Fact]
    public async Task Ingestion_DocumentAttestationPublishedHandler_IsIdempotentOnDuplicateIngestion()
    {
        var handler = new DocumentAttestationPublishedHandler(_context, NullLogger<DocumentAttestationPublishedHandler>.Instance);
        var sourceDocId = Guid.NewGuid();

        var payload = new DocumentAttestationPublishedPayload
        {
            TenantId = _tenant.Id.ToString(),
            FacilityId = _clinic.Id,
            DocumentKind = "prescription",
            DocumentNumber = "RX-IDEM-001",
            SourceDocumentId = sourceDocId,
            VerificationTokenHash = _tokenHash,
            SecurityDigest = "SEC-SHA256-AAAA1111BBBB2222",
            ClinicName = _clinic.Name,
            ClinicAddress = _clinic.StreetAddress,
            DoctorName = "Dr. Initial",
            IssuedAtUtc = DateTime.UtcNow,
            ExpiresAtUtc = DateTime.UtcNow.AddDays(7),
            Status = "VALID",
            ItemCount = 2
        };

        var from = Party.ForFacility(_tenant.Id.ToString(), _clinic.Id.ToString(), FacilityType.Clinic);
        var envelope = InteropEnvelope.Create(InteropTypes.DocumentAttestationPublished, from, Party.Portal, Guid.NewGuid(), payload);
        var context = new InteropMessageContext(envelope);

        // First delivery
        await handler.HandleAsync(payload, context, CancellationToken.None);

        var firstCount = await _context.DocumentAttestations
            .CountAsync(d => d.TenantId == _tenant.Id && d.FacilityId == _clinic.Id && d.DocumentKind == "prescription" && d.SourceDocumentId == sourceDocId);
        Assert.Equal(1, firstCount);

        // Second delivery (e.g. redelivery with updated doctor or status)
        var updatedPayload = payload with { DoctorName = "Dr. Updated", ItemCount = 3 };
        var updatedEnvelope = InteropEnvelope.Create(InteropTypes.DocumentAttestationPublished, from, Party.Portal, Guid.NewGuid(), updatedPayload);
        await handler.HandleAsync(updatedPayload, new InteropMessageContext(updatedEnvelope), CancellationToken.None);

        var secondCount = await _context.DocumentAttestations
            .CountAsync(d => d.TenantId == _tenant.Id && d.FacilityId == _clinic.Id && d.DocumentKind == "prescription" && d.SourceDocumentId == sourceDocId);
        Assert.Equal(1, secondCount); // Strictly 1 row, no duplicate inserted!

        var entity = await _context.DocumentAttestations
            .FirstAsync(d => d.TenantId == _tenant.Id && d.FacilityId == _clinic.Id && d.DocumentKind == "prescription" && d.SourceDocumentId == sourceDocId);
        Assert.Equal("Dr. Updated", entity.DoctorName);
        Assert.Equal(3, entity.ItemCount);
    }

    [Fact]
    public async Task Ingestion_QueueBoardUpdatedHandler_MonotonicTimestamp_IgnoresStalePayload()
    {
        var handler = new QueueBoardUpdatedHandler(_context, NullLogger<QueueBoardUpdatedHandler>.Instance);
        var baseTime = DateTime.UtcNow;

        var from = Party.ForFacility(_tenant.Id.ToString(), _clinic.Id.ToString(), FacilityType.Clinic);

        var initialPayload = new QueueBoardUpdatedPayload
        {
            TenantId = _tenant.Id.ToString(),
            FacilityId = _clinic.Id,
            QueueDate = DateOnly.FromDateTime(baseTime),
            GeneratedAtUtc = baseTime,
            PatientsWaitingCount = 5
        };

        // 1. Initial ingestion
        var initialEnv = InteropEnvelope.Create(InteropTypes.QueueBoardUpdated, from, Party.Portal, Guid.NewGuid(), initialPayload);
        await handler.HandleAsync(initialPayload, new InteropMessageContext(initialEnv), CancellationToken.None);

        var board = await _context.FacilityQueueBoards
            .FirstAsync(b => b.TenantId == _tenant.Id && b.FacilityId == _clinic.Id);
        Assert.Equal(5, board.PatientsWaitingCount);

        // 2. Stale out-of-order update arriving late (GeneratedAtUtc < existing.GeneratedAtUtc)
        var stalePayload = initialPayload with
        {
            GeneratedAtUtc = baseTime.AddMinutes(-10),
            PatientsWaitingCount = 99
        };
        var staleEnv = InteropEnvelope.Create(InteropTypes.QueueBoardUpdated, from, Party.Portal, Guid.NewGuid(), stalePayload);
        await handler.HandleAsync(stalePayload, new InteropMessageContext(staleEnv), CancellationToken.None);

        board = await _context.FacilityQueueBoards
            .FirstAsync(b => b.TenantId == _tenant.Id && b.FacilityId == _clinic.Id);
        Assert.Equal(5, board.PatientsWaitingCount); // Did NOT overwrite with stale 99!

        // 3. Newer update arriving (GeneratedAtUtc > existing.GeneratedAtUtc)
        var freshPayload = initialPayload with
        {
            GeneratedAtUtc = baseTime.AddMinutes(5),
            PatientsWaitingCount = 2
        };
        var freshEnv = InteropEnvelope.Create(InteropTypes.QueueBoardUpdated, from, Party.Portal, Guid.NewGuid(), freshPayload);
        await handler.HandleAsync(freshPayload, new InteropMessageContext(freshEnv), CancellationToken.None);

        board = await _context.FacilityQueueBoards
            .FirstAsync(b => b.TenantId == _tenant.Id && b.FacilityId == _clinic.Id);
        Assert.Equal(2, board.PatientsWaitingCount); // Successfully updated!
    }

    #endregion

    #region Pillar 3: Offline Edge Cell Fallback

    [Fact]
    public async Task OfflineEdgeCellFallback_Valid65CharLowerHexToken_ActiveFacility_Returns200PendingClinicSyncZero404()
    {
        // Pre-condition: NO DocumentAttestation exists in the DB for this token
        var existingAttestation = await _context.DocumentAttestations
            .FirstOrDefaultAsync(a => a.VerificationTokenHash == _tokenHash);
        Assert.Null(existingAttestation);

        // Verification token: 65 chars (32 hex + '.' + 32 hex)
        Assert.Equal(65, _validToken.Length);

        // Action: Call GET /api/v1/public/rx/{token}
        var result = await PublicRxEndpoints.GetRxAttestationInfoAsync(_validToken, _context);

        // Assert: MUST BE 200 OK (NOT 404!)
        var okResult = Assert.IsAssignableFrom<IValueHttpResult>(result);
        var response = Assert.IsAssignableFrom<ApiResponse<RxAttestationInfo>>(okResult.Value);

        Assert.True(response.Succeeded);
        Assert.NotNull(response.Data);

        // Assert Fallback properties
        Assert.Equal("PendingClinicSync", response.Data.SyncStatus);
        Assert.True(response.Data.IsOfflinePending);
        Assert.Equal(_clinic.Name, response.Data.ClinicName);
        Assert.Equal(_clinic.StreetAddress, response.Data.ClinicAddress);
        Assert.Equal(_clinic.ContactNumber, response.Data.ClinicContact);
        Assert.Equal("RX-PENDING-SYNC", response.Data.PrescriptionNumber);
        Assert.Equal("ACTIVE", response.Data.Status);
        Assert.Equal("Pending", response.Data.DispenseStatus);
        Assert.True(response.Data.IsValid);
        Assert.False(response.Data.IsAlreadyDispensed);
        Assert.False(response.Data.IsExpired);
        Assert.Equal("Prescribing Clinician (Pending Edge Sync)", response.Data.DoctorName);
    }

    [Fact]
    public async Task OfflineEdgeCellFallback_UpperHexAndWhitespace_NormalizesAndReturns200PendingClinicSync()
    {
        // Adversarial formatting: UPPERCASE hex with surrounding spaces
        var uppercaseTokenWithSpaces = $"   {_clinic.Id:N}.{_validSecret}   ".ToUpperInvariant();

        var result = await PublicRxEndpoints.GetRxAttestationInfoAsync(uppercaseTokenWithSpaces, _context);

        var okResult = Assert.IsAssignableFrom<IValueHttpResult>(result);
        var response = Assert.IsAssignableFrom<ApiResponse<RxAttestationInfo>>(okResult.Value);

        Assert.True(response.Succeeded);
        Assert.NotNull(response.Data);
        Assert.Equal("PendingClinicSync", response.Data.SyncStatus);
        Assert.True(response.Data.IsOfflinePending);
        Assert.Equal(_clinic.Name, response.Data.ClinicName);
    }

    [Theory]
    [InlineData("")]
    [InlineData("   ")]
    public async Task OfflineEdgeCellFallback_EmptyToken_Returns400BadRequest(string badToken)
    {
        var result = await PublicRxEndpoints.GetRxAttestationInfoAsync(badToken, _context);
        var badResult = Assert.IsAssignableFrom<IStatusCodeHttpResult>(result);
        Assert.Equal(StatusCodes.Status400BadRequest, badResult.StatusCode);
    }

    [Fact]
    public async Task OfflineEdgeCellFallback_UnknownClinicId_Returns404NotFound()
    {
        var unknownClinicId = Guid.NewGuid();
        var unknownToken = $"{unknownClinicId:N}.{_validSecret}";

        var result = await PublicRxEndpoints.GetRxAttestationInfoAsync(unknownToken, _context);
        var notFoundResult = Assert.IsAssignableFrom<IStatusCodeHttpResult>(result);
        Assert.Equal(StatusCodes.Status404NotFound, notFoundResult.StatusCode);
    }

    [Fact]
    public async Task OfflineEdgeCellFallback_DeletedClinic_Returns404NotFound()
    {
        var deletedClinic = new Facility
        {
            Id = Guid.NewGuid(),
            TenantId = _tenant.Id,
            Slug = "deleted-clinic",
            Name = "Deleted Clinic",
            FacilityType = FacilityType.Clinic,
            Status = FacilityStatus.Active,
            IsDeleted = true,
            DeletedAt = DateTime.UtcNow
        };
        _context.Facilities.Add(deletedClinic);
        await _context.SaveChangesAsync();

        var tokenForDeleted = $"{deletedClinic.Id:N}.{_validSecret}";
        var result = await PublicRxEndpoints.GetRxAttestationInfoAsync(tokenForDeleted, _context);
        var notFoundResult = Assert.IsAssignableFrom<IStatusCodeHttpResult>(result);
        Assert.Equal(StatusCodes.Status404NotFound, notFoundResult.StatusCode);
    }

    [Theory]
    [InlineData(FacilityStatus.Suspended)]
    [InlineData(FacilityStatus.Provisioning)]
    [InlineData(FacilityStatus.Failed)]
    public async Task OfflineEdgeCellFallback_NonActiveClinicStatus_Returns404NotFound(FacilityStatus status)
    {
        var nonActiveClinic = new Facility
        {
            Id = Guid.NewGuid(),
            TenantId = _tenant.Id,
            Slug = $"inactive-clinic-{status}",
            Name = $"Clinic {status}",
            FacilityType = FacilityType.Clinic,
            Status = status
        };
        _context.Facilities.Add(nonActiveClinic);
        await _context.SaveChangesAsync();

        var tokenForNonActive = $"{nonActiveClinic.Id:N}.{_validSecret}";
        var result = await PublicRxEndpoints.GetRxAttestationInfoAsync(tokenForNonActive, _context);
        var notFoundResult = Assert.IsAssignableFrom<IStatusCodeHttpResult>(result);
        Assert.Equal(StatusCodes.Status404NotFound, notFoundResult.StatusCode);
    }

    [Theory]
    [InlineData("not-a-guid.secret")]
    [InlineData("1234567890")]
    [InlineData("0123456789abcdef0123456789abcdef")] // 32 chars without dot
    [InlineData("0123456789abcdef0123456789abcdef:secret")] // colon instead of dot
    [InlineData("0123456789abcdef0123456789abcdef.")] // missing secret
    [InlineData("zzzzzzzzzzzzzzzzzzzzzzzzzzzzzzzz.abcdef0123456789abcdef0123456789")] // non-hex guid
    public async Task OfflineEdgeCellFallback_MalformedTokens_GracefullyReturn404WithoutException(string malformedToken)
    {
        var result = await PublicRxEndpoints.GetRxAttestationInfoAsync(malformedToken, _context);
        var notFoundResult = Assert.IsAssignableFrom<IStatusCodeHttpResult>(result);
        Assert.Equal(StatusCodes.Status404NotFound, notFoundResult.StatusCode);
    }

    [Fact]
    public async Task OfflineEdgeCellFallback_TransitionToSynced_TakesPrecedenceOverFallback()
    {
        // 1. Before sync: verify 200 PendingClinicSync
        var result1 = await PublicRxEndpoints.GetRxAttestationInfoAsync(_validToken, _context);
        var ok1 = Assert.IsAssignableFrom<IValueHttpResult>(result1);
        var resp1 = Assert.IsAssignableFrom<ApiResponse<RxAttestationInfo>>(ok1.Value);
        Assert.Equal("PendingClinicSync", resp1.Data!.SyncStatus);
        Assert.True(resp1.Data.IsOfflinePending);

        // 2. Hub sync occurs: DocumentAttestation is persisted
        var attestation = new DocumentAttestation
        {
            Id = Guid.NewGuid(),
            TenantId = _tenant.Id,
            FacilityId = _clinic.Id,
            DocumentKind = "prescription",
            DocumentNumber = "RX-REAL-20261025-001",
            SecurityDigest = "SEC-SHA256-FEEDFACECAFE",
            VerificationTokenHash = _tokenHash,
            ClinicName = _clinic.Name,
            ClinicAddress = _clinic.StreetAddress,
            DoctorName = "Dr. Real Physician",
            DoctorPrcLicense = "PRC-999888",
            IssuedAtUtc = DateTime.UtcNow,
            ExpiresAtUtc = DateTime.UtcNow.AddDays(7),
            Status = "VALID",
            IsAlreadyDispensed = false,
            ItemCount = 3
        };
        _context.DocumentAttestations.Add(attestation);
        await _context.SaveChangesAsync();

        // 3. Query again with the exact same token
        var result2 = await PublicRxEndpoints.GetRxAttestationInfoAsync(_validToken, _context);
        var ok2 = Assert.IsAssignableFrom<IValueHttpResult>(result2);
        var resp2 = Assert.IsAssignableFrom<ApiResponse<RxAttestationInfo>>(ok2.Value);

        // Assert: NOW returns "Synced", NOT "PendingClinicSync"
        Assert.Equal("Synced", resp2.Data!.SyncStatus);
        Assert.False(resp2.Data.IsOfflinePending);
        Assert.Equal("RX-REAL-20261025-001", resp2.Data.PrescriptionNumber);
        Assert.Equal("Dr. Real Physician", resp2.Data.DoctorName);
        Assert.Equal(3, resp2.Data.ItemCount);
    }

    #endregion

    #region Pillar 4: Dispense Relay & Magic Byte Security

    [Fact]
    public async Task DispenseRelay_OfflinePendingRx_SuccessfullyEnqueuesRelayAndReturns202Accepted()
    {
        var body = new SubmitRxDispenseBody(
            ExternalPharmacyName: "Mercury Drug - Taft Ave",
            ExternalBranchLocation: "Manila",
            PharmacistName: "Maria Clara, RPh",
            PharmacistPrcLicense: "RPH-12345",
            OfficialReceiptNumber: "OR-2026-999",
            Notes: "Dispensed 1 item"
        );

        var result = await PublicRxEndpoints.SubmitDispenseJsonAsync(
            _validToken,
            body,
            _context,
            _publisher,
            NullLogger<PublicRxEndpoints>.Instance
        );

        // Must return 202 Accepted
        var acceptedResult = Assert.IsAssignableFrom<IStatusCodeHttpResult>(result);
        Assert.Equal(StatusCodes.Status202Accepted, acceptedResult.StatusCode);

        // Verify that an outbox message was enqueued for the issuing clinic
        var outboxMessages = await _context.InteropOutbox
            .Where(m => m.Type == InteropTypes.RxExternalDispensed)
            .ToListAsync();

        Assert.Single(outboxMessages);
        var msg = outboxMessages[0];
        Assert.Contains("Mercury Drug - Taft Ave", msg.EnvelopeJson);
        Assert.Contains(_clinic.Id.ToString(), msg.EnvelopeJson);
    }

    [Fact]
    public async Task DispenseRelay_AlreadyDispensedAttestation_Returns409Conflict()
    {
        var attestation = new DocumentAttestation
        {
            Id = Guid.NewGuid(),
            TenantId = _tenant.Id,
            FacilityId = _clinic.Id,
            DocumentKind = "prescription",
            DocumentNumber = "RX-DISPENSED-TEST",
            SecurityDigest = "SEC-SHA256-DISP",
            VerificationTokenHash = _tokenHash,
            ClinicName = _clinic.Name,
            Status = "DISPENSED",
            IsAlreadyDispensed = true,
            DispensedPharmacyName = "Previous Pharmacy",
            DispensedAtUtc = DateTime.UtcNow.AddHours(-1)
        };
        _context.DocumentAttestations.Add(attestation);
        await _context.SaveChangesAsync();

        var body = new SubmitRxDispenseBody(ExternalPharmacyName: "Second Pharmacy");
        var result = await PublicRxEndpoints.SubmitDispenseJsonAsync(
            _validToken,
            body,
            _context,
            _publisher,
            NullLogger<PublicRxEndpoints>.Instance
        );

        var conflictResult = Assert.IsAssignableFrom<IStatusCodeHttpResult>(result);
        Assert.Equal(StatusCodes.Status409Conflict, conflictResult.StatusCode);
    }

    [Fact]
    public async Task DispenseRelay_ExpiredAttestation_Returns410Gone()
    {
        var attestation = new DocumentAttestation
        {
            Id = Guid.NewGuid(),
            TenantId = _tenant.Id,
            FacilityId = _clinic.Id,
            DocumentKind = "prescription",
            DocumentNumber = "RX-EXPIRED-TEST",
            SecurityDigest = "SEC-SHA256-EXP",
            VerificationTokenHash = _tokenHash,
            ClinicName = _clinic.Name,
            Status = "VALID",
            IsAlreadyDispensed = false,
            ExpiresAtUtc = DateTime.UtcNow.AddDays(-2) // Expired 2 days ago
        };
        _context.DocumentAttestations.Add(attestation);
        await _context.SaveChangesAsync();

        var body = new SubmitRxDispenseBody(ExternalPharmacyName: "Any Pharmacy");
        var result = await PublicRxEndpoints.SubmitDispenseJsonAsync(
            _validToken,
            body,
            _context,
            _publisher,
            NullLogger<PublicRxEndpoints>.Instance
        );

        var goneResult = Assert.IsAssignableFrom<IStatusCodeHttpResult>(result);
        Assert.Equal(StatusCodes.Status410Gone, goneResult.StatusCode);
    }

    [Fact]
    public async Task DispenseRelay_Multipart_ValidPdfMagicBytes_Accepted()
    {
        var httpContext = new DefaultHttpContext();
        var pdfBytes = Encoding.ASCII.GetBytes("%PDF-1.4\n%synthetic test pdf content");
        var stream = new MemoryStream(pdfBytes);
        var file = new FormFile(stream, 0, pdfBytes.Length, "file", "receipt.pdf")
        {
            Headers = new HeaderDictionary(),
            ContentType = "application/pdf"
        };
        var form = new FormCollection(
            new Dictionary<string, Microsoft.Extensions.Primitives.StringValues>
            {
                ["externalPharmacyName"] = "Mercury Drug",
                ["officialReceiptNumber"] = "OR-12345"
            },
            new FormFileCollection { file }
        );
        httpContext.Request.Form = form;
        httpContext.Request.ContentType = "multipart/form-data";

        var result = await PublicRxEndpoints.SubmitDispenseMultipartAsync(
            _validToken,
            httpContext,
            _context,
            _publisher,
            NullLogger<PublicRxEndpoints>.Instance
        );

        var accepted = Assert.IsAssignableFrom<IStatusCodeHttpResult>(result);
        Assert.Equal(StatusCodes.Status202Accepted, accepted.StatusCode);
    }

    [Fact]
    public async Task DispenseRelay_Multipart_InvalidMagicBytes_Returns400BadRequest()
    {
        var httpContext = new DefaultHttpContext();
        var fakeBytes = Encoding.ASCII.GetBytes("MZ\x90\x00not a real pdf");
        var stream = new MemoryStream(fakeBytes);
        var file = new FormFile(stream, 0, fakeBytes.Length, "file", "malicious.pdf")
        {
            Headers = new HeaderDictionary(),
            ContentType = "application/pdf"
        };
        var form = new FormCollection(
            new Dictionary<string, Microsoft.Extensions.Primitives.StringValues>
            {
                ["externalPharmacyName"] = "Mercury Drug"
            },
            new FormFileCollection { file }
        );
        httpContext.Request.Form = form;
        httpContext.Request.ContentType = "multipart/form-data";

        var result = await PublicRxEndpoints.SubmitDispenseMultipartAsync(
            _validToken,
            httpContext,
            _context,
            _publisher,
            NullLogger<PublicRxEndpoints>.Instance
        );

        var bad = Assert.IsAssignableFrom<IStatusCodeHttpResult>(result);
        Assert.Equal(StatusCodes.Status400BadRequest, bad.StatusCode);
    }

    [Fact]
    public async Task DispenseRelay_Multipart_Exceeds5MiB_Returns413PayloadTooLarge()
    {
        var httpContext = new DefaultHttpContext();
        var stream = new MemoryStream();
        var file = new FormFile(stream, 0, 5_242_881, "file", "large.pdf")
        {
            Headers = new HeaderDictionary(),
            ContentType = "application/pdf"
        };
        var form = new FormCollection(
            new Dictionary<string, Microsoft.Extensions.Primitives.StringValues>
            {
                ["externalPharmacyName"] = "Mercury Drug"
            },
            new FormFileCollection { file }
        );
        httpContext.Request.Form = form;
        httpContext.Request.ContentType = "multipart/form-data";

        var result = await PublicRxEndpoints.SubmitDispenseMultipartAsync(
            _validToken,
            httpContext,
            _context,
            _publisher,
            NullLogger<PublicRxEndpoints>.Instance
        );

        var tooLarge = Assert.IsAssignableFrom<IStatusCodeHttpResult>(result);
        Assert.Equal(StatusCodes.Status413PayloadTooLarge, tooLarge.StatusCode);
    }

    #endregion
}
