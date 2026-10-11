using ClinicEz.Billing.Application.Abstractions;
using ClinicEz.Shared.Common;
using ClinicEz.Shared.LocalAuth;
using Microsoft.AspNetCore.Mvc;
using Microsoft.AspNetCore.Mvc.Filters;

namespace ClinicEz.Billing.Api.Authorization;

/// <summary>
/// Requires the caller's session to carry the given permission (granted by the staff member's billing role, or by the narrow
/// internal-service set). Authentication itself is enforced earlier by the secure-by-default fallback policy.
/// </summary>
[AttributeUsage(AttributeTargets.Class | AttributeTargets.Method, AllowMultiple = true)]
public sealed class HasPermissionAttribute : Attribute, IAsyncActionFilter, IPermissionGuarded
{
    public string Permission { get; }

    public HasPermissionAttribute(string permission)
    {
        Permission = permission ?? throw new ArgumentNullException(nameof(permission));
    }

    public async Task OnActionExecutionAsync(ActionExecutingContext context, ActionExecutionDelegate next)
    {
        var billing = context.HttpContext.RequestServices.GetRequiredService<IBillingContext>();

        if (!billing.HasPermission(Permission))
        {
            context.Result = new ObjectResult(ApiResponse<object>.Fail(
                $"Forbidden: Insufficient permissions. Required permission '{Permission}' is not granted for your billing role.",
                new[] { new ApiFieldError("Permission", "FORBIDDEN", $"Missing required permission: {Permission}") }))
            {
                StatusCode = StatusCodes.Status403Forbidden
            };
            return;
        }

        await next();
    }
}
