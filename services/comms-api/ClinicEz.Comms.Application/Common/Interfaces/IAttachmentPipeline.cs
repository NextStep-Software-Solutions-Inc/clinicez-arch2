using System.IO;
using System.Threading;
using System.Threading.Tasks;

namespace ClinicEz.Comms.Application.Common.Interfaces;

public sealed record SanitizedAttachmentResult(
    bool IsClean,
    string? QuarantineReason,
    byte[] SanitizedBytes,
    bool StrippedExif,
    string Sha256Hash,
    string ContentType,
    string SafeFileName);

public interface IAttachmentPipeline
{
    Task<SanitizedAttachmentResult> ProcessAsync(Stream stream, string fileName, string declaredContentType, CancellationToken ct = default);
}
