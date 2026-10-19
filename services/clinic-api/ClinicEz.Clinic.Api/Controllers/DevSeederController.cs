using System;
using System.Linq;
using System.Threading;
using System.Threading.Tasks;
using ClinicEz.Clinic.Domain.Entities;
using ClinicEz.Clinic.Domain.Interfaces;
using ClinicEz.Clinic.Infrastructure.Context;
using ClinicEz.Clinic.Infrastructure.Persistence;
using ClinicEz.Shared.Common;
using Microsoft.AspNetCore.Authorization;
using Microsoft.AspNetCore.Hosting;
using Microsoft.AspNetCore.Mvc;
using Microsoft.EntityFrameworkCore;
using Microsoft.Extensions.Hosting;
using Microsoft.Extensions.Logging;

namespace ClinicEz.Clinic.Api.Controllers;

[ApiController]
[Route("api/v1/dev")]
public sealed class DevSeederController : ControllerBase
{
    private readonly ApplicationDbContext _dbContext;
    private readonly IClinicContext _clinicContext;
    private readonly IWebHostEnvironment _env;
    private readonly ILogger<DevSeederController> _logger;

    public DevSeederController(
        ApplicationDbContext dbContext,
        IClinicContext clinicContext,
        IWebHostEnvironment env,
        ILogger<DevSeederController> logger)
    {
        _dbContext = dbContext;
        _clinicContext = clinicContext;
        _env = env;
        _logger = logger;
    }

    private bool IsDevAuthorized() =>
        _env.IsDevelopment() || _env.IsEnvironment("Testing") || _env.IsEnvironment("Local");

    private Guid? ResolveClinicId(Guid? explicitClinicId)
    {
        if (explicitClinicId.HasValue && explicitClinicId.Value != Guid.Empty)
            return explicitClinicId.Value;

        if (_clinicContext.ClinicId != Guid.Empty && _clinicContext.ClinicId != ClinicContext.UnauthenticatedClinicId)
            return _clinicContext.ClinicId;

        if (Request.Headers.TryGetValue("X-Clinic-Id", out var headerVal) &&
            Guid.TryParse(headerVal.ToString(), out var headerGuid) &&
            headerGuid != Guid.Empty && headerGuid != ClinicContext.UnauthenticatedClinicId)
            return headerGuid;

        return null;
    }

    private string? ResolveTenantId(string? explicitTenantId)
    {
        if (!string.IsNullOrWhiteSpace(explicitTenantId))
            return explicitTenantId;

        if (!string.IsNullOrWhiteSpace(_clinicContext.TenantId) && _clinicContext.TenantId != "tenant_default")
            return _clinicContext.TenantId;

        if (Request.Headers.TryGetValue("X-Tenant-Id", out var headerVal) &&
            !string.IsNullOrWhiteSpace(headerVal.ToString()))
            return headerVal.ToString();

        return !string.IsNullOrWhiteSpace(_clinicContext.TenantId) ? _clinicContext.TenantId : null;
    }

    /// <summary>
    /// Seeds 1,000+ realistic development patient records with random demographics,
    /// complete medical histories (past, family, social, surgical, reproductive, physical exam, allergies, problems, immunizations),
    /// encounters, prescriptions, and official medical certificates for capacity and scalability testing.
    /// Strictly scoped to the clinic triggering the request.
    /// </summary>
    [HttpPost("seed-patients")]
    [AllowAnonymous]
    public async Task<ActionResult<ApiResponse<PatientSeedResult>>> SeedPatients(
        [FromQuery] int count = 1000,
        [FromQuery] bool clearExisting = false,
        [FromQuery] string? tenantId = null,
        [FromQuery] Guid? clinicId = null,
        CancellationToken ct = default)
    {
        if (!IsDevAuthorized())
        {
            return StatusCode(StatusCodes.Status403Forbidden,
                ApiResponse<PatientSeedResult>.Fail("Data seeding endpoints are restricted to development and testing environments."));
        }

        if (count < 1 || count > 20000)
        {
            return BadRequest(ApiResponse<PatientSeedResult>.Fail("Patient count must be between 1 and 20,000."));
        }

        var resolvedClinicId = ResolveClinicId(clinicId);
        var resolvedTenantId = ResolveTenantId(tenantId);

        _logger.LogInformation("[DevSeeder] Received request to seed {Count} patients for Clinic: {ClinicId} (Tenant: {TenantId}, ClearExisting: {ClearExisting})...",
            count, resolvedClinicId, resolvedTenantId, clearExisting);

        var options = new PatientSeedOptions
        {
            Count = count,
            ClearExistingSeededPatients = clearExisting,
            TenantId = resolvedTenantId,
            ClinicId = resolvedClinicId
        };

        var result = await DevPatientSeeder.SeedAsync(_dbContext, options, _logger, ct);

        return Ok(ApiResponse<PatientSeedResult>.Success(
            result,
            $"Successfully seeded {result.PatientsCreated:N0} patients with {result.EncountersCreated:N0} encounters, {result.PrescriptionsCreated:N0} prescriptions, and {result.MedicalCertificatesCreated:N0} medical certificates in {result.Elapsed.TotalSeconds:F2}s for clinic {result.ClinicId}."));
    }

    /// <summary>
    /// Retrieves current clinical record counts for the active clinic to verify capacity and database scalability.
    /// </summary>
    [HttpGet("seed-status")]
    [AllowAnonymous]
    public async Task<ActionResult<ApiResponse<object>>> GetSeedStatus(
        [FromQuery] Guid? clinicId = null,
        CancellationToken ct = default)
    {
        if (!IsDevAuthorized())
        {
            return StatusCode(StatusCodes.Status403Forbidden,
                ApiResponse<object>.Fail("Development endpoints are restricted to development environments."));
        }

        var targetClinicId = ResolveClinicId(clinicId);

        IQueryable<ClinicPatient> patientsQuery = _dbContext.Patients.IgnoreQueryFilters();
        IQueryable<ConsultationEncounter> encountersQuery = _dbContext.Consultations.IgnoreQueryFilters();
        IQueryable<PrescriptionItem> prescriptionsQuery = _dbContext.Prescriptions.IgnoreQueryFilters();
        IQueryable<MedicalCertificate> medCertsQuery = _dbContext.MedicalCertificates.IgnoreQueryFilters();
        IQueryable<PatientPastMedicalHistory> pastHistoriesQuery = _dbContext.PatientPastMedicalHistories.IgnoreQueryFilters();
        IQueryable<PatientFamilyHistory> familyHistoriesQuery = _dbContext.PatientFamilyHistories.IgnoreQueryFilters();
        IQueryable<PatientSocialHistory> socialHistoriesQuery = _dbContext.PatientSocialHistories.IgnoreQueryFilters();
        IQueryable<PatientSurgicalHistory> surgicalHistoriesQuery = _dbContext.PatientSurgicalHistories.IgnoreQueryFilters();
        IQueryable<PatientReproductiveHistory> reproHistoriesQuery = _dbContext.PatientReproductiveHistories.IgnoreQueryFilters();
        IQueryable<PatientAllergy> allergiesQuery = _dbContext.PatientAllergies.IgnoreQueryFilters();
        IQueryable<PatientProblem> problemsQuery = _dbContext.PatientProblems.IgnoreQueryFilters();
        IQueryable<PatientImmunization> immunizationsQuery = _dbContext.PatientImmunizations.IgnoreQueryFilters();

        if (targetClinicId.HasValue && targetClinicId.Value != Guid.Empty)
        {
            var cid = targetClinicId.Value;
            patientsQuery = patientsQuery.Where(p => p.ClinicId == cid);
            encountersQuery = encountersQuery.Where(c => c.ClinicId == cid);
            prescriptionsQuery = prescriptionsQuery.Where(pr => encountersQuery.Select(e => e.Id).Contains(pr.ConsultationEncounterId));
            medCertsQuery = medCertsQuery.Where(m => m.ClinicId == cid);
            pastHistoriesQuery = pastHistoriesQuery.Where(h => h.ClinicId == cid);
            familyHistoriesQuery = familyHistoriesQuery.Where(h => h.ClinicId == cid);
            socialHistoriesQuery = socialHistoriesQuery.Where(h => h.ClinicId == cid);
            surgicalHistoriesQuery = surgicalHistoriesQuery.Where(h => h.ClinicId == cid);
            reproHistoriesQuery = reproHistoriesQuery.Where(h => h.ClinicId == cid);
            allergiesQuery = allergiesQuery.Where(a => a.ClinicId == cid);
            problemsQuery = problemsQuery.Where(p => p.ClinicId == cid);
            immunizationsQuery = immunizationsQuery.Where(i => i.ClinicId == cid);
        }

        var totalPatients = await patientsQuery.CountAsync(ct);
        var seededPatients = await patientsQuery.CountAsync(p =>
            p.CreatedBy == "System:DevPatientSeeder" ||
            p.CreatedBy == "seeder" ||
            p.CreatedBy == "System:DevSeeder" ||
            p.PatientCode.StartsWith("PAT-") ||
            (p.Email != null && p.Email.Contains("@clinicez.ph")), ct);
        var totalEncounters = await encountersQuery.CountAsync(ct);
        var totalPrescriptions = await prescriptionsQuery.CountAsync(ct);
        var totalMedCerts = await medCertsQuery.CountAsync(ct);
        var totalPastHistories = await pastHistoriesQuery.CountAsync(ct);
        var totalFamilyHistories = await familyHistoriesQuery.CountAsync(ct);
        var totalSocialHistories = await socialHistoriesQuery.CountAsync(ct);
        var totalSurgicalHistories = await surgicalHistoriesQuery.CountAsync(ct);
        var totalReproductiveHistories = await reproHistoriesQuery.CountAsync(ct);
        var totalAllergies = await allergiesQuery.CountAsync(ct);
        var totalProblems = await problemsQuery.CountAsync(ct);
        var totalImmunizations = await immunizationsQuery.CountAsync(ct);

        return Ok(ApiResponse<object>.Success(new
        {
            clinicId = targetClinicId,
            tenantId = ResolveTenantId(null),
            totalPatients,
            seededPatients,
            totalEncounters,
            totalPrescriptions,
            totalMedCerts,
            medicalHistories = new
            {
                pastMedicalHistories = totalPastHistories,
                familyHistories = totalFamilyHistories,
                socialHistories = totalSocialHistories,
                surgicalHistories = totalSurgicalHistories,
                reproductiveHistories = totalReproductiveHistories,
                allergies = totalAllergies,
                problems = totalProblems,
                immunizations = totalImmunizations
            }
        }));
    }

    /// <summary>
    /// Deletes development-seeded patient records for the specified or active clinic.
    /// When purgeAll is true, deletes all patient records belonging to the clinic.
    /// </summary>
    [HttpDelete("clear-patients")]
    [AllowAnonymous]
    public async Task<ActionResult<ApiResponse<object>>> ClearSeededPatients(
        [FromQuery] Guid? clinicId = null,
        [FromQuery] bool purgeAll = false,
        CancellationToken ct = default)
    {
        if (!IsDevAuthorized())
        {
            return StatusCode(StatusCodes.Status403Forbidden,
                ApiResponse<object>.Fail("Development endpoints are restricted to development environments."));
        }

        var targetClinicId = ResolveClinicId(clinicId);
        if (!targetClinicId.HasValue || targetClinicId.Value == Guid.Empty)
        {
            return BadRequest(ApiResponse<object>.Fail("A valid Clinic ID must be provided or resolved from the clinic context."));
        }

        var resolvedTenantId = ResolveTenantId(null);
        var clearedCount = await DevPatientSeeder.PurgeClinicTestRecordsAsync(
            _dbContext,
            targetClinicId.Value,
            resolvedTenantId,
            purgeAll,
            _logger,
            ct);

        return Ok(ApiResponse<object>.Success(
            new { clearedCount, clinicId = targetClinicId.Value, purgeAll },
            $"Successfully purged {clearedCount:N0} records for clinic {targetClinicId.Value}."));
    }
}
