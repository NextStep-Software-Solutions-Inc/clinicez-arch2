using CLINICEZ.Shared.Interfaces;
using MediatR;
using Microsoft.EntityFrameworkCore;
using PatientApp.Domain.Entities;
using PatientApp.Domain.Interfaces;

namespace PatientApp.Application.Features.Files.Queries.GetFileConfig;

public sealed record GetFileConfigQuery(Guid PatientId) : IRequest<FileConfigDto>;

internal sealed class GetFileConfigQueryHandler : IRequestHandler<GetFileConfigQuery, FileConfigDto>
{
    private readonly IPatientStorageProfileRepository _profileRepository;

    public GetFileConfigQueryHandler(IPatientStorageProfileRepository profileRepository)
    {
        _profileRepository = profileRepository;
    }

    public async Task<FileConfigDto> Handle(GetFileConfigQuery request, CancellationToken cancellationToken)
    {
        var profile = await _profileRepository.GetByPatientIdAsync(request.PatientId, cancellationToken);

        if (profile == null)
        {
            // Default quota: 1GB
            return new FileConfigDto(null, 1024 * 1024 * 1024, 0);
        }

        return new FileConfigDto(profile.EncryptedMAK, profile.QuotaBytes, profile.UsedBytes);
    }
}
