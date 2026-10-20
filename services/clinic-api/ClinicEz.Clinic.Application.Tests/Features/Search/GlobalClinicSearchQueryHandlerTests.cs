using System;
using System.Collections.Generic;
using System.Diagnostics;
using System.Linq;
using System.Threading;
using System.Threading.Tasks;
using ClinicEz.Clinic.Application.Features.Search.Queries;
using ClinicEz.Clinic.Domain.Constants;
using ClinicEz.Clinic.Domain.Interfaces;
using ClinicEz.Shared.Search;
using FluentAssertions;
using Microsoft.Extensions.Logging.Abstractions;
using NSubstitute;
using Xunit;

namespace ClinicEz.Clinic.Application.Tests.Features.Search;

public class GlobalClinicSearchQueryHandlerTests
{
    private readonly IClinicContext _clinicContext;
    private readonly Guid _clinicId = Guid.NewGuid();

    public GlobalClinicSearchQueryHandlerTests()
    {
        _clinicContext = Substitute.For<IClinicContext>();
        _clinicContext.ClinicId.Returns(_clinicId);
        _clinicContext.HasPermission(Arg.Any<string>()).Returns(true);
    }

    private static SearchResultItemDto CreateItem(string id, string category, string title) =>
        new(id, category, title, "Subtitle", null, null, category, new Dictionary<string, string> { { "id", id } });

    [Theory]
    [InlineData(null)]
    [InlineData("")]
    [InlineData("   ")]
    [InlineData("\t\n  ")]
    public async Task Handle_WhenQueryIsEmptyOrWhitespace_ReturnsEmptyResponseImmediately_WithoutCallingProviders(string? query)
    {
        // Arrange
        var provider = Substitute.For<ISearchProvider>();
        provider.Category.Returns("Patients");
        provider.Priority.Returns(10);

        var handler = new GlobalClinicSearchQueryHandler(
            new[] { provider },
            _clinicContext,
            NullLogger<GlobalClinicSearchQueryHandler>.Instance);

        // Act
        var result = await handler.Handle(new GlobalClinicSearchQuery(query!), CancellationToken.None);

        // Assert
        result.Should().NotBeNull();
        result.Items.Should().BeEmpty();
        result.TotalCount.Should().Be(0);
        await provider.DidNotReceiveWithAnyArgs().SearchAsync(default!, default, default, default);
    }

    [Theory]
    [InlineData("00000000-0000-0000-0000-000000000000")]
    [InlineData("00000000-0000-0000-0000-00000000dead")]
    public async Task Handle_WhenClinicContextIsUnauthenticatedOrDead_ReturnsEmptyResponse_WithoutCallingProviders(string clinicIdStr)
    {
        // Arrange
        var unauthenticatedContext = Substitute.For<IClinicContext>();
        unauthenticatedContext.ClinicId.Returns(Guid.Parse(clinicIdStr));

        var provider = Substitute.For<ISearchProvider>();
        provider.Category.Returns("Patients");

        var handler = new GlobalClinicSearchQueryHandler(
            new[] { provider },
            unauthenticatedContext,
            NullLogger<GlobalClinicSearchQueryHandler>.Instance);

        // Act
        var result = await handler.Handle(new GlobalClinicSearchQuery("Maria"), CancellationToken.None);

        // Assert
        result.Should().NotBeNull();
        result.Items.Should().BeEmpty();
        result.TotalCount.Should().Be(0);
        await provider.DidNotReceiveWithAnyArgs().SearchAsync(default!, default, default, default);
    }

    [Fact]
    public async Task Handle_WithMultipleProviders_ExecutesAllConcurrentlyViaTaskWhenAll()
    {
        // Arrange
        var provider1 = Substitute.For<ISearchProvider>();
        provider1.Category.Returns("Patients");
        provider1.Priority.Returns(10);
        provider1.SearchAsync(Arg.Any<string>(), Arg.Any<Guid>(), Arg.Any<int>(), Arg.Any<CancellationToken>())
            .Returns<Task<IReadOnlyList<SearchResultItemDto>>>(async _ =>
            {
                await Task.Delay(50);
                return (IReadOnlyList<SearchResultItemDto>)new List<SearchResultItemDto> { CreateItem("p1", "Patients", "Patient 1") };
            });

        var provider2 = Substitute.For<ISearchProvider>();
        provider2.Category.Returns("Consultations");
        provider2.Priority.Returns(20);
        provider2.SearchAsync(Arg.Any<string>(), Arg.Any<Guid>(), Arg.Any<int>(), Arg.Any<CancellationToken>())
            .Returns<Task<IReadOnlyList<SearchResultItemDto>>>(async _ =>
            {
                await Task.Delay(50);
                return (IReadOnlyList<SearchResultItemDto>)new List<SearchResultItemDto> { CreateItem("c1", "Consultations", "Consult 1") };
            });

        var handler = new GlobalClinicSearchQueryHandler(
            new[] { provider1, provider2 },
            _clinicContext,
            NullLogger<GlobalClinicSearchQueryHandler>.Instance);

        // Act
        var sw = Stopwatch.StartNew();
        var result = await handler.Handle(new GlobalClinicSearchQuery("Test"), CancellationToken.None);
        sw.Stop();

        // Assert
        result.TotalCount.Should().Be(2);
        result.Items.Should().HaveCount(2);
        sw.ElapsedMilliseconds.Should().BeLessThan(1500);
    }

    [Fact]
    public async Task Handle_WhenCategorySpecified_OnlyExecutesMatchingProvider_CaseInsensitive()
    {
        // Arrange
        var patientProvider = Substitute.For<ISearchProvider>();
        patientProvider.Category.Returns("Patients");
        patientProvider.Priority.Returns(10);
        patientProvider.SearchAsync(Arg.Any<string>(), Arg.Any<Guid>(), Arg.Any<int>(), Arg.Any<CancellationToken>())
            .Returns(Task.FromResult<IReadOnlyList<SearchResultItemDto>>(new List<SearchResultItemDto> { CreateItem("p1", "Patients", "Patient Maria") }));

        var billingProvider = Substitute.For<ISearchProvider>();
        billingProvider.Category.Returns("Billing");
        billingProvider.Priority.Returns(60);

        var handler = new GlobalClinicSearchQueryHandler(
            new[] { patientProvider, billingProvider },
            _clinicContext,
            NullLogger<GlobalClinicSearchQueryHandler>.Instance);

        // Act
        var result = await handler.Handle(new GlobalClinicSearchQuery("Maria", Category: "patients"), CancellationToken.None);

        // Assert
        result.TotalCount.Should().Be(1);
        result.Items[0].Category.Should().Be("Patients");
        await billingProvider.DidNotReceiveWithAnyArgs().SearchAsync(default!, default, default, default);
    }

    [Fact]
    public async Task Handle_WhenCategoryDoesNotExist_ReturnsEmptyResponse()
    {
        // Arrange
        var patientProvider = Substitute.For<ISearchProvider>();
        patientProvider.Category.Returns("Patients");

        var handler = new GlobalClinicSearchQueryHandler(
            new[] { patientProvider },
            _clinicContext,
            NullLogger<GlobalClinicSearchQueryHandler>.Instance);

        // Act
        var result = await handler.Handle(new GlobalClinicSearchQuery("Maria", Category: "NonExistentCategory"), CancellationToken.None);

        // Assert
        result.Items.Should().BeEmpty();
        result.TotalCount.Should().Be(0);
        await patientProvider.DidNotReceiveWithAnyArgs().SearchAsync(default!, default, default, default);
    }

    [Fact]
    public async Task Handle_WhenUserLacksRequiredPermission_SkipsProvider()
    {
        // Arrange
        _clinicContext.HasPermission(ClinicPermissions.BillingRead).Returns(false);
        _clinicContext.HasPermission(ClinicPermissions.PatientsRead).Returns(true);

        var patientProvider = Substitute.For<ISearchProvider>();
        patientProvider.Category.Returns("Patients");
        patientProvider.Priority.Returns(10);
        patientProvider.RequiredPermission.Returns(ClinicPermissions.PatientsRead);
        patientProvider.SearchAsync(Arg.Any<string>(), Arg.Any<Guid>(), Arg.Any<int>(), Arg.Any<CancellationToken>())
            .Returns(Task.FromResult<IReadOnlyList<SearchResultItemDto>>(new List<SearchResultItemDto> { CreateItem("p1", "Patients", "Patient 1") }));

        var billingProvider = Substitute.For<ISearchProvider>();
        billingProvider.Category.Returns("Billing");
        billingProvider.Priority.Returns(60);
        billingProvider.RequiredPermission.Returns(ClinicPermissions.BillingRead);

        var handler = new GlobalClinicSearchQueryHandler(
            new[] { patientProvider, billingProvider },
            _clinicContext,
            NullLogger<GlobalClinicSearchQueryHandler>.Instance);

        // Act
        var result = await handler.Handle(new GlobalClinicSearchQuery("INV-101"), CancellationToken.None);

        // Assert
        result.TotalCount.Should().Be(1);
        result.Items[0].Category.Should().Be("Patients");
        await billingProvider.DidNotReceiveWithAnyArgs().SearchAsync(default!, default, default, default);
    }

    [Fact]
    public async Task Handle_WhenOneProviderThrows_FaultToleranceProtectsOtherProviders()
    {
        // Arrange
        var goodProvider = Substitute.For<ISearchProvider>();
        goodProvider.Category.Returns("Patients");
        goodProvider.Priority.Returns(10);
        goodProvider.SearchAsync(Arg.Any<string>(), Arg.Any<Guid>(), Arg.Any<int>(), Arg.Any<CancellationToken>())
            .Returns(Task.FromResult<IReadOnlyList<SearchResultItemDto>>(new List<SearchResultItemDto> { CreateItem("p1", "Patients", "Maria Santos") }));

        var badProvider = Substitute.For<ISearchProvider>();
        badProvider.Category.Returns("LabOrders");
        badProvider.Priority.Returns(50);
        badProvider.SearchAsync(Arg.Any<string>(), Arg.Any<Guid>(), Arg.Any<int>(), Arg.Any<CancellationToken>())
            .Returns<Task<IReadOnlyList<SearchResultItemDto>>>(_ => throw new InvalidOperationException("Simulated database failure"));

        var handler = new GlobalClinicSearchQueryHandler(
            new[] { goodProvider, badProvider },
            _clinicContext,
            NullLogger<GlobalClinicSearchQueryHandler>.Instance);

        // Act
        var result = await handler.Handle(new GlobalClinicSearchQuery("Maria"), CancellationToken.None);

        // Assert
        result.TotalCount.Should().Be(1);
        result.Items[0].Id.Should().Be("p1");
    }

    [Fact]
    public async Task Handle_WhenProviderTimesOut_ReturnsSiblingResultsWithoutCrashing()
    {
        // Arrange
        var fastProvider = Substitute.For<ISearchProvider>();
        fastProvider.Category.Returns("Patients");
        fastProvider.Priority.Returns(10);
        fastProvider.SearchAsync(Arg.Any<string>(), Arg.Any<Guid>(), Arg.Any<int>(), Arg.Any<CancellationToken>())
            .Returns(Task.FromResult<IReadOnlyList<SearchResultItemDto>>(new List<SearchResultItemDto> { CreateItem("p1", "Patients", "Fast Patient") }));

        var slowProvider = Substitute.For<ISearchProvider>();
        slowProvider.Category.Returns("Consultations");
        slowProvider.Priority.Returns(20);
        slowProvider.SearchAsync(Arg.Any<string>(), Arg.Any<Guid>(), Arg.Any<int>(), Arg.Any<CancellationToken>())
            .Returns<Task<IReadOnlyList<SearchResultItemDto>>>(async callInfo =>
            {
                var ct = callInfo.Arg<CancellationToken>();
                await Task.Delay(1500, ct); // Will exceed 500ms timeout
                return (IReadOnlyList<SearchResultItemDto>)new List<SearchResultItemDto> { CreateItem("c1", "Consultations", "Slow Consult") };
            });

        var handler = new GlobalClinicSearchQueryHandler(
            new[] { fastProvider, slowProvider },
            _clinicContext,
            NullLogger<GlobalClinicSearchQueryHandler>.Instance);

        // Act
        var result = await handler.Handle(new GlobalClinicSearchQuery("Search"), CancellationToken.None);

        // Assert
        result.TotalCount.Should().Be(1);
        result.Items[0].Id.Should().Be("p1");
    }

    [Fact]
    public async Task Handle_SortsAggregatedItemsByProviderPriorityAscending()
    {
        // Arrange
        var providerP70 = Substitute.For<ISearchProvider>();
        providerP70.Category.Returns("Settings");
        providerP70.Priority.Returns(70);
        providerP70.SearchAsync(Arg.Any<string>(), Arg.Any<Guid>(), Arg.Any<int>(), Arg.Any<CancellationToken>())
            .Returns(Task.FromResult<IReadOnlyList<SearchResultItemDto>>(new List<SearchResultItemDto> { CreateItem("s1", "Settings", "Settings Room") }));

        var providerP10 = Substitute.For<ISearchProvider>();
        providerP10.Category.Returns("Patients");
        providerP10.Priority.Returns(10);
        providerP10.SearchAsync(Arg.Any<string>(), Arg.Any<Guid>(), Arg.Any<int>(), Arg.Any<CancellationToken>())
            .Returns(Task.FromResult<IReadOnlyList<SearchResultItemDto>>(new List<SearchResultItemDto> { CreateItem("p1", "Patients", "Patient Maria") }));

        var providerP30 = Substitute.For<ISearchProvider>();
        providerP30.Category.Returns("Appointments");
        providerP30.Priority.Returns(30);
        providerP30.SearchAsync(Arg.Any<string>(), Arg.Any<Guid>(), Arg.Any<int>(), Arg.Any<CancellationToken>())
            .Returns(Task.FromResult<IReadOnlyList<SearchResultItemDto>>(new List<SearchResultItemDto> { CreateItem("a1", "Appointments", "Appointment Visit") }));

        var handler = new GlobalClinicSearchQueryHandler(
            new[] { providerP70, providerP10, providerP30 },
            _clinicContext,
            NullLogger<GlobalClinicSearchQueryHandler>.Instance);

        // Act
        var result = await handler.Handle(new GlobalClinicSearchQuery("Query"), CancellationToken.None);

        // Assert
        result.TotalCount.Should().Be(3);
        result.Items[0].Category.Should().Be("Patients");
        result.Items[1].Category.Should().Be("Appointments");
        result.Items[2].Category.Should().Be("Settings");
    }

    [Fact]
    public async Task Handle_WhenCallerCancels_PropagatesOperationCanceledException()
    {
        // Arrange
        var provider = Substitute.For<ISearchProvider>();
        provider.Category.Returns("Patients");

        var handler = new GlobalClinicSearchQueryHandler(
            new[] { provider },
            _clinicContext,
            NullLogger<GlobalClinicSearchQueryHandler>.Instance);

        using var cts = new CancellationTokenSource();
        cts.Cancel(); // Already canceled by caller

        // Act & Assert
        await Assert.ThrowsAnyAsync<OperationCanceledException>(() =>
            handler.Handle(new GlobalClinicSearchQuery("Maria"), cts.Token));
    }
}
