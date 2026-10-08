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
            ClinicName = "Test Clinic",
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

    [Fact]
    public async Task CreateStaff_WhenLimitExceeded_ThrowsValidationException()
    {
        var clinicId = Guid.NewGuid();
        var tenantId = "tenant_test";
        var clinicContext = Substitute.For<IClinicContext>();
        clinicContext.ClinicId.Returns(clinicId);
        clinicContext.TenantId.Returns(tenantId);

        var (context, uow, sieve) = TestDbHelper.CreateTestContext(clinicContext);
        var staffRepo = TestDbHelper.CreateRepository<StaffMember>(context, sieve);
        var roleRepo = TestDbHelper.CreateRepository<ClinicRole>(context, sieve);
        var settingsRepo = TestDbHelper.CreateRepository<ClinicSettings>(context, sieve);

        // Seed 1 active staff member
        await context.StaffMembers.AddAsync(new StaffMember
        {
            Id = Guid.NewGuid(),
            TenantId = tenantId,
            ClinicId = clinicId,
            FirstName = "Existing",
            LastName = "Staff",
            Role = StaffRole.Nurse,
            IsActive = true
        });

        var settings = new ClinicSettings
        {
            Id = Guid.NewGuid(),
            ClinicId = clinicId,
            TenantId = tenantId,
            ClinicName = "Test Clinic",
            LicenseToken = "mock.token"
        };
        await context.ClinicSettings.AddAsync(settings);
        await context.SaveChangesAsync();

        // License allows max 1 staff
        var licenseValidator = Substitute.For<ClinicEz.Shared.Licensing.IFacilityLicenseValidator>();
        licenseValidator.Validate(Arg.Any<string?>(), clinicId, tenantId)
            .Returns(ClinicEz.Shared.Licensing.LicenseValidationResult.Success(new ClinicEz.Shared.Licensing.FacilityLicensePayload
            {
                FacilityId = clinicId,
                TenantId = tenantId,
                Limits = new ClinicEz.Shared.Licensing.FacilityLimits { MaxStaff = 1 }
            }));

        var handler = new CreateStaffMemberCommandHandler(staffRepo, roleRepo, settingsRepo, licenseValidator, uow, clinicContext);

        var command = new CreateStaffMemberCommand(
            "Second", "Nurse", null, null, StaffRole.Nurse, null, "nurse2@clinic.com", "09181234567", null, null, null, null);

        var act = async () => await handler.Handle(command, CancellationToken.None);

        await act.Should().ThrowAsync<ClinicEz.Shared.Exceptions.ValidationException>()
            .WithMessage("*Staff limit reached*");
    }

    [Fact]
    public async Task CreateStaff_WhenLicenseTampered_ThrowsValidationException()
    {
        var clinicId = Guid.NewGuid();
        var tenantId = "tenant_test";
        var clinicContext = Substitute.For<IClinicContext>();
        clinicContext.ClinicId.Returns(clinicId);
        clinicContext.TenantId.Returns(tenantId);

        var (context, uow, sieve) = TestDbHelper.CreateTestContext(clinicContext);
        var staffRepo = TestDbHelper.CreateRepository<StaffMember>(context, sieve);
        var roleRepo = TestDbHelper.CreateRepository<ClinicRole>(context, sieve);
        var settingsRepo = TestDbHelper.CreateRepository<ClinicSettings>(context, sieve);

        var licenseValidator = Substitute.For<ClinicEz.Shared.Licensing.IFacilityLicenseValidator>();
        licenseValidator.Validate(Arg.Any<string?>(), clinicId, tenantId)
            .Returns(ClinicEz.Shared.Licensing.LicenseValidationResult.Tampered("Signature mismatch"));

        var handler = new CreateStaffMemberCommandHandler(staffRepo, roleRepo, settingsRepo, licenseValidator, uow, clinicContext);

        var command = new CreateStaffMemberCommand(
            "Fake", "Doctor", null, "MD", StaffRole.Doctor, null, "dr.fake@clinic.com", "09181234567", "PRC-9999", null, null, null);

        var act = async () => await handler.Handle(command, CancellationToken.None);

        await act.Should().ThrowAsync<ClinicEz.Shared.Exceptions.ValidationException>()
            .WithMessage("*Tampered facility license detected*");
    }

    [Fact]
    public async Task CreateCashier_AutoAssigns_ClinicCashierBillingOfficerRole()
    {
        var clinicId = Guid.NewGuid();
        var tenantId = "tenant_test";
        var clinicContext = Substitute.For<IClinicContext>();
        clinicContext.ClinicId.Returns(clinicId);
        clinicContext.TenantId.Returns(tenantId);

        var (context, uow, sieve) = TestDbHelper.CreateTestContext(clinicContext);
        var staffRepo = TestDbHelper.CreateRepository<StaffMember>(context, sieve);
        var roleRepo = TestDbHelper.CreateRepository<ClinicRole>(context, sieve);
        var settingsRepo = TestDbHelper.CreateRepository<ClinicSettings>(context, sieve);

        var cashierRole = new ClinicRole
        {
            Id = Guid.NewGuid(),
            TenantId = tenantId,
            ClinicId = clinicId,
            Name = "Clinic Cashier / Billing Officer",
            IsSystem = true
        };
        await context.ClinicRoles.AddAsync(cashierRole);

        var settings = new ClinicSettings
        {
            Id = Guid.NewGuid(),
            ClinicId = clinicId,
            TenantId = tenantId,
            ClinicName = "Test Clinic",
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
            "Clara",
            null,
            null,
            StaffRole.Cashier,
            null,
            "cashier@clinic.com",
            "09170001122",
            null,
            null,
            null,
            null
        );

        // Act
        var result = await handler.Handle(command, CancellationToken.None);

        // Assert
        result.Should().NotBeNull();
        result.Role.Should().Be(StaffRole.Cashier);
        result.RoleName.Should().Be("Clinic Cashier / Billing Officer");
        result.ClinicRoleId.Should().Be(cashierRole.Id);
    }

    [Theory]
    [InlineData("Doctor", StaffRole.Doctor)]
    [InlineData("Nurse", StaffRole.Nurse)]
    [InlineData("Receptionist", StaffRole.Receptionist)]
    [InlineData("Admin", StaffRole.Admin)]
    [InlineData("Cashier", StaffRole.Cashier)]
    public void StaffRole_DeserializesFromJsonString(string roleString, StaffRole expectedRole)
    {
        var json = $$"""
        {
            "firstName": "Juan",
            "lastName": "Dela Cruz",
            "role": "{{roleString}}"
        }
        """;

        var command = System.Text.Json.JsonSerializer.Deserialize<CreateStaffMemberCommand>(
            json,
            new System.Text.Json.JsonSerializerOptions { PropertyNameCaseInsensitive = true });

        command.Should().NotBeNull();
        command!.Role.Should().Be(expectedRole);
    }

    [Fact]
    public async Task CreateStaff_WithInitialPassword_HashesPasswordAndEnforcesChangeOnFirstLogin()
    {
        var clinicId = Guid.NewGuid();
        var tenantId = "tenant_test";
        var clinicContext = Substitute.For<IClinicContext>();
        clinicContext.ClinicId.Returns(clinicId);
        clinicContext.TenantId.Returns(tenantId);

        var (context, uow, sieve) = TestDbHelper.CreateTestContext(clinicContext);
        var staffRepo = TestDbHelper.CreateRepository<StaffMember>(context, sieve);
        var roleRepo = TestDbHelper.CreateRepository<ClinicRole>(context, sieve);
        var settingsRepo = TestDbHelper.CreateRepository<ClinicSettings>(context, sieve);

        var settings = new ClinicSettings
        {
            Id = Guid.NewGuid(),
            ClinicId = clinicId,
            TenantId = tenantId,
            ClinicName = "Test Clinic",
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

        var hasher = new ClinicEz.Shared.LocalAuth.FacilityPasswordHasher();
        var handler = new CreateStaffMemberCommandHandler(staffRepo, roleRepo, settingsRepo, licenseValidator, uow, clinicContext, hasher);

        var command = new CreateStaffMemberCommand(
            "Elena",
            "Reyes",
            null,
            null,
            StaffRole.Receptionist,
            null,
            "elena@clinic.com",
            "09171239876",
            null,
            null,
            null,
            null,
            InitialPassword: "TemporaryPass#123",
            SendInviteEmail: false
        );

        // Act
        var result = await handler.Handle(command, CancellationToken.None);

        // Assert
        result.Should().NotBeNull();
        result.HasCredentials.Should().BeTrue();
        result.MustChangePassword.Should().BeTrue();
        result.TemporaryPassword.Should().Be("TemporaryPass#123");

        var saved = await context.StaffMembers.FirstOrDefaultAsync(s => s.Id == result.Id);
        saved.Should().NotBeNull();
        saved!.PasswordHash.Should().NotBeNullOrWhiteSpace();
        saved.MustChangePassword.Should().BeTrue();
        hasher.Verify(saved.PasswordHash!, "TemporaryPass#123").Should().BeTrue();
    }

    [Fact]
    public async Task ResetStaffPassword_GeneratesTemporaryPasswordAndIncrementsTokenVersion()
    {
        var clinicId = Guid.NewGuid();
        var tenantId = "tenant_test";
        var clinicContext = Substitute.For<IClinicContext>();
        clinicContext.ClinicId.Returns(clinicId);
        clinicContext.TenantId.Returns(tenantId);

        var (context, uow, sieve) = TestDbHelper.CreateTestContext(clinicContext);
        var staffRepo = TestDbHelper.CreateRepository<StaffMember>(context, sieve);

        var staff = new StaffMember
        {
            Id = Guid.NewGuid(),
            ClinicId = clinicId,
            TenantId = tenantId,
            FirstName = "Carlos",
            LastName = "Mendoza",
            Email = "carlos@clinic.com",
            Role = StaffRole.Nurse,
            TokenVersion = 1,
            IsActive = true
        };
        await context.StaffMembers.AddAsync(staff);
        await context.SaveChangesAsync();

        var hasher = new ClinicEz.Shared.LocalAuth.FacilityPasswordHasher();
        var handler = new ResetStaffPasswordCommandHandler(staffRepo, uow, clinicContext, hasher);

        // Act
        var result = await handler.Handle(new ResetStaffPasswordCommand(staff.Id), CancellationToken.None);

        // Assert
        result.Should().NotBeNull();
        result.Email.Should().Be("carlos@clinic.com");
        result.TemporaryPassword.Should().NotBeNullOrWhiteSpace();
        result.TemporaryPassword.Length.Should().BeGreaterThanOrEqualTo(8);

        var updated = await context.StaffMembers.FirstOrDefaultAsync(s => s.Id == staff.Id);
        updated.Should().NotBeNull();
        updated!.MustChangePassword.Should().BeTrue();
        updated.TokenVersion.Should().Be(2);
        hasher.Verify(updated.PasswordHash!, result.TemporaryPassword).Should().BeTrue();
    }
}
