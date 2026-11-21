using System;
using System.Threading;
using System.Threading.Tasks;
using Microsoft.Extensions.Logging;

namespace ClinicEz.Clinic.Infrastructure.Persistence;

/// <summary>
/// Centralized database seeder facade coordinating schema seeding, canonical role seeding,
/// and development patient generation with unified CustomFields for ClinicEZ.
/// </summary>
public static class ClinicDbSeeder
{
    public static async Task<PatientSeedResult> SeedDevelopmentPatientsAsync(
        ApplicationDbContext dbContext,
        PatientSeedOptions options,
        ILogger? logger = null,
        CancellationToken ct = default)
    {
        return await DevPatientSeeder.SeedAsync(dbContext, options, logger, ct);
    }

    public static async Task SeedCanonicalRolesAsync(
        ApplicationDbContext dbContext,
        ILogger? logger = null,
        CancellationToken ct = default)
    {
        await ClinicRoleSeeder.SeedOrUpdateAllClinicsAsync(dbContext, logger, ct);
    }
}
