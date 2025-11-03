using CLINICEZ.Shared.Common;
using CLINICEZ.Shared.Exceptions;
using CLINICEZ.TenantManagement.Domain.Interfaces;
using MediatR;

namespace CLINICEZ.TenantManagement.Application.Features.Tenants.Commands.DeleteTenant;

public sealed class DeleteTenantCommandHandler(IUnitOfWork unitOfWork): IRequestHandler<DeleteTenantCommand, ApiResponse<Unit>>
{
    public async Task<ApiResponse<Unit>> Handle(DeleteTenantCommand request, CancellationToken cancellationToken)
    {
        var tenant = await unitOfWork.TenantRepository.GetByIdAsync(request.Id, cancellationToken: cancellationToken) ?? throw new NotFoundException("Tenant not found.");

        unitOfWork.TenantRepository.Remove(tenant);
        await unitOfWork.SaveChangesAsync(cancellationToken);

        return ApiResponse<Unit>.Success(Unit.Value, $"Tenant with ID {request.Id} deleted successfully.");
    }
}