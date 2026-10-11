using System;
using System.Threading;
using System.Threading.Tasks;
using ClinicEz.Clinic.Application.Common.Interfaces;
using ClinicEz.Clinic.Domain.Entities;
using ClinicEz.Clinic.Domain.Interfaces;
using ClinicEz.Shared.Exceptions;
using MediatR;
using Microsoft.EntityFrameworkCore;

namespace ClinicEz.Clinic.Application.Features.Allergies.Commands;

public record DeletePatientAllergyCommand(Guid AllergyId, Guid PatientId) : IRequest<bool>;

public class DeletePatientAllergyCommandHandler : IRequestHandler<DeletePatientAllergyCommand, bool>
{
    private readonly IRepository<PatientAllergy> _allergyRepo;
    private readonly IUnitOfWork _unitOfWork;
    private readonly IClinicContext _clinicContext;

    public DeletePatientAllergyCommandHandler(
        IRepository<PatientAllergy> allergyRepo,
        IUnitOfWork unitOfWork,
        IClinicContext clinicContext)
    {
        _allergyRepo = allergyRepo;
        _unitOfWork = unitOfWork;
        _clinicContext = clinicContext;
    }

    public async Task<bool> Handle(DeletePatientAllergyCommand command, CancellationToken cancellationToken)
    {
        var allergy = await _allergyRepo.Query(a => a.Id == command.AllergyId && a.PatientId == command.PatientId && a.ClinicId == _clinicContext.ClinicId)
            .FirstOrDefaultAsync(cancellationToken);

        if (allergy == null)
        {
            throw new NotFoundException($"Allergy record with ID {command.AllergyId} not found.");
        }

        allergy.IsDeleted = true;
        allergy.UpdatedAt = DateTime.UtcNow;
        _allergyRepo.Update(allergy);
        await _unitOfWork.SaveChangesAsync(cancellationToken);

        return true;
    }
}
