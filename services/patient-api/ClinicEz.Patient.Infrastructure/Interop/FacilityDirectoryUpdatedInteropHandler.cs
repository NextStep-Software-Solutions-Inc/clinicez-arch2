using System.Text.RegularExpressions;
using ClinicEz.Patient.Domain.Entities;
using ClinicEz.Patient.Infrastructure.Persistence;
using ClinicEz.Shared.Common;
using ClinicEz.Shared.Interop;
using ClinicEz.Shared.Interop.Handling;
using Microsoft.EntityFrameworkCore;
using Microsoft.Extensions.Configuration;
using Microsoft.Extensions.Logging;

namespace ClinicEz.Patient.Infrastructure.Interop;

/// <summary>
/// Handles <c>facility.directory.updated</c> from the portal: keeps the patient-facing clinic and
/// organization catalogue in step with the facility directory. Only the portal may publish it.
/// </summary>
public sealed class FacilityDirectoryUpdatedInteropHandler : IInteropHandler<FacilityCreatedEvent>
{
    private readonly ApplicationDbContext _dbContext;
    private readonly ILogger<FacilityDirectoryUpdatedInteropHandler> _logger;
    private readonly IConfiguration? _configuration;

    public FacilityDirectoryUpdatedInteropHandler(
        ApplicationDbContext dbContext,
        ILogger<FacilityDirectoryUpdatedInteropHandler> logger,
        IConfiguration? configuration = null)
    {
        _dbContext = dbContext;
        _logger = logger;
        _configuration = configuration;
    }

    public async Task HandleAsync(FacilityCreatedEvent message, InteropMessageContext context, CancellationToken ct)
    {
        if (context.From.Kind != PartyKind.ControlPlane || InteropServices.For(context.From) != InteropServices.Portal)
        {
            _logger.LogWarning(
                "Ignoring facility.directory.updated {MessageId}: sender {Sender} is not the portal.",
                context.MessageId, context.From.Address);
            return;
        }

        _logger.LogInformation(
            "[ClinicEz.Patient] Consuming FacilityCreatedEvent for '{Name}' (Type: {Type}, ID: {Id})",
            message.Name, message.FacilityType, message.ResourceId);

        var slug = !string.IsNullOrWhiteSpace(message.Slug)
            ? message.Slug
            : Regex.Replace(message.Name.ToLowerInvariant(), @"[^a-z0-9]+", "-").Trim('-');
        if (string.IsNullOrWhiteSpace(slug)) slug = message.ResourceId.ToString("N")[..8];

        if (message.FacilityType == FacilityType.Clinic)
        {
            var existingClinic = await _dbContext.Clinics.FirstOrDefaultAsync(
                c => c.Id == message.ResourceId,
                ct);

            var (privacyUrl, termsUrl) = ResolvePolicyUrls(message, FacilityType.Clinic, slug);
            var resolvedAddress = BuildAddress(message);
            var resolvedDescription = BuildClinicDescription(message);
            var specialtiesJson = BuildSpecialtiesJson(message);

            if (existingClinic is null)
            {
                var newClinic = new Clinic
                {
                    Id = message.ResourceId,
                    Name = message.Name,
                    TenantId = message.TenantId,
                    Address = resolvedAddress,
                    Description = resolvedDescription,
                    IsPublic = message.IsPublic ?? true,
                    SupportsAppointments = true,
                    SpecialtiesJson = specialtiesJson,
                    RequiredShareFieldsJson = "[\"demographics\",\"allergies\",\"medications\"]",
                    PrivacyPolicyUrl = privacyUrl,
                    TermsAndConditionsUrl = termsUrl,
                    CreatedAt = message.CreatedAt,
                    UpdatedAt = DateTime.UtcNow
                };
                await _dbContext.Clinics.AddAsync(newClinic, ct);
            }
            else
            {
                existingClinic.Name = message.Name;
                existingClinic.TenantId = message.TenantId;
                if (!string.IsNullOrWhiteSpace(resolvedAddress))
                    existingClinic.Address = resolvedAddress;
                if (!string.IsNullOrWhiteSpace(resolvedDescription))
                    existingClinic.Description = resolvedDescription;
                if (message.IsPublic.HasValue)
                    existingClinic.IsPublic = message.IsPublic.Value;
                if (!string.IsNullOrWhiteSpace(message.Classification) || (message.Providers is { Count: > 0 }))
                    existingClinic.SpecialtiesJson = specialtiesJson;
                existingClinic.PrivacyPolicyUrl = privacyUrl;
                existingClinic.TermsAndConditionsUrl = termsUrl;
                existingClinic.UpdatedAt = DateTime.UtcNow;
            }

            if (message.Providers is not null)
            {
                var existingProviders = await _dbContext.ClinicHealthcareProviders
                    .Where(p => p.ClinicId == message.ResourceId)
                    .ToListAsync(ct);

                var incomingIds = new HashSet<Guid>();
                for (var i = 0; i < message.Providers.Count; i++)
                {
                    var dto = message.Providers[i];
                    var providerId = dto.Id != Guid.Empty ? dto.Id : Guid.NewGuid();
                    incomingIds.Add(providerId);

                    var existingProvider = existingProviders.FirstOrDefault(p => p.Id == providerId)
                        ?? existingProviders.FirstOrDefault(p => string.Equals(p.Name, dto.Name, StringComparison.OrdinalIgnoreCase));

                    if (existingProvider is null)
                    {
                        await _dbContext.ClinicHealthcareProviders.AddAsync(new ClinicHealthcareProvider
                        {
                            Id = providerId,
                            ClinicId = message.ResourceId,
                            Name = dto.Name,
                            Specialty = string.IsNullOrWhiteSpace(dto.Specialty) ? "General Practice" : dto.Specialty,
                            ProfessionalLicenseNo = dto.ProfessionalLicenseNo,
                            IsActive = dto.IsActive,
                            DisplayOrder = dto.DisplayOrder > 0 ? dto.DisplayOrder : i,
                            CreatedAt = DateTime.UtcNow,
                            UpdatedAt = DateTime.UtcNow
                        }, ct);
                    }
                    else
                    {
                        incomingIds.Add(existingProvider.Id);
                        existingProvider.Name = dto.Name;
                        existingProvider.Specialty = string.IsNullOrWhiteSpace(dto.Specialty) ? existingProvider.Specialty : dto.Specialty;
                        existingProvider.ProfessionalLicenseNo = dto.ProfessionalLicenseNo ?? existingProvider.ProfessionalLicenseNo;
                        existingProvider.IsActive = dto.IsActive;
                        existingProvider.DisplayOrder = dto.DisplayOrder > 0 ? dto.DisplayOrder : i;
                        existingProvider.UpdatedAt = DateTime.UtcNow;
                    }
                }

                foreach (var stale in existingProviders.Where(p => !incomingIds.Contains(p.Id)))
                {
                    stale.IsActive = false;
                    stale.UpdatedAt = DateTime.UtcNow;
                }
            }

            await _dbContext.SaveChangesAsync(ct);

            _logger.LogInformation("[ClinicEz.Patient] Registered clinic '{Name}' in discovery catalog", message.Name);
        }
        else if (message.FacilityType == FacilityType.Organization)
        {
            var existingOrg = await _dbContext.Organizations.FirstOrDefaultAsync(
                o => o.Id == message.ResourceId,
                ct);

            var (privacyUrl, termsUrl) = ResolvePolicyUrls(message, FacilityType.Organization, slug);
            var orgDescription = !string.IsNullOrWhiteSpace(message.Classification)
                ? $"{message.Classification} • {message.Name}"
                : $"{message.Name} Healthcare Network";

            if (existingOrg is null)
            {
                var newOrg = new Organization
                {
                    Id = message.ResourceId,
                    Name = message.Name,
                    Slug = slug,
                    Description = orgDescription,
                    AddressHint = FirstNonEmpty(message.City, message.Province, message.Region),
                    IsPublic = message.IsPublic ?? true,
                    PrivacyPolicyUrl = privacyUrl,
                    TermsAndConditionsUrl = termsUrl,
                    CreatedAt = message.CreatedAt,
                    UpdatedAt = DateTime.UtcNow
                };
                await _dbContext.Organizations.AddAsync(newOrg, ct);
            }
            else
            {
                existingOrg.Name = message.Name;
                existingOrg.Description = orgDescription;
                if (!string.IsNullOrWhiteSpace(message.City) || !string.IsNullOrWhiteSpace(message.Province))
                    existingOrg.AddressHint = FirstNonEmpty(message.City, message.Province, message.Region);
                if (message.IsPublic.HasValue)
                    existingOrg.IsPublic = message.IsPublic.Value;
                existingOrg.PrivacyPolicyUrl = privacyUrl;
                existingOrg.TermsAndConditionsUrl = termsUrl;
                existingOrg.UpdatedAt = DateTime.UtcNow;
            }

            await _dbContext.SaveChangesAsync(ct);

            _logger.LogInformation("[ClinicEz.Patient] Registered organization '{Name}' in discovery catalog", message.Name);
        }
    }

    private static string? BuildAddress(FacilityCreatedEvent message)
    {
        if (!string.IsNullOrWhiteSpace(message.Address))
            return message.Address.Trim();

        var parts = new[] { message.City, message.Province, message.Region }
            .Where(p => !string.IsNullOrWhiteSpace(p))
            .Select(p => p!.Trim())
            .ToList();

        return parts.Count > 0 ? string.Join(", ", parts) : null;
    }

    private static string? BuildClinicDescription(FacilityCreatedEvent message)
    {
        var segments = new List<string>();
        if (!string.IsNullOrWhiteSpace(message.Classification))
            segments.Add(message.Classification.Trim());
        if (!string.IsNullOrWhiteSpace(message.OperatingHours))
            segments.Add($"Hours: {message.OperatingHours.Trim()}");
        if (message.IsPhilHealthAccredited == true)
            segments.Add("PhilHealth YAKAP Accredited");

        return segments.Count > 0 ? string.Join(" • ", segments) : null;
    }

    private static string BuildSpecialtiesJson(FacilityCreatedEvent message)
    {
        var specialties = new List<string>();
        if (!string.IsNullOrWhiteSpace(message.Classification))
            specialties.Add(message.Classification.Trim());

        if (message.Providers is { Count: > 0 })
        {
            foreach (var p in message.Providers)
            {
                if (!string.IsNullOrWhiteSpace(p.Specialty) &&
                    !specialties.Contains(p.Specialty.Trim(), StringComparer.OrdinalIgnoreCase))
                {
                    specialties.Add(p.Specialty.Trim());
                }
            }
        }

        if (specialties.Count == 0)
            specialties.Add("General Practice");

        return System.Text.Json.JsonSerializer.Serialize(specialties);
    }

    private static string? FirstNonEmpty(params string?[] values) =>
        values.FirstOrDefault(v => !string.IsNullOrWhiteSpace(v))?.Trim();

    private (string PrivacyPolicyUrl, string TermsAndConditionsUrl) ResolvePolicyUrls(
        FacilityCreatedEvent message,
        FacilityType facilityType,
        string facilitySlug)
    {
        if (!string.IsNullOrWhiteSpace(message.ConsoleUrl))
        {
            var consoleBase = message.ConsoleUrl.TrimEnd('/');
            return ($"{consoleBase}/privacy", $"{consoleBase}/terms");
        }

        var baseDomain = _configuration?["Facility:BaseDomain"];

        if (!string.IsNullOrWhiteSpace(baseDomain))
        {
            var cleanBaseDomain = baseDomain.Trim().TrimStart('.');
            var subdomain = facilityType switch
            {
                FacilityType.Clinic => _configuration?["Facility:Subdomains:Clinic"] ?? "clinic",
                FacilityType.Organization => _configuration?["Facility:Subdomains:Organization"] ?? "org",
                _ => "clinic"
            };
            return ($"https://{facilitySlug}.{subdomain}.{cleanBaseDomain}/privacy",
                    $"https://{facilitySlug}.{subdomain}.{cleanBaseDomain}/terms");
        }

        return ($"/{facilitySlug}/privacy", $"/{facilitySlug}/terms");
    }
}
