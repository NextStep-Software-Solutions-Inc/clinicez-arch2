using CLINICEZ.Shared.Interfaces;
using Microsoft.AspNetCore.Http;
using System.Security.Claims;

namespace CLINICEZ.TenantManagement.Infrastructure.Services;

public sealed class CurrentUserService(IHttpContextAccessor httpContextAccessor) : ICurrentUserService
{
    private readonly IHttpContextAccessor _httpContextAccessor = httpContextAccessor;
    public string? UserId => _httpContextAccessor.HttpContext?.User?.FindFirst(ClaimTypes.NameIdentifier).Value;
}