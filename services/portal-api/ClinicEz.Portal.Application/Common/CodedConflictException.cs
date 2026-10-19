using ClinicEz.Shared.Exceptions;

namespace ClinicEz.Portal.Application.Common;

/// <summary>A 409 that carries a machine-readable <see cref="Code"/> (for example <c>owner_already_has_workspace</c>) clients can branch on.</summary>
public class CodedConflictException(string code, string message) : ConflictException(message)
{
    public string Code { get; } = code;
}

public static class ConflictCodes
{
    public const string OwnerAlreadyHasWorkspace = "owner_already_has_workspace";
    public const string TargetAlreadyOwnsWorkspace = "target_already_owns_workspace";
    public const string BranchFacilityTypeTaken = "branch_facility_type_taken";
    public const string LinkAlreadyExists = "link_already_exists";
    public const string LinkNotPending = "link_not_pending";
}
