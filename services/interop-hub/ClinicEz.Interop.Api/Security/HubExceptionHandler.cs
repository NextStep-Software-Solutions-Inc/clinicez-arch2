using ClinicEz.Interop.Application;
using Microsoft.AspNetCore.Diagnostics;
using Microsoft.AspNetCore.Mvc;

namespace ClinicEz.Interop.Api.Security;

/// <summary>Turns <see cref="HubRequestException"/> into a ProblemDetails response with its status code.</summary>
public sealed class HubExceptionHandler(IProblemDetailsService problems) : IExceptionHandler
{
    public async ValueTask<bool> TryHandleAsync(HttpContext httpContext, Exception exception, CancellationToken cancellationToken)
    {
        if (exception is not HubRequestException hub) return false;

        httpContext.Response.StatusCode = (int)hub.StatusCode;
        return await problems.TryWriteAsync(new ProblemDetailsContext
        {
            HttpContext = httpContext,
            Exception = exception,
            ProblemDetails = new ProblemDetails { Status = (int)hub.StatusCode, Detail = hub.Message }
        });
    }
}
