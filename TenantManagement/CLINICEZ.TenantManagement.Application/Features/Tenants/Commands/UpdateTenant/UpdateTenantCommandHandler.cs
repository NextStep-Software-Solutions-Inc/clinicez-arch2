using CLINICEZ.Shared.Common;
using CLINICEZ.Shared.Exceptions;
using CLINICEZ.TenantManagement.Domain.Interfaces;
using MediatR;

namespace CLINICEZ.TenantManagement.Application.Features.Tenants.Commands.UpdateTenant;

public sealed class UpdateTenantCommandHandler(IUnitOfWork unitOfWork)
    : IRequestHandler<UpdateTenantCommand, ApiResponse<Guid>>
{
    public async Task<ApiResponse<Guid>> Handle(UpdateTenantCommand request, CancellationToken cancellationToken)
    {
        
        var tenant = await unitOfWork.TenantRepository.GetByIdAsync(request.Id, cancellationToken: cancellationToken) ?? throw new NotFoundException("Tenant not found.");

        if (tenant.Name == request.UpdateTenant.Name && tenant.Description == request.UpdateTenant.Description) throw new ConflictException("No changes detected to update.");

        tenant.Name = request.UpdateTenant?.Name ?? tenant.Name;
        tenant.Description = request.UpdateTenant?.Description ?? tenant.Description;

        unitOfWork.TenantRepository.Update(tenant);
        await unitOfWork.SaveChangesAsync(cancellationToken);

        return ApiResponse<Guid>.Success(tenant.Id, "Tenant updated successfully.");
    }
}