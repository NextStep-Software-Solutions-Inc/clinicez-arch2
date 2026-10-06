using System.Security.Cryptography;
using System.Text;
using System.Text.Json;
using ClinicEz.Patient.Api.Abstractions;
using ClinicEz.Patient.Domain.Interfaces;
using ClinicEz.Patient.Infrastructure.Options;
using Microsoft.AspNetCore.Mvc;
using Microsoft.Extensions.Options;

namespace ClinicEz.Patient.Api.Endpoints.Webhooks;

public sealed class ClerkWebhookEndpoint : IEndpoint
{
    public void MapEndpoint(IEndpointRouteBuilder app)
    {
        app.MapPost("/webhooks/clerk", async (
                HttpRequest request,
                [FromServices] IOptions<ClerkOptions> clerkOptions,
                [FromServices] IPatientRepository patientRepo,
                [FromServices] IUnitOfWork unitOfWork,
                [FromServices] ILogger<ClerkWebhookEndpoint> logger,
                CancellationToken ct) =>
            {
                var secret = clerkOptions.Value.WebhookSecret;
                if (string.IsNullOrWhiteSpace(secret))
                {
                    logger.LogWarning("[ClerkWebhook] Webhook secret is not configured in ClerkOptions.");
                    return Results.Problem("Webhook secret not configured.", statusCode: StatusCodes.Status500InternalServerError);
                }

                if (!request.Headers.TryGetValue("svix-id", out var svixId) ||
                    !request.Headers.TryGetValue("svix-timestamp", out var svixTimestamp) ||
                    !request.Headers.TryGetValue("svix-signature", out var svixSignature))
                {
                    logger.LogWarning("[ClerkWebhook] Missing required Svix headers.");
                    return Results.Unauthorized();
                }

                // Verify timestamp tolerance (within 5 minutes) to protect against replay attacks
                if (!long.TryParse(svixTimestamp, out var timestamp))
                {
                    logger.LogWarning("[ClerkWebhook] Invalid Svix timestamp format.");
                    return Results.Unauthorized();
                }

                var now = DateTimeOffset.UtcNow.ToUnixTimeSeconds();
                if (Math.Abs(now - timestamp) > 300)
                {
                    logger.LogWarning("[ClerkWebhook] Timestamp out of acceptable tolerance window.");
                    return Results.Unauthorized();
                }

                // Read raw body
                using var reader = new StreamReader(request.Body, Encoding.UTF8);
                var rawBody = await reader.ReadToEndAsync(ct);

                // Verify signature
                if (!VerifySvixSignature(secret, svixId.ToString(), svixTimestamp.ToString(), rawBody, svixSignature.ToString()))
                {
                    logger.LogWarning("[ClerkWebhook] Svix signature verification failed.");
                    return Results.Unauthorized();
                }

                // Parse JSON payload
                using var document = JsonDocument.Parse(rawBody);
                var root = document.RootElement;

                if (!root.TryGetProperty("type", out var typeProp))
                {
                    return Results.BadRequest(new { message = "Missing event type in payload." });
                }

                var eventType = typeProp.GetString();
                if (!root.TryGetProperty("data", out var dataProp))
                {
                    return Results.BadRequest(new { message = "Missing data property in payload." });
                }

                var clerkUserId = dataProp.TryGetProperty("id", out var idProp) ? idProp.GetString() : null;
                if (string.IsNullOrWhiteSpace(clerkUserId))
                {
                    logger.LogWarning("[ClerkWebhook] Event data does not contain a valid user id.");
                    return Results.Ok(new { message = "Skipped: no clerk user id found." });
                }

                logger.LogInformation("[ClerkWebhook] Processing event '{EventType}' for Clerk user '{ClerkUserId}'", eventType, clerkUserId);

                switch (eventType)
                {
                    case "user.created":
                    case "user.updated":
                        await HandleUserCreatedOrUpdatedAsync(dataProp, clerkUserId, patientRepo, unitOfWork, ct);
                        break;

                    case "user.deleted":
                        await HandleUserDeletedAsync(clerkUserId, patientRepo, unitOfWork, ct);
                        break;

                    default:
                        logger.LogInformation("[ClerkWebhook] Unhandled event type: {EventType}", eventType);
                        break;
                }

                return Results.Ok(new { message = "Webhook processed successfully." });
            })
            .WithTags("Webhooks")
            .WithName("ClerkWebhook")
            .WithSummary("Receive and process user lifecycle webhooks from Clerk")
            .WithDescription("Processes user.created, user.updated, and user.deleted events with Svix HMAC signature verification.")
            .Produces(StatusCodes.Status200OK)
            .Produces(StatusCodes.Status401Unauthorized)
            .AllowAnonymous();
    }

    private static async Task HandleUserCreatedOrUpdatedAsync(
        JsonElement data,
        string clerkUserId,
        IPatientRepository patientRepo,
        IUnitOfWork unitOfWork,
        CancellationToken ct)
    {
        var firstName = data.TryGetProperty("first_name", out var fn) ? fn.GetString() : null;
        var lastName = data.TryGetProperty("last_name", out var ln) ? ln.GetString() : null;

        string? primaryEmail = null;
        if (data.TryGetProperty("primary_email_address_id", out var primaryEmailIdProp))
        {
            var primaryEmailId = primaryEmailIdProp.GetString();
            if (data.TryGetProperty("email_addresses", out var emailsProp) && emailsProp.ValueKind == JsonValueKind.Array)
            {
                foreach (var emailItem in emailsProp.EnumerateArray())
                {
                    if (emailItem.TryGetProperty("id", out var eid) && eid.GetString() == primaryEmailId &&
                        emailItem.TryGetProperty("email_address", out var eaddr))
                    {
                        primaryEmail = eaddr.GetString();
                        break;
                    }
                }
            }
        }

        // Fallback to first available email if primary is not found
        if (primaryEmail is null && data.TryGetProperty("email_addresses", out var fallbackEmailsProp) && fallbackEmailsProp.ValueKind == JsonValueKind.Array)
        {
            foreach (var emailItem in fallbackEmailsProp.EnumerateArray())
            {
                if (emailItem.TryGetProperty("email_address", out var eaddr))
                {
                    primaryEmail = eaddr.GetString();
                    break;
                }
            }
        }

        var existing = await patientRepo.GetByClerkUserIdAsync(clerkUserId, ct);
        if (existing is null)
        {
            var patient = new Domain.Entities.Patient
            {
                ClientId = Guid.NewGuid(),
                ClerkUserId = clerkUserId,
                FirstName = !string.IsNullOrWhiteSpace(firstName) ? firstName : (primaryEmail ?? "User"),
                LastName = lastName ?? string.Empty,
                Email = primaryEmail,
                Nationality = "Filipino",
                CreatedAt = DateTime.UtcNow,
                CreatedBy = "clerk-webhook",
                UpdatedAt = DateTime.UtcNow,
                UpdatedBy = "clerk-webhook"
            };

            await patientRepo.AddAsync(patient, ct);
        }
        else
        {
            if (!string.IsNullOrWhiteSpace(firstName)) existing.FirstName = firstName;
            if (lastName is not null) existing.LastName = lastName;
            if (!string.IsNullOrWhiteSpace(primaryEmail)) existing.Email = primaryEmail;
            existing.UpdatedAt = DateTime.UtcNow;
            existing.UpdatedBy = "clerk-webhook";
        }

        await unitOfWork.SaveChangesAsync(ct);
    }

    private static async Task HandleUserDeletedAsync(
        string clerkUserId,
        IPatientRepository patientRepo,
        IUnitOfWork unitOfWork,
        CancellationToken ct)
    {
        var existing = await patientRepo.GetByClerkUserIdAsync(clerkUserId, ct);
        if (existing is not null)
        {
            existing.IsDeleted = true;
            existing.DeletedAt = DateTime.UtcNow;
            existing.DeletedBy = "clerk-webhook";
            existing.UpdatedAt = DateTime.UtcNow;
            existing.UpdatedBy = "clerk-webhook";

            await unitOfWork.SaveChangesAsync(ct);
        }
    }

    public static bool VerifySvixSignature(string secret, string svixId, string svixTimestamp, string payload, string svixSignature)
    {
        try
        {
            var secretKey = secret.StartsWith("whsec_", StringComparison.OrdinalIgnoreCase)
                ? secret[6..]
                : secret;

            byte[] keyBytes = Convert.FromBase64String(secretKey);
            var signedContent = $"{svixId}.{svixTimestamp}.{payload}";
            var contentBytes = Encoding.UTF8.GetBytes(signedContent);

            using var hmac = new HMACSHA256(keyBytes);
            var hashBytes = hmac.ComputeHash(contentBytes);
            var expectedSignature = "v1," + Convert.ToBase64String(hashBytes);

            var signatures = svixSignature.Split(' ', StringSplitOptions.RemoveEmptyEntries);
            foreach (var sig in signatures)
            {
                var sigBytes = Encoding.UTF8.GetBytes(sig);
                var expectedBytes = Encoding.UTF8.GetBytes(expectedSignature);

                if (sigBytes.Length == expectedBytes.Length && CryptographicOperations.FixedTimeEquals(sigBytes, expectedBytes))
                {
                    return true;
                }
            }

            return false;
        }
        catch
        {
            return false;
        }
    }
}
