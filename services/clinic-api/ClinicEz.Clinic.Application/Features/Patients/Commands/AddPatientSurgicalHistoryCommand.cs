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

public sealed record AddPatientSurgicalHistoryCommand(
    Guid PatientId,
    string ProcedureName,
    DateOnly SurgeryDate,
    string? HospitalName = null,
    string? Findings = null,
    string? Complications = null,
    string? Remarks = null) : IRequest<PatientSurgicalHistoryDto>;

public sealed class AddPatientSurgicalHistoryCommandValidator : AbstractValidator<AddPatientSurgicalHistoryCommand>
{
    public AddPatientSurgicalHistoryCommandValidator()
    {
        RuleFor(x => x.PatientId).NotEmpty();
        RuleFor(x => x.ProcedureName).NotEmpty().MaximumLength(255);
    }
}

public sealed class AddPatientSurgicalHistoryCommandHandler : IRequestHandler<AddPatientSurgicalHistoryCommand, PatientSurgicalHistoryDto>
{
    private readonly IRepository<ClinicPatient> _patientRepo;
    private readonly IRepository<PatientSurgicalHistory> _surgicalRepo;
    private readonly IUnitOfWork _unitOfWork;
    private readonly IClinicContext _clinicContext;

    public AddPatientSurgicalHistoryCommandHandler(
        IRepository<ClinicPatient> patientRepo,
        IRepository<PatientSurgicalHistory> surgicalRepo,
        IUnitOfWork unitOfWork,
        IClinicContext clinicContext)
    {
        _patientRepo = patientRepo;
        _surgicalRepo = surgicalRepo;
        _unitOfWork = unitOfWork;
        _clinicContext = clinicContext;
    }

    public async Task<PatientSurgicalHistoryDto> Handle(AddPatientSurgicalHistoryCommand request, CancellationToken cancellationToken)
    {
        var patient = await _patientRepo.Query(p => p.Id == request.PatientId && p.ClinicId == _clinicContext.ClinicId)
            .FirstOrDefaultAsync(cancellationToken);

        if (patient == null)
        {
            throw new NotFoundException($"Patient '{request.PatientId}' not found in this clinic.");
        }

        var entry = new PatientSurgicalHistory
        {
            Id = Guid.NewGuid(),
            TenantId = patient.TenantId ?? _clinicContext.TenantId,
            ClinicId = _clinicContext.ClinicId,
            PatientId = request.PatientId,
            ProcedureName = request.ProcedureName.Trim(),
            SurgeryDate = request.SurgeryDate,
            HospitalName = request.HospitalName?.Trim(),
            Findings = request.Findings?.Trim(),
            Complications = request.Complications?.Trim(),
            Remarks = request.Remarks?.Trim(),
            CreatedAt = DateTime.UtcNow,
            CreatedBy = _clinicContext.StaffId?.ToString() ?? "Clinician"
        };

        await _surgicalRepo.AddAsync(entry, cancellationToken);
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
