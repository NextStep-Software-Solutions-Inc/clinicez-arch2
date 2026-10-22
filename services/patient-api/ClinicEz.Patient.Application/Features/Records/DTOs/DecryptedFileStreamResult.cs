using System.IO;

namespace ClinicEz.Patient.Application.Features.Records.DTOs;

public sealed record DecryptedFileStreamResult(
    Stream Stream,
    string ContentType,
    string FileName
);
