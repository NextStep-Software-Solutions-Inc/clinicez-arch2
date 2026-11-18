using System;
using System.Collections.Generic;
using System.Linq;
using System.Threading;
using System.Threading.Tasks;
using ClinicEz.Interop.Application;
using ClinicEz.Interop.Application.Abstractions;
using ClinicEz.Interop.Application.Bootstrap;
using ClinicEz.Interop.Application.Security;
using ClinicEz.Interop.Domain.Entities;
using ClinicEz.Shared.Common;
using ClinicEz.Shared.Interop;
using ClinicEz.Shared.Interop.Contracts;
using FluentAssertions;
using Microsoft.Extensions.Logging.Abstractions;
using Microsoft.Extensions.Options;
using Xunit;

namespace ClinicEz.Interop.Tests;

public class ChallengerM7HubBootstrapperTests
{
    private sealed class InMemoryClientStore : IClientStore
    {
        public readonly List<HubClient> Added = [];

        public Task<HubClient?> FindAsync(string clientId, CancellationToken ct) =>
            Task.FromResult(Added.FirstOrDefault(c => c.ClientId == clientId));

        public Task AddAsync(HubClient client, CancellationToken ct)
        {
            Added.Add(client);
            return Task.CompletedTask;
        }

        public Task UpdateAsync(HubClient client, CancellationToken ct) => Task.CompletedTask;

        public Task<bool> AnyActiveAsync(HubClientKind kind, CancellationToken ct) =>
            Task.FromResult(Added.Any(c => c.Kind == kind && !c.Revoked));
    }

    private sealed class InMemoryDirectoryStore : IDirectoryStore
    {
        public Task<HubCell?> GetCellAsync(string cellId, CancellationToken ct) =>
            Task.FromResult<HubCell?>(new HubCell { CellId = cellId, Name = "Test Cell", Kind = CellKind.Cloud, Active = true });

        public Task<HubFacility?> GetFacilityAsync(string tenantId, string facilityId, CancellationToken ct) => Task.FromResult<HubFacility?>(null);
        public Task<IReadOnlyList<string>> GetTenantsOfCellAsync(string cellId, CancellationToken ct) => Task.FromResult<IReadOnlyList<string>>([]);
        public Task<IReadOnlyList<HubLink>> GetActiveLinksBetweenAsync(string facilityKeyA, string facilityKeyB, CancellationToken ct) => Task.FromResult<IReadOnlyList<HubLink>>([]);
        public Task UpsertCellAsync(DirectoryCellUpsertedPayload cell, CancellationToken ct) => Task.CompletedTask;
        public Task UpsertFacilityAsync(DirectoryFacilityUpsertedPayload facility, CancellationToken ct) => Task.CompletedTask;
        public Task UpsertLinkAsync(DirectoryLinkUpsertedPayload link, CancellationToken ct) => Task.CompletedTask;
        public Task<IReadOnlyList<VisibleFacility>> QueryAsync(DirectoryQuery query, CancellationToken ct) => Task.FromResult<IReadOnlyList<VisibleFacility>>([]);
        public Task<long> GetVersionAsync(CancellationToken ct) => Task.FromResult(0L);
        public Task ApplySnapshotAsync(DirectorySnapshotDto snapshot, CancellationToken ct) => Task.CompletedTask;
        public Task<long> GetSnapshotCursorAsync(CancellationToken ct) => Task.FromResult(0L);
        public Task<DirectorySnapshotDto> BuildSnapshotAsync(IReadOnlyCollection<string> viewerTenants, string ownCellId, CancellationToken ct) =>
            Task.FromResult(new DirectorySnapshotDto(0L, false, [], [], []));
    }

    private static (HubBootstrapper bootstrapper, InMemoryClientStore clients, InMemoryDirectoryStore directory) CreateBootstrapper(
        HubOptions options)
    {
        var clients = new InMemoryClientStore();
        var directory = new InMemoryDirectoryStore();
        var opts = Options.Create(options);
        var time = TimeProvider.System;
        var bootstrapper = new HubBootstrapper(
            clients, directory, opts, time, NullLogger<HubBootstrapper>.Instance);

        return (bootstrapper, clients, directory);
    }

    [Fact]
    public async Task MediaBroker_Client8_PlatformServiceKindAndMediaService_IsAccepted()
    {
        var options = new HubOptions
        {
            Mode = HubMode.Cloud,
            Bootstrap = new BootstrapOptions
            {
                Cells = [new() { CellId = "cloud", Name = "Cloud", Kind = CellKind.Cloud }],
                Clients =
                [
                    new()
                    {
                        ClientId = "media-broker",
                        CellId = "cloud",
                        Service = "media",
                        Kind = HubClientKind.PlatformService,
                        Secret = "strong_secret_at_least_24_chars_long!!",
                        PublicKey = null
                    }
                ]
            }
        };

        var (bootstrapper, clients, _) = CreateBootstrapper(options);

        // Development mode
        await bootstrapper.ApplyAsync(isDevelopment: true, CancellationToken.None);

        clients.Added.Should().ContainSingle(c =>
            c.ClientId == "media-broker" &&
            c.Kind == HubClientKind.PlatformService &&
            c.Service == "media" &&
            c.CellId == "cloud");
    }

    [Fact]
    public async Task MediaBroker_ConfiguredAsCloudService_ThrowsInvalidOperationException()
    {
        // Media is a platform service, so Kind=CloudService must be rejected by HubBootstrapper
        var options = new HubOptions
        {
            Mode = HubMode.Cloud,
            Bootstrap = new BootstrapOptions
            {
                Cells = [new() { CellId = "cloud", Name = "Cloud", Kind = CellKind.Cloud }],
                Clients =
                [
                    new()
                    {
                        ClientId = "media-broker",
                        CellId = "cloud",
                        Service = "media",
                        Kind = HubClientKind.CloudService,
                        Secret = "strong_secret_at_least_24_chars_long!!"
                    }
                ]
            }
        };

        var (bootstrapper, _, _) = CreateBootstrapper(options);

        var act = () => bootstrapper.ApplyAsync(isDevelopment: true, CancellationToken.None);

        await act.Should().ThrowAsync<InvalidOperationException>()
            .WithMessage("*Kind=PlatformService is for exactly the platform services*");
    }

    [Fact]
    public async Task NonPlatformService_ConfiguredAsPlatformService_ThrowsInvalidOperationException()
    {
        // Clinic is not a platform service, so Kind=PlatformService must be rejected
        var options = new HubOptions
        {
            Mode = HubMode.Cloud,
            Bootstrap = new BootstrapOptions
            {
                Cells = [new() { CellId = "cloud", Name = "Cloud", Kind = CellKind.Cloud }],
                Clients =
                [
                    new()
                    {
                        ClientId = "clinic-fake-platform",
                        CellId = "cloud",
                        Service = "clinic",
                        Kind = HubClientKind.PlatformService,
                        Secret = "strong_secret_at_least_24_chars_long!!"
                    }
                ]
            }
        };

        var (bootstrapper, _, _) = CreateBootstrapper(options);

        var act = () => bootstrapper.ApplyAsync(isDevelopment: true, CancellationToken.None);

        await act.Should().ThrowAsync<InvalidOperationException>()
            .WithMessage("*Kind=PlatformService is for exactly the platform services*");
    }

    [Fact]
    public async Task OutsideDevelopment_ShortSecret_ThrowsInvalidOperationException()
    {
        var options = new HubOptions
        {
            Mode = HubMode.Cloud,
            Auth = new AuthOptions { MinBootstrapSecretLength = 24 },
            Bootstrap = new BootstrapOptions
            {
                Cells = [new() { CellId = "cloud", Name = "Cloud", Kind = CellKind.Cloud }],
                Clients =
                [
                    new()
                    {
                        ClientId = "media-broker",
                        CellId = "cloud",
                        Service = "media",
                        Kind = HubClientKind.PlatformService,
                        Secret = "short" // < 24 chars
                    }
                ]
            }
        };

        var (bootstrapper, _, _) = CreateBootstrapper(options);

        var act = () => bootstrapper.ApplyAsync(isDevelopment: false, CancellationToken.None);

        await act.Should().ThrowAsync<InvalidOperationException>()
            .WithMessage("*the secret must be at least 24 characters outside Development.*");
    }
}
