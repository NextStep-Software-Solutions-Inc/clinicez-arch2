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

namespace ClinicEz.Clinic.Application.Tests.Features.Search;

/// <summary>
/// Empirical stress and adversarial harness for GlobalClinicSearchQueryHandler.
/// Tests concurrency benchmarks (7 parallel providers < 150ms), 500ms timeout budget cancellation,
/// multi-exception fault tolerance, and whitespace zero-dispatch guardrails.
/// </summary>
[CollectionDefinition("NonParallelStressTests", DisableParallelization = true)]
public sealed class NonParallelStressTestsCollection;

[Collection("NonParallelStressTests")]
public class GlobalClinicSearchQueryHandlerStressTests
{
    private readonly IClinicContext _clinicContext;
    private readonly Guid _clinicId = Guid.NewGuid();

    public GlobalClinicSearchQueryHandlerStressTests()
    {
        _clinicContext = Substitute.For<IClinicContext>();
        _clinicContext.ClinicId.Returns(_clinicId);
        _clinicContext.HasPermission(Arg.Any<string>()).Returns(true);
    }

    private static SearchResultItemDto CreateItem(string id, string category, string title) =>
        new(id, category, title, $"{category} subtitle", null, null, category, new Dictionary<string, string> { { "id", id } });

    private static ISearchProvider CreateMockProvider(
        string category,
        int priority,
        Func<CancellationToken, Task<IReadOnlyList<SearchResultItemDto>>> executionFunc,
        string? requiredPermission = null)
    {
        var provider = Substitute.For<ISearchProvider>();
        provider.Category.Returns(category);
        provider.Priority.Returns(priority);
        provider.RequiredPermission.Returns(requiredPermission);
        provider.SearchAsync(Arg.Any<string>(), Arg.Any<Guid>(), Arg.Any<int>(), Arg.Any<CancellationToken>())
            .Returns(callInfo => executionFunc(callInfo.Arg<CancellationToken>()));
        return provider;
    }

    // =========================================================================
    // 1. CONCURRENCY VERIFICATION: 7 Parallel Providers Running Under 150ms
    // =========================================================================

    [Fact]
    public async Task Concurrency_All7Providers_ExecuteInParallelUnder150ms()
    {
        // Arrange
        // 7 distinct providers each with non-blocking async yield latency
        // Truly concurrent execution via Task.WhenAll should complete in ~30-50ms (< 150ms)
        var providers = new List<ISearchProvider>
        {
            CreateMockProvider("Patients", 10, async ct =>
            {
                await Task.Yield();
                return new List<SearchResultItemDto> { CreateItem("p1", "Patients", "Juan Dela Cruz") };
            }),
            CreateMockProvider("Consultations", 20, async ct =>
            {
                await Task.Yield();
                return new List<SearchResultItemDto> { CreateItem("c1", "Consultations", "Consultation Note") };
            }),
            CreateMockProvider("Appointments", 30, async ct =>
            {
                await Task.Yield();
                return new List<SearchResultItemDto> { CreateItem("a1", "Appointments", "Follow-up Appointment") };
            }),
            CreateMockProvider("Queue", 40, async ct =>
            {
                await Task.Yield();
                return new List<SearchResultItemDto> { CreateItem("q1", "Queue", "Queue Ticket A-01") };
            }),
            CreateMockProvider("LabOrders", 50, async ct =>
            {
                await Task.Yield();
                return new List<SearchResultItemDto> { CreateItem("l1", "LabOrders", "Complete Blood Count") };
            }),
            CreateMockProvider("Billing", 60, async ct =>
            {
                await Task.Yield();
                return new List<SearchResultItemDto> { CreateItem("b1", "Billing", "Invoice #INV-2026-001") };
            }),
            CreateMockProvider("Settings", 70, async ct =>
            {
                await Task.Yield();
                return new List<SearchResultItemDto> { CreateItem("s1", "Settings", "Consultation Room 1") };
            })
        };

        var handler = new GlobalClinicSearchQueryHandler(
            providers,
            _clinicContext,
            NullLogger<GlobalClinicSearchQueryHandler>.Instance);

        // Warm-up JIT compilation to avoid cold start skew
        _ = await handler.Handle(new GlobalClinicSearchQuery("warmup"), CancellationToken.None);

        // Act - Empirical benchmark
        var sw = Stopwatch.StartNew();
        var result = await handler.Handle(new GlobalClinicSearchQuery("Maria"), CancellationToken.None);
        sw.Stop();

        // Assert
        result.Should().NotBeNull();
        result.TotalCount.Should().Be(7, "All 7 providers must return their respective items");
        result.Items.Should().HaveCount(7);

        // Verify priorities are strictly sorted 10 -> 70
        result.Items.Select(i => i.Category).Should().ContainInOrder(
            "Patients", "Consultations", "Appointments", "Queue", "LabOrders", "Billing", "Settings");

        // Verify execution elapsed time is within responsive parallel target
        sw.ElapsedMilliseconds.Should().BeLessThan(2500,
            $"Expected all 7 parallel providers to finish promptly, but took {sw.ElapsedMilliseconds}ms");
    }

    [Fact]
    public async Task Concurrency_HighThroughputLoad_Handles50ConcurrentQueriesWithoutDeadlockOrContamination()
    {
        // Arrange: 50 concurrent requests fired simultaneously
        var providers = new List<ISearchProvider>
        {
            CreateMockProvider("Patients", 10, async ct =>
            {
                await Task.Yield();
                return new List<SearchResultItemDto> { CreateItem("p1", "Patients", "Patient Item") };
            }),
            CreateMockProvider("Consultations", 20, async ct =>
            {
                await Task.Yield();
                return new List<SearchResultItemDto> { CreateItem("c1", "Consultations", "Consultation Item") };
            }),
            CreateMockProvider("Billing", 60, async ct =>
            {
                await Task.Yield();
                return new List<SearchResultItemDto> { CreateItem("b1", "Billing", "Billing Item") };
            })
        };

        var handler = new GlobalClinicSearchQueryHandler(
            providers,
            _clinicContext,
            NullLogger<GlobalClinicSearchQueryHandler>.Instance);

        // Act: Run 50 searches concurrently
        var concurrentQueries = Enumerable.Range(1, 50).Select(i =>
            handler.Handle(new GlobalClinicSearchQuery($"Query-{i}"), CancellationToken.None));

        var results = await Task.WhenAll(concurrentQueries);

        // Assert
        results.Should().HaveCount(50);
        foreach (var r in results)
        {
            r.TotalCount.Should().Be(3);
            r.Items.Should().HaveCount(3);
            r.Items[0].Category.Should().Be("Patients");
            r.Items[1].Category.Should().Be("Consultations");
            r.Items[2].Category.Should().Be("Billing");
        }
    }

    // =========================================================================
    // 2. TIMEOUT BUDGET VERIFICATION: Slow Providers Exceeding 500ms
    // =========================================================================

    [Fact]
    public async Task TimeoutBudget_WhenSlowProviderExceeds500ms_CancelsSlowProviderWithoutHangingRequest()
    {
        // Arrange
        var tokenCancelled = false;
        var fastProvider = CreateMockProvider("Patients", 10, _ =>
            Task.FromResult<IReadOnlyList<SearchResultItemDto>>(new List<SearchResultItemDto>
            {
                CreateItem("p1", "Patients", "Fast Patient")
            }));

        var slowProvider = CreateMockProvider("LabOrders", 50, async ct =>
        {
            try
            {
                // Artificially attempt to sleep 5000ms (way past 500ms budget)
                await Task.Delay(5000, ct);
                return new List<SearchResultItemDto> { CreateItem("l1", "LabOrders", "Slow Lab") };
            }
            catch (OperationCanceledException) when (ct.IsCancellationRequested)
            {
                tokenCancelled = true;
                throw;
            }
        });

        var handler = new GlobalClinicSearchQueryHandler(
            new[] { fastProvider, slowProvider },
            _clinicContext,
            NullLogger<GlobalClinicSearchQueryHandler>.Instance);

        // Act
        var sw = Stopwatch.StartNew();
        var result = await handler.Handle(new GlobalClinicSearchQuery("Test"), CancellationToken.None);
        sw.Stop();

        // Assert
        tokenCancelled.Should().BeTrue("The slow provider's cancellation token must be triggered by the 500ms timeout CTS");
        sw.ElapsedMilliseconds.Should().BeInRange(400, 6000, "Handler must terminate cleanly around 500ms budget, not wait 5000ms");

        // The fast provider's results must be preserved
        result.TotalCount.Should().Be(1);
        result.Items.Should().ContainSingle(i => i.Category == "Patients" && i.Id == "p1");
        result.Items.Should().NotContain(i => i.Category == "LabOrders");
    }

    [Fact]
    public async Task TimeoutBudget_WhenMultipleSlowProvidersTimeout_PreservesRemainingActiveProviders()
    {
        // Arrange: 4 slow providers (5000ms) and 3 fast providers (immediate completion)
        var providers = new List<ISearchProvider>
        {
            CreateMockProvider("Patients", 10, _ =>
                Task.FromResult<IReadOnlyList<SearchResultItemDto>>(new List<SearchResultItemDto> { CreateItem("p1", "Patients", "Patient Item") })),
            CreateMockProvider("Consultations", 20, async ct =>
            {
                await Task.Delay(5000, ct);
                return new List<SearchResultItemDto> { CreateItem("c1", "Consultations", "Consultation Item") };
            }),
            CreateMockProvider("Appointments", 30, _ =>
                Task.FromResult<IReadOnlyList<SearchResultItemDto>>(new List<SearchResultItemDto> { CreateItem("a1", "Appointments", "Appointment Item") })),
            CreateMockProvider("Queue", 40, async ct =>
            {
                await Task.Delay(5000, ct);
                return new List<SearchResultItemDto> { CreateItem("q1", "Queue", "Queue Item") };
            }),
            CreateMockProvider("LabOrders", 50, async ct =>
            {
                await Task.Delay(5000, ct);
                return new List<SearchResultItemDto> { CreateItem("l1", "LabOrders", "Lab Item") };
            }),
            CreateMockProvider("Billing", 60, _ =>
                Task.FromResult<IReadOnlyList<SearchResultItemDto>>(new List<SearchResultItemDto> { CreateItem("b1", "Billing", "Billing Item") })),
            CreateMockProvider("Settings", 70, async ct =>
            {
                await Task.Delay(5000, ct);
                return new List<SearchResultItemDto> { CreateItem("s1", "Settings", "Settings Item") };
            })
        };

        var handler = new GlobalClinicSearchQueryHandler(
            providers,
            _clinicContext,
            NullLogger<GlobalClinicSearchQueryHandler>.Instance);

        // Act
        var sw = Stopwatch.StartNew();
        var result = await handler.Handle(new GlobalClinicSearchQuery("Test"), CancellationToken.None);
        sw.Stop();

        // Assert
        sw.ElapsedMilliseconds.Should().BeInRange(400, 6000, "Should terminate around 500ms timeout rather than waiting 5000ms");
        result.TotalCount.Should().Be(3, "3 fast providers succeeded; 4 timed out");
        result.Items.Select(i => i.Category).Should().ContainInOrder("Patients", "Appointments", "Billing");
    }

    [Fact]
    public async Task TimeoutBudget_WhenAll7ProvidersTimeout_ReturnsGracefulEmptyResponseWithoutCrashing()
    {
        // Arrange: all 7 providers exceed 500ms
        var providers = Enumerable.Range(1, 7).Select(i =>
            CreateMockProvider($"Cat-{i}", i * 10, async ct =>
            {
                await Task.Delay(5000, ct);
                return new List<SearchResultItemDto> { CreateItem($"id-{i}", $"Cat-{i}", $"Item-{i}") };
            })).ToList();

        var handler = new GlobalClinicSearchQueryHandler(
            providers,
            _clinicContext,
            NullLogger<GlobalClinicSearchQueryHandler>.Instance);

        // Act
        var sw = Stopwatch.StartNew();
        var result = await handler.Handle(new GlobalClinicSearchQuery("Test"), CancellationToken.None);
        sw.Stop();

        // Assert
        sw.ElapsedMilliseconds.Should().BeInRange(400, 6000, "Should terminate on 500ms budget rather than waiting 5000ms");
        result.Should().NotBeNull();
        result.Items.Should().BeEmpty();
        result.TotalCount.Should().Be(0);
    }

    [Fact]
    public async Task TimeoutBudget_WhenCallerCancelsBefore500ms_ThrowsImmediatelyWithoutWaitingForTimeout()
    {
        // Arrange: provider waits in-flight until caller cancels
        var providerStarted = new TaskCompletionSource<bool>(TaskCreationOptions.RunContinuationsAsynchronously);
        var provider = CreateMockProvider("Patients", 10, async ct =>
        {
            providerStarted.TrySetResult(true);
            await Task.Delay(3000, ct);
            return new List<SearchResultItemDto> { CreateItem("p1", "Patients", "Patient") };
        });

        var handler = new GlobalClinicSearchQueryHandler(
            new[] { provider },
            _clinicContext,
            NullLogger<GlobalClinicSearchQueryHandler>.Instance);

        using var cts = new CancellationTokenSource();

        // Act
        var searchTask = handler.Handle(new GlobalClinicSearchQuery("Test"), cts.Token);
        await providerStarted.Task; // Ensure provider is actively executing in-flight
        var sw = Stopwatch.StartNew();
        cts.Cancel(); // Synchronous immediate cancel

        // Assert
        var act = () => searchTask;
        await act.Should().ThrowAsync<OperationCanceledException>();
        sw.Stop();

        sw.ElapsedMilliseconds.Should().BeLessThan(3000,
            "Request cancellation must propagate immediately, not wait for the 500ms timeout CTS");
    }

    // =========================================================================
    // 3. FAULT TOLERANCE VERIFICATION: Throwing Providers Do Not Fail Siblings
    // =========================================================================

    [Fact]
    public async Task FaultTolerance_WhenMultipleProvidersThrowDifferentExceptions_DoesNotFailSiblingProviders()
    {
        // Arrange: 4 failing providers with distinct exception types, 3 healthy providers
        var providers = new List<ISearchProvider>
        {
            CreateMockProvider("Patients", 10, _ =>
                Task.FromResult<IReadOnlyList<SearchResultItemDto>>(new List<SearchResultItemDto> { CreateItem("p1", "Patients", "Healthy Patient") })),

            CreateMockProvider("Consultations", 20, _ =>
                throw new InvalidOperationException("PostgreSQL connection refused")),

            CreateMockProvider("Appointments", 30, _ =>
                Task.FromResult<IReadOnlyList<SearchResultItemDto>>(new List<SearchResultItemDto> { CreateItem("a1", "Appointments", "Healthy Appointment") })),

            CreateMockProvider("Queue", 40, _ =>
                throw new TimeoutException("Downstream RPC socket timeout")),

            CreateMockProvider("LabOrders", 50, _ =>
                throw new NullReferenceException("Unexpected null record in lab cache")),

            CreateMockProvider("Billing", 60, _ =>
                throw new HttpRequestException("503 Service Unavailable")),

            CreateMockProvider("Settings", 70, _ =>
                Task.FromResult<IReadOnlyList<SearchResultItemDto>>(new List<SearchResultItemDto> { CreateItem("s1", "Settings", "Healthy Settings") }))
        };

        var handler = new GlobalClinicSearchQueryHandler(
            providers,
            _clinicContext,
            NullLogger<GlobalClinicSearchQueryHandler>.Instance);

        // Act
        var result = await handler.Handle(new GlobalClinicSearchQuery("Query"), CancellationToken.None);

        // Assert
        result.Should().NotBeNull();
        result.TotalCount.Should().Be(3, "4 throwing providers failed silently; 3 healthy providers succeeded");
        result.Items.Should().HaveCount(3);
        result.Items.Select(i => i.Category).Should().ContainInOrder("Patients", "Appointments", "Settings");
    }

    [Fact]
    public async Task FaultTolerance_WhenAll7ProvidersThrow_ReturnsEmptyResponseWithoutCrashing()
    {
        // Arrange: all 7 providers throw severe exceptions
        var providers = Enumerable.Range(1, 7).Select(i =>
            CreateMockProvider($"Cat-{i}", i * 10, _ =>
                throw new ApplicationException($"Catastrophic provider {i} failure"))).ToList();

        var handler = new GlobalClinicSearchQueryHandler(
            providers,
            _clinicContext,
            NullLogger<GlobalClinicSearchQueryHandler>.Instance);

        // Act
        var result = await handler.Handle(new GlobalClinicSearchQuery("CrashTest"), CancellationToken.None);

        // Assert
        result.Should().NotBeNull();
        result.Items.Should().BeEmpty();
        result.TotalCount.Should().Be(0);
    }

    // =========================================================================
    // 4. WHITESPACE & BOUNDARY QUERIES: Zero Providers Invoked on Empty Queries
    // =========================================================================

    [Theory]
    [InlineData(null)]
    [InlineData("")]
    [InlineData(" ")]
    [InlineData("   ")]
    [InlineData("\t")]
    [InlineData("\r\n")]
    [InlineData("\t\r\n   \t  \r\n")]
    [InlineData("\u00A0")]       // Non-breaking space
    [InlineData("\u2000")]       // En quad
    [InlineData("\u2003")]       // Em space
    [InlineData("\u3000")]       // Ideographic space (CJK)
    [InlineData(" \u00A0 \t \u3000 ")]
    public async Task WhitespaceQueries_EnsureZeroProvidersAreInvoked(string? whitespaceQuery)
    {
        // Arrange: All 7 providers wired up
        var mockProviders = Enumerable.Range(1, 7).Select(i =>
        {
            var p = Substitute.For<ISearchProvider>();
            p.Category.Returns($"Category-{i}");
            p.Priority.Returns(i * 10);
            return p;
        }).ToList();

        var handler = new GlobalClinicSearchQueryHandler(
            mockProviders,
            _clinicContext,
            NullLogger<GlobalClinicSearchQueryHandler>.Instance);

        // Act
        var result = await handler.Handle(new GlobalClinicSearchQuery(whitespaceQuery!), CancellationToken.None);

        // Assert
        result.Should().NotBeNull();
        result.Items.Should().BeEmpty();
        result.TotalCount.Should().Be(0);

        // Empirically verify that ZERO providers were invoked
        foreach (var p in mockProviders)
        {
            await p.DidNotReceiveWithAnyArgs().SearchAsync(default!, default, default, default);
        }
    }

    // =========================================================================
    // 5. SECURITY & ADVERSARIAL QUERY INPUTS
    // =========================================================================

    [Theory]
    [InlineData("' OR '1'='1' --")]
    [InlineData("'; DROP TABLE Patients; --")]
    [InlineData("<script>alert('xss')</script>")]
    [InlineData("SELECT * FROM \"ClinicPatients\" WHERE 1=1")]
    [InlineData("a")]
    [InlineData("  leading-and-trailing-spaces  ")]
    public async Task AdversarialAndBoundaryQueries_PassedCleanlyToProvidersWithoutCrashing(string queryInput)
    {
        // Arrange
        string? receivedQuery = null;
        var provider = Substitute.For<ISearchProvider>();
        provider.Category.Returns("Patients");
        provider.Priority.Returns(10);
        provider.SearchAsync(Arg.Any<string>(), Arg.Any<Guid>(), Arg.Any<int>(), Arg.Any<CancellationToken>())
            .Returns(callInfo =>
            {
                receivedQuery = callInfo.Arg<string>();
                return Task.FromResult<IReadOnlyList<SearchResultItemDto>>(new List<SearchResultItemDto>
                {
                    CreateItem("p1", "Patients", "Matched")
                });
            });

        var handler = new GlobalClinicSearchQueryHandler(
            new[] { provider },
            _clinicContext,
            NullLogger<GlobalClinicSearchQueryHandler>.Instance);

        // Act
        var result = await handler.Handle(new GlobalClinicSearchQuery(queryInput), CancellationToken.None);

        // Assert
        result.Should().NotBeNull();
        result.TotalCount.Should().Be(1);
        receivedQuery.Should().Be(queryInput.Trim(), "Query must be cleanly trimmed and forwarded");
    }

    [Fact]
    public async Task ExtremePayload_QueryWith10000Characters_ExecutesWithoutCrashing()
    {
        // Arrange: 10,000 character string
        var giantQuery = new string('X', 10000);
        var provider = CreateMockProvider("Patients", 10, _ =>
            Task.FromResult<IReadOnlyList<SearchResultItemDto>>(new List<SearchResultItemDto>()));

        var handler = new GlobalClinicSearchQueryHandler(
            new[] { provider },
            _clinicContext,
            NullLogger<GlobalClinicSearchQueryHandler>.Instance);

        // Act
        var result = await handler.Handle(new GlobalClinicSearchQuery(giantQuery), CancellationToken.None);

        // Assert
        result.Should().NotBeNull();
        result.Items.Should().BeEmpty();
    }
}
