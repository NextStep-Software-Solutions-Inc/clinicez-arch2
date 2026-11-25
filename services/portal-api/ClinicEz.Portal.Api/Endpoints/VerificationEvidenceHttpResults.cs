using ClinicEz.Portal.Application.Features.DirectoryVerification;
using Microsoft.AspNetCore.Http;

namespace ClinicEz.Portal.Api.Endpoints;

internal static class VerificationEvidenceHttpResults
{
    public static IResult ToInlineFileResult(
        HttpContext httpContext,
        VerificationEvidenceLookupOutcome outcome,
        string notFoundFallbackMessage)
    {
        if (outcome.File == null)
        {
            return outcome.ClinicUnavailable
                ? Results.Json(new { Message = outcome.ErrorMessage ?? "Clinic workstation is unreachable." }, statusCode: 502)
                : Results.NotFound(new { Message = outcome.ErrorMessage ?? notFoundFallbackMessage });
        }

        var safeFileName = VerificationEvidenceResolver.SanitizeFileName(outcome.File.FileName, null);
        var safeContentType = VerificationEvidenceResolver.NormalizeContentType(outcome.File.ContentType, safeFileName);

        httpContext.Response.Headers.CacheControl = "private, no-store";
        httpContext.Response.Headers.XContentTypeOptions = "nosniff";
        httpContext.Response.Headers.ContentDisposition = $"inline; filename=\"{safeFileName}\"";
        return Results.File(outcome.File.Content, safeContentType);
    }
}
