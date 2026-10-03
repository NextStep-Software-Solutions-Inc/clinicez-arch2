using System;
using System.Threading;
using System.Threading.Tasks;
using ClinicEz.Clinic.Application.Common.Interfaces;
using ClinicEz.Clinic.Domain.Entities;
using ClinicEz.Clinic.Domain.Interfaces;
using MediatR;
using Microsoft.EntityFrameworkCore;

namespace ClinicEz.Clinic.Application.Features.CustomFields.Commands;

public sealed record DeleteCustomFieldDefinitionCommand(Guid Id) : IRequest<bool>;

public sealed class DeleteCustomFieldDefinitionCommandHandler : IRequestHandler<DeleteCustomFieldDefinitionCommand, bool>
{
    private readonly IRepository<ClinicCustomFieldDefinition> _repo;
    private readonly IUnitOfWork _unitOfWork;

    public DeleteCustomFieldDefinitionCommandHandler(
        IRepository<ClinicCustomFieldDefinition> repo,
        IUnitOfWork unitOfWork)
    {
        _repo = repo;
        _unitOfWork = unitOfWork;
    }

    public async Task<bool> Handle(DeleteCustomFieldDefinitionCommand request, CancellationToken ct)
    {
        var field = await _repo.Query().FirstOrDefaultAsync(f => f.Id == request.Id, ct);
        if (field == null) return false;

        field.IsDeleted = true;
        field.DeletedAt = DateTime.UtcNow;
        field.DeletedBy = "ClinicAdmin";

        await _unitOfWork.SaveChangesAsync(ct);
        return true;
    }
}
