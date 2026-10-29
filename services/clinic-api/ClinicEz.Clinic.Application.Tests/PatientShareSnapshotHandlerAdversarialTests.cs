using System;
using System.Collections.Generic;
using System.Linq;
using System.Threading;
using System.Threading.Tasks;
using ClinicEz.Clinic.Domain.Entities;
using ClinicEz.Clinic.Domain.Enums;
using ClinicEz.Clinic.Infrastructure.Messaging;
using ClinicEz.Clinic.Infrastructure.Persistence;
using ClinicEz.Shared.Common;
using ClinicEz.Shared.Interop;
using ClinicEz.Shared.Interoperability;
using FluentAssertions;
using Microsoft.EntityFrameworkCore;
using Microsoft.Extensions.Logging.Abstractions;
using Xunit;

namespace ClinicEz.Clinic.Application.Tests;

public class PatientShareSnapshotHandlerTestsAdversarial
{
    private const string Tenant = "tenant-adv";
    private readonly Guid _clinicId = Guid.NewGuid();
    private readonly Guid _patientPlaneId = Guid.NewGuid();
    private readonly ApplicationDbContext _db = MessagingTestKit.CreateDbContext();

    private PatientShareSnapshotHandler Handler() =>
        new(_db, MessagingTestKit.Recipient(_db), NullLogger<PatientShareSnapshotHandler>.Instance);

    private ShareImport SeedImport(bool addToQueue = false, string? complaint = null)
    {
        if (!_db.Settings.IgnoreQueryFilters().Any(c => c.ClinicId == _clinicId))
        {
            MessagingTestKit.SeedClinic(_db, _clinicId, Tenant);
        }
        var import = new ShareImport
        {
            Id = Guid.NewGuid(),
            TenantId = Tenant,
            ClinicId = _clinicId,
            AddToQueue = addToQueue,
            ChiefComplaint = complaint
        };
        _db.ShareImports.Add(import);
        _db.SaveChanges();
        return import;
    }

    private PatientShareSnapshotPayload CreateSnapshot(
        ShareDemographicsDto? demographics,
        string clinicEzId = "CE-ADV-9999",
        bool addToQueue = false) =>
        new()
        {
            Granted = true,
            GrantId = Guid.NewGuid(),
            PatientId = _patientPlaneId,
            ClinicEzId = clinicEzId,
            Scopes = SharingScopes.Demographics,
            ExpiresAtUtc = DateTime.UtcNow.AddHours(2),
            Demographics = demographics,
            Items = new List<ShareItemDto>()
        };

    private Task Deliver(ShareImport import, PatientShareSnapshotPayload payload) =>
        Handler().HandleAsync(
            payload,
            MessagingTestKit.Delivered(
                InteropTypes.PatientShareSnapshot,
                Party.ForPatient(_patientPlaneId.ToString()),
                MessagingTestKit.ClinicParty(Tenant, _clinicId),
                import.Id,
                payload),
            CancellationToken.None);

    private Task<ShareImport> Reload(ShareImport import) =>
        _db.ShareImports.IgnoreQueryFilters().SingleAsync(i => i.Id == import.Id);

    // =========================================================================
    // 1. Compound Name Structures with Discrete Fields
    // =========================================================================

    [Fact]
    public async Task CompoundName_JohnPaulDelaCruzJr_WithDiscreteFields_PreservesAllComponents()
    {
        var import = SeedImport(addToQueue: true);
        var demographics = new ShareDemographicsDto
        {
            FirstName = "John Paul",
            MiddleName = "Dela",
            LastName = "Cruz",
            Suffix = "Jr.",
            FullName = "John Paul Dela Cruz Jr.",
            DateOfBirth = "1990-05-15",
            Sex = "Male"
        };

        await Deliver(import, CreateSnapshot(demographics));

        var saved = await Reload(import);
        saved.Status.Should().Be(ShareImportStatus.Imported);
        saved.PatientName.Should().Be("John Paul Dela Cruz Jr.");

        var patient = await _db.Patients.IgnoreQueryFilters().SingleAsync(p => p.Id == saved.PatientId);
        patient.FirstName.Should().Be("John Paul");
        patient.MiddleName.Should().Be("Dela");
        patient.LastName.Should().Be("Cruz");
        patient.Suffix.Should().Be("Jr.");

        var queueItem = await _db.QueueItems.IgnoreQueryFilters().SingleAsync(q => q.Id == saved.QueueItemId);
        queueItem.PatientName.Should().Be("John Paul Dela Cruz Jr.");
    }

    [Fact]
    public async Task CompoundName_MariaDeLaPazSantosIII_WithDiscreteFields_PreservesAllComponents()
    {
        var import = SeedImport(addToQueue: true);
        var demographics = new ShareDemographicsDto
        {
            FirstName = "Maria",
            MiddleName = "De La Paz",
            LastName = "Santos",
            Suffix = "III",
            FullName = "Maria De La Paz Santos III",
            DateOfBirth = "1988-11-20",
            Sex = "Female"
        };

        await Deliver(import, CreateSnapshot(demographics));

        var saved = await Reload(import);
        saved.Status.Should().Be(ShareImportStatus.Imported);
        saved.PatientName.Should().Be("Maria De La Paz Santos III");

        var patient = await _db.Patients.IgnoreQueryFilters().SingleAsync(p => p.Id == saved.PatientId);
        patient.FirstName.Should().Be("Maria");
        patient.MiddleName.Should().Be("De La Paz");
        patient.LastName.Should().Be("Santos");
        patient.Suffix.Should().Be("III");
    }

    [Fact]
    public async Task CompoundName_MariaDeLaPazSantosIII_WithCompoundLastName_PreservesAllComponents()
    {
        var import = SeedImport();
        var demographics = new ShareDemographicsDto
        {
            FirstName = "Maria",
            MiddleName = null,
            LastName = "De La Paz Santos",
            Suffix = "III",
            FullName = "Maria De La Paz Santos III",
            DateOfBirth = "1988-11-20",
            Sex = "Female"
        };

        await Deliver(import, CreateSnapshot(demographics));

        var saved = await Reload(import);
        saved.PatientName.Should().Be("Maria De La Paz Santos III");

        var patient = await _db.Patients.IgnoreQueryFilters().SingleAsync(p => p.Id == saved.PatientId);
        patient.FirstName.Should().Be("Maria");
        patient.MiddleName.Should().BeNull();
        patient.LastName.Should().Be("De La Paz Santos");
        patient.Suffix.Should().Be("III");
    }

    // =========================================================================
    // 2. Whitespace and Single Name Edge Cases
    // =========================================================================

    [Fact]
    public async Task CompoundName_WhitespaceInDiscreteFields_IsTrimmedCleanly()
    {
        var import = SeedImport();
        var demographics = new ShareDemographicsDto
        {
            FirstName = "   Ely An   ",
            MiddleName = "   Dela   ",
            LastName = "   Maureal   ",
            Suffix = "   Jr.   ",
            FullName = "   Ely An Dela Maureal Jr.   ",
            DateOfBirth = "1994-08-20",
            Sex = "   Male   ",
            Address = "   123 Main St.   ",
            PhilHealthPin = "   12-345678901-2   "
        };

        await Deliver(import, CreateSnapshot(demographics));

        var saved = await Reload(import);
        saved.PatientName.Should().Be("Ely An Dela Maureal Jr.");

        var patient = await _db.Patients.IgnoreQueryFilters().SingleAsync(p => p.Id == saved.PatientId);
        patient.FirstName.Should().Be("Ely An");
        patient.MiddleName.Should().Be("Dela");
        patient.LastName.Should().Be("Maureal");
        patient.Suffix.Should().Be("Jr.");
        patient.CustomFields["primary_address_line"].Should().Be("123 Main St.");
        patient.PhilHealthNumber.Should().Be("12-345678901-2");
    }

    [Fact]
    public async Task CompoundName_WhitespaceOnlyDiscreteFields_FallsBackToLosslessFullName()
    {
        var import = SeedImport();
        var demographics = new ShareDemographicsDto
        {
            FirstName = "   ",
            MiddleName = "   ",
            LastName = "   ",
            Suffix = "   ",
            FullName = "   Ely   An   Maureal   ",
            DateOfBirth = "1994-08-20",
            Sex = "Male"
        };

        await Deliver(import, CreateSnapshot(demographics));

        var saved = await Reload(import);
        saved.PatientName.Should().Be("Ely An Maureal");

        var patient = await _db.Patients.IgnoreQueryFilters().SingleAsync(p => p.Id == saved.PatientId);
        patient.FirstName.Should().Be("Ely An");
        patient.LastName.Should().Be("Maureal");
        patient.MiddleName.Should().BeNull();
        patient.Suffix.Should().BeNull();
    }

    [Fact]
    public async Task DiscreteFields_OnlyFirstNameProvided_AssignsUnknownLastNameWithoutCrashing()
    {
        var import = SeedImport();
        var demographics = new ShareDemographicsDto
        {
            FirstName = "Cher",
            LastName = null,
            FullName = "Cher",
            DateOfBirth = "1946-05-20"
        };

        await Deliver(import, CreateSnapshot(demographics));

        var saved = await Reload(import);
        var patient = await _db.Patients.IgnoreQueryFilters().SingleAsync(p => p.Id == saved.PatientId);
        patient.FirstName.Should().Be("Cher");
        patient.LastName.Should().Be("Unknown");
        saved.PatientName.Should().Be("Cher Unknown");
    }

    [Fact]
    public async Task DiscreteFields_OnlyLastNameProvided_AssignsPatientFirstNameWithoutCrashing()
    {
        var import = SeedImport();
        var demographics = new ShareDemographicsDto
        {
            FirstName = null,
            LastName = "Zendaya",
            FullName = "Zendaya"
        };

        await Deliver(import, CreateSnapshot(demographics));

        var saved = await Reload(import);
        var patient = await _db.Patients.IgnoreQueryFilters().SingleAsync(p => p.Id == saved.PatientId);
        patient.FirstName.Should().Be("Patient");
        patient.LastName.Should().Be("Zendaya");
        saved.PatientName.Should().Be("Patient Zendaya");
    }

    // =========================================================================
    // 3. Legacy Fallback (Null/Empty Discrete Fields)
    // =========================================================================

    [Fact]
    public async Task LegacyFallback_JohnPaulDelaCruzJr_SplitsLosslesslyWithoutDroppingTokens()
    {
        var import = SeedImport();
        var demographics = new ShareDemographicsDto
        {
            FullName = "John Paul Dela Cruz Jr."
        };

        await Deliver(import, CreateSnapshot(demographics));

        var saved = await Reload(import);
        saved.PatientName.Should().Be("John Paul Dela Cruz Jr.");

        var patient = await _db.Patients.IgnoreQueryFilters().SingleAsync(p => p.Id == saved.PatientId);
        patient.FirstName.Should().Be("John Paul Dela");
        patient.LastName.Should().Be("Cruz");
        patient.Suffix.Should().Be("Jr.");
    }

    [Fact]
    public async Task LegacyFallback_MariaDeLaPazSantosIII_SplitsLosslesslyWithoutDroppingTokens()
    {
        var import = SeedImport();
        var demographics = new ShareDemographicsDto
        {
            FullName = "Maria De La Paz Santos III"
        };

        await Deliver(import, CreateSnapshot(demographics));

        var saved = await Reload(import);
        saved.PatientName.Should().Be("Maria De La Paz Santos III");

        var patient = await _db.Patients.IgnoreQueryFilters().SingleAsync(p => p.Id == saved.PatientId);
        patient.FirstName.Should().Be("Maria De La Paz");
        patient.LastName.Should().Be("Santos");
        patient.Suffix.Should().Be("III");
    }

    [Fact]
    public async Task LegacyFallback_SingleName_Madonna_AssignsFirstAndLastNameLosslessly()
    {
        var import = SeedImport();
        var demographics = new ShareDemographicsDto
        {
            FullName = "Madonna"
        };

        await Deliver(import, CreateSnapshot(demographics));

        var saved = await Reload(import);
        saved.PatientName.Should().Be("Madonna Madonna");

        var patient = await _db.Patients.IgnoreQueryFilters().SingleAsync(p => p.Id == saved.PatientId);
        patient.FirstName.Should().Be("Madonna");
        patient.LastName.Should().Be("Madonna");
    }

    [Fact]
    public async Task LegacyFallback_SingleName_WithTrailingLeadingWhitespace_TrimsCorrectly()
    {
        var import = SeedImport();
        var demographics = new ShareDemographicsDto
        {
            FullName = "   Cher   "
        };

        await Deliver(import, CreateSnapshot(demographics));

        var saved = await Reload(import);
        saved.PatientName.Should().Be("Cher Cher");

        var patient = await _db.Patients.IgnoreQueryFilters().SingleAsync(p => p.Id == saved.PatientId);
        patient.FirstName.Should().Be("Cher");
        patient.LastName.Should().Be("Cher");
    }

    [Fact]
    public async Task LegacyFallback_TwoTokens_WithSuffix_SantosJr_AssignsSuffix()
    {
        var import = SeedImport();
        var demographics = new ShareDemographicsDto
        {
            FullName = "Santos Jr."
        };

        await Deliver(import, CreateSnapshot(demographics));

        var saved = await Reload(import);
        var patient = await _db.Patients.IgnoreQueryFilters().SingleAsync(p => p.Id == saved.PatientId);
        patient.FirstName.Should().Be("Santos");
        patient.LastName.Should().Be("Santos");
        patient.Suffix.Should().Be("Jr.");
        saved.PatientName.Should().Be("Santos Santos Jr.");
    }

    [Fact]
    public async Task LegacyFallback_NullOrEmptyFullName_AssignsPatientUnknown()
    {
        var import = SeedImport();
        var demographics = new ShareDemographicsDto
        {
            FullName = ""
        };

        await Deliver(import, CreateSnapshot(demographics));

        var saved = await Reload(import);
        var patient = await _db.Patients.IgnoreQueryFilters().SingleAsync(p => p.Id == saved.PatientId);
        patient.FirstName.Should().Be("Patient");
        patient.LastName.Should().Be("Unknown");
        saved.PatientName.Should().Be("Patient Unknown");
    }

    [Fact]
    public async Task LegacyFallback_KnownSuffixes_CaseInsensitiveMatching()
    {
        var suffixes = new[] { "jr", "JR", "sr", "SR", "ii", "II", "iii", "III", "iv", "IV", "v", "V", "vi", "VI", "vii", "VII", "viii", "VIII" };
        foreach (var suf in suffixes)
        {
            var import = SeedImport();
            var demographics = new ShareDemographicsDto
            {
                FullName = $"Juan Dela Cruz {suf}"
            };

            await Deliver(import, CreateSnapshot(demographics));

            var saved = await Reload(import);
            var patient = await _db.Patients.IgnoreQueryFilters().SingleAsync(p => p.Id == saved.PatientId);
            patient.LastName.Should().Be("Cruz");
            patient.Suffix.Should().Be(suf);
            patient.FirstName.Should().Be("Juan Dela");
        }
    }

    // =========================================================================
    // 4. Re-Import Healing Tests
    // =========================================================================

    [Fact]
    public async Task Reimport_Heals_ExistingPatient_WhenMatchedByCaseInsensitiveClinicEzId()
    {
        var existingPatient = Phase3TestKit.NewPatient(_clinicId, Tenant);
        existingPatient.ClinicEzId = "CE-TEST-HEAL-1";
        existingPatient.FirstName = "Ely";
        existingPatient.LastName = "Maureal";
        existingPatient.MiddleName = null;
        existingPatient.Suffix = null;
        existingPatient.DateOfBirth = new DateOnly(2000, 1, 1);
        existingPatient.Sex = BiologicalSex.Unknown;
        existingPatient.PhilHealthNumber = null;
        MessagingTestKit.SeedClinic(_db, _clinicId, Tenant);
        _db.Patients.Add(existingPatient);
        await _db.SaveChangesAsync();

        var import = SeedImport();
        var snapshot = CreateSnapshot(new ShareDemographicsDto
        {
            FirstName = "Ely An",
            MiddleName = "Dela",
            LastName = "Maureal",
            Suffix = "Jr.",
            FullName = "Ely An Dela Maureal Jr.",
            DateOfBirth = "1994-08-20",
            Sex = "Male",
            PhilHealthPin = "12-345678901-2"
        }, clinicEzId: "ce-test-heal-1");

        await Deliver(import, snapshot);

        var saved = await Reload(import);
        saved.Status.Should().Be(ShareImportStatus.Imported);
        saved.PatientId.Should().Be(existingPatient.Id);
        saved.PatientName.Should().Be("Ely An Dela Maureal Jr.");

        var healed = await _db.Patients.IgnoreQueryFilters().SingleAsync(p => p.Id == existingPatient.Id);
        healed.FirstName.Should().Be("Ely An");
        healed.MiddleName.Should().Be("Dela");
        healed.LastName.Should().Be("Maureal");
        healed.Suffix.Should().Be("Jr.");
        healed.DateOfBirth.Should().Be(new DateOnly(1994, 8, 20));
        healed.Sex.Should().Be(BiologicalSex.Male);
        healed.PhilHealthNumber.Should().Be("12-345678901-2");
    }

    [Fact]
    public async Task Reimport_Heals_ExistingPatient_WhenMatchedBySyncPatientId()
    {
        var existingPatient = Phase3TestKit.NewPatient(_clinicId, Tenant);
        existingPatient.CloudPatientId = _patientPlaneId;
        existingPatient.ClinicEzId = null; // No ClinicEzId originally
        existingPatient.FirstName = "Juan";
        existingPatient.LastName = "Cruz";
        existingPatient.DateOfBirth = new DateOnly(2000, 1, 1);
        existingPatient.Sex = BiologicalSex.Unknown;
        MessagingTestKit.SeedClinic(_db, _clinicId, Tenant);
        _db.Patients.Add(existingPatient);
        await _db.SaveChangesAsync();

        var import = SeedImport();
        var snapshot = CreateSnapshot(new ShareDemographicsDto
        {
            FirstName = "Juan Carlos",
            MiddleName = "Dela",
            LastName = "Cruz",
            Suffix = "Sr.",
            FullName = "Juan Carlos Dela Cruz Sr.",
            DateOfBirth = "1980-01-10",
            Sex = "Male"
        }, clinicEzId: "CE-NEW-ID");

        await Deliver(import, snapshot);

        var saved = await Reload(import);
        saved.PatientId.Should().Be(existingPatient.Id);
        saved.PatientName.Should().Be("Juan Carlos Dela Cruz Sr.");

        var healed = await _db.Patients.IgnoreQueryFilters().SingleAsync(p => p.Id == existingPatient.Id);
        healed.FirstName.Should().Be("Juan Carlos");
        healed.MiddleName.Should().Be("Dela");
        healed.LastName.Should().Be("Cruz");
        healed.Suffix.Should().Be("Sr.");
        healed.DateOfBirth.Should().Be(new DateOnly(1980, 1, 10));
        healed.Sex.Should().Be(BiologicalSex.Male);
        healed.ClinicEzId.Should().Be("CE-NEW-ID");
    }

    [Fact]
    public async Task Reimport_Heals_TruncatedPatient_ViaLegacyFallback()
    {
        var existingPatient = Phase3TestKit.NewPatient(_clinicId, Tenant);
        existingPatient.ClinicEzId = "CE-FALLBACK-HEAL";
        existingPatient.FirstName = "Ely";
        existingPatient.LastName = "Maureal";
        existingPatient.DateOfBirth = new DateOnly(2000, 1, 1);
        MessagingTestKit.SeedClinic(_db, _clinicId, Tenant);
        _db.Patients.Add(existingPatient);
        await _db.SaveChangesAsync();

        var import = SeedImport();
        var snapshot = CreateSnapshot(new ShareDemographicsDto
        {
            FirstName = null,
            MiddleName = null,
            LastName = null,
            Suffix = null,
            FullName = "Ely An Maureal",
            DateOfBirth = "1994-08-20",
            Sex = "Male"
        }, clinicEzId: "CE-FALLBACK-HEAL");

        await Deliver(import, snapshot);

        var saved = await Reload(import);
        saved.PatientId.Should().Be(existingPatient.Id);
        saved.PatientName.Should().Be("Ely An Maureal");

        var healed = await _db.Patients.IgnoreQueryFilters().SingleAsync(p => p.Id == existingPatient.Id);
        healed.FirstName.Should().Be("Ely An");
        healed.LastName.Should().Be("Maureal");
        healed.DateOfBirth.Should().Be(new DateOnly(1994, 8, 20));
        healed.Sex.Should().Be(BiologicalSex.Male);
    }

    [Fact]
    public async Task Reimport_PreservesExistingMiddleName_WhenIncomingDiscreteMiddleNameIsNull()
    {
        var existingPatient = Phase3TestKit.NewPatient(_clinicId, Tenant);
        existingPatient.ClinicEzId = "CE-PRESERVE-MID";
        existingPatient.FirstName = "Ely";
        existingPatient.MiddleName = "ExistingMiddle";
        existingPatient.LastName = "Maureal";
        MessagingTestKit.SeedClinic(_db, _clinicId, Tenant);
        _db.Patients.Add(existingPatient);
        await _db.SaveChangesAsync();

        var import = SeedImport();
        var snapshot = CreateSnapshot(new ShareDemographicsDto
        {
            FirstName = "Ely An",
            MiddleName = null, // Not supplied
            LastName = "Maureal",
            FullName = "Ely An Maureal",
            DateOfBirth = "1994-08-20"
        }, clinicEzId: "CE-PRESERVE-MID");

        await Deliver(import, snapshot);

        var healed = await _db.Patients.IgnoreQueryFilters().SingleAsync(p => p.Id == existingPatient.Id);
        healed.FirstName.Should().Be("Ely An");
        healed.MiddleName.Should().Be("ExistingMiddle");
        healed.LastName.Should().Be("Maureal");
    }

    [Fact]
    public async Task Reimport_IsIdempotent_MultipleImportsProduceSameState()
    {
        var import1 = SeedImport();
        var demographics = new ShareDemographicsDto
        {
            FirstName = "Ely An",
            MiddleName = "Dela",
            LastName = "Maureal",
            Suffix = "Jr.",
            FullName = "Ely An Dela Maureal Jr.",
            DateOfBirth = "1994-08-20",
            Sex = "Male"
        };
        var snapshot1 = CreateSnapshot(demographics, clinicEzId: "CE-IDEM-1");

        await Deliver(import1, snapshot1);

        var saved1 = await Reload(import1);
        var patient1 = await _db.Patients.IgnoreQueryFilters().SingleAsync(p => p.Id == saved1.PatientId);
        patient1.FirstName.Should().Be("Ely An");

        // Second import with same patient
        var import2 = SeedImport();
        var snapshot2 = CreateSnapshot(demographics, clinicEzId: "CE-IDEM-1");
        await Deliver(import2, snapshot2);

        var saved2 = await Reload(import2);
        saved2.PatientId.Should().Be(patient1.Id);
        (await _db.Patients.IgnoreQueryFilters().CountAsync(p => p.ClinicEzId == "CE-IDEM-1")).Should().Be(1);

        var patient2 = await _db.Patients.IgnoreQueryFilters().SingleAsync(p => p.Id == patient1.Id);
        patient2.FirstName.Should().Be("Ely An");
        patient2.MiddleName.Should().Be("Dela");
        patient2.LastName.Should().Be("Maureal");
        patient2.Suffix.Should().Be("Jr.");
        patient2.DateOfBirth.Should().Be(new DateOnly(1994, 8, 20));
        patient2.Sex.Should().Be(BiologicalSex.Male);
    }
}
