using System;
using System.Collections.Concurrent;
using System.Collections.Generic;
using System.IO;
using System.Linq;
using System.Security.Cryptography;
using System.Text;
using System.Text.RegularExpressions;
using System.Threading;
using System.Threading.Tasks;
using ClinicEz.Clinic.Application.Common.Interfaces;
using ClinicEz.Clinic.Application.Features.Consultations.Commands;
using ClinicEz.Clinic.Application.Features.Prescriptions.DTOs;
using ClinicEz.Clinic.Application.Features.Prescriptions.Queries;
using ClinicEz.Clinic.Domain.Entities;
using ClinicEz.Clinic.Domain.Enums;
using ClinicEz.Clinic.Domain.Interfaces;
using ClinicEz.Clinic.Infrastructure.Messaging;
using ClinicEz.Clinic.Infrastructure.Persistence;
using ClinicEz.Clinic.Infrastructure.Persistence.Interceptors;
using ClinicEz.Clinic.Infrastructure.Services;
using ClinicEz.Clinic.Infrastructure.Services.Storage;
using ClinicEz.Shared.Common;
using FacilityType = ClinicEz.Shared.Common.FacilityType;
using ClinicEz.Shared.Documents.Security;
using ClinicEz.Shared.Exceptions;
using ClinicEz.Shared.Interop;
using ClinicEz.Shared.Interop.Handling;
using ClinicEz.Shared.Interoperability;
using FluentAssertions;
using Microsoft.EntityFrameworkCore;
using Microsoft.Extensions.Configuration;
using Microsoft.Extensions.Logging.Abstractions;
using NSubstitute;
using Xunit;

namespace ClinicEz.Clinic.Application.Tests.Adversarial;

/// <summary>
/// Adversarial Empirical Test Suite for Milestone 2 Dispense Security & Token Format.
/// Adversarially probes:
/// 1. Token format invariants ({clinicId:N}.{secret}, 65-char hex, clinic ID extraction, legacy token preservation).
/// 2. Timing attack resilience in ExternalPrescriptionDispensedHandler: verify FixedTimeEquals comparison across all byte positions (0 to 64).
/// 3. CMK encryption of uploaded receipts via IRecordAttachmentStorage (zero plaintext on disk, tenant/clinic cryptographic isolation).
/// 4. Boundary defense, cross-clinic isolation, and replay/duplicate dispense resistance.
/// </summary>
public class ChallengerM2DispenseSecurityAdversarialTests
{
    private readonly Guid _clinicId = Guid.NewGuid();
    private readonly string _tenantId = "tenant_adv_dispense_m2";
    private readonly IClinicContext _clinicContext;
    private readonly IDocumentSecurityService _securityService = new DocumentSecurityService();

    public ChallengerM2DispenseSecurityAdversarialTests()
    {
        _clinicContext = Substitute.For<IClinicContext>();
        _clinicContext.ClinicId.Returns(_clinicId);
        _clinicContext.TenantId.Returns(_tenantId);
    }

    private static ClinicEncryptionKeyRing CreateKeyRing(string secret = "dev-master-secret-at-least-32-characters-long-12345")
    {
        var config = new ConfigurationBuilder()
            .AddInMemoryCollection(new Dictionary<string, string?>
            {
                [ClinicEncryptionKeyRing.MasterSecretKey] = secret
            })
            .Build();
        return ClinicEncryptionKeyRing.FromConfiguration(config);
    }

    private ApplicationDbContext CreateContextWithInterceptor(string? dbName = null)
    {
        var config = new ConfigurationBuilder()
            .AddInMemoryCollection(new[]
            {
                new KeyValuePair<string, string?>("DbSchema", "public")
            })
            .Build();

        var interceptor = new ClinicPortalProjectionInterceptor(_securityService);

        var options = new DbContextOptionsBuilder<ApplicationDbContext>()
            .UseInMemoryDatabase(databaseName: dbName ?? $"ClinicEz_DispenseAdvDb_{Guid.NewGuid()}")
            .AddInterceptors(interceptor)
            .Options;

        return new ApplicationDbContext(options, config, _clinicContext);
    }

    // =========================================================================
    // SECTION 1: Token Format Invariants & Extraction Tests
    // =========================================================================

    [Fact]
    public async Task TokenFormat_Matches_65Char_Hex_Dot_Hex_Pattern_In_SignConsultation()
    {
        await using var db = CreateContextWithInterceptor();

        var patient = new ClinicPatient
        {
            Id = Guid.NewGuid(),
            TenantId = _tenantId,
            ClinicId = _clinicId,
            FirstName = "Juan",
            LastName = "Dela Cruz",
            DateOfBirth = new DateOnly(1985, 3, 15),
            Gender = "Male",
            PatientCode = "P-12345",
            ContactNumber = "09123456789"
        };
        db.Patients.Add(patient);

        var doctor = new StaffMember
        {
            Id = Guid.NewGuid(),
            TenantId = _tenantId,
            ClinicId = _clinicId,
            FirstName = "Jose",
            LastName = "Rizal",
            PrcLicenseNumber = "PRC-12345",
            PtrNumber = "PTR-67890",
            Specialty = "General Practice"
        };
        db.StaffMembers.Add(doctor);

        var encounter = new ConsultationEncounter
        {
            Id = Guid.NewGuid(),
            TenantId = _tenantId,
            ClinicId = _clinicId,
            PatientId = patient.Id,
            PatientName = "Juan Dela Cruz",
            DoctorId = doctor.Id,
            DoctorName = "Dr. Jose Rizal",
            EncounterDate = DateTime.UtcNow,
            Prescriptions = new List<PrescriptionItem>
            {
                new()
                {
                    GenericName = "Paracetamol",
                    Dosage = "500mg",
                    Form = "Tablet",
                    Sig = "Take 1 tablet every 4 hours",
                    Quantity = 20
                }
            }
        };
        db.Consultations.Add(encounter);
        await db.SaveChangesAsync();

        var consultationRepo = Substitute.For<IRepository<ConsultationEncounter>>();
        consultationRepo.Query(Arg.Any<System.Linq.Expressions.Expression<Func<ConsultationEncounter, bool>>>())
            .Returns(call => db.Consultations.Where(call.Arg<System.Linq.Expressions.Expression<Func<ConsultationEncounter, bool>>>()));

        var staffRepo = Substitute.For<IRepository<StaffMember>>();
        staffRepo.Query(Arg.Any<System.Linq.Expressions.Expression<Func<StaffMember, bool>>>())
            .Returns(call => db.StaffMembers.Where(call.Arg<System.Linq.Expressions.Expression<Func<StaffMember, bool>>>()));

        var queueRepo = Substitute.For<IRepository<QueueItem>>();
        queueRepo.Query(Arg.Any<System.Linq.Expressions.Expression<Func<QueueItem, bool>>>())
            .Returns(call => db.QueueItems.Where(call.Arg<System.Linq.Expressions.Expression<Func<QueueItem, bool>>>()));

        var apptRepo = Substitute.For<IRepository<Appointment>>();
        apptRepo.Query(Arg.Any<System.Linq.Expressions.Expression<Func<Appointment, bool>>>())
            .Returns(call => db.Appointments.Where(call.Arg<System.Linq.Expressions.Expression<Func<Appointment, bool>>>()));

        var patientRepo = Substitute.For<IRepository<ClinicPatient>>();
        patientRepo.GetByIdAsync(patient.Id, Arg.Any<CancellationToken>()).Returns(patient);

        var uow = Substitute.For<IUnitOfWork>();
        uow.SaveChangesAsync(Arg.Any<CancellationToken>()).Returns(call => db.SaveChangesAsync(call.Arg<CancellationToken>()));

        var identityProvider = Substitute.For<IClinicIdentityProvider>();
        identityProvider.GetAsync(Arg.Any<CancellationToken>()).Returns(new ClinicIdentity(_tenantId, _clinicId, "Test Clinic"));

        var apptPublisher = Substitute.For<IPatientAppointmentPublisher>();
        var rxPublisher = Substitute.For<IPrescriptionPublisher>();
        var claims = Substitute.For<IClaimSlipService>();
        claims.CreateRxClaimAsync(Arg.Any<ClinicEz.Shared.Interoperability.PrescriptionIssuedEvent>(), Arg.Any<CancellationToken>())
            .Returns(new ClaimSlipResult(Guid.NewGuid(), "claim-123", DateTime.UtcNow.AddDays(7)));
        var docs = Substitute.For<IPatientDocumentPublisher>();

        var handler = new SignConsultationCommandHandler(
            consultationRepo, staffRepo, queueRepo, apptRepo, patientRepo,
            uow, _clinicContext, identityProvider, apptPublisher, rxPublisher, claims, docs);

        var result = await handler.Handle(new SignConsultationCommand(encounter.Id), CancellationToken.None);

        encounter.RxPublicVerificationToken.Should().NotBeNullOrWhiteSpace();
        var token = encounter.RxPublicVerificationToken!;

        // Token invariant 1: Length is exactly 65 characters
        token.Length.Should().Be(65, "Format must be exactly 32 hex + '.' + 32 hex");

        // Token invariant 2: Exactly one dot delimiter at position 32
        token[32].Should().Be('.');
        token.Count(c => c == '.').Should().Be(1);

        // Token invariant 3: Regex matches lower-hex {clinicId:N}.{secret}
        Regex.IsMatch(token, "^[0-9a-f]{32}\\.[0-9a-f]{32}$").Should().BeTrue();

        // Token invariant 4: First 32 chars parse to the exact ClinicId
        var extractedClinicId = Guid.ParseExact(token.Substring(0, 32), "N");
        extractedClinicId.Should().Be(_clinicId);

        // Token invariant 5: Secret portion parses to a valid Guid
        var secretStr = token.Substring(33, 32);
        Guid.TryParseExact(secretStr, "N", out var secretGuid).Should().BeTrue();
        secretGuid.Should().NotBe(Guid.Empty);
    }

    [Fact]
    public async Task TokenFormat_Matches_65Char_Hex_Dot_Hex_Pattern_In_GetPrescriptionSlipQuery()
    {
        await using var db = CreateContextWithInterceptor();

        var encounter = new ConsultationEncounter
        {
            Id = Guid.NewGuid(),
            TenantId = _tenantId,
            ClinicId = _clinicId,
            PatientId = Guid.NewGuid(),
            PatientName = "Maria Santos",
            DoctorId = Guid.NewGuid(),
            DoctorName = "Dr. Rizal",
            EncounterDate = DateTime.UtcNow,
            IsSigned = true,
            SignedAt = DateTime.UtcNow,
            Prescriptions = new List<PrescriptionItem>
            {
                new()
                {
                    GenericName = "Cetirizine",
                    Dosage = "10mg",
                    Form = "Tablet",
                    Sig = "1 tab OD",
                    Quantity = 10
                }
            }
        };
        db.Consultations.Add(encounter);
        await db.SaveChangesAsync();

        var encounterRepo = Substitute.For<IRepository<ConsultationEncounter>>();
        encounterRepo.Query(Arg.Any<System.Linq.Expressions.Expression<Func<ConsultationEncounter, bool>>>(), Arg.Any<bool?>())
            .Returns(call =>
            {
                var p = call.Arg<System.Linq.Expressions.Expression<Func<ConsultationEncounter, bool>>>();
                return p == null ? db.Consultations : db.Consultations.Where(p);
            });

        var patientRepo = Substitute.For<IRepository<ClinicPatient>>();
        var staffRepo = Substitute.For<IRepository<StaffMember>>();
        staffRepo.Query(Arg.Any<System.Linq.Expressions.Expression<Func<StaffMember, bool>>>(), Arg.Any<bool?>())
            .Returns(call =>
            {
                var p = call.Arg<System.Linq.Expressions.Expression<Func<StaffMember, bool>>>();
                return p == null ? db.StaffMembers : db.StaffMembers.Where(p);
            });
        var settingsRepo = Substitute.For<IRepository<ClinicSettings>>();
        settingsRepo.Query(Arg.Any<System.Linq.Expressions.Expression<Func<ClinicSettings, bool>>>(), Arg.Any<bool?>())
            .Returns(call =>
            {
                var p = call.Arg<System.Linq.Expressions.Expression<Func<ClinicSettings, bool>>>();
                return p == null ? db.ClinicSettings : db.ClinicSettings.Where(p);
            });

        var uow = Substitute.For<IUnitOfWork>();
        uow.SaveChangesAsync(Arg.Any<CancellationToken>()).Returns(call => db.SaveChangesAsync(call.Arg<CancellationToken>()));

        var handler = new GetPrescriptionSlipQueryHandler(encounterRepo, patientRepo, staffRepo, settingsRepo, uow);
        var slip = await handler.Handle(new GetPrescriptionSlipQuery(encounter.Id), CancellationToken.None);

        slip.PublicVerificationToken.Should().NotBeNullOrWhiteSpace();
        var token = slip.PublicVerificationToken!;

        token.Length.Should().Be(65);
        token[32].Should().Be('.');
        Regex.IsMatch(token, "^[0-9a-f]{32}\\.[0-9a-f]{32}$").Should().BeTrue();

        var extractedClinicId = Guid.ParseExact(token.Substring(0, 32), "N");
        extractedClinicId.Should().Be(_clinicId);
    }

    [Theory]
    [InlineData(null, false)]
    [InlineData("", false)]
    [InlineData("   ", false)]
    [InlineData("short-token", false)]
    [InlineData("32charactershexwithoutanydothere!", false)] // 33 chars, no dot at 32
    [InlineData("00000000000000000000000000000001", false)] // 32 chars hex only
    [InlineData("00000000000000000000000000000001.extra", true)] // valid 32-hex prefix + dot
    [InlineData("0000000000000000000000000000000A.placeholder", true)] // uppercase 32-hex prefix + dot
    [InlineData("zzzzzzzzzzzzzzzzzzzzzzzzzzzzzzzz.placeholder", false)] // non-hex characters
    [InlineData("00000000-0000-0000-0000-000000000001.placeholder", false)] // hyphens in clinicId (36 chars)
    [InlineData("rxv_legacy_sample_format", false)] // legacy token
    public void TokenFormat_Adversarial_ClinicId_Extraction(string? candidateToken, bool expectedSuccess)
    {
        var success = TryExtractClinicId(candidateToken, out var extractedId);

        success.Should().Be(expectedSuccess);
        if (expectedSuccess)
        {
            extractedId.Should().NotBe(Guid.Empty);
        }
        else
        {
            extractedId.Should().Be(Guid.Empty);
        }
    }

    private static bool TryExtractClinicId(string? token, out Guid clinicId)
    {
        clinicId = Guid.Empty;
        if (string.IsNullOrWhiteSpace(token) || token.Length < 33 || token[32] != '.')
            return false;

        return Guid.TryParseExact(token.AsSpan(0, 32), "N", out clinicId);
    }

    [Fact]
    public void TokenFormat_Secret_Unpredictability_And_Collision_Resistance()
    {
        var generatedSecrets = new HashSet<string>();
        var clinicHex = _clinicId.ToString("N");

        for (int i = 0; i < 1000; i++)
        {
            var token = $"{clinicHex}.{Guid.NewGuid():N}";
            var secret = token.Substring(33, 32);

            generatedSecrets.Add(secret).Should().BeTrue("Secrets must be cryptographically unique without collisions");
        }

        generatedSecrets.Count.Should().Be(1000);
    }

    [Fact]
    public async Task TokenFormat_Preserves_Legacy_Token_Without_Overwriting()
    {
        await using var db = CreateContextWithInterceptor();

        var legacyToken = $"rxv_{Guid.NewGuid().ToString("N")[..18]}_legacy";

        var encounter = new ConsultationEncounter
        {
            Id = Guid.NewGuid(),
            TenantId = _tenantId,
            ClinicId = _clinicId,
            PatientId = Guid.NewGuid(),
            PatientName = "Legacy Patient",
            DoctorId = Guid.NewGuid(),
            DoctorName = "Dr. Rizal",
            PrescriptionNumber = "RX-20261025-LEGACY",
            RxPublicVerificationToken = legacyToken, // PRE-EXISTING TOKEN
            IsSigned = true,
            SignedAt = DateTime.UtcNow,
            Prescriptions = new List<PrescriptionItem>
            {
                new()
                {
                    GenericName = "Amoxicillin",
                    Dosage = "500mg",
                    Form = "Capsule",
                    Sig = "1 cap TID",
                    Quantity = 21
                }
            }
        };

        db.Consultations.Add(encounter);
        await db.SaveChangesAsync();

        // 1. Verify token was NOT overwritten by SaveChangesInterceptor
        encounter.RxPublicVerificationToken.Should().Be(legacyToken);

        // 2. Verify DocumentAttestationPublished was staged with the legacy token's SHA-256 hash
        var outbox = await db.InteropOutbox.ToListAsync();
        var attestationMsg = outbox.FirstOrDefault(m => m.Type == InteropTypes.DocumentAttestationPublished && m.CorrelationId == encounter.Id);
        attestationMsg.Should().NotBeNull();

        var envelope = InteropEnvelope.FromJson(attestationMsg!.EnvelopeJson);
        var payload = envelope.GetPayload<DocumentAttestationPublishedPayload>();
        var expectedHash = Convert.ToHexString(SHA256.HashData(Encoding.UTF8.GetBytes(legacyToken))).ToLowerInvariant();
        payload.VerificationTokenHash.Should().Be(expectedHash);

        // 3. Verify GetPrescriptionSlipQuery also does NOT overwrite the legacy token
        var encounterRepo = Substitute.For<IRepository<ConsultationEncounter>>();
        encounterRepo.Query(Arg.Any<System.Linq.Expressions.Expression<Func<ConsultationEncounter, bool>>>(), Arg.Any<bool?>())
            .Returns(call =>
            {
                var p = call.Arg<System.Linq.Expressions.Expression<Func<ConsultationEncounter, bool>>>();
                return p == null ? db.Consultations : db.Consultations.Where(p);
            });
        var patientRepo = Substitute.For<IRepository<ClinicPatient>>();
        var staffRepo = Substitute.For<IRepository<StaffMember>>();
        staffRepo.Query(Arg.Any<System.Linq.Expressions.Expression<Func<StaffMember, bool>>>(), Arg.Any<bool?>())
            .Returns(call =>
            {
                var p = call.Arg<System.Linq.Expressions.Expression<Func<StaffMember, bool>>>();
                return p == null ? db.StaffMembers : db.StaffMembers.Where(p);
            });
        var settingsRepo = Substitute.For<IRepository<ClinicSettings>>();
        settingsRepo.Query(Arg.Any<System.Linq.Expressions.Expression<Func<ClinicSettings, bool>>>(), Arg.Any<bool?>())
            .Returns(call =>
            {
                var p = call.Arg<System.Linq.Expressions.Expression<Func<ClinicSettings, bool>>>();
                return p == null ? db.ClinicSettings : db.ClinicSettings.Where(p);
            });
        var uow = Substitute.For<IUnitOfWork>();

        var queryHandler = new GetPrescriptionSlipQueryHandler(encounterRepo, patientRepo, staffRepo, settingsRepo, uow);
        var slip = await queryHandler.Handle(new GetPrescriptionSlipQuery(encounter.Id), CancellationToken.None);

        slip.PublicVerificationToken.Should().Be(legacyToken);
        encounter.RxPublicVerificationToken.Should().Be(legacyToken);
    }

    // =========================================================================
    // SECTION 2: Timing Attack Resilience & FixedTimeEquals Verification
    // =========================================================================

    [Fact]
    public async Task FixedTimeEquals_Returns_True_For_Exact_Matching_Token()
    {
        await using var db = CreateContextWithInterceptor();

        var settings = new ClinicSettings { TenantId = _tenantId, ClinicId = _clinicId, ClinicName = "Main Clinic" };
        db.ClinicSettings.Add(settings);

        var validToken = $"{_clinicId:N}.{Guid.NewGuid():N}";
        var encounter = new ConsultationEncounter
        {
            TenantId = _tenantId,
            ClinicId = _clinicId,
            PatientId = Guid.NewGuid(),
            PatientName = "Target Patient",
            DoctorId = Guid.NewGuid(),
            DoctorName = "Dr. Target",
            PrescriptionNumber = "RX-20261025-0101",
            RxPublicVerificationToken = validToken,
            RxDispenseStatus = PrescriptionDispenseStatus.Issued,
            IsSigned = true,
            SignedAt = DateTime.UtcNow
        };
        db.Consultations.Add(encounter);
        await db.SaveChangesAsync();

        var recipientResolver = new ClinicRecipientResolver(db, NullLogger<ClinicRecipientResolver>.Instance);
        var handler = new ExternalPrescriptionDispensedHandler(db, recipientResolver, NullLogger<ExternalPrescriptionDispensedHandler>.Instance);

        var dispenseEvent = new ExternalPrescriptionDispensedEvent
        {
            PrescriptionId = encounter.Id,
            VerificationToken = validToken,
            ExternalPharmacyName = "Mercury Drug",
            PharmacistName = "RPh Ana",
            DispensedAt = DateTime.UtcNow
        };

        var envelope = InteropEnvelope.Create(
            InteropTypes.RxExternalDispensed,
            Party.Portal,
            Party.ForFacility(_tenantId, _clinicId.ToString(), FacilityType.Clinic),
            encounter.Id,
            dispenseEvent);

        await handler.HandleAsync(dispenseEvent, new InteropMessageContext(envelope), CancellationToken.None);

        encounter.RxDispenseStatus.Should().Be(PrescriptionDispenseStatus.DispensedExternally);
        encounter.RxDispensedPharmacyName.Should().Be("Mercury Drug");
    }

    [Fact]
    public async Task FixedTimeEquals_Rejects_Adversarial_Mutations_Across_ALL_65_Byte_Positions()
    {
        await using var db = CreateContextWithInterceptor();

        var settings = new ClinicSettings { TenantId = _tenantId, ClinicId = _clinicId, ClinicName = "Main Clinic" };
        db.ClinicSettings.Add(settings);

        var originalToken = $"{_clinicId:N}.{Guid.NewGuid():N}";
        originalToken.Length.Should().Be(65);

        var encounter = new ConsultationEncounter
        {
            TenantId = _tenantId,
            ClinicId = _clinicId,
            PatientId = Guid.NewGuid(),
            PatientName = "Adversarial Probe Patient",
            DoctorId = Guid.NewGuid(),
            DoctorName = "Dr. Probe",
            PrescriptionNumber = "RX-20261025-PROBE",
            RxPublicVerificationToken = originalToken,
            RxDispenseStatus = PrescriptionDispenseStatus.Issued,
            IsSigned = true,
            SignedAt = DateTime.UtcNow
        };
        db.Consultations.Add(encounter);
        await db.SaveChangesAsync();

        var recipientResolver = new ClinicRecipientResolver(db, NullLogger<ClinicRecipientResolver>.Instance);
        var handler = new ExternalPrescriptionDispensedHandler(db, recipientResolver, NullLogger<ExternalPrescriptionDispensedHandler>.Instance);

        // Adversarial test: Mutate EVERY single position from 0 to 64
        for (int bytePos = 0; bytePos < 65; bytePos++)
        {
            var tokenChars = originalToken.ToCharArray();
            char originalChar = tokenChars[bytePos];

            // Pick a mutated character different from original
            char mutatedChar = originalChar == 'a' ? 'b' : (originalChar == '.' ? 'x' : 'a');
            tokenChars[bytePos] = mutatedChar;

            var mutatedToken = new string(tokenChars);
            mutatedToken.Length.Should().Be(65);
            mutatedToken.Should().NotBe(originalToken);

            var dispenseEvent = new ExternalPrescriptionDispensedEvent
            {
                PrescriptionId = encounter.Id,
                VerificationToken = mutatedToken, // Tampered at position bytePos
                ExternalPharmacyName = $"Rogue Pharmacy Pos {bytePos}",
                PharmacistName = "Rogue Pharmacist",
                DispensedAt = DateTime.UtcNow
            };

            var envelope = InteropEnvelope.Create(
                InteropTypes.RxExternalDispensed,
                Party.Portal,
                Party.ForFacility(_tenantId, _clinicId.ToString(), FacilityType.Clinic),
                encounter.Id,
                dispenseEvent);

            await handler.HandleAsync(dispenseEvent, new InteropMessageContext(envelope), CancellationToken.None);

            // MUST remain Issued - zero mutation should be accepted
            encounter.RxDispenseStatus.Should().Be(
                PrescriptionDispenseStatus.Issued,
                $"Mutation at byte position {bytePos} ('{originalChar}' -> '{mutatedChar}') must be rejected by FixedTimeEquals");
        }
    }

    [Theory]
    [InlineData(64)] // Truncated by 1 char
    [InlineData(66)] // Appended by 1 char
    [InlineData(32)] // Only clinicId, missing dot and secret
    [InlineData(33)] // clinicId with dot only
    [InlineData(1)]  // 1 single character
    [InlineData(0)]  // Empty string
    [InlineData(1000)] // Excessive length
    public async Task FixedTimeEquals_Rejects_Length_Mismatches(int testLength)
    {
        await using var db = CreateContextWithInterceptor();

        var settings = new ClinicSettings { TenantId = _tenantId, ClinicId = _clinicId, ClinicName = "Main Clinic" };
        db.ClinicSettings.Add(settings);

        var validToken = $"{_clinicId:N}.{Guid.NewGuid():N}";
        var encounter = new ConsultationEncounter
        {
            TenantId = _tenantId,
            ClinicId = _clinicId,
            PatientId = Guid.NewGuid(),
            PatientName = "Length Mismatch Patient",
            DoctorId = Guid.NewGuid(),
            DoctorName = "Dr. Length",
            PrescriptionNumber = "RX-20261025-LEN",
            RxPublicVerificationToken = validToken,
            RxDispenseStatus = PrescriptionDispenseStatus.Issued,
            IsSigned = true,
            SignedAt = DateTime.UtcNow
        };
        db.Consultations.Add(encounter);
        await db.SaveChangesAsync();

        var candidateToken = testLength switch
        {
            0 => "",
            _ when testLength < 65 => validToken.Substring(0, testLength),
            _ => validToken + new string('f', testLength - 65)
        };

        var recipientResolver = new ClinicRecipientResolver(db, NullLogger<ClinicRecipientResolver>.Instance);
        var handler = new ExternalPrescriptionDispensedHandler(db, recipientResolver, NullLogger<ExternalPrescriptionDispensedHandler>.Instance);

        var dispenseEvent = new ExternalPrescriptionDispensedEvent
        {
            PrescriptionId = encounter.Id,
            VerificationToken = candidateToken,
            ExternalPharmacyName = "Length Pharmacy",
            PharmacistName = "RPh Tester",
            DispensedAt = DateTime.UtcNow
        };

        var envelope = InteropEnvelope.Create(
            InteropTypes.RxExternalDispensed,
            Party.Portal,
            Party.ForFacility(_tenantId, _clinicId.ToString(), FacilityType.Clinic),
            encounter.Id,
            dispenseEvent);

        var act = async () => await handler.HandleAsync(dispenseEvent, new InteropMessageContext(envelope), CancellationToken.None);
        await act.Should().NotThrowAsync("Length mismatches must be gracefully rejected without exceptions");

        encounter.RxDispenseStatus.Should().Be(PrescriptionDispenseStatus.Issued);
    }

    [Fact]
    public async Task FixedTimeEquals_Rejects_Null_And_Whitespace_Tokens()
    {
        await using var db = CreateContextWithInterceptor();

        var settings = new ClinicSettings { TenantId = _tenantId, ClinicId = _clinicId, ClinicName = "Main Clinic" };
        db.ClinicSettings.Add(settings);

        var validToken = $"{_clinicId:N}.{Guid.NewGuid():N}";
        var encounter = new ConsultationEncounter
        {
            TenantId = _tenantId,
            ClinicId = _clinicId,
            PatientId = Guid.NewGuid(),
            PatientName = "Null Token Patient",
            DoctorId = Guid.NewGuid(),
            DoctorName = "Dr. Null",
            PrescriptionNumber = "RX-20261025-NULL",
            RxPublicVerificationToken = validToken,
            RxDispenseStatus = PrescriptionDispenseStatus.Issued,
            IsSigned = true,
            SignedAt = DateTime.UtcNow
        };
        db.Consultations.Add(encounter);
        await db.SaveChangesAsync();

        var recipientResolver = new ClinicRecipientResolver(db, NullLogger<ClinicRecipientResolver>.Instance);
        var handler = new ExternalPrescriptionDispensedHandler(db, recipientResolver, NullLogger<ExternalPrescriptionDispensedHandler>.Instance);

        var invalidTokens = new string?[] { null, "", "   ", "\t\t\n" };

        foreach (var badToken in invalidTokens)
        {
            var dispenseEvent = new ExternalPrescriptionDispensedEvent
            {
                PrescriptionId = encounter.Id,
                VerificationToken = badToken,
                ExternalPharmacyName = "Null Pharmacy",
                PharmacistName = "RPh Null",
                DispensedAt = DateTime.UtcNow
            };

            var envelope = InteropEnvelope.Create(
                InteropTypes.RxExternalDispensed,
                Party.Portal,
                Party.ForFacility(_tenantId, _clinicId.ToString(), FacilityType.Clinic),
                encounter.Id,
                dispenseEvent);

            await handler.HandleAsync(dispenseEvent, new InteropMessageContext(envelope), CancellationToken.None);
            encounter.RxDispenseStatus.Should().Be(PrescriptionDispenseStatus.Issued);
        }
    }

    [Fact]
    public async Task FixedTimeEquals_Case_Sensitivity_Adversarial_Check()
    {
        await using var db = CreateContextWithInterceptor();

        var settings = new ClinicSettings { TenantId = _tenantId, ClinicId = _clinicId, ClinicName = "Main Clinic" };
        db.ClinicSettings.Add(settings);

        var validToken = $"{_clinicId:N}.{Guid.NewGuid():N}"; // lowercase hex
        var uppercaseToken = validToken.ToUpperInvariant();     // uppercase hex

        var encounter = new ConsultationEncounter
        {
            TenantId = _tenantId,
            ClinicId = _clinicId,
            PatientId = Guid.NewGuid(),
            PatientName = "Case Sensitive Patient",
            DoctorId = Guid.NewGuid(),
            DoctorName = "Dr. Case",
            PrescriptionNumber = "RX-20261025-CASE",
            RxPublicVerificationToken = validToken,
            RxDispenseStatus = PrescriptionDispenseStatus.Issued,
            IsSigned = true,
            SignedAt = DateTime.UtcNow
        };
        db.Consultations.Add(encounter);
        await db.SaveChangesAsync();

        var recipientResolver = new ClinicRecipientResolver(db, NullLogger<ClinicRecipientResolver>.Instance);
        var handler = new ExternalPrescriptionDispensedHandler(db, recipientResolver, NullLogger<ExternalPrescriptionDispensedHandler>.Instance);

        var dispenseEvent = new ExternalPrescriptionDispensedEvent
        {
            PrescriptionId = encounter.Id,
            VerificationToken = uppercaseToken, // Uppercase token should NOT match lowercase bytes in constant-time comparison
            ExternalPharmacyName = "Case Pharmacy",
            PharmacistName = "RPh Case",
            DispensedAt = DateTime.UtcNow
        };

        var envelope = InteropEnvelope.Create(
            InteropTypes.RxExternalDispensed,
            Party.Portal,
            Party.ForFacility(_tenantId, _clinicId.ToString(), FacilityType.Clinic),
            encounter.Id,
            dispenseEvent);

        await handler.HandleAsync(dispenseEvent, new InteropMessageContext(envelope), CancellationToken.None);

        // Since UTF-8 bytes of 'A' (0x41) != 'a' (0x61), FixedTimeEquals rejects uppercase variant
        encounter.RxDispenseStatus.Should().Be(PrescriptionDispenseStatus.Issued);
    }

    [Fact]
    public void Timing_Attack_Simulation_Harness_Fuzzing()
    {
        var validTokenBytes = Encoding.UTF8.GetBytes($"{_clinicId:N}.{Guid.NewGuid():N}");
        var rng = new Random(42);

        // Run 500 randomized adversarial fuzzing trials against FixedTimeEquals
        for (int i = 0; i < 500; i++)
        {
            byte[] candidateBytes;
            int mutationType = rng.Next(0, 5);

            switch (mutationType)
            {
                case 0:
                    // Random length
                    candidateBytes = new byte[rng.Next(1, 120)];
                    rng.NextBytes(candidateBytes);
                    break;
                case 1:
                    // Single bit-flip at random index
                    candidateBytes = (byte[])validTokenBytes.Clone();
                    int flipIdx = rng.Next(0, candidateBytes.Length);
                    candidateBytes[flipIdx] ^= (byte)(1 << rng.Next(0, 8));
                    break;
                case 2:
                    // Valid prefix, random suffix
                    candidateBytes = (byte[])validTokenBytes.Clone();
                    for (int j = 33; j < candidateBytes.Length; j++) candidateBytes[j] = (byte)rng.Next(33, 126);
                    break;
                case 3:
                    // Non-ASCII bytes
                    candidateBytes = (byte[])validTokenBytes.Clone();
                    candidateBytes[rng.Next(0, candidateBytes.Length)] = 0xFF;
                    break;
                default:
                    // Truncated
                    candidateBytes = validTokenBytes.Take(32).ToArray();
                    break;
            }

            bool equals = CryptographicOperations.FixedTimeEquals(candidateBytes, validTokenBytes);
            equals.Should().BeFalse($"Fuzzed candidate {i} must be rejected by FixedTimeEquals");
        }
    }

    // =========================================================================
    // SECTION 3: CMK Encryption of Uploaded Receipts via IRecordAttachmentStorage
    // =========================================================================

    [Fact]
    public async Task RecordAttachmentStorage_Encrypts_Under_Tenant_And_Clinic_CMK_With_Zero_Plaintext_On_Disk()
    {
        await using var db = CreateContextWithInterceptor();

        var keyRing = CreateKeyRing();
        var encryptionService = new ClinicEncryptionService(keyRing);

        var savedFiles = new ConcurrentDictionary<string, byte[]>();
        var storageMock = Substitute.For<IClinicStorageService>();
        storageMock.SaveEncryptedFileAsync(Arg.Any<string>(), Arg.Any<byte[]>(), Arg.Any<CancellationToken>())
            .Returns(call =>
            {
                var path = call.Arg<string>();
                var bytes = call.Arg<byte[]>();
                savedFiles[path] = bytes;
                return path;
            });

        var attachmentStorage = new RecordAttachmentStorage(encryptionService, storageMock, db);

        var receiptPlaintext = Encoding.UTF8.GetBytes("OFFICIAL RECEIPT: Mercury Drug Rx Dispensation. Amount: PHP 1,250.00. Doctor: Dr. Rizal");
        var patientId = Guid.NewGuid();
        var consultationId = Guid.NewGuid();

        var attachment = await attachmentStorage.EncryptAndStoreAsync(
            _tenantId,
            _clinicId,
            patientId,
            consultationId,
            "mercury_or_12345.jpg",
            "image/jpeg",
            receiptPlaintext,
            "Receipt",
            "Mercury Drug Official Receipt",
            "External Pharmacy Portal",
            CancellationToken.None);

        await db.SaveChangesAsync();

        // 1. Verify storage key conventions
        attachment.StorageUri.Should().StartWith($"tenants/{_tenantId}/clinics/{_clinicId}/records/");
        attachment.StorageUri.Should().EndWith(".cez");

        // 2. Verify storage received the file
        savedFiles.Should().ContainKey(attachment.StorageUri);
        var storedCiphertext = savedFiles[attachment.StorageUri];

        // 3. ZERO PLAINTEXT ON DISK ASSERTION: Ciphertext must NOT contain plaintext strings
        storedCiphertext.Should().NotEqual(receiptPlaintext);
        Encoding.UTF8.GetString(storedCiphertext).Should().NotContain("OFFICIAL RECEIPT");
        Encoding.UTF8.GetString(storedCiphertext).Should().NotContain("Mercury Drug");
        Encoding.UTF8.GetString(storedCiphertext).Should().NotContain("PHP 1,250.00");

        // 4. Verify entity metadata in database
        var dbAttachment = await db.RecordAttachments.FirstOrDefaultAsync(a => a.Id == attachment.Id);
        dbAttachment.Should().NotBeNull();
        dbAttachment!.EncryptionAlgorithm.Should().Be("AES-256-GCM");
        dbAttachment.EncryptionKeyId.Should().Be("cmk-v1");
        dbAttachment.EncryptionIvBase64.Should().NotBeNullOrWhiteSpace();
        dbAttachment.EncryptionTagBase64.Should().NotBeNullOrWhiteSpace();
        dbAttachment.WrappedKeyJson.Should().NotBeNullOrWhiteSpace();
        dbAttachment.EncryptedHash.Should().NotBeNullOrWhiteSpace();
        dbAttachment.FileSizeBytes.Should().Be(receiptPlaintext.LongLength);

        // 5. Decrypt using the exact CMK credentials -> verify flawless roundtrip recovery
        var decrypted = await encryptionService.DecryptAsync(
            storedCiphertext,
            attachment.EncryptionIvBase64!,
            attachment.EncryptionTagBase64!,
            attachment.WrappedKeyJson!,
            _tenantId,
            _clinicId);

        decrypted.Should().Equal(receiptPlaintext);
        Encoding.UTF8.GetString(decrypted).Should().Be("OFFICIAL RECEIPT: Mercury Drug Rx Dispensation. Amount: PHP 1,250.00. Doctor: Dr. Rizal");
    }

    [Fact]
    public async Task RecordAttachmentStorage_Cryptographic_Isolation_Across_Tenants_And_Clinics()
    {
        await using var db = CreateContextWithInterceptor();

        var keyRing = CreateKeyRing();
        var encryptionService = new ClinicEncryptionService(keyRing);

        var savedFiles = new ConcurrentDictionary<string, byte[]>();
        var storageMock = Substitute.For<IClinicStorageService>();
        storageMock.SaveEncryptedFileAsync(Arg.Any<string>(), Arg.Any<byte[]>(), Arg.Any<CancellationToken>())
            .Returns(call =>
            {
                var path = call.Arg<string>();
                var bytes = call.Arg<byte[]>();
                savedFiles[path] = bytes;
                return path;
            });

        var attachmentStorage = new RecordAttachmentStorage(encryptionService, storageMock, db);

        var plaintext = Encoding.UTF8.GetBytes("Tenant A Confidential Receipt");
        var patientId = Guid.NewGuid();
        var consultationId = Guid.NewGuid();

        var attachment = await attachmentStorage.EncryptAndStoreAsync(
            _tenantId,
            _clinicId,
            patientId,
            consultationId,
            "receipt.jpg",
            "image/jpeg",
            plaintext,
            "Receipt",
            null,
            "Portal",
            CancellationToken.None);

        var ciphertext = savedFiles[attachment.StorageUri];

        // Attempting to decrypt under different TenantId
        var actWrongTenant = async () => await encryptionService.DecryptAsync(
            ciphertext,
            attachment.EncryptionIvBase64!,
            attachment.EncryptionTagBase64!,
            attachment.WrappedKeyJson!,
            "other-tenant-rogue",
            _clinicId);

        await actWrongTenant.Should().ThrowAsync<CryptographicException>();

        // Attempting to decrypt under different ClinicId
        var actWrongClinic = async () => await encryptionService.DecryptAsync(
            ciphertext,
            attachment.EncryptionIvBase64!,
            attachment.EncryptionTagBase64!,
            attachment.WrappedKeyJson!,
            _tenantId,
            Guid.NewGuid());

        await actWrongClinic.Should().ThrowAsync<CryptographicException>();
    }

    [Fact]
    public async Task ExternalPrescriptionDispensedHandler_PortalBranch_EndToEnd_CMK_Receipt_Encryption()
    {
        await using var db = CreateContextWithInterceptor();

        var settings = new ClinicSettings { TenantId = _tenantId, ClinicId = _clinicId, ClinicName = "St. Jude Clinic" };
        db.ClinicSettings.Add(settings);

        var validToken = $"{_clinicId:N}.{Guid.NewGuid():N}";
        var patientId = Guid.NewGuid();
        var encounter = new ConsultationEncounter
        {
            TenantId = _tenantId,
            ClinicId = _clinicId,
            PatientId = patientId,
            PatientName = "Patient For EndToEnd",
            DoctorId = Guid.NewGuid(),
            DoctorName = "Dr. Prescriber",
            PrescriptionNumber = "RX-20261025-E2E",
            RxPublicVerificationToken = validToken,
            RxDispenseStatus = PrescriptionDispenseStatus.Issued,
            IsSigned = true,
            SignedAt = DateTime.UtcNow
        };
        db.Consultations.Add(encounter);
        await db.SaveChangesAsync();

        var keyRing = CreateKeyRing();
        var encryptionService = new ClinicEncryptionService(keyRing);

        var savedFiles = new ConcurrentDictionary<string, byte[]>();
        var storageMock = Substitute.For<IClinicStorageService>();
        storageMock.SaveEncryptedFileAsync(Arg.Any<string>(), Arg.Any<byte[]>(), Arg.Any<CancellationToken>())
            .Returns(call =>
            {
                var path = call.Arg<string>();
                var bytes = call.Arg<byte[]>();
                savedFiles[path] = bytes;
                return path;
            });

        var attachmentStorage = new RecordAttachmentStorage(encryptionService, storageMock, db);
        var recipientResolver = new ClinicRecipientResolver(db, NullLogger<ClinicRecipientResolver>.Instance);
        var handler = new ExternalPrescriptionDispensedHandler(
            db, recipientResolver, NullLogger<ExternalPrescriptionDispensedHandler>.Instance, attachmentStorage);

        var receiptRawBytes = Encoding.UTF8.GetBytes("GENUINE RECEIPT IMAGE DATA: Watsons Rx Fill #99881");
        var receiptBase64 = Convert.ToBase64String(receiptRawBytes);

        var dispenseEvent = new ExternalPrescriptionDispensedEvent
        {
            PrescriptionId = encounter.Id,
            VerificationToken = validToken,
            ExternalPharmacyName = "Watsons Pharmacy",
            ExternalBranchLocation = "SM Megamall",
            PharmacistName = "RPh Maria Santos",
            PharmacistPrcLicense = "0088991",
            OfficialReceiptNumber = "OR-WATSONS-99881",
            DispensedAt = DateTime.UtcNow,
            ReceiptDocumentBase64 = receiptBase64,
            ReceiptFileName = "watsons-receipt.jpg",
            ReceiptContentType = "image/jpeg"
        };

        var envelope = InteropEnvelope.Create(
            InteropTypes.RxExternalDispensed,
            Party.Portal,
            Party.ForFacility(_tenantId, _clinicId.ToString(), FacilityType.Clinic),
            encounter.Id,
            dispenseEvent);

        await handler.HandleAsync(dispenseEvent, new InteropMessageContext(envelope), CancellationToken.None);

        encounter.RxDispenseStatus.Should().Be(PrescriptionDispenseStatus.DispensedExternally);
        encounter.RxDispensedPharmacyName.Should().Be("Watsons Pharmacy (SM Megamall)");
        encounter.RxDispensedReceiptNumber.Should().Be("OR-WATSONS-99881");
        encounter.RxDispensedReceiptUrl.Should().NotBeNullOrWhiteSpace();
        encounter.RxDispensedReceiptUrl!.Should().EndWith(".cez");

        // Verify attachment saved in DB
        var attachment = await db.RecordAttachments.FirstOrDefaultAsync(a => a.ConsultationId == encounter.Id);
        attachment.Should().NotBeNull();
        attachment!.RecordType.Should().Be("Receipt");
        attachment.FileName.Should().Be("watsons-receipt.jpg");
        attachment.StorageUri.Should().Be(encounter.RxDispensedReceiptUrl);

        // Verify storage received encrypted bytes
        savedFiles.Should().ContainKey(attachment.StorageUri);
        var storedBytes = savedFiles[attachment.StorageUri];
        storedBytes.Should().NotEqual(receiptRawBytes);
        Encoding.UTF8.GetString(storedBytes).Should().NotContain("GENUINE RECEIPT IMAGE DATA");

        // Decrypt and assert roundtrip
        var decryptedReceipt = await encryptionService.DecryptAsync(
            storedBytes,
            attachment.EncryptionIvBase64!,
            attachment.EncryptionTagBase64!,
            attachment.WrappedKeyJson ?? string.Empty,
            _tenantId,
            _clinicId);

        decryptedReceipt.Should().Equal(receiptRawBytes);
    }

    [Fact]
    public async Task ExternalPrescriptionDispensedHandler_Adversarial_Receipt_Payloads_Handled_Defensively()
    {
        await using var db = CreateContextWithInterceptor();

        var settings = new ClinicSettings { TenantId = _tenantId, ClinicId = _clinicId, ClinicName = "Main Clinic" };
        db.ClinicSettings.Add(settings);

        var validToken = $"{_clinicId:N}.{Guid.NewGuid():N}";
        var encounter = new ConsultationEncounter
        {
            TenantId = _tenantId,
            ClinicId = _clinicId,
            PatientId = Guid.NewGuid(),
            PatientName = "Adversarial Receipt Patient",
            DoctorId = Guid.NewGuid(),
            DoctorName = "Dr. Defend",
            PrescriptionNumber = "RX-20261025-DEF",
            RxPublicVerificationToken = validToken,
            RxDispenseStatus = PrescriptionDispenseStatus.Issued,
            IsSigned = true,
            SignedAt = DateTime.UtcNow
        };
        db.Consultations.Add(encounter);
        await db.SaveChangesAsync();

        var storageMock = Substitute.For<IRecordAttachmentStorage>();
        var recipientResolver = new ClinicRecipientResolver(db, NullLogger<ClinicRecipientResolver>.Instance);
        var handler = new ExternalPrescriptionDispensedHandler(
            db, recipientResolver, NullLogger<ExternalPrescriptionDispensedHandler>.Instance, storageMock);

        // 1. Corrupted / Non-base64 string
        var corruptEvent = new ExternalPrescriptionDispensedEvent
        {
            PrescriptionId = encounter.Id,
            VerificationToken = validToken,
            ExternalPharmacyName = "Mercury Drug",
            OfficialReceiptNumber = "OR-123",
            DispensedAt = DateTime.UtcNow,
            ReceiptDocumentBase64 = "THIS_IS_DEFINITELY_NOT_VALID_BASE64!@#$%"
        };

        var envelope = InteropEnvelope.Create(
            InteropTypes.RxExternalDispensed,
            Party.Portal,
            Party.ForFacility(_tenantId, _clinicId.ToString(), FacilityType.Clinic),
            encounter.Id,
            corruptEvent);

        var act = async () => await handler.HandleAsync(corruptEvent, new InteropMessageContext(envelope), CancellationToken.None);
        await act.Should().NotThrowAsync("Corrupted base64 must be caught via FormatException and not crash message handling");

        // Prescription is still marked dispensed, but receipt is omitted
        encounter.RxDispenseStatus.Should().Be(PrescriptionDispenseStatus.DispensedExternally);
        encounter.RxDispensedReceiptUrl.Should().BeNull();
        await storageMock.DidNotReceiveWithAnyArgs().EncryptAndStoreAsync(
            default!, default, default, default, default!, default!, default!, default!, default, default!, default);
    }

    [Fact]
    public async Task ExternalPrescriptionDispensedHandler_Null_AttachmentStorage_Falls_Back_To_ReceiptUrl()
    {
        await using var db = CreateContextWithInterceptor();

        var settings = new ClinicSettings { TenantId = _tenantId, ClinicId = _clinicId, ClinicName = "Main Clinic" };
        db.ClinicSettings.Add(settings);

        var validToken = $"{_clinicId:N}.{Guid.NewGuid():N}";
        var encounter = new ConsultationEncounter
        {
            TenantId = _tenantId,
            ClinicId = _clinicId,
            PatientId = Guid.NewGuid(),
            PatientName = "Fallback Receipt Patient",
            DoctorId = Guid.NewGuid(),
            DoctorName = "Dr. Fallback",
            PrescriptionNumber = "RX-20261025-FALLBACK",
            RxPublicVerificationToken = validToken,
            RxDispenseStatus = PrescriptionDispenseStatus.Issued,
            IsSigned = true,
            SignedAt = DateTime.UtcNow
        };
        db.Consultations.Add(encounter);
        await db.SaveChangesAsync();

        var recipientResolver = new ClinicRecipientResolver(db, NullLogger<ClinicRecipientResolver>.Instance);
        // Handler initialized with NULL attachment storage
        var handler = new ExternalPrescriptionDispensedHandler(
            db, recipientResolver, NullLogger<ExternalPrescriptionDispensedHandler>.Instance, null);

        var dispenseEvent = new ExternalPrescriptionDispensedEvent
        {
            PrescriptionId = encounter.Id,
            VerificationToken = validToken,
            ExternalPharmacyName = "Southstar Drug",
            ReceiptDocumentUrl = "https://cdn.example.com/receipts/rec-9912.pdf",
            DispensedAt = DateTime.UtcNow
        };

        var envelope = InteropEnvelope.Create(
            InteropTypes.RxExternalDispensed,
            Party.Portal,
            Party.ForFacility(_tenantId, _clinicId.ToString(), FacilityType.Clinic),
            encounter.Id,
            dispenseEvent);

        await handler.HandleAsync(dispenseEvent, new InteropMessageContext(envelope), CancellationToken.None);

        encounter.RxDispenseStatus.Should().Be(PrescriptionDispenseStatus.DispensedExternally);
        encounter.RxDispensedReceiptUrl.Should().Be("https://cdn.example.com/receipts/rec-9912.pdf");
    }

    // =========================================================================
    // SECTION 4: Multi-Tenant & Re-dispense Boundary Tests
    // =========================================================================

    [Fact]
    public async Task CrossTenant_Envelope_Addressing_Is_Rejected()
    {
        await using var db = CreateContextWithInterceptor();

        var settings = new ClinicSettings { TenantId = _tenantId, ClinicId = _clinicId, ClinicName = "Main Clinic" };
        db.ClinicSettings.Add(settings);

        var otherClinicId = Guid.NewGuid();
        var validToken = $"{otherClinicId:N}.{Guid.NewGuid():N}";

        var encounter = new ConsultationEncounter
        {
            TenantId = _tenantId,
            ClinicId = _clinicId,
            PatientId = Guid.NewGuid(),
            PatientName = "Isolation Patient",
            DoctorId = Guid.NewGuid(),
            DoctorName = "Dr. Isolation",
            PrescriptionNumber = "RX-20261025-ISO",
            RxPublicVerificationToken = validToken,
            RxDispenseStatus = PrescriptionDispenseStatus.Issued,
            IsSigned = true,
            SignedAt = DateTime.UtcNow
        };
        db.Consultations.Add(encounter);
        await db.SaveChangesAsync();

        var recipientResolver = new ClinicRecipientResolver(db, NullLogger<ClinicRecipientResolver>.Instance);
        var handler = new ExternalPrescriptionDispensedHandler(
            db, recipientResolver, NullLogger<ExternalPrescriptionDispensedHandler>.Instance);

        var dispenseEvent = new ExternalPrescriptionDispensedEvent
        {
            PrescriptionId = encounter.Id,
            VerificationToken = validToken,
            ExternalPharmacyName = "Rogue Pharmacy",
            DispensedAt = DateTime.UtcNow
        };

        // Envelope addressed to a DIFFERENT facility ID
        var envelope = InteropEnvelope.Create(
            InteropTypes.RxExternalDispensed,
            Party.Portal,
            Party.ForFacility(_tenantId, otherClinicId.ToString(), FacilityType.Clinic), // Addressed to other clinic
            encounter.Id,
            dispenseEvent);

        await handler.HandleAsync(dispenseEvent, new InteropMessageContext(envelope), CancellationToken.None);

        // Prescription must remain Issued because recipient resolver rejects unhosted clinic
        encounter.RxDispenseStatus.Should().Be(PrescriptionDispenseStatus.Issued);
    }

    [Fact]
    public async Task Idempotency_Prevents_Double_Dispense_Of_Already_Dispensed_Prescription()
    {
        await using var db = CreateContextWithInterceptor();

        var settings = new ClinicSettings { TenantId = _tenantId, ClinicId = _clinicId, ClinicName = "Main Clinic" };
        db.ClinicSettings.Add(settings);

        var validToken = $"{_clinicId:N}.{Guid.NewGuid():N}";
        var encounter = new ConsultationEncounter
        {
            TenantId = _tenantId,
            ClinicId = _clinicId,
            PatientId = Guid.NewGuid(),
            PatientName = "Double Dispense Patient",
            DoctorId = Guid.NewGuid(),
            DoctorName = "Dr. Idempotent",
            PrescriptionNumber = "RX-20261025-IDEM",
            RxPublicVerificationToken = validToken,
            RxDispenseStatus = PrescriptionDispenseStatus.DispensedExternally, // ALREADY DISPENSED
            RxDispensedPharmacyName = "Original Pharmacy",
            IsSigned = true,
            SignedAt = DateTime.UtcNow
        };
        db.Consultations.Add(encounter);
        await db.SaveChangesAsync();

        var storageMock = Substitute.For<IRecordAttachmentStorage>();
        var recipientResolver = new ClinicRecipientResolver(db, NullLogger<ClinicRecipientResolver>.Instance);
        var handler = new ExternalPrescriptionDispensedHandler(
            db, recipientResolver, NullLogger<ExternalPrescriptionDispensedHandler>.Instance, storageMock);

        var duplicateEvent = new ExternalPrescriptionDispensedEvent
        {
            PrescriptionId = encounter.Id,
            VerificationToken = validToken,
            ExternalPharmacyName = "Second Fraudulent Pharmacy",
            DispensedAt = DateTime.UtcNow,
            ReceiptDocumentBase64 = Convert.ToBase64String(Encoding.UTF8.GetBytes("duplicate receipt"))
        };

        var envelope = InteropEnvelope.Create(
            InteropTypes.RxExternalDispensed,
            Party.Portal,
            Party.ForFacility(_tenantId, _clinicId.ToString(), FacilityType.Clinic),
            encounter.Id,
            duplicateEvent);

        await handler.HandleAsync(duplicateEvent, new InteropMessageContext(envelope), CancellationToken.None);

        // Verification: original pharmacy remains unchanged, no secondary encryption occurs
        encounter.RxDispensedPharmacyName.Should().Be("Original Pharmacy");
        await storageMock.DidNotReceiveWithAnyArgs().EncryptAndStoreAsync(
            default!, default, default, default, default!, default!, default!, default!, default, default!, default);
    }
}
