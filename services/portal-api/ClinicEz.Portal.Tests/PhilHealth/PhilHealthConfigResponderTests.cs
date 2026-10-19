using ClinicEz.Portal.Application.Features.PhilHealth;
using ClinicEz.Portal.Application.Interfaces;
using ClinicEz.Portal.Domain.Entities;
using ClinicEz.Portal.Infrastructure.PhilHealth;
using ClinicEz.Portal.Infrastructure.Persistence;
using ClinicEz.Portal.Tests.Support;
using ClinicEz.Shared.Common;
using ClinicEz.Shared.Interop;
using ClinicEz.Shared.Interop.Handling;
using ClinicEz.Shared.Interoperability;
using Microsoft.AspNetCore.DataProtection;
using Microsoft.EntityFrameworkCore;
using Microsoft.Extensions.Logging.Abstractions;
using System;
using System.Linq;
using System.Threading;
using System.Threading.Tasks;
using Xunit;

namespace ClinicEz.Portal.Tests.PhilHealth;

public class PhilHealthConfigResponderTests : IDisposable
{
    private readonly ApplicationDbContext _context = TestSupport.NewContext();
    private readonly IPhilHealthSecretProtector _protector = new PhilHealthSecretProtector(new EphemeralDataProtectionProvider());
    private readonly Tenant _tenant = new() { Id = Guid.NewGuid(), TenantSlug = "metro", Name = "Metro", OwnerId = "owner", Email = "o@metro.ph" };

    public PhilHealthConfigResponderTests()
    {
        _context.Tenants.Add(_tenant);
        _context.SaveChanges();
    }

    public void Dispose()
    {
        _context.Database.EnsureDeleted();
        _context.Dispose();
    }

    private Branch AddBranch(string name = "Main Branch", bool accredited = false, bool active = true, bool deleted = false, Guid? tenantId = null)
    {
        var branch = new Branch
        {
            Id = Guid.NewGuid(),
            TenantId = tenantId ?? _tenant.Id,
            Name = name,
            IsActive = active,
            IsDeleted = deleted,
            IsPhilHealthAccredited = accredited,
            PhilHealthAccreditationNumber = $"HCI-{name}",
            PhilHealthPmccNumber = "Z15445",
            PhilHealthSoftwareCertificateId = "KON-CERT",
            PhilHealthEncryptedUsername = _protector.Protect("soap-user"),
            PhilHealthEncryptedPassword = _protector.Protect("soap-pass"),
            PhilHealthEncryptedCipherKey = _protector.Protect("cipher-key")
        };
        _context.Branches.Add(branch);
        _context.SaveChanges();
        return branch;
    }

    private static InteropMessageContext Context(Party from, string type) =>
        new(InteropEnvelope.Create(type, from, Party.Portal, Guid.NewGuid(), new object()));

    private PhilHealthConfigRequestedResponder Reader() =>
        new(_context, _protector, NullLogger<PhilHealthConfigRequestedResponder>.Instance);

    private PhilHealthConfigUpsertRequestedResponder Writer() =>
        new(_context, _protector, NullLogger<PhilHealthConfigUpsertRequestedResponder>.Instance);

    private Task<PhilHealthConfigRespondedPayload> Read(string tenantId, string? branchId = null, Party? from = null) =>
        Reader().RespondAsync(
            new PhilHealthConfigRequestedPayload { TenantId = tenantId, BranchId = branchId },
            Context(from ?? Party.PhilHealth, InteropTypes.PhilHealthConfigRequested),
            CancellationToken.None);

    private Task<PhilHealthConfigUpsertRespondedPayload> Upsert(PhilHealthConfigPayload config, Party? from = null) =>
        Writer().RespondAsync(config, Context(from ?? Party.PhilHealth, InteropTypes.PhilHealthConfigUpsertRequested), CancellationToken.None);

    private PhilHealthConfigPayload Config(string? branchId = null) => new()
    {
        TenantId = _tenant.Id.ToString(),
        BranchId = branchId,
        FacilityName = "Metro Clinic",
        AccreditationNumber = " HCI-9 ",
        PmccNumber = "Z1",
        SoftwareCertificateId = "KON-1",
        Username = " new-user ",
        Password = "new-pass",
        CipherKey = "new-cipher",
        KonsultaEndpoint = "https://philhealth.example/soap",
        IsActive = true
    };

    public static TheoryData<Party> NotTheProxy() => new()
    {
        Party.Portal,
        Party.Hub,
        Party.ForFacility(Guid.NewGuid().ToString(), Guid.NewGuid().ToString(), FacilityType.Clinic),
        Party.ForFacility(Guid.NewGuid().ToString(), Guid.NewGuid().ToString(), FacilityType.Clinic, InteropServices.Philhealth),
        Party.ForPatient(Guid.NewGuid().ToString())
    };

    [Fact]
    public async Task Read_ForTheProxy_ReturnsTheDecryptedCredentialsOfTheAccreditedBranch()
    {
        AddBranch("Other");
        var accredited = AddBranch("Accredited", accredited: true);

        var reply = await Read(_tenant.Id.ToString());

        Assert.True(reply.Found);
        var config = reply.Config!;
        Assert.Equal(_tenant.Id.ToString(), config.TenantId);
        Assert.Equal(accredited.Id.ToString(), config.BranchId);
        Assert.Equal("Accredited", config.FacilityName);
        Assert.Equal("HCI-Accredited", config.AccreditationNumber);
        Assert.Equal("soap-user", config.Username);
        Assert.Equal("soap-pass", config.Password);
        Assert.Equal("cipher-key", config.CipherKey);
        Assert.Equal(PhilHealthDefaults.KonsultaEndpoint, config.KonsultaEndpoint);
        Assert.True(config.IsActive);
    }

    [Fact]
    public async Task Read_ByBranch_ReturnsThatBranch_AndOnlyWithinTheTenant()
    {
        var branch = AddBranch();
        var foreign = AddBranch("Foreign", tenantId: Guid.NewGuid());

        Assert.Equal(branch.Id.ToString(), (await Read(_tenant.Id.ToString(), branch.Id.ToString())).Config!.BranchId);
        Assert.False((await Read(_tenant.Id.ToString(), foreign.Id.ToString())).Found);
    }

    [Fact]
    public async Task Read_ByFacility_ReturnsTheSettingsOfItsBranch_OrTheWorkspaceDefaultWhenItHasNone()
    {
        AddBranch("Default", accredited: true);
        var facilityBranch = AddBranch("Facility Branch");
        var inBranch = new Facility { Id = Guid.NewGuid(), TenantId = _tenant.Id, Name = "Clinic", FacilityType = FacilityType.Clinic, BranchId = facilityBranch.Id };
        var outside = new Facility { Id = Guid.NewGuid(), TenantId = _tenant.Id, Name = "Lab", FacilityType = FacilityType.Laboratory };
        var foreign = new Facility { Id = Guid.NewGuid(), TenantId = Guid.NewGuid(), Name = "Foreign", FacilityType = FacilityType.Clinic };
        _context.Facilities.AddRange(inBranch, outside, foreign);
        await _context.SaveChangesAsync();

        Assert.Equal("Facility Branch", (await Read(_tenant.Id.ToString(), inBranch.Id.ToString())).Config!.FacilityName);
        Assert.Equal("Default", (await Read(_tenant.Id.ToString(), outside.Id.ToString())).Config!.FacilityName);
        Assert.False((await Read(_tenant.Id.ToString(), foreign.Id.ToString())).Found);
    }

    [Fact]
    public async Task Upsert_ByFacility_StoresOnTheBranchOfTheFacility()
    {
        var facilityBranch = AddBranch("Facility Branch");
        var other = AddBranch("Other", accredited: true);
        var facility = new Facility { Id = Guid.NewGuid(), TenantId = _tenant.Id, Name = "Clinic", FacilityType = FacilityType.Clinic, BranchId = facilityBranch.Id };
        _context.Facilities.Add(facility);
        await _context.SaveChangesAsync();

        var reply = await Upsert(Config(facility.Id.ToString()));
        await _context.SaveChangesAsync();

        Assert.True(reply.Succeeded);
        Assert.Equal("HCI-9", (await _context.Branches.AsNoTracking().SingleAsync(b => b.Id == facilityBranch.Id)).PhilHealthAccreditationNumber);
        Assert.Equal("HCI-Other", (await _context.Branches.AsNoTracking().SingleAsync(b => b.Id == other.Id)).PhilHealthAccreditationNumber);
    }

    [Fact]
    public async Task Read_OfAnInactiveBranchWithoutAccreditation_ReportsInactive()
    {
        var branch = AddBranch(accredited: false);

        var reply = await Read(_tenant.Id.ToString(), branch.Id.ToString());

        Assert.True(reply.Found);
        Assert.False(reply.Config!.IsActive);
    }

    [Fact]
    public async Task Read_WhenThereIsNothingToReturn_IsNotFound()
    {
        AddBranch(deleted: true);
        AddBranch("Inactive", active: false);

        Assert.False((await Read(_tenant.Id.ToString())).Found);
        Assert.False((await Read(_tenant.Id.ToString(), Guid.NewGuid().ToString())).Found);
        Assert.False((await Read("not-a-guid")).Found);
        Assert.False((await Read(_tenant.Id.ToString(), "not-a-guid")).Found);
        Assert.False((await Read(Guid.NewGuid().ToString())).Found);
    }

    [Theory]
    [MemberData(nameof(NotTheProxy))]
    public async Task Read_FromAnyoneButTheProxy_ReturnsNoSecrets(Party sender)
    {
        var branch = AddBranch(accredited: true);

        var reply = await Read(_tenant.Id.ToString(), branch.Id.ToString(), sender);

        Assert.False(reply.Found);
        Assert.Null(reply.Config);
    }

    [Fact]
    public async Task Read_OfAValueStoredBeforeEncryption_ReturnsItAsIs()
    {
        var branch = AddBranch();
        branch.PhilHealthEncryptedUsername = "legacy-plain-user";
        await _context.SaveChangesAsync();

        Assert.Equal("legacy-plain-user", (await Read(_tenant.Id.ToString(), branch.Id.ToString())).Config!.Username);
    }

    [Fact]
    public async Task Upsert_ForTheProxy_StoresEncryptedValues_OnTheAccreditedBranch()
    {
        var branch = AddBranch("Accredited", accredited: true);

        var reply = await Upsert(Config());
        await _context.SaveChangesAsync();

        Assert.True(reply.Succeeded);
        var stored = await _context.Branches.AsNoTracking().SingleAsync(b => b.Id == branch.Id);
        Assert.Equal("HCI-9", stored.PhilHealthAccreditationNumber);
        Assert.Equal("https://philhealth.example/soap", stored.PhilHealthKonsultaEndpoint);
        Assert.True(stored.IsPhilHealthAccredited);
        Assert.NotEqual("new-pass", stored.PhilHealthEncryptedPassword);
        Assert.Equal("new-user", _protector.Unprotect(stored.PhilHealthEncryptedUsername!));
        Assert.Equal("new-pass", _protector.Unprotect(stored.PhilHealthEncryptedPassword!));
        Assert.Equal("new-cipher", _protector.Unprotect(stored.PhilHealthEncryptedCipherKey!));
    }

    [Fact]
    public async Task Upsert_ForAWorkspaceWithoutBranches_CreatesTheMainBranch()
    {
        var reply = await Upsert(Config());
        await _context.SaveChangesAsync();

        Assert.True(reply.Succeeded);
        var branch = await _context.Branches.SingleAsync();
        Assert.Equal(_tenant.Id, branch.TenantId);
        Assert.Equal("Main Branch", branch.Name);
        Assert.True(branch.IsActive);
        Assert.Equal("HCI-9", branch.PhilHealthAccreditationNumber);
    }

    [Fact]
    public async Task Upsert_WithBlankSecrets_KeepsTheStoredOnes()
    {
        var branch = AddBranch(accredited: true);

        await Upsert(Config() with { Username = "", Password = " ", CipherKey = "" });
        await _context.SaveChangesAsync();

        var stored = await _context.Branches.AsNoTracking().SingleAsync(b => b.Id == branch.Id);
        Assert.Equal("soap-user", _protector.Unprotect(stored.PhilHealthEncryptedUsername!));
        Assert.Equal("soap-pass", _protector.Unprotect(stored.PhilHealthEncryptedPassword!));
        Assert.Equal("cipher-key", _protector.Unprotect(stored.PhilHealthEncryptedCipherKey!));
    }

    [Fact]
    public async Task Upsert_ByBranch_TouchesOnlyThatBranch_AndRejectsABranchOfAnotherWorkspace()
    {
        var target = AddBranch("Target");
        var untouched = AddBranch("Untouched", accredited: true);
        var foreign = AddBranch("Foreign", tenantId: Guid.NewGuid());

        var ok = await Upsert(Config(target.Id.ToString()));
        var rejected = await Upsert(Config(foreign.Id.ToString()));
        await _context.SaveChangesAsync();

        Assert.True(ok.Succeeded);
        Assert.False(rejected.Succeeded);
        Assert.Equal("HCI-9", (await _context.Branches.AsNoTracking().SingleAsync(b => b.Id == target.Id)).PhilHealthAccreditationNumber);
        Assert.Equal("HCI-Untouched", (await _context.Branches.AsNoTracking().SingleAsync(b => b.Id == untouched.Id)).PhilHealthAccreditationNumber);
        Assert.Equal("HCI-Foreign", (await _context.Branches.AsNoTracking().SingleAsync(b => b.Id == foreign.Id)).PhilHealthAccreditationNumber);
    }

    [Fact]
    public async Task Upsert_ForAnUnknownWorkspace_Fails()
    {
        var reply = await Upsert(Config() with { TenantId = Guid.NewGuid().ToString() });

        Assert.False(reply.Succeeded);
        Assert.Equal("Workspace not found.", reply.Message);
    }

    [Theory]
    [MemberData(nameof(NotTheProxy))]
    public async Task Upsert_FromAnyoneButTheProxy_StoresNothing(Party sender)
    {
        var branch = AddBranch(accredited: true);

        var reply = await Upsert(Config(), sender);
        await _context.SaveChangesAsync();

        Assert.False(reply.Succeeded);
        Assert.Equal(1, await _context.Branches.CountAsync());
        var stored = await _context.Branches.AsNoTracking().SingleAsync(b => b.Id == branch.Id);
        Assert.Equal("HCI-Main Branch", stored.PhilHealthAccreditationNumber);
        Assert.Equal("soap-pass", _protector.Unprotect(stored.PhilHealthEncryptedPassword!));
    }
}
