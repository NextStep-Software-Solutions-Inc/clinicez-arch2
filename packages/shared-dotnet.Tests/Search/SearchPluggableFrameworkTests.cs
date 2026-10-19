using System;
using System.Collections.Generic;
using System.Linq;
using System.Reflection;
using System.Threading;
using System.Threading.Tasks;
using ClinicEz.Shared.Search;
using FluentAssertions;
using Microsoft.Extensions.DependencyInjection;
using Xunit;

namespace ClinicEz.Shared.Tests.Search;

#region Test Fixtures & Stub Providers

public abstract class AbstractTestSearchProvider : ISearchProvider
{
    public abstract string Category { get; }
    public abstract int Priority { get; }
    public virtual string? RequiredPermission => null;
    public abstract Task<IReadOnlyList<SearchResultItemDto>> SearchAsync(
        string query, Guid tenantId, int limit, CancellationToken ct);
}

public interface ICustomSearchProvider : ISearchProvider
{
}

public class OpenGenericSearchProvider<T> : ISearchProvider
{
    public string Category => "Generic";
    public int Priority => 99;
    public string? RequiredPermission => null;
    public Task<IReadOnlyList<SearchResultItemDto>> SearchAsync(
        string query, Guid tenantId, int limit, CancellationToken ct) =>
        Task.FromResult<IReadOnlyList<SearchResultItemDto>>(Array.Empty<SearchResultItemDto>());
}

public class ClosedGenericSearchProvider : OpenGenericSearchProvider<string>
{
}

public sealed class PatientStubSearchProvider : ISearchProvider
{
    public string Category => "Patients";
    public int Priority => 10;
    public string? RequiredPermission => "PatientsRead";

    public Task<IReadOnlyList<SearchResultItemDto>> SearchAsync(
        string query, Guid tenantId, int limit, CancellationToken ct)
    {
        ct.ThrowIfCancellationRequested();
        var results = new List<SearchResultItemDto>
        {
            new SearchResultItemDto(
                id: "pat-1",
                category: Category,
                title: $"Patient {query}",
                subtitle: $"Tenant: {tenantId}",
                badgeText: "VIP",
                badgeVariant: SearchBadgeVariant.Routine,
                targetRoute: "PatientDetail",
                routeParams: new Dictionary<string, string> { { "patientId", "pat-1" } }
            )
        };
        return Task.FromResult<IReadOnlyList<SearchResultItemDto>>(results);
    }
}

public sealed class ConsultationStubSearchProvider : ISearchProvider
{
    public string Category => "Consultations";
    public int Priority => 20;
    public string? RequiredPermission => null;

    public Task<IReadOnlyList<SearchResultItemDto>> SearchAsync(
        string query, Guid tenantId, int limit, CancellationToken ct)
    {
        ct.ThrowIfCancellationRequested();
        var results = new List<SearchResultItemDto>
        {
            new SearchResultItemDto(
                id: "enc-1",
                category: Category,
                title: $"Encounter for {query}",
                subtitle: "SOAP Note",
                badgeText: "STAT",
                badgeVariant: SearchBadgeVariant.Urgent,
                targetRoute: "ConsultationDetail",
                routeParams: new Dictionary<string, string> { { "encounterId", "enc-1" } }
            )
        };
        return Task.FromResult<IReadOnlyList<SearchResultItemDto>>(results);
    }
}

public sealed class AppointmentStubSearchProvider : ISearchProvider
{
    public string Category => "Appointments";
    public int Priority => 30;
    public string? RequiredPermission => null;

    public Task<IReadOnlyList<SearchResultItemDto>> SearchAsync(
        string query, Guid tenantId, int limit, CancellationToken ct)
    {
        ct.ThrowIfCancellationRequested();
        return Task.FromResult<IReadOnlyList<SearchResultItemDto>>(Array.Empty<SearchResultItemDto>());
    }
}

public sealed class PrivateConstructorStubSearchProvider : ISearchProvider
{
    private PrivateConstructorStubSearchProvider() { }

    public string Category => "PrivateStub";
    public int Priority => 999;
    public string? RequiredPermission => null;

    public Task<IReadOnlyList<SearchResultItemDto>> SearchAsync(
        string query, Guid tenantId, int limit, CancellationToken ct) =>
        Task.FromResult<IReadOnlyList<SearchResultItemDto>>(Array.Empty<SearchResultItemDto>());
}

#endregion

public class SearchPluggableFrameworkTests
{
    #region Assembly Scanning Tests

    [Fact]
    public void AddPluggableSearch_ScansAssembly_RegistersAllConcreteProviders()
    {
        var services = new ServiceCollection();

        services.AddPluggableSearch<SearchPluggableFrameworkTests>();
        using var provider = services.BuildServiceProvider();

        var providers = provider.GetServices<ISearchProvider>().ToList();

        providers.Should().NotBeEmpty();
        providers.Should().Contain(p => p is PatientStubSearchProvider);
        providers.Should().Contain(p => p is ConsultationStubSearchProvider);
        providers.Should().Contain(p => p is AppointmentStubSearchProvider);
        providers.Should().Contain(p => p is ClosedGenericSearchProvider);
    }

    [Fact]
    public void AddPluggableSearch_IgnoresAbstractClassesInterfacesAndOpenGenerics()
    {
        var services = new ServiceCollection();

        services.AddPluggableSearch<SearchPluggableFrameworkTests>();
        using var provider = services.BuildServiceProvider();

        var providers = provider.GetServices<ISearchProvider>().ToList();

        providers.Should().NotContain(p => p.GetType() == typeof(AbstractTestSearchProvider));
        services.Should().NotContain(d => d.ImplementationType == typeof(AbstractTestSearchProvider));
        services.Should().NotContain(d => d.ServiceType == typeof(ICustomSearchProvider));
        services.Should().NotContain(d => d.ImplementationType == typeof(OpenGenericSearchProvider<>));
    }

    [Fact]
    public void AddPluggableSearch_RegistersScopedLifetime()
    {
        var services = new ServiceCollection();
        services.AddPluggableSearch<SearchPluggableFrameworkTests>();

        var descriptor = services.First(d => d.ServiceType == typeof(ISearchProvider) && d.ImplementationType == typeof(PatientStubSearchProvider));
        descriptor.Lifetime.Should().Be(ServiceLifetime.Scoped);

        using var rootProvider = services.BuildServiceProvider();

        PatientStubSearchProvider instance1;
        PatientStubSearchProvider instance2;
        PatientStubSearchProvider instance3;

        using (var scope1 = rootProvider.CreateScope())
        {
            instance1 = (PatientStubSearchProvider)scope1.ServiceProvider.GetServices<ISearchProvider>().First(p => p is PatientStubSearchProvider);
            instance2 = (PatientStubSearchProvider)scope1.ServiceProvider.GetServices<ISearchProvider>().First(p => p is PatientStubSearchProvider);
            instance1.Should().BeSameAs(instance2, "Instances within the same scope should be identical");
        }

        using (var scope2 = rootProvider.CreateScope())
        {
            instance3 = (PatientStubSearchProvider)scope2.ServiceProvider.GetServices<ISearchProvider>().First(p => p is PatientStubSearchProvider);
            instance3.Should().NotBeSameAs(instance1, "Instances across different scopes must be distinct");
        }
    }

    [Fact]
    public void AddPluggableSearch_IsIdempotent_DoesNotDuplicateRegistrations()
    {
        var services = new ServiceCollection();

        // Call twice
        services.AddPluggableSearch<SearchPluggableFrameworkTests>();
        services.AddPluggableSearch<SearchPluggableFrameworkTests>();

        var patientDescriptors = services
            .Where(d => d.ServiceType == typeof(ISearchProvider) && d.ImplementationType == typeof(PatientStubSearchProvider))
            .ToList();

        patientDescriptors.Should().HaveCount(1, "Pluggable search registration must be idempotent");
    }

    [Fact]
    public void AddPluggableSearch_WithNullArguments_ThrowsArgumentNullException()
    {
        IServiceCollection nullServices = null!;
        Assembly nullAssembly = null!;

        var act1 = () => nullServices.AddPluggableSearch<SearchPluggableFrameworkTests>();
        act1.Should().Throw<ArgumentNullException>();

        var validServices = new ServiceCollection();
        var act2 = () => validServices.AddPluggableSearch(nullAssembly);
        act2.Should().Throw<ArgumentNullException>();
    }

    [Fact]
    public void AddPluggableSearch_AssemblyWithZeroProviders_SucceedsWithoutExceptions()
    {
        var services = new ServiceCollection();
        // typeof(string).Assembly (System.Private.CoreLib) contains no ISearchProvider implementations
        services.AddPluggableSearch(typeof(string).Assembly);

        services.Should().NotContain(d => d.ServiceType == typeof(ISearchProvider));
    }

    [Fact]
    public void AddPluggableSearch_IgnoresClassesWithNoPublicConstructors()
    {
        var services = new ServiceCollection();
        services.AddPluggableSearch<SearchPluggableFrameworkTests>();
        using var provider = services.BuildServiceProvider();

        var providers = provider.GetServices<ISearchProvider>().ToList();

        providers.Should().NotContain(p => p is PrivateConstructorStubSearchProvider);
        services.Should().NotContain(d => d.ImplementationType == typeof(PrivateConstructorStubSearchProvider));
        services.Should().NotContain(d => d.ServiceType == typeof(PrivateConstructorStubSearchProvider));
    }

    #endregion

    #region Provider Priority & Ordering Tests

    [Fact]
    public void Providers_WhenOrderedByPriority_RendersLowerPriorityNumbersFirst()
    {
        var services = new ServiceCollection();
        services.AddPluggableSearch<SearchPluggableFrameworkTests>();
        using var provider = services.BuildServiceProvider();

        var providers = provider.GetServices<ISearchProvider>()
            .Where(p => p is PatientStubSearchProvider or ConsultationStubSearchProvider or AppointmentStubSearchProvider)
            .OrderBy(p => p.Priority)
            .ToList();

        providers.Should().HaveCount(3);
        providers[0].Priority.Should().Be(10);
        providers[0].Category.Should().Be("Patients");
        providers[1].Priority.Should().Be(20);
        providers[1].Category.Should().Be("Consultations");
        providers[2].Priority.Should().Be(30);
        providers[2].Category.Should().Be("Appointments");
    }

    #endregion

    #region Provider Execution & Tenant Isolation Tests

    [Fact]
    public async Task Provider_SearchAsync_ReturnsExpectedResultsForTenant()
    {
        var provider = new PatientStubSearchProvider();
        var tenantId = Guid.NewGuid();

        var results = await provider.SearchAsync("Santos", tenantId, 10, CancellationToken.None);

        results.Should().HaveCount(1);
        results[0].Category.Should().Be("Patients");
        results[0].Title.Should().Be("Patient Santos");
        results[0].Subtitle.Should().Contain(tenantId.ToString());
        results[0].BadgeText.Should().Be("VIP");
        results[0].BadgeVariant.Should().Be("routine");
        results[0].Badge.Should().NotBeNull();
        results[0].Badge!.Text.Should().Be("VIP");
        results[0].TargetRoute.Should().Be("PatientDetail");
        results[0].RouteParams.Should().ContainKey("patientId").WhoseValue.Should().Be("pat-1");
    }

    [Fact]
    public async Task Provider_SearchAsync_WithCancellationToken_HonorsCancellation()
    {
        var provider = new PatientStubSearchProvider();
        using var cts = new CancellationTokenSource();
        cts.Cancel();

        var act = async () => await provider.SearchAsync("Santos", Guid.NewGuid(), 10, cts.Token);

        await act.Should().ThrowAsync<OperationCanceledException>();
    }

    [Fact]
    public async Task Provider_SearchAsync_WithSearchQueryRecord_OnConcreteClass_InvokesExtensionMethod()
    {
        var provider = new PatientStubSearchProvider();
        var tenantId = Guid.NewGuid();
        var query = new SearchQuery("Dela Cruz", "Patients", 15, tenantId);

        var results = await provider.SearchAsync(query, CancellationToken.None);

        results.Should().HaveCount(1);
        results[0].Title.Should().Be("Patient Dela Cruz");
        results[0].Subtitle.Should().Contain(tenantId.ToString());
    }

    [Fact]
    public async Task Provider_SearchAsync_WithSearchQueryRecord_OnInterface_DelegatesCorrectly()
    {
        ISearchProvider provider = new PatientStubSearchProvider();
        var tenantId = Guid.NewGuid();
        var query = new SearchQuery("Dela Cruz", "Patients", 15, tenantId);

        var results = await provider.SearchAsync(query, CancellationToken.None);

        results.Should().HaveCount(1);
        results[0].Title.Should().Be("Patient Dela Cruz");
        results[0].Subtitle.Should().Contain(tenantId.ToString());
    }

    [Fact]
    public async Task Provider_SearchAsync_WithSearchQueryRecord_DefaultCancellationToken_Succeeds()
    {
        var provider = new PatientStubSearchProvider();
        var query = new SearchQuery("Dela Cruz");

        var results = await provider.SearchAsync(query);

        results.Should().HaveCount(1);
        results[0].Title.Should().Be("Patient Dela Cruz");
    }

    [Fact]
    public async Task Provider_SearchAsync_ExtensionMethod_WithNullQuery_UsesDefaults()
    {
        var provider = new PatientStubSearchProvider();
        SearchQuery? query = null;

        var results = await provider.SearchAsync(query!);

        results.Should().HaveCount(1);
        results[0].Title.Should().Be("Patient ");
    }

    [Fact]
    public void SearchProviderExtensions_SearchAsync_WithNullProvider_ThrowsArgumentNullException()
    {
        ISearchProvider nullProvider = null!;
        var query = new SearchQuery("test");

        Action act = () => SearchProviderExtensions.SearchAsync(nullProvider, query);

        act.Should().Throw<ArgumentNullException>().WithParameterName("provider");
    }

    #endregion

    #region DTO Immutability & Value Semantics Tests

    [Fact]
    public void SearchResultItemDto_RecordValueEquality_HonorsImmutability()
    {
        var item1 = new SearchResultItemDto(
            id: "1",
            category: "Patients",
            title: "John Doe",
            subtitle: "35y Male",
            badgeText: "New",
            badgeVariant: SearchBadgeVariant.Routine,
            targetRoute: "PatientDetail",
            routeParams: null
        );

        var item2 = new SearchResultItemDto(
            id: "1",
            category: "Patients",
            title: "John Doe",
            subtitle: "35y Male",
            badgeText: "New",
            badgeVariant: SearchBadgeVariant.Routine,
            targetRoute: "PatientDetail",
            routeParams: null
        );

        item1.Should().Be(item2);
        (item1 == item2).Should().BeTrue();
        item1.GetHashCode().Should().Be(item2.GetHashCode());
    }

    [Fact]
    public void SearchResultItemDto_WithExpression_ClonesAndMutatesImmutably()
    {
        var original = new SearchResultItemDto(
            id: "1",
            category: "Patients",
            title: "Original Title",
            subtitle: "Subtitle",
            badgeText: "Routine",
            badgeVariant: SearchBadgeVariant.Routine,
            targetRoute: "PatientDetail"
        );

        var modified = original with { Title = "Updated Title" };

        original.Title.Should().Be("Original Title");
        modified.Title.Should().Be("Updated Title");
        modified.Id.Should().Be(original.Id);
        modified.Category.Should().Be(original.Category);
        modified.Should().NotBe(original);
    }

    [Fact]
    public void SearchResultItemDto_WithBadge_SynchronizesBadgeTextAndVariant()
    {
        var badge = new SearchBadgeDto("CRITICAL", SearchBadgeVariant.Emergency);

        var item = new SearchResultItemDto(
            id: "lab-101",
            category: "LabOrders",
            title: "Serum Potassium",
            subtitle: "Critical Panic Value 6.8 mmol/L",
            badgeText: null,
            badgeVariant: null,
            targetRoute: "LabResultReview",
            routeParams: new Dictionary<string, string> { { "orderId", "lab-101" } },
            badge: badge
        );

        item.Badge.Should().NotBeNull();
        item.Badge!.Text.Should().Be("CRITICAL");
        item.Badge.Variant.Should().Be(SearchBadgeVariant.Emergency);
        item.BadgeText.Should().Be("CRITICAL");
        item.BadgeVariant.Should().Be(SearchBadgeVariant.Emergency);
    }

    [Fact]
    public void SearchResultItemDto_WithNullBadge_InitializesCleanly()
    {
        var item = new SearchResultItemDto(
            id: "set-1",
            category: "Settings",
            title: "Rooms & Stations",
            subtitle: "Facility configuration",
            badgeText: null,
            badgeVariant: null,
            targetRoute: "Settings"
        );

        item.Badge.Should().BeNull();
        item.BadgeText.Should().BeNull();
        item.BadgeVariant.Should().BeNull();
        item.RouteParams.Should().BeNull();
    }

    [Fact]
    public void SearchResultItemDto_WithNullRequiredFields_ThrowsArgumentNullException()
    {
        var act1 = () => new SearchResultItemDto(null!, "Patients", "Title", "Sub", null, null, "Route");
        act1.Should().Throw<ArgumentNullException>().WithParameterName("id");

        var act2 = () => new SearchResultItemDto("id", null!, "Title", "Sub", null, null, "Route");
        act2.Should().Throw<ArgumentNullException>().WithParameterName("category");

        var act3 = () => new SearchResultItemDto("id", "Patients", null!, "Sub", null, null, "Route");
        act3.Should().Throw<ArgumentNullException>().WithParameterName("title");

        var act4 = () => new SearchResultItemDto("id", "Patients", "Title", "Sub", null, null, null!);
        act4.Should().Throw<ArgumentNullException>().WithParameterName("targetRoute");
    }

    #endregion

    #region SearchQuery Normalization & Boundaries Tests

    [Theory]
    [InlineData("  santos  ", "santos")]
    [InlineData("John", "John")]
    [InlineData("", "")]
    public void SearchQuery_NormalizesQueryCorrectly(string rawQuery, string expectedNormalized)
    {
        var query = new SearchQuery(rawQuery);
        query.NormalizedQuery.Should().Be(expectedNormalized);
    }

    [Theory]
    [InlineData("  Patients  ", "Patients")]
    [InlineData("", null)]
    [InlineData("   ", null)]
    [InlineData(null, null)]
    public void SearchQuery_NormalizesCategoryCorrectly(string? rawCategory, string? expectedCategory)
    {
        var query = new SearchQuery("test", rawCategory);
        query.Category.Should().Be(expectedCategory);
    }

    [Theory]
    [InlineData(0, SearchQuery.DefaultLimit)]
    [InlineData(-10, SearchQuery.DefaultLimit)]
    [InlineData(50, 50)]
    [InlineData(100, 100)]
    [InlineData(150, SearchQuery.MaxLimit)]
    public void SearchQuery_ClampsLimitCorrectly(int inputLimit, int expectedLimit)
    {
        var query = new SearchQuery("test", limit: inputLimit);
        query.Limit.Should().Be(expectedLimit);
    }

    [Fact]
    public void SearchQuery_IsEmpty_DetectsEmptyOrWhitespaceQuery()
    {
        new SearchQuery("").IsEmpty.Should().BeTrue();
        new SearchQuery("   ").IsEmpty.Should().BeTrue();
        new SearchQuery("santos").IsEmpty.Should().BeFalse();
    }

    #endregion

    #region SearchResponseDto Tests

    [Fact]
    public void SearchResponseDto_Empty_ReturnsEmptyArrayAndZeroCount()
    {
        var empty = SearchResponseDto.Empty;
        empty.Items.Should().BeEmpty();
        empty.TotalCount.Should().Be(0);
    }

    [Fact]
    public void SearchResponseDto_SingleArgumentConstructor_ComputesCountFromItems()
    {
        var items = new List<SearchResultItemDto>
        {
            new("1", "Patients", "Jane", "Sub", null, null, "Route")
        };

        var response = new SearchResponseDto(items);
        response.Items.Should().HaveCount(1);
        response.TotalCount.Should().Be(1);
    }

    #endregion

    #region SearchBadgeVariant Normalization Tests

    [Theory]
    [InlineData("routine", "routine")]
    [InlineData("ROUTINE", "routine")]
    [InlineData("urgent", "urgent")]
    [InlineData("Urgent", "urgent")]
    [InlineData("emergency", "emergency")]
    [InlineData("EMERGENCY", "emergency")]
    [InlineData("neutral", "neutral")]
    [InlineData("STAT", "neutral")]
    [InlineData("CRITICAL", "neutral")]
    [InlineData("invalid", "neutral")]
    [InlineData("", "neutral")]
    [InlineData(null, "neutral")]
    public void SearchBadgeVariant_Normalize_MapsExpectedVariants(string? input, string expected)
    {
        SearchBadgeVariant.Normalize(input).Should().Be(expected);
        SearchBadgeVariants.Normalize(input).Should().Be(expected);
    }

    [Theory]
    [InlineData("routine", true)]
    [InlineData("urgent", true)]
    [InlineData("emergency", true)]
    [InlineData("neutral", true)]
    [InlineData("stat", false)]
    [InlineData("unknown", false)]
    [InlineData(null, false)]
    public void SearchBadgeVariant_IsValid_IdentifiesValidVariants(string? input, bool expected)
    {
        SearchBadgeVariant.IsValid(input).Should().Be(expected);
        SearchBadgeVariants.IsValid(input).Should().Be(expected);
    }

    #endregion
}
