using System;
using System.Collections.Generic;
using System.Linq;
using System.Threading;
using System.Threading.Tasks;
using ClinicEz.Clinic.Application.Common.Interfaces;
using ClinicEz.Clinic.Application.Features.Patients.Commands;
using ClinicEz.Clinic.Domain.Common;
using ClinicEz.Clinic.Domain.Entities;
using ClinicEz.Clinic.Domain.Enums;
using ClinicEz.Clinic.Domain.Interfaces;
using ClinicEz.Clinic.Infrastructure.Persistence;
using ClinicEz.Clinic.Infrastructure.Persistence.Repositories;
using ClinicEz.Shared.Exceptions;
using FluentAssertions;
using Microsoft.EntityFrameworkCore;
using Microsoft.Extensions.Configuration;
using NSubstitute;
using Sieve.Services;
using Xunit;

namespace ClinicEz.Clinic.Application.Tests.Features.Patients;

public sealed class StaffVerifiedChartLinkageTests
{
    private static ApplicationDbContext CreateDb(IClinicContext clinicCtx)
    {
        var opts = new DbContextOptionsBuilder<ApplicationDbContext>()
            .UseInMemoryDatabase($"chart-link-{Guid.NewGuid()}").Options;
        var config = new ConfigurationBuilder().Build();
        return new ApplicationDbContext(opts, config, clinicCtx);
    }

    private static Repository<T> Repo<T>(ApplicationDbContext db) where T : BaseEntity
        => new(db, Substitute.For<ISieveProcessor>());

    [Fact]
    public async Task ApprovePatientLinkRequest_BindsUnlinkedChartAndPreventsDuplicateCloudBinding()
    {
        var clinicId = Guid.NewGuid();
        var cloudPatientId = Guid.NewGuid();
        var chart1Id = Guid.NewGuid();
        var chart2Id = Guid.NewGuid();
        var linkReq1Id = Guid.NewGuid();
        var linkReq2Id = Guid.NewGuid();

        var clinicCtx = Substitute.For<IClinicContext>();
        clinicCtx.ClinicId.Returns(clinicId);
        clinicCtx.TenantId.Returns("ustp-cdo");
        clinicCtx.StaffId.Returns(Guid.NewGuid());
        clinicCtx.StaffName.Returns("Nurse Clara");

        await using var db = CreateDb(clinicCtx);

        db.Patients.AddRange(
            new Patient
            {
                Id = chart1Id,
                TenantId = "ustp-cdo",
                ClinicId = clinicId,
                PatientCode = "V1-000101",
                FirstName = "Ana",
                LastName = "Reyes",
                DateOfBirth = new DateOnly(2003, 4, 15),
                Sex = BiologicalSex.Female,
                ContactNumber = "09171234567",
                Email = "ana@ustp.edu.ph",
                CustomFields = new Dictionary<string, object?> { ["student_id"] = "2023301122" }
            },
            new Patient
            {
                Id = chart2Id,
                TenantId = "ustp-cdo",
                ClinicId = clinicId,
                PatientCode = "V1-000102",
                FirstName = "Ana",
                LastName = "Reyes",
                Sex = BiologicalSex.Female,
                ContactNumber = "09171234568"
            });

        db.PatientLinkRequests.AddRange(
            new PatientLinkRequest
            {
                Id = linkReq1Id,
                TenantId = "ustp-cdo",
                ClinicId = clinicId,
                CloudPatientId = cloudPatientId,
                ClinicEzId = "CE-USTP-9999",
                FirstName = "Ana",
                LastName = "Reyes",
                VerifiedEmail = "ana@ustp.edu.ph",
                IdentifierClaims = new Dictionary<string, string> { ["student_id"] = "2023301122" },
                Status = PatientLinkRequestStatus.PendingReview
            },
            new PatientLinkRequest
            {
                Id = linkReq2Id,
                TenantId = "ustp-cdo",
                ClinicId = clinicId,
                CloudPatientId = cloudPatientId,
                ClinicEzId = "CE-USTP-9999",
                FirstName = "Ana",
                LastName = "Reyes",
                Status = PatientLinkRequestStatus.PendingReview
            });
        await db.SaveChangesAsync();

        var publisher = Substitute.For<IPatientLinkResolutionPublisher>();
        var uow = Substitute.For<IUnitOfWork>();
        uow.SaveChangesAsync(Arg.Any<CancellationToken>()).Returns(ci => db.SaveChangesAsync(ci.Arg<CancellationToken>()));

        var handler = new ApprovePatientLinkRequestCommandHandler(
            Repo<PatientLinkRequest>(db),
            Repo<Patient>(db),
            clinicCtx,
            publisher,
            uow);

        var approved = await handler.Handle(new ApprovePatientLinkRequestCommand(linkReq1Id, chart1Id), CancellationToken.None);

        approved.Status.Should().Be("Approved");
        approved.MatchedPatientId.Should().Be(chart1Id);

        var updatedChart = await db.Patients.SingleAsync(p => p.Id == chart1Id);
        updatedChart.CloudPatientId.Should().Be(cloudPatientId);
        updatedChart.ClinicEzId.Should().Be("CE-USTP-9999");

        await publisher.Received(1).PublishResolvedAsync(
            linkReq1Id, cloudPatientId, "CE-USTP-9999", chart1Id, "Approved", null, "Nurse Clara", Arg.Any<CancellationToken>());

        // Clinic-wide uniqueness guard: linking the same CloudPatientId onto a 2nd chart MUST fail with ConflictException
        Func<Task> actDuplicate = () => handler.Handle(new ApprovePatientLinkRequestCommand(linkReq2Id, chart2Id), CancellationToken.None);
        await actDuplicate.Should().ThrowAsync<ConflictException>();
    }

    [Fact]
    public async Task RejectPatientLinkRequest_MarksRejectedAndPublishesRejection()
    {
        var clinicId = Guid.NewGuid();
        var cloudPatientId = Guid.NewGuid();
        var linkReqId = Guid.NewGuid();

        var clinicCtx = Substitute.For<IClinicContext>();
        clinicCtx.ClinicId.Returns(clinicId);
        clinicCtx.TenantId.Returns("ustp-cdo");
        clinicCtx.StaffName.Returns("Front Desk Staff");

        await using var db = CreateDb(clinicCtx);

        db.PatientLinkRequests.Add(new PatientLinkRequest
        {
            Id = linkReqId,
            TenantId = "ustp-cdo",
            ClinicId = clinicId,
            CloudPatientId = cloudPatientId,
            ClinicEzId = "CE-USTP-8888",
            FirstName = "Pedro",
            LastName = "Santos",
            Status = PatientLinkRequestStatus.PendingReview
        });
        await db.SaveChangesAsync();

        var publisher = Substitute.For<IPatientLinkResolutionPublisher>();
        var uow = Substitute.For<IUnitOfWork>();
        uow.SaveChangesAsync(Arg.Any<CancellationToken>()).Returns(ci => db.SaveChangesAsync(ci.Arg<CancellationToken>()));

        var handler = new RejectPatientLinkRequestCommandHandler(
            Repo<PatientLinkRequest>(db), clinicCtx, publisher, uow);

        var rejected = await handler.Handle(new RejectPatientLinkRequestCommand(linkReqId, "ID mismatch"), CancellationToken.None);

        rejected.Status.Should().Be("Rejected");
        rejected.RejectionReason.Should().Be("ID mismatch");
        await publisher.Received(1).PublishResolvedAsync(
            linkReqId, cloudPatientId, "CE-USTP-8888", null, "Rejected", "ID mismatch", "Front Desk Staff", Arg.Any<CancellationToken>());
    }

    [Fact]
    public async Task ApprovePatientLinkRequest_WorksIdenticallyForNonBackfilledWalkInChart_WithTypeSafeJsonbMetadata()
    {
        var clinicId = Guid.NewGuid();
        var cloudPatientId = Guid.NewGuid();
        var walkInChartId = Guid.NewGuid();
        var linkReqId = Guid.NewGuid();

        var clinicCtx = Substitute.For<IClinicContext>();
        clinicCtx.ClinicId.Returns(clinicId);
        clinicCtx.TenantId.Returns("city-med");
        clinicCtx.StaffName.Returns("Desk Nurse");

        await using var db = CreateDb(clinicCtx);

        db.Patients.Add(new Patient
        {
            Id = walkInChartId,
            TenantId = "city-med",
            ClinicId = clinicId,
            PatientCode = "PAT-2026-0042",
            FirstName = "Marco",
            LastName = "Dela Cruz",
            DateOfBirth = new DateOnly(1994, 8, 12),
            Sex = BiologicalSex.Male,
            ContactNumber = "09179998877",
            CustomFields = new Dictionary<string, object?> { ["hmo_member_id"] = "MAXI-88210" }
        });

        db.PatientLinkRequests.Add(new PatientLinkRequest
        {
            Id = linkReqId,
            TenantId = "city-med",
            ClinicId = clinicId,
            CloudPatientId = cloudPatientId,
            ClinicEzId = "CE-WALK-4422",
            FirstName = "Marco",
            LastName = "Dela Cruz",
            IdentifierClaims = new Dictionary<string, string> { ["hmo_member_id"] = "MAXI-88210" },
            CandidateMatches =
            [
                new PatientLinkCandidateMatch(
                    walkInChartId, "PAT-2026-0042", "Dela Cruz, Marco",
                    new DateOnly(1994, 8, 12), null, "09179998877", 85, ["Custom Field (hmo_member_id)", "Full Name + DOB"])
            ],
            Status = PatientLinkRequestStatus.PendingReview
        });
        await db.SaveChangesAsync();

        var publisher = Substitute.For<IPatientLinkResolutionPublisher>();
        var uow = Substitute.For<IUnitOfWork>();
        uow.SaveChangesAsync(Arg.Any<CancellationToken>()).Returns(ci => db.SaveChangesAsync(ci.Arg<CancellationToken>()));

        var listHandler = new GetPatientLinkRequestsQueryHandler(Repo<PatientLinkRequest>(db), clinicCtx);
        var pending = await listHandler.Handle(new GetPatientLinkRequestsQuery("PendingReview"), CancellationToken.None);
        pending.Should().ContainSingle();
        pending[0].IdentifierClaims.Should().ContainKey("hmo_member_id").WhoseValue.Should().Be("MAXI-88210");
        pending[0].Candidates.Should().ContainSingle().Which.PatientCode.Should().Be("PAT-2026-0042");

        var approveHandler = new ApprovePatientLinkRequestCommandHandler(
            Repo<PatientLinkRequest>(db), Repo<Patient>(db), clinicCtx, publisher, uow);
        var approved = await approveHandler.Handle(new ApprovePatientLinkRequestCommand(linkReqId, walkInChartId), CancellationToken.None);

        approved.Status.Should().Be("Approved");
        var updatedWalkIn = await db.Patients.SingleAsync(p => p.Id == walkInChartId);
        updatedWalkIn.CloudPatientId.Should().Be(cloudPatientId);
        updatedWalkIn.ClinicEzId.Should().Be("CE-WALK-4422");
    }
}
