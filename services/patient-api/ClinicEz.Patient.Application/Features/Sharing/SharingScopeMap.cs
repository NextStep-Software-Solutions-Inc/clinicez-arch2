using ClinicEz.Shared.Interoperability;

namespace ClinicEz.Patient.Application.Features.Sharing;

/// <summary>Converts between the contract's <see cref="SharingScopes"/> flags and their member names, which is how the HTTP API names a scope.</summary>
public static class SharingScopeMap
{
    private static readonly SharingScopes[] Known =
    [
        SharingScopes.Demographics,
        SharingScopes.Allergies,
        SharingScopes.Medications,
        SharingScopes.Conditions,
        SharingScopes.Immunizations,
        SharingScopes.LabResults,
        SharingScopes.Prescriptions,
        SharingScopes.Vitals
    ];

    public static IReadOnlyList<string> ToNames(SharingScopes scopes) =>
        Known.Where(k => scopes.HasFlag(k)).Select(k => k.ToString()).ToList();

    public static bool TryParse(IEnumerable<string> names, out SharingScopes scopes)
    {
        scopes = SharingScopes.None;
        foreach (var name in names)
        {
            var match = Known.FirstOrDefault(k => string.Equals(k.ToString(), name, StringComparison.OrdinalIgnoreCase));
            if (match == SharingScopes.None)
                return false;

            scopes |= match;
        }

        return scopes != SharingScopes.None;
    }
}