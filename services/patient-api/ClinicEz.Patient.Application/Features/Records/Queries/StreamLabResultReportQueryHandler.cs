using System;
using System.IO;
using System.Threading;
using System.Threading.Tasks;
using ClinicEz.Patient.Application.Common.Interfaces;
using ClinicEz.Patient.Application.Features.Records.DTOs;
using ClinicEz.Patient.Domain.Interfaces;
using ClinicEz.Shared.Exceptions;
using MediatR;

namespace ClinicEz.Patient.Application.Features.Records.Queries;

public sealed class StreamLabResultReportQueryHandler : IRequestHandler<StreamLabResultReportQuery, DecryptedFileStreamResult>
{
    private readonly IPatientDocumentRepository _documentRepository;
    private readonly IPatientEncryptionService _encryptionService;
    private readonly IStorageService _storageService;

    public StreamLabResultReportQueryHandler(
        IPatientDocumentRepository documentRepository,
        IPatientEncryptionService encryptionService,
        IStorageService storageService)
    {
        _documentRepository = documentRepository;
        _encryptionService = encryptionService;
        _storageService = storageService;
    }

    public async Task<DecryptedFileStreamResult> Handle(StreamLabResultReportQuery request, CancellationToken cancellationToken)
    {
        var report = await _documentRepository.GetLabReportAsync(request.PatientId, request.ReportId, cancellationToken)
            ?? throw new NotFoundException($"Lab report '{request.ReportId}' was not found.");

        if (string.IsNullOrWhiteSpace(report.FileStorageKey))
        {
            throw new NotFoundException($"Lab report '{request.ReportId}' has no attached file.");
        }

        await using var encryptedStream = await _storageService.OpenReadStreamAsync(report.FileStorageKey, cancellationToken);

        // If encrypted with PMK:
        if (!string.IsNullOrWhiteSpace(report.WrappedKeyJson))
        {
            var decryptedStream = await _encryptionService.DecryptToStreamAsync(
                encryptedStream,
                report.EncryptionIvBase64 ?? string.Empty,
                report.EncryptionTagBase64 ?? string.Empty,
                report.WrappedKeyJson,
                request.PatientId,
                cancellationToken);

            decryptedStream.Position = 0;

            return new DecryptedFileStreamResult(
                Stream: decryptedStream,
                ContentType: report.FileContentType ?? "application/pdf",
                FileName: report.FileName ?? "lab-report.pdf"
            );
        }
        else
        {
            // Legacy/unencrypted dev file fallback: copy to seekable MemoryStream
            var memoryStream = new MemoryStream();
            await encryptedStream.CopyToAsync(memoryStream, cancellationToken);
            memoryStream.Position = 0;

            return new DecryptedFileStreamResult(
                Stream: memoryStream,
                ContentType: report.FileContentType ?? "application/pdf",
                FileName: report.FileName ?? "lab-report.pdf"
            );
        }
    }
}
