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

            if (existingClinic is null)
            {
                var (privacyUrl, termsUrl) = ResolvePolicyUrls(message, FacilityType.Clinic, slug);

                var newClinic = new Clinic
                {
                    Id = message.ResourceId,
                    Name = message.Name,
                    TenantId = message.TenantId,
                    IsPublic = true,
                    SupportsAppointments = true,
                    SpecialtiesJson = "[\"General Practice\"]",
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
                existingClinic.UpdatedAt = DateTime.UtcNow;
            }

            await _dbContext.SaveChangesAsync(ct);

            _logger.LogInformation("[ClinicEz.Patient] Registered clinic '{Name}' in discovery catalog", message.Name);
        }
        else if (message.FacilityType == FacilityType.Organization)
        {
            var existingOrg = await _dbContext.Organizations.FirstOrDefaultAsync(
                o => o.Id == message.ResourceId,
                ct);

            if (existingOrg is null)
            {
                var (privacyUrl, termsUrl) = ResolvePolicyUrls(message, FacilityType.Organization, slug);

                var newOrg = new Organization
                {
                    Id = message.ResourceId,
                    Name = message.Name,
                    Slug = slug,
                    Description = $"{message.Name} Healthcare Network",
                    IsPublic = true,
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
                existingOrg.UpdatedAt = DateTime.UtcNow;
            }

            await _dbContext.SaveChangesAsync(ct);

            _logger.LogInformation("[ClinicEz.Patient] Registered organization '{Name}' in discovery catalog", message.Name);
        }
    }

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
