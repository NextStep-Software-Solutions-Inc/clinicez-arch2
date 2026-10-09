using ClinicEz.Shared.Interoperability;

namespace ClinicEz.Patient.Application.Features.Sharing;

/// <summary>Converts between the contract's <see cref="SharingScopes"/> flags and the camelCase names used on the HTTP API.</summary>
public static class SharingScopeMap
{
    private static readonly (SharingScopes Scope, string Name)[] Known =
    [
        (SharingScopes.Demographics, "demographics"),
        (SharingScopes.Allergies, "allergies"),
        (SharingScopes.Medications, "medications"),
        (SharingScopes.Conditions, "conditions"),
        (SharingScopes.Immunizations, "immunizations"),
        (SharingScopes.LabResults, "labResults"),
        (SharingScopes.Prescriptions, "prescriptions"),
        (SharingScopes.Vitals, "vitals")
    ];

    public static IReadOnlyList<string> ToNames(SharingScopes scopes) =>
        Known.Where(k => scopes.HasFlag(k.Scope)).Select(k => k.Name).ToList();

    public static bool TryParse(IEnumerable<string> names, out SharingScopes scopes)
    {
        scopes = SharingScopes.None;
        foreach (var name in names)
        {
            var match = Known.FirstOrDefault(k => string.Equals(k.Name, name, StringComparison.OrdinalIgnoreCase));
            if (match.Name is null)
                return false;

            scopes |= match.Scope;
        }

        return scopes != SharingScopes.None;
    }
}