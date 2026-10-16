using System;
using System.Threading;
using System.Threading.Tasks;
using ClinicEz.Clinic.Domain.Entities;
using ClinicEz.Clinic.Domain.Interfaces;
using ClinicEz.Shared.Exceptions;
using FluentValidation;
using MediatR;
using Microsoft.EntityFrameworkCore;

namespace ClinicEz.Clinic.Application.Features.Patients.Commands;

public sealed record VoidNcdRiskAssessmentCommand(
    Guid Id,
    Guid PatientId,
    string? Reason = null,
    string? CurrentStaffName = null) : IRequest<bool>;

public sealed class VoidNcdRiskAssessmentCommandValidator : AbstractValidator<VoidNcdRiskAssessmentCommand>
{
    public VoidNcdRiskAssessmentCommandValidator()
    {
        RuleFor(x => x.Id).NotEmpty();
        RuleFor(x => x.PatientId).NotEmpty();
    }
}

public sealed class VoidNcdRiskAssessmentCommandHandler : IRequestHandler<VoidNcdRiskAssessmentCommand, bool>
{
    private readonly IRepository<NcdRiskAssessment> _ncdRepo;
    private readonly IUnitOfWork _unitOfWork;
    private readonly IClinicContext _clinicContext;

    public VoidNcdRiskAssessmentCommandHandler(
        IRepository<NcdRiskAssessment> ncdRepo,
        IUnitOfWork unitOfWork,
        IClinicContext clinicContext)
    {
        _ncdRepo = ncdRepo;
        _unitOfWork = unitOfWork;
        _clinicContext = clinicContext;
    }

    public async Task<bool> Handle(VoidNcdRiskAssessmentCommand request, CancellationToken cancellationToken)
    {
        var entity = await _ncdRepo.Query(n => n.Id == request.Id && n.PatientId == request.PatientId && n.ClinicId == _clinicContext.ClinicId)
            .FirstOrDefaultAsync(cancellationToken);

        if (entity == null)
        {
            throw new NotFoundException($"NCD risk assessment '{request.Id}' was not found for patient '{request.PatientId}'.");
        }

        if (entity.IsDeleted)
        {
            return true;
        }

        var currentStaffId = _clinicContext.StaffId;
        bool isAuthor = false;

        if (currentStaffId.HasValue)
        {
            if (entity.AssessedByStaffId.HasValue && entity.AssessedByStaffId.Value == currentStaffId.Value)
            {
                isAuthor = true;
            }
            else if (!string.IsNullOrWhiteSpace(entity.CreatedBy) &&
                     Guid.TryParse(entity.CreatedBy, out var createdByGuid) &&
                     createdByGuid == currentStaffId.Value)
            {
                isAuthor = true;
            }
        }

        if (!isAuthor && !string.IsNullOrWhiteSpace(entity.AssessedByStaffName) && !string.IsNullOrWhiteSpace(request.CurrentStaffName))
        {
            if (string.Equals(entity.AssessedByStaffName.Trim(), request.CurrentStaffName.Trim(), StringComparison.OrdinalIgnoreCase))
            {
                isAuthor = true;
            }
        }

        if (!isAuthor)
        {
            throw new ForbiddenException($"Only the author/creator clinician ({entity.AssessedByStaffName ?? "Original Author"}) can void or retract this risk assessment.");
        }

        entity.IsDeleted = true;
        entity.DeletedAt = DateTime.UtcNow;
        entity.DeletedBy = !string.IsNullOrWhiteSpace(request.CurrentStaffName)
            ? request.CurrentStaffName.Trim()
            : (_clinicContext.StaffId?.ToString() ?? "Clinician");
        entity.VoidReason = !string.IsNullOrWhiteSpace(request.Reason)
            ? request.Reason.Trim()
            : "Entered in error";

        _ncdRepo.Update(entity);
        await _unitOfWork.SaveChangesAsync(cancellationToken);

        return true;
    }
}
