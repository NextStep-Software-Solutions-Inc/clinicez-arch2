using System;
using System.Linq;
using System.Threading;
using System.Threading.Tasks;
using ClinicEz.Clinic.Application.Features.Staff.Commands;
using ClinicEz.Clinic.Application.Features.Staff.Queries;
using ClinicEz.Clinic.Application.Tests;
using ClinicEz.Clinic.Domain.Entities;
using ClinicEz.Clinic.Domain.Enums;
using ClinicEz.Clinic.Domain.Interfaces;
using FluentAssertions;
using Microsoft.EntityFrameworkCore;
using NSubstitute;
using Xunit;

namespace ClinicEz.Clinic.Application.Tests.Features.Staff;

public class StaffPhilHealthPanTests
{
    private readonly IClinicContext _clinicContext;
    private readonly Guid _clinicId = Guid.NewGuid();
    private readonly string _tenantId = "tenant_pan_test";
    private readonly Guid _staffId = Guid.NewGuid();

    public StaffPhilHealthPanTests()
    {
        _clinicContext = Substitute.For<IClinicContext>();
        _clinicContext.ClinicId.Returns(_clinicId);
        _clinicContext.TenantId.Returns(_tenantId);
        _clinicContext.StaffId.Returns(_staffId);
    }

    [Fact]
    public async Task CreateStaffMember_WithPhilHealthPan_PersistsAndReturnsPan()
    {
        // Arrange
        var (context, uow, sieve) = TestDbHelper.CreateTestContext(_clinicContext);
        var staffRepo = TestDbHelper.CreateRepository<StaffMember>(context, sieve);
        var roleRepo = TestDbHelper.CreateRepository<Role>(context, sieve);
        var settingsRepo = TestDbHelper.CreateRepository<FacilitySettings>(context, sieve);

        var settings = new FacilitySettings
        {
            Id = Guid.NewGuid(),
            ClinicId = _clinicId,
            TenantId = _tenantId,
            ClinicName = "Test Clinic",
            LicenseToken = "mock.valid.token"
        };
        await settingsRepo.AddAsync(settings, CancellationToken.None);
        await uow.SaveChangesAsync(CancellationToken.None);

        var licenseValidator = Substitute.For<ClinicEz.Shared.Licensing.IFacilityLicenseValidator>();
        licenseValidator.Validate(Arg.Any<string?>(), _clinicId, _tenantId)
            .Returns(ClinicEz.Shared.Licensing.LicenseValidationResult.Success(new ClinicEz.Shared.Licensing.FacilityLicensePayload
            {
                FacilityId = _clinicId,
                TenantId = _tenantId,
                Limits = new ClinicEz.Shared.Licensing.FacilityLimits { MaxStaff = 10 }
            }));

        var handler = new CreateStaffMemberCommandHandler(staffRepo, roleRepo, settingsRepo, licenseValidator, uow, _clinicContext);

        var command = new CreateStaffMemberCommand(
            FirstName: "Jose",
            LastName: "Santos",
            MiddleName: null,
            Title: "MD",
            Role: StaffRole.Doctor,
            ClinicRoleId: null,
            Email: "dr.santos@clinicez.ph",
            PhoneNumber: "09171234567",
            PrcLicenseNumber: "PRC-0098765",
            PtrNumber: "PTR-123",
            S2LicenseNumber: "S2-456",
            Specialty: "Internal Medicine",
            PhilHealthPan: "PAN-123456789"
        );

        // Act
        var result = await handler.Handle(command, CancellationToken.None);

        // Assert
        result.Should().NotBeNull();
        result.PhilHealthPan.Should().Be("PAN-123456789");

        var savedStaff = await staffRepo.Query(s => s.Id == result.Id).FirstOrDefaultAsync();
        savedStaff.Should().NotBeNull();
        savedStaff!.PhilHealthPan.Should().Be("PAN-123456789");
    }

    [Fact]
    public async Task UpdateStaffMember_WithPhilHealthPan_UpdatesAndReturnsPan()
    {
        // Arrange
        var (context, uow, sieve) = TestDbHelper.CreateTestContext(_clinicContext);
        var staffRepo = TestDbHelper.CreateRepository<StaffMember>(context, sieve);
        var roleRepo = TestDbHelper.CreateRepository<Role>(context, sieve);

        var targetId = Guid.NewGuid();
        var existingStaff = new StaffMember
        {
            Id = targetId,
            TenantId = _tenantId,
            ClinicId = _clinicId,
            FirstName = "Maria",
            LastName = "Cruz",
            Role = StaffRole.Doctor,
            PrcLicenseNumber = "PRC-1122334",
            PhilHealthPan = "PAN-OLD"
        };
        await staffRepo.AddAsync(existingStaff, CancellationToken.None);
        await uow.SaveChangesAsync(CancellationToken.None);

        var handler = new UpdateStaffMemberCommandHandler(staffRepo, roleRepo, uow, _clinicContext);

        var command = new UpdateStaffMemberCommand(
            Id: targetId,
            FirstName: "Maria",
            LastName: "Cruz",
            MiddleName: null,
            Title: "MD",
            Role: StaffRole.Doctor,
            ClinicRoleId: null,
            Email: "dr.cruz@clinicez.ph",
            PhoneNumber: null,
            PrcLicenseNumber: "PRC-1122334",
            PtrNumber: null,
            S2LicenseNumber: null,
            Specialty: "Pediatrics",
            IsActive: true,
            PhilHealthPan: "PAN-UPDATED-999"
        );

        // Act
        var result = await handler.Handle(command, CancellationToken.None);

        // Assert
        result.PhilHealthPan.Should().Be("PAN-UPDATED-999");

        var updatedStaff = await staffRepo.Query(s => s.Id == targetId).FirstOrDefaultAsync();
        updatedStaff!.PhilHealthPan.Should().Be("PAN-UPDATED-999");
    }

    [Fact]
    public async Task UpdateMyProfile_WithPhilHealthPan_UpdatesOwnPan()
    {
        // Arrange
        var (context, uow, sieve) = TestDbHelper.CreateTestContext(_clinicContext);
        var staffRepo = TestDbHelper.CreateRepository<StaffMember>(context, sieve);

        var existingStaff = new StaffMember
        {
            Id = _staffId,
            TenantId = _tenantId,
            ClinicId = _clinicId,
            FirstName = "Juan",
            LastName = "Luna",
            Role = StaffRole.Doctor,
            PrcLicenseNumber = "PRC-5544332",
            PhilHealthPan = null
        };
        await staffRepo.AddAsync(existingStaff, CancellationToken.None);
        await uow.SaveChangesAsync(CancellationToken.None);

        var handler = new UpdateMyProfileCommandHandler(staffRepo, uow, _clinicContext);

        var command = new UpdateMyProfileCommand(
            StaffId: _staffId,
            FirstName: "Juan",
            LastName: "Luna",
            MiddleName: null,
            Title: "MD",
            PhoneNumber: "09181112233",
            PrcLicenseNumber: "PRC-5544332",
            PtrNumber: null,
            S2LicenseNumber: null,
            Specialty: "Dermatology",
            PhilHealthPan: "PAN-LUNA-777"
        );

        // Act
        var result = await handler.Handle(command, CancellationToken.None);

        // Assert
        result.PhilHealthPan.Should().Be("PAN-LUNA-777");

        var updated = await staffRepo.Query(s => s.Id == _staffId).FirstOrDefaultAsync();
        updated!.PhilHealthPan.Should().Be("PAN-LUNA-777");
    }

    [Fact]
    public async Task GetStaffMembers_ReturnsPhilHealthPanInDto()
    {
        // Arrange
        var (context, uow, sieve) = TestDbHelper.CreateTestContext(_clinicContext);
        var staffRepo = TestDbHelper.CreateRepository<StaffMember>(context, sieve);

        var staff1 = new StaffMember
        {
            Id = Guid.NewGuid(),
            TenantId = _tenantId,
            ClinicId = _clinicId,
            FirstName = "Doc",
            LastName = "A",
            Role = StaffRole.Doctor,
            PrcLicenseNumber = "PRC-1",
            PhilHealthPan = "PAN-DOC-A"
        };
        await staffRepo.AddAsync(staff1, CancellationToken.None);
        await uow.SaveChangesAsync(CancellationToken.None);

        var listHandler = new GetStaffMembersQueryHandler(staffRepo, _clinicContext);
        var singleHandler = new GetStaffMemberByIdQueryHandler(staffRepo, _clinicContext);

        // Act
        var listResult = await listHandler.Handle(new GetStaffMembersQuery(), CancellationToken.None);
        var singleResult = await singleHandler.Handle(new GetStaffMemberByIdQuery(staff1.Id), CancellationToken.None);

        // Assert
        listResult.Should().Contain(s => s.PhilHealthPan == "PAN-DOC-A");
        singleResult.PhilHealthPan.Should().Be("PAN-DOC-A");
    }
}
