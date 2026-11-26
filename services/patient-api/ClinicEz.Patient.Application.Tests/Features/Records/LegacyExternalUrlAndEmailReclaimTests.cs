using System;
using System.Collections.Generic;
using System.IO;
using System.Linq;
using System.Threading;
using System.Threading.Tasks;
using ClinicEz.Patient.Application.Common.Interfaces;
using ClinicEz.Patient.Application.Features.Patients.Commands.CreatePatient;
using ClinicEz.Patient.Application.Features.Patients.Queries.GetPatientByClerkId;
using ClinicEz.Patient.Application.Features.Patients.Queries.GetPatientMe;
using ClinicEz.Patient.Application.Features.Records.Queries;
using ClinicEz.Patient.Domain.Entities;
using ClinicEz.Patient.Domain.Interfaces;
using ClinicEz.Patient.Infrastructure.Persistence;
using ClinicEz.Patient.Infrastructure.Persistence.Repositories;
using FluentAssertions;
using Microsoft.EntityFrameworkCore;
using Microsoft.EntityFrameworkCore.Diagnostics;
using NSubstitute;
using NSubstitute.ExceptionExtensions;
using Xunit;

namespace ClinicEz.Patient.Application.Tests.Features.Records;

using PatientEntity = ClinicEz.Patient.Domain.Entities.Patient;

public sealed class LegacyExternalUrlAndEmailReclaimTests
{
    [Theory]
    [InlineData("https://clinicezstorage.blob.core.windows.net/records/file1.pdf")]
    [InlineData("https://clinicez.blob.core.windows.net/records/file2.jpg")]
    [InlineData("https://drive.google.com/uc?id=abc123")]
    [InlineData("https://docs.google.com/document/d/xyz")]
    [InlineData("https://lh3.googleusercontent.com/d/img1")]
    public async Task StreamPatientRecord_WhenLegacyNoneAndAllowlistedHttps_ReturnsRedirectWithoutTouchingStorage(string legacyUrl)
    {
        var patientId = Guid.NewGuid();
        var fileId = Guid.NewGuid();
        var fileRepo = Substitute.For<IFileRecordRepository>();
        var encryption = Substitute.For<IPatientEncryptionService>();
        var storage = Substitute.For<IStorageService>();

        fileRepo.GetByIdAndPatientIdAsync(fileId, patientId, Arg.Any<CancellationToken>())
            .Returns(new FileRecord
            {
                Id = fileId,
                PatientId = patientId,
                FileName = "legacy-lab.pdf",
                MimeType = "application/pdf",
                StorageKey = legacyUrl,
                EncryptionAlgorithm = "NONE"
            });

        var handler = new StreamPatientRecordQueryHandler(fileRepo, encryption, storage);
        var result = await handler.Handle(new StreamPatientRecordQuery(patientId, fileId), CancellationToken.None);

        result.ExternalRedirectUrl.Should().Be(legacyUrl);
        result.FileName.Should().Be("legacy-lab.pdf");
        result.ContentType.Should().Be("application/pdf");
        await storage.DidNotReceiveWithAnyArgs().OpenReadStreamAsync(default!, default);
    }

    [Theory]
    [InlineData("http://clinicezstorage.blob.core.windows.net/records/file1.pdf")]
    [InlineData("https://evil.example.com/file1.pdf")]
    [InlineData("file:///etc/passwd")]
    public void IsAllowedLegacyExternalUrl_RejectsNonHttpsOrUnknownHost(string unsafeUrl)
    {
        StreamPatientRecordQueryHandler.IsAllowedLegacyExternalUrl("NONE", unsafeUrl).Should().BeFalse();
        StreamPatientRecordQueryHandler.IsAllowedLegacyExternalUrl("AES-256-GCM", "https://drive.google.com/uc?id=1").Should().BeFalse();
    }

    [Fact]
    public async Task GetPatientMe_WhenUnlinkedLegacyAuth0ProfileMatchesVerifiedEmail_ReclaimsClerkUserId()
    {
        var repo = Substitute.For<IPatientRepository>();
        var uow = Substitute.For<IUnitOfWork>();
        var legacyPatient = new PatientEntity
        {
            Id = Guid.NewGuid(),
            ClinicEzId = "CE-USTP-1234",
            ClerkUserId = null,
            FirstName = "Maria",
            LastName = "Santos",
            Email = "maria.santos@ustp.edu.ph"
        };

        var callCount = 0;
        repo.GetForMeByClerkUserIdAsync("user_clerk_new_999", Arg.Any<CancellationToken>())
            .Returns(_ => ++callCount == 1 ? null : legacyPatient);
        repo.GetSingleUnlinkedByVerifiedEmailsAsync(
                Arg.Is<IReadOnlyList<string>>(emails => emails.Count == 1 && emails[0] == "maria.santos@ustp.edu.ph"),
                Arg.Any<CancellationToken>())
            .Returns(legacyPatient);
        uow.SaveChangesAsync(Arg.Any<CancellationToken>()).Returns(1);

        var handler = new GetPatientMeQueryHandler(repo, uow);
        var result = await handler.Handle(
            new GetPatientMeQuery("user_clerk_new_999", new[] { "maria.santos@ustp.edu.ph" }),
            CancellationToken.None);

        result.Should().NotBeNull();
        result!.ClinicEzId.Should().Be("CE-USTP-1234");
        legacyPatient.ClerkUserId.Should().Be("user_clerk_new_999");
        legacyPatient.UpdatedBy.Should().Be("System:ClerkEmailReclaim");
        repo.Received(1).Update(legacyPatient);
        await uow.Received(1).SaveChangesAsync(Arg.Any<CancellationToken>());
    }

    [Fact]
    public async Task GetPatientByClerkId_WhenAmbiguousOrMissingMatch_ReturnsNullWithoutUpdating()
    {
        var repo = Substitute.For<IPatientRepository>();
        var uow = Substitute.For<IUnitOfWork>();
        repo.GetByClerkUserIdAsync("user_clerk_new_111", Arg.Any<CancellationToken>()).Returns((PatientEntity?)null);
        repo.GetSingleUnlinkedByVerifiedEmailsAsync(Arg.Any<IReadOnlyList<string>>(), Arg.Any<CancellationToken>())
            .Returns((PatientEntity?)null);

        var handler = new GetPatientByClerkIdQueryHandler(repo, uow);
        var result = await handler.Handle(
            new GetPatientByClerkIdQuery("user_clerk_new_111", new[] { "shared@ustp.edu.ph" }),
            CancellationToken.None);

        result.Should().BeNull();
        repo.DidNotReceiveWithAnyArgs().Update(default!);
        await uow.DidNotReceiveWithAnyArgs().SaveChangesAsync(default);
    }

    [Fact]
    public async Task CreatePatient_WhenUnlinkedLegacyProfileMatchesVerifiedEmail_ReclaimsInsteadOfDuplicating()
    {
        var repo = Substitute.For<IPatientRepository>();
        var uow = Substitute.For<IUnitOfWork>();
        var legacyId = Guid.NewGuid();
        var legacyPatient = new PatientEntity
        {
            Id = legacyId,
            ClinicEzId = "CE-USTP-5678",
            ClerkUserId = null,
            FirstName = "Pedro",
            LastName = "Penduko",
            Email = "pedro@ustp.edu.ph"
        };

        repo.GetByClerkUserIdAsync("user_clerk_reclaim", Arg.Any<CancellationToken>()).Returns((PatientEntity?)null);
        repo.GetSingleUnlinkedByVerifiedEmailsAsync(Arg.Any<IReadOnlyList<string>>(), Arg.Any<CancellationToken>())
            .Returns(legacyPatient);
        uow.SaveChangesAsync(Arg.Any<CancellationToken>()).Returns(1);

        var handler = new CreatePatientCommandHandler(repo, uow);
        var returnedId = await handler.Handle(
            new CreatePatientCommand("user_clerk_reclaim", "Pedro", null, "Penduko", null, "Male", null, "Filipino", new[] { "pedro@ustp.edu.ph" }),
            CancellationToken.None);

        returnedId.Should().Be(legacyId);
        legacyPatient.ClerkUserId.Should().Be("user_clerk_reclaim");
        await repo.DidNotReceiveWithAnyArgs().AddAsync(default!, default);
        repo.Received(1).Update(legacyPatient);
        await uow.Received(1).SaveChangesAsync(Arg.Any<CancellationToken>());
    }

    [Fact]
    public async Task CreatePatient_WhenReclaimHits23505UniqueViolation_RefetchesAndReturnsRacedId()
    {
        var repo = Substitute.For<IPatientRepository>();
        var uow = Substitute.For<IUnitOfWork>();
        var legacyId = Guid.NewGuid();
        var legacyPatient = new PatientEntity
        {
            Id = legacyId,
            ClerkUserId = null,
            FirstName = "Pedro",
            LastName = "Penduko",
            Email = "pedro@ustp.edu.ph"
        };
        var reclaimedByConcurrentRequest = new PatientEntity
        {
            Id = legacyId,
            ClerkUserId = "user_clerk_race",
            FirstName = "Pedro",
            LastName = "Penduko",
            Email = "pedro@ustp.edu.ph"
        };

        var getCalls = 0;
        repo.GetByClerkUserIdAsync("user_clerk_race", Arg.Any<CancellationToken>())
            .Returns(_ => ++getCalls == 1 ? null : reclaimedByConcurrentRequest);
        repo.GetSingleUnlinkedByVerifiedEmailsAsync(Arg.Any<IReadOnlyList<string>>(), Arg.Any<CancellationToken>())
            .Returns(legacyPatient);
        uow.SaveChangesAsync(Arg.Any<CancellationToken>())
            .ThrowsAsync(new DbUpdateException(
                "23505: duplicate key value violates unique constraint \"ix_patients_clerk_user_id\"",
                new Exception("23505")));

        var handler = new CreatePatientCommandHandler(repo, uow);
        var returnedId = await handler.Handle(
            new CreatePatientCommand("user_clerk_race", "Pedro", null, "Penduko", null, "Male", null, "Filipino", new[] { "pedro@ustp.edu.ph" }),
            CancellationToken.None);

        returnedId.Should().Be(legacyId);
    }

    [Fact]
    public async Task CreatePatient_WhenInsertHits23505UniqueViolation_RefetchesAndReturnsRacedId()
    {
        var repo = Substitute.For<IPatientRepository>();
        var uow = Substitute.For<IUnitOfWork>();
        var existingId = Guid.NewGuid();
        var createdByConcurrentRequest = new PatientEntity
        {
            Id = existingId,
            ClerkUserId = "user_clerk_insert_race",
            FirstName = "Ana",
            LastName = "Reyes"
        };

        var getCalls = 0;
        repo.GetByClerkUserIdAsync("user_clerk_insert_race", Arg.Any<CancellationToken>())
            .Returns(_ => ++getCalls == 1 ? null : createdByConcurrentRequest);
        uow.SaveChangesAsync(Arg.Any<CancellationToken>())
            .ThrowsAsync(new DbUpdateException(
                "23505: duplicate key value violates unique constraint \"ix_patients_clerk_user_id\"",
                new Exception("23505")));

        var handler = new CreatePatientCommandHandler(repo, uow);
        var returnedId = await handler.Handle(
            new CreatePatientCommand("user_clerk_insert_race", "Ana", null, "Reyes", null, "Female", null, "Filipino"),
            CancellationToken.None);

        returnedId.Should().Be(existingId);
    }

    [Fact]
    public async Task GetPatientMe_WhenReclaimHits23505UniqueViolation_RefetchesAndReturnsPatientDto()
    {
        var repo = Substitute.For<IPatientRepository>();
        var uow = Substitute.For<IUnitOfWork>();
        var legacyPatient = new PatientEntity
        {
            Id = Guid.NewGuid(),
            ClinicEzId = "CE-USTP-RACE",
            ClerkUserId = null,
            FirstName = "Maria",
            LastName = "Santos",
            Email = "maria.race@ustp.edu.ph"
        };
        var reclaimedPatient = new PatientEntity
        {
            Id = legacyPatient.Id,
            ClinicEzId = "CE-USTP-RACE",
            ClerkUserId = "user_clerk_me_race",
            FirstName = "Maria",
            LastName = "Santos",
            Email = "maria.race@ustp.edu.ph"
        };

        var getCalls = 0;
        repo.GetForMeByClerkUserIdAsync("user_clerk_me_race", Arg.Any<CancellationToken>())
            .Returns(_ => ++getCalls == 1 ? null : reclaimedPatient);
        repo.GetSingleUnlinkedByVerifiedEmailsAsync(Arg.Any<IReadOnlyList<string>>(), Arg.Any<CancellationToken>())
            .Returns(legacyPatient);
        uow.SaveChangesAsync(Arg.Any<CancellationToken>())
            .ThrowsAsync(new DbUpdateException(
                "23505: duplicate key value violates unique constraint \"ix_patients_clerk_user_id\"",
                new Exception("23505")));

        var handler = new GetPatientMeQueryHandler(repo, uow);
        var result = await handler.Handle(
            new GetPatientMeQuery("user_clerk_me_race", new[] { "maria.race@ustp.edu.ph" }),
            CancellationToken.None);

        result.Should().NotBeNull();
        result!.Id.Should().Be(legacyPatient.Id);
        result.ClinicEzId.Should().Be("CE-USTP-RACE");
    }

    [Fact]
    public async Task GetPatientByClerkId_WhenReclaimHits23505UniqueViolation_RefetchesAndReturnsSummary()
    {
        var repo = Substitute.For<IPatientRepository>();
        var uow = Substitute.For<IUnitOfWork>();
        var legacyPatient = new PatientEntity
        {
            Id = Guid.NewGuid(),
            ClinicEzId = "CE-USTP-SUM",
            ClerkUserId = null,
            FirstName = "Luis",
            LastName = "Cruz",
            Email = "luis@ustp.edu.ph"
        };
        var reclaimedPatient = new PatientEntity
        {
            Id = legacyPatient.Id,
            ClinicEzId = "CE-USTP-SUM",
            ClerkUserId = "user_clerk_sum_race",
            FirstName = "Luis",
            LastName = "Cruz",
            Email = "luis@ustp.edu.ph"
        };

        var getCalls = 0;
        repo.GetByClerkUserIdAsync("user_clerk_sum_race", Arg.Any<CancellationToken>())
            .Returns(_ => ++getCalls == 1 ? null : reclaimedPatient);
        repo.GetSingleUnlinkedByVerifiedEmailsAsync(Arg.Any<IReadOnlyList<string>>(), Arg.Any<CancellationToken>())
            .Returns(legacyPatient);
        uow.SaveChangesAsync(Arg.Any<CancellationToken>())
            .ThrowsAsync(new DbUpdateException(
                "23505: duplicate key value violates unique constraint \"ix_patients_clerk_user_id\"",
                new Exception("23505")));

        var handler = new GetPatientByClerkIdQueryHandler(repo, uow);
        var result = await handler.Handle(
            new GetPatientByClerkIdQuery("user_clerk_sum_race", new[] { "luis@ustp.edu.ph" }),
            CancellationToken.None);

        result.Should().NotBeNull();
        result!.Id.Should().Be(legacyPatient.Id);
        result.ClinicEzId.Should().Be("CE-USTP-SUM");
    }

    [Fact]
    public async Task CreatePatient_WhenReclaimHitsDbUpdateConcurrencyException_ClearsChangeTrackerAndReturnsRacedId()
    {
        var dbName = $"reclaim-xmin-create-{Guid.NewGuid()}";
        var legacyId = Guid.NewGuid();
        await SeedUnlinkedPatientAsync(dbName, legacyId, "race.create@ustp.edu.ph", "CE-RACE-1");

        var interceptor = new ConcurrentClaimFaultInterceptor(dbName, legacyId, "user_clerk_xmin_create", throwConcurrency: true);
        var options = new DbContextOptionsBuilder<ApplicationDbContext>()
            .UseInMemoryDatabase(dbName)
            .AddInterceptors(interceptor)
            .Options;

        await using var db = new ApplicationDbContext(options);
        var repo = new PatientRepository(db);
        var uow = new UnitOfWork(db);
        var handler = new CreatePatientCommandHandler(repo, uow);

        var returnedId = await handler.Handle(
            new CreatePatientCommand("user_clerk_xmin_create", "Pedro", null, "Penduko", null, "Male", null, "Filipino", new[] { "race.create@ustp.edu.ph" }),
            CancellationToken.None);

        returnedId.Should().Be(legacyId);
        db.ChangeTracker.Entries()
            .Where(e => e.State is EntityState.Modified or EntityState.Added or EntityState.Deleted)
            .Should().BeEmpty();
        (await db.SaveChangesAsync()).Should().Be(0);
    }

    [Fact]
    public async Task CreatePatient_WhenInsertHits23505WithRealDbContext_ClearsChangeTrackerAndReturnsRacedId()
    {
        var dbName = $"insert-23505-create-{Guid.NewGuid()}";
        var existingId = Guid.NewGuid();
        var setupOptions = new DbContextOptionsBuilder<ApplicationDbContext>()
            .UseInMemoryDatabase(dbName)
            .Options;
        await using (var setupDb = new ApplicationDbContext(setupOptions))
        {
            setupDb.Patients.Add(new PatientEntity
            {
                Id = existingId,
                ClinicEzId = "CE-RACE-INS",
                ClerkUserId = "user_clerk_ins_23505",
                FirstName = "Ana",
                LastName = "Reyes"
            });
            await setupDb.SaveChangesAsync();
        }

        // First GetByClerkUserId returns null (simulating pre-insert check before concurrent insert commits),
        // then interceptor injects 23505 on SaveChangesAsync.
        var repo = Substitute.For<IPatientRepository>();
        var interceptor = new ConcurrentInsert23505Interceptor();
        var options = new DbContextOptionsBuilder<ApplicationDbContext>()
            .UseInMemoryDatabase(dbName)
            .AddInterceptors(interceptor)
            .Options;

        await using var db = new ApplicationDbContext(options);
        var realRepo = new PatientRepository(db);
        var uow = new UnitOfWork(db);
        var getCalls = 0;
        repo.GetByClerkUserIdAsync("user_clerk_ins_23505", Arg.Any<CancellationToken>())
            .Returns(ci => ++getCalls == 1
                ? Task.FromResult<PatientEntity?>(null)
                : realRepo.GetByClerkUserIdAsync("user_clerk_ins_23505", ci.Arg<CancellationToken>()));
        repo.AddAsync(Arg.Any<PatientEntity>(), Arg.Any<CancellationToken>())
            .Returns(ci => realRepo.AddAsync(ci.Arg<PatientEntity>(), ci.Arg<CancellationToken>()));

        var handler = new CreatePatientCommandHandler(repo, uow);
        var returnedId = await handler.Handle(
            new CreatePatientCommand("user_clerk_ins_23505", "Ana", null, "Reyes", null, "Female", null, "Filipino"),
            CancellationToken.None);

        returnedId.Should().Be(existingId);
        db.ChangeTracker.Entries()
            .Where(e => e.State is EntityState.Modified or EntityState.Added or EntityState.Deleted)
            .Should().BeEmpty();
        (await db.SaveChangesAsync()).Should().Be(0);
    }

    [Fact]
    public async Task GetPatientMe_WhenReclaimHitsDbUpdateConcurrencyException_ClearsChangeTrackerAndReturnsDto()
    {
        var dbName = $"reclaim-xmin-me-{Guid.NewGuid()}";
        var legacyId = Guid.NewGuid();
        await SeedUnlinkedPatientAsync(dbName, legacyId, "race.me@ustp.edu.ph", "CE-RACE-ME");

        var interceptor = new ConcurrentClaimFaultInterceptor(dbName, legacyId, "user_clerk_xmin_me", throwConcurrency: true);
        var options = new DbContextOptionsBuilder<ApplicationDbContext>()
            .UseInMemoryDatabase(dbName)
            .AddInterceptors(interceptor)
            .Options;

        await using var db = new ApplicationDbContext(options);
        var repo = new PatientRepository(db);
        var uow = new UnitOfWork(db);
        var handler = new GetPatientMeQueryHandler(repo, uow);

        var result = await handler.Handle(
            new GetPatientMeQuery("user_clerk_xmin_me", new[] { "race.me@ustp.edu.ph" }),
            CancellationToken.None);

        result.Should().NotBeNull();
        result!.Id.Should().Be(legacyId);
        result.ClinicEzId.Should().Be("CE-RACE-ME");
        db.ChangeTracker.Entries()
            .Where(e => e.State is EntityState.Modified or EntityState.Added or EntityState.Deleted)
            .Should().BeEmpty();
        (await db.SaveChangesAsync()).Should().Be(0);
    }

    [Fact]
    public async Task GetPatientByClerkId_WhenReclaimHitsDbUpdateConcurrencyException_ClearsChangeTrackerAndReturnsSummary()
    {
        var dbName = $"reclaim-xmin-byclerk-{Guid.NewGuid()}";
        var legacyId = Guid.NewGuid();
        await SeedUnlinkedPatientAsync(dbName, legacyId, "race.clerk@ustp.edu.ph", "CE-RACE-CLK");

        var interceptor = new ConcurrentClaimFaultInterceptor(dbName, legacyId, "user_clerk_xmin_byclerk", throwConcurrency: true);
        var options = new DbContextOptionsBuilder<ApplicationDbContext>()
            .UseInMemoryDatabase(dbName)
            .AddInterceptors(interceptor)
            .Options;

        await using var db = new ApplicationDbContext(options);
        var repo = new PatientRepository(db);
        var uow = new UnitOfWork(db);
        var handler = new GetPatientByClerkIdQueryHandler(repo, uow);

        var result = await handler.Handle(
            new GetPatientByClerkIdQuery("user_clerk_xmin_byclerk", new[] { "race.clerk@ustp.edu.ph" }),
            CancellationToken.None);

        result.Should().NotBeNull();
        result!.Id.Should().Be(legacyId);
        result.ClinicEzId.Should().Be("CE-RACE-CLK");
        db.ChangeTracker.Entries()
            .Where(e => e.State is EntityState.Modified or EntityState.Added or EntityState.Deleted)
            .Should().BeEmpty();
        (await db.SaveChangesAsync()).Should().Be(0);
    }

    private static async Task SeedUnlinkedPatientAsync(string dbName, Guid patientId, string email, string clinicEzId)
    {
        var options = new DbContextOptionsBuilder<ApplicationDbContext>()
            .UseInMemoryDatabase(dbName)
            .Options;

        await using var db = new ApplicationDbContext(options);
        db.Patients.Add(new PatientEntity
        {
            Id = patientId,
            ClinicEzId = clinicEzId,
            ClerkUserId = null,
            FirstName = "Maria",
            LastName = "Santos",
            Email = email
        });
        await db.SaveChangesAsync();
    }

    private sealed class ConcurrentClaimFaultInterceptor : SaveChangesInterceptor
    {
        private readonly string _dbName;
        private readonly Guid _patientId;
        private readonly string _winningClerkUserId;
        private readonly bool _throwConcurrency;
        private bool _triggered;

        public ConcurrentClaimFaultInterceptor(string dbName, Guid patientId, string winningClerkUserId, bool throwConcurrency)
        {
            _dbName = dbName;
            _patientId = patientId;
            _winningClerkUserId = winningClerkUserId;
            _throwConcurrency = throwConcurrency;
        }

        public override async ValueTask<InterceptionResult<int>> SavingChangesAsync(
            DbContextEventData eventData,
            InterceptionResult<int> result,
            CancellationToken cancellationToken = default)
        {
            if (!_triggered)
            {
                _triggered = true;
                var winnerOptions = new DbContextOptionsBuilder<ApplicationDbContext>()
                    .UseInMemoryDatabase(_dbName)
                    .Options;
                await using var winnerDb = new ApplicationDbContext(winnerOptions);
                var winnerRow = await winnerDb.Patients.FirstAsync(p => p.Id == _patientId, cancellationToken);
                winnerRow.ClerkUserId = _winningClerkUserId;
                await winnerDb.SaveChangesAsync(cancellationToken);

                if (_throwConcurrency)
                {
                    throw new DbUpdateConcurrencyException("Simulated PostgreSQL xmin optimistic concurrency conflict.");
                }

                throw new DbUpdateException(
                    "23505: duplicate key value violates unique constraint \"ix_patients_clerk_user_id\"",
                    new Exception("23505"));
            }

            return await base.SavingChangesAsync(eventData, result, cancellationToken);
        }
    }

    private sealed class ConcurrentInsert23505Interceptor : SaveChangesInterceptor
    {
        private bool _triggered;

        public override ValueTask<InterceptionResult<int>> SavingChangesAsync(
            DbContextEventData eventData,
            InterceptionResult<int> result,
            CancellationToken cancellationToken = default)
        {
            if (!_triggered)
            {
                _triggered = true;
                throw new DbUpdateException(
                    "23505: duplicate key value violates unique constraint \"ix_patients_clerk_user_id\"",
                    new Exception("23505"));
            }

            return base.SavingChangesAsync(eventData, result, cancellationToken);
        }
    }
}
