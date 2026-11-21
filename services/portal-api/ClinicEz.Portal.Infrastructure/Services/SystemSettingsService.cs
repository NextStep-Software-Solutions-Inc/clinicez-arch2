using System;
using System.Collections.Generic;
using System.Globalization;
using System.Linq;
using System.Text.Json;
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

    private static readonly JsonSerializerOptions JsonOptions = new()
    {
        PropertyNamingPolicy = JsonNamingPolicy.CamelCase,
        PropertyNameCaseInsensitive = true
    };

    public static readonly IReadOnlyList<PlatformBankAccountDto> DefaultBankAccounts =
    [
        new(
            Id: "bdo",
            Institution: "BDO Unibank",
            AccountName: "Nextstep Software Corporation",
            AccountNumber: "0012-3456-7890",
            CopyValue: "0012-3456-7890",
            Branch: "BGC Corporate Center",
            Type: "bank",
            Badge: "Commercial Bank",
            IsActive: true
        ),
        new(
            Id: "bpi",
            Institution: "Bank of the Philippine Islands (BPI)",
            AccountName: "Nextstep Software Corporation",
            AccountNumber: "4321-8765-09",
            CopyValue: "4321-8765-09",
            Branch: "Ayala Triangle",
            Type: "bank",
            Badge: "Commercial Bank",
            IsActive: true
        ),
        new(
            Id: "gcash-maya",
            Institution: "GCash / Maya",
            AccountName: "Nextstep Software Corporation",
            AccountNumber: "0917-123-EZPH (0917-123-3974)",
            CopyValue: "0917-123-3974",
            Branch: "Merchant QR / Mobile Wallet",
            Type: "ewallet",
            Badge: "Instant E-Wallet",
            IsActive: true
        )
    ];

    private static readonly string DefaultBankAccountsJson = JsonSerializer.Serialize(DefaultBankAccounts, JsonOptions);

    private static readonly List<(string Key, string Value, string Category, string Description)> SystemDefaults =
    [
        ("Licensing:TtlDays", "30", "Licensing", "Default license validity duration in days."),
        ("Licensing:GraceDays", "14", "Licensing", "Offline grace period in days before facility lock."),
        ("Licensing:RenewBeforeDays", "7", "Licensing", "Threshold window in days to automatically renew licenses on heartbeat."),
        ("Billing:TrialDays", "14", "Billing", "Default workspace trial period in days upon registration."),
        ("Billing:DefaultPlanSlug", "starter", "Billing", "Default subscription plan tier assigned to new workspaces."),
        ("Billing:DefaultBillingCadence", "monthly", "Billing", "Default billing cadence selected on pricing and subscription pages (monthly or annually)."),
        ("Billing:IsOnlinePaymentReady", "false", "Billing", "When true, online checkout via payment gateways (e.g. Xendit credit card / e-wallet) is enabled; when false, tenants are routed to offline payments."),
        ("Billing:BankAccountsJson", DefaultBankAccountsJson, "Billing", "JSON array of settlement bank and e-wallet accounts displayed to tenants for offline transfers."),
        ("Billing:BirTaxExempt", "false", "Billing", "When true, platform subscription billing and official receipts are treated as BIR VAT-Exempt (0% VAT)."),
        ("Billing:BirTaxPercentage", "12", "Billing", "BIR Value Added Tax (VAT) percentage applied to vatable subscription invoices and receipts (e.g., 12 for 12%)."),
        ("Billing:CorporateName", "Nextstep Software Corporation", "Billing", "Registered corporate entity name printed on BIR billing statements and official receipts."),
        ("Billing:CorporateTin", "009-876-543-000", "Billing", "Registered BIR Tax Identification Number (TIN) printed on billing statements and official receipts."),
        ("Billing:CorporateAddress", "Unit 1402, BGC Corporate Center, 11th Avenue, Bonifacio Global City, Taguig City, Metro Manila, Philippines 1634", "Billing", "Registered corporate business address printed on billing statements and official receipts."),
        ("Billing:SupportEmail", "billing@clinicez.ph", "Billing", "Billing support email address where tenants send payment proof and remittance inquiries."),
        ("Workspace:MaxOwnedPerUser", "1", "Workspace", "Maximum number of owned active workspaces allowed per user."),
        ("Storage:LabUploadMaxFileBytes", "10485760", "Storage", "Maximum file size allowed for public patient lab report uploads (in bytes)."),
        ("Storage:LabUploadRateLimitPermits", "5", "Storage", "Maximum permits allowed per rate limit window for public lab uploads."),
        ("Storage:LabUploadRateLimitWindowMinutes", "1", "Storage", "Rate limit window duration in minutes for public lab uploads."),
        ("Mailer:SmtpHost", "smtp.resend.com", "Mailer", "SMTP mail server hostname."),
        ("Mailer:SmtpPort", "587", "Mailer", "SMTP mail server port."),
        ("Mailer:SmtpSecurity", "StartTls", "Mailer", "SMTP security protocol (None, StartTls, Tls)."),
        ("Mailer:SmtpFromEmail", "noreply@clinicez.net", "Mailer", "Default sender email address for outgoing system emails."),
        ("Mailer:SmtpFromName", "Clinic EZ Support", "Mailer", "Default sender display name for outgoing system emails."),
        ("Mailer:SmtpReplyTo", "support@clinicez.net", "Mailer", "Default reply-to email address for system notifications."),
        ("Mailer:ContactInbox", "contact@clinicez.net", "Mailer", "Inbox email address where contact/support inquiries are delivered."),
        ("JoinClaim:TtlHours", "48", "JoinClaim", "Validity window in hours for progressive patient account claim tokens."),
        ("PatientApp:AppleAppStoreUrl", "https://apps.apple.com/app/clinicez-patient/id000000000", "PatientApp", "Download URL for Clinic EZ Patient App on Apple App Store."),
        ("PatientApp:GooglePlayStoreUrl", "https://play.google.com/store/apps/details?id=com.clinicez.patient", "PatientApp", "Download URL for Clinic EZ Patient App on Google Play Store."),
        ("Contact:HeadquartersAddress", "San Juan 2, Sto Nino\nLapasan, Cagayan de Oro City\nMisamis Oriental\nPhilippines 9000", "Contact", "Official headquarters address displayed on public contact pages and communications."),
        ("Contact:SupportEmail", "support@clinicez.com", "Contact", "Public support email address shown to visitors and subscribers."),
        ("Contact:SalesEmail", "sales@clinicez.com", "Contact", "Public sales email address shown to visitors and subscribers."),
        ("Contact:PhoneNumber", "+63 (965) 429-7640", "Contact", "Public phone contact number displayed to visitors."),
        ("Contact:OperatingHours", "Mon - Fri, 8am - 5pm (PHT)", "Contact", "Customer support operating and phone hours.")
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
        var valStr = await GetSettingValueAsync(key, defaultValue.ToString(CultureInfo.InvariantCulture), ct);
        return int.TryParse(valStr, NumberStyles.Integer, CultureInfo.InvariantCulture, out var parsed) ? parsed : defaultValue;
    }

    public async Task<long> GetSettingLongAsync(string key, long defaultValue, CancellationToken ct = default)
    {
        var valStr = await GetSettingValueAsync(key, defaultValue.ToString(CultureInfo.InvariantCulture), ct);
        return long.TryParse(valStr, NumberStyles.Integer, CultureInfo.InvariantCulture, out var parsed) ? parsed : defaultValue;
    }

    public async Task<bool> GetSettingBoolAsync(string key, bool defaultValue, CancellationToken ct = default)
    {
        var valStr = await GetSettingValueAsync(key, defaultValue ? "true" : "false", ct);
        return bool.TryParse(valStr, out var parsed) ? parsed : defaultValue;
    }

    public async Task<decimal> GetSettingDecimalAsync(string key, decimal defaultValue, CancellationToken ct = default)
    {
        var valStr = await GetSettingValueAsync(key, defaultValue.ToString(CultureInfo.InvariantCulture), ct);
        return decimal.TryParse(valStr, NumberStyles.Number, CultureInfo.InvariantCulture, out var parsed) ? parsed : defaultValue;
    }

    public async Task<BillingPaymentConfigDto> GetBillingPaymentConfigAsync(CancellationToken ct = default)
    {
        var bankJson = await GetSettingValueAsync("Billing:BankAccountsJson", DefaultBankAccountsJson, ct);
        IReadOnlyList<PlatformBankAccountDto> accounts;
        try
        {
            var parsed = JsonSerializer.Deserialize<List<PlatformBankAccountDto>>(bankJson, JsonOptions);
            accounts = parsed is not null
                ? parsed.Where(a => a.IsActive).ToList()
                : [];
        }
        catch (Exception ex)
        {
            logger.LogWarning(ex, "Failed to deserialize Billing:BankAccountsJson; falling back to default bank accounts.");
            accounts = DefaultBankAccounts;
        }

        var birTaxExempt = await GetSettingBoolAsync("Billing:BirTaxExempt", false, ct);
        var birTaxPercentage = await GetSettingDecimalAsync("Billing:BirTaxPercentage", 12m, ct);
        var corporateName = await GetSettingValueAsync("Billing:CorporateName", "Nextstep Software Corporation", ct);
        var corporateTin = await GetSettingValueAsync("Billing:CorporateTin", "009-876-543-000", ct);
        var corporateAddress = await GetSettingValueAsync(
            "Billing:CorporateAddress",
            "Unit 1402, BGC Corporate Center, 11th Avenue, Bonifacio Global City, Taguig City, Metro Manila, Philippines 1634",
            ct);
        var supportEmail = await GetSettingValueAsync("Billing:SupportEmail", "billing@clinicez.ph", ct);
        var defaultBillingCadence = await GetSettingValueAsync("Billing:DefaultBillingCadence", "monthly", ct);
        var isOnlinePaymentReady = await GetSettingBoolAsync("Billing:IsOnlinePaymentReady", false, ct);
        var trialDays = await GetSettingIntAsync("Billing:TrialDays", 14, ct);

        return new BillingPaymentConfigDto(
            BankAccounts: accounts,
            BirTaxExempt: birTaxExempt,
            BirTaxPercentage: birTaxExempt ? 0m : Math.Clamp(birTaxPercentage, 0m, 100m),
            CorporateName: corporateName,
            CorporateTin: corporateTin,
            CorporateAddress: corporateAddress,
            BillingSupportEmail: supportEmail,
            DefaultBillingCadence: defaultBillingCadence,
            IsOnlinePaymentReady: isOnlinePaymentReady,
            TrialDays: trialDays
        );
    }

    public async Task<BillingPublicConfigDto> GetBillingPublicConfigAsync(CancellationToken ct = default)
    {
        var trialDays = await GetSettingIntAsync("Billing:TrialDays", 14, ct);
        var defaultBillingCadence = await GetSettingValueAsync("Billing:DefaultBillingCadence", "monthly", ct);
        return new BillingPublicConfigDto(trialDays, defaultBillingCadence);
    }

    public async Task<ContactPlatformConfigDto> GetContactPlatformConfigAsync(CancellationToken ct = default)
    {
        var hq = await GetSettingValueAsync(
            "Contact:HeadquartersAddress",
            "San Juan 2, Sto Nino\nLapasan, Cagayan de Oro City\nMisamis Oriental\nPhilippines 9000",
            ct);
        var supportEmail = await GetSettingValueAsync("Contact:SupportEmail", "support@clinicez.com", ct);
        var salesEmail = await GetSettingValueAsync("Contact:SalesEmail", "sales@clinicez.com", ct);
        var phone = await GetSettingValueAsync("Contact:PhoneNumber", "+63 (965) 429-7640", ct);
        var hours = await GetSettingValueAsync("Contact:OperatingHours", "Mon - Fri, 8am - 5pm (PHT)", ct);

        return new ContactPlatformConfigDto(
            HeadquartersAddress: hq,
            SupportEmail: supportEmail,
            SalesEmail: salesEmail,
            PhoneNumber: phone,
            OperatingHours: hours
        );
    }

    public async Task UpdateSettingsAsync(IDictionary<string, string> settings, string updatedBy, CancellationToken ct = default)
    {
        ArgumentNullException.ThrowIfNull(settings);

        ValidateSettings(settings);

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

    private static void ValidateSettings(IDictionary<string, string> settings)
    {
        foreach (var (key, rawValue) in settings)
        {
            var val = rawValue?.Trim() ?? string.Empty;

            if (string.Equals(key, "Billing:BankAccountsJson", StringComparison.OrdinalIgnoreCase))
            {
                List<PlatformBankAccountDto>? accounts;
                try
                {
                    accounts = JsonSerializer.Deserialize<List<PlatformBankAccountDto>>(val, JsonOptions);
                }
                catch (JsonException ex)
                {
                    throw new ArgumentException($"Billing:BankAccountsJson must be a valid JSON array of bank accounts: {ex.Message}", ex);
                }

                if (accounts is null)
                {
                    throw new ArgumentException("Billing:BankAccountsJson cannot be null.");
                }

                foreach (var account in accounts)
                {
                    if (string.IsNullOrWhiteSpace(account.Institution) ||
                        string.IsNullOrWhiteSpace(account.AccountName) ||
                        string.IsNullOrWhiteSpace(account.AccountNumber))
                    {
                        throw new ArgumentException("Each bank account must specify Institution, AccountName, and AccountNumber.");
                    }
                }
            }
            else if (string.Equals(key, "Billing:BirTaxExempt", StringComparison.OrdinalIgnoreCase))
            {
                if (!bool.TryParse(val, out _))
                {
                    throw new ArgumentException("Billing:BirTaxExempt must be 'true' or 'false'.");
                }
            }
            else if (string.Equals(key, "Billing:BirTaxPercentage", StringComparison.OrdinalIgnoreCase))
            {
                if (!decimal.TryParse(val, NumberStyles.Number, CultureInfo.InvariantCulture, out var pct) || pct < 0m || pct > 100m)
                {
                    throw new ArgumentException("Billing:BirTaxPercentage must be a valid percentage between 0 and 100.");
                }
            }
            else if (string.Equals(key, "Billing:DefaultBillingCadence", StringComparison.OrdinalIgnoreCase))
            {
                var cadence = val.Trim().ToLowerInvariant();
                if (cadence != "monthly" && cadence != "annually")
                {
                    throw new ArgumentException("Billing:DefaultBillingCadence must be either 'monthly' or 'annually'.");
                }
            }
            else if (string.Equals(key, "Billing:IsOnlinePaymentReady", StringComparison.OrdinalIgnoreCase))
            {
                if (!bool.TryParse(val, out _))
                {
                    throw new ArgumentException("Billing:IsOnlinePaymentReady must be 'true' or 'false'.");
                }
            }
            else if (string.Equals(key, "Billing:TrialDays", StringComparison.OrdinalIgnoreCase))
            {
                if (!int.TryParse(val, NumberStyles.Integer, CultureInfo.InvariantCulture, out var days) || days < 0)
                {
                    throw new ArgumentException("Billing:TrialDays must be a non-negative integer.");
                }
            }
        }
    }

    private async Task EnsureDefaultsSeededAsync(CancellationToken ct)
    {
        var existingSettings = await dbContext.SystemSettings.ToListAsync(ct);
        var existingKeys = existingSettings.Select(s => s.Key).ToHashSet(StringComparer.OrdinalIgnoreCase);
        var missingDefaults = SystemDefaults.Where(d => !existingKeys.Contains(d.Key)).ToList();

        var now = DateTime.UtcNow;
        var hasChanges = false;

        // Auto-heal legacy unconfigured placeholder defaults to production defaults
        foreach (var setting in existingSettings)
        {
            if (string.Equals(setting.Key, "Mailer:SmtpHost", StringComparison.OrdinalIgnoreCase) &&
                string.Equals(setting.Value, "localhost", StringComparison.OrdinalIgnoreCase))
            {
                setting.Value = "smtp.resend.com";
                setting.UpdatedAt = now;
                setting.UpdatedBy = "System Default";
                hasChanges = true;
            }
            else if (string.Equals(setting.Key, "Mailer:SmtpPort", StringComparison.OrdinalIgnoreCase) &&
                string.Equals(setting.Value, "1025", StringComparison.OrdinalIgnoreCase))
            {
                setting.Value = "587";
                setting.UpdatedAt = now;
                setting.UpdatedBy = "System Default";
                hasChanges = true;
            }
            else if (string.Equals(setting.Key, "Mailer:SmtpSecurity", StringComparison.OrdinalIgnoreCase) &&
                string.Equals(setting.Value, "None", StringComparison.OrdinalIgnoreCase))
            {
                setting.Value = "StartTls";
                setting.UpdatedAt = now;
                setting.UpdatedBy = "System Default";
                hasChanges = true;
            }
            else if (string.Equals(setting.Key, "Mailer:SmtpFromEmail", StringComparison.OrdinalIgnoreCase) &&
                string.Equals(setting.Value, "no-reply@clinicez.com", StringComparison.OrdinalIgnoreCase))
            {
                setting.Value = "noreply@clinicez.net";
                setting.UpdatedAt = now;
                setting.UpdatedBy = "System Default";
                hasChanges = true;
            }
            else if (string.Equals(setting.Key, "Mailer:SmtpReplyTo", StringComparison.OrdinalIgnoreCase) &&
                string.Equals(setting.Value, "support@clinicez.com", StringComparison.OrdinalIgnoreCase))
            {
                setting.Value = "support@clinicez.net";
                setting.UpdatedAt = now;
                setting.UpdatedBy = "System Default";
                hasChanges = true;
            }
            else if (string.Equals(setting.Key, "Mailer:ContactInbox", StringComparison.OrdinalIgnoreCase) &&
                string.Equals(setting.Value, "contact@clinicez.com", StringComparison.OrdinalIgnoreCase))
            {
                setting.Value = "contact@clinicez.net";
                setting.UpdatedAt = now;
                setting.UpdatedBy = "System Default";
                hasChanges = true;
            }
        }

        if (missingDefaults.Count > 0)
        {
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
            hasChanges = true;
            logger.LogInformation("Seeded {Count} missing default system settings.", missingDefaults.Count);
        }

        if (hasChanges)
        {
            await dbContext.SaveChangesAsync(ct);
        }
    }
}
