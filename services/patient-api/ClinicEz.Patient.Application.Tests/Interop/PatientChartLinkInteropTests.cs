using System;
using System.Threading;
using System.Threading.Tasks;
using ClinicEz.Patient.Application.Features.Clinics.Commands.RequestClinicLink;
using ClinicEz.Patient.Domain.Entities;
using ClinicEz.Patient.Domain.Enums;
using ClinicEz.Patient.Domain.Interfaces;
using ClinicEz.Patient.Infrastructure.Interop;
using ClinicEz.Patient.Infrastructure.Persistence;
using ClinicEz.Shared.Common;
using ClinicEz.Shared.Interop;
using ClinicEz.Shared.Interop.Contracts;
using ClinicEz.Shared.Interop.Handling;
using FluentAssertions;
using Microsoft.EntityFrameworkCore;
using Microsoft.Extensions.Logging.Abstractions;
using NSubstitute;
using Xunit;

namespace ClinicEz.Patient.Application.Tests.Interop;

using PatientEntity = ClinicEz.Patient.Domain.Entities.Patient;

public sealed class PatientChartLinkInteropTests
{
    [Fact]
    public async Task RequestClinicLink_EnqueuesPatientLinkRequestedEnvelopeThroughInteropHub()
    {
        var patientId = Guid.NewGuid();
        var clinicId = Guid.NewGuid();
        var patientRepo = Substitute.For<IPatientRepository>();
        var clinicRepo = Substitute.For<IClinicRepository>();
        var membershipRepo = Substitute.For<IClinicMembershipRepository>();
        var publisher = Substitute.For<IInteropPublisher>();
        var uow = Substitute.For<IUnitOfWork>();

        patientRepo.GetByIdAsync(patientId, Arg.Any<CancellationToken>())
            .Returns(new PatientEntity
            {
                Id = patientId,
                ClinicEzId = "CE-USTP-9999",
                FirstName = "Ana",
                LastName = "Reyes",
                DateOfBirth = new DateOnly(2003, 4, 15),
                Email = "ana@ustp.edu.ph",
                Mobile = "09171234567"
            });
        clinicRepo.GetByIdAsync(clinicId, Arg.Any<CancellationToken>())
            .Returns(new Clinic { Id = clinicId, TenantId = "ustp-cdo", Name = "USTP Medical Clinic - CDO" });
        membershipRepo.GetByPatientAndClinicWithDeletedAsync(patientId, clinicId, Arg.Any<CancellationToken>())
            .Returns((ClinicMembership?)null);
        uow.SaveChangesAsync(Arg.Any<CancellationToken>()).Returns(1);

        var handler = new RequestClinicLinkCommandHandler(patientRepo, clinicRepo, membershipRepo, publisher, uow);
        var linkReqId = await handler.Handle(
            new RequestClinicLinkCommand(
                patientId, clinicId, true, true, true, "ana@ustp.edu.ph",
                new System.Collections.Generic.Dictionary<string, string>
                {
                    ["student_id"] = "2023301122",
                    ["lrn"] = "123456789012"
                }),
            CancellationToken.None);

        linkReqId.Should().NotBeEmpty();
        await membershipRepo.Received(1).AddAsync(
            Arg.Is<ClinicMembership>(m => m.Id == linkReqId && m.Status == ClinicMembershipStatus.Pending),
            Arg.Any<CancellationToken>());
        publisher.Received(1).Enqueue(
            InteropTypes.PatientLinkRequested,
            Arg.Is<Party>(p => p.Kind == PartyKind.Patient && p.PatientId == patientId.ToString()),
            Arg.Is<Party>(p => p.Kind == PartyKind.Facility && p.TenantId == "ustp-cdo" && p.FacilityId == clinicId.ToString()),
            linkReqId,
            Arg.Is<PatientLinkRequestedPayload>(p =>
                p.IdentifierClaims != null &&
                p.IdentifierClaims["student_id"] == "2023301122" &&
                p.IdentifierClaims["lrn"] == "123456789012" &&
                p.ClinicEzId == "CE-USTP-9999"),
            Arg.Any<int>(),
            Arg.Any<TimeSpan?>());
    }

    [Fact]
    public async Task ClinicLinkResolvedInteropHandler_ActivatesPendingMembershipAndCreatesNotification()
    {
        var opts = new DbContextOptionsBuilder<ApplicationDbContext>()
            .UseInMemoryDatabase($"link-resolved-{Guid.NewGuid()}").Options;
        await using var db = new ApplicationDbContext(opts);

        var patientId = Guid.NewGuid();
        var clinicId = Guid.NewGuid();
        var linkId = Guid.NewGuid();

        db.ClinicMemberships.Add(new ClinicMembership
        {
            Id = linkId,
            ClientId = Guid.NewGuid(),
            PatientId = patientId,
            ClinicId = clinicId,
            Status = ClinicMembershipStatus.Pending,
            ConsentPrivacyPolicy = true,
            ConsentTermsAndConditions = true,
            ConsentDataSharing = true
        });
        await db.SaveChangesAsync();

        var handler = new ClinicLinkResolvedInteropHandler(db, NullLogger<ClinicLinkResolvedInteropHandler>.Instance);
        var payload = new ClinicLinkResolvedPayload
        {
            LinkRequestId = linkId,
            PatientId = patientId,
            ClinicEzId = "CE-USTP-9999",
            TenantId = "ustp-cdo",
            ClinicId = clinicId,
            ClinicPatientId = Guid.NewGuid(),
            Status = "Approved",
            ReviewedByStaffName = "Nurse Clara"
        };
        var env = InteropEnvelope.Create(
            InteropTypes.ClinicLinkResolved,
            Party.ForFacility("ustp-cdo", clinicId.ToString(), FacilityType.Clinic),
            Party.ForPatient(patientId.ToString()),
            linkId,
            payload);
        var ctx = new InteropMessageContext(env);

        await handler.HandleAsync(payload, ctx, CancellationToken.None);

        var membership = await db.ClinicMemberships.SingleAsync(m => m.Id == linkId);
        membership.Status.Should().Be(ClinicMembershipStatus.Active);

        var notif = await db.Notifications.SingleAsync(n => n.PatientId == patientId);
        notif.Title.Should().Contain("Linked");
    }
}
