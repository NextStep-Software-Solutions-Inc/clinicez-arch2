using ClinicEz.Portal.Api.Abstractions;
using ClinicEz.Portal.Application.Features.PublicUploads;
using MediatR;
using Microsoft.AspNetCore.Builder;
using Microsoft.AspNetCore.Http;
using Microsoft.AspNetCore.Http.Features;
using Microsoft.AspNetCore.Routing;
using Microsoft.Extensions.Options;

namespace ClinicEz.Portal.Api.Endpoints;

/// <summary>
/// Anonymous endpoint external labs use to upload a result file with the link a clinic gave them. The portal stores nothing:
/// it relays the file to the clinic that issued the token. There is deliberately no way to ask whether a token is valid.
/// </summary>
public sealed class PublicLabUploadEndpoints : IEndpoint
{
    public const string RateLimitPolicy = "lab-upload-relay";

    /// <summary>Room for multipart boundaries and the optional lab-name field on top of the file itself.</summary>
    private const int MultipartOverheadBytes = 64 * 1024;

    public void MapEndpoint(IEndpointRouteBuilder app)
    {
        app.MapPost("/public/lab-uploads/{token}", async (
            string token,
            HttpContext httpContext,
            ISender sender,
            IOptions<LabUploadOptions> options,
            CancellationToken ct) =>
        {
            var limits = options.Value;
            var bodyLimit = (long)limits.MaxFileBytes + MultipartOverheadBytes;

            var sizeFeature = httpContext.Features.Get<IHttpMaxRequestBodySizeFeature>();
            if (sizeFeature is { IsReadOnly: false }) sizeFeature.MaxRequestBodySize = bodyLimit;

            if (httpContext.Request.ContentLength > bodyLimit) return Results.StatusCode(StatusCodes.Status413PayloadTooLarge);
            if (!httpContext.Request.HasFormContentType) return Results.StatusCode(StatusCodes.Status415UnsupportedMediaType);

            IFormCollection form;
            try
            {
                form = await httpContext.Request.ReadFormAsync(ct);
            }
            catch (Exception ex) when (ex is BadHttpRequestException or InvalidDataException)
            {
                return Results.StatusCode(StatusCodes.Status413PayloadTooLarge);
            }

            var file = form.Files.GetFile("file") ?? form.Files.FirstOrDefault();
            if (file is null || file.Length == 0) return Results.BadRequest(new { Message = "Attach the result file." });
            if (file.Length > limits.MaxFileBytes) return Results.StatusCode(StatusCodes.Status413PayloadTooLarge);

            using var buffer = new MemoryStream((int)file.Length);
            await using (var stream = file.OpenReadStream())
            {
                await stream.CopyToAsync(buffer, ct);
            }
            var content = buffer.ToArray();

            var verdict = LabUploadValidator.Validate(limits, file.ContentType, content);
            switch (verdict)
            {
                case LabUploadVerdict.UnsupportedType:
                    return Results.StatusCode(StatusCodes.Status415UnsupportedMediaType);
                case LabUploadVerdict.TooLarge:
                    return Results.StatusCode(StatusCodes.Status413PayloadTooLarge);
                case LabUploadVerdict.EmptyFile or LabUploadVerdict.ContentMismatch:
                    return Results.BadRequest(new { Message = "The file is empty or does not match its type." });
            }

            await sender.Send(new RelayExternalLabUploadCommand(token, file.FileName, file.ContentType, content, form["labName"].ToString()), ct);

            // The same answer whether or not the token named a live clinic.
            return Results.Accepted(value: new { Accepted = true });
        })
        .AllowAnonymous()
        .DisableAntiforgery()
        .RequireRateLimiting(RateLimitPolicy)
        .WithName("RelayExternalLabUpload")
        .WithDescription("Anonymous, rate limited. Multipart upload (field 'file', optional 'labName') of a lab result for the clinic that issued the token. Strict size and content-type limits; nothing is stored here. Always 202 for a well-formed upload.")
        .WithTags("Public");
    }
}
