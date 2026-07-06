using CLINICEZ.Shared.Interfaces;
using MediatR;
using PatientApp.Application.Common.Interfaces;

namespace PatientApp.Application.Features.Files.Commands.GenerateUploadUrl;

public sealed record GenerateUploadUrlCommand(Guid PatientId, string ContentType, string FileExtension) : IRequest<GenerateUploadUrlResponse>;

internal sealed class GenerateUploadUrlCommandHandler : IRequestHandler<GenerateUploadUrlCommand, GenerateUploadUrlResponse>
{
    private readonly IStorageService _storageService;

    public GenerateUploadUrlCommandHandler(IStorageService storageService)
    {
        _storageService = storageService;
    }

    public async Task<GenerateUploadUrlResponse> Handle(GenerateUploadUrlCommand request, CancellationToken cancellationToken)
    {
        // Generate a random storage key
        var fileId = Guid.NewGuid();
        var storageKey = $"patients/{request.PatientId}/files/{fileId}{request.FileExtension}";

        var expiresIn = TimeSpan.FromMinutes(15);
        var uploadUrl = await _storageService.GeneratePresignedUploadUrlAsync(storageKey, request.ContentType, expiresIn, cancellationToken);

        return new GenerateUploadUrlResponse(storageKey, uploadUrl, DateTime.UtcNow.Add(expiresIn));
    }
}
