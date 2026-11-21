using System;
using ClinicEz.Comms.Domain.Enums;

namespace ClinicEz.Comms.Application.Models;

public sealed record CommsAttachmentDto(
    Guid AttachmentId,
    string FileKey,
    string FileName,
    string ContentType,
    long FileSizeBytes,
    string Sha256Checksum,
    AttachmentStatus Status,
    string? QuarantineReason,
    bool StrippedExif);
