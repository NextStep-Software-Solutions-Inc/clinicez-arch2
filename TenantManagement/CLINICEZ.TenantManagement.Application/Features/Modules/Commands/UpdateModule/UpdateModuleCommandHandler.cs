using CLINICEZ.Shared.Common;
using CLINICEZ.Shared.Exceptions;
using CLINICEZ.TenantManagement.Domain.Entities;
using CLINICEZ.TenantManagement.Domain.Interfaces;
using MediatR;

namespace CLINICEZ.TenantManagement.Application.Features.Modules.Commands.UpdateModule;

public sealed class UpdateModuleCommandHandler(IUnitOfWork _unitOfWork) : IRequestHandler<UpdateModuleCommand, ApiResponse<Module>>
{
    public async Task<ApiResponse<Module>> Handle(UpdateModuleCommand request, CancellationToken cancellationToken)
    {
        var module = await _unitOfWork.ModuleRepository.GetByIdAsync(request.Id, cancellationToken: cancellationToken) ?? throw new NotFoundException("Module not found.");
        if (module.Name == request.UpdateModule?.Name) throw new ConflictException("Module already exist.");
       
        var dto = request.UpdateModule;
        module.Name = dto?.Name ?? module.Name;
        module.Key = dto?.Key ?? module.Key;
        module.Description = dto?.Description ?? module.Description;
        module.IsActive = dto?.IsActive ?? module.IsActive;


        _unitOfWork.ModuleRepository.Update(module);
        await _unitOfWork.SaveChangesAsync(cancellationToken);

        return ApiResponse<Module>.Success(module, "Module updated successfully.");
    }
}
