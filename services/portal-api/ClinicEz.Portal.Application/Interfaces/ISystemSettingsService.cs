using System;
using System.Collections.Generic;
using System.Threading;
using System.Threading.Tasks;

namespace ClinicEz.Portal.Application.Interfaces;

public record SystemSettingDto(
    string Key,
    string Value,
    string Category,
    string Description,
    DateTime UpdatedAt,
    string? UpdatedBy
);

public record PlatformBankAccountDto(
    string Id,
    string Institution,
    string AccountName,
    string AccountNumber,
    string CopyValue,
    string? Branch,
    string Type,
    string Badge,
    bool IsActive = true
);

public record BillingPaymentConfigDto(
    IReadOnlyList<PlatformBankAccountDto> BankAccounts,
    bool BirTaxExempt,
    decimal BirTaxPercentage,
    string CorporateName,
    string CorporateTin,
    string CorporateAddress,
    string BillingSupportEmail,
    string DefaultBillingCadence = "monthly",
    bool IsOnlinePaymentReady = false,
    int TrialDays = 14
);

public record ContactPlatformConfigDto(
    string HeadquartersAddress,
    string SupportEmail,
    string SalesEmail,
    string PhoneNumber,
    string OperatingHours
);

public record BillingPublicConfigDto(
    int TrialDays,
    string DefaultBillingCadence
);

public interface ISystemSettingsService
{
    Task<IReadOnlyList<SystemSettingDto>> GetAllSettingsAsync(CancellationToken ct = default);
    Task<string> GetSettingValueAsync(string key, string defaultValue, CancellationToken ct = default);
    Task<int> GetSettingIntAsync(string key, int defaultValue, CancellationToken ct = default);
    Task<long> GetSettingLongAsync(string key, long defaultValue, CancellationToken ct = default);
    Task<bool> GetSettingBoolAsync(string key, bool defaultValue, CancellationToken ct = default);
    Task<decimal> GetSettingDecimalAsync(string key, decimal defaultValue, CancellationToken ct = default);
    Task<BillingPaymentConfigDto> GetBillingPaymentConfigAsync(CancellationToken ct = default);
    Task<BillingPublicConfigDto> GetBillingPublicConfigAsync(CancellationToken ct = default);
    Task<ContactPlatformConfigDto> GetContactPlatformConfigAsync(CancellationToken ct = default);
    Task UpdateSettingsAsync(IDictionary<string, string> settings, string updatedBy, CancellationToken ct = default);
}

