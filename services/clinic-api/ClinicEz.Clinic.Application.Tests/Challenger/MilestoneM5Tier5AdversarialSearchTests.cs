using System;
using System.Collections.Generic;
using System.Diagnostics;
using System.Linq;
using System.Net.Http;
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

namespace ClinicEz.Clinic.Application.Tests.Challenger;

/// <summary>
/// Tier 5 White-Box Adversarial Stress Testing for GlobalClinicSearchQueryHandler and Domain Providers:
/// 1. Provider timeout cutoff: 5 out of 7 providers take >500ms; verify CTS cancellation and healthy survivors.
/// 2. Linked CTS cancellation: caller aborts query; verify immediate abort of in-flight provider tasks.
/// 3. Zero and negative limit arguments: verify fallback to DefaultLimit and provider bounded limit.
/// 4. Extremely long queries and SQL/Regex metacharacters across all domain queries.
/// 5. Cascading multi-exception fault tolerance with mixed failure modes (null returns, DB exceptions, timeouts).
/// </summary>
public class MilestoneM5Tier5AdversarialSearchTests
{
    private readonly IClinicContext _clinicContext;
    private readonly Guid _clinicId = Guid.NewGuid();

    public MilestoneM5Tier5AdversarialSearchTests()
    {
        _clinicContext = Substitute.For<IClinicContext>();
        _clinicContext.ClinicId.Returns(_clinicId);
        _clinicContext.HasPermission(Arg.Any<string>()).Returns(true);
    }

    private static SearchResultItemDto CreateItem(string id, string category, string title, string? badgeText = null, string? badgeVariant = null) =>
        new(id, category, title, $"{category} subtitle", badgeText, badgeVariant, category, new Dictionary<string, string> { { "id", id } });

    private static ISearchProvider CreateMockProvider(
        string category,
        int priority,
        Func<string, Guid, int, CancellationToken, Task<IReadOnlyList<SearchResultItemDto>>> executionFunc,
        string? requiredPermission = null)
    {
        var provider = Substitute.For<ISearchProvider>();
        provider.Category.Returns(category);
        provider.Priority.Returns(priority);
        provider.RequiredPermission.Returns(requiredPermission);
        provider.SearchAsync(Arg.Any<string>(), Arg.Any<Guid>(), Arg.Any<int>(), Arg.Any<CancellationToken>())
            .Returns(callInfo => executionFunc(
                callInfo.ArgAt<string>(0),
                callInfo.ArgAt<Guid>(1),
                callInfo.ArgAt<int>(2),
                callInfo.ArgAt<CancellationToken>(3)));
        return provider;
    }

    // =========================================================================
    // 1. PROVIDER TIMEOUT CUTOFF: 5 OF 7 PROVIDERS TAKE >500MS
    // =========================================================================

    [Fact]
    public async Task ProviderTimeoutCutoff_When5Of7ProvidersTakeOver500ms_CancelsSlowProvidersAndReturns2HealthySurvivors()
    {
        // Arrange: 5 slow providers (delay 3000ms listening to ct) and 2 healthy providers (delay 15ms)
        var cancelledCount = 0;

        Task<IReadOnlyList<SearchResultItemDto>> CreateSlowTask(string cat, CancellationToken ct) => Task.Run(async () =>
        {
            try
            {
                await Task.Delay(3000, ct);
                return (IReadOnlyList<SearchResultItemDto>)new List<SearchResultItemDto> { CreateItem($"slow-{cat}", cat, $"Slow {cat}") };
            }
            catch (OperationCanceledException) when (ct.IsCancellationRequested)
            {
                Interlocked.Increment(ref cancelledCount);
                throw;
            }
        }, ct);

        var providers = new List<ISearchProvider>
        {
            // 2 healthy / fast providers
            CreateMockProvider("Patients", 10, async (q, t, l, ct) =>
            {
                await Task.Delay(15, ct);
                return new List<SearchResultItemDto> { CreateItem("p1", "Patients", "Healthy Patient") };
            }),
            CreateMockProvider("Appointments", 30, async (q, t, l, ct) =>
            {
                await Task.Delay(20, ct);
                return new List<SearchResultItemDto> { CreateItem("a1", "Appointments", "Healthy Appointment") };
            }),

            // 5 slow providers exceeding 500ms
            CreateMockProvider("Consultations", 20, (q, t, l, ct) => CreateSlowTask("Consultations", ct)),
            CreateMockProvider("Queue", 40, (q, t, l, ct) => CreateSlowTask("Queue", ct)),
            CreateMockProvider("LabOrders", 50, (q, t, l, ct) => CreateSlowTask("LabOrders", ct)),
            CreateMockProvider("Billing", 60, (q, t, l, ct) => CreateSlowTask("Billing", ct)),
            CreateMockProvider("Settings", 70, (q, t, l, ct) => CreateSlowTask("Settings", ct))
        };

        var handler = new GlobalClinicSearchQueryHandler(
            providers,
            _clinicContext,
            NullLogger<GlobalClinicSearchQueryHandler>.Instance);

        // Act
        var sw = Stopwatch.StartNew();
        var response = await handler.Handle(new GlobalClinicSearchQuery("Maria"), CancellationToken.None);
        sw.Stop();

        // Assert
        // 1. Elapsed time must be bound near 500ms, strictly below 900ms, and never reach 3000ms
        sw.ElapsedMilliseconds.Should().BeInRange(480, 900,
            $"Expected handler to finish near 500ms timeout budget, but elapsed {sw.ElapsedMilliseconds}ms");

        // 2. Cancellation tokens for the 5 slow providers must have been triggered
        cancelledCount.Should().Be(5, "All 5 slow providers must have had their cancellation tokens triggered");

        // 3. Exactly the 2 healthy providers' results must be returned
        response.Should().NotBeNull();
        response.TotalCount.Should().Be(2);
        response.Items.Should().HaveCount(2);

        // 4. Results must be ordered by Priority (Patients = 10, Appointments = 30)
        response.Items[0].Category.Should().Be("Patients");
        response.Items[0].Id.Should().Be("p1");
        response.Items[1].Category.Should().Be("Appointments");
        response.Items[1].Id.Should().Be("a1");
    }

    [Fact]
    public async Task ProviderTimeoutCutoff_WhenProviderThrowsPrivateOperationCanceledException_IsolatedSafely()
    {
        // Scenario: A provider internally cancels its own task with a private CTS that has nothing to do
        // with the caller cancellation token or the timeout CTS.
        // It must be safely caught by generic Exception handler and not crash sibling providers.
        using var privateCts = new CancellationTokenSource();
        privateCts.Cancel();

        var providerWithPrivateCancel = CreateMockProvider("Consultations", 20, (q, t, l, ct) =>
        {
            // Throws OperationCanceledException with private token
            privateCts.Token.ThrowIfCancellationRequested();
            return Task.FromResult<IReadOnlyList<SearchResultItemDto>>(Array.Empty<SearchResultItemDto>());
        });

        var healthyProvider = CreateMockProvider("Patients", 10, (q, t, l, ct) =>
            Task.FromResult<IReadOnlyList<SearchResultItemDto>>(new List<SearchResultItemDto>
            {
                CreateItem("p1", "Patients", "Patient Item")
            }));

        var handler = new GlobalClinicSearchQueryHandler(
            new[] { healthyProvider, providerWithPrivateCancel },
            _clinicContext,
            NullLogger<GlobalClinicSearchQueryHandler>.Instance);

        // Act
        var response = await handler.Handle(new GlobalClinicSearchQuery("Test"), CancellationToken.None);

        // Assert
        response.Should().NotBeNull();
        response.TotalCount.Should().Be(1);
        response.Items[0].Id.Should().Be("p1");
    }

    // =========================================================================
    // 2. LINKED CTS CANCELLATION: CALLER ABORT PROPAGATION
    // =========================================================================

    [Fact]
    public async Task LinkedCts_WhenCallerCancelsDuringExecution_AbortsImmediatelyAndThrows()
    {
        // Arrange
        var providerReceivedCancellation = false;

        var provider = CreateMockProvider("Patients", 10, async (q, t, l, ct) =>
        {
            try
            {
                await Task.Delay(2000, ct);
                return new List<SearchResultItemDto> { CreateItem("p1", "Patients", "Patient") };
            }
            catch (OperationCanceledException) when (ct.IsCancellationRequested)
            {
                providerReceivedCancellation = true;
                throw;
            }
        });

        var handler = new GlobalClinicSearchQueryHandler(
            new[] { provider },
            _clinicContext,
            NullLogger<GlobalClinicSearchQueryHandler>.Instance);

        using var callerCts = new CancellationTokenSource();
        // Cancel after 50ms (well before 500ms timeout)
        callerCts.CancelAfter(50);

        // Act
        var sw = Stopwatch.StartNew();
        var act = () => handler.Handle(new GlobalClinicSearchQuery("Maria"), callerCts.Token);

        // Assert
        await act.Should().ThrowAsync<OperationCanceledException>();
        sw.Stop();

        sw.ElapsedMilliseconds.Should().BeLessThan(350,
            $"Expected immediate abort upon caller cancellation, but took {sw.ElapsedMilliseconds}ms");
        providerReceivedCancellation.Should().BeTrue("In-flight provider must receive cancellation via linked CTS");
    }

    [Fact]
    public async Task LinkedCts_WhenCallerTokenAlreadyCancelled_AbortsImmediatelyBeforeAnyProviderCalled()
    {
        // Arrange
        var provider = Substitute.For<ISearchProvider>();
        provider.Category.Returns("Patients");

        var handler = new GlobalClinicSearchQueryHandler(
            new[] { provider },
            _clinicContext,
            NullLogger<GlobalClinicSearchQueryHandler>.Instance);

        using var alreadyCancelledCts = new CancellationTokenSource();
        alreadyCancelledCts.Cancel();

        // Act
        var act = () => handler.Handle(new GlobalClinicSearchQuery("Maria"), alreadyCancelledCts.Token);

        // Assert
        await act.Should().ThrowAsync<OperationCanceledException>();
        await provider.DidNotReceiveWithAnyArgs().SearchAsync(default!, default, default, default);
    }

    // =========================================================================
    // 3. ZERO AND NEGATIVE LIMIT ARGUMENTS
    // =========================================================================

    [Theory]
    [InlineData(0, 20)]
    [InlineData(-1, 20)]
    [InlineData(-50, 20)]
    [InlineData(-9999, 20)]
    [InlineData(5, 5)]
    [InlineData(25, 25)]
    [InlineData(100, 100)]
    [InlineData(101, 100)] // Clamped to MaxLimit (100)
    [InlineData(5000, 100)] // Clamped to MaxLimit (100)
    public async Task LimitHandling_InGlobalClinicSearchQueryHandler_NormalizesCorrectly(int requestedLimit, int expectedLimitPassedToProvider)
    {
        // Arrange
        int capturedLimit = -1;
        var provider = CreateMockProvider("Patients", 10, (q, t, limit, ct) =>
        {
            capturedLimit = limit;
            return Task.FromResult<IReadOnlyList<SearchResultItemDto>>(new List<SearchResultItemDto>
            {
                CreateItem("p1", "Patients", "Patient Item")
            });
        });

        var handler = new GlobalClinicSearchQueryHandler(
            new[] { provider },
            _clinicContext,
            NullLogger<GlobalClinicSearchQueryHandler>.Instance);

        // Act
        var result = await handler.Handle(new GlobalClinicSearchQuery("Test", Limit: requestedLimit), CancellationToken.None);

        // Assert
        result.Should().NotBeNull();
        capturedLimit.Should().Be(expectedLimitPassedToProvider,
            $"For requested limit {requestedLimit}, provider must receive {expectedLimitPassedToProvider}");
    }

    // =========================================================================
    // 4. EXTREMELY LONG QUERIES AND SQL/REGEX METACHARACTERS
    // =========================================================================

    [Theory]
    // SQL Injection Metacharacters
    [InlineData("' OR '1'='1' --")]
    [InlineData("'; DROP TABLE \"ClinicPatients\"; --")]
    [InlineData("UNION SELECT null, null, null, null, null--")]
    [InlineData("admin'/*")]
    [InlineData("1' AND SLEEP(5)--")]
    [InlineData("1; EXEC xp_cmdshell('dir');--")]
    [InlineData("' UNION ALL SELECT table_name FROM information_schema.tables--")]
    // Regex Metacharacters
    [InlineData("^.*+?{}()|[]\\")]
    [InlineData("(?=.*a)")]
    [InlineData("[a-z0-9]")]
    [InlineData("\\d+")]
    [InlineData("\\b\\w+\\b")]
    [InlineData("(\\w+)\\s+\\1")]
    // Format Strings
    [InlineData("{0}")]
    [InlineData("{1}")]
    [InlineData("{{}}")]
    [InlineData("%s%s%s%s%s")]
    [InlineData("%d%d%d")]
    // Unicode, Diacritics, Philippine Names
    [InlineData("Parañaque")]
    [InlineData("Santo Niño")]
    [InlineData("Dela Peña")]
    [InlineData("José")]
    [InlineData("🏥 🦷 💊 🩺 💉")]
    [InlineData("مرحبا بالعالم")]
    [InlineData("שלום עולם")]
    [InlineData("你好世界")]
    [InlineData("こんにちは")]
    // Whitespace permutations
    [InlineData("   padded   query   ")]
    public async Task AdversarialQueryStrings_ExecuteCleanlyWithoutExceptions(string adversarialQuery)
    {
        // Arrange
        string capturedTerm = string.Empty;
        var provider = CreateMockProvider("Patients", 10, (term, t, limit, ct) =>
        {
            capturedTerm = term;
            return Task.FromResult<IReadOnlyList<SearchResultItemDto>>(new List<SearchResultItemDto>
            {
                CreateItem("p1", "Patients", $"Result for {term}")
            });
        });

        var handler = new GlobalClinicSearchQueryHandler(
            new[] { provider },
            _clinicContext,
            NullLogger<GlobalClinicSearchQueryHandler>.Instance);

        // Act
        var result = await handler.Handle(new GlobalClinicSearchQuery(adversarialQuery), CancellationToken.None);

        // Assert
        result.Should().NotBeNull();
        result.TotalCount.Should().Be(1);
        capturedTerm.Should().Be(adversarialQuery.Trim(),
            "Query must be cleanly trimmed and passed to provider as literal search term");
    }

    [Fact]
    public async Task ExtremePayload_QueryWith50000Characters_ExecutesCleanly()
    {
        // Arrange: 50,000 character string
        var giantQuery = new string('A', 50000);
        string capturedTerm = string.Empty;

        var provider = CreateMockProvider("Patients", 10, (term, t, limit, ct) =>
        {
            capturedTerm = term;
            return Task.FromResult<IReadOnlyList<SearchResultItemDto>>(new List<SearchResultItemDto>());
        });

        var handler = new GlobalClinicSearchQueryHandler(
            new[] { provider },
            _clinicContext,
            NullLogger<GlobalClinicSearchQueryHandler>.Instance);

        // Act
        var result = await handler.Handle(new GlobalClinicSearchQuery(giantQuery), CancellationToken.None);

        // Assert
        result.Should().NotBeNull();
        result.Items.Should().BeEmpty();
        capturedTerm.Length.Should().Be(50000);
    }

    // =========================================================================
    // 5. CASCADING MULTI-EXCEPTION FAULT TOLERANCE
    // =========================================================================

    [Fact]
    public async Task CascadingFaultTolerance_MixedFailuresAndSurvivingProviders()
    {
        // Arrange:
        // Provider 1: throws NullReferenceException
        // Provider 2: throws HttpRequestException
        // Provider 3: returns null instead of IReadOnlyList
        // Provider 4: times out (>500ms)
        // Provider 5: healthy, returns 2 items
        // Provider 6: healthy, returns 1 item
        var providers = new List<ISearchProvider>
        {
            CreateMockProvider("P1_NullRef", 10, (q, t, l, ct) => throw new NullReferenceException("Fatal null")),
            CreateMockProvider("P2_HttpFail", 20, (q, t, l, ct) => throw new HttpRequestException("503 Gateway")),
            CreateMockProvider("P3_NullReturn", 30, (q, t, l, ct) => Task.FromResult<IReadOnlyList<SearchResultItemDto>>(null!)),
            CreateMockProvider("P4_Timeout", 40, async (q, t, l, ct) =>
            {
                await Task.Delay(2500, ct);
                return new List<SearchResultItemDto> { CreateItem("t1", "P4_Timeout", "Timeout Item") };
            }),
            CreateMockProvider("P5_Healthy", 50, (q, t, l, ct) => Task.FromResult<IReadOnlyList<SearchResultItemDto>>(new List<SearchResultItemDto>
            {
                CreateItem("h1", "P5_Healthy", "Healthy Item 1"),
                CreateItem("h2", "P5_Healthy", "Healthy Item 2")
            })),
            CreateMockProvider("P6_Healthy", 60, (q, t, l, ct) => Task.FromResult<IReadOnlyList<SearchResultItemDto>>(new List<SearchResultItemDto>
            {
                CreateItem("h3", "P6_Healthy", "Healthy Item 3")
            }))
        };

        var handler = new GlobalClinicSearchQueryHandler(
            providers,
            _clinicContext,
            NullLogger<GlobalClinicSearchQueryHandler>.Instance);

        // Act
        var response = await handler.Handle(new GlobalClinicSearchQuery("StressTest"), CancellationToken.None);

        // Assert
        response.Should().NotBeNull();
        response.TotalCount.Should().Be(3);
        response.Items.Should().HaveCount(3);
        response.Items.Select(i => i.Id).Should().Equal("h1", "h2", "h3");
        response.Items.Select(i => i.Category).Should().Equal("P5_Healthy", "P5_Healthy", "P6_Healthy");
    }
}
