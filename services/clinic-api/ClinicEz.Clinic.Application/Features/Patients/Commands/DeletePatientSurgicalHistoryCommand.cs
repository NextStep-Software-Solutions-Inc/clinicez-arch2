using System;
using System.Threading;
using System.Threading.Tasks;
using ClinicEz.Clinic.Domain.Entities;
using ClinicEz.Clinic.Domain.Interfaces;
using ClinicEz.Shared.Exceptions;
using MediatR;
using Microsoft.EntityFrameworkCore;

namespace ClinicEz.Clinic.Application.Features.Patients.Commands;

public sealed record DeletePatientSurgicalHistoryCommand(Guid Id, Guid PatientId) : IRequest<bool>;

public sealed class DeletePatientSurgicalHistoryCommandHandler : IRequestHandler<DeletePatientSurgicalHistoryCommand, bool>
{
    private readonly IRepository<PatientSurgicalHistory> _surgicalRepo;
    private readonly IUnitOfWork _unitOfWork;
    private readonly IClinicContext _clinicContext;

    public DeletePatientSurgicalHistoryCommandHandler(
        IRepository<PatientSurgicalHistory> surgicalRepo,
        IUnitOfWork unitOfWork,
        IClinicContext clinicContext)
    {
        _surgicalRepo = surgicalRepo;
        _unitOfWork = unitOfWork;
        _clinicContext = clinicContext;
    }

    public async Task<bool> Handle(DeletePatientSurgicalHistoryCommand request, CancellationToken cancellationToken)
    {
        var entry = await _surgicalRepo.Query(s => s.Id == request.Id && s.PatientId == request.PatientId && s.ClinicId == _clinicContext.ClinicId)
            .FirstOrDefaultAsync(cancellationToken);

        if (entry == null)
        {
            throw new NotFoundException($"Surgical history entry '{request.Id}' not found.");
        }

        entry.IsDeleted = true;
        entry.DeletedAt = DateTime.UtcNow;
        entry.DeletedBy = _clinicContext.StaffId?.ToString() ?? "Clinician";

        _surgicalRepo.Update(entry);
        await _unitOfWork.SaveChangesAsync(cancellationToken);

        return true;
    }
}
