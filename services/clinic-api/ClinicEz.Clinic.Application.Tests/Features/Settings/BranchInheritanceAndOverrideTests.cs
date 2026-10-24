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

public class BranchInheritanceAndOverrideTests
{
    private const string TenantId = "test-tenant-branch";

    private static FacilityCreatedEvent CreateEvent(
        Guid clinicId,
        string tenantId,
        Guid? branchId = null,
        string? branchName = null,
        string? branchAccreditation = null,
        string? branchPmcc = null,
        string? branchCert = null,
        string? branchEndpoint = null,
        bool isAccredited = false) => new()
    {
        ResourceId = clinicId,
        TenantId = tenantId,
        TenantSlug = "branch-tenant",
        FacilityType = FacilityType.Clinic,
        Name = "Branch Medical Center",
        Slug = "branch-med",
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
    public async Task FacilityCreatedHandler_WithAccreditedBranch_PopulatesBaselineAndActiveSettings()
    {
        using var db = MessagingTestKit.CreateDbContext();
        var clinicId = Guid.NewGuid();
        var branchId = Guid.NewGuid();

        var handler = new FacilityCreatedHandler(
            db,
            new InteropPublisher(db),
            new FacilityLicenseValidator(FacilityLicenseValidator.DefaultAuthorityPublicKeyPem),
            NullLogger<FacilityCreatedHandler>.Instance);

        var evt = CreateEvent(
            clinicId,
            TenantId,
            branchId: branchId,
            branchName: "Metro Central Branch",
            branchAccreditation: "PH-BRANCH-9999",
            branchPmcc: "PMCC-8888",
            branchCert: "CERT-7777",
            branchEndpoint: "/soap/branch-endpoint",
            isAccredited: true);

        var context = CreateControlPlaneContext(InteropTypes.FacilityLicenseIssued, clinicId, TenantId, evt);

        await handler.HandleAsync(evt, context, CancellationToken.None);

        var settings = await db.ClinicSettings.IgnoreQueryFilters().SingleAsync(s => s.ClinicId == clinicId);

        // Branch baseline
        settings.BranchId.Should().Be(branchId);
        settings.BranchName.Should().Be("Metro Central Branch");
        settings.BranchPhilHealthAccreditationNumber.Should().Be("PH-BRANCH-9999");
        settings.BranchPmccNumber.Should().Be("PMCC-8888");
        settings.BranchSoftwareCertificateId.Should().Be("CERT-7777");
        settings.BranchKonsultaEndpoint.Should().Be("/soap/branch-endpoint");
        settings.IsBranchPhilHealthAccredited.Should().BeTrue();

        // Inherited active settings
        settings.IsPhilHealthOverridden.Should().BeFalse();
        settings.IsPhilHealthConfigured.Should().BeTrue();
        settings.AccreditationNumber.Should().Be("PH-BRANCH-9999");
        settings.PmccNumber.Should().Be("PMCC-8888");
        settings.SoftwareCertificateId.Should().Be("CERT-7777");
        settings.KonsultaEndpoint.Should().Be("/soap/branch-endpoint");
    }

    [Fact]
    public async Task FacilityCreatedHandler_WithUnaccreditedBranch_SetsConfiguredFalse()
    {
        using var db = MessagingTestKit.CreateDbContext();
        var clinicId = Guid.NewGuid();
        var branchId = Guid.NewGuid();

        var handler = new FacilityCreatedHandler(
            db,
            new InteropPublisher(db),
            new FacilityLicenseValidator(FacilityLicenseValidator.DefaultAuthorityPublicKeyPem),
            NullLogger<FacilityCreatedHandler>.Instance);

        var evt = CreateEvent(
            clinicId,
            TenantId,
            branchId: branchId,
            branchName: "Unaccredited Branch",
            branchAccreditation: null,
            branchPmcc: null,
            branchCert: null,
            branchEndpoint: null,
            isAccredited: false);

        var context = CreateControlPlaneContext(InteropTypes.FacilityLicenseIssued, clinicId, TenantId, evt);

        await handler.HandleAsync(evt, context, CancellationToken.None);

        var settings = await db.ClinicSettings.IgnoreQueryFilters().SingleAsync(s => s.ClinicId == clinicId);

        settings.IsBranchPhilHealthAccredited.Should().BeFalse();
        settings.IsPhilHealthConfigured.Should().BeFalse();
        settings.AccreditationNumber.Should().BeNull();
        settings.IsPhilHealthOverridden.Should().BeFalse();
    }

    [Fact]
    public async Task FacilityDirectoryUpdatedHandler_WhenNotOverridden_InheritsBranchChanges()
    {
        using var db = MessagingTestKit.CreateDbContext();
        var clinicId = Guid.NewGuid();
        var branchId = Guid.NewGuid();

        var initial = MessagingTestKit.SeedClinic(db, clinicId, TenantId, "Main Clinic");
        initial.IsPhilHealthOverridden = false;
        initial.IsPhilHealthConfigured = false;
        await db.SaveChangesAsync();

        var handler = new FacilityDirectoryUpdatedHandler(db, NullLogger<FacilityDirectoryUpdatedHandler>.Instance);

        var evt = CreateEvent(
            clinicId,
            TenantId,
            branchId: branchId,
            branchName: "Updated Branch Name",
            branchAccreditation: "PH-BRANCH-UPDATED",
            branchPmcc: "PMCC-UPDATED",
            branchCert: "CERT-UPDATED",
            branchEndpoint: "/soap/branch-updated",
            isAccredited: true);

        var context = CreateControlPlaneContext(InteropTypes.FacilityDirectoryUpdated, clinicId, TenantId, evt);

        await handler.HandleAsync(evt, context, CancellationToken.None);

        var settings = await db.ClinicSettings.IgnoreQueryFilters().SingleAsync(s => s.ClinicId == clinicId);

        settings.BranchName.Should().Be("Updated Branch Name");
        settings.BranchPhilHealthAccreditationNumber.Should().Be("PH-BRANCH-UPDATED");
        settings.IsPhilHealthOverridden.Should().BeFalse();
        settings.IsPhilHealthConfigured.Should().BeTrue();
        settings.AccreditationNumber.Should().Be("PH-BRANCH-UPDATED");
        settings.PmccNumber.Should().Be("PMCC-UPDATED");
        settings.SoftwareCertificateId.Should().Be("CERT-UPDATED");
        settings.KonsultaEndpoint.Should().Be("/soap/branch-updated");
    }

    [Fact]
    public async Task FacilityDirectoryUpdatedHandler_WhenOverridden_PreservesActiveClinicOverrides()
    {
        using var db = MessagingTestKit.CreateDbContext();
        var clinicId = Guid.NewGuid();
        var branchId = Guid.NewGuid();

        var initial = MessagingTestKit.SeedClinic(db, clinicId, TenantId, "Main Clinic");
        initial.IsPhilHealthOverridden = true;
        initial.AccreditationNumber = "CLINIC-SPECIFIC-ACC";
        initial.PmccNumber = "CLINIC-SPECIFIC-PMCC";
        initial.SoftwareCertificateId = "CLINIC-SPECIFIC-CERT";
        initial.KonsultaEndpoint = "/soap/clinic-specific";
        initial.IsPhilHealthConfigured = true;
        await db.SaveChangesAsync();

        var handler = new FacilityDirectoryUpdatedHandler(db, NullLogger<FacilityDirectoryUpdatedHandler>.Instance);

        var evt = CreateEvent(
            clinicId,
            TenantId,
            branchId: branchId,
            branchName: "Head Office Branch",
            branchAccreditation: "BRANCH-HQ-ACC",
            branchPmcc: "BRANCH-HQ-PMCC",
            branchCert: "BRANCH-HQ-CERT",
            branchEndpoint: "/soap/branch-hq",
            isAccredited: true);

        var context = CreateControlPlaneContext(InteropTypes.FacilityDirectoryUpdated, clinicId, TenantId, evt);

        await handler.HandleAsync(evt, context, CancellationToken.None);

        var settings = await db.ClinicSettings.IgnoreQueryFilters().SingleAsync(s => s.ClinicId == clinicId);

        // Stored branch baseline was updated
        settings.BranchId.Should().Be(branchId);
        settings.BranchName.Should().Be("Head Office Branch");
        settings.BranchPhilHealthAccreditationNumber.Should().Be("BRANCH-HQ-ACC");
        settings.BranchPmccNumber.Should().Be("BRANCH-HQ-PMCC");

        // Active clinic credentials were preserved!
        settings.IsPhilHealthOverridden.Should().BeTrue();
        settings.AccreditationNumber.Should().Be("CLINIC-SPECIFIC-ACC");
        settings.PmccNumber.Should().Be("CLINIC-SPECIFIC-PMCC");
        settings.SoftwareCertificateId.Should().Be("CLINIC-SPECIFIC-CERT");
        settings.KonsultaEndpoint.Should().Be("/soap/clinic-specific");
        settings.IsPhilHealthConfigured.Should().BeTrue();
    }

    [Fact]
    public async Task OverridePhilHealthSettingsCommand_ConfiguresProxyAndSetsOverrideFlag()
    {
        var clinicId = Guid.NewGuid();
        var clinicContext = Substitute.For<IClinicContext>();
        clinicContext.ClinicId.Returns(clinicId);
        clinicContext.TenantId.Returns(TenantId);

        var (db, uow, sieve) = TestDbHelper.CreateTestContext(clinicContext);
        var repo = new Repository<ClinicSettings>(db, sieve);

        var existing = MessagingTestKit.SeedClinic(db, clinicId, TenantId, "Clinic Test");
        existing.BranchPhilHealthAccreditationNumber = "BRANCH-BASELINE";
        existing.IsPhilHealthOverridden = false;
        await db.SaveChangesAsync();

        var statusResponse = new PhilHealthConfigStatusResponse(
            TenantId: clinicId,
            FacilityName: "Clinic Test",
            AccreditationNumber: "OVERRIDE-ACC-123",
            PmccNumber: "OVERRIDE-PMCC-456",
            SoftwareCertificateId: "OVERRIDE-CERT-789",
            KonsultaEndpoint: "/soap/custom-konsulta",
            IsConfigured: true,
            IsActive: true,
            UpdatedAt: DateTimeOffset.UtcNow);

        var proxyClient = Substitute.For<IPhilHealthProxyClient>();
        proxyClient.ConfigureTenantCredentialsAsync(Arg.Any<ConfigurePhilHealthCredentialsProxyRequest>(), Arg.Any<CancellationToken>())
            .Returns(ApiResponse<PhilHealthConfigStatusResponse>.Success(statusResponse));

        var handler = new OverridePhilHealthSettingsCommandHandler(repo, clinicContext, uow, proxyClient);

        var command = new OverridePhilHealthSettingsCommand(
            AccreditationNumber: "OVERRIDE-ACC-123",
            PmccNumber: "OVERRIDE-PMCC-456",
            SoftwareCertificateId: "OVERRIDE-CERT-789",
            Username: "custom_user",
            Password: "custom_password",
            CipherKey: "custom-cipher-key-32-chars-long!",
            KonsultaEndpoint: "/soap/custom-konsulta");

        var result = await handler.Handle(command, CancellationToken.None);

        result.IsPhilHealthOverridden.Should().BeTrue();
        result.IsPhilHealthConfigured.Should().BeTrue();
        result.AccreditationNumber.Should().Be("OVERRIDE-ACC-123");
        result.PmccNumber.Should().Be("OVERRIDE-PMCC-456");
        result.SoftwareCertificateId.Should().Be("OVERRIDE-CERT-789");
        result.KonsultaEndpoint.Should().Be("/soap/custom-konsulta");

        // Verify Proxy client was invoked
        await proxyClient.Received(1).ConfigureTenantCredentialsAsync(
            Arg.Is<ConfigurePhilHealthCredentialsProxyRequest>(r =>
                r.AccreditationNumber == "OVERRIDE-ACC-123" &&
                r.PmccNumber == "OVERRIDE-PMCC-456" &&
                r.SoftwareCertificateId == "OVERRIDE-CERT-789" &&
                r.Username == "custom_user"),
            Arg.Any<CancellationToken>());

        // Verify in DB
        var persisted = await db.ClinicSettings.IgnoreQueryFilters().SingleAsync(s => s.ClinicId == clinicId);
        persisted.IsPhilHealthOverridden.Should().BeTrue();
        persisted.AccreditationNumber.Should().Be("OVERRIDE-ACC-123");
    }

    [Fact]
    public async Task RevertPhilHealthToBranchCommand_ResetsOverrideAndReappliesBranchBaseline()
    {
        var clinicId = Guid.NewGuid();
        var clinicContext = Substitute.For<IClinicContext>();
        clinicContext.ClinicId.Returns(clinicId);
        clinicContext.TenantId.Returns(TenantId);

        var (db, uow, sieve) = TestDbHelper.CreateTestContext(clinicContext);
        var repo = new Repository<ClinicSettings>(db, sieve);

        var existing = MessagingTestKit.SeedClinic(db, clinicId, TenantId, "Clinic Test");
        existing.BranchId = Guid.NewGuid();
        existing.BranchName = "Branch HQ";
        existing.BranchPhilHealthAccreditationNumber = "BRANCH-ACCREDITATION-REVERT";
        existing.BranchPmccNumber = "BRANCH-PMCC-REVERT";
        existing.BranchSoftwareCertificateId = "BRANCH-CERT-REVERT";
        existing.BranchKonsultaEndpoint = "/soap/branch-revert";
        existing.IsBranchPhilHealthAccredited = true;

        // Currently overridden
        existing.IsPhilHealthOverridden = true;
        existing.AccreditationNumber = "OLD-CLINIC-OVERRIDE";
        existing.PmccNumber = "OLD-CLINIC-PMCC";
        existing.SoftwareCertificateId = "OLD-CLINIC-CERT";
        await db.SaveChangesAsync();

        var handler = new RevertPhilHealthToBranchCommandHandler(repo, clinicContext, uow);

        var result = await handler.Handle(new RevertPhilHealthToBranchCommand(), CancellationToken.None);

        result.IsPhilHealthOverridden.Should().BeFalse();
        result.IsPhilHealthConfigured.Should().BeTrue();
        result.AccreditationNumber.Should().Be("BRANCH-ACCREDITATION-REVERT");
        result.PmccNumber.Should().Be("BRANCH-PMCC-REVERT");
        result.SoftwareCertificateId.Should().Be("BRANCH-CERT-REVERT");
        result.KonsultaEndpoint.Should().Be("/soap/branch-revert");

        // Verify in DB
        var persisted = await db.ClinicSettings.IgnoreQueryFilters().SingleAsync(s => s.ClinicId == clinicId);
        persisted.IsPhilHealthOverridden.Should().BeFalse();
        persisted.AccreditationNumber.Should().Be("BRANCH-ACCREDITATION-REVERT");
    }
}
