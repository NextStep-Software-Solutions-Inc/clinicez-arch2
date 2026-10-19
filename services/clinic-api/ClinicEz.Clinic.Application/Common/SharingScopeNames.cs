using System;
using System.Collections.Generic;
using System.Linq;
using ClinicEz.Shared.Interoperability;

namespace ClinicEz.Clinic.Application.Common;

internal static class SharingScopeNames
{
    /// <summary>The individual scope names set in a flags value; <c>None</c> and the <c>All</c> shorthand are not listed.</summary>
    public static IReadOnlyList<string> Of(SharingScopes scopes) =>
        Enum.GetValues<SharingScopes>()
            .Where(s => s != SharingScopes.None && s != SharingScopes.All && scopes.HasFlag(s))
            .Select(s => s.ToString())
            .ToList();
}
