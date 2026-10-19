namespace ClinicEz.Shared.LocalAuth;

/// <summary>
/// Marker for endpoint metadata (typically the service's <c>HasPermission</c> attribute) declaring that the endpoint enforces
/// an explicit permission check. The internal service principal is only allowed on endpoints carrying this marker, so a
/// leaked or over-shared internal key can never reach an endpoint that was not deliberately opened to service callers.
/// </summary>
public interface IPermissionGuarded
{
}