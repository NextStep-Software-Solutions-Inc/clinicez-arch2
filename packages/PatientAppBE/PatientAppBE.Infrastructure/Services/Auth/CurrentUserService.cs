using System.Security.Claims;
using Clinic EZ.Shared.Interfaces;
using Microsoft.AspNetCore.Http;

namespace PatientAppBE.Infrastructure.Services.Auth;

public sealed class CurrentUserService : ICurrentUserService
{
    private readonly IHttpContextAccessor _httpContextAccessor;

    public CurrentUserService(IHttpContextAccessor httpContextAccessor)
        => _httpContextAccessor = httpContextAccessor;

    /// <summary>
    /// Returns the Clerk user ID from the 'sub' claim in the JWT,
    /// or null when there is no authenticated user.
    /// </summary>
    public string? UserId =>
        _httpContextAccessor.HttpContext?.User?.FindFirstValue(ClaimTypes.NameIdentifier)
        ?? _httpContextAccessor.HttpContext?.User?.FindFirstValue("sub");
}
