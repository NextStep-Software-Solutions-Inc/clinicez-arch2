namespace ClinicEz.Clinic.Application.Tests.Challenger;

using System;
using System.Collections.Generic;
using System.Linq;
using System.Security.Cryptography;
using System.Text;
using System.Text.Json;
using System.Text.Json.Nodes;
using System.Text.RegularExpressions;
using System.Threading;
using System.Threading.Tasks;
using ClinicEz.Clinic.Application.Common.Audit;
using ClinicEz.Clinic.Application.Common.Interfaces;
using ClinicEz.Clinic.Application.Common.Privacy;
using ClinicEz.Clinic.Domain.Entities;
using ClinicEz.Clinic.Domain.Interfaces;
using ClinicEz.Clinic.Infrastructure.Audit;
using ClinicEz.Clinic.Infrastructure.Persistence;
using ClinicEz.Clinic.Infrastructure.Privacy;
using FluentAssertions;
using Microsoft.EntityFrameworkCore;
using Microsoft.Extensions.Configuration;
using Microsoft.Extensions.DependencyInjection;
using Microsoft.Extensions.Logging.Abstractions;
using NSubstitute;
using Xunit;

/// <summary>
/// Empirical Adversarial Challenger Test Suite for Milestone 1:
/// Boundary & Isolation Verification
///
/// 1. Multi-Tenant Leakage Attack Simulation:
///    - Facility B attempts to access Facility A's audit entries via raw projections, LINQ joins,
///      subqueries, parameterized IDs, and aggregates.
///    - Verifies zero cross-facility data leakage under EF Core global query filters.
///
/// 2. Forensic Tamper Detection & SHA-256 Prose Checksumming:
///    - Verifies strict format compliance: sha256:<64-hex>.
///    - Demonstrates cryptographic avalanche effect: any 1-character difference completely alters the hash.
///    - Verifies large-scale collision resistance (1,000 distinct clinical narratives).
///    - Verifies non-repudiation: tampered prose alters the checksum inside redacted JSON.
///    - Verifies secrets are never checksummed (preventing offline rainbow table attacks).
///
/// 3. Worker Graceful Drain Verification:
///    - Simulates cancellation during heavy batching and partial batches.
///    - Verifies DrainRemainingAsync flushes 100% of pending in-memory messages before shutdown.
///    - Verifies zero message drop and complete PHI redaction during drain.
/// </summary>
public class Milestone1AuditBoundaryStressTests
{
    private static readonly Regex Sha256FormatRegex = new(@"^sha256:[0-9a-f]{64}$", RegexOptions.Compiled);

    private sealed class TestListLogger<T> : Microsoft.Extensions.Logging.ILogger<T>
    {
        public readonly List<string> Messages = new();
        public readonly List<Exception> Exceptions = new();

        public IDisposable? BeginScope<TState>(TState state) where TState : notnull => null;
        public bool IsEnabled(Microsoft.Extensions.Logging.LogLevel logLevel) => true;

        public void Log<TState>(
            Microsoft.Extensions.Logging.LogLevel logLevel,
            Microsoft.Extensions.Logging.EventId eventId,
            TState state,
            Exception? exception,
            Func<TState, Exception?, string> formatter)
        {
            var msg = formatter(state, exception);
            Messages.Add(msg);
            if (exception != null) Exceptions.Add(exception);
        }
    }

    private static (ApplicationDbContext context, Guid clinicAId, Guid clinicBId, string tenantId, DbContextOptions<ApplicationDbContext> options, IConfiguration config)
        CreateMultiTenantTestContext(string? dbName = null)
    {
        var clinicAId = Guid.NewGuid();
        var clinicBId = Guid.NewGuid();
        var tenantId = $"tenant_isolation_{Guid.NewGuid():N}";

        var config = new ConfigurationBuilder()
            .AddInMemoryCollection(new[]
            {
                new KeyValuePair<string, string?>("DbSchema", "public")
            })
            .Build();

        var resolvedDbName = dbName ?? $"ClinicEz_BoundaryStress_{Guid.NewGuid():N}";
        var options = new DbContextOptionsBuilder<ApplicationDbContext>()
            .UseInMemoryDatabase(databaseName: resolvedDbName)
            .Options;

        return (new ApplicationDbContext(options, config, null), clinicAId, clinicBId, tenantId, options, config);
    }

    private static IClinicContext CreateClinicContextMock(Guid? clinicId, string tenantId)
    {
        var mock = Substitute.For<IClinicContext>();
        mock.ClinicId.Returns(clinicId ?? Guid.Empty);
        mock.TenantId.Returns(tenantId);
        mock.StaffId.Returns((Guid?)Guid.NewGuid());
        return mock;
    }

    #region 1. Multi-Tenant Leakage Attack Simulation

    [Fact]
    public async Task MultiTenantAttack_RawProjection_FacilityBCannotProjectFacilityAEntries()
    {
        // Arrange
        var (seedContext, clinicAId, clinicBId, tenantId, options, config) = CreateMultiTenantTestContext();

        var entryAId = Guid.NewGuid();
        var entryBId = Guid.NewGuid();

        using (seedContext)
        {
            await seedContext.ClinicAuditEntries.AddRangeAsync(
                new ClinicAuditEntry
                {
                    Id = entryAId,
                    TenantId = tenantId,
                    ClinicId = clinicAId,
                    Timestamp = DateTime.UtcNow,
                    Category = "Clinical",
                    Severity = "Routine",
                    Action = "clinical.consultation.signed",
                    ActorName = "Dr. Alice (Facility A)",
                    ActorRole = "Doctor",
                    TargetEntityType = "ConsultationEncounter",
                    TargetEntityId = "enc-A-1",
                    Outcome = "Success",
                    Description = "Confidential encounter at Facility A",
                    MetadataJson = "{\"chiefComplaint\": \"Facility A Secret Diagnosis\"}"
                },
                new ClinicAuditEntry
                {
                    Id = entryBId,
                    TenantId = tenantId,
                    ClinicId = clinicBId,
                    Timestamp = DateTime.UtcNow,
                    Category = "Clinical",
                    Severity = "Routine",
                    Action = "clinical.consultation.signed",
                    ActorName = "Dr. Bob (Facility B)",
                    ActorRole = "Doctor",
                    TargetEntityType = "ConsultationEncounter",
                    TargetEntityId = "enc-B-1",
                    Outcome = "Success",
                    Description = "Consultation at Facility B",
                    MetadataJson = "{\"chiefComplaint\": \"Facility B Regular Checkup\"}"
                }
            );
            await seedContext.SaveChangesAsync();
        }

        // Act: Facility B executes raw projection selecting sensitive fields
        var contextBMock = CreateClinicContextMock(clinicBId, tenantId);
        using var contextB = new ApplicationDbContext(options, config, contextBMock);

        var projected = await contextB.ClinicAuditEntries
            .Select(x => new
            {
                x.Id,
                x.ClinicId,
                x.ActorName,
                x.Description,
                x.MetadataJson
            })
            .ToListAsync();

        // Assert: Facility B only receives its own record
        projected.Should().HaveCount(1);
        projected[0].Id.Should().Be(entryBId);
        projected[0].ClinicId.Should().Be(clinicBId);
        projected[0].ActorName.Should().Be("Dr. Bob (Facility B)");
        projected[0].Description.Should().Be("Consultation at Facility B");
        projected.Any(x => x.Id == entryAId).Should().BeFalse();
        projected.Any(x => x.ClinicId == clinicAId).Should().BeFalse();
    }

    [Fact]
    public async Task MultiTenantAttack_DirectParameterizedIdLookup_FacilityBCannotRetrieveFacilityAEntryById()
    {
        // Arrange
        var (seedContext, clinicAId, clinicBId, tenantId, options, config) = CreateMultiTenantTestContext();
        var targetFacilityAEntryId = Guid.NewGuid();

        using (seedContext)
        {
            await seedContext.ClinicAuditEntries.AddAsync(new ClinicAuditEntry
            {
                Id = targetFacilityAEntryId,
                TenantId = tenantId,
                ClinicId = clinicAId,
                Timestamp = DateTime.UtcNow,
                Category = "Security",
                Severity = "Emergency",
                Action = "auth.login.failure",
                ActorName = "Facility A Admin",
                ActorRole = "Admin",
                TargetEntityType = "StaffMember",
                TargetEntityId = "staff-A",
                Outcome = "Failure",
                Description = "Security alert in Facility A"
            });
            await seedContext.SaveChangesAsync();
        }

        // Act: Facility B attempts targeted queries knowing Facility A's exact Guid
        var contextBMock = CreateClinicContextMock(clinicBId, tenantId);
        using var contextB = new ApplicationDbContext(options, config, contextBMock);

        var queryById = await contextB.ClinicAuditEntries
            .Where(x => x.Id == targetFacilityAEntryId)
            .ToListAsync();

        var firstOrDefault = await contextB.ClinicAuditEntries
            .FirstOrDefaultAsync(x => x.Id == targetFacilityAEntryId);

        var singleOrDefault = await contextB.ClinicAuditEntries
            .SingleOrDefaultAsync(x => x.Id == targetFacilityAEntryId);

        var anyWithId = await contextB.ClinicAuditEntries
            .AnyAsync(x => x.Id == targetFacilityAEntryId);

        // Assert: Unconditionally null and empty
        queryById.Should().BeEmpty();
        firstOrDefault.Should().BeNull();
        singleOrDefault.Should().BeNull();
        anyWithId.Should().BeFalse();
    }

    [Fact]
    public async Task MultiTenantAttack_LinqJoinAndCrossEntityCorrelation_ZeroDataLeakage()
    {
        // Arrange
        var (seedContext, clinicAId, clinicBId, tenantId, options, config) = CreateMultiTenantTestContext();

        var sharedPatientId = Guid.NewGuid();
        var entryAId = Guid.NewGuid();
        var entryBId = Guid.NewGuid();

        using (seedContext)
        {
            // Patient in Facility B
            await seedContext.Patients.AddAsync(new ClinicPatient
            {
                Id = sharedPatientId,
                TenantId = tenantId,
                ClinicId = clinicBId,
                FirstName = "Juan",
                LastName = "Dela Cruz",
                PatientCode = "P-001",
                ContactNumber = "09171234567"
            });

            // Audit entry for Facility A referencing sharedPatientId (e.g. cross-facility referral attempt)
            await seedContext.ClinicAuditEntries.AddAsync(new ClinicAuditEntry
            {
                Id = entryAId,
                TenantId = tenantId,
                ClinicId = clinicAId,
                PatientId = sharedPatientId,
                Timestamp = DateTime.UtcNow,
                Category = "Clinical",
                Severity = "Urgent",
                Action = "clinical.referral.created",
                ActorName = "Dr. Alice (Facility A)",
                ActorRole = "Doctor",
                TargetEntityType = "ReferralLetter",
                Outcome = "Success",
                Description = "Confidential Facility A notes regarding patient"
            });

            // Audit entry for Facility B referencing sharedPatientId
            await seedContext.ClinicAuditEntries.AddAsync(new ClinicAuditEntry
            {
                Id = entryBId,
                TenantId = tenantId,
                ClinicId = clinicBId,
                PatientId = sharedPatientId,
                Timestamp = DateTime.UtcNow,
                Category = "Clinical",
                Severity = "Routine",
                Action = "clinical.triage.recorded",
                ActorName = "Nurse Bob (Facility B)",
                ActorRole = "Nurse",
                TargetEntityType = "TriageVitals",
                Outcome = "Success",
                Description = "Routine vitals recorded at Facility B"
            });

            await seedContext.SaveChangesAsync();
        }

        // Act: Facility B executes an inner join between Patients and ClinicAuditEntries
        var contextBMock = CreateClinicContextMock(clinicBId, tenantId);
        using var contextB = new ApplicationDbContext(options, config, contextBMock);

        var joined = await (from patient in contextB.Patients
                            join audit in contextB.ClinicAuditEntries on patient.Id equals audit.PatientId
                            select new
                            {
                                patient.PatientCode,
                                audit.Id,
                                audit.ClinicId,
                                audit.Description
                            }).ToListAsync();

        // Assert: Only Facility B's audit entry is joined; Facility A's entry is excluded
        joined.Should().HaveCount(1);
        joined[0].Id.Should().Be(entryBId);
        joined[0].ClinicId.Should().Be(clinicBId);
        joined[0].Description.Should().Be("Routine vitals recorded at Facility B");
    }

    [Fact]
    public async Task MultiTenantAttack_SubqueryAndOrClauses_FilterEnforcesStrictConjunction()
    {
        // Arrange
        var (seedContext, clinicAId, clinicBId, tenantId, options, config) = CreateMultiTenantTestContext();

        using (seedContext)
        {
            await seedContext.ClinicAuditEntries.AddRangeAsync(
                new ClinicAuditEntry
                {
                    Id = Guid.NewGuid(),
                    TenantId = tenantId,
                    ClinicId = clinicAId,
                    Timestamp = DateTime.UtcNow,
                    Category = "PhilHealth",
                    Severity = "Routine",
                    Action = "yakap.transmittal.generated",
                    ActorName = "Facility A Officer",
                    ActorRole = "Admin",
                    TargetEntityType = "YakapTransmittal",
                    Outcome = "Success",
                    Description = "Facility A Transmittal payload"
                },
                new ClinicAuditEntry
                {
                    Id = Guid.NewGuid(),
                    TenantId = tenantId,
                    ClinicId = clinicBId,
                    Timestamp = DateTime.UtcNow,
                    Category = "PhilHealth",
                    Severity = "Routine",
                    Action = "yakap.transmittal.generated",
                    ActorName = "Facility B Officer",
                    ActorRole = "Admin",
                    TargetEntityType = "YakapTransmittal",
                    Outcome = "Success",
                    Description = "Facility B Transmittal payload"
                }
            );
            await seedContext.SaveChangesAsync();
        }

        // Act: Facility B attempts an explicit OR query trying to expand scope to Facility A
        var contextBMock = CreateClinicContextMock(clinicBId, tenantId);
        using var contextB = new ApplicationDbContext(options, config, contextBMock);

        var maliciousOrQuery = await contextB.ClinicAuditEntries
            .Where(x => x.ClinicId == clinicAId || x.ClinicId == clinicBId)
            .ToListAsync();

        var hostileExplicitAQuery = await contextB.ClinicAuditEntries
            .Where(x => x.ClinicId == clinicAId)
            .ToListAsync();

        // Assert: EF Core conjunction enforces (x.ClinicId == CurrentClinicId) AND (caller predicate)
        maliciousOrQuery.Should().HaveCount(1);
        maliciousOrQuery[0].ClinicId.Should().Be(clinicBId);

        hostileExplicitAQuery.Should().BeEmpty();
    }

    [Fact]
    public async Task MultiTenantAttack_AggregatesAndCounts_ReflectZeroFacilityAContribution()
    {
        // Arrange
        var (seedContext, clinicAId, clinicBId, tenantId, options, config) = CreateMultiTenantTestContext();

        using (seedContext)
        {
            // Add 10 entries for Facility A
            for (int i = 0; i < 10; i++)
            {
                await seedContext.ClinicAuditEntries.AddAsync(new ClinicAuditEntry
                {
                    Id = Guid.NewGuid(),
                    TenantId = tenantId,
                    ClinicId = clinicAId,
                    Timestamp = DateTime.UtcNow,
                    Category = "Operations",
                    Severity = "Routine",
                    Action = $"op.facilityA.{i}",
                    ActorName = "Worker A",
                    ActorRole = "Staff",
                    TargetEntityType = "ClinicRoom",
                    Outcome = "Success",
                    Description = $"Op A {i}"
                });
            }

            // Add 3 entries for Facility B
            for (int i = 0; i < 3; i++)
            {
                await seedContext.ClinicAuditEntries.AddAsync(new ClinicAuditEntry
                {
                    Id = Guid.NewGuid(),
                    TenantId = tenantId,
                    ClinicId = clinicBId,
                    Timestamp = DateTime.UtcNow,
                    Category = "Operations",
                    Severity = "Routine",
                    Action = $"op.facilityB.{i}",
                    ActorName = "Worker B",
                    ActorRole = "Staff",
                    TargetEntityType = "ClinicRoom",
                    Outcome = "Success",
                    Description = $"Op B {i}"
                });
            }

            await seedContext.SaveChangesAsync();
        }

        // Act: Facility B checks aggregates
        var contextBMock = CreateClinicContextMock(clinicBId, tenantId);
        using var contextB = new ApplicationDbContext(options, config, contextBMock);

        var totalCount = await contextB.ClinicAuditEntries.CountAsync();
        var anyFromFacilityA = await contextB.ClinicAuditEntries.AnyAsync(x => x.ClinicId == clinicAId);
        var categories = await contextB.ClinicAuditEntries
            .GroupBy(x => x.Category)
            .Select(g => new { g.Key, Count = g.Count() })
            .ToListAsync();

        // Assert
        totalCount.Should().Be(3);
        anyFromFacilityA.Should().BeFalse();
        categories.Should().HaveCount(1);
        categories[0].Count.Should().Be(3);
    }

    [Fact]
    public async Task MultiTenantAttack_UnauthenticatedContext_YieldsZeroAuditEntries()
    {
        // Arrange
        var (seedContext, clinicAId, _, tenantId, options, config) = CreateMultiTenantTestContext();

        using (seedContext)
        {
            await seedContext.ClinicAuditEntries.AddAsync(new ClinicAuditEntry
            {
                Id = Guid.NewGuid(),
                TenantId = tenantId,
                ClinicId = clinicAId,
                Timestamp = DateTime.UtcNow,
                Category = "Security",
                Severity = "Emergency",
                Action = "auth.login.failure",
                ActorName = "Attacker",
                ActorRole = "Unknown",
                TargetEntityType = "StaffMember",
                Outcome = "Failure",
                Description = "Intrusion attempt"
            });
            await seedContext.SaveChangesAsync();
        }

        // Act: Unauthenticated caller (null ClinicContext or empty ClinicId)
        var nullClinicContext = CreateClinicContextMock(null, tenantId);
        using var unauthContext = new ApplicationDbContext(options, config, nullClinicContext);

        var entries = await unauthContext.ClinicAuditEntries.ToListAsync();

        // Assert: 0 entries returned
        entries.Should().BeEmpty();
    }

    #endregion

    #region 2. Forensic Tamper Detection & SHA-256 Prose Checksumming

    [Fact]
    public void Sha256ProseChecksum_StrictFormatSpecification_MatchesSha256HexPattern()
    {
        // Arrange
        var redactionService = new PhiRedactionService();

        var testProses = new[]
        {
            "Patient presented with sharp retrosternal chest pain radiating to left jaw.",
            "Normal physical exam findings. No murmurs, S1/S2 distinct.",
            "A",
            "1234567890",
            "Multi-line narrative:\nLine 1: Asthma diagnosis\nLine 2: Prescribed Salbutamol inhaler 100mcg."
        };

        // Act & Assert
        foreach (var prose in testProses)
        {
            var checksum = redactionService.ComputeTextChecksum(prose);

            checksum.Should().StartWith("sha256:");
            checksum.Length.Should().Be(71); // "sha256:" (7 chars) + 64 hex chars = 71
            Sha256FormatRegex.IsMatch(checksum).Should().BeTrue($"Checksum '{checksum}' must strictly match lowercase sha256:<64-hex>");
        }
    }

    [Fact]
    public void Sha256ProseChecksum_NullAndEmpty_ReturnsEmptyStringWithoutThrowing()
    {
        // Arrange
        var redactionService = new PhiRedactionService();

        // Act
        var nullResult = redactionService.ComputeTextChecksum(null);
        var emptyResult = redactionService.ComputeTextChecksum(string.Empty);

        // Assert
        nullResult.Should().BeEmpty();
        emptyResult.Should().BeEmpty();
    }

    [Fact]
    public void Sha256ProseChecksum_SingleCharacterAvalancheEffect_ProducesCompletelyDistinctHashes()
    {
        // Arrange
        var redactionService = new PhiRedactionService();

        var original = "Patient reports mild headache and fever of 38.0 C for 2 days.";
        // 1-character difference: '38.0' -> '38.1'
        var tampered1 = "Patient reports mild headache and fever of 38.1 C for 2 days.";
        // 1-character difference: trailing period removed
        var tampered2 = "Patient reports mild headache and fever of 38.0 C for 2 days";
        // 1-character difference: case change 'fever' -> 'Fever'
        var tampered3 = "Patient reports mild headache and Fever of 38.0 C for 2 days.";

        // Act
        var hashOrig = redactionService.ComputeTextChecksum(original);
        var hashT1 = redactionService.ComputeTextChecksum(tampered1);
        var hashT2 = redactionService.ComputeTextChecksum(tampered2);
        var hashT3 = redactionService.ComputeTextChecksum(tampered3);

        // Assert: Every single character difference produces a totally distinct hash
        hashOrig.Should().NotBe(hashT1);
        hashOrig.Should().NotBe(hashT2);
        hashOrig.Should().NotBe(hashT3);
        hashT1.Should().NotBe(hashT2);
        hashT2.Should().NotBe(hashT3);

        // Verify cryptographic avalanche: compare bit divergence (Hamming distance) between original and tampered1
        var hexOrig = hashOrig[7..];
        var hexT1 = hashT1[7..];

        int differingHexChars = 0;
        for (int i = 0; i < 64; i++)
        {
            if (hexOrig[i] != hexT1[i])
            {
                differingHexChars++;
            }
        }

        // In a secure hash like SHA-256, changing 1 byte flips ~50% of the bits (avalanche effect).
        // Out of 64 hex characters, at least 45 should differ.
        differingHexChars.Should().BeGreaterThan(45, "Cryptographic avalanche effect must alter majority of hash characters for 1-char difference.");
    }

    [Fact]
    public void Sha256ProseChecksum_MassCollisionResistance_ZeroCollisionsAcross1000Variations()
    {
        // Arrange
        var redactionService = new PhiRedactionService();
        const int sampleCount = 1000;
        var hashes = new HashSet<string>(sampleCount);

        // Act: Generate 1,000 distinct clinical prose sentences with subtle variations
        for (int i = 0; i < sampleCount; i++)
        {
            var prose = $"Patient #{i:D5} examined on 2026-10-17. Vitals: BP 12{i % 10}/80, HR {70 + (i % 30)}, Temp 36.{i % 9}C. Assessment: Clinical review step {i}.";
            var checksum = redactionService.ComputeTextChecksum(prose);

            Sha256FormatRegex.IsMatch(checksum).Should().BeTrue();
            var added = hashes.Add(checksum);
            added.Should().BeTrue($"Collision detected on iteration {i} for checksum {checksum}");
        }

        // Assert: 1,000 / 1,000 unique checksums
        hashes.Count.Should().Be(sampleCount);
    }

    [Fact]
    public void RedactPayloadJson_ProseTamperingNonRepudiation_ChecksumExposesAlteredNarrative()
    {
        // Arrange
        var redactionService = new PhiRedactionService();

        var originalJson = JsonSerializer.Serialize(new
        {
            encounterId = "enc-101",
            icd10Code = "J00",
            subjective = "Patient has severe acute pharyngitis and difficulty swallowing.",
            plan = "Prescribed Amoxicillin 500mg TID for 7 days."
        });

        // Adversary alters one word in subjective: "severe" -> "mild"
        var tamperedJson = JsonSerializer.Serialize(new
        {
            encounterId = "enc-101",
            icd10Code = "J00",
            subjective = "Patient has mild acute pharyngitis and difficulty swallowing.",
            plan = "Prescribed Amoxicillin 500mg TID for 7 days."
        });

        // Act: Redact both payloads
        var redactedOrig = redactionService.RedactPayloadJson(originalJson);
        var redactedTampered = redactionService.RedactPayloadJson(tamperedJson);

        var nodeOrig = JsonNode.Parse(redactedOrig)!.AsObject();
        var nodeTampered = JsonNode.Parse(redactedTampered)!.AsObject();

        // Assert:
        // 1. In both outputs, clinical text is sanitized to the compliance token
        nodeOrig["subjective"]!.GetValue<string>().Should().Be(PhiRedactionService.ClinicalRedactedToken);
        nodeTampered["subjective"]!.GetValue<string>().Should().Be(PhiRedactionService.ClinicalRedactedToken);

        // 2. Both outputs preserve structural data
        nodeOrig["icd10Code"]!.GetValue<string>().Should().Be("J00");
        nodeTampered["icd10Code"]!.GetValue<string>().Should().Be("J00");

        // 3. Plan checksum is identical because plan was untouched
        nodeOrig["planChecksum"]!.GetValue<string>().Should().Be(nodeTampered["planChecksum"]!.GetValue<string>());

        // 4. Subjective checksum is completely different, proving forensic tamper evidence!
        var origChecksum = nodeOrig["subjectiveChecksum"]!.GetValue<string>();
        var tamperedChecksum = nodeTampered["subjectiveChecksum"]!.GetValue<string>();

        origChecksum.Should().StartWith("sha256:");
        tamperedChecksum.Should().StartWith("sha256:");
        origChecksum.Should().NotBe(tamperedChecksum);
    }

    [Fact]
    public void RedactPayloadJson_SecretsNeverChecksummed_PreventsOfflineRainbowTableAttacks()
    {
        // Arrange
        var redactionService = new PhiRedactionService();

        var payloadWithSecrets = JsonSerializer.Serialize(new
        {
            staffId = "staff-01",
            password = "SuperSecretPassword123!",
            pin = "1234",
            token = "eyJhbGciOiJIUzI1NiIsInR5cCI6IkpXVCJ9.e30.t-IDcSemACt8x4iTMCda8Yhe3iZaWbvV5XKSTbuAn0M",
            apiKey = "clinic_live_key_998877",
            aesKey = "abcdef0123456789abcdef0123456789"
        });

        // Act
        var redacted = redactionService.RedactPayloadJson(payloadWithSecrets);
        var node = JsonNode.Parse(redacted)!.AsObject();

        // Assert: Secrets must be replaced with [REDACTED_SECRET], and NO secret checksums may exist!
        node["password"]!.GetValue<string>().Should().Be(PhiRedactionService.SecretRedactedToken);
        node["pin"]!.GetValue<string>().Should().Be(PhiRedactionService.SecretRedactedToken);
        node["token"]!.GetValue<string>().Should().Be(PhiRedactionService.SecretRedactedToken);
        node["apiKey"]!.GetValue<string>().Should().Be(PhiRedactionService.SecretRedactedToken);
        node["aesKey"]!.GetValue<string>().Should().Be(PhiRedactionService.SecretRedactedToken);

        node.ContainsKey("passwordChecksum").Should().BeFalse();
        node.ContainsKey("pinChecksum").Should().BeFalse();
        node.ContainsKey("tokenChecksum").Should().BeFalse();
        node.ContainsKey("apiKeyChecksum").Should().BeFalse();
        node.ContainsKey("aesKeyChecksum").Should().BeFalse();
    }

    [Fact]
    public void Sha256ProseChecksum_MultiByteUnicodeAndDiacritics_ComputesDeterministically()
    {
        // Arrange
        var redactionService = new PhiRedactionService();
        var filipinoClinicalText = "Pasensya ay may kahirapan sa paghinga, matinding ubo, at lagnat na 38.8°C; pinayuhan ng pahinga at pag-inom ng gamot.";

        // Act
        var hash1 = redactionService.ComputeTextChecksum(filipinoClinicalText);
        var hash2 = redactionService.ComputeTextChecksum(filipinoClinicalText);

        // Expected manual computation
        var utf8Bytes = Encoding.UTF8.GetBytes(filipinoClinicalText);
        var expectedHash = $"sha256:{Convert.ToHexStringLower(SHA256.HashData(utf8Bytes))}";

        // Assert
        hash1.Should().Be(expectedHash);
        hash2.Should().Be(expectedHash);
        Sha256FormatRegex.IsMatch(hash1).Should().BeTrue();
    }

    #endregion

    #region 3. Worker Graceful Drain Verification

    [Fact]
    public async Task WorkerDrain_PartialBatch_FlushesAllPendingMessagesOnCancellation()
    {
        // Arrange: 37 messages (< BatchSize 50)
        const int messageCount = 37;
        var services = new ServiceCollection();
        var config = new ConfigurationBuilder()
            .AddInMemoryCollection(new[]
            {
                new KeyValuePair<string, string?>("DbSchema", "public")
            })
            .Build();

        var dbName = $"ClinicEz_WorkerDrain_Partial_{Guid.NewGuid():N}";
        services.AddDbContext<ApplicationDbContext>(opts => opts.UseInMemoryDatabase(dbName));
        services.AddSingleton<IConfiguration>(config);
        services.AddSingleton<IPhiRedactionService, PhiRedactionService>();
        services.AddSingleton<IAuditLogQueue, AuditLogQueue>();

        var provider = services.BuildServiceProvider();
        var scopeFactory = provider.GetRequiredService<IServiceScopeFactory>();
        var queue = provider.GetRequiredService<IAuditLogQueue>();

        var clinicId = Guid.NewGuid();
        var tenantId = "tenant_worker_drain";

        for (int i = 0; i < messageCount; i++)
        {
            queue.TryEnqueue(new AuditLogMessage
            {
                TenantId = tenantId,
                ClinicId = clinicId,
                Timestamp = DateTime.UtcNow,
                Category = "Operations",
                Severity = "Routine",
                Action = $"op.action.{i}",
                ActorName = $"Staff {i}",
                ActorRole = "Staff",
                TargetEntityType = "ClinicRoom",
                TargetEntityId = $"room-{i}",
                Outcome = "Success",
                Description = $"Operation {i} in room {i}",
                MetadataJson = "{\"roomNumber\": " + i + "}"
            }).Should().BeTrue();
        }

        queue.Count.Should().Be(messageCount);

        var logger = new TestListLogger<AuditLogBackgroundWorker>();

        var worker = new AuditLogBackgroundWorker(
            queue,
            scopeFactory,
            logger);

        // Act: Start worker, let it run briefly, then stop/cancel
        await worker.StartAsync(CancellationToken.None);
        await Task.Delay(100);

        // Signal cancellation to simulate application shutdown
        await worker.StopAsync(CancellationToken.None);
        if (worker.ExecuteTask != null)
        {
            try
            {
                await worker.ExecuteTask;
            }
            catch (OperationCanceledException)
            {
            }
        }

        // Assert: Queue must be completely drained
        queue.Count.Should().Be(0, $"Logs: {string.Join(" | ", logger.Messages)}, Ex: {string.Join(" | ", logger.Exceptions.Select(e => e.Message))}");

        // Query database to verify all 37 records were flushed and persisted
        using var scope = scopeFactory.CreateScope();
        var db = scope.ServiceProvider.GetRequiredService<ApplicationDbContext>();
        var persisted = await db.ClinicAuditEntries.IgnoreQueryFilters().ToListAsync();

        persisted.Should().HaveCount(messageCount, "Worker graceful drain must flush all pending messages (< BatchSize) on shutdown");
        persisted.Select(p => p.Action).Distinct().Should().HaveCount(messageCount);
    }

    [Fact]
    public async Task WorkerDrain_MultipleBatchesUnderHeavyLoad_Flushes100PercentOfMessages()
    {
        // Arrange: 235 messages (4 full batches of 50 + 1 partial batch of 35)
        const int messageCount = 235;
        var services = new ServiceCollection();
        var config = new ConfigurationBuilder()
            .AddInMemoryCollection(new[]
            {
                new KeyValuePair<string, string?>("DbSchema", "public")
            })
            .Build();

        var dbName = $"ClinicEz_WorkerDrain_Multi_{Guid.NewGuid():N}";
        services.AddDbContext<ApplicationDbContext>(opts => opts.UseInMemoryDatabase(dbName));
        services.AddSingleton<IConfiguration>(config);
        services.AddSingleton<IPhiRedactionService, PhiRedactionService>();
        services.AddSingleton<IAuditLogQueue, AuditLogQueue>();

        var provider = services.BuildServiceProvider();
        var scopeFactory = provider.GetRequiredService<IServiceScopeFactory>();
        var queue = provider.GetRequiredService<IAuditLogQueue>();

        var clinicId = Guid.NewGuid();
        var tenantId = "tenant_worker_heavy";

        for (int i = 0; i < messageCount; i++)
        {
            queue.TryEnqueue(new AuditLogMessage
            {
                TenantId = tenantId,
                ClinicId = clinicId,
                Timestamp = DateTime.UtcNow,
                Category = "Billing",
                Severity = "Routine",
                Action = $"billing.payment.{i}",
                ActorName = "Cashier Bob",
                ActorRole = "Cashier",
                TargetEntityType = "Invoice",
                TargetEntityId = $"inv-{i}",
                Outcome = "Success",
                Description = $"Payment collected for inv-{i}",
                MetadataJson = "{\"amount\": " + (100 + i) + "}"
            }).Should().BeTrue();
        }

        queue.Count.Should().Be(messageCount);

        var worker = new AuditLogBackgroundWorker(
            queue,
            scopeFactory,
            NullLogger<AuditLogBackgroundWorker>.Instance);

        // Act: Start and stop worker under cancellation
        await worker.StartAsync(CancellationToken.None);
        await Task.Delay(100);
        await worker.StopAsync(CancellationToken.None);
        if (worker.ExecuteTask != null)
        {
            try
            {
                await worker.ExecuteTask;
            }
            catch (OperationCanceledException)
            {
            }
        }

        // Assert: Zero queue residue, 235 persisted entries in db
        queue.Count.Should().Be(0);

        using var scope = scopeFactory.CreateScope();
        var db = scope.ServiceProvider.GetRequiredService<ApplicationDbContext>();
        var persisted = await db.ClinicAuditEntries.IgnoreQueryFilters().ToListAsync();

        persisted.Should().HaveCount(messageCount, "Graceful drain must flush all 235 messages across multiple batch iterations.");
    }

    [Fact]
    public async Task WorkerDrain_ConcurrentProducersDuringShutdown_ZeroMessageLoss()
    {
        // Arrange
        const int concurrentWriters = 5;
        const int messagesPerWriter = 40;
        const int totalExpected = concurrentWriters * messagesPerWriter; // 200 messages

        var services = new ServiceCollection();
        var config = new ConfigurationBuilder()
            .AddInMemoryCollection(new[]
            {
                new KeyValuePair<string, string?>("DbSchema", "public")
            })
            .Build();

        var dbName = $"ClinicEz_WorkerDrain_Concurrent_{Guid.NewGuid():N}";
        services.AddDbContext<ApplicationDbContext>(opts => opts.UseInMemoryDatabase(dbName));
        services.AddSingleton<IConfiguration>(config);
        services.AddSingleton<IPhiRedactionService, PhiRedactionService>();
        services.AddSingleton<IAuditLogQueue, AuditLogQueue>();

        var provider = services.BuildServiceProvider();
        var scopeFactory = provider.GetRequiredService<IServiceScopeFactory>();
        var queue = provider.GetRequiredService<IAuditLogQueue>();

        var clinicId = Guid.NewGuid();
        var tenantId = "tenant_worker_concurrent";

        var logger = new TestListLogger<AuditLogBackgroundWorker>();
        var worker = new AuditLogBackgroundWorker(
            queue,
            scopeFactory,
            logger);

        await worker.StartAsync(CancellationToken.None);

        // Act: Producers concurrently enqueue messages
        var producerTasks = Enumerable.Range(0, concurrentWriters).Select(w => Task.Run(async () =>
        {
            for (int i = 0; i < messagesPerWriter; i++)
            {
                var msg = new AuditLogMessage
                {
                    TenantId = tenantId,
                    ClinicId = clinicId,
                    Category = "Clinical",
                    Severity = "Routine",
                    Action = $"clinical.concurrent.w{w}.m{i}",
                    ActorName = $"Doctor {w}",
                    ActorRole = "Doctor",
                    TargetEntityType = "ConsultationEncounter",
                    PatientName = $"Patient {w}-{i}",
                    Outcome = "Success",
                    Description = $"Concurrent encounter {w}-{i}",
                    MetadataJson = "{\"notes\": \"Confidential clinical text " + w + "-" + i + "\"}"
                };
                await queue.EnqueueAsync(msg);
            }
        })).ToArray();

        await Task.WhenAll(producerTasks);

        // Trigger shutdown and drain
        await worker.StopAsync(CancellationToken.None);
        if (worker.ExecuteTask != null)
        {
            try
            {
                await worker.ExecuteTask;
            }
            catch (OperationCanceledException)
            {
            }
        }

        // Assert
        queue.Count.Should().Be(0);

        using var scope = scopeFactory.CreateScope();
        var db = scope.ServiceProvider.GetRequiredService<ApplicationDbContext>();
        var persisted = await db.ClinicAuditEntries.IgnoreQueryFilters().ToListAsync();

        var actions = persisted.Select(x => x.Action).ToHashSet();
        var allExpected = Enumerable.Range(0, concurrentWriters)
            .SelectMany(w => Enumerable.Range(0, messagesPerWriter).Select(i => $"clinical.concurrent.w{w}.m{i}"))
            .ToList();
        var missing = allExpected.Where(a => !actions.Contains(a)).ToList();

        persisted.Should().HaveCount(totalExpected, $"Missing {missing.Count} items: {string.Join(", ", missing.Take(15))}. Logs: {string.Join(" | ", logger.Messages)}, Ex: {string.Join(" | ", logger.Exceptions.Select(e => e.ToString()))}");

        // Verify that PHI redaction was faithfully applied to all drained records
        foreach (var entry in persisted)
        {
            entry.PatientNameMasked.Should().Match("P*** *-*");
            entry.MetadataJson.Should().NotContain("Confidential clinical text");
            entry.MetadataJson.Should().Contain(PhiRedactionService.ClinicalRedactedToken);
            entry.MetadataJson.Should().Contain("notesChecksum");
        }
    }

    #endregion
}
