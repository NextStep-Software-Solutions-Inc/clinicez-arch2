using System;
using System.Threading;
using System.Threading.Tasks;
using ClinicEz.Clinic.Application.Common.Helpers;
using ClinicEz.Clinic.Application.Common.Interfaces;
using ClinicEz.Clinic.Application.Features.Staff.Commands;
using ClinicEz.Clinic.Domain.Entities;
using ClinicEz.Clinic.Domain.Enums;
using ClinicEz.Clinic.Domain.Interfaces;
using ClinicEz.Shared.Licensing;
using ClinicEz.Shared.LocalAuth;
using FluentAssertions;
using Microsoft.EntityFrameworkCore;
using NSubstitute;
using Xunit;
using ValidationException = ClinicEz.Shared.Exceptions.ValidationException;

namespace ClinicEz.Clinic.Application.Tests.Staff;

public class StaffDuplicateEmailValidationTests
{
    private const string ExpectedDuplicateMessage =
        "This email address is already associated with an existing staff member in this clinic.";

    private static string CreateLicenseToken(Guid clinicId, string tenantId, int maxStaff = 10) =>
        new FacilityLicenseSigner().SignLicense(new FacilityLicensePayload
        {
            FacilityId = clinicId,
            TenantId = tenantId,
            TenantSlug = "test-clinic",
            FacilityName = "Test Clinic",
            FacilityType = "Clinic",
            PlanTier = "Community",
            Limits = new FacilityLimits { MaxStaff = maxStaff },
            EnabledFeatures = PlanTierDefaults.GetFeaturesForTier("Community"),
            IssuedAtUtc = DateTime.UtcNow,
            ExpiresAtUtc = DateTime.UtcNow.AddYears(1)
        });

    [Fact]
    public async Task CreateStaff_EmailInvite_ExistingActiveStaffEmail_RejectsWithoutCreatingDuplicateOrSendingEmail()
    {
        var clinicId = Guid.NewGuid();
        var tenantId = "tenant_issue113";
        var clinicContext = Substitute.For<IClinicContext>();
        clinicContext.ClinicId.Returns(clinicId);
        clinicContext.TenantId.Returns(tenantId);

        var (context, uow, sieve) = TestDbHelper.CreateTestContext(clinicContext);
        var staffRepo = TestDbHelper.CreateRepository<StaffMember>(context, sieve);
        var roleRepo = TestDbHelper.CreateRepository<Role>(context, sieve);
        var settingsRepo = TestDbHelper.CreateRepository<FacilitySettings>(context, sieve);

        await settingsRepo.AddAsync(new FacilitySettings
        {
            ClinicId = clinicId,
            TenantId = tenantId,
            ClinicName = "NextStep Clinic",
            LicenseToken = CreateLicenseToken(clinicId, tenantId, maxStaff: 5),
            TenantSlug = "nextstep",
            FacilitySlug = "nextstep-main"
        });

        await staffRepo.AddAsync(new StaffMember
        {
            Id = Guid.NewGuid(),
            ClinicId = clinicId,
            TenantId = tenantId,
            FirstName = "Maria",
            LastName = "Santos",
            Title = "Dr.",
            Role = StaffRole.Doctor,
            PrcLicenseNumber = "PRC-10001",
            Email = "maria.santos@clinicez.ph",
            PasswordHash = new FacilityPasswordHasher().Hash("ExistingPass#123"),
            Status = StaffAccountStatus.Active,
            IsActive = true
        });
        await uow.SaveChangesAsync();

        var notifier = Substitute.For<IClinicStaffInvitationNotifier>();
        var handler = new CreateStaffMemberCommandHandler(
            staffRepo,
            roleRepo,
            settingsRepo,
            new FacilityLicenseValidator(),
            uow,
            clinicContext,
            new FacilityPasswordHasher(),
            null,
            notifier);

        var duplicateInvite = new CreateStaffMemberCommand(
            FirstName: "Maria Duplicate",
            LastName: "Santos",
            MiddleName: null,
            Title: "RN",
            Role: StaffRole.Nurse,
            ClinicRoleId: null,
            Email: "maria.santos@clinicez.ph",
            PhoneNumber: "09171234567",
            PrcLicenseNumber: null,
            PtrNumber: null,
            S2LicenseNumber: null,
            Specialty: null,
            InitialPassword: null,
            SendInviteEmail: true);

        var act = () => handler.Handle(duplicateInvite, CancellationToken.None);

        var ex = await act.Should().ThrowAsync<ValidationException>();
        ex.Which.Message.Should().Be(ExpectedDuplicateMessage);

        var count = await staffRepo.Query(s => s.ClinicId == clinicId).CountAsync();
        count.Should().Be(1, "duplicate invitation must not create an additional staff record or consume seats");
        notifier.DidNotReceiveWithAnyArgs().EnqueueInvitationEmail(default!, default, default!, default, default, default!, default!);
    }

    [Theory]
    [InlineData(StaffAccountStatus.Invited, true)]
    [InlineData(StaffAccountStatus.Suspended, false)]
    [InlineData(StaffAccountStatus.Revoked, false)]
    public async Task CreateStaff_EmailOrLinkInvite_ExistingStaffInAnyNonDeletedStatus_RejectsWithDuplicateMessage(
        StaffAccountStatus existingStatus,
        bool existingIsActive)
    {
        var clinicId = Guid.NewGuid();
        var tenantId = "tenant_issue113";
        var clinicContext = Substitute.For<IClinicContext>();
        clinicContext.ClinicId.Returns(clinicId);
        clinicContext.TenantId.Returns(tenantId);

        var (context, uow, sieve) = TestDbHelper.CreateTestContext(clinicContext);
        var staffRepo = TestDbHelper.CreateRepository<StaffMember>(context, sieve);
        var roleRepo = TestDbHelper.CreateRepository<Role>(context, sieve);
        var settingsRepo = TestDbHelper.CreateRepository<FacilitySettings>(context, sieve);

        await settingsRepo.AddAsync(new FacilitySettings
        {
            ClinicId = clinicId,
            TenantId = tenantId,
            ClinicName = "NextStep Clinic",
            LicenseToken = CreateLicenseToken(clinicId, tenantId, maxStaff: 10)
        });

        await staffRepo.AddAsync(new StaffMember
        {
            Id = Guid.NewGuid(),
            ClinicId = clinicId,
            TenantId = tenantId,
            FirstName = "Existing",
            LastName = "Member",
            Role = StaffRole.Receptionist,
            Email = "staff.member@clinicez.ph",
            Status = existingStatus,
            IsActive = existingIsActive
        });
        await uow.SaveChangesAsync();

        var handler = new CreateStaffMemberCommandHandler(
            staffRepo,
            roleRepo,
            settingsRepo,
            new FacilityLicenseValidator(),
            uow,
            clinicContext);

        // Link invite mode (SendInviteEmail = false, InitialPassword = null)
        var linkInvite = new CreateStaffMemberCommand(
            "New",
            "Invite",
            null,
            null,
            StaffRole.Nurse,
            null,
            "  STAFF.MEMBER@CLINICEZ.PH  ",
            null,
            null,
            null,
            null,
            null,
            InitialPassword: null,
            SendInviteEmail: false);

        var act = () => handler.Handle(linkInvite, CancellationToken.None);
        var ex = await act.Should().ThrowAsync<ValidationException>();
        ex.Which.Message.Should().Be(ExpectedDuplicateMessage);
    }

    [Fact]
    public async Task CreateStaff_DirectPassword_ExistingInvitedStaffWithoutPassword_RejectsWithDuplicateMessage()
    {
        var clinicId = Guid.NewGuid();
        var tenantId = "tenant_issue113";
        var clinicContext = Substitute.For<IClinicContext>();
        clinicContext.ClinicId.Returns(clinicId);
        clinicContext.TenantId.Returns(tenantId);

        var (context, uow, sieve) = TestDbHelper.CreateTestContext(clinicContext);
        var staffRepo = TestDbHelper.CreateRepository<StaffMember>(context, sieve);
        var roleRepo = TestDbHelper.CreateRepository<Role>(context, sieve);
        var settingsRepo = TestDbHelper.CreateRepository<FacilitySettings>(context, sieve);

        await settingsRepo.AddAsync(new FacilitySettings
        {
            ClinicId = clinicId,
            TenantId = tenantId,
            ClinicName = "NextStep Clinic",
            LicenseToken = CreateLicenseToken(clinicId, tenantId, maxStaff: 10)
        });

        await staffRepo.AddAsync(new StaffMember
        {
            Id = Guid.NewGuid(),
            ClinicId = clinicId,
            TenantId = tenantId,
            FirstName = "Pending",
            LastName = "Invite",
            Role = StaffRole.Nurse,
            Email = "pending@clinicez.ph",
            PasswordHash = null,
            Status = StaffAccountStatus.Invited,
            IsActive = true
        });
        await uow.SaveChangesAsync();

        var handler = new CreateStaffMemberCommandHandler(
            staffRepo,
            roleRepo,
            settingsRepo,
            new FacilityLicenseValidator(),
            uow,
            clinicContext,
            new FacilityPasswordHasher());

        var directPasswordCmd = new CreateStaffMemberCommand(
            "Another",
            "User",
            null,
            null,
            StaffRole.Receptionist,
            null,
            "Pending@ClinicEz.ph",
            null,
            null,
            null,
            null,
            null,
            InitialPassword: "StrongPassword#123",
            SendInviteEmail: false);

        var act = () => handler.Handle(directPasswordCmd, CancellationToken.None);
        var ex = await act.Should().ThrowAsync<ValidationException>();
        ex.Which.Message.Should().Be(ExpectedDuplicateMessage);
    }

    [Fact]
    public async Task CreateStaff_AtFullSeatCapacity_DuplicateEmail_SurfacesDuplicateEmailValidationBeforeSeatLimit()
    {
        var clinicId = Guid.NewGuid();
        var tenantId = "tenant_issue113";
        var clinicContext = Substitute.For<IClinicContext>();
        clinicContext.ClinicId.Returns(clinicId);
        clinicContext.TenantId.Returns(tenantId);

        var (context, uow, sieve) = TestDbHelper.CreateTestContext(clinicContext);
        var staffRepo = TestDbHelper.CreateRepository<StaffMember>(context, sieve);
        var roleRepo = TestDbHelper.CreateRepository<Role>(context, sieve);
        var settingsRepo = TestDbHelper.CreateRepository<FacilitySettings>(context, sieve);

        await settingsRepo.AddAsync(new FacilitySettings
        {
            ClinicId = clinicId,
            TenantId = tenantId,
            ClinicName = "Full Seat Clinic",
            LicenseToken = CreateLicenseToken(clinicId, tenantId, maxStaff: 1)
        });

        await staffRepo.AddAsync(new StaffMember
        {
            Id = Guid.NewGuid(),
            ClinicId = clinicId,
            TenantId = tenantId,
            FirstName = "Sole",
            LastName = "Admin",
            Role = StaffRole.Admin,
            Email = "admin@clinicez.ph",
            Status = StaffAccountStatus.Active,
            IsActive = true
        });
        await uow.SaveChangesAsync();

        var handler = new CreateStaffMemberCommandHandler(
            staffRepo,
            roleRepo,
            settingsRepo,
            new FacilityLicenseValidator(),
            uow,
            clinicContext);

        var duplicateCmd = new CreateStaffMemberCommand(
            "Sole",
            "Admin",
            null,
            null,
            StaffRole.Nurse,
            null,
            "admin@clinicez.ph",
            null,
            null,
            null,
            null,
            null,
            SendInviteEmail: true);

        var act = () => handler.Handle(duplicateCmd, CancellationToken.None);
        var ex = await act.Should().ThrowAsync<ValidationException>();
        ex.Which.Message.Should().Be(ExpectedDuplicateMessage);
    }

    [Fact]
    public async Task CreateStaff_AfterSoftDeletedStaffRemoval_AllowsReInvitingSameEmail()
    {
        var clinicId = Guid.NewGuid();
        var tenantId = "tenant_issue113";
        var adminId = Guid.NewGuid();
        var clinicContext = Substitute.For<IClinicContext>();
        clinicContext.ClinicId.Returns(clinicId);
        clinicContext.TenantId.Returns(tenantId);
        clinicContext.StaffId.Returns(adminId);

        var (context, uow, sieve) = TestDbHelper.CreateTestContext(clinicContext);
        var staffRepo = TestDbHelper.CreateRepository<StaffMember>(context, sieve);
        var roleRepo = TestDbHelper.CreateRepository<Role>(context, sieve);
        var settingsRepo = TestDbHelper.CreateRepository<FacilitySettings>(context, sieve);

        await settingsRepo.AddAsync(new FacilitySettings
        {
            ClinicId = clinicId,
            TenantId = tenantId,
            ClinicName = "NextStep Clinic",
            LicenseToken = CreateLicenseToken(clinicId, tenantId, maxStaff: 10)
        });

        var removedStaff = new StaffMember
        {
            Id = Guid.NewGuid(),
            ClinicId = clinicId,
            TenantId = tenantId,
            FirstName = "Former",
            LastName = "Nurse",
            Role = StaffRole.Nurse,
            Email = "former.nurse@clinicez.ph",
            Status = StaffAccountStatus.Revoked,
            IsActive = false
        };
        await staffRepo.AddAsync(removedStaff);
        await uow.SaveChangesAsync();

        var removeHandler = new RemoveStaffMemberCommandHandler(staffRepo, uow, clinicContext);
        (await removeHandler.Handle(new RemoveStaffMemberCommand(removedStaff.Id), CancellationToken.None)).Should().BeTrue();

        var createHandler = new CreateStaffMemberCommandHandler(
            staffRepo,
            roleRepo,
            settingsRepo,
            new FacilityLicenseValidator(),
            uow,
            clinicContext);

        var created = await createHandler.Handle(new CreateStaffMemberCommand(
            "Returning",
            "Nurse",
            null,
            "RN",
            StaffRole.Nurse,
            null,
            "Former.Nurse@clinicez.ph",
            null,
            null,
            null,
            null,
            null,
            SendInviteEmail: true), CancellationToken.None);

        created.Email.Should().Be("former.nurse@clinicez.ph");
        created.Status.Should().Be(StaffAccountStatus.Invited);
    }

    [Fact]
    public async Task CreateStaff_SameEmailInDifferentClinic_SucceedsIndependently()
    {
        var clinicA = Guid.NewGuid();
        var clinicB = Guid.NewGuid();
        var tenantId = "tenant_multi";
        var dbName = $"ClinicEz_MultiClinic_{Guid.NewGuid()}";

        var contextA = Substitute.For<IClinicContext>();
        contextA.ClinicId.Returns(clinicA);
        contextA.TenantId.Returns(tenantId);

        var (dbA, uowA, sieveA) = TestDbHelper.CreateSharedTestContext(dbName, contextA);
        var staffRepoA = TestDbHelper.CreateRepository<StaffMember>(dbA, sieveA);
        await staffRepoA.AddAsync(new StaffMember
        {
            Id = Guid.NewGuid(),
            ClinicId = clinicA,
            TenantId = tenantId,
            FirstName = "Shared",
            LastName = "Doctor",
            Role = StaffRole.Doctor,
            PrcLicenseNumber = "PRC-777",
            Email = "shared.doc@clinicez.ph",
            Status = StaffAccountStatus.Active,
            IsActive = true
        });
        await uowA.SaveChangesAsync();

        var contextB = Substitute.For<IClinicContext>();
        contextB.ClinicId.Returns(clinicB);
        contextB.TenantId.Returns(tenantId);

        var (dbB, uowB, sieveB) = TestDbHelper.CreateSharedTestContext(dbName, contextB);
        var staffRepoB = TestDbHelper.CreateRepository<StaffMember>(dbB, sieveB);
        var roleRepoB = TestDbHelper.CreateRepository<Role>(dbB, sieveB);
        var settingsRepoB = TestDbHelper.CreateRepository<FacilitySettings>(dbB, sieveB);

        await settingsRepoB.AddAsync(new FacilitySettings
        {
            ClinicId = clinicB,
            TenantId = tenantId,
            ClinicName = "Branch B Clinic",
            LicenseToken = CreateLicenseToken(clinicB, tenantId, maxStaff: 10)
        });
        await uowB.SaveChangesAsync();

        var createHandlerB = new CreateStaffMemberCommandHandler(
            staffRepoB,
            roleRepoB,
            settingsRepoB,
            new FacilityLicenseValidator(),
            uowB,
            contextB);

        var resultB = await createHandlerB.Handle(new CreateStaffMemberCommand(
            "Shared",
            "Doctor",
            null,
            "Dr.",
            StaffRole.Doctor,
            null,
            "shared.doc@clinicez.ph",
            null,
            "PRC-777",
            null,
            null,
            null,
            SendInviteEmail: true), CancellationToken.None);

        resultB.ClinicId.Should().Be(clinicB);
        resultB.Email.Should().Be("shared.doc@clinicez.ph");
    }

    [Fact]
    public async Task CreateStaff_MultipleNoLoginStaffWithBlankOrNullEmails_NormalizesToNullWithoutCollision()
    {
        var clinicId = Guid.NewGuid();
        var tenantId = "tenant_issue113";
        var clinicContext = Substitute.For<IClinicContext>();
        clinicContext.ClinicId.Returns(clinicId);
        clinicContext.TenantId.Returns(tenantId);

        var (context, uow, sieve) = TestDbHelper.CreateTestContext(clinicContext);
        var staffRepo = TestDbHelper.CreateRepository<StaffMember>(context, sieve);
        var roleRepo = TestDbHelper.CreateRepository<Role>(context, sieve);
        var settingsRepo = TestDbHelper.CreateRepository<FacilitySettings>(context, sieve);

        await settingsRepo.AddAsync(new FacilitySettings
        {
            ClinicId = clinicId,
            TenantId = tenantId,
            ClinicName = "NextStep Clinic",
            LicenseToken = CreateLicenseToken(clinicId, tenantId, maxStaff: 10)
        });
        await uow.SaveChangesAsync();

        var handler = new CreateStaffMemberCommandHandler(
            staffRepo,
            roleRepo,
            settingsRepo,
            new FacilityLicenseValidator(),
            uow,
            clinicContext);

        var first = await handler.Handle(new CreateStaffMemberCommand(
            "First", "Assistant", null, null, StaffRole.Nurse, null, "", null, null, null, null, null), CancellationToken.None);
        var second = await handler.Handle(new CreateStaffMemberCommand(
            "Second", "Assistant", null, null, StaffRole.Nurse, null, "   ", null, null, null, null, null), CancellationToken.None);

        first.Email.Should().BeNull();
        second.Email.Should().BeNull();
    }

    [Fact]
    public async Task UpdateStaff_ChangingEmailToExistingColleagueEmail_RejectsWithDuplicateMessage_WhileOwnEmailSucceeds()
    {
        var clinicId = Guid.NewGuid();
        var tenantId = "tenant_issue113";
        var clinicContext = Substitute.For<IClinicContext>();
        clinicContext.ClinicId.Returns(clinicId);
        clinicContext.TenantId.Returns(tenantId);

        var (context, uow, sieve) = TestDbHelper.CreateTestContext(clinicContext);
        var staffRepo = TestDbHelper.CreateRepository<StaffMember>(context, sieve);
        var roleRepo = TestDbHelper.CreateRepository<Role>(context, sieve);

        var staffA = new StaffMember
        {
            Id = Guid.NewGuid(),
            ClinicId = clinicId,
            TenantId = tenantId,
            FirstName = "Ana",
            LastName = "Reyes",
            Role = StaffRole.Nurse,
            Email = "ana@clinicez.ph",
            Status = StaffAccountStatus.Active,
            IsActive = true
        };
        var staffB = new StaffMember
        {
            Id = Guid.NewGuid(),
            ClinicId = clinicId,
            TenantId = tenantId,
            FirstName = "Ben",
            LastName = "Lim",
            Role = StaffRole.Receptionist,
            Email = "ben@clinicez.ph",
            Status = StaffAccountStatus.Active,
            IsActive = true
        };
        await staffRepo.AddAsync(staffA);
        await staffRepo.AddAsync(staffB);
        await uow.SaveChangesAsync();

        var updateHandler = new UpdateStaffMemberCommandHandler(staffRepo, roleRepo, uow, clinicContext);

        // 1. Updating Ben's email to Ana's email fails
        var collideAct = () => updateHandler.Handle(new UpdateStaffMemberCommand(
            staffB.Id,
            "Ben",
            "Lim",
            null,
            null,
            StaffRole.Receptionist,
            null,
            "ANA@CLINICEZ.PH",
            null,
            null,
            null,
            null,
            null,
            true), CancellationToken.None);

        var ex = await collideAct.Should().ThrowAsync<ValidationException>();
        ex.Which.Message.Should().Be(ExpectedDuplicateMessage);

        // 2. Updating Ben keeping his own email (even with uppercase input) succeeds and normalizes
        var updatedBen = await updateHandler.Handle(new UpdateStaffMemberCommand(
            staffB.Id,
            "Benjamin",
            "Lim",
            null,
            null,
            StaffRole.Receptionist,
            null,
            "  BEN@CLINICEZ.PH  ",
            null,
            null,
            null,
            null,
            null,
            true), CancellationToken.None);

        updatedBen.FirstName.Should().Be("Benjamin");
        updatedBen.Email.Should().Be("ben@clinicez.ph");
    }

    [Fact]
    public async Task ConcurrentUniqueConstraintViolation_OnSaveChanges_TranslatesToDuplicateEmailValidationException()
    {
        var clinicId = Guid.NewGuid();
        var tenantId = "tenant_race";
        var clinicContext = Substitute.For<IClinicContext>();
        clinicContext.ClinicId.Returns(clinicId);
        clinicContext.TenantId.Returns(tenantId);

        var (context, _, sieve) = TestDbHelper.CreateTestContext(clinicContext);
        var staffRepo = TestDbHelper.CreateRepository<StaffMember>(context, sieve);
        var roleRepo = TestDbHelper.CreateRepository<Role>(context, sieve);
        var settingsRepo = TestDbHelper.CreateRepository<FacilitySettings>(context, sieve);

        await settingsRepo.AddAsync(new FacilitySettings
        {
            ClinicId = clinicId,
            TenantId = tenantId,
            ClinicName = "Race Clinic",
            LicenseToken = CreateLicenseToken(clinicId, tenantId, maxStaff: 10)
        });
        await context.SaveChangesAsync();

        var racingUow = Substitute.For<IUnitOfWork>();
        racingUow.SaveChangesAsync(Arg.Any<CancellationToken>())
            .Returns<Task<int>>(_ => throw new DbUpdateException(
                "23505: duplicate key value violates unique constraint \"IX_StaffMembers_ClinicId_Email\""));

        var handler = new CreateStaffMemberCommandHandler(
            staffRepo,
            roleRepo,
            settingsRepo,
            new FacilityLicenseValidator(),
            racingUow,
            clinicContext);

        var act = () => handler.Handle(new CreateStaffMemberCommand(
            "Race",
            "User",
            null,
            null,
            StaffRole.Nurse,
            null,
            "race@clinicez.ph",
            null,
            null,
            null,
            null,
            null,
            SendInviteEmail: true), CancellationToken.None);

        var ex = await act.Should().ThrowAsync<ValidationException>();
        ex.Which.Message.Should().Be(ExpectedDuplicateMessage);
    }

    [Fact]
    public void Validators_RejectMalformedEmails_WhenOptionalEmailIsProvided()
    {
        var createValidator = new CreateStaffMemberCommandValidator();
        var createResult = createValidator.Validate(new CreateStaffMemberCommand(
            "Test", "User", null, null, StaffRole.Nurse, null, "not-an-email", null, null, null, null, null,
            InitialPassword: null, SendInviteEmail: false));
        createResult.IsValid.Should().BeFalse();
        createResult.Errors.Should().Contain(e => e.PropertyName == nameof(CreateStaffMemberCommand.Email));

        var updateValidator = new UpdateStaffMemberCommandValidator();
        var updateResult = updateValidator.Validate(new UpdateStaffMemberCommand(
            Guid.NewGuid(), "Test", "User", null, null, StaffRole.Nurse, null, "invalid-email-format", null, null, null, null, null, true));
        updateResult.IsValid.Should().BeFalse();
        updateResult.Errors.Should().Contain(e => e.PropertyName == nameof(UpdateStaffMemberCommand.Email));
    }
}
