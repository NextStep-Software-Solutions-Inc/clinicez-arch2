using ClinicEz.Portal.Application.Features.Tenants.Commands.CreateTenant;
using ClinicEz.Portal.Domain.Entities;
using ClinicEz.Portal.Domain.Interfaces;
using FluentValidation;
using Moq;
using System;
using System.Linq.Expressions;
using System.Threading;
using System.Threading.Tasks;
using Xunit;

namespace ClinicEz.Portal.Tests.Tenants;

public class CreateTenantCommandHandlerTests
{
    private readonly Mock<IUnitOfWork> _unitOfWorkMock;
    private readonly Mock<ITenantRepository> _tenantRepoMock;
    private readonly CreateTenantCommandHandler _handler;

    public CreateTenantCommandHandlerTests()
    {
        _unitOfWorkMock = new Mock<IUnitOfWork>();
        _tenantRepoMock = new Mock<ITenantRepository>();

        _unitOfWorkMock.Setup(u => u.TenantRepository).Returns(_tenantRepoMock.Object);
        _handler = new CreateTenantCommandHandler(_unitOfWorkMock.Object);
    }

    [Fact]
    public async Task Handle_ValidRequest_CreatesTenantSuccessfully()
    {
        // Arrange
        var command = new CreateTenantCommand(
            OwnerId: "user_clerk_123",
            Name: "Metro Health Practice",
            TenantSlug: "metro-health",
            TenantType: "Workplace",
            FirstName: "Jane",
            LastName: "Doe",
            Email: "jane@metro.com"
        );

        // No existing owner tenant, no existing slug
        _tenantRepoMock
            .Setup(r => r.FindAsync(It.IsAny<Expression<Func<Tenant, bool>>>(), It.IsAny<CancellationToken>()))
            .ReturnsAsync((Tenant?)null);

        // Act
        var result = await _handler.Handle(command, CancellationToken.None);

        // Assert
        Assert.NotNull(result);
        Assert.Equal("metro-health", result.TenantSlug);
        Assert.Equal("Metro Health Practice", result.Name);
        Assert.Equal("Workplace", result.TenantType);

        _tenantRepoMock.Verify(r => r.AddAsync(It.Is<Tenant>(t => 
            t.OwnerId == "user_clerk_123" && 
            t.Name == "Metro Health Practice" &&
            t.TenantSlug == "metro-health" &&
            t.TenantType == "Workplace"
        ), It.IsAny<CancellationToken>()), Times.Once);

        _unitOfWorkMock.Verify(u => u.SaveChangesAsync(It.IsAny<CancellationToken>()), Times.Once);
    }

    [Fact]
    public async Task Handle_UserAlreadyHasTenant_ReturnsExistingTenantIdempotently()
    {
        // Arrange
        var existingTenant = new Tenant
        {
            OwnerId = "user_clerk_123",
            Name = "Existing Workplace",
            TenantSlug = "existing-workplace",
            TenantType = "Workplace"
        };

        var command = new CreateTenantCommand(
            OwnerId: "user_clerk_123",
            Name: "New Workplace Attempt",
            TenantSlug: "new-workplace"
        );

        _tenantRepoMock
            .Setup(r => r.FindAsync(It.IsAny<Expression<Func<Tenant, bool>>>(), It.IsAny<CancellationToken>()))
            .ReturnsAsync(existingTenant);

        // Act
        var result = await _handler.Handle(command, CancellationToken.None);

        // Assert
        Assert.NotNull(result);
        Assert.Equal("existing-workplace", result.TenantSlug);
        Assert.Equal("Existing Workplace", result.Name);

        _tenantRepoMock.Verify(r => r.AddAsync(It.IsAny<Tenant>(), It.IsAny<CancellationToken>()), Times.Never);
    }

    [Fact]
    public async Task Handle_SlugAlreadyTaken_ThrowsValidationException()
    {
        // Arrange
        var command = new CreateTenantCommand(
            OwnerId: "user_clerk_456",
            Name: "Another Practice",
            TenantSlug: "taken-slug"
        );

        var existingSlugTenant = new Tenant
        {
            OwnerId = "different_user",
            Name = "Taken Workplace",
            TenantSlug = "taken-slug"
        };

        // First call for OwnerId check returns null, second call for Slug check returns existing
        _tenantRepoMock
            .SetupSequence(r => r.FindAsync(It.IsAny<Expression<Func<Tenant, bool>>>(), It.IsAny<CancellationToken>()))
            .ReturnsAsync((Tenant?)null)
            .ReturnsAsync(existingSlugTenant);

        // Act & Assert
        var ex = await Assert.ThrowsAsync<ValidationException>(() => 
            _handler.Handle(command, CancellationToken.None));

        Assert.Contains("Workplace URL slug is already taken", ex.Message);
        _tenantRepoMock.Verify(r => r.AddAsync(It.IsAny<Tenant>(), It.IsAny<CancellationToken>()), Times.Never);
    }
}
