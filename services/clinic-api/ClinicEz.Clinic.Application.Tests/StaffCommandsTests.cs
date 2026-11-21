using System;
using System.Threading;
using System.Threading.Tasks;
using ClinicEz.Clinic.Application.Features.Staff.Commands;
using ClinicEz.Clinic.Domain.Constants;
using ClinicEz.Clinic.Domain.Entities;
using ClinicEz.Clinic.Domain.Enums;
using ClinicEz.Clinic.Domain.Interfaces;
using FluentAssertions;
using Microsoft.EntityFrameworkCore;
using Microsoft.Extensions.DependencyInjection;
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
        var roleRepo = TestDbHelper.CreateRepository<Role>(context, sieve);
        var settingsRepo = TestDbHelper.CreateRepository<FacilitySettings>(context, sieve);

        var doctorRole = new Role
        {
            Id = Guid.NewGuid(),
            TenantId = tenantId,
            ClinicId = clinicId,
            Name = "Attending Physician / Doctor",
            IsSystem = true
        };
        await context.Roles.AddAsync(doctorRole);

        var settings = new FacilitySettings
        {
            Id = Guid.NewGuid(),
            ClinicId = clinicId,
            TenantId = tenantId,
            ClinicName = "Test Clinic",
            LicenseToken = "mock.valid.token"
        };
        await context.Settings.AddAsync(settings);
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
        var roleRepo = TestDbHelper.CreateRepository<Role>(context, sieve);
        var settingsRepo = TestDbHelper.CreateRepository<FacilitySettings>(context, sieve);

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

        var settings = new FacilitySettings
        {
            Id = Guid.NewGuid(),
            ClinicId = clinicId,
            TenantId = tenantId,
            ClinicName = "Test Clinic",
            LicenseToken = "mock.token"
        };
        await context.Settings.AddAsync(settings);
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
        var roleRepo = TestDbHelper.CreateRepository<Role>(context, sieve);
        var settingsRepo = TestDbHelper.CreateRepository<FacilitySettings>(context, sieve);

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
        var roleRepo = TestDbHelper.CreateRepository<Role>(context, sieve);
        var settingsRepo = TestDbHelper.CreateRepository<FacilitySettings>(context, sieve);

        var cashierRole = new Role
        {
            Id = Guid.NewGuid(),
            TenantId = tenantId,
            ClinicId = clinicId,
            Name = "Clinic Cashier / Billing Officer",
            IsSystem = true
        };
        await context.Roles.AddAsync(cashierRole);

        var settings = new FacilitySettings
        {
            Id = Guid.NewGuid(),
            ClinicId = clinicId,
            TenantId = tenantId,
            ClinicName = "Test Clinic",
            LicenseToken = "mock.valid.token"
        };
        await context.Settings.AddAsync(settings);
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
        var roleRepo = TestDbHelper.CreateRepository<Role>(context, sieve);
        var settingsRepo = TestDbHelper.CreateRepository<FacilitySettings>(context, sieve);

        var settings = new FacilitySettings
        {
            Id = Guid.NewGuid(),
            ClinicId = clinicId,
            TenantId = tenantId,
            ClinicName = "Test Clinic",
            LicenseToken = "mock.valid.token"
        };
        await context.Settings.AddAsync(settings);
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

    [Fact]
    public async Task DeactivateStaffMember_DeactivatesUser_IncrementsTokenVersion_AndInvalidatesCache()
    {
        var clinicId = Guid.NewGuid();
        var tenantId = "tenant_test";
        var callerId = Guid.NewGuid();
        var clinicContext = Substitute.For<IClinicContext>();
        clinicContext.ClinicId.Returns(clinicId);
        clinicContext.TenantId.Returns(tenantId);
        clinicContext.StaffId.Returns(callerId);

        var (context, uow, sieve) = TestDbHelper.CreateTestContext(clinicContext);
        var staffRepo = TestDbHelper.CreateRepository<StaffMember>(context, sieve);

        var staff = new StaffMember
        {
            Id = Guid.NewGuid(),
            ClinicId = clinicId,
            TenantId = tenantId,
            FirstName = "Maria",
            LastName = "Santos",
            Email = "maria@clinic.com",
            Role = StaffRole.Nurse,
            TokenVersion = 1,
            IsActive = true
        };
        await context.StaffMembers.AddAsync(staff);
        await context.SaveChangesAsync();

        var refreshTokenRepo = TestDbHelper.CreateRepository<RefreshToken>(context, sieve);
        var token = new RefreshToken
        {
            Id = Guid.NewGuid(),
            StaffMemberId = staff.Id,
            ClinicId = clinicId,
            TenantId = tenantId,
            TokenHash = "test_hash",
            ExpiresAt = DateTime.UtcNow.AddDays(7)
        };
        await context.RefreshTokens.AddAsync(token);
        await context.SaveChangesAsync();

        var accessCache = Substitute.For<IStaffAccessInvalidator>();
        var handler = new DeactivateStaffMemberCommandHandler(staffRepo, uow, clinicContext, refreshTokenRepo, accessCache);

        // Act
        var result = await handler.Handle(new DeactivateStaffMemberCommand(staff.Id), CancellationToken.None);

        // Assert
        result.Should().BeTrue();
        var updated = await context.StaffMembers.FirstOrDefaultAsync(s => s.Id == staff.Id);
        updated.Should().NotBeNull();
        updated!.IsActive.Should().BeFalse();
        updated.TokenVersion.Should().Be(2);
        updated.UpdatedBy.Should().Be(callerId.ToString());
        accessCache.Received(1).Invalidate(staff.Id);

        var revokedToken = await context.RefreshTokens.FirstOrDefaultAsync(t => t.Id == token.Id);
        revokedToken.Should().NotBeNull();
        revokedToken!.RevokedAt.Should().NotBeNull();
    }

    [Fact]
    public async Task DeactivateStaffMember_SelfDeactivation_ThrowsValidationException()
    {
        var clinicId = Guid.NewGuid();
        var tenantId = "tenant_test";
        var staffId = Guid.NewGuid();
        var clinicContext = Substitute.For<IClinicContext>();
        clinicContext.ClinicId.Returns(clinicId);
        clinicContext.TenantId.Returns(tenantId);
        clinicContext.StaffId.Returns(staffId);

        var (context, uow, sieve) = TestDbHelper.CreateTestContext(clinicContext);
        var staffRepo = TestDbHelper.CreateRepository<StaffMember>(context, sieve);

        var staff = new StaffMember
        {
            Id = staffId,
            ClinicId = clinicId,
            TenantId = tenantId,
            FirstName = "Self",
            LastName = "Admin",
            Email = "admin@clinic.com",
            Role = StaffRole.Admin,
            TokenVersion = 1,
            IsActive = true
        };
        await context.StaffMembers.AddAsync(staff);
        await context.SaveChangesAsync();

        var handler = new DeactivateStaffMemberCommandHandler(staffRepo, uow, clinicContext);

        // Act & Assert
        var act = () => handler.Handle(new DeactivateStaffMemberCommand(staffId), CancellationToken.None);
        await act.Should().ThrowAsync<ClinicEz.Shared.Exceptions.ValidationException>()
            .WithMessage("*cannot deactivate your own account*");
    }

    [Fact]
    public async Task DeactivateStaffMember_SoleActiveAdmin_ThrowsValidationException()
    {
        var clinicId = Guid.NewGuid();
        var tenantId = "tenant_test";
        var callerId = Guid.NewGuid();
        var adminId = Guid.NewGuid();
        var clinicContext = Substitute.For<IClinicContext>();
        clinicContext.ClinicId.Returns(clinicId);
        clinicContext.TenantId.Returns(tenantId);
        clinicContext.StaffId.Returns(callerId);

        var (context, uow, sieve) = TestDbHelper.CreateTestContext(clinicContext);
        var staffRepo = TestDbHelper.CreateRepository<StaffMember>(context, sieve);

        var soleAdmin = new StaffMember
        {
            Id = adminId,
            ClinicId = clinicId,
            TenantId = tenantId,
            FirstName = "Sole",
            LastName = "Admin",
            Email = "sole@clinic.com",
            Role = StaffRole.Admin,
            TokenVersion = 1,
            IsActive = true
        };
        await context.StaffMembers.AddAsync(soleAdmin);
        await context.SaveChangesAsync();

        var handler = new DeactivateStaffMemberCommandHandler(staffRepo, uow, clinicContext);

        // Act & Assert
        var act = () => handler.Handle(new DeactivateStaffMemberCommand(adminId), CancellationToken.None);
        await act.Should().ThrowAsync<ClinicEz.Shared.Exceptions.ValidationException>()
            .WithMessage("*only active Administrator*");
    }

    [Fact]
    public async Task DeactivateStaffMember_NotFound_ThrowsNotFoundException()
    {
        var clinicId = Guid.NewGuid();
        var tenantId = "tenant_test";
        var clinicContext = Substitute.For<IClinicContext>();
        clinicContext.ClinicId.Returns(clinicId);
        clinicContext.TenantId.Returns(tenantId);

        var (context, uow, sieve) = TestDbHelper.CreateTestContext(clinicContext);
        var staffRepo = TestDbHelper.CreateRepository<StaffMember>(context, sieve);
        var handler = new DeactivateStaffMemberCommandHandler(staffRepo, uow, clinicContext);

        var act = () => handler.Handle(new DeactivateStaffMemberCommand(Guid.NewGuid()), CancellationToken.None);
        await act.Should().ThrowAsync<ClinicEz.Shared.Exceptions.NotFoundException>();
    }

    [Fact]
    public async Task ActivateStaffMember_ActivatesInactiveStaff_WithinLicenseLimit()
    {
        var clinicId = Guid.NewGuid();
        var tenantId = "tenant_test";
        var clinicContext = Substitute.For<IClinicContext>();
        clinicContext.ClinicId.Returns(clinicId);
        clinicContext.TenantId.Returns(tenantId);

        var (context, uow, sieve) = TestDbHelper.CreateTestContext(clinicContext);
        var staffRepo = TestDbHelper.CreateRepository<StaffMember>(context, sieve);
        var settingsRepo = TestDbHelper.CreateRepository<FacilitySettings>(context, sieve);

        var inactiveStaff = new StaffMember
        {
            Id = Guid.NewGuid(),
            ClinicId = clinicId,
            TenantId = tenantId,
            FirstName = "Rosa",
            LastName = "Diaz",
            Email = "rosa@clinic.com",
            Role = StaffRole.Doctor,
            PrcLicenseNumber = "PRC-998877",
            IsActive = false
        };
        await context.StaffMembers.AddAsync(inactiveStaff);

        var settings = new FacilitySettings
        {
            Id = Guid.NewGuid(),
            ClinicId = clinicId,
            TenantId = tenantId,
            ClinicName = "Test Clinic",
            LicenseToken = "mock.valid.token"
        };
        await context.Settings.AddAsync(settings);
        await context.SaveChangesAsync();

        var licenseValidator = Substitute.For<ClinicEz.Shared.Licensing.IFacilityLicenseValidator>();
        licenseValidator.Validate(Arg.Any<string?>(), clinicId, tenantId)
            .Returns(ClinicEz.Shared.Licensing.LicenseValidationResult.Success(new ClinicEz.Shared.Licensing.FacilityLicensePayload
            {
                FacilityId = clinicId,
                TenantId = tenantId,
                Limits = new ClinicEz.Shared.Licensing.FacilityLimits { MaxStaff = 5 }
            }));

        var handler = new ActivateStaffMemberCommandHandler(staffRepo, settingsRepo, licenseValidator, uow, clinicContext);

        // Act
        var result = await handler.Handle(new ActivateStaffMemberCommand(inactiveStaff.Id), CancellationToken.None);

        // Assert
        result.Should().NotBeNull();
        result.IsActive.Should().BeTrue();

        var updated = await context.StaffMembers.FirstOrDefaultAsync(s => s.Id == inactiveStaff.Id);
        updated.Should().NotBeNull();
        updated!.IsActive.Should().BeTrue();
    }

    [Fact]
    public async Task ActivateStaffMember_ExceedsLicenseLimit_ThrowsValidationException()
    {
        var clinicId = Guid.NewGuid();
        var tenantId = "tenant_test";
        var clinicContext = Substitute.For<IClinicContext>();
        clinicContext.ClinicId.Returns(clinicId);
        clinicContext.TenantId.Returns(tenantId);

        var (context, uow, sieve) = TestDbHelper.CreateTestContext(clinicContext);
        var staffRepo = TestDbHelper.CreateRepository<StaffMember>(context, sieve);
        var settingsRepo = TestDbHelper.CreateRepository<FacilitySettings>(context, sieve);

        // Add 2 active staff
        for (int i = 0; i < 2; i++)
        {
            await context.StaffMembers.AddAsync(new StaffMember
            {
                Id = Guid.NewGuid(),
                ClinicId = clinicId,
                TenantId = tenantId,
                FirstName = $"Active{i}",
                LastName = "Staff",
                Role = StaffRole.Nurse,
                IsActive = true
            });
        }

        var inactiveStaff = new StaffMember
        {
            Id = Guid.NewGuid(),
            ClinicId = clinicId,
            TenantId = tenantId,
            FirstName = "Rosa",
            LastName = "Diaz",
            Role = StaffRole.Nurse,
            IsActive = false
        };
        await context.StaffMembers.AddAsync(inactiveStaff);

        var settings = new FacilitySettings
        {
            Id = Guid.NewGuid(),
            ClinicId = clinicId,
            TenantId = tenantId,
            ClinicName = "Test Clinic",
            LicenseToken = "mock.valid.token"
        };
        await context.Settings.AddAsync(settings);
        await context.SaveChangesAsync();

        var licenseValidator = Substitute.For<ClinicEz.Shared.Licensing.IFacilityLicenseValidator>();
        licenseValidator.Validate(Arg.Any<string?>(), clinicId, tenantId)
            .Returns(ClinicEz.Shared.Licensing.LicenseValidationResult.Success(new ClinicEz.Shared.Licensing.FacilityLicensePayload
            {
                FacilityId = clinicId,
                TenantId = tenantId,
                Limits = new ClinicEz.Shared.Licensing.FacilityLimits { MaxStaff = 2 }
            }));

        var handler = new ActivateStaffMemberCommandHandler(staffRepo, settingsRepo, licenseValidator, uow, clinicContext);

        // Act & Assert
        var act = () => handler.Handle(new ActivateStaffMemberCommand(inactiveStaff.Id), CancellationToken.None);
        await act.Should().ThrowAsync<ClinicEz.Shared.Exceptions.ValidationException>()
            .WithMessage("*Staff limit reached*");
    }

    [Fact]
    public void StaffAccessCache_ResolvesCorrectly_WithMemoryCacheRegistered()
    {
        var services = new Microsoft.Extensions.DependencyInjection.ServiceCollection();
        services.AddMemoryCache();
        services.AddSingleton<ClinicEz.Clinic.Infrastructure.Auth.IStaffAccessCache, ClinicEz.Clinic.Infrastructure.Auth.StaffAccessCache>();
        services.AddSingleton<ClinicEz.Clinic.Domain.Interfaces.IStaffAccessInvalidator>(sp => sp.GetRequiredService<ClinicEz.Clinic.Infrastructure.Auth.IStaffAccessCache>());

        var provider = services.BuildServiceProvider(new Microsoft.Extensions.DependencyInjection.ServiceProviderOptions
        {
            ValidateOnBuild = true,
            ValidateScopes = true
        });

        var cache = provider.GetService<ClinicEz.Clinic.Infrastructure.Auth.IStaffAccessCache>();
        var invalidator = provider.GetService<ClinicEz.Clinic.Domain.Interfaces.IStaffAccessInvalidator>();

        cache.Should().NotBeNull();
        invalidator.Should().NotBeNull();
    }

    [Fact]
    public async Task UpdateStaffMember_UpdatesFieldsAndInvalidatesCache()
    {
        var clinicId = Guid.NewGuid();
        var tenantId = "tenant_test";
        var clinicContext = Substitute.For<IClinicContext>();
        clinicContext.ClinicId.Returns(clinicId);
        clinicContext.TenantId.Returns(tenantId);

        var (context, uow, sieve) = TestDbHelper.CreateTestContext(clinicContext);
        var staffRepo = TestDbHelper.CreateRepository<StaffMember>(context, sieve);
        var roleRepo = TestDbHelper.CreateRepository<Role>(context, sieve);
        var cache = Substitute.For<IStaffAccessInvalidator>();

        var staff = new StaffMember
        {
            Id = Guid.NewGuid(),
            TenantId = tenantId,
            ClinicId = clinicId,
            FirstName = "Alice",
            LastName = "Smith",
            Role = StaffRole.Nurse,
            IsActive = true
        };
        await context.StaffMembers.AddAsync(staff);
        await context.SaveChangesAsync();

        var handler = new UpdateStaffMemberCommandHandler(staffRepo, roleRepo, uow, clinicContext, cache);
        var result = await handler.Handle(new UpdateStaffMemberCommand(
            staff.Id,
            "Alicia",
            "Smith-Cruz",
            "M.",
            "RN",
            StaffRole.Nurse,
            null,
            "alicia@clinic.com",
            "09181234567",
            null,
            null,
            null,
            "Senior Triage Nurse",
            true
        ), CancellationToken.None);

        result.FirstName.Should().Be("Alicia");
        result.LastName.Should().Be("Smith-Cruz");
        result.Specialty.Should().Be("Senior Triage Nurse");
        cache.Received(1).Invalidate(staff.Id);
    }

    [Fact]
    public async Task UpdateMyProfile_UpdatesOwnDetails_PreservingRole()
    {
        var clinicId = Guid.NewGuid();
        var tenantId = "tenant_test";
        var staffId = Guid.NewGuid();
        var clinicContext = Substitute.For<IClinicContext>();
        clinicContext.ClinicId.Returns(clinicId);
        clinicContext.TenantId.Returns(tenantId);
        clinicContext.StaffId.Returns(staffId);

        var (context, uow, sieve) = TestDbHelper.CreateTestContext(clinicContext);
        var staffRepo = TestDbHelper.CreateRepository<StaffMember>(context, sieve);
        var cache = Substitute.For<IStaffAccessInvalidator>();

        var doctor = new StaffMember
        {
            Id = staffId,
            TenantId = tenantId,
            ClinicId = clinicId,
            FirstName = "Juan",
            LastName = "Dela Cruz",
            Role = StaffRole.Doctor,
            Title = "Dr.",
            PrcLicenseNumber = "PRC-001",
            PtrNumber = "PTR-2025",
            IsActive = true
        };
        await context.StaffMembers.AddAsync(doctor);
        await context.SaveChangesAsync();

        var handler = new UpdateMyProfileCommandHandler(staffRepo, uow, clinicContext, cache);
        var result = await handler.Handle(new UpdateMyProfileCommand(
            staffId,
            "Juan",
            "Dela Cruz",
            "Santos",
            "Dr.",
            "09170001111",
            "PRC-001",
            "PTR-2026-NEW", // Updated PTR for new year
            "S2-998877",
            "Cardiology"
        ), CancellationToken.None);

        result.PtrNumber.Should().Be("PTR-2026-NEW");
        result.Specialty.Should().Be("Cardiology");
        result.Role.Should().Be(StaffRole.Doctor);
        cache.Received(1).Invalidate(staffId);
    }

    [Theory]
    [InlineData(StaffRole.Admin, StaffRole.Doctor)]
    [InlineData(StaffRole.Admin, StaffRole.Nurse)]
    [InlineData(StaffRole.Admin, StaffRole.Receptionist)]
    [InlineData(StaffRole.Admin, StaffRole.Cashier)]
    [InlineData(StaffRole.Doctor, StaffRole.Nurse)]
    [InlineData(StaffRole.Nurse, StaffRole.Admin)]
    public async Task UpdateStaffMember_SelfRoleChangeOrDowngrade_ThrowsValidationException(StaffRole currentRole, StaffRole targetRole)
    {
        var clinicId = Guid.NewGuid();
        var tenantId = "tenant_test";
        var selfStaffId = Guid.NewGuid();
        var clinicContext = Substitute.For<IClinicContext>();
        clinicContext.ClinicId.Returns(clinicId);
        clinicContext.TenantId.Returns(tenantId);
        clinicContext.StaffId.Returns(selfStaffId);

        var (context, uow, sieve) = TestDbHelper.CreateTestContext(clinicContext);
        var staffRepo = TestDbHelper.CreateRepository<StaffMember>(context, sieve);
        var roleRepo = TestDbHelper.CreateRepository<Role>(context, sieve);
        var cache = Substitute.For<IStaffAccessInvalidator>();

        var staff = new StaffMember
        {
            Id = selfStaffId,
            TenantId = tenantId,
            ClinicId = clinicId,
            FirstName = "Self",
            LastName = "Staff",
            Role = currentRole,
            PrcLicenseNumber = "PRC-12345",
            IsActive = true
        };
        await context.StaffMembers.AddAsync(staff);
        await context.SaveChangesAsync();

        var handler = new UpdateStaffMemberCommandHandler(staffRepo, roleRepo, uow, clinicContext, cache);

        var act = () => handler.Handle(new UpdateStaffMemberCommand(
            selfStaffId,
            "Self",
            "Staff",
            null,
            null,
            targetRole,
            null,
            "self@clinic.com",
            "09170001111",
            "PRC-12345",
            null,
            null,
            null,
            true
        ), CancellationToken.None);

        await act.Should().ThrowAsync<ClinicEz.Shared.Exceptions.ValidationException>()
            .WithMessage("*cannot change or downgrade your own clinic role*");
        cache.DidNotReceiveWithAnyArgs().Invalidate(default);
    }

    [Fact]
    public async Task UpdateStaffMember_SelfRoleIdChange_ThrowsValidationException()
    {
        var clinicId = Guid.NewGuid();
        var tenantId = "tenant_test";
        var selfStaffId = Guid.NewGuid();
        var currentRoleId = Guid.NewGuid();
        var downgradedRoleId = Guid.NewGuid();

        var clinicContext = Substitute.For<IClinicContext>();
        clinicContext.ClinicId.Returns(clinicId);
        clinicContext.TenantId.Returns(tenantId);
        clinicContext.StaffId.Returns(selfStaffId);

        var (context, uow, sieve) = TestDbHelper.CreateTestContext(clinicContext);
        var staffRepo = TestDbHelper.CreateRepository<StaffMember>(context, sieve);
        var roleRepo = TestDbHelper.CreateRepository<Role>(context, sieve);

        await context.Roles.AddRangeAsync(
            new Role { Id = currentRoleId, TenantId = tenantId, ClinicId = clinicId, Name = "Clinic Administrator", IsSystem = true },
            new Role { Id = downgradedRoleId, TenantId = tenantId, ClinicId = clinicId, Name = "Limited Custom Role", IsSystem = false }
        );

        var staff = new StaffMember
        {
            Id = selfStaffId,
            TenantId = tenantId,
            ClinicId = clinicId,
            FirstName = "Self",
            LastName = "Admin",
            Role = StaffRole.Admin,
            ClinicRoleId = currentRoleId,
            IsActive = true
        };
        await context.StaffMembers.AddAsync(staff);
        await context.SaveChangesAsync();

        var handler = new UpdateStaffMemberCommandHandler(staffRepo, roleRepo, uow, clinicContext);

        var act = () => handler.Handle(new UpdateStaffMemberCommand(
            selfStaffId,
            "Self",
            "Admin",
            null,
            null,
            StaffRole.Admin,
            downgradedRoleId,
            "admin@clinic.com",
            "09170001111",
            null,
            null,
            null,
            null,
            true
        ), CancellationToken.None);

        await act.Should().ThrowAsync<ClinicEz.Shared.Exceptions.ValidationException>()
            .WithMessage("*cannot change or downgrade your own clinic role*");
    }

    [Fact]
    public async Task UpdateStaffMember_SelfProfileUpdateWithUnchangedRole_Succeeds()
    {
        var clinicId = Guid.NewGuid();
        var tenantId = "tenant_test";
        var selfStaffId = Guid.NewGuid();
        var adminRoleId = Guid.NewGuid();

        var clinicContext = Substitute.For<IClinicContext>();
        clinicContext.ClinicId.Returns(clinicId);
        clinicContext.TenantId.Returns(tenantId);
        clinicContext.StaffId.Returns(selfStaffId);

        var (context, uow, sieve) = TestDbHelper.CreateTestContext(clinicContext);
        var staffRepo = TestDbHelper.CreateRepository<StaffMember>(context, sieve);
        var roleRepo = TestDbHelper.CreateRepository<Role>(context, sieve);

        await context.Roles.AddAsync(new Role
        {
            Id = adminRoleId,
            TenantId = tenantId,
            ClinicId = clinicId,
            Name = "Clinic Administrator",
            IsSystem = true
        });

        var staff = new StaffMember
        {
            Id = selfStaffId,
            TenantId = tenantId,
            ClinicId = clinicId,
            FirstName = "Self",
            LastName = "Admin",
            Role = StaffRole.Admin,
            ClinicRoleId = adminRoleId,
            IsActive = true
        };
        await context.StaffMembers.AddAsync(staff);
        await context.SaveChangesAsync();

        var handler = new UpdateStaffMemberCommandHandler(staffRepo, roleRepo, uow, clinicContext);

        var result = await handler.Handle(new UpdateStaffMemberCommand(
            selfStaffId,
            "UpdatedFirst",
            "UpdatedLast",
            "M.",
            "Dr.",
            StaffRole.Admin,
            adminRoleId,
            "admin@clinic.com",
            "09179998888",
            "PRC-777",
            null,
            null,
            "Medical Director",
            true
        ), CancellationToken.None);

        result.FirstName.Should().Be("UpdatedFirst");
        result.LastName.Should().Be("UpdatedLast");
        result.Role.Should().Be(StaffRole.Admin);
        result.ClinicRoleId.Should().Be(adminRoleId);
    }

    [Fact]
    public async Task UpdateStaffMember_SelfDeactivation_ThrowsValidationException()
    {
        var clinicId = Guid.NewGuid();
        var tenantId = "tenant_test";
        var selfStaffId = Guid.NewGuid();

        var clinicContext = Substitute.For<IClinicContext>();
        clinicContext.ClinicId.Returns(clinicId);
        clinicContext.TenantId.Returns(tenantId);
        clinicContext.StaffId.Returns(selfStaffId);

        var (context, uow, sieve) = TestDbHelper.CreateTestContext(clinicContext);
        var staffRepo = TestDbHelper.CreateRepository<StaffMember>(context, sieve);
        var roleRepo = TestDbHelper.CreateRepository<Role>(context, sieve);

        await context.StaffMembers.AddAsync(new StaffMember
        {
            Id = selfStaffId,
            TenantId = tenantId,
            ClinicId = clinicId,
            FirstName = "Self",
            LastName = "Admin",
            Role = StaffRole.Admin,
            IsActive = true
        });
        await context.SaveChangesAsync();

        var handler = new UpdateStaffMemberCommandHandler(staffRepo, roleRepo, uow, clinicContext);

        var act = () => handler.Handle(new UpdateStaffMemberCommand(
            selfStaffId,
            "Self",
            "Admin",
            null,
            null,
            StaffRole.Admin,
            null,
            "admin@clinic.com",
            null,
            null,
            null,
            null,
            null,
            IsActive: false
        ), CancellationToken.None);

        await act.Should().ThrowAsync<ClinicEz.Shared.Exceptions.ValidationException>()
            .WithMessage("*cannot deactivate your own account*");
    }

    [Fact]
    public async Task UpdateStaffMember_DowngradeSoleActiveAdmin_ThrowsValidationException()
    {
        var clinicId = Guid.NewGuid();
        var tenantId = "tenant_test";
        var callerStaffId = Guid.NewGuid();
        var soleAdminId = Guid.NewGuid();

        var clinicContext = Substitute.For<IClinicContext>();
        clinicContext.ClinicId.Returns(clinicId);
        clinicContext.TenantId.Returns(tenantId);
        clinicContext.StaffId.Returns(callerStaffId);

        var (context, uow, sieve) = TestDbHelper.CreateTestContext(clinicContext);
        var staffRepo = TestDbHelper.CreateRepository<StaffMember>(context, sieve);
        var roleRepo = TestDbHelper.CreateRepository<Role>(context, sieve);

        await context.StaffMembers.AddAsync(new StaffMember
        {
            Id = soleAdminId,
            TenantId = tenantId,
            ClinicId = clinicId,
            FirstName = "Sole",
            LastName = "Admin",
            Role = StaffRole.Admin,
            IsActive = true
        });
        await context.SaveChangesAsync();

        var handler = new UpdateStaffMemberCommandHandler(staffRepo, roleRepo, uow, clinicContext);

        var act = () => handler.Handle(new UpdateStaffMemberCommand(
            soleAdminId,
            "Sole",
            "Admin",
            null,
            null,
            StaffRole.Receptionist,
            null,
            "sole@clinic.com",
            null,
            null,
            null,
            null,
            null,
            IsActive: true
        ), CancellationToken.None);

        await act.Should().ThrowAsync<ClinicEz.Shared.Exceptions.ValidationException>()
            .WithMessage("*only active Administrator*");
    }

    [Fact]
    public async Task UpdateMyProfile_WhenRequestedRoleDiffersFromCurrentRole_ThrowsValidationException()
    {
        var clinicId = Guid.NewGuid();
        var tenantId = "tenant_test";
        var staffId = Guid.NewGuid();

        var clinicContext = Substitute.For<IClinicContext>();
        clinicContext.ClinicId.Returns(clinicId);
        clinicContext.TenantId.Returns(tenantId);
        clinicContext.StaffId.Returns(staffId);

        var (context, uow, sieve) = TestDbHelper.CreateTestContext(clinicContext);
        var staffRepo = TestDbHelper.CreateRepository<StaffMember>(context, sieve);

        await context.StaffMembers.AddAsync(new StaffMember
        {
            Id = staffId,
            TenantId = tenantId,
            ClinicId = clinicId,
            FirstName = "Maria",
            LastName = "Santos",
            Role = StaffRole.Doctor,
            PrcLicenseNumber = "PRC-001",
            IsActive = true
        });
        await context.SaveChangesAsync();

        var handler = new UpdateMyProfileCommandHandler(staffRepo, uow, clinicContext);

        var act = () => handler.Handle(new UpdateMyProfileCommand(
            staffId,
            "Maria",
            "Santos",
            null,
            "Dr.",
            null,
            "PRC-001",
            null,
            null,
            null,
            RequestedRole: StaffRole.Nurse
        ), CancellationToken.None);

        await act.Should().ThrowAsync<ClinicEz.Shared.Exceptions.ValidationException>()
            .WithMessage("*cannot change or downgrade your own clinic role*");
    }

    [Fact]
    public async Task UpdateStaffMember_SettingPrimaryRoom_PreservesExactOrderAndPrimaryFirst()
    {
        var clinicId = Guid.NewGuid();
        var tenantId = "tenant_test";
        var clinicContext = Substitute.For<IClinicContext>();
        clinicContext.ClinicId.Returns(clinicId);
        clinicContext.TenantId.Returns(tenantId);

        var (context, uow, sieve) = TestDbHelper.CreateTestContext(clinicContext);
        var staffRepo = TestDbHelper.CreateRepository<StaffMember>(context, sieve);
        var roleRepo = TestDbHelper.CreateRepository<Role>(context, sieve);
        var roomRepo = TestDbHelper.CreateRepository<Room>(context, sieve);

        // Room 1 created before Room 2 (PostgreSQL / EF default query order is Room 1, Room 2)
        var room1 = new Room { Id = Guid.NewGuid(), TenantId = tenantId, ClinicId = clinicId, Name = "Room Alpha", Type = ClinicRoomType.Consultation, DisplayOrder = 1, IsActive = true };
        var room2 = new Room { Id = Guid.NewGuid(), TenantId = tenantId, ClinicId = clinicId, Name = "Room Beta", Type = ClinicRoomType.Consultation, DisplayOrder = 2, IsActive = true };
        await context.Rooms.AddRangeAsync(room1, room2);

        var doctor = new StaffMember
        {
            Id = Guid.NewGuid(),
            TenantId = tenantId,
            ClinicId = clinicId,
            FirstName = "Gregory",
            LastName = "House",
            Role = StaffRole.Doctor,
            PrcLicenseNumber = "PRC-9999",
            IsActive = true
        };
        doctor.SetAssignedRoomIds(new[] { room1.Id, room2.Id });
        await context.StaffMembers.AddAsync(doctor);
        await context.SaveChangesAsync();

        var handler = new UpdateStaffMemberCommandHandler(staffRepo, roleRepo, uow, clinicContext, null, roomRepo);

        // Setting Room Beta as Primary: [room2.Id, room1.Id]
        var result = await handler.Handle(new UpdateStaffMemberCommand(
            doctor.Id,
            doctor.FirstName,
            doctor.LastName,
            null,
            "Dr.",
            StaffRole.Doctor,
            null,
            "house@clinic.com",
            null,
            doctor.PrcLicenseNumber,
            null,
            null,
            "Diagnostics",
            true,
            AssignedRoomIds: new[] { room2.Id, room1.Id }
        ), CancellationToken.None);

        // Order must strictly preserve Room Beta at index 0 (Primary)
        result.AssignedRoomIds.Should().NotBeNull();
        result.AssignedRoomIds!.Should().Equal(new[] { room2.Id, room1.Id });
        result.AssignedRoomNames.Should().NotBeNull();
        result.AssignedRoomNames!.Should().Equal(new[] { "Room Beta", "Room Alpha" });

        // Database entity must also store Room Beta at index 0 in JSON
        var refreshedDoctor = await context.StaffMembers.FirstAsync(s => s.Id == doctor.Id);
        refreshedDoctor.GetAssignedRoomIds().Should().Equal(new[] { room2.Id, room1.Id });
    }

    [Fact]
    public async Task CreateStaffMember_SettingPrimaryRoom_PreservesExactOrderAndPrimaryFirst()
    {
        var clinicId = Guid.NewGuid();
        var tenantId = "tenant_test";
        var clinicContext = Substitute.For<IClinicContext>();
        clinicContext.ClinicId.Returns(clinicId);
        clinicContext.TenantId.Returns(tenantId);

        var (context, uow, sieve) = TestDbHelper.CreateTestContext(clinicContext);
        var staffRepo = TestDbHelper.CreateRepository<StaffMember>(context, sieve);
        var roleRepo = TestDbHelper.CreateRepository<Role>(context, sieve);
        var settingsRepo = TestDbHelper.CreateRepository<FacilitySettings>(context, sieve);
        var roomRepo = TestDbHelper.CreateRepository<Room>(context, sieve);

        var room1 = new Room { Id = Guid.NewGuid(), TenantId = tenantId, ClinicId = clinicId, Name = "Room Alpha", Type = ClinicRoomType.Consultation, DisplayOrder = 1, IsActive = true };
        var room2 = new Room { Id = Guid.NewGuid(), TenantId = tenantId, ClinicId = clinicId, Name = "Room Beta", Type = ClinicRoomType.Consultation, DisplayOrder = 2, IsActive = true };
        await context.Rooms.AddRangeAsync(room1, room2);

        var licenseValidator = Substitute.For<ClinicEz.Shared.Licensing.IFacilityLicenseValidator>();
        licenseValidator.Validate(Arg.Any<string?>(), clinicId, tenantId)
            .Returns(ClinicEz.Shared.Licensing.LicenseValidationResult.Success(new ClinicEz.Shared.Licensing.FacilityLicensePayload
            {
                FacilityId = clinicId,
                TenantId = tenantId,
                Limits = new ClinicEz.Shared.Licensing.FacilityLimits { MaxStaff = 10 }
            }));

        await context.Settings.AddAsync(new FacilitySettings
        {
            Id = Guid.NewGuid(),
            TenantId = tenantId,
            ClinicId = clinicId,
            ClinicName = "Test Clinic",
            LicenseToken = "dummy"
        });
        await context.SaveChangesAsync();

        var handler = new CreateStaffMemberCommandHandler(staffRepo, roleRepo, settingsRepo, licenseValidator, uow, clinicContext, null, roomRepo);

        // Assign rooms with Room Beta as Primary: [room2.Id, room1.Id]
        var result = await handler.Handle(new CreateStaffMemberCommand(
            "James",
            "Wilson",
            null,
            "Dr.",
            StaffRole.Doctor,
            null,
            "wilson@clinic.com",
            null,
            "PRC-8888",
            null,
            null,
            "Oncology",
            AssignedRoomIds: new[] { room2.Id, room1.Id }
        ), CancellationToken.None);

        result.AssignedRoomIds.Should().NotBeNull();
        result.AssignedRoomIds!.Should().Equal(new[] { room2.Id, room1.Id });
        result.AssignedRoomNames.Should().NotBeNull();
        result.AssignedRoomNames!.Should().Equal(new[] { "Room Beta", "Room Alpha" });

        var createdInDb = await context.StaffMembers.FirstAsync(s => s.Id == result.Id);
        createdInDb.GetAssignedRoomIds().Should().Equal(new[] { room2.Id, room1.Id });
    }

    [Fact]
    public async Task UpdateStaffMember_WhenOnlyActiveSystemAdminReassignedToCustomRole_ThrowsValidationException()
    {
        var clinicId = Guid.NewGuid();
        var tenantId = "tenant_test";
        var adminStaffId = Guid.NewGuid();
        var callerStaffId = Guid.NewGuid();
        var customRoleId = Guid.NewGuid();
        var systemAdminRoleId = Guid.NewGuid();

        var clinicContext = Substitute.For<IClinicContext>();
        clinicContext.ClinicId.Returns(clinicId);
        clinicContext.TenantId.Returns(tenantId);
        clinicContext.StaffId.Returns(callerStaffId);

        var (context, uow, sieve) = TestDbHelper.CreateTestContext(clinicContext);
        var staffRepo = TestDbHelper.CreateRepository<StaffMember>(context, sieve);
        var roleRepo = TestDbHelper.CreateRepository<Role>(context, sieve);

        var systemAdminRole = new Role
        {
            Id = systemAdminRoleId,
            TenantId = tenantId,
            ClinicId = clinicId,
            Name = "Clinic Administrator",
            IsSystem = true,
            Permissions = new List<string>(ClinicPermissions.All)
        };
        var customRole = new Role
        {
            Id = customRoleId,
            TenantId = tenantId,
            ClinicId = clinicId,
            Name = "Front Desk Lead",
            IsSystem = false,
            Permissions = new List<string> { ClinicPermissions.AppointmentsRead }
        };
        await context.Roles.AddRangeAsync(systemAdminRole, customRole);

        // The only active system admin
        var adminStaff = new StaffMember
        {
            Id = adminStaffId,
            TenantId = tenantId,
            ClinicId = clinicId,
            FirstName = "Sole",
            LastName = "Admin",
            Role = StaffRole.Admin,
            ClinicRoleId = systemAdminRoleId,
            IsActive = true
        };
        var callerStaff = new StaffMember
        {
            Id = callerStaffId,
            TenantId = tenantId,
            ClinicId = clinicId,
            FirstName = "Other",
            LastName = "User",
            Role = StaffRole.Doctor,
            IsActive = true
        };
        await context.StaffMembers.AddRangeAsync(adminStaff, callerStaff);
        await context.SaveChangesAsync();

        var handler = new UpdateStaffMemberCommandHandler(staffRepo, roleRepo, uow, clinicContext);
        var command = new UpdateStaffMemberCommand(
            adminStaffId,
            "Sole",
            "Admin",
            null,
            null,
            StaffRole.Admin,
            customRoleId, // Attempt to reassign to custom role
            "admin@clinic.com",
            null,
            null,
            null,
            null,
            null,
            true);

        var act = () => handler.Handle(command, CancellationToken.None);
        await act.Should().ThrowAsync<ClinicEz.Shared.Exceptions.ValidationException>()
            .WithMessage("*Cannot reassign or deactivate the only active staff member assigned to the built-in Clinic Administrator role*");
    }

    [Fact]
    public async Task DeactivateStaffMember_WhenOnlyActiveSystemAdmin_ThrowsValidationException()
    {
        var clinicId = Guid.NewGuid();
        var tenantId = "tenant_test";
        var adminStaffId = Guid.NewGuid();
        var callerStaffId = Guid.NewGuid();
        var systemAdminRoleId = Guid.NewGuid();

        var clinicContext = Substitute.For<IClinicContext>();
        clinicContext.ClinicId.Returns(clinicId);
        clinicContext.TenantId.Returns(tenantId);
        clinicContext.StaffId.Returns(callerStaffId);

        var (context, uow, sieve) = TestDbHelper.CreateTestContext(clinicContext);
        var staffRepo = TestDbHelper.CreateRepository<StaffMember>(context, sieve);

        var systemAdminRole = new Role
        {
            Id = systemAdminRoleId,
            TenantId = tenantId,
            ClinicId = clinicId,
            Name = "Clinic Administrator",
            IsSystem = true,
            Permissions = new List<string>(ClinicPermissions.All)
        };
        await context.Roles.AddAsync(systemAdminRole);

        var adminStaff = new StaffMember
        {
            Id = adminStaffId,
            TenantId = tenantId,
            ClinicId = clinicId,
            FirstName = "Sole",
            LastName = "Admin",
            Role = StaffRole.Admin,
            ClinicRoleId = systemAdminRoleId,
            IsActive = true
        };
        var callerStaff = new StaffMember
        {
            Id = callerStaffId,
            TenantId = tenantId,
            ClinicId = clinicId,
            FirstName = "Caller",
            LastName = "User",
            Role = StaffRole.Doctor,
            IsActive = true
        };
        await context.StaffMembers.AddRangeAsync(adminStaff, callerStaff);
        await context.SaveChangesAsync();

        var handler = new DeactivateStaffMemberCommandHandler(staffRepo, uow, clinicContext);
        var command = new DeactivateStaffMemberCommand(adminStaffId);

        var act = () => handler.Handle(command, CancellationToken.None);
        await act.Should().ThrowAsync<ClinicEz.Shared.Exceptions.ValidationException>()
            .WithMessage("*Cannot*the only active Administrator in this clinic*");
    }

    [Fact]
    public async Task UpdateStaffMember_WhenAnotherActiveSystemAdminExists_AllowsReassignment()
    {
        var clinicId = Guid.NewGuid();
        var tenantId = "tenant_test";
        var admin1StaffId = Guid.NewGuid();
        var admin2StaffId = Guid.NewGuid();
        var customRoleId = Guid.NewGuid();
        var systemAdminRoleId = Guid.NewGuid();

        var clinicContext = Substitute.For<IClinicContext>();
        clinicContext.ClinicId.Returns(clinicId);
        clinicContext.TenantId.Returns(tenantId);
        clinicContext.StaffId.Returns(admin2StaffId);

        var (context, uow, sieve) = TestDbHelper.CreateTestContext(clinicContext);
        var staffRepo = TestDbHelper.CreateRepository<StaffMember>(context, sieve);
        var roleRepo = TestDbHelper.CreateRepository<Role>(context, sieve);

        var systemAdminRole = new Role
        {
            Id = systemAdminRoleId,
            TenantId = tenantId,
            ClinicId = clinicId,
            Name = "Clinic Administrator",
            IsSystem = true,
            Permissions = new List<string>(ClinicPermissions.All)
        };
        var customRole = new Role
        {
            Id = customRoleId,
            TenantId = tenantId,
            ClinicId = clinicId,
            Name = "Secondary Lead",
            IsSystem = false,
            Permissions = new List<string> { ClinicPermissions.AppointmentsRead }
        };
        await context.Roles.AddRangeAsync(systemAdminRole, customRole);

        // Two active system admins
        var admin1 = new StaffMember
        {
            Id = admin1StaffId,
            TenantId = tenantId,
            ClinicId = clinicId,
            FirstName = "Admin",
            LastName = "One",
            Role = StaffRole.Admin,
            ClinicRoleId = systemAdminRoleId,
            IsActive = true
        };
        var admin2 = new StaffMember
        {
            Id = admin2StaffId,
            TenantId = tenantId,
            ClinicId = clinicId,
            FirstName = "Admin",
            LastName = "Two",
            Role = StaffRole.Admin,
            ClinicRoleId = systemAdminRoleId,
            IsActive = true
        };
        await context.StaffMembers.AddRangeAsync(admin1, admin2);
        await context.SaveChangesAsync();

        var handler = new UpdateStaffMemberCommandHandler(staffRepo, roleRepo, uow, clinicContext);
        var command = new UpdateStaffMemberCommand(
            admin1StaffId,
            "Admin",
            "One",
            null,
            null,
            StaffRole.Admin,
            customRoleId,
            "admin1@clinic.com",
            null,
            null,
            null,
            null,
            null,
            true);

        var result = await handler.Handle(command, CancellationToken.None);
        result.Should().NotBeNull();
        result.ClinicRoleId.Should().Be(customRoleId);
    }
}

