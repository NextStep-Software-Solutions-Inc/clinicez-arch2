using System;
using System.Threading;
using System.Threading.Tasks;
using ClinicEz.Patient.Application.Common.Interfaces;
using ClinicEz.Patient.Domain.Interfaces;
using ClinicEz.Shared.Interfaces;
using MediatR;
using Microsoft.Extensions.Logging;

namespace ClinicEz.Patient.Application.Features.Records.Commands;

public sealed class DeletePatientRecordCommandHandler : IRequestHandler<DeletePatientRecordCommand>
{
    private readonly IFileRecordRepository _fileRepository;
    private readonly IStorageService _storageService;
    private readonly ICurrentUserService _currentUserService;
    private readonly IUnitOfWork _unitOfWork;
    private readonly ILogger<DeletePatientRecordCommandHandler> _logger;

    public DeletePatientRecordCommandHandler(
        IFileRecordRepository fileRepository,
        IStorageService storageService,
        ICurrentUserService currentUserService,
        IUnitOfWork unitOfWork,
        ILogger<DeletePatientRecordCommandHandler> logger)
    {
        _fileRepository = fileRepository;
        _storageService = storageService;
        _currentUserService = currentUserService;
        _unitOfWork = unitOfWork;
        _logger = logger;
    }

    public async Task Handle(DeletePatientRecordCommand request, CancellationToken cancellationToken)
    {
        var file = await _fileRepository.GetByIdAndPatientIdAsync(request.FileId, request.PatientId, cancellationToken);
        if (file is null)
        {
            // Idempotent delete
            return;
        }

        file.IsDeleted = true;
        file.DeletedAt = DateTime.UtcNow;
        file.DeletedBy = _currentUserService.UserId ?? request.PatientId.ToString();
        _fileRepository.Update(file);

        if (!string.IsNullOrWhiteSpace(file.StorageKey))
        {
            try
            {
                await _storageService.DeleteAsync(file.StorageKey, cancellationToken);
            }
            catch (Exception ex)
            {
                _logger.LogWarning(ex, "Failed to delete storage key {Key} from R2 for file {FileId}", file.StorageKey, file.Id);
            }
        }

        await _unitOfWork.SaveChangesAsync(cancellationToken);
    }
}
