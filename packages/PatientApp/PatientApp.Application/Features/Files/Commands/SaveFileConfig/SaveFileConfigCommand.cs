using CLINICEZ.Shared.Interfaces;
using MediatR;
using PatientApp.Domain.Entities;
using PatientApp.Domain.Interfaces;

namespace PatientApp.Application.Features.Files.Commands.SaveFileConfig;

public sealed record SaveFileConfigCommand(Guid PatientId, string EncryptedMAK) : IRequest<Unit>;

internal sealed class SaveFileConfigCommandHandler : IRequestHandler<SaveFileConfigCommand, Unit>
{
    private readonly IPatientStorageProfileRepository _profileRepository;
    private readonly IUnitOfWork _unitOfWork;

    public SaveFileConfigCommandHandler(
        IPatientStorageProfileRepository profileRepository,
        IUnitOfWork unitOfWork)
    {
        _profileRepository = profileRepository;
        _unitOfWork = unitOfWork;
    }

    public async Task<Unit> Handle(SaveFileConfigCommand request, CancellationToken cancellationToken)
    {
        var profile = await _profileRepository.GetByPatientIdAsync(request.PatientId, cancellationToken);
        if (profile == null)
        {
            profile = new PatientStorageProfile
            {
                PatientId = request.PatientId,
                EncryptedMAK = request.EncryptedMAK,
                QuotaBytes = 1024 * 1024 * 1024, // 1GB
                UsedBytes = 0
            };
            await _profileRepository.AddAsync(profile, cancellationToken);
        }
        else
        {
            profile.EncryptedMAK = request.EncryptedMAK;
            _profileRepository.Update(profile);
        }

        await _unitOfWork.SaveChangesAsync(cancellationToken);
        return Unit.Value;
    }
}
