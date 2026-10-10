using System;
using System.Collections.Generic;
using System.Linq;
using System.Threading;
using System.Threading.Tasks;
using ClinicEz.Portal.Application.Interfaces;
using ClinicEz.Portal.Domain.Entities;
using Microsoft.EntityFrameworkCore;
using Microsoft.Extensions.Caching.Memory;
using Microsoft.Extensions.Logging;

namespace ClinicEz.Portal.Infrastructure.Services;

public sealed class SystemSettingsService(
    IApplicationDbContext dbContext,
    IMemoryCache cache,
    ILogger<SystemSettingsService> logger) : ISystemSettingsService
{
    private const string CacheKeyAll = "SystemSettings:All";
    private static readonly TimeSpan CacheSlidingExpiration = TimeSpan.FromMinutes(5);

    private static readonly List<(string Key, string Value, string Category, string Description)> SystemDefaults =
    [
        ("Licensing:TtlDays", "30", "Licensing", "Default license validity duration in days."),
        ("Licensing:GraceDays", "14", "Licensing", "Offline grace period in days before facility lock."),
        ("Licensing:RenewBeforeDays", "7", "Licensing", "Threshold window in days to automatically renew licenses on heartbeat."),
        ("Billing:TrialDays", "14", "Billing", "Default workspace trial period in days upon registration."),
        ("Billing:DefaultPlanSlug", "starter", "Billing", "Default subscription plan tier assigned to new workspaces."),
        ("Workspace:MaxOwnedPerUser", "1", "Workspace", "Maximum number of owned active workspaces allowed per user."),
        ("Storage:LabUploadMaxFileBytes", "10485760", "Storage", "Maximum file size allowed for public patient lab report uploads (in bytes)."),
        ("Storage:LabUploadRateLimitPermits", "5", "Storage", "Maximum permits allowed per rate limit window for public lab uploads."),
        ("Storage:LabUploadRateLimitWindowMinutes", "1", "Storage", "Rate limit window duration in minutes for public lab uploads."),
        ("Mailer:SmtpHost", "localhost", "Mailer", "SMTP mail server hostname."),
        ("Mailer:SmtpPort", "1025", "Mailer", "SMTP mail server port."),
        ("Mailer:SmtpSecurity", "None", "Mailer", "SMTP security protocol (None, StartTls, Tls)."),
        ("Mailer:SmtpFromEmail", "no-reply@clinicez.com", "Mailer", "Default sender email address for outgoing system emails."),
        ("Mailer:SmtpFromName", "ClinicEZ Support", "Mailer", "Default sender display name for outgoing system emails."),
        ("Mailer:SmtpReplyTo", "support@clinicez.com", "Mailer", "Default reply-to email address for system notifications."),
        ("Mailer:ContactInbox", "contact@clinicez.com", "Mailer", "Inbox email address where contact/support inquiries are delivered.")
    ];

    public async Task<IReadOnlyList<SystemSettingDto>> GetAllSettingsAsync(CancellationToken ct = default)
    {
        if (cache.TryGetValue<IReadOnlyList<SystemSettingDto>>(CacheKeyAll, out var cachedSettings) && cachedSettings is not null)
        {
            return cachedSettings;
        }

        await EnsureDefaultsSeededAsync(ct);

        var settings = await dbContext.SystemSettings
            .AsNoTracking()
            .OrderBy(s => s.Category)
            .ThenBy(s => s.Key)
            .Select(s => new SystemSettingDto(s.Key, s.Value, s.Category, s.Description, s.UpdatedAt, s.UpdatedBy))
            .ToListAsync(ct);

        cache.Set(CacheKeyAll, settings, new MemoryCacheEntryOptions
        {
            SlidingExpiration = CacheSlidingExpiration
        });

        return settings;
    }

    public async Task<string> GetSettingValueAsync(string key, string defaultValue, CancellationToken ct = default)
    {
        var all = await GetAllSettingsAsync(ct);
        var match = all.FirstOrDefault(s => string.Equals(s.Key, key, StringComparison.OrdinalIgnoreCase));
        return match?.Value ?? defaultValue;
    }

    public async Task<int> GetSettingIntAsync(string key, int defaultValue, CancellationToken ct = default)
    {
        var valStr = await GetSettingValueAsync(key, defaultValue.ToString(), ct);
        return int.TryParse(valStr, out var parsed) ? parsed : defaultValue;
    }

    public async Task UpdateSettingsAsync(IDictionary<string, string> settings, string updatedBy, CancellationToken ct = default)
    {
        ArgumentNullException.ThrowIfNull(settings);

        await EnsureDefaultsSeededAsync(ct);

        var dbSettings = await dbContext.SystemSettings.ToListAsync(ct);
        var now = DateTime.UtcNow;

        foreach (var (key, value) in settings)
        {
            var match = dbSettings.FirstOrDefault(s => string.Equals(s.Key, key, StringComparison.OrdinalIgnoreCase));
            if (match is not null)
            {
                match.Value = value.Trim();
                match.UpdatedAt = now;
                match.UpdatedBy = updatedBy;
            }
            else
            {
                var defaultDef = SystemDefaults.FirstOrDefault(d => string.Equals(d.Key, key, StringComparison.OrdinalIgnoreCase));
                dbContext.SystemSettings.Add(new SystemSetting
                {
                    Key = key,
                    Value = value.Trim(),
                    Category = defaultDef.Category ?? "General",
                    Description = defaultDef.Description ?? key,
                    UpdatedAt = now,
                    UpdatedBy = updatedBy
                });
            }
        }

        await dbContext.SaveChangesAsync(ct);
        cache.Remove(CacheKeyAll);
        logger.LogInformation("SystemSettings updated by {UpdatedBy}. Cache invalidated.", updatedBy);
    }

    private async Task EnsureDefaultsSeededAsync(CancellationToken ct)
    {
        var existingKeys = await dbContext.SystemSettings.Select(s => s.Key).ToListAsync(ct);
        var missingDefaults = SystemDefaults.Where(d => !existingKeys.Contains(d.Key, StringComparer.OrdinalIgnoreCase)).ToList();

        if (missingDefaults.Count == 0) return;

        var now = DateTime.UtcNow;
        foreach (var (key, value, category, description) in missingDefaults)
        {
            dbContext.SystemSettings.Add(new SystemSetting
            {
                Key = key,
                Value = value,
                Category = category,
                Description = description,
                UpdatedAt = now,
                UpdatedBy = "System Default"
            });
        }

        await dbContext.SaveChangesAsync(ct);
        logger.LogInformation("Seeded {Count} missing default system settings.", missingDefaults.Count);
    }
}
