using System;
using System.Threading;
using System.Threading.Tasks;
using ClinicEz.Clinic.Application.Features.Settings.Commands;
using ClinicEz.Clinic.Domain.Entities;
using ClinicEz.Clinic.Domain.Enums;
using ClinicEz.Clinic.Domain.Interfaces;
using ClinicEz.Shared.Common;
using ClinicEz.Shared.Interop;
using FluentAssertions;
using NSubstitute;
using Xunit;

namespace ClinicEz.Clinic.Application.Tests.Features.Settings;

public class PublishClinicToDirectoryTests
{
    private readonly IClinicContext _clinicContext;
    private readonly Guid _testClinicId = Guid.NewGuid();
    private const string _testTenantId = "tenant-directory-test";

    public PublishClinicToDirectoryTests()
    {
        _clinicContext = Substitute.For<IClinicContext>();
        _clinicContext.ClinicId.Returns(_testClinicId);
        _clinicContext.TenantId.Returns(_testTenantId);
    }

    [Theory]
    [InlineData("Dental", "Dental Clinic")]
    [InlineData("dental", "Dental Clinic")]
    [InlineData("DENTAL", "Dental Clinic")]
    [InlineData("MultiSpecialty", "Multi-Specialty Clinic")]
    [InlineData("multispecialty", "Multi-Specialty Clinic")]
    [InlineData("Multi-Specialty", "Multi-Specialty Clinic")]
    [InlineData("Medical", "Ambulatory Clinic")]
    [InlineData("medical", "Ambulatory Clinic")]
    [InlineData("", "Ambulatory Clinic")]
    [InlineData(null, "Ambulatory Clinic")]
    [InlineData("UnknownSpecialty", "Ambulatory Clinic")]
    public async Task PublishClinic_MapsDynamicClassification_BasedOnSpecialtyMode(
        string? specialtyMode,
        string expectedClassification)
    {
        // Arrange
        var (context, uow, sieve) = TestDbHelper.CreateTestContext(_clinicContext);
        var settingsRepo = TestDbHelper.CreateRepository<ClinicSettings>(context, sieve);
        var staffRepo = TestDbHelper.CreateRepository<StaffMember>(context, sieve);
        var servicesRepo = TestDbHelper.CreateRepository<ClinicServiceItem>(context, sieve);
        var interopPublisher = Substitute.For<IInteropPublisher>();

        await staffRepo.AddAsync(new StaffMember
        {
            TenantId = _testTenantId,
            ClinicId = _testClinicId,
            FirstName = "Maria",
            LastName = "Santos",
            Role = StaffRole.Doctor,
            PrcLicenseNumber = "PRC-998877",
            IsActive = true
        }, CancellationToken.None);

        await servicesRepo.AddAsync(new ClinicServiceItem
        {
            ClinicId = _testClinicId,
            Code = "SRV-01",
            Name = "Clinical Consultation",
            Category = "Consultation",
            StandardPrice = 800.00m,
            IsActive = true
        }, CancellationToken.None);

        var settings = new ClinicSettings
        {
            TenantId = _testTenantId,
            ClinicId = _testClinicId,
            ClinicName = "Metro Clinic",
            OperatingHours = "Mon-Fri 8:00 AM - 5:00 PM",
            SpecialtyMode = specialtyMode!,
            IsDirectoryPublished = false
        };
        await settingsRepo.AddAsync(settings, CancellationToken.None);
        await uow.SaveChangesAsync(CancellationToken.None);

        var handler = new PublishClinicToDirectoryCommandHandler(
            settingsRepo, staffRepo, servicesRepo, _clinicContext, uow, interopPublisher);

        // Act
        var result = await handler.Handle(new PublishClinicToDirectoryCommand(true), CancellationToken.None);

        // Assert
        result.Success.Should().BeTrue();
        result.IsPublished.Should().BeTrue();
        settings.IsDirectoryPublished.Should().BeTrue();

        interopPublisher.Received(1).Enqueue(
            InteropTypes.FacilityDirectoryUpdated,
            Arg.Is<Party>(p => p.FacilityId == _testClinicId.ToString() && p.FacilityType == FacilityType.Clinic),
            Arg.Is<Party>(p => p.Kind == PartyKind.ControlPlane && p.Service == InteropServices.Patient),
            _testClinicId,
            Arg.Is<FacilityCreatedEvent>(e =>
                e.Classification == expectedClassification &&
                e.IsPublic == true &&
                e.Providers != null && e.Providers.Count == 1 &&
                e.Services != null && e.Services.Count == 1));
    }

    [Fact]
    public async Task PublishClinic_WhenUnpublishing_SetsIsPublicFalseAndPreservesClassification()
    {
        // Arrange
        var (context, uow, sieve) = TestDbHelper.CreateTestContext(_clinicContext);
        var settingsRepo = TestDbHelper.CreateRepository<ClinicSettings>(context, sieve);
        var staffRepo = TestDbHelper.CreateRepository<StaffMember>(context, sieve);
        var servicesRepo = TestDbHelper.CreateRepository<ClinicServiceItem>(context, sieve);
        var interopPublisher = Substitute.For<IInteropPublisher>();

        var settings = new ClinicSettings
        {
            TenantId = _testTenantId,
            ClinicId = _testClinicId,
            ClinicName = "Metro Dental Studio",
            OperatingHours = "Mon-Sat 9:00 AM - 6:00 PM",
            SpecialtyMode = "Dental",
            IsDirectoryPublished = true
        };
        await settingsRepo.AddAsync(settings, CancellationToken.None);
        await uow.SaveChangesAsync(CancellationToken.None);

        var handler = new PublishClinicToDirectoryCommandHandler(
            settingsRepo, staffRepo, servicesRepo, _clinicContext, uow, interopPublisher);

        // Act
        var result = await handler.Handle(new PublishClinicToDirectoryCommand(false), CancellationToken.None);

        // Assert
        result.Success.Should().BeTrue();
        result.IsPublished.Should().BeFalse();
        settings.IsDirectoryPublished.Should().BeFalse();

        interopPublisher.Received(1).Enqueue(
            InteropTypes.FacilityDirectoryUpdated,
            Arg.Any<Party>(),
            Arg.Any<Party>(),
            _testClinicId,
            Arg.Is<FacilityCreatedEvent>(e =>
                e.Classification == "Dental Clinic" &&
                e.IsPublic == false));
    }

    [Fact]
    public async Task PublishClinic_WhenReadinessChecksFail_ThrowsInvalidOperationException()
    {
        // Arrange
        var (context, uow, sieve) = TestDbHelper.CreateTestContext(_clinicContext);
        var settingsRepo = TestDbHelper.CreateRepository<ClinicSettings>(context, sieve);
        var staffRepo = TestDbHelper.CreateRepository<StaffMember>(context, sieve);
        var servicesRepo = TestDbHelper.CreateRepository<ClinicServiceItem>(context, sieve);
        var interopPublisher = Substitute.For<IInteropPublisher>();

        // Missing doctor and missing operating hours
        var settings = new ClinicSettings
        {
            TenantId = _testTenantId,
            ClinicId = _testClinicId,
            ClinicName = "Incomplete Dental Care",
            OperatingHours = "",
            SpecialtyMode = "Dental",
            IsDirectoryPublished = false
        };
        await settingsRepo.AddAsync(settings, CancellationToken.None);
        await uow.SaveChangesAsync(CancellationToken.None);

        var handler = new PublishClinicToDirectoryCommandHandler(
            settingsRepo, staffRepo, servicesRepo, _clinicContext, uow, interopPublisher);

        // Act
        var act = async () => await handler.Handle(new PublishClinicToDirectoryCommand(true), CancellationToken.None);

        // Assert
        await act.Should().ThrowAsync<InvalidOperationException>()
            .WithMessage("*readiness checks failed*");

        interopPublisher.DidNotReceiveWithAnyArgs().Enqueue<FacilityCreatedEvent>(default!, default!, default!, default, default!);
    }
}
