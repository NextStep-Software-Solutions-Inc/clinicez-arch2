using System.IO;
using System.Threading;
using System.Threading.Tasks;

namespace ClinicEz.Patient.Application.Common.Interfaces;

public sealed record ImageConversionResult(
    bool IsClean,
    string? ErrorReason,
    byte[] Data,
    string ContentType,
    string FileName,
    long FileSizeBytes,
    string HashSha256,
    bool WasConverted,
    bool WasExifStripped);

public interface IImageConversionService
{
    Task<ImageConversionResult> ProcessAndSanitizeImageAsync(
        Stream inputStream,
        string originalFileName,
        string declaredContentType,
        CancellationToken ct = default);
}
