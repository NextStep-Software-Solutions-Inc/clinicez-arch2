using CLINICEZ.Shared.Common;
using CLINICEZ.Shared.Exceptions;
using CLINICEZ.TenantManagement.Domain.Interfaces;
using MediatR;

namespace CLINICEZ.TenantManagement.Application.Features.TenantSettings.Commands.DeleteTenantSetting;

public sealed class DeleteTenantSettingCommandHandler(IUnitOfWork unitOfWork) : IRequestHandler<DeleteTenantSettingCommand, ApiResponse<Unit>>
{
    public async Task<ApiResponse<Unit>> Handle(DeleteTenantSettingCommand request, CancellationToken cancellationToken)
    {
        var tenantSetting = await unitOfWork.TenantSettingRepository.GetByIdAsync(request.Id, cancellationToken: cancellationToken) ?? throw new NotFoundException("Tenant setting not found.");

        unitOfWork.TenantSettingRepository.Remove(tenantSetting);
        await unitOfWork.SaveChangesAsync(cancellationToken);

        return ApiResponse<Unit>.Success(Unit.Value, $"Tenant setting deleted successfully.");
    }
}
