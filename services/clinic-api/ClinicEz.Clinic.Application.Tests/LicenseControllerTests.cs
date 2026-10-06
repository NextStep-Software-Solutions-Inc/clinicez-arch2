using System;
using System.Threading;
using System.Threading.Tasks;
using ClinicEz.Clinic.Api.Controllers;
using ClinicEz.Clinic.Domain.Entities;
using ClinicEz.Clinic.Domain.Interfaces;
using ClinicEz.Clinic.Infrastructure.Persistence;
using ClinicEz.Clinic.Infrastructure.Persistence.Repositories;
using ClinicEz.Shared.Licensing;
using Microsoft.AspNetCore.Mvc;
using Microsoft.EntityFrameworkCore;
using NSubstitute;
using Xunit;

namespace ClinicEz.Clinic.Application.Tests;

public class LicenseControllerTests
{
    private readonly FacilityLicenseSigner _signer = new();
    private readonly FacilityLicenseValidator _validator = new();

    [Fact]
    public async Task GetLicenseStatus_WhenTenantNotFound_Returns404NotFound()
    {
        var clinicContext = Substitute.For<IClinicContext>();
        clinicContext.TenantId.Returns("tenant1");
        clinicContext.ClinicId.Returns(Guid.Empty);

        var (context, uow, sieve) = TestDbHelper.CreateTestContext(clinicContext);
        var settingsRepo = new Repository<ClinicSettings>(context, sieve);
        var staffRepo = new Repository<StaffMember>(context, sieve);

        var tenantLookup = Substitute.For<ITenantLookupService>();
        tenantLookup.LookupAsync("tenant1", Arg.Any<CancellationToken>()).Returns((TenantLookupDto?)null);

        var controller = new LicenseController(settingsRepo, staffRepo, _validator, clinicContext, uow, tenantLookup);

        var result = await controller.GetLicenseStatus(CancellationToken.None);

        var notFoundResult = Assert.IsType<NotFoundObjectResult>(result.Result);
        Assert.Equal(404, notFoundResult.StatusCode);
    }

    [Fact]
    public async Task GetLicenseStatus_WhenTenantFound_WithoutExistingSettings_ReturnsActivationRequiredWithTenantName()
    {
        var tenantGuid = Guid.NewGuid();
        var clinicContext = Substitute.For<IClinicContext>();
        clinicContext.TenantId.Returns("apex-health-center");
        clinicContext.ClinicId.Returns(Guid.Empty);

        var (context, uow, sieve) = TestDbHelper.CreateTestContext(clinicContext);
        var settingsRepo = new Repository<ClinicSettings>(context, sieve);
        var staffRepo = new Repository<StaffMember>(context, sieve);

        var tenantLookup = Substitute.For<ITenantLookupService>();
        tenantLookup.LookupAsync("apex-health-center", Arg.Any<CancellationToken>())
            .Returns(new TenantLookupDto(tenantGuid, "apex-health-center", "Apex Health Center"));

        var controller = new LicenseController(settingsRepo, staffRepo, _validator, clinicContext, uow, tenantLookup);

        var result = await controller.GetLicenseStatus(CancellationToken.None);

        var okResult = Assert.IsType<OkObjectResult>(result.Result);
        var apiResponse = Assert.IsType<ClinicEz.Shared.Common.ApiResponse<FacilityLicenseStatusDto>>(okResult.Value);
        Assert.True(apiResponse.Succeeded);
        Assert.Equal("ActivationRequired", apiResponse.Data?.Status);
        Assert.Equal("Apex Health Center", apiResponse.Data?.ClinicName);
    }

    [Fact]
    public async Task ApplyLicense_WhenContextIsSlugAndTokenIssuedForTenantIdAndSlug_Succeeds()
    {
        var facilityId = Guid.NewGuid();
        var tenantGuid = Guid.NewGuid();
        var clinicContext = Substitute.For<IClinicContext>();
        clinicContext.TenantId.Returns("apex-health-center");
        clinicContext.ClinicId.Returns(facilityId);

        var (context, uow, sieve) = TestDbHelper.CreateTestContext(clinicContext);
        var settingsRepo = new Repository<ClinicSettings>(context, sieve);
        var staffRepo = new Repository<StaffMember>(context, sieve);

        var tenantLookup = Substitute.For<ITenantLookupService>();
        tenantLookup.LookupAsync("apex-health-center", Arg.Any<CancellationToken>())
            .Returns(new TenantLookupDto(tenantGuid, "apex-health-center", "Apex Health Center"));

        var token = _signer.SignLicense(new FacilityLicensePayload
        {
            FacilityId = facilityId,
            TenantId = tenantGuid.ToString(),
            TenantSlug = "apex-health-center",
            FacilityName = "Apex Health Facility",
            PlanTier = "Standard",
            Limits = new FacilityLimits { MaxStaff = 10 },
            IssuedAtUtc = DateTime.UtcNow,
            ExpiresAtUtc = DateTime.UtcNow.AddYears(1)
        });

        var controller = new LicenseController(settingsRepo, staffRepo, _validator, clinicContext, uow, tenantLookup);

        var result = await controller.ApplyLicense(new ApplyLicenseRequest(token), CancellationToken.None);

        var okResult = Assert.IsType<OkObjectResult>(result.Result);
        var apiResponse = Assert.IsType<ClinicEz.Shared.Common.ApiResponse<FacilityLicenseStatusDto>>(okResult.Value);
        Assert.True(apiResponse.Succeeded);
        Assert.Equal("Active", apiResponse.Data?.Status);
        Assert.Equal("Apex Health Facility", apiResponse.Data?.ClinicName);
        Assert.Equal(10, apiResponse.Data?.Limits.MaxStaff);
    }

    [Fact]
    public async Task ApplyLicense_WhenContextIsSlugAndTokenIssuedForDifferentTenant_ReturnsBadRequest()
    {
        var facilityId = Guid.NewGuid();
        var tenantGuidApex = Guid.NewGuid();
        var tenantGuidOther = Guid.NewGuid();

        var clinicContext = Substitute.For<IClinicContext>();
        clinicContext.TenantId.Returns("apex-health-center");
        clinicContext.ClinicId.Returns(facilityId);

        var (context, uow, sieve) = TestDbHelper.CreateTestContext(clinicContext);
        var settingsRepo = new Repository<ClinicSettings>(context, sieve);
        var staffRepo = new Repository<StaffMember>(context, sieve);

        var tenantLookup = Substitute.For<ITenantLookupService>();
        tenantLookup.LookupAsync("apex-health-center", Arg.Any<CancellationToken>())
            .Returns(new TenantLookupDto(tenantGuidApex, "apex-health-center", "Apex Health Center"));

        var token = _signer.SignLicense(new FacilityLicensePayload
        {
            FacilityId = facilityId,
            TenantId = tenantGuidOther.ToString(),
            TenantSlug = "other-tenant",
            FacilityName = "Other Facility",
            PlanTier = "Standard",
            IssuedAtUtc = DateTime.UtcNow,
            ExpiresAtUtc = DateTime.UtcNow.AddYears(1)
        });

        var controller = new LicenseController(settingsRepo, staffRepo, _validator, clinicContext, uow, tenantLookup);

        var result = await controller.ApplyLicense(new ApplyLicenseRequest(token), CancellationToken.None);

        var badRequestResult = Assert.IsType<BadRequestObjectResult>(result.Result);
        var apiResponse = Assert.IsType<ClinicEz.Shared.Common.ApiResponse<FacilityLicenseStatusDto>>(badRequestResult.Value);
        Assert.False(apiResponse.Succeeded);
        Assert.Contains("License tenant mismatch", apiResponse.Message);
    }

    [Fact]
    public async Task GetLicenseStatus_WhenIdentifierIsFacilitySlug_ResolvesFacilitySettingsSuccessfully()
    {
        var tenantGuid = Guid.NewGuid();
        var facilityId = Guid.NewGuid();
        var clinicContext = Substitute.For<IClinicContext>();
        clinicContext.TenantId.Returns("clinic-b");
        clinicContext.ClinicId.Returns(Guid.Empty);

        var (context, uow, sieve) = TestDbHelper.CreateTestContext(clinicContext);
        var settingsRepo = new Repository<ClinicSettings>(context, sieve);
        var staffRepo = new Repository<StaffMember>(context, sieve);

        // Pre-seed facility settings
        var token = _signer.SignLicense(new FacilityLicensePayload
        {
            FacilityId = facilityId,
            TenantId = tenantGuid.ToString(),
            TenantSlug = "apex-health-center",
            FacilityName = "Clinic B",
            PlanTier = "Standard",
            IssuedAtUtc = DateTime.UtcNow,
            ExpiresAtUtc = DateTime.UtcNow.AddYears(1)
        });

        await context.ClinicSettings.AddAsync(new ClinicSettings
        {
            Id = Guid.NewGuid(),
            TenantId = tenantGuid.ToString(),
            ClinicId = facilityId,
            ClinicName = "Clinic B",
            LicenseToken = token,
            PlanTier = "Standard",
            MaxStaffLimit = 15,
            LicenseExpiresAt = DateTime.UtcNow.AddYears(1)
        });
        await context.SaveChangesAsync();

        var tenantLookup = Substitute.For<ITenantLookupService>();
        tenantLookup.LookupAsync("clinic-b", Arg.Any<CancellationToken>())
            .Returns(new TenantLookupDto(tenantGuid, "apex-health-center", "Clinic B", facilityId, "clinic-b"));

        var controller = new LicenseController(settingsRepo, staffRepo, _validator, clinicContext, uow, tenantLookup);

        var result = await controller.GetLicenseStatus(CancellationToken.None);

        var okResult = Assert.IsType<OkObjectResult>(result.Result);
        var apiResponse = Assert.IsType<ClinicEz.Shared.Common.ApiResponse<FacilityLicenseStatusDto>>(okResult.Value);
        Assert.True(apiResponse.Succeeded);
        Assert.NotNull(apiResponse.Data);
        Assert.Equal("Active", apiResponse.Data.Status);
        Assert.Equal(facilityId, apiResponse.Data.ClinicId);
        Assert.Equal("Clinic B", apiResponse.Data.ClinicName);
    }
}
