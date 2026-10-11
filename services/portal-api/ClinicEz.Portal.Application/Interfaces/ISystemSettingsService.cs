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

public interface ISystemSettingsService
{
    Task<IReadOnlyList<SystemSettingDto>> GetAllSettingsAsync(CancellationToken ct = default);
    Task<string> GetSettingValueAsync(string key, string defaultValue, CancellationToken ct = default);
    Task<int> GetSettingIntAsync(string key, int defaultValue, CancellationToken ct = default);
    Task UpdateSettingsAsync(IDictionary<string, string> settings, string updatedBy, CancellationToken ct = default);
}
