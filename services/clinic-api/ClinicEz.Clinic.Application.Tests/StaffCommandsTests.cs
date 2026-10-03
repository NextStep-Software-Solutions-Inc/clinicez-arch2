using System;
using System.Threading;
using System.Threading.Tasks;
using ClinicEz.Clinic.Application.Features.Staff.Commands;
using ClinicEz.Clinic.Domain.Entities;
using ClinicEz.Clinic.Domain.Enums;
using ClinicEz.Clinic.Domain.Interfaces;
using FluentAssertions;
using Microsoft.EntityFrameworkCore;
using NSubstitute;
using Xunit;

namespace ClinicEz.Clinic.Application.Tests;

public class StaffCommandsTests
{
    [Fact]
    public void Validator_DoctorWithoutPrc_FailsValidation()
    {
        // Arrange
        var validator = new CreateStaffMemberCommandValidator();
        var command = new CreateStaffMemberCommand(
            "Maria",
            "Cruz",
            null,
            "MD",
            StaffRole.Doctor,
            null,
            "dr.cruz@clinic.com",
            "09171234567",
            null, // Missing PRC license
            "PTR-123456",
            "S2-987654",
            "Internal Medicine"
        );

        // Act
        var result = validator.Validate(command);

        // Assert
        result.IsValid.Should().BeFalse();
        result.Errors.Should().Contain(e => e.PropertyName == nameof(CreateStaffMemberCommand.PrcLicenseNumber));
    }

    [Fact]
    public async Task CreateDoctor_WithValidCredentials_SavesStaffMember()
    {
        // Arrange
        var clinicId = Guid.NewGuid();
        var tenantId = "tenant_test";
        var clinicContext = Substitute.For<IClinicContext>();
        clinicContext.ClinicId.Returns(clinicId);
        clinicContext.TenantId.Returns(tenantId);

        var (context, uow, sieve) = TestDbHelper.CreateTestContext(clinicContext);
        var staffRepo = TestDbHelper.CreateRepository<StaffMember>(context, sieve);
        var roleRepo = TestDbHelper.CreateRepository<ClinicRole>(context, sieve);
        var settingsRepo = TestDbHelper.CreateRepository<ClinicSettings>(context, sieve);

        var doctorRole = new ClinicRole
        {
            Id = Guid.NewGuid(),
            TenantId = tenantId,
            ClinicId = clinicId,
            Name = "Attending Physician / Doctor",
            IsSystem = true
        };
        await context.ClinicRoles.AddAsync(doctorRole);

        var settings = new ClinicSettings
        {
            Id = Guid.NewGuid(),
            ClinicId = clinicId,
            TenantId = tenantId,
            LicenseToken = "mock.valid.token"
        };
        await context.ClinicSettings.AddAsync(settings);
        await context.SaveChangesAsync();

        var licenseValidator = Substitute.For<ClinicEz.Shared.Licensing.IFacilityLicenseValidator>();
        licenseValidator.Validate(Arg.Any<string?>(), clinicId, tenantId)
            .Returns(ClinicEz.Shared.Licensing.LicenseValidationResult.Success(new ClinicEz.Shared.Licensing.FacilityLicensePayload
            {
                FacilityId = clinicId,
                TenantId = tenantId,
                Limits = new ClinicEz.Shared.Licensing.FacilityLimits { MaxStaff = 10 }
            }));

        var handler = new CreateStaffMemberCommandHandler(staffRepo, roleRepo, settingsRepo, licenseValidator, uow, clinicContext);

        var command = new CreateStaffMemberCommand(
            "Maria",
            "Cruz",
            "Santos",
            "MD",
            StaffRole.Doctor,
            null,
            "dr.cruz@clinic.com",
            "09171234567",
            "PRC-0123456",
            "PTR-998877",
            "S2-554433",
            "Family Medicine"
        );

        // Act
        var result = await handler.Handle(command, CancellationToken.None);

        // Assert
        result.Should().NotBeNull();
        result.FirstName.Should().Be("Maria");
        result.LastName.Should().Be("Cruz");
        result.Role.Should().Be(StaffRole.Doctor);
        result.PrcLicenseNumber.Should().Be("PRC-0123456");
        result.S2LicenseNumber.Should().Be("S2-554433");

        var saved = await context.StaffMembers.FirstOrDefaultAsync(s => s.Id == result.Id);
        saved.Should().NotBeNull();
        saved!.PrcLicenseNumber.Should().Be("PRC-0123456");
        saved.ClinicRoleId.Should().Be(doctorRole.Id);
    }
}
