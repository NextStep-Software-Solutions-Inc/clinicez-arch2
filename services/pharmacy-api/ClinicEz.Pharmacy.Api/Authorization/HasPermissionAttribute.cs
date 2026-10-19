using System;
using System.Threading.Tasks;
using ClinicEz.Pharmacy.Domain.Interfaces;
using ClinicEz.Shared.Common;
using Microsoft.AspNetCore.Http;
using Microsoft.AspNetCore.Mvc;
using Microsoft.AspNetCore.Mvc.Filters;
using Microsoft.Extensions.DependencyInjection;

namespace ClinicEz.Pharmacy.Api.Authorization;

/// <summary>
/// Requires a pharmacy permission. Staff permissions come from the validated token (role-derived).
/// </summary>
[AttributeUsage(AttributeTargets.Class | AttributeTargets.Method, AllowMultiple = true)]
public sealed class HasPermissionAttribute : Attribute, IAsyncActionFilter, ClinicEz.Shared.LocalAuth.IPermissionGuarded
{
    public string Permission { get; }

    public HasPermissionAttribute(string permission)
    {
        Permission = permission ?? throw new ArgumentNullException(nameof(permission));
    }

    public async Task OnActionExecutionAsync(ActionExecutingContext context, ActionExecutionDelegate next)
    {
        var pharmacyContext = context.HttpContext.RequestServices.GetRequiredService<IPharmacyContext>();

        if (!pharmacyContext.HasPermission(Permission))
        {
            context.Result = new ObjectResult(ApiResponse<object>.Fail(
                $"Forbidden: Insufficient permissions. Required permission '{Permission}' is not granted for this pharmacy role.",
                new[] { new ApiFieldError("Permission", "FORBIDDEN", $"Missing required permission: {Permission}") }))
            {
                StatusCode = StatusCodes.Status403Forbidden
            };
            return;
        }

        await next();
    }
}