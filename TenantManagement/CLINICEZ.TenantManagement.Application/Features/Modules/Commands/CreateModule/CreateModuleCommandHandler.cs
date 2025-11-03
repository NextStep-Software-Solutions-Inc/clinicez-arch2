using CLINICEZ.Shared.Common;
using CLINICEZ.Shared.Exceptions;
using CLINICEZ.TenantManagement.Domain.Entities;
using CLINICEZ.TenantManagement.Domain.Interfaces;
using MediatR;

namespace CLINICEZ.TenantManagement.Application.Features.Modules.Commands.CreateModule;

public class CreateModuleCommandHandler(IUnitOfWork _unitOfWork) : IRequestHandler<CreateModuleCommand, ApiResponse<Guid>>
{

    public async Task<ApiResponse<Guid>> Handle(CreateModuleCommand request, CancellationToken cancellationToken)
    {
        var moduleExist = await _unitOfWork.ModuleRepository.FindAsync(t => t.Name == request.Name, cancellationToken);
        if (moduleExist != null) throw new ConflictException("Module already exists.");
        var module = new Module
        {
            Name = request.Name,
            Key = request.Key,
            Description = request.Description,
            IsActive = request.IsActive

        };

        await _unitOfWork.ModuleRepository.AddAsync(module, cancellationToken);
        await _unitOfWork.SaveChangesAsync(cancellationToken);
        return new()
        {
            Data =  module.Id,
            Succeeded = true,
            Message = "Module created successfully."
        };
    }

}
