namespace CLINICEZ.Shared.Interfaces;

public interface ICurrentUserService
{
    /// <summary>
    /// Returns the current user id from the authenticated principal (sub claim) or null when no user.
    /// </summary>
    string? UserId { get; }
}
