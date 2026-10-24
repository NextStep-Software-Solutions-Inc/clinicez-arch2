using System;
using System.Threading;
using System.Threading.Tasks;
using ClinicEz.Clinic.Application.Common.Interfaces;
using ClinicEz.Clinic.Application.Features.Settings.Commands;
using ClinicEz.Clinic.Application.Features.Settings.Queries;
using ClinicEz.Clinic.Application.Features.Yakap.DTOs;
using ClinicEz.Clinic.Domain.Entities;
using ClinicEz.Clinic.Domain.Interfaces;
using ClinicEz.Clinic.Infrastructure.Messaging;
using ClinicEz.Clinic.Infrastructure.Persistence;
using ClinicEz.Clinic.Infrastructure.Persistence.Repositories;
using ClinicEz.Shared.Common;
using ClinicEz.Shared.Interop;
using ClinicEz.Shared.Interop.Handling;
using ClinicEz.Shared.Licensing;
using FluentAssertions;
using Microsoft.EntityFrameworkCore;
using Microsoft.Extensions.Logging.Abstractions;
using NSubstitute;
using Xunit;

namespace ClinicEz.Clinic.Application.Tests.Features.Settings;

public class AdversarialBranchInheritanceChallengerTests
{
    private const string TenantId = "adversarial-tenant";

    private static FacilityCreatedEvent CreateEvent(
        Guid clinicId,
        string tenantId,
        Guid? branchId = null,
        string? branchName = null,
        string? branchAccreditation = null,
        string? branchPmcc = null,
        string? branchCert = null,
        string? branchEndpoint = null,
        bool isAccredited = false,
        string? clinicName = "Adversarial Clinic",
        string? clinicSlug = "adversarial-clinic",
        bool? isWorkspaceEligible = true) => new()
    {
        ResourceId = clinicId,
        TenantId = tenantId,
        TenantSlug = "adv-tenant-slug",
        FacilityType = FacilityType.Clinic,
        Name = clinicName ?? "Adversarial Clinic",
        Slug = clinicSlug ?? "adversarial-clinic",
        IsWorkspaceEligible = isWorkspaceEligible,
        BranchId = branchId,
        BranchName = branchName,
        BranchPhilHealthAccreditationNumber = branchAccreditation,
        BranchPmccNumber = branchPmcc,
        BranchSoftwareCertificateId = branchCert,
        BranchKonsultaEndpoint = branchEndpoint,
        IsBranchPhilHealthAccredited = isAccredited
    };

    private static InteropMessageContext CreateControlPlaneContext<T>(string type, Guid clinicId, string tenantId, T payload)
    {
        var from = Party.Portal;
        var to = Party.ForFacility(tenantId, clinicId.ToString(), FacilityType.Clinic);
        var envelope = InteropEnvelope.Create(type, from, to, Guid.NewGuid(), payload);
        return new InteropMessageContext(envelope);
    }

    [Fact]
    public async Task StandaloneClinic_ReceivingDirectoryUpdate_MustNotClearExistingClinicSettings()
    {
        using var db = MessagingTestKit.CreateDbContext();
        var clinicId = Guid.NewGuid();

        // Standalone clinic: never had a branch, but has its own PhilHealth settings configured
        var initial = MessagingTestKit.SeedClinic(db, clinicId, TenantId, "Standalone Family Health");
        initial.BranchId = null;
        initial.BranchName = null;
        initial.BranchPhilHealthAccreditationNumber = null;
        initial.BranchPmccNumber = null;
        initial.BranchSoftwareCertificateId = null;
        initial.BranchKonsultaEndpoint = null;
        initial.IsBranchPhilHealthAccredited = false;
        initial.IsPhilHealthOverridden = false;

        // Custom standalone PhilHealth credentials
        initial.AccreditationNumber = "STANDALONE-PHIC-1234";
        initial.PmccNumber = "STANDALONE-PMCC-5678";
        initial.SoftwareCertificateId = "STANDALONE-CERT-9012";
        initial.KonsultaEndpoint = "/soap/standalone-endpoint";
        initial.IsPhilHealthConfigured = true;
        await db.SaveChangesAsync();

        var handler = new FacilityDirectoryUpdatedHandler(db, NullLogger<FacilityDirectoryUpdatedHandler>.Instance);

        // Directory update arrives for this standalone clinic with BranchId = null
        var evt = CreateEvent(
            clinicId,
            TenantId,
            branchId: null,
            branchName: null,
            branchAccreditation: null,
            clinicName: "Renamed Standalone Family Health",
            clinicSlug: "renamed-standalone",
            isWorkspaceEligible: true);

        var context = CreateControlPlaneContext(InteropTypes.FacilityDirectoryUpdated, clinicId, TenantId, evt);

        await handler.HandleAsync(evt, context, CancellationToken.None);

        var settings = await db.ClinicSettings.IgnoreQueryFilters().SingleAsync(s => s.ClinicId == clinicId);

        // Directory metadata MUST update
        settings.ClinicName.Should().Be("Renamed Standalone Family Health");
        settings.FacilitySlug.Should().Be("renamed-standalone");
        settings.IsWorkspaceEligible.Should().BeTrue();

        // Branch fields MUST remain null
        settings.BranchId.Should().BeNull();
        settings.BranchName.Should().BeNull();
        settings.IsBranchPhilHealthAccredited.Should().BeFalse();

        // CRITICAL: Standalone PhilHealth settings MUST NOT be cleared or overwritten!
        settings.AccreditationNumber.Should().Be("STANDALONE-PHIC-1234");
        settings.PmccNumber.Should().Be("STANDALONE-PMCC-5678");
        settings.SoftwareCertificateId.Should().Be("STANDALONE-CERT-9012");
        settings.KonsultaEndpoint.Should().Be("/soap/standalone-endpoint");
        settings.IsPhilHealthConfigured.Should().BeTrue();
    }

    [Fact]
    public async Task ClinicOverride_WhenBranchUpdatesViaDirectory_PreservesOverrideAndUpdatesBaseline()
    {
        using var db = MessagingTestKit.CreateDbContext();
        var clinicId = Guid.NewGuid();
        var branchId = Guid.NewGuid();

        var initial = MessagingTestKit.SeedClinic(db, clinicId, TenantId, "Branch Clinic East");
        initial.BranchId = branchId;
        initial.BranchName = "Original Branch Name";
        initial.BranchPhilHealthAccreditationNumber = "BRANCH-OLD-ACC";
        initial.BranchPmccNumber = "BRANCH-OLD-PMCC";
        initial.BranchSoftwareCertificateId = "BRANCH-OLD-CERT";
        initial.BranchKonsultaEndpoint = "/soap/old-branch";
        initial.IsBranchPhilHealthAccredited = true;

        // Clinic has an explicit override active
        initial.IsPhilHealthOverridden = true;
        initial.AccreditationNumber = "OVERRIDE-CUSTOM-ACC";
        initial.PmccNumber = "OVERRIDE-CUSTOM-PMCC";
        initial.SoftwareCertificateId = "OVERRIDE-CUSTOM-CERT";
        initial.KonsultaEndpoint = "/soap/override-custom";
        initial.IsPhilHealthConfigured = true;
        await db.SaveChangesAsync();

        var handler = new FacilityDirectoryUpdatedHandler(db, NullLogger<FacilityDirectoryUpdatedHandler>.Instance);

        // Branch undergoes changes in Portal (e.g. branch gets new cert or PMCC)
        var evt = CreateEvent(
            clinicId,
            TenantId,
            branchId: branchId,
            branchName: "Branch Name Updated V2",
            branchAccreditation: "BRANCH-NEW-ACC-V2",
            branchPmcc: "BRANCH-NEW-PMCC-V2",
            branchCert: "BRANCH-NEW-CERT-V2",
            branchEndpoint: "/soap/new-branch-v2",
            isAccredited: true);

        var context = CreateControlPlaneContext(InteropTypes.FacilityDirectoryUpdated, clinicId, TenantId, evt);

        await handler.HandleAsync(evt, context, CancellationToken.None);

        var settings = await db.ClinicSettings.IgnoreQueryFilters().SingleAsync(s => s.ClinicId == clinicId);

        // Stored branch baseline MUST be refreshed
        settings.BranchId.Should().Be(branchId);
        settings.BranchName.Should().Be("Branch Name Updated V2");
        settings.BranchPhilHealthAccreditationNumber.Should().Be("BRANCH-NEW-ACC-V2");
        settings.BranchPmccNumber.Should().Be("BRANCH-NEW-PMCC-V2");
        settings.BranchSoftwareCertificateId.Should().Be("BRANCH-NEW-CERT-V2");
        settings.BranchKonsultaEndpoint.Should().Be("/soap/new-branch-v2");
        settings.IsBranchPhilHealthAccredited.Should().BeTrue();

        // Clinic active credentials MUST be completely preserved!
        settings.IsPhilHealthOverridden.Should().BeTrue();
        settings.AccreditationNumber.Should().Be("OVERRIDE-CUSTOM-ACC");
        settings.PmccNumber.Should().Be("OVERRIDE-CUSTOM-PMCC");
        settings.SoftwareCertificateId.Should().Be("OVERRIDE-CUSTOM-CERT");
        settings.KonsultaEndpoint.Should().Be("/soap/override-custom");
        settings.IsPhilHealthConfigured.Should().BeTrue();
    }

    [Fact]
    public async Task ClinicOverride_WhenLicenseRenewedViaFacilityCreatedHandler_PreservesOverride()
    {
        using var db = MessagingTestKit.CreateDbContext();
        var clinicId = Guid.NewGuid();
        var branchId = Guid.NewGuid();

        var initial = MessagingTestKit.SeedClinic(db, clinicId, TenantId, "Branch Clinic West");
        initial.BranchId = branchId;
        initial.BranchName = "Branch HQ";
        initial.BranchPhilHealthAccreditationNumber = "BRANCH-ACC-1";
        initial.IsBranchPhilHealthAccredited = true;

        // Clinic override active
        initial.IsPhilHealthOverridden = true;
        initial.AccreditationNumber = "CLINIC-SPECIFIC-ACC-99";
        initial.PmccNumber = "CLINIC-SPECIFIC-PMCC-99";
        initial.SoftwareCertificateId = "CLINIC-SPECIFIC-CERT-99";
        initial.KonsultaEndpoint = "/soap/override-specific";
        initial.IsPhilHealthConfigured = true;
        await db.SaveChangesAsync();

        var handler = new FacilityCreatedHandler(
            db,
            new InteropPublisher(db),
            new FacilityLicenseValidator(FacilityLicenseValidator.DefaultAuthorityPublicKeyPem),
            NullLogger<FacilityCreatedHandler>.Instance);

        // Portal re-issues license token or triggers facility.license.issued event with updated branch info
        var evt = CreateEvent(
            clinicId,
            TenantId,
            branchId: branchId,
            branchName: "Branch HQ Renewed",
            branchAccreditation: "BRANCH-ACC-2-RENEWED",
            branchPmcc: "BRANCH-PMCC-2-RENEWED",
            branchCert: "BRANCH-CERT-2-RENEWED",
            branchEndpoint: "/soap/branch-renewed",
            isAccredited: true);

        var context = CreateControlPlaneContext(InteropTypes.FacilityLicenseIssued, clinicId, TenantId, evt);

        await handler.HandleAsync(evt, context, CancellationToken.None);

        var settings = await db.ClinicSettings.IgnoreQueryFilters().SingleAsync(s => s.ClinicId == clinicId);

        // Stored branch baseline updated
        settings.BranchName.Should().Be("Branch HQ Renewed");
        settings.BranchPhilHealthAccreditationNumber.Should().Be("BRANCH-ACC-2-RENEWED");
        settings.BranchPmccNumber.Should().Be("BRANCH-PMCC-2-RENEWED");

        // Active clinic override preserved
        settings.IsPhilHealthOverridden.Should().BeTrue();
        settings.AccreditationNumber.Should().Be("CLINIC-SPECIFIC-ACC-99");
        settings.PmccNumber.Should().Be("CLINIC-SPECIFIC-PMCC-99");
        settings.SoftwareCertificateId.Should().Be("CLINIC-SPECIFIC-CERT-99");
        settings.KonsultaEndpoint.Should().Be("/soap/override-specific");
        settings.IsPhilHealthConfigured.Should().BeTrue();
    }

    [Fact]
    public async Task RevertPhilHealthToBranchCommand_WhenBranchIsAccredited_RestoresBranchBaseline()
    {
        var clinicId = Guid.NewGuid();
        var clinicContext = Substitute.For<IClinicContext>();
        clinicContext.ClinicId.Returns(clinicId);
        clinicContext.TenantId.Returns(TenantId);

        var (db, uow, sieve) = TestDbHelper.CreateTestContext(clinicContext);
        var repo = new Repository<ClinicSettings>(db, sieve);

        var existing = MessagingTestKit.SeedClinic(db, clinicId, TenantId, "Clinic Under Branch");
        existing.BranchId = Guid.NewGuid();
        existing.BranchName = "Super Branch";
        existing.BranchPhilHealthAccreditationNumber = "BRANCH-BASELINE-ACCREDITED";
        existing.BranchPmccNumber = "BRANCH-BASELINE-PMCC";
        existing.BranchSoftwareCertificateId = "BRANCH-BASELINE-CERT";
        existing.BranchKonsultaEndpoint = "/soap/super-branch-endpoint";
        existing.IsBranchPhilHealthAccredited = true;

        // Currently overridden with custom settings
        existing.IsPhilHealthOverridden = true;
        existing.AccreditationNumber = "TEMP-OVERRIDE-ACC";
        existing.PmccNumber = "TEMP-OVERRIDE-PMCC";
        existing.SoftwareCertificateId = "TEMP-OVERRIDE-CERT";
        existing.KonsultaEndpoint = "/soap/temp-override";
        existing.IsPhilHealthConfigured = true;
        await db.SaveChangesAsync();

        var handler = new RevertPhilHealthToBranchCommandHandler(repo, clinicContext, uow);

        var result = await handler.Handle(new RevertPhilHealthToBranchCommand(), CancellationToken.None);

        result.IsPhilHealthOverridden.Should().BeFalse();
        result.IsPhilHealthConfigured.Should().BeTrue();
        result.AccreditationNumber.Should().Be("BRANCH-BASELINE-ACCREDITED");
        result.PmccNumber.Should().Be("BRANCH-BASELINE-PMCC");
        result.SoftwareCertificateId.Should().Be("BRANCH-BASELINE-CERT");
        result.KonsultaEndpoint.Should().Be("/soap/super-branch-endpoint");

        // Verify in DB
        var persisted = await db.ClinicSettings.IgnoreQueryFilters().SingleAsync(s => s.ClinicId == clinicId);
        persisted.IsPhilHealthOverridden.Should().BeFalse();
        persisted.IsPhilHealthConfigured.Should().BeTrue();
        persisted.AccreditationNumber.Should().Be("BRANCH-BASELINE-ACCREDITED");
    }

    [Fact]
    public async Task RevertPhilHealthToBranchCommand_WhenBranchIsUnaccredited_ResetsToUnconfigured()
    {
        var clinicId = Guid.NewGuid();
        var clinicContext = Substitute.For<IClinicContext>();
        clinicContext.ClinicId.Returns(clinicId);
        clinicContext.TenantId.Returns(TenantId);

        var (db, uow, sieve) = TestDbHelper.CreateTestContext(clinicContext);
        var repo = new Repository<ClinicSettings>(db, sieve);

        var existing = MessagingTestKit.SeedClinic(db, clinicId, TenantId, "Clinic Under Unaccredited Branch");
        existing.BranchId = Guid.NewGuid();
        existing.BranchName = "Unaccredited Branch";
        existing.BranchPhilHealthAccreditationNumber = null;
        existing.BranchPmccNumber = null;
        existing.BranchSoftwareCertificateId = null;
        existing.BranchKonsultaEndpoint = null;
        existing.IsBranchPhilHealthAccredited = false;

        // Overridden
        existing.IsPhilHealthOverridden = true;
        existing.AccreditationNumber = "MANUAL-ACC";
        existing.PmccNumber = "MANUAL-PMCC";
        existing.SoftwareCertificateId = "MANUAL-CERT";
        existing.IsPhilHealthConfigured = true;
        await db.SaveChangesAsync();

        var handler = new RevertPhilHealthToBranchCommandHandler(repo, clinicContext, uow);

        var result = await handler.Handle(new RevertPhilHealthToBranchCommand(), CancellationToken.None);

        result.IsPhilHealthOverridden.Should().BeFalse();
        result.IsPhilHealthConfigured.Should().BeFalse();
        result.AccreditationNumber.Should().BeNull();
        result.PmccNumber.Should().BeNull();
        result.SoftwareCertificateId.Should().BeNull();

        var persisted = await db.ClinicSettings.IgnoreQueryFilters().SingleAsync(s => s.ClinicId == clinicId);
        persisted.IsPhilHealthOverridden.Should().BeFalse();
        persisted.IsPhilHealthConfigured.Should().BeFalse();
        persisted.AccreditationNumber.Should().BeNull();
    }

    [Fact]
    public async Task RevertPhilHealthToBranchCommand_WhenClinicHasNoBranch_ResetsToUnconfiguredSafely()
    {
        var clinicId = Guid.NewGuid();
        var clinicContext = Substitute.For<IClinicContext>();
        clinicContext.ClinicId.Returns(clinicId);
        clinicContext.TenantId.Returns(TenantId);

        var (db, uow, sieve) = TestDbHelper.CreateTestContext(clinicContext);
        var repo = new Repository<ClinicSettings>(db, sieve);

        var existing = MessagingTestKit.SeedClinic(db, clinicId, TenantId, "Standalone Clinic");
        existing.BranchId = null;
        existing.BranchName = null;
        existing.BranchPhilHealthAccreditationNumber = null;
        existing.IsBranchPhilHealthAccredited = false;

        existing.IsPhilHealthOverridden = true;
        existing.AccreditationNumber = "STANDALONE-OVERRIDE";
        existing.IsPhilHealthConfigured = true;
        await db.SaveChangesAsync();

        var handler = new RevertPhilHealthToBranchCommandHandler(repo, clinicContext, uow);

        var result = await handler.Handle(new RevertPhilHealthToBranchCommand(), CancellationToken.None);

        result.IsPhilHealthOverridden.Should().BeFalse();
        result.IsPhilHealthConfigured.Should().BeFalse();
        result.AccreditationNumber.Should().BeNull();
        result.BranchId.Should().BeNull();

        var persisted = await db.ClinicSettings.IgnoreQueryFilters().SingleAsync(s => s.ClinicId == clinicId);
        persisted.IsPhilHealthOverridden.Should().BeFalse();
        persisted.IsPhilHealthConfigured.Should().BeFalse();
        persisted.AccreditationNumber.Should().BeNull();
    }

    [Fact]
    public async Task UnlinkFromBranch_WhenNotOverridden_ClearsCredentialsAndSetsConfiguredFalse()
    {
        using var db = MessagingTestKit.CreateDbContext();
        var clinicId = Guid.NewGuid();
        var branchId = Guid.NewGuid();

        var initial = MessagingTestKit.SeedClinic(db, clinicId, TenantId, "Clinic Formerly In Branch");
        initial.BranchId = branchId;
        initial.BranchName = "Branch To Unlink";
        initial.BranchPhilHealthAccreditationNumber = "BRANCH-UNLINK-ACC";
        initial.BranchPmccNumber = "BRANCH-UNLINK-PMCC";
        initial.BranchSoftwareCertificateId = "BRANCH-UNLINK-CERT";
        initial.IsBranchPhilHealthAccredited = true;

        // Inherited from branch
        initial.IsPhilHealthOverridden = false;
        initial.AccreditationNumber = "BRANCH-UNLINK-ACC";
        initial.PmccNumber = "BRANCH-UNLINK-PMCC";
        initial.SoftwareCertificateId = "BRANCH-UNLINK-CERT";
        initial.IsPhilHealthConfigured = true;
        await db.SaveChangesAsync();

        var handler = new FacilityDirectoryUpdatedHandler(db, NullLogger<FacilityDirectoryUpdatedHandler>.Instance);

        // FacilityDirectoryUpdated arrives with BranchId = null (meaning unlinked from branch)
        var evt = CreateEvent(
            clinicId,
            TenantId,
            branchId: null,
            branchName: null,
            branchAccreditation: null,
            isAccredited: false);

        var context = CreateControlPlaneContext(InteropTypes.FacilityDirectoryUpdated, clinicId, TenantId, evt);

        await handler.HandleAsync(evt, context, CancellationToken.None);

        var settings = await db.ClinicSettings.IgnoreQueryFilters().SingleAsync(s => s.ClinicId == clinicId);

        // Branch metadata cleared
        settings.BranchId.Should().BeNull();
        settings.BranchName.Should().BeNull();
        settings.BranchPhilHealthAccreditationNumber.Should().BeNull();
        settings.IsBranchPhilHealthAccredited.Should().BeFalse();

        // Since it was NOT overridden, credentials must be cleared
        settings.AccreditationNumber.Should().BeNull();
        settings.PmccNumber.Should().BeNull();
        settings.SoftwareCertificateId.Should().BeNull();
        settings.IsPhilHealthConfigured.Should().BeFalse();
    }

    [Fact]
    public async Task UnlinkFromBranch_WhenOverridden_ClearsBranchBaselineButPreservesActiveClinicCredentials()
    {
        using var db = MessagingTestKit.CreateDbContext();
        var clinicId = Guid.NewGuid();
        var branchId = Guid.NewGuid();

        var initial = MessagingTestKit.SeedClinic(db, clinicId, TenantId, "Clinic Formerly In Branch With Override");
        initial.BranchId = branchId;
        initial.BranchName = "Branch To Unlink";
        initial.BranchPhilHealthAccreditationNumber = "BRANCH-UNLINK-ACC";
        initial.BranchPmccNumber = "BRANCH-UNLINK-PMCC";
        initial.BranchSoftwareCertificateId = "BRANCH-UNLINK-CERT";
        initial.IsBranchPhilHealthAccredited = true;

        // Overridden by clinic
        initial.IsPhilHealthOverridden = true;
        initial.AccreditationNumber = "MY-OWN-ACC-123";
        initial.PmccNumber = "MY-OWN-PMCC-456";
        initial.SoftwareCertificateId = "MY-OWN-CERT-789";
        initial.KonsultaEndpoint = "/soap/my-own";
        initial.IsPhilHealthConfigured = true;
        await db.SaveChangesAsync();

        var handler = new FacilityDirectoryUpdatedHandler(db, NullLogger<FacilityDirectoryUpdatedHandler>.Instance);

        // FacilityDirectoryUpdated arrives with BranchId = null
        var evt = CreateEvent(
            clinicId,
            TenantId,
            branchId: null,
            branchName: null,
            branchAccreditation: null,
            isAccredited: false);

        var context = CreateControlPlaneContext(InteropTypes.FacilityDirectoryUpdated, clinicId, TenantId, evt);

        await handler.HandleAsync(evt, context, CancellationToken.None);

        var settings = await db.ClinicSettings.IgnoreQueryFilters().SingleAsync(s => s.ClinicId == clinicId);

        // Branch baseline cleared
        settings.BranchId.Should().BeNull();
        settings.BranchName.Should().BeNull();
        settings.BranchPhilHealthAccreditationNumber.Should().BeNull();
        settings.IsBranchPhilHealthAccredited.Should().BeFalse();

        // Clinic active credentials preserved!
        settings.IsPhilHealthOverridden.Should().BeTrue();
        settings.AccreditationNumber.Should().Be("MY-OWN-ACC-123");
        settings.PmccNumber.Should().Be("MY-OWN-PMCC-456");
        settings.SoftwareCertificateId.Should().Be("MY-OWN-CERT-789");
        settings.KonsultaEndpoint.Should().Be("/soap/my-own");
        settings.IsPhilHealthConfigured.Should().BeTrue();
    }

    [Fact]
    public async Task UnauthorizedSender_OnFacilityDirectoryUpdated_IsRejectedWithoutMutatingState()
    {
        using var db = MessagingTestKit.CreateDbContext();
        var clinicId = Guid.NewGuid();

        var initial = MessagingTestKit.SeedClinic(db, clinicId, TenantId, "Secure Clinic");
        initial.AccreditationNumber = "ORIGINAL-ACC";
        initial.IsPhilHealthConfigured = true;
        await db.SaveChangesAsync();

        var handler = new FacilityDirectoryUpdatedHandler(db, NullLogger<FacilityDirectoryUpdatedHandler>.Instance);

        var evt = CreateEvent(
            clinicId,
            TenantId,
            branchId: Guid.NewGuid(),
            branchAccreditation: "ATTACKER-ACC",
            isAccredited: true);

        // SENDER IS NOT PORTAL CONTROL PLANE (e.g. from a peer facility)
        var maliciousFrom = Party.ForFacility(TenantId, "evil-facility", FacilityType.Clinic);
        var to = Party.ForFacility(TenantId, clinicId.ToString(), FacilityType.Clinic);
        var maliciousEnvelope = InteropEnvelope.Create(InteropTypes.FacilityDirectoryUpdated, maliciousFrom, to, Guid.NewGuid(), evt);
        var context = new InteropMessageContext(maliciousEnvelope);

        await handler.HandleAsync(evt, context, CancellationToken.None);

        var settings = await db.ClinicSettings.IgnoreQueryFilters().SingleAsync(s => s.ClinicId == clinicId);

        // Must NOT have changed
        settings.AccreditationNumber.Should().Be("ORIGINAL-ACC");
        settings.BranchId.Should().BeNull();
    }
}
