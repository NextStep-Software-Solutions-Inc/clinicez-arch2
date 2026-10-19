using ClinicEz.Patient.Application.Features.Clinics.Queries.GetClinicDetail;
using ClinicEz.Patient.Domain.Entities;
using ClinicEz.Patient.Domain.Enums;
using ClinicEz.Patient.Domain.Interfaces;
using FluentAssertions;
using NSubstitute;

namespace ClinicEz.Patient.Application.Tests.Features.Clinics.Queries;

public sealed class GetClinicDetailQueryHandlerTests
{
    private readonly IClinicRepository _clinicRepo = Substitute.For<IClinicRepository>();
    private readonly IClinicMembershipRepository _membershipRepo = Substitute.For<IClinicMembershipRepository>();
    private readonly IOrganizationMembershipRepository _orgMembershipRepo = Substitute.For<IOrganizationMembershipRepository>();

    private GetClinicDetailQueryHandler CreateHandler() =>
        new(_clinicRepo, _membershipRepo, _orgMembershipRepo);

    private static Clinic CreateSampleClinic(Guid clinicId, bool isGated = false)
    {
        return new Clinic
        {
            Id = clinicId,
            Name = "St. Paul Family Clinic",
            Description = "General and specialist clinic",
            IsPublic = true,
            IsGated = isGated,
            SupportsAppointments = true,
            Services =
            [
                new ClinicService
                {
                    Id = Guid.NewGuid(),
                    ClinicId = clinicId,
                    Name = "General Consultation",
                    Price = 500m,
                    IsActive = true,
                    DisplayOrder = 1
                },
                new ClinicService
                {
                    Id = Guid.NewGuid(),
                    ClinicId = clinicId,
                    Name = "Pediatric Checkup",
                    Price = 600m,
                    IsActive = true,
                    DisplayOrder = 2
                }
            ],
            HealthcareProviders =
            [
                new ClinicHealthcareProvider
                {
                    Id = Guid.NewGuid(),
                    ClinicId = clinicId,
                    Name = "Dr. Jose Rizal",
                    Specialty = "General Practice",
                    IsActive = true
                }
            ]
        };
    }

    [Fact]
    public async Task Handle_WhenClinicNotFound_ReturnsNull()
    {
        var clinicId = Guid.NewGuid();
        _clinicRepo.GetByIdAsync(clinicId, Arg.Any<CancellationToken>()).Returns((Clinic?)null);

        var result = await CreateHandler().Handle(new GetClinicDetailQuery(clinicId), CancellationToken.None);

        result.Should().BeNull();
    }

    [Fact]
    public async Task Handle_WhenClinicNotGated_ReturnsUnlockedWithServices()
    {
        var clinicId = Guid.NewGuid();
        var clinic = CreateSampleClinic(clinicId, isGated: false);
        _clinicRepo.GetByIdAsync(clinicId, Arg.Any<CancellationToken>()).Returns(clinic);

        var result = await CreateHandler().Handle(new GetClinicDetailQuery(clinicId), CancellationToken.None);

        result.Should().NotBeNull();
        result!.IsGated.Should().BeFalse();
        result.IsUnlocked.Should().BeTrue();
        result.Services.Should().HaveCount(2);
    }

    [Fact]
    public async Task Handle_WhenClinicGatedAndPatientNotProvided_ReturnsLockedAndRedactsServices()
    {
        var clinicId = Guid.NewGuid();
        var clinic = CreateSampleClinic(clinicId, isGated: true);
        _clinicRepo.GetByIdAsync(clinicId, Arg.Any<CancellationToken>()).Returns(clinic);

        var result = await CreateHandler().Handle(new GetClinicDetailQuery(clinicId, ForPatientId: null), CancellationToken.None);

        result.Should().NotBeNull();
        result!.IsGated.Should().BeTrue();
        result.IsUnlocked.Should().BeFalse();
        result.Services.Should().BeEmpty("services must be redacted when a gated clinic is locked");
    }

    [Fact]
    public async Task Handle_WhenClinicGatedAndDirectActiveMembershipExists_ReturnsUnlockedWithServices()
    {
        var clinicId = Guid.NewGuid();
        var patientId = Guid.NewGuid();
        var clinic = CreateSampleClinic(clinicId, isGated: true);
        _clinicRepo.GetByIdAsync(clinicId, Arg.Any<CancellationToken>()).Returns(clinic);

        _membershipRepo.GetByPatientAndClinicAsync(patientId, clinicId, Arg.Any<CancellationToken>())
            .Returns(new ClinicMembership
            {
                Id = Guid.NewGuid(),
                PatientId = patientId,
                ClinicId = clinicId,
                Status = ClinicMembershipStatus.Active
            });

        var result = await CreateHandler().Handle(new GetClinicDetailQuery(clinicId, ForPatientId: patientId), CancellationToken.None);

        result.Should().NotBeNull();
        result!.IsGated.Should().BeTrue();
        result.IsUnlocked.Should().BeTrue();
        result.Services.Should().HaveCount(2);
        result.MembershipStatus.Should().Be("Active");
    }

    [Fact]
    public async Task Handle_WhenClinicGatedAndLinkedOrganizationActiveMembershipExists_ReturnsUnlockedWithServices()
    {
        var clinicId = Guid.NewGuid();
        var patientId = Guid.NewGuid();
        var orgId = Guid.NewGuid();

        var clinic = CreateSampleClinic(clinicId, isGated: true);
        var org = new Organization { Id = orgId, Name = "Allied Network", Slug = "allied" };
        clinic.OrganizationLinks =
        [
            new ClinicOrganizationLink
            {
                Id = Guid.NewGuid(),
                ClinicId = clinicId,
                OrganizationId = orgId,
                Organization = org,
                IsActive = true
            }
        ];

        _clinicRepo.GetByIdAsync(clinicId, Arg.Any<CancellationToken>()).Returns(clinic);
        _membershipRepo.GetByPatientAndClinicAsync(patientId, clinicId, Arg.Any<CancellationToken>())
            .Returns((ClinicMembership?)null);

        _orgMembershipRepo.GetByPatientAsync(patientId, Arg.Any<CancellationToken>())
            .Returns(new List<OrganizationMembership>
            {
                new()
                {
                    Id = Guid.NewGuid(),
                    PatientId = patientId,
                    OrganizationId = orgId,
                    Status = ClinicMembershipStatus.Active
                }
            });

        var result = await CreateHandler().Handle(new GetClinicDetailQuery(clinicId, ForPatientId: patientId), CancellationToken.None);

        result.Should().NotBeNull();
        result!.IsGated.Should().BeTrue();
        result.IsUnlocked.Should().BeTrue();
        result.Services.Should().HaveCount(2);
    }

    [Fact]
    public async Task Handle_WhenClinicGatedAndNoValidMembership_ReturnsLockedAndRedactsServices()
    {
        var clinicId = Guid.NewGuid();
        var patientId = Guid.NewGuid();
        var clinic = CreateSampleClinic(clinicId, isGated: true);

        _clinicRepo.GetByIdAsync(clinicId, Arg.Any<CancellationToken>()).Returns(clinic);
        _membershipRepo.GetByPatientAndClinicAsync(patientId, clinicId, Arg.Any<CancellationToken>())
            .Returns(new ClinicMembership
            {
                Id = Guid.NewGuid(),
                PatientId = patientId,
                ClinicId = clinicId,
                Status = ClinicMembershipStatus.Pending // Pending is not Active
            });

        var result = await CreateHandler().Handle(new GetClinicDetailQuery(clinicId, ForPatientId: patientId), CancellationToken.None);

        result.Should().NotBeNull();
        result!.IsGated.Should().BeTrue();
        result.IsUnlocked.Should().BeFalse();
        result.Services.Should().BeEmpty();
        result.MembershipStatus.Should().Be("Pending");
    }
}
