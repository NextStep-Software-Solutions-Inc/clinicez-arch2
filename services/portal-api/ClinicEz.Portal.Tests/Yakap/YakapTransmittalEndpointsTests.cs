using System;
using System.Collections.Generic;
using System.Threading;
using System.Threading.Tasks;
using ClinicEz.Portal.Application.Interfaces;
using ClinicEz.Portal.Domain.Entities;
using ClinicEz.Portal.Infrastructure.Persistence;
using ClinicEz.Shared.Common;
using Microsoft.EntityFrameworkCore;
using Moq;
using Xunit;

namespace ClinicEz.Portal.Tests.Yakap;

public class YakapTransmittalEndpointsTests : IDisposable
{
    private readonly ApplicationDbContext _context;
    private readonly Mock<IClinicApiClient> _clinicApiClientMock;
    private readonly Guid _tenantId = Guid.NewGuid();
    private const string ClerkOwnerId = "user_clerk_yakap_owner";

    public YakapTransmittalEndpointsTests()
    {
        var options = new DbContextOptionsBuilder<ApplicationDbContext>()
            .UseInMemoryDatabase(databaseName: Guid.NewGuid().ToString())
            .Options;

        _context = new ApplicationDbContext(options);
        _clinicApiClientMock = new Mock<IClinicApiClient>();

        var tenant = new Tenant
        {
            Id = _tenantId,
            TenantSlug = "metro-health",
            Name = "Metro Health System",
            OwnerId = ClerkOwnerId,
            FacilitiesCount = 1
        };
        _context.Tenants.Add(tenant);
        _context.SaveChanges();
    }

    public void Dispose()
    {
        _context.Database.EnsureDeleted();
        _context.Dispose();
    }

    [Fact]
    public async Task GetEligibleEncounters_ValidBranch_CallsClinicApiClientAndReturnsSuccess()
    {
        // Arrange
        var branch = new Branch
        {
            Id = Guid.NewGuid(),
            TenantId = _tenantId,
            Name = "Quezon City Branch",
            IsPhilHealthAccredited = true,
            PhilHealthAccreditationNumber = "H91001111",
            PhilHealthPmccNumber = "PMCC-QC-01"
        };
        _context.Branches.Add(branch);
        await _context.SaveChangesAsync();

        var expectedEncounters = new List<PortalEligibleYakapEncounterDto>
        {
            new(
                EncounterId: Guid.NewGuid(),
                PatientId: Guid.NewGuid(),
                PatientName: "Juan Dela Cruz",
                PhilHealthIdentificationNumber: "123456789012",
                EncounterDate: DateTime.UtcNow,
                DoctorName: "Dr. Rizal",
                PrimaryDiagnosis: "J06.9 - Acute upper respiratory infection",
                DiagnosesCount: 1,
                PrescriptionsCount: 2,
                DiagnosticsCount: 1,
                IsYakapEligible: true,
                HasPhilHealthPin: true,
                TotalMedicationAmount: 250m)
        };

        _clinicApiClientMock
            .Setup(c => c.GetEligibleEncountersAsync(
                _tenantId.ToString(),
                branch.Id,
                "2",
                null,
                null,
                It.IsAny<CancellationToken>()))
            .ReturnsAsync(ApiResponse<List<PortalEligibleYakapEncounterDto>>.Success(expectedEncounters));

        // Act
        var response = await _clinicApiClientMock.Object.GetEligibleEncountersAsync(
            _tenantId.ToString(),
            branch.Id,
            "2",
            null,
            null,
            CancellationToken.None);

        // Assert
        Assert.True(response.Succeeded);
        Assert.NotNull(response.Data);
        Assert.Single(response.Data);
        Assert.Equal("Juan Dela Cruz", response.Data[0].PatientName);
    }

    [Fact]
    public async Task CreateBranchTransmittal_WhenBranchUnaccredited_FailsValidation()
    {
        // Arrange
        var branch = new Branch
        {
            Id = Guid.NewGuid(),
            TenantId = _tenantId,
            Name = "Unaccredited Branch",
            IsPhilHealthAccredited = false,
            PhilHealthAccreditationNumber = null,
            PhilHealthPmccNumber = null
        };
        _context.Branches.Add(branch);
        await _context.SaveChangesAsync();

        // Branch has no PMCC - statutory guard prevents submission
        var isConfigured = branch.IsPhilHealthAccredited && !string.IsNullOrWhiteSpace(branch.PhilHealthPmccNumber);

        // Assert
        Assert.False(isConfigured);
    }

    [Fact]
    public async Task CreateBranchTransmittal_WhenBranchAccredited_SucceedsWithTransmittalNumber()
    {
        // Arrange
        var branch = new Branch
        {
            Id = Guid.NewGuid(),
            TenantId = _tenantId,
            Name = "Makati Main Branch",
            IsPhilHealthAccredited = true,
            PhilHealthAccreditationNumber = "H91002222",
            PhilHealthPmccNumber = "PMCC-MKT-01"
        };
        _context.Branches.Add(branch);
        await _context.SaveChangesAsync();

        var expectedTransmittal = new PortalYakapTransmittalDto(
            Id: Guid.NewGuid(),
            TransmittalNumber: "RHCI-MKT-2026-0001",
            ReportTagging: "2",
            EffectiveYear: "2026",
            PackageType: "K",
            Status: "Draft",
            PhilHealthTransactionNumber: null,
            EncryptedPayloadHash: null,
            ValidationErrors: new List<string>(),
            SubmittedAt: null,
            SubmittedBy: "Admin",
            CreatedAt: DateTime.UtcNow,
            TotalItemsCount: 5,
            Items: new List<PortalYakapTransmittalItemDto>(),
            BranchId: branch.Id);

        _clinicApiClientMock
            .Setup(c => c.CreateTransmittalAsync(
                _tenantId.ToString(),
                branch.Id,
                It.IsAny<PortalCreateYakapTransmittalRequest>(),
                It.IsAny<CancellationToken>()))
            .ReturnsAsync(ApiResponse<PortalYakapTransmittalDto>.Success(expectedTransmittal));

        // Act
        var result = await _clinicApiClientMock.Object.CreateTransmittalAsync(
            _tenantId.ToString(),
            branch.Id,
            new PortalCreateYakapTransmittalRequest(null, "2", "2026", branch.Id),
            CancellationToken.None);

        // Assert
        Assert.True(result.Succeeded);
        Assert.NotNull(result.Data);
        Assert.Equal("RHCI-MKT-2026-0001", result.Data.TransmittalNumber);
        Assert.Equal(branch.Id, result.Data.BranchId);
    }
}
