using System;
using System.Collections.Generic;
using System.Linq;
using SharedOptions = ClinicEz.Shared.Options;

namespace ClinicEz.Clinic.Domain.Options;

/// <summary>
/// Forwarder to <see cref="SharedOptions.EhrStaticOptions"/> in ClinicEz.Shared.Options.
/// Maintains 100% backward compatibility for all existing clinic-api domain and unit tests
/// while delegating canonical option definitions and versioning to the shared assembly.
/// </summary>
public static class EhrStaticOptions
{
    private static readonly Dictionary<string, IReadOnlyList<EhrOptionDescriptor>> MappedRegistry;
    private static readonly Dictionary<(string Set, string Code), EhrOptionDescriptor> MappedLookup;

    static EhrStaticOptions()
    {
        var sharedAll = SharedOptions.EhrStaticOptions.GetAllOptions();
        MappedRegistry = new Dictionary<string, IReadOnlyList<EhrOptionDescriptor>>(StringComparer.OrdinalIgnoreCase);
        MappedLookup = new Dictionary<(string Set, string Code), EhrOptionDescriptor>();

        foreach (var (setName, sharedList) in sharedAll)
        {
            var list = sharedList.Select(s => new EhrOptionDescriptor
            {
                Code = s.Code,
                Label = s.Label,
                PhilHealthCode = s.PhilHealthCode,
                PhilHealthLibrary = s.PhilHealthLibrary,
                RequiresSpecifyText = s.RequiresSpecifyText,
                IsActive = s.IsActive,
                Metadata = s.Metadata
            }).ToList().AsReadOnly();

            MappedRegistry[setName] = list;
            foreach (var opt in list)
            {
                MappedLookup[(setName.ToLowerInvariant(), opt.Code.ToUpperInvariant())] = opt;
            }
        }
    }

    /// <summary>Returns all option set names registered in the Tier A static catalog.</summary>
    public static IReadOnlyCollection<string> AllOptionSets => SharedOptions.EhrStaticOptions.AllOptionSets;

    /// <summary>Returns the collection of options for a given set, or empty if unknown.</summary>
    public static IReadOnlyCollection<EhrOptionDescriptor> GetOptions(string optionSet)
    {
        if (string.IsNullOrWhiteSpace(optionSet))
            return Array.Empty<EhrOptionDescriptor>();

        if (MappedRegistry.TryGetValue(optionSet, out var list))
            return list;

        return Array.Empty<EhrOptionDescriptor>();
    }

    /// <summary>Tries to find a specific option descriptor by set name and code (case-insensitive).</summary>
    public static bool TryGetOption(string optionSet, string code, out EhrOptionDescriptor? descriptor)
    {
        if (string.IsNullOrWhiteSpace(optionSet) || string.IsNullOrWhiteSpace(code))
        {
            descriptor = null;
            return false;
        }

        return MappedLookup.TryGetValue((optionSet.ToLowerInvariant(), code.ToUpperInvariant()), out descriptor);
    }
}
