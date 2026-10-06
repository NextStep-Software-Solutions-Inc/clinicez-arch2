using System;
using System.Text.RegularExpressions;
using System.Threading.Tasks;
using ClinicEz.Patient.Domain.Entities;
using ClinicEz.Patient.Infrastructure.Persistence;
using ClinicEz.Shared.Common;
using MassTransit;
using Microsoft.EntityFrameworkCore;
using Microsoft.Extensions.Configuration;
using Microsoft.Extensions.Logging;

namespace ClinicEz.Patient.Infrastructure.Consumers;

public class FacilityCreatedConsumer : IConsumer<FacilityCreatedEvent>
{
    private readonly ApplicationDbContext _dbContext;
    private readonly ILogger<FacilityCreatedConsumer> _logger;
    private readonly IConfiguration? _configuration;

    public FacilityCreatedConsumer(
        ApplicationDbContext dbContext,
        ILogger<FacilityCreatedConsumer> logger,
        IConfiguration? configuration = null)
    {
        _dbContext = dbContext;
        _logger = logger;
        _configuration = configuration;
    }

    public async Task Consume(ConsumeContext<FacilityCreatedEvent> context)
    {
        var message = context.Message;
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
                context.CancellationToken);

            if (existingClinic is null)
            {
                var baseUrl = ResolveClinicBaseUrl();
                var (privacyUrl, termsUrl) = ResolvePolicyUrls(message, FacilityType.Clinic, slug);

                var newClinic = new Clinic
                {
                    Id = message.ResourceId,
                    Name = message.Name,
                    BaseUrl = baseUrl,
                    IsPublic = true,
                    SupportsAppointments = true,
                    SpecialtiesJson = "[\"General Practice\"]",
                    RequiredShareFieldsJson = "[\"demographics\",\"allergies\",\"medications\"]",
                    PrivacyPolicyUrl = privacyUrl,
                    TermsAndConditionsUrl = termsUrl,
                    CreatedAt = message.CreatedAt,
                    UpdatedAt = DateTime.UtcNow
                };
                await _dbContext.Clinics.AddAsync(newClinic, context.CancellationToken);
            }
            else
            {
                existingClinic.Name = message.Name;
                existingClinic.UpdatedAt = DateTime.UtcNow;
            }

            await _dbContext.SaveChangesAsync(context.CancellationToken);

            _logger.LogInformation("[ClinicEz.Patient] Registered clinic '{Name}' in discovery catalog", message.Name);

            await context.Publish(new FacilityProvisionedEvent
            {
                ResourceId = message.ResourceId,
                TenantId = message.TenantId,
                Success = true,
                Message = $"Patient catalog registered clinic '{message.Name}'."
            });
        }
        else if (message.FacilityType == FacilityType.Organization)
        {
            var existingOrg = await _dbContext.Organizations.FirstOrDefaultAsync(
                o => o.Id == message.ResourceId,
                context.CancellationToken);

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
                await _dbContext.Organizations.AddAsync(newOrg, context.CancellationToken);
            }
            else
            {
                existingOrg.Name = message.Name;
                existingOrg.UpdatedAt = DateTime.UtcNow;
            }

            await _dbContext.SaveChangesAsync(context.CancellationToken);

            _logger.LogInformation("[ClinicEz.Patient] Registered organization '{Name}' in discovery catalog", message.Name);

            await context.Publish(new FacilityProvisionedEvent
            {
                ResourceId = message.ResourceId,
                TenantId = message.TenantId,
                Success = true,
                Message = $"Patient catalog registered organization '{message.Name}'."
            });
        }
    }

    private string ResolveClinicBaseUrl()
    {
        var serverUrl = _configuration?["Services:ClinicApiUrl"];
        if (string.IsNullOrWhiteSpace(serverUrl))
        {
            serverUrl = "http://localhost:5245";
        }

        var clean = serverUrl.Trim().TrimEnd('/');
        return clean.EndsWith("/api/v1", StringComparison.OrdinalIgnoreCase)
            ? clean
            : $"{clean}/api/v1";
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
