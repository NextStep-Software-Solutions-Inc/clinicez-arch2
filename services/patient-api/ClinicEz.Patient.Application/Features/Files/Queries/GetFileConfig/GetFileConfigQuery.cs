using ClinicEz.Shared.Interfaces;
using MediatR;
using Microsoft.EntityFrameworkCore;
using ClinicEz.Patient.Domain.Entities;
using ClinicEz.Patient.Domain.Interfaces;

namespace ClinicEz.Patient.Application.Features.Files.Queries.GetFileConfig;

public sealed record GetFileConfigQuery(Guid PatientId) : IRequest<FileConfigDto>;



internal sealed class GetFileConfigQueryHandler : IRequestHandler<GetFileConfigQuery, FileConfigDto>
{
    private readonly ClinicEz.Patient.Domain.Interfaces.IPatientStorageProfileRepository _profileRepository;
    private readonly ClinicEz.Patient.Domain.Interfaces.IDocumentTypeRepository _documentTypeRepository;

    public GetFileConfigQueryHandler(
        ClinicEz.Patient.Domain.Interfaces.IPatientStorageProfileRepository profileRepository,
        ClinicEz.Patient.Domain.Interfaces.IDocumentTypeRepository documentTypeRepository)
    {
        _profileRepository = profileRepository;
        _documentTypeRepository = documentTypeRepository;
    }

    public async Task<FileConfigDto> Handle(GetFileConfigQuery request, CancellationToken cancellationToken)
    {
        var profile = await _profileRepository.GetByPatientIdAsync(request.PatientId, cancellationToken);
        var documentTypes = await _documentTypeRepository.GetAllActiveAsync(cancellationToken);

        var documentTypeDtos = documentTypes.Select(dt => new DocumentTypeDto(
            dt.Id,
            dt.Code,
            dt.Label,
            dt.Description,
            System.Text.Json.JsonSerializer.Deserialize<List<string>>(dt.SupportedExtensionsJson) ?? new List<string>(),
            System.Text.Json.JsonSerializer.Deserialize<List<string>>(dt.SupportedMimeTypesJson) ?? new List<string>(),
            dt.NativePreviewKind,
            dt.SortOrder,
            dt.IsActive
        )).ToList();

        if (profile == null)
        {
            // Default quota: 1GB
            return new FileConfigDto(null, 1024 * 1024 * 1024, 0, documentTypeDtos);
        }

        return new FileConfigDto(profile.EncryptedMAK, profile.QuotaBytes, profile.UsedBytes, documentTypeDtos);
    }
}
