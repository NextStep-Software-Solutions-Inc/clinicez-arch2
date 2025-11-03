using CLINICEZ.Shared.Common;
using CLINICEZ.Shared.Exceptions;
using CLINICEZ.TenantManagement.Domain.Entities;
using CLINICEZ.TenantManagement.Domain.Interfaces;
using MediatR;

namespace CLINICEZ.TenantManagement.Application.Features.Modules.Queries.GetModuleById;

public sealed class GetModuleByIdQueryHandler(IUnitOfWork unitOfWork) : IRequestHandler<GetModuleByIdQuery, ApiResponse<Module>>
{
    public async Task<ApiResponse<Module>> Handle(
        GetModuleByIdQuery request,
        CancellationToken cancellationToken)
    {
        var module = await unitOfWork.ModuleRepository.FindAsync(
           t => t.Id == request.Id,
            cancellationToken: cancellationToken) ?? throw new NotFoundException("No data found.");

        return ApiResponse<Module>.Success(module, "Retrieved successfully");
    }
}
