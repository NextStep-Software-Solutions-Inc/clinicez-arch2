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

public sealed record DeleteDoctorLeaveCommand(
    Guid LeaveId) : IRequest<bool>;

public sealed class DeleteDoctorLeaveCommandHandler
    : IRequestHandler<DeleteDoctorLeaveCommand, bool>
{
    private readonly IRepository<DoctorLeave> _leaveRepo;
    private readonly IUnitOfWork _unitOfWork;
    private readonly IClinicContext _clinicContext;

    public DeleteDoctorLeaveCommandHandler(
        IRepository<DoctorLeave> leaveRepo,
        IUnitOfWork unitOfWork,
        IClinicContext clinicContext)
    {
        _leaveRepo = leaveRepo;
        _unitOfWork = unitOfWork;
        _clinicContext = clinicContext;
    }

    public async Task<bool> Handle(DeleteDoctorLeaveCommand request, CancellationToken ct)
    {
        var leave = await _leaveRepo.Query()
            .FirstOrDefaultAsync(l => l.ClinicId == _clinicContext.ClinicId && l.Id == request.LeaveId && !l.IsDeleted, ct);

        if (leave == null)
        {
            throw new KeyNotFoundException($"Leave record with ID {request.LeaveId} was not found.");
        }

        leave.IsDeleted = true;
        leave.DeletedAt = DateTime.UtcNow;
        leave.DeletedBy = "ClinicStaff";

        await _unitOfWork.SaveChangesAsync(ct);
        return true;
    }
}
