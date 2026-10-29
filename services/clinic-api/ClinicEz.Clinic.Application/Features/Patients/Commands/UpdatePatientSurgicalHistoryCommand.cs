using System;
using System.Threading;
using System.Threading.Tasks;
using ClinicEz.Clinic.Application.Features.Patients.DTOs;
using ClinicEz.Clinic.Domain.Entities;
using ClinicEz.Clinic.Domain.Interfaces;
using ClinicEz.Shared.Exceptions;
using FluentValidation;
using MediatR;
using Microsoft.EntityFrameworkCore;

namespace ClinicEz.Clinic.Application.Features.Patients.Commands;

public sealed record UpdatePatientSurgicalHistoryCommand(
    Guid Id,
    Guid PatientId,
    string ProcedureName,
    DateOnly? SurgeryDate = null,
    string? HospitalName = null,
    string? Findings = null,
    string? Complications = null,
    string? Remarks = null) : IRequest<PatientSurgicalHistoryDto>;

public sealed class UpdatePatientSurgicalHistoryCommandValidator : AbstractValidator<UpdatePatientSurgicalHistoryCommand>
{
    public UpdatePatientSurgicalHistoryCommandValidator()
    {
        RuleFor(x => x.Id).NotEmpty();
        RuleFor(x => x.PatientId).NotEmpty();
        RuleFor(x => x.ProcedureName).NotEmpty().MaximumLength(255);
    }
}

public sealed class UpdatePatientSurgicalHistoryCommandHandler : IRequestHandler<UpdatePatientSurgicalHistoryCommand, PatientSurgicalHistoryDto>
{
    private readonly IRepository<PatientSurgicalHistory> _surgicalRepo;
    private readonly IUnitOfWork _unitOfWork;
    private readonly IClinicContext _clinicContext;

    public UpdatePatientSurgicalHistoryCommandHandler(
        IRepository<PatientSurgicalHistory> surgicalRepo,
        IUnitOfWork unitOfWork,
        IClinicContext clinicContext)
    {
        _surgicalRepo = surgicalRepo;
        _unitOfWork = unitOfWork;
        _clinicContext = clinicContext;
    }

    public async Task<PatientSurgicalHistoryDto> Handle(UpdatePatientSurgicalHistoryCommand request, CancellationToken cancellationToken)
    {
        var entry = await _surgicalRepo.Query(s => s.Id == request.Id && s.PatientId == request.PatientId && s.ClinicId == _clinicContext.ClinicId)
            .FirstOrDefaultAsync(cancellationToken);

        if (entry == null)
        {
            throw new NotFoundException($"Surgical history entry '{request.Id}' not found.");
        }

        entry.ProcedureName = request.ProcedureName.Trim();
        entry.SurgeryDate = request.SurgeryDate;
        entry.HospitalName = request.HospitalName?.Trim();
        entry.Findings = request.Findings?.Trim();
        entry.Complications = request.Complications?.Trim();
        entry.Remarks = request.Remarks?.Trim();
        entry.UpdatedAt = DateTime.UtcNow;
        entry.UpdatedBy = _clinicContext.StaffId?.ToString() ?? "Clinician";

        _surgicalRepo.Update(entry);
        await _unitOfWork.SaveChangesAsync(cancellationToken);

        return new PatientSurgicalHistoryDto(
            entry.Id,
            entry.PatientId,
            entry.ProcedureName,
            entry.SurgeryDate,
            entry.HospitalName,
            entry.Findings,
            entry.Complications,
            entry.Remarks);
    }
}
