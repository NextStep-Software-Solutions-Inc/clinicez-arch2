using System.Reflection;
using System.Text.Json;
using ClinicEz.Patient.Application.Common.Constants;
using ClinicEz.Patient.Application.Common.DTOs;
using ClinicEz.Patient.Application.Common.Interfaces;
using ClinicEz.Patient.Application.Features.Patients.Queries.GetPatientFullRecord;
using ClinicEz.Patient.Application.Features.Sync.Commands.PushSyncPayload;
using ClinicEz.Patient.Domain.Entities;
using ClinicEz.Patient.Domain.Enums;
using ClinicEz.Patient.Domain.Interfaces;
using ClinicEz.Patient.Infrastructure.Persistence;
using ClinicEz.Patient.Infrastructure.Persistence.Repositories;
using ClinicEz.Patient.Infrastructure.Services.Jobs;
using ClinicEz.Shared.Exceptions;
using FluentAssertions;
using Microsoft.EntityFrameworkCore;
using Microsoft.Extensions.Logging.Abstractions;
using NSubstitute;

namespace ClinicEz.Patient.Application.Tests.Features.Patients.Queries;

using Patient = ClinicEz.Patient.Domain.Entities.Patient;

public sealed class GetPatientFullRecordQueryHandlerTests
{
    private static ApplicationDbContext CreateInMemoryDbContext()
    {
        var options = new DbContextOptionsBuilder<ApplicationDbContext>()
            .UseInMemoryDatabase(Guid.NewGuid().ToString())
            .Options;
        return new ApplicationDbContext(options);
    }

    private static ISyncEntityProcessor CreateGovernmentIdSyncProcessor(ApplicationDbContext db)
    {
        var processorType = typeof(SyncPayloadProcessor).Assembly
            .GetType("ClinicEz.Patient.Infrastructure.Services.Jobs.Processors.PatientGovernmentIdSyncProcessor")
            ?? throw new InvalidOperationException("PatientGovernmentIdSyncProcessor type not found.");

        return (ISyncEntityProcessor)(Activator.CreateInstance(
            processorType,
            BindingFlags.Instance | BindingFlags.Public | BindingFlags.NonPublic,
            binder: null,
            args: [db],
            culture: null)
            ?? throw new InvalidOperationException("Failed to instantiate PatientGovernmentIdSyncProcessor."));
    }

    [Fact]
    public async Task Handle_WhenGovernmentIdsExist_PreservesPhilhealthCategoryAndSponsorDetails()
    {
        using var db = CreateInMemoryDbContext();
        var patientId = Guid.NewGuid();
        var philhealthId = Guid.NewGuid();
        var philhealthClientId = Guid.NewGuid();
        var sssId = Guid.NewGuid();
        var tinId = Guid.NewGuid();

        var patient = new Patient
        {
            Id = patientId,
            ClinicEzId = "CE-TEST-152",
            FirstName = "Marianne",
            LastName = "Dela Cruz",
            ConsentToShareInfo = true,
            GovernmentIds =
            [
                new PatientGovernmentId
                {
                    Id = philhealthId,
                    ClientId = philhealthClientId,
                    PatientId = patientId,
                    IdType = GovernmentIdType.PhilHealth,
                    IdNumber = "12-345678901-2",
                    PhilhealthCategory = "DD",
                    SponsorPin = "12-987654321-0",
                    SponsorLastName = "Dela Cruz",
                    SponsorFirstName = "Juan",
                    SponsorMiddleName = "Santos",
                    SponsorSuffix = "Jr.",
                    SponsorDob = new DateOnly(1980, 5, 15),
                    SponsorRelationship = "S",
                    UpdatedAt = new DateTime(2026, 11, 10, 8, 0, 0, DateTimeKind.Utc),
                },
                new PatientGovernmentId
                {
                    Id = sssId,
                    ClientId = Guid.NewGuid(),
                    PatientId = patientId,
                    IdType = GovernmentIdType.SSS,
                    IdNumber = "34-1234567-8",
                },
                new PatientGovernmentId
                {
                    Id = tinId,
                    ClientId = Guid.NewGuid(),
                    PatientId = patientId,
                    IdType = GovernmentIdType.TIN,
                    IdNumber = "123-456-789-000",
                },
                new PatientGovernmentId
                {
                    Id = Guid.NewGuid(),
                    ClientId = Guid.NewGuid(),
                    PatientId = patientId,
                    IdType = GovernmentIdType.GSIS,
                    IdNumber = "99-999999999-9",
                    IsDeleted = true,
                },
            ],
        };

        await db.Patients.AddAsync(patient);
        await db.SaveChangesAsync();

        var handler = new GetPatientFullRecordQueryHandler(new PatientRepository(db));

        var result = await handler.Handle(new GetPatientFullRecordQuery(patientId), CancellationToken.None);

        result.GovernmentIds.Should().HaveCount(3);

        var phic = result.GovernmentIds.Single(g => g.IdType == "PhilHealth");
        phic.Id.Should().Be(philhealthId);
        phic.ClientId.Should().Be(philhealthClientId);
        phic.IdNumber.Should().Be("12-345678901-2");
        phic.PhilhealthCategory.Should().Be("DD");
        phic.SponsorPin.Should().Be("12-987654321-0");
        phic.SponsorLastName.Should().Be("Dela Cruz");
        phic.SponsorFirstName.Should().Be("Juan");
        phic.SponsorMiddleName.Should().Be("Santos");
        phic.SponsorSuffix.Should().Be("Jr.");
        phic.SponsorDob.Should().Be(new DateOnly(1980, 5, 15));
        phic.SponsorRelationship.Should().Be("S");

        result.GovernmentIds.Single(g => g.IdType == "SSS").IdNumber.Should().Be("34-1234567-8");
        result.GovernmentIds.Single(g => g.IdType == "TIN").IdNumber.Should().Be("123-456-789-000");
        result.GovernmentIds.Should().NotContain(g => g.IdType == "GSIS");
    }

    [Fact]
    public async Task Handle_AfterSyncProcessorAppliesGovernmentIds_FullRecordReturnsAllFields()
    {
        using var db = CreateInMemoryDbContext();
        var patientId = Guid.NewGuid();

        await db.Patients.AddAsync(new Patient
        {
            Id = patientId,
            ClinicEzId = "CE-SYNC-152",
            FirstName = "Marianne",
            LastName = "Dela Cruz",
            ConsentToShareInfo = true,
        });
        await db.SaveChangesAsync();

        var patientRepo = new PatientRepository(db);
        var syncLogRepo = new SyncLogRepository(db);
        var uow = new UnitOfWork(db);
        var notifications = Substitute.For<ISyncNotificationService>();
        var batchProcessor = new SyncPayloadProcessor(
            uow,
            notifications,
            [CreateGovernmentIdSyncProcessor(db)],
            NullLogger<SyncPayloadProcessor>.Instance);

        var pushHandler = new PushSyncPayloadCommandHandler(
            patientRepo,
            syncLogRepo,
            Substitute.For<IBackgroundJobEnqueuer>(),
            uow,
            batchProcessor);

        var now = DateTime.UtcNow;
        var phicClientId = Guid.NewGuid();
        var sssClientId = Guid.NewGuid();
        var tinClientId = Guid.NewGuid();

        var items = new[]
        {
            new SyncItemRequest(
                Guid.NewGuid(),
                SyncableEntityTypes.PatientGovernmentId,
                SyncOperation.Create,
                now,
                JsonSerializer.Serialize(new
                {
                    patientId,
                    idType = "PhilHealth",
                    idNumber = "12-555666777-8",
                    clientId = phicClientId,
                    updatedAt = now,
                    philhealthCategory = "DD",
                    sponsorPin = "12-111222333-4",
                    sponsorLastName = "Dela Cruz",
                    sponsorFirstName = "Roberto",
                    sponsorMiddleName = "M",
                    sponsorSuffix = "Sr.",
                    sponsorDob = "1978-03-22",
                    sponsorRelationship = "S",
                })),
            new SyncItemRequest(
                Guid.NewGuid(),
                SyncableEntityTypes.PatientGovernmentId,
                SyncOperation.Create,
                now,
                JsonSerializer.Serialize(new
                {
                    patientId,
                    idType = "SSS",
                    idNumber = "34-7654321-0",
                    clientId = sssClientId,
                    updatedAt = now,
                })),
            new SyncItemRequest(
                Guid.NewGuid(),
                SyncableEntityTypes.PatientGovernmentId,
                SyncOperation.Create,
                now,
                JsonSerializer.Serialize(new
                {
                    patientId,
                    idType = "TIN",
                    idNumber = "987-654-321-000",
                    clientId = tinClientId,
                    updatedAt = now,
                })),
        };

        var pushResult = await pushHandler.Handle(new PushSyncPayloadCommand(patientId, items), CancellationToken.None);
        pushResult.Applied.Should().Be(3);
        pushResult.Rejected.Should().Be(0);

        var fullRecordHandler = new GetPatientFullRecordQueryHandler(patientRepo);
        var fullRecord = await fullRecordHandler.Handle(new GetPatientFullRecordQuery(patientId), CancellationToken.None);

        var phic = fullRecord.GovernmentIds.Single(g => g.IdType == "PhilHealth");
        phic.IdNumber.Should().Be("12-555666777-8");
        phic.ClientId.Should().Be(phicClientId);
        phic.PhilhealthCategory.Should().Be("DD");
        phic.SponsorPin.Should().Be("12-111222333-4");
        phic.SponsorLastName.Should().Be("Dela Cruz");
        phic.SponsorFirstName.Should().Be("Roberto");
        phic.SponsorMiddleName.Should().Be("M");
        phic.SponsorSuffix.Should().Be("Sr.");
        phic.SponsorDob.Should().Be(new DateOnly(1978, 3, 22));
        phic.SponsorRelationship.Should().Be("S");

        fullRecord.GovernmentIds.Single(g => g.IdType == "SSS").IdNumber.Should().Be("34-7654321-0");
        fullRecord.GovernmentIds.Single(g => g.IdType == "TIN").IdNumber.Should().Be("987-654-321-000");
    }

    [Fact]
    public async Task Handle_WhenPatientDoesNotExist_ThrowsNotFoundException()
    {
        using var db = CreateInMemoryDbContext();
        var handler = new GetPatientFullRecordQueryHandler(new PatientRepository(db));

        Func<Task> act = () => handler.Handle(new GetPatientFullRecordQuery(Guid.NewGuid()), CancellationToken.None);

        await act.Should().ThrowAsync<NotFoundException>();
    }
}
