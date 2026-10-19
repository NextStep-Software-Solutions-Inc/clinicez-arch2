using ClinicEz.Patient.Application.Features.Clinics.Commands.UnlockClinicAccess;
using ClinicEz.Patient.Domain.Entities;
using ClinicEz.Patient.Domain.Enums;
using ClinicEz.Patient.Domain.Interfaces;
using ClinicEz.Shared.Exceptions;
using FluentAssertions;
using FluentValidation;
using ValidationException = ClinicEz.Shared.Exceptions.ValidationException;
using NSubstitute;

namespace ClinicEz.Patient.Application.Tests.Features.Clinics.Commands;

using Patient = ClinicEz.Patient.Domain.Entities.Patient;

public sealed class UnlockClinicAccessCommandHandlerTests
{
    private readonly IPatientRepository _patientRepo = Substitute.For<IPatientRepository>();
    private readonly IClinicRepository _clinicRepo = Substitute.For<IClinicRepository>();
    private readonly IClinicMembershipRepository _membershipRepo = Substitute.For<IClinicMembershipRepository>();
    private readonly IOrganizationMembershipRepository _orgMembershipRepo = Substitute.For<IOrganizationMembershipRepository>();
    private readonly IUnitOfWork _uow = Substitute.For<IUnitOfWork>();

    private UnlockClinicAccessCommandHandler CreateHandler() =>
        new(_patientRepo, _clinicRepo, _membershipRepo, _orgMembershipRepo, _uow);

    [Fact]
    public async Task Handle_WhenPatientNotFound_ThrowsNotFoundException()
    {
        var patientId = Guid.NewGuid();
        var clinicId = Guid.NewGuid();

        _patientRepo.GetByIdAsync(patientId, Arg.Any<CancellationToken>()).Returns((Patient?)null);

        var command = new UnlockClinicAccessCommand(clinicId, patientId, JoinCode: "ABC123");
        var act = () => CreateHandler().Handle(command, CancellationToken.None);

        await act.Should().ThrowAsync<NotFoundException>();
    }

    [Fact]
    public async Task Handle_WhenClinicNotFound_ThrowsNotFoundException()
    {
        var patientId = Guid.NewGuid();
        var clinicId = Guid.NewGuid();

        _patientRepo.GetByIdAsync(patientId, Arg.Any<CancellationToken>())
            .Returns(new Patient { Id = patientId });
        _clinicRepo.GetByIdAsync(clinicId, Arg.Any<CancellationToken>()).Returns((Clinic?)null);

        var command = new UnlockClinicAccessCommand(clinicId, patientId, JoinCode: "ABC123");
        var act = () => CreateHandler().Handle(command, CancellationToken.None);

        await act.Should().ThrowAsync<NotFoundException>();
    }

    [Fact]
    public async Task Handle_WhenClinicNotGated_ReturnsUnlockedWithoutCreatingMembership()
    {
        var patientId = Guid.NewGuid();
        var clinicId = Guid.NewGuid();

        _patientRepo.GetByIdAsync(patientId, Arg.Any<CancellationToken>())
            .Returns(new Patient { Id = patientId });
        _clinicRepo.GetByIdAsync(clinicId, Arg.Any<CancellationToken>())
            .Returns(new Clinic { Id = clinicId, IsGated = false });

        var command = new UnlockClinicAccessCommand(clinicId, patientId, JoinCode: "ABC123");
        var result = await CreateHandler().Handle(command, CancellationToken.None);

        result.Success.Should().BeTrue();
        result.IsUnlocked.Should().BeTrue();
        await _membershipRepo.DidNotReceive().AddAsync(Arg.Any<ClinicMembership>(), Arg.Any<CancellationToken>());
    }

    [Fact]
    public async Task Handle_WhenJoinCodeMatches_CreatesActiveMembershipAndSaves()
    {
        var patientId = Guid.NewGuid();
        var clinicId = Guid.NewGuid();

        var clinic = new Clinic { Id = clinicId, IsGated = true, JoinCode = "VIP888", ActiveMemberCount = 5 };

        _patientRepo.GetByIdAsync(patientId, Arg.Any<CancellationToken>())
            .Returns(new Patient { Id = patientId });
        _clinicRepo.GetByIdAsync(clinicId, Arg.Any<CancellationToken>()).Returns(clinic);
        _membershipRepo.GetByPatientAndClinicWithDeletedAsync(patientId, clinicId, Arg.Any<CancellationToken>())
            .Returns((ClinicMembership?)null);
        _uow.SaveChangesAsync(Arg.Any<CancellationToken>()).Returns(1);

        var command = new UnlockClinicAccessCommand(clinicId, patientId, JoinCode: "VIP888");
        var result = await CreateHandler().Handle(command, CancellationToken.None);

        result.Success.Should().BeTrue();
        result.IsUnlocked.Should().BeTrue();
        result.MembershipId.Should().NotBeNull();
        clinic.ActiveMemberCount.Should().Be(6);

        await _membershipRepo.Received(1).AddAsync(
            Arg.Is<ClinicMembership>(m =>
                m.PatientId == patientId &&
                m.ClinicId == clinicId &&
                m.Status == ClinicMembershipStatus.Active),
            Arg.Any<CancellationToken>());

        await _uow.Received(1).SaveChangesAsync(Arg.Any<CancellationToken>());
    }

    [Fact]
    public async Task Handle_WhenJoinCodeDoesNotMatch_ThrowsValidationException()
    {
        var patientId = Guid.NewGuid();
        var clinicId = Guid.NewGuid();

        var clinic = new Clinic { Id = clinicId, IsGated = true, JoinCode = "VIP888" };

        _patientRepo.GetByIdAsync(patientId, Arg.Any<CancellationToken>())
            .Returns(new Patient { Id = patientId });
        _clinicRepo.GetByIdAsync(clinicId, Arg.Any<CancellationToken>()).Returns(clinic);

        var command = new UnlockClinicAccessCommand(clinicId, patientId, JoinCode: "WRONG1");
        var act = () => CreateHandler().Handle(command, CancellationToken.None);

        await act.Should().ThrowAsync<ValidationException>()
            .WithMessage("*Invalid clinic join code*");
    }

    [Fact]
    public async Task Handle_WhenJoinCodeHasExpired_ThrowsValidationException()
    {
        var patientId = Guid.NewGuid();
        var clinicId = Guid.NewGuid();

        var clinic = new Clinic
        {
            Id = clinicId,
            IsGated = true,
            JoinCode = "VIP888",
            JoinCodeExpiresAt = DateTime.UtcNow.AddMinutes(-10)
        };

        _patientRepo.GetByIdAsync(patientId, Arg.Any<CancellationToken>())
            .Returns(new Patient { Id = patientId });
        _clinicRepo.GetByIdAsync(clinicId, Arg.Any<CancellationToken>()).Returns(clinic);

        var command = new UnlockClinicAccessCommand(clinicId, patientId, JoinCode: "VIP888");
        var act = () => CreateHandler().Handle(command, CancellationToken.None);

        await act.Should().ThrowAsync<ValidationException>()
            .WithMessage("*expired*");
    }

    [Fact]
    public async Task Handle_WhenLinkedOrganizationMembershipActive_UnlocksSuccessfully()
    {
        var patientId = Guid.NewGuid();
        var clinicId = Guid.NewGuid();
        var orgId = Guid.NewGuid();

        var clinic = new Clinic
        {
            Id = clinicId,
            IsGated = true,
            OrganizationLinks =
            [
                new ClinicOrganizationLink { OrganizationId = orgId, IsActive = true }
            ]
        };

        _patientRepo.GetByIdAsync(patientId, Arg.Any<CancellationToken>())
            .Returns(new Patient { Id = patientId });
        _clinicRepo.GetByIdAsync(clinicId, Arg.Any<CancellationToken>()).Returns(clinic);
        _orgMembershipRepo.GetByPatientAndOrgAsync(patientId, orgId, Arg.Any<CancellationToken>())
            .Returns(new OrganizationMembership
            {
                Id = Guid.NewGuid(),
                PatientId = patientId,
                OrganizationId = orgId,
                Status = ClinicMembershipStatus.Active
            });
        _membershipRepo.GetByPatientAndClinicWithDeletedAsync(patientId, clinicId, Arg.Any<CancellationToken>())
            .Returns((ClinicMembership?)null);
        _uow.SaveChangesAsync(Arg.Any<CancellationToken>()).Returns(1);

        var command = new UnlockClinicAccessCommand(clinicId, patientId, OrganizationId: orgId);
        var result = await CreateHandler().Handle(command, CancellationToken.None);

        result.Success.Should().BeTrue();
        result.IsUnlocked.Should().BeTrue();
        result.MembershipId.Should().NotBeNull();

        await _membershipRepo.Received(1).AddAsync(
            Arg.Is<ClinicMembership>(m => m.Status == ClinicMembershipStatus.Active),
            Arg.Any<CancellationToken>());
    }

    [Fact]
    public async Task Handle_WhenOrganizationNotLinked_ThrowsValidationException()
    {
        var patientId = Guid.NewGuid();
        var clinicId = Guid.NewGuid();
        var unlinkedOrgId = Guid.NewGuid();

        var clinic = new Clinic
        {
            Id = clinicId,
            IsGated = true,
            OrganizationLinks = []
        };

        _patientRepo.GetByIdAsync(patientId, Arg.Any<CancellationToken>())
            .Returns(new Patient { Id = patientId });
        _clinicRepo.GetByIdAsync(clinicId, Arg.Any<CancellationToken>()).Returns(clinic);

        var command = new UnlockClinicAccessCommand(clinicId, patientId, OrganizationId: unlinkedOrgId);
        var act = () => CreateHandler().Handle(command, CancellationToken.None);

        await act.Should().ThrowAsync<ValidationException>()
            .WithMessage("*not linked*");
    }

    [Fact]
    public async Task Handle_WhenExistingMembershipIsReactivated_UpdatesStatusToActive()
    {
        var patientId = Guid.NewGuid();
        var clinicId = Guid.NewGuid();
        var existingMembershipId = Guid.NewGuid();

        var clinic = new Clinic { Id = clinicId, IsGated = true, JoinCode = "VIP888", ActiveMemberCount = 3 };
        var existing = new ClinicMembership
        {
            Id = existingMembershipId,
            PatientId = patientId,
            ClinicId = clinicId,
            Status = ClinicMembershipStatus.Pending,
            IsDeleted = true
        };

        _patientRepo.GetByIdAsync(patientId, Arg.Any<CancellationToken>())
            .Returns(new Patient { Id = patientId });
        _clinicRepo.GetByIdAsync(clinicId, Arg.Any<CancellationToken>()).Returns(clinic);
        _membershipRepo.GetByPatientAndClinicWithDeletedAsync(patientId, clinicId, Arg.Any<CancellationToken>())
            .Returns(existing);
        _uow.SaveChangesAsync(Arg.Any<CancellationToken>()).Returns(1);

        var command = new UnlockClinicAccessCommand(clinicId, patientId, JoinCode: "VIP888");
        var result = await CreateHandler().Handle(command, CancellationToken.None);

        result.Success.Should().BeTrue();
        result.MembershipId.Should().Be(existingMembershipId);
        existing.Status.Should().Be(ClinicMembershipStatus.Active);
        existing.IsDeleted.Should().BeFalse();

        _membershipRepo.Received(1).Update(existing);
        await _uow.Received(1).SaveChangesAsync(Arg.Any<CancellationToken>());
    }
}
