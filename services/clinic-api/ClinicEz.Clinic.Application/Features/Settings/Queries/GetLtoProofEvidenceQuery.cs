using System.Threading;
using System.Threading.Tasks;
using ClinicEz.Clinic.Application.Common.Helpers;
using ClinicEz.Clinic.Application.Common.Interfaces;
using ClinicEz.Clinic.Domain.Entities;
using ClinicEz.Clinic.Domain.Interfaces;
using MediatR;
using Microsoft.EntityFrameworkCore;

namespace ClinicEz.Clinic.Application.Features.Settings.Queries;

public sealed record GetLtoProofEvidenceQuery() : IRequest<VerificationEvidenceFileResult?>;

public sealed class GetLtoProofEvidenceQueryHandler : IRequestHandler<GetLtoProofEvidenceQuery, VerificationEvidenceFileResult?>
{
    private readonly IRepository<FacilitySettings> _settingsRepo;
    private readonly IClinicStorageService _storageService;
    private readonly IClinicEncryptionService? _encryptionService;

    public GetLtoProofEvidenceQueryHandler(
        IRepository<FacilitySettings> settingsRepo,
        IClinicStorageService storageService,
        IClinicEncryptionService? encryptionService = null)
    {
        _settingsRepo = settingsRepo;
        _storageService = storageService;
        _encryptionService = encryptionService;
    }

    public async Task<VerificationEvidenceFileResult?> Handle(GetLtoProofEvidenceQuery request, CancellationToken ct)
    {
        var settings = await _settingsRepo.Query().AsNoTracking().FirstOrDefaultAsync(ct);
        if (settings == null || string.IsNullOrWhiteSpace(settings.LtoEvidenceObjectKey))
        {
            return null;
        }

        return await VerificationEvidenceHelper.ReadDecryptedEvidenceAsync(
            _storageService,
            _encryptionService,
            settings.TenantId,
            settings.ClinicId,
            settings.LtoEvidenceObjectKey,
            ct);
    }
}
