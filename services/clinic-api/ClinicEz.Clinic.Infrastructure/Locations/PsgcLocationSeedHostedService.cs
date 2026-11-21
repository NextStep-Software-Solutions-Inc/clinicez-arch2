using System;
using System.Collections.Generic;
using System.Linq;
using System.Threading;
using System.Threading.Tasks;
using ClinicEz.Clinic.Domain.Entities;
using ClinicEz.Clinic.Infrastructure.Persistence;
using ClinicEz.Shared.Locations;
using Microsoft.EntityFrameworkCore;
using Microsoft.Extensions.Configuration;
using Microsoft.Extensions.DependencyInjection;
using Microsoft.Extensions.Hosting;
using Microsoft.Extensions.Logging;

namespace ClinicEz.Clinic.Infrastructure.Locations;

/// <summary>
/// Synchronizes the complete PSA 10-digit PSGC catalog into public."PsgcLocations" on relational databases
/// in the background without blocking startup readiness.
/// </summary>
public sealed class PsgcLocationSeedHostedService : BackgroundService
{
    private const int InsertBatchSize = 2000;

    private readonly IServiceProvider _services;
    private readonly IConfiguration _configuration;
    private readonly ILogger<PsgcLocationSeedHostedService> _logger;

    public PsgcLocationSeedHostedService(
        IServiceProvider services,
        IConfiguration configuration,
        ILogger<PsgcLocationSeedHostedService> logger)
    {
        _services = services;
        _configuration = configuration;
        _logger = logger;
    }

    protected override async Task ExecuteAsync(CancellationToken stoppingToken)
    {
        if (!_configuration.GetValue("PsgcCatalog:SeedOnBoot", true))
        {
            return;
        }

        try
        {
            using var scope = _services.CreateScope();
            var db = scope.ServiceProvider.GetRequiredService<ApplicationDbContext>();
            if (!db.Database.IsRelational())
            {
                return;
            }

            var catalog = PsgcReferenceCatalog.AllEntries;
            var existingCount = await db.PsgcLocations.CountAsync(stoppingToken);
            if (existingCount >= catalog.Count)
            {
                return;
            }

            // Reconcile any pre-existing partial seed rows first
            var existingEntities = await db.PsgcLocations.ToListAsync(stoppingToken);
            var existingCodes = new HashSet<string>(existingEntities.Count, StringComparer.Ordinal);
            var updatedExisting = 0;

            foreach (var entity in existingEntities)
            {
                existingCodes.Add(entity.PsgcCode);
                if (PsgcReferenceCatalog.ByCode.TryGetValue(entity.PsgcCode, out var canonical))
                {
                    var expectedLevel = ToDomainLevel(canonical.Level);
                    if (entity.Name != canonical.Name ||
                        entity.Level != expectedLevel ||
                        entity.ParentPsgcCode != canonical.ParentPsgcCode ||
                        entity.RegionPsgc != canonical.RegionPsgc ||
                        entity.ProvincePsgc != canonical.ProvincePsgc ||
                        entity.CityMunicipalityPsgc != canonical.CityMunicipalityPsgc ||
                        entity.ZipCode != canonical.ZipCode)
                    {
                        entity.Name = canonical.Name;
                        entity.Level = expectedLevel;
                        entity.ParentPsgcCode = canonical.ParentPsgcCode;
                        entity.RegionPsgc = canonical.RegionPsgc;
                        entity.ProvincePsgc = canonical.ProvincePsgc;
                        entity.CityMunicipalityPsgc = canonical.CityMunicipalityPsgc;
                        entity.ZipCode = canonical.ZipCode;
                        updatedExisting++;
                    }
                }
            }

            if (updatedExisting > 0)
            {
                await db.SaveChangesAsync(stoppingToken);
                db.ChangeTracker.Clear();
            }

            var missing = catalog
                .Where(e => !existingCodes.Contains(e.PsgcCode))
                .ToList();

            if (missing.Count == 0)
            {
                return;
            }

            _logger.LogInformation(
                "Backfilling {MissingCount} PSGC locations into PsgcLocations (existing: {ExistingCount}).",
                missing.Count,
                existingCount);

            for (var offset = 0; offset < missing.Count; offset += InsertBatchSize)
            {
                stoppingToken.ThrowIfCancellationRequested();

                using var batchScope = _services.CreateScope();
                var batchDb = batchScope.ServiceProvider.GetRequiredService<ApplicationDbContext>();
                batchDb.ChangeTracker.AutoDetectChangesEnabled = false;

                var batch = missing
                    .Skip(offset)
                    .Take(InsertBatchSize)
                    .Select(e => new PsgcLocation
                    {
                        Id = Guid.NewGuid(),
                        PsgcCode = e.PsgcCode,
                        Name = e.Name,
                        Level = ToDomainLevel(e.Level),
                        ParentPsgcCode = e.ParentPsgcCode,
                        RegionPsgc = e.RegionPsgc,
                        ProvincePsgc = e.ProvincePsgc,
                        CityMunicipalityPsgc = e.CityMunicipalityPsgc,
                        ZipCode = e.ZipCode,
                        IsActive = true
                    })
                    .ToList();

                await batchDb.PsgcLocations.AddRangeAsync(batch, stoppingToken);
                await batchDb.SaveChangesAsync(stoppingToken);
            }

            _logger.LogInformation("PSGC location catalog synchronized ({TotalCount} total entries).", catalog.Count);
        }
        catch (OperationCanceledException)
        {
            // Application shutting down
        }
        catch (Exception ex)
        {
            _logger.LogError(ex, "PSGC location catalog background sync encountered an error.");
        }
    }

    private static PsgcLevel ToDomainLevel(PsgcReferenceLevel level) => level switch
    {
        PsgcReferenceLevel.Region => PsgcLevel.Region,
        PsgcReferenceLevel.Province => PsgcLevel.Province,
        PsgcReferenceLevel.CityMunicipality => PsgcLevel.CityMunicipality,
        PsgcReferenceLevel.Barangay => PsgcLevel.Barangay,
        _ => PsgcLevel.Barangay
    };
}
