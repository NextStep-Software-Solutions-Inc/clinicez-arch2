using System;
using System.Text.RegularExpressions;

namespace ClinicEz.Shared.Workspace;

/// <summary>Brand inheritance rules shared by every facility service.</summary>
public static partial class WorkspaceBrand
{
    [GeneratedRegex("^#[0-9A-Fa-f]{6}$")]
    private static partial Regex HexColor();

    /// <summary>
    /// Accent precedence: the facility's own choice, then the workspace accent, then the product default.
    /// A facility value equal to <paramref name="productDefault"/> counts as "not chosen" - older facility
    /// rows were created with the default pre-filled, so it is indistinguishable from an explicit pick.
    /// Only well-formed <c>#RRGGBB</c> values are ever returned from the workspace.
    /// </summary>
    public static string ResolveAccent(string? facilityAccent, string? workspaceAccent, string productDefault)
    {
        var hasOwnChoice = !string.IsNullOrWhiteSpace(facilityAccent) &&
                           !string.Equals(facilityAccent, productDefault, StringComparison.OrdinalIgnoreCase);
        if (hasOwnChoice) return facilityAccent!;

        if (!string.IsNullOrWhiteSpace(workspaceAccent) && HexColor().IsMatch(workspaceAccent)) return workspaceAccent;

        return string.IsNullOrWhiteSpace(facilityAccent) ? productDefault : facilityAccent;
    }
}
