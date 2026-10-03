using System;
using System.Threading;
using System.Threading.Tasks;
using ClinicEz.Clinic.Application.Features.Prescriptions.DTOs;
using ClinicEz.Clinic.Domain.Entities;
using ClinicEz.Clinic.Domain.Enums;
using ClinicEz.Clinic.Domain.Interfaces;
using ClinicEz.Shared.Exceptions;
using FluentValidation;
using MediatR;
using Microsoft.EntityFrameworkCore;

namespace ClinicEz.Clinic.Application.Features.Prescriptions.Commands;

public record RecordExternalDispenseCommand(
    Guid ConsultationId,
    string ExternalPharmacyName,
    string? ExternalBranchLocation,
    string? PharmacistName,
    string? PharmacistPrcLicense,
    string? OfficialReceiptNumber,
    string? ReceiptDocumentUrl,
    string? Notes
) : IRequest<PrescriptionSlipDto>;

public class RecordExternalDispenseCommandValidator : AbstractValidator<RecordExternalDispenseCommand>
{
    public RecordExternalDispenseCommandValidator()
    {
        RuleFor(x => x.ConsultationId).NotEmpty();
        RuleFor(x => x.ExternalPharmacyName).NotEmpty().MaximumLength(255);
    }
}

public class RecordExternalDispenseCommandHandler : IRequestHandler<RecordExternalDispenseCommand, PrescriptionSlipDto>
{
    private readonly IRepository<ConsultationEncounter> _encounterRepo;
    private readonly IUnitOfWork _unitOfWork;
    private readonly ISender _sender;

    public RecordExternalDispenseCommandHandler(
        IRepository<ConsultationEncounter> encounterRepo,
        IUnitOfWork unitOfWork,
        ISender sender)
    {
        _encounterRepo = encounterRepo;
        _unitOfWork = unitOfWork;
        _sender = sender;
    }

    public async Task<PrescriptionSlipDto> Handle(RecordExternalDispenseCommand request, CancellationToken cancellationToken)
    {
        var encounter = await _encounterRepo.Query(e => e.Id == request.ConsultationId)
            .Include(e => e.Prescriptions)
            .FirstOrDefaultAsync(cancellationToken);

        if (encounter == null)
        {
            throw new NotFoundException($"Encounter with ID '{request.ConsultationId}' was not found.");
        }

        encounter.RxDispenseStatus = PrescriptionDispenseStatus.DispensedExternally;
        encounter.RxDispensedPharmacyName = request.ExternalPharmacyName.Trim();
        encounter.RxDispensedPharmacistName = request.PharmacistName?.Trim();
        encounter.RxDispensedPharmacistPrc = request.PharmacistPrcLicense?.Trim();
        encounter.RxDispensedReceiptNumber = request.OfficialReceiptNumber?.Trim();
        encounter.RxDispensedReceiptUrl = request.ReceiptDocumentUrl;
        encounter.RxDispensedAt = DateTime.UtcNow;
        encounter.RxNotes = $"{request.ExternalBranchLocation} • {request.Notes}".Trim(' ', '•');
        encounter.UpdatedAt = DateTime.UtcNow;

        _encounterRepo.Update(encounter);
        await _unitOfWork.SaveChangesAsync(cancellationToken);

        return await _sender.Send(new Queries.GetPrescriptionSlipQuery(ConsultationId: encounter.Id), cancellationToken);
    }
}
