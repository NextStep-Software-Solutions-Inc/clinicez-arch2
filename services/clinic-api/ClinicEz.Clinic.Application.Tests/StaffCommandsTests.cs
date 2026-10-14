using System;
using System.Threading;
using System.Threading.Tasks;
using ClinicEz.Clinic.Application.Features.Staff.Commands;
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

        var refreshTokenRepo = TestDbHelper.CreateRepository<ClinicRefreshToken>(context, sieve);
        var token = new ClinicRefreshToken
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
        var settingsRepo = TestDbHelper.CreateRepository<ClinicSettings>(context, sieve);

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
        var settingsRepo = TestDbHelper.CreateRepository<ClinicSettings>(context, sieve);

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
        var roleRepo = TestDbHelper.CreateRepository<ClinicRole>(context, sieve);
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
        var roleRepo = TestDbHelper.CreateRepository<ClinicRole>(context, sieve);
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
    public async Task UpdateStaffMember_SelfClinicRoleIdChange_ThrowsValidationException()
    {
        var clinicId = Guid.NewGuid();
        var tenantId = "tenant_test";
        var selfStaffId = Guid.NewGuid();
        var currentClinicRoleId = Guid.NewGuid();
        var downgradedClinicRoleId = Guid.NewGuid();

        var clinicContext = Substitute.For<IClinicContext>();
        clinicContext.ClinicId.Returns(clinicId);
        clinicContext.TenantId.Returns(tenantId);
        clinicContext.StaffId.Returns(selfStaffId);

        var (context, uow, sieve) = TestDbHelper.CreateTestContext(clinicContext);
        var staffRepo = TestDbHelper.CreateRepository<StaffMember>(context, sieve);
        var roleRepo = TestDbHelper.CreateRepository<ClinicRole>(context, sieve);

        await context.ClinicRoles.AddRangeAsync(
            new ClinicRole { Id = currentClinicRoleId, TenantId = tenantId, ClinicId = clinicId, Name = "Clinic Administrator", IsSystem = true },
            new ClinicRole { Id = downgradedClinicRoleId, TenantId = tenantId, ClinicId = clinicId, Name = "Limited Custom Role", IsSystem = false }
        );

        var staff = new StaffMember
        {
            Id = selfStaffId,
            TenantId = tenantId,
            ClinicId = clinicId,
            FirstName = "Self",
            LastName = "Admin",
            Role = StaffRole.Admin,
            ClinicRoleId = currentClinicRoleId,
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
            downgradedClinicRoleId,
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
        var adminClinicRoleId = Guid.NewGuid();

        var clinicContext = Substitute.For<IClinicContext>();
        clinicContext.ClinicId.Returns(clinicId);
        clinicContext.TenantId.Returns(tenantId);
        clinicContext.StaffId.Returns(selfStaffId);

        var (context, uow, sieve) = TestDbHelper.CreateTestContext(clinicContext);
        var staffRepo = TestDbHelper.CreateRepository<StaffMember>(context, sieve);
        var roleRepo = TestDbHelper.CreateRepository<ClinicRole>(context, sieve);

        await context.ClinicRoles.AddAsync(new ClinicRole
        {
            Id = adminClinicRoleId,
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
            ClinicRoleId = adminClinicRoleId,
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
            adminClinicRoleId,
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
        result.ClinicRoleId.Should().Be(adminClinicRoleId);
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
        var roleRepo = TestDbHelper.CreateRepository<ClinicRole>(context, sieve);

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
        var roleRepo = TestDbHelper.CreateRepository<ClinicRole>(context, sieve);

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
}

