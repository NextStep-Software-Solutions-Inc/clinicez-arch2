using System;
using System.Threading;
using System.Threading.Tasks;
using ClinicEz.Clinic.Application.Common.Interfaces;
using ClinicEz.Clinic.Application.Features.Problems.Dtos;
using ClinicEz.Clinic.Domain.Entities;
using ClinicEz.Clinic.Domain.Interfaces;
using ClinicEz.Shared.Exceptions;
using FluentValidation;
using MediatR;
using Microsoft.EntityFrameworkCore;

namespace ClinicEz.Clinic.Application.Features.Problems.Commands;

public record UpdatePatientProblemStatusCommand(
    Guid ProblemId,
    Guid PatientId,
    string Status,
    DateOnly? ResolvedDate = null,
    string? ClinicalNotes = null
) : IRequest<PatientProblemDto>;

public class UpdatePatientProblemStatusValidator : AbstractValidator<UpdatePatientProblemStatusCommand>
{
    public UpdatePatientProblemStatusValidator()
    {
        RuleFor(x => x.ProblemId).NotEmpty();
        RuleFor(x => x.PatientId).NotEmpty();
        RuleFor(x => x.Status).NotEmpty().Must(s => Enum.TryParse<ProblemStatus>(s, true, out _))
            .WithMessage("Status must be one of: Active, Resolved, Inactive, Relapsed.");
    }
}

public class UpdatePatientProblemStatusCommandHandler : IRequestHandler<UpdatePatientProblemStatusCommand, PatientProblemDto>
{
    private readonly IRepository<PatientProblem> _problemRepo;
    private readonly IUnitOfWork _unitOfWork;
    private readonly IClinicContext _clinicContext;

    public UpdatePatientProblemStatusCommandHandler(
        IRepository<PatientProblem> problemRepo,
        IUnitOfWork unitOfWork,
        IClinicContext clinicContext)
    {
        _problemRepo = problemRepo;
        _unitOfWork = unitOfWork;
        _clinicContext = clinicContext;
    }

    public async Task<PatientProblemDto> Handle(UpdatePatientProblemStatusCommand command, CancellationToken cancellationToken)
    {
        var problem = await _problemRepo.Query(p => p.Id == command.ProblemId && p.PatientId == command.PatientId && p.ClinicId == _clinicContext.ClinicId)
            .FirstOrDefaultAsync(cancellationToken);

        if (problem == null)
        {
            throw new NotFoundException($"Problem record with ID {command.ProblemId} not found.");
        }

        var newStatus = Enum.Parse<ProblemStatus>(command.Status, true);
        problem.Status = newStatus;

        if (newStatus == ProblemStatus.Resolved)
        {
            problem.ResolvedDate = command.ResolvedDate ?? DateOnly.FromDateTime(DateTime.UtcNow.AddHours(8));
        }
        else if (newStatus == ProblemStatus.Active || newStatus == ProblemStatus.Relapsed)
        {
            problem.ResolvedDate = null;
        }

        if (!string.IsNullOrWhiteSpace(command.ClinicalNotes))
        {
            problem.ClinicalNotes = string.IsNullOrWhiteSpace(problem.ClinicalNotes)
                ? command.ClinicalNotes.Trim()
                : $"{problem.ClinicalNotes}\n{command.ClinicalNotes.Trim()}";
        }

        problem.UpdatedAt = DateTime.UtcNow;

        _problemRepo.Update(problem);
        await _unitOfWork.SaveChangesAsync(cancellationToken);

        return new PatientProblemDto(
            problem.Id,
            problem.ClinicId,
            problem.PatientId,
            problem.ConsultationEncounterId,
            problem.Icd10Code,
            problem.ProblemTitle,
            problem.PhilHealthMdiseaseCode,
            problem.Status.ToString(),
            problem.Severity.ToString(),
            problem.IsChronicNcd,
            problem.OnsetDate,
            problem.ResolvedDate,
            problem.ClinicalNotes,
            problem.RecordedByDoctorId,
            problem.RecordedByDoctorName,
            problem.CreatedAt
        );
    }
}
