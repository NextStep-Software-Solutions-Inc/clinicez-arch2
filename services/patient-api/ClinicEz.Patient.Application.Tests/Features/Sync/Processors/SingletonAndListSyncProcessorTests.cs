using System.Text.Json;
using ClinicEz.Patient.Application.Common.Constants;
using ClinicEz.Patient.Domain.Entities;
using ClinicEz.Patient.Domain.Enums;
using ClinicEz.Patient.Infrastructure.Persistence;
using ClinicEz.Patient.Infrastructure.Services.Jobs.Processors;
using FluentAssertions;
using Microsoft.EntityFrameworkCore;

namespace ClinicEz.Patient.Application.Tests.Features.Sync.Processors;

public sealed class SingletonAndListSyncProcessorTests
{
    private static ApplicationDbContext CreateDb() =>
        new(new DbContextOptionsBuilder<ApplicationDbContext>()
            .UseInMemoryDatabase(Guid.NewGuid().ToString())
            .Options);

    private static SyncLog MakeLog(Guid patientId, string entityType, SyncOperation op, Guid? entityId, object payload) => new()
    {
        PatientId = patientId,
        EntityType = entityType,
        IdempotencyKey = Guid.NewGuid(),
        Operation = op,
        ClientTimestamp = DateTime.UtcNow,
        ServerTimestamp = DateTime.UtcNow,
        Status = SyncStatus.Pending,
        EntityId = entityId,
        PayloadJson = JsonSerializer.Serialize(payload),
    };

    private static async Task<Guid> SeedPatientAsync(ApplicationDbContext db)
    {
        var patient = new Domain.Entities.Patient
        {
            Id = Guid.NewGuid(),
            ClerkUserId = $"clerk_{Guid.NewGuid():N}",
            FirstName = "Ana",
            LastName = "Reyes",
        };
        db.Patients.Add(patient);
        await db.SaveChangesAsync();
        return patient.Id;
    }

    [Fact]
    public async Task AllSixSingletonProcessors_UpdateWithClientUuid_FallsBackToPatientIdWhenServerRowExists()
    {
        await using var db = CreateDb();
        var patientId = await SeedPatientAsync(db);
        var futureTs = DateTime.UtcNow.AddMinutes(5);

        var obs = new PatientObstetricProfile { Id = Guid.NewGuid(), PatientId = patientId, ClientId = Guid.NewGuid(), Gravida = 1 };
        var dv = new PatientDentalVision { Id = Guid.NewGuid(), PatientId = patientId, ClientId = Guid.NewGuid(), DentistName = "Old Dentist" };
        var occ = new PatientOccupation { Id = Guid.NewGuid(), PatientId = patientId, ClientId = Guid.NewGuid(), Occupation = "Old Job" };
        var sh = new PatientSocialHistory { Id = Guid.NewGuid(), PatientId = patientId, ClientId = Guid.NewGuid(), SmokingStatus = SmokingStatus.NeverSmoked };
        var mr = new PatientMaleReproductive { Id = Guid.NewGuid(), PatientId = patientId, ClientId = Guid.NewGuid(), HasVasectomy = false };
        var mh = new PatientMentalHealthProfile { Id = Guid.NewGuid(), PatientId = patientId, ClientId = Guid.NewGuid(), HasDiagnosis = false };

        db.AddRange(obs, dv, occ, sh, mr, mh);
        await db.SaveChangesAsync();

        var bogusClientEntityId = Guid.NewGuid();

        var obsLog = MakeLog(patientId, SyncableEntityTypes.PatientObstetricProfile, SyncOperation.Update, bogusClientEntityId,
            new { clientId = Guid.NewGuid(), patientId, gravida = 3, updatedAt = futureTs });
        var dvLog = MakeLog(patientId, SyncableEntityTypes.PatientDentalVision, SyncOperation.Update, bogusClientEntityId,
            new { clientId = Guid.NewGuid(), patientId, dentistName = "Dr. Santos", updatedAt = futureTs });
        var occLog = MakeLog(patientId, SyncableEntityTypes.PatientOccupation, SyncOperation.Update, bogusClientEntityId,
            new { clientId = Guid.NewGuid(), patientId, occupation = "Nurse", updatedAt = futureTs });
        var shLog = MakeLog(patientId, SyncableEntityTypes.PatientSocialHistory, SyncOperation.Update, bogusClientEntityId,
            new { clientId = Guid.NewGuid(), patientId, tobaccoStatus = "Former", updatedAt = futureTs });
        var mrLog = MakeLog(patientId, SyncableEntityTypes.PatientMaleReproductive, SyncOperation.Update, bogusClientEntityId,
            new { clientId = Guid.NewGuid(), patientId, hasVasectomy = true, updatedAt = futureTs });
        var mhLog = MakeLog(patientId, SyncableEntityTypes.PatientMentalHealthProfile, SyncOperation.Update, bogusClientEntityId,
            new { clientId = Guid.NewGuid(), patientId, hasPriorDiagnosis = true, providerName = "Dr. Cruz", updatedAt = futureTs });

        (await new PatientObstetricProfileSyncProcessor(db).ProcessAsync(obsLog, CancellationToken.None)).Applied.Should().BeTrue();
        (await new PatientDentalVisionSyncProcessor(db).ProcessAsync(dvLog, CancellationToken.None)).Applied.Should().BeTrue();
        (await new PatientOccupationSyncProcessor(db).ProcessAsync(occLog, CancellationToken.None)).Applied.Should().BeTrue();
        (await new PatientSocialHistorySyncProcessor(db).ProcessAsync(shLog, CancellationToken.None)).Applied.Should().BeTrue();
        (await new PatientMaleReproductiveSyncProcessor(db).ProcessAsync(mrLog, CancellationToken.None)).Applied.Should().BeTrue();
        (await new PatientMentalHealthProfileSyncProcessor(db).ProcessAsync(mhLog, CancellationToken.None)).Applied.Should().BeTrue();

        await db.SaveChangesAsync();

        obsLog.EntityId.Should().Be(obs.Id);
        dvLog.EntityId.Should().Be(dv.Id);
        occLog.EntityId.Should().Be(occ.Id);
        shLog.EntityId.Should().Be(sh.Id);
        mrLog.EntityId.Should().Be(mr.Id);
        mhLog.EntityId.Should().Be(mh.Id);

        (await db.PatientObstetricProfiles.SingleAsync(x => x.PatientId == patientId)).Gravida.Should().Be(3);
        (await db.PatientDentalVisions.SingleAsync(x => x.PatientId == patientId)).DentistName.Should().Be("Dr. Santos");
        (await db.PatientOccupations.SingleAsync(x => x.PatientId == patientId)).Occupation.Should().Be("Nurse");
        (await db.PatientSocialHistories.SingleAsync(x => x.PatientId == patientId)).SmokingStatus.Should().Be(SmokingStatus.FormerSmoker);
        (await db.PatientMaleReproductives.SingleAsync(x => x.PatientId == patientId)).HasVasectomy.Should().BeTrue();
        (await db.PatientMentalHealthProfiles.SingleAsync(x => x.PatientId == patientId)).TherapistName.Should().Be("Dr. Cruz");
    }

    [Fact]
    public async Task AllSixSingletonProcessors_UpdateWhenServerRowMissing_UpsertsInsteadOfConflicting()
    {
        await using var db = CreateDb();
        var patientId = await SeedPatientAsync(db);
        var ts = DateTime.UtcNow;

        var obsLog = MakeLog(patientId, SyncableEntityTypes.PatientObstetricProfile, SyncOperation.Update, Guid.NewGuid(),
            new { clientId = Guid.NewGuid(), patientId, gravida = 2, updatedAt = ts });
        var dvLog = MakeLog(patientId, SyncableEntityTypes.PatientDentalVision, SyncOperation.Update, Guid.NewGuid(),
            new { clientId = Guid.NewGuid(), patientId, dentistName = "Dr. Lim", updatedAt = ts });
        var occLog = MakeLog(patientId, SyncableEntityTypes.PatientOccupation, SyncOperation.Update, Guid.NewGuid(),
            new { clientId = Guid.NewGuid(), patientId, occupation = "Teacher", updatedAt = ts });
        var shLog = MakeLog(patientId, SyncableEntityTypes.PatientSocialHistory, SyncOperation.Update, Guid.NewGuid(),
            new { clientId = Guid.NewGuid(), patientId, tobaccoStatus = "Never", updatedAt = ts });
        var mrLog = MakeLog(patientId, SyncableEntityTypes.PatientMaleReproductive, SyncOperation.Update, Guid.NewGuid(),
            new { clientId = Guid.NewGuid(), patientId, conditions = "None", updatedAt = ts });
        var mhLog = MakeLog(patientId, SyncableEntityTypes.PatientMentalHealthProfile, SyncOperation.Update, Guid.NewGuid(),
            new { clientId = Guid.NewGuid(), patientId, hasPriorDiagnosis = false, psychotherapyStatus = "None", updatedAt = ts });

        (await new PatientObstetricProfileSyncProcessor(db).ProcessAsync(obsLog, CancellationToken.None)).Applied.Should().BeTrue();
        (await new PatientDentalVisionSyncProcessor(db).ProcessAsync(dvLog, CancellationToken.None)).Applied.Should().BeTrue();
        (await new PatientOccupationSyncProcessor(db).ProcessAsync(occLog, CancellationToken.None)).Applied.Should().BeTrue();
        (await new PatientSocialHistorySyncProcessor(db).ProcessAsync(shLog, CancellationToken.None)).Applied.Should().BeTrue();
        (await new PatientMaleReproductiveSyncProcessor(db).ProcessAsync(mrLog, CancellationToken.None)).Applied.Should().BeTrue();
        (await new PatientMentalHealthProfileSyncProcessor(db).ProcessAsync(mhLog, CancellationToken.None)).Applied.Should().BeTrue();

        await db.SaveChangesAsync();

        (await db.PatientObstetricProfiles.CountAsync(x => x.PatientId == patientId)).Should().Be(1);
        (await db.PatientDentalVisions.CountAsync(x => x.PatientId == patientId)).Should().Be(1);
        (await db.PatientOccupations.CountAsync(x => x.PatientId == patientId)).Should().Be(1);
        (await db.PatientSocialHistories.CountAsync(x => x.PatientId == patientId)).Should().Be(1);
        (await db.PatientMaleReproductives.CountAsync(x => x.PatientId == patientId)).Should().Be(1);
        (await db.PatientMentalHealthProfiles.CountAsync(x => x.PatientId == patientId)).Should().Be(1);
    }

    [Fact]
    public async Task SingletonProcessor_UpdateWithStaleTimestamp_StillReturnsConflict()
    {
        await using var db = CreateDb();
        var patientId = await SeedPatientAsync(db);
        var dv = new PatientDentalVision { Id = Guid.NewGuid(), PatientId = patientId, ClientId = Guid.NewGuid(), DentistName = "Dr. Server" };
        db.PatientDentalVisions.Add(dv);
        await db.SaveChangesAsync();

        var staleLog = MakeLog(patientId, SyncableEntityTypes.PatientDentalVision, SyncOperation.Update, dv.Id,
            new { clientId = dv.ClientId, patientId, dentistName = "Dr. Stale", updatedAt = DateTime.UtcNow.AddMinutes(-10) });

        var result = await new PatientDentalVisionSyncProcessor(db).ProcessAsync(staleLog, CancellationToken.None);
        result.IsConflict.Should().BeTrue();
        result.Applied.Should().BeFalse();
    }

    [Fact]
    public async Task ObstetricListProcessors_UpdateWithClientUuid_FallsBackToPatientAndClientId_AndConflictsWhenMissing()
    {
        await using var db = CreateDb();
        var patientId = await SeedPatientAsync(db);
        var pregClientId = Guid.NewGuid();
        var contraClientId = Guid.NewGuid();

        var preg = new PatientPregnancy { Id = Guid.NewGuid(), PatientId = patientId, ClientId = pregClientId, Year = 2022, Outcome = "LiveBirth" };
        var contra = new PatientContraceptiveHistory { Id = Guid.NewGuid(), PatientId = patientId, ClientId = contraClientId, Method = "Pills", IsCurrent = true };
        db.AddRange(preg, contra);
        await db.SaveChangesAsync();

        var futureTs = DateTime.UtcNow.AddMinutes(5);
        var pregLog = MakeLog(patientId, SyncableEntityTypes.PatientPregnancy, SyncOperation.Update, Guid.NewGuid(),
            new { clientId = pregClientId, patientId, year = 2023, outcome = "LiveBirth", updatedAt = futureTs });
        var contraLog = MakeLog(patientId, SyncableEntityTypes.PatientContraceptiveHistory, SyncOperation.Update, Guid.NewGuid(),
            new { clientId = contraClientId, patientId, method = "IUD", isCurrent = false, updatedAt = futureTs });

        (await new PatientPregnancySyncProcessor(db).ProcessAsync(pregLog, CancellationToken.None)).Applied.Should().BeTrue();
        (await new PatientContraceptiveHistorySyncProcessor(db).ProcessAsync(contraLog, CancellationToken.None)).Applied.Should().BeTrue();
        await db.SaveChangesAsync();

        (await db.PatientPregnancies.SingleAsync(x => x.Id == preg.Id)).Year.Should().Be(2023);
        (await db.PatientContraceptiveHistories.SingleAsync(x => x.Id == contra.Id)).Method.Should().Be("IUD");

        // Non-existent list item on Update still conflicts (UpsertOnMissingUpdate == false)
        var missingPregLog = MakeLog(patientId, SyncableEntityTypes.PatientPregnancy, SyncOperation.Update, Guid.NewGuid(),
            new { clientId = Guid.NewGuid(), patientId, year = 2025, updatedAt = futureTs });
        var missingResult = await new PatientPregnancySyncProcessor(db).ProcessAsync(missingPregLog, CancellationToken.None);
        missingResult.IsConflict.Should().BeTrue();
    }
}
