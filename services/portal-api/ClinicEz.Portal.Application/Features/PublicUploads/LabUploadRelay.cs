using ClinicEz.Portal.Application.Features.Hub;
using ClinicEz.Portal.Application.Interfaces;
using ClinicEz.Portal.Domain.Entities;
using ClinicEz.Shared.Common;
using ClinicEz.Shared.Interop;
using ClinicEz.Shared.Interoperability;
using MediatR;
using Microsoft.EntityFrameworkCore;
using Microsoft.Extensions.Logging;
using Microsoft.Extensions.Options;

namespace ClinicEz.Portal.Application.Features.PublicUploads;

/// <summary>Limits for the anonymous external-lab upload relay (<c>LabUploads</c> section).</summary>
public sealed class LabUploadOptions
{
    public const string SectionName = "LabUploads";

    public int MaxFileBytes { get; set; } = 5 * 1024 * 1024;

    /// <summary>Only these content types are relayed; anything else is refused before the token is even looked at.</summary>
    public List<string> AllowedContentTypes { get; set; } = ["application/pdf", "image/jpeg", "image/png"];

    public int RateLimitPermits { get; set; } = 20;
    public int RateLimitWindowMinutes { get; set; } = 10;
}

public enum LabUploadVerdict
{
    Accepted,
    EmptyFile,
    TooLarge,
    UnsupportedType,
    ContentMismatch
}

/// <summary>Size, content-type allow-list and magic-byte checks. Independent of the token, so they reveal nothing about it.</summary>
public static class LabUploadValidator
{
    private static readonly Dictionary<string, byte[][]> Signatures = new(StringComparer.OrdinalIgnoreCase)
    {
        ["application/pdf"] = [[0x25, 0x50, 0x44, 0x46, 0x2D]],
        ["image/jpeg"] = [[0xFF, 0xD8, 0xFF]],
        ["image/png"] = [[0x89, 0x50, 0x4E, 0x47, 0x0D, 0x0A, 0x1A, 0x0A]]
    };

    public static LabUploadVerdict Validate(LabUploadOptions options, string? contentType, ReadOnlySpan<byte> content)
    {
        var normalized = Normalize(contentType);
        if (normalized is null || !options.AllowedContentTypes.Contains(normalized, StringComparer.OrdinalIgnoreCase))
        {
            return LabUploadVerdict.UnsupportedType;
        }

        if (content.Length == 0) return LabUploadVerdict.EmptyFile;
        if (content.Length > options.MaxFileBytes) return LabUploadVerdict.TooLarge;

        if (Signatures.TryGetValue(normalized, out var signatures) && !MatchesAny(signatures, content))
        {
            return LabUploadVerdict.ContentMismatch;
        }

        return LabUploadVerdict.Accepted;
    }

    private static bool MatchesAny(byte[][] signatures, ReadOnlySpan<byte> content)
    {
        foreach (var signature in signatures)
        {
            if (content.StartsWith(signature)) return true;
        }
        return false;
    }

    public static string? Normalize(string? contentType)
    {
        if (string.IsNullOrWhiteSpace(contentType)) return null;
        var semicolon = contentType.IndexOf(';');
        return (semicolon < 0 ? contentType : contentType[..semicolon]).Trim().ToLowerInvariant();
    }

    public static string SafeFileName(string? fileName, string contentType)
    {
        var name = Path.GetFileName((fileName ?? string.Empty).Replace('\\', '/'));
        name = new string(name.Where(c => !char.IsControl(c)).ToArray()).Trim();
        if (name.Length > 120) name = name[^120..];
        if (name.Length > 0) return name;

        return contentType switch
        {
            "application/pdf" => "result.pdf",
            "image/jpeg" => "result.jpg",
            "image/png" => "result.png",
            _ => "result"
        };
    }
}

/// <summary>
/// Relays an anonymous external-lab upload to the clinic that issued the token. The portal stores nothing: it checks the token
/// names an active clinic, wraps the file in <c>lab.result.external.submitted</c> and queues it for that clinic's cell. The clinic
/// validates the token's secret half against its own hashed grant. Unknown or malformed tokens do nothing and look the same to the caller.
/// </summary>
public record RelayExternalLabUploadCommand(
    string Token,
    string? FileName,
    string? ContentType,
    byte[] Content,
    string? LabName) : IRequest;

public class RelayExternalLabUploadCommandHandler(
    IApplicationDbContext context,
    IInteropPublisher publisher,
    IOptions<LabUploadOptions> options,
    ILogger<RelayExternalLabUploadCommandHandler> logger) : IRequestHandler<RelayExternalLabUploadCommand>
{
    public async Task Handle(RelayExternalLabUploadCommand request, CancellationToken cancellationToken)
    {
        if (LabUploadValidator.Validate(options.Value, request.ContentType, request.Content) != LabUploadVerdict.Accepted)
        {
            return;
        }

        var facilityId = ParseFacilityId(request.Token);
        if (facilityId is null) return;

        var facility = await context.Facilities.AsNoTracking()
            .FirstOrDefaultAsync(f => f.Id == facilityId.Value, cancellationToken);
        if (facility is null
            || facility.FacilityType != FacilityType.Clinic
            || facility.Status != FacilityStatus.Active
            || !FacilityCells.IsRoutable(facility))
        {
            logger.LogInformation("External lab upload for an unknown or inactive clinic was dropped.");
            return;
        }

        var contentType = LabUploadValidator.Normalize(request.ContentType)!;
        var uploadId = Guid.NewGuid();
        var trimmedLabName = request.LabName?.Trim();
        var labName = string.IsNullOrEmpty(trimmedLabName) ? null : trimmedLabName[..Math.Min(trimmedLabName.Length, 120)];

        publisher.Enqueue(
            InteropTypes.LabResultExternalSubmitted,
            Party.Portal,
            Party.ForFacility(facility.TenantId.ToString(), facility.Id.ToString(), FacilityType.Clinic),
            uploadId,
            new ExternalLabResultUploadedEvent
            {
                UploadId = uploadId,
                UploadToken = request.Token,
                UploaderKind = UploaderKind.ExternalLab,
                UploadedBy = nameof(UploaderKind.ExternalLab),
                FileName = LabUploadValidator.SafeFileName(request.FileName, contentType),
                ContentType = contentType,
                ExternalLabName = labName,
                DocumentType = contentType == "application/pdf" ? "PDF" : "Photo",
                FileBase64 = Convert.ToBase64String(request.Content),
                UploadedAt = DateTime.UtcNow
            });

        await context.SaveChangesAsync(cancellationToken);
    }

    /// <summary>Token format: <c>{facilityId:N}.{random}</c>.</summary>
    private static Guid? ParseFacilityId(string token)
    {
        if (string.IsNullOrWhiteSpace(token) || token.Length > 200) return null;

        var dot = token.IndexOf('.');
        if (dot != 32 || dot == token.Length - 1) return null;

        return Guid.TryParseExact(token[..dot], "N", out var id) ? id : null;
    }
}
