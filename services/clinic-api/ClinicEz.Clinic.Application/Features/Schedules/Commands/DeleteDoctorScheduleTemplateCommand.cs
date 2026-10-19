using System;
using System.Collections.Generic;
using System.Threading;
using System.Threading.Tasks;
using ClinicEz.Clinic.Application.Common.Interfaces;
using ClinicEz.Clinic.Domain.Entities;
using ClinicEz.Clinic.Domain.Interfaces;
using MediatR;
using Microsoft.EntityFrameworkCore;

namespace ClinicEz.Clinic.Application.Features.Schedules.Commands;

public sealed record DeleteDoctorScheduleTemplateCommand(
    Guid DoctorId,
    Guid TemplateId) : IRequest<bool>;

public sealed class DeleteDoctorScheduleTemplateCommandHandler
    : IRequestHandler<DeleteDoctorScheduleTemplateCommand, bool>
{
    private readonly IRepository<DoctorScheduleTemplate> _templateRepo;
    private readonly IUnitOfWork _unitOfWork;
    private readonly IClinicContext _clinicContext;

    public DeleteDoctorScheduleTemplateCommandHandler(
        IRepository<DoctorScheduleTemplate> templateRepo,
        IUnitOfWork unitOfWork,
        IClinicContext clinicContext)
    {
        _templateRepo = templateRepo;
        _unitOfWork = unitOfWork;
        _clinicContext = clinicContext;
    }

    public async Task<bool> Handle(DeleteDoctorScheduleTemplateCommand request, CancellationToken ct)
    {
        var template = await _templateRepo.Query()
            .Include(t => t.BreakTimes)
            .FirstOrDefaultAsync(t => t.ClinicId == _clinicContext.ClinicId &&
                                      t.DoctorId == request.DoctorId &&
                                      t.Id == request.TemplateId &&
                                      !t.IsDeleted, ct);

        if (template == null)
        {
            throw new KeyNotFoundException($"Schedule template with ID {request.TemplateId} was not found for doctor {request.DoctorId}.");
        }

        var now = DateTime.UtcNow;
        template.IsDeleted = true;
        template.DeletedAt = now;
        template.DeletedBy = "ClinicStaff";

        foreach (var brk in template.BreakTimes)
        {
            brk.IsDeleted = true;
            brk.DeletedAt = now;
            brk.DeletedBy = "ClinicStaff";
        }

        await _unitOfWork.SaveChangesAsync(ct);
        return true;
    }
}
