namespace ClinicEz.Portal.Api.Auth;

/// <summary>
/// Authorization policy of the service-to-service endpoints (e.g. the PhilHealth credentials philhealth-proxy reads):
/// only a caller presenting the shared <c>X-Internal-Key</c> (<c>Internal:ApiKey</c>, or <c>Internal:PreviousApiKey</c> while rotating) gets in.
/// </summary>
public static class InternalServiceAuth
{
    public const string Policy = "InternalService";
}
