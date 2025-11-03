using CLINICEZ.Shared.Common;
using CLINICEZ.Shared.Exceptions;
using CLINICEZ.TenantManagement.Domain.Interfaces;
using MediatR;

namespace CLINICEZ.TenantManagement.Application.Features.TenantSettings.Commands.UpdateTenantSetting;

public class UpdateTenantSettingCommandHandler(IUnitOfWork _unitOfWork)
    : IRequestHandler<UpdateTenantSettingCommand, ApiResponse<Guid>>
{
    public async Task<ApiResponse<Guid>> Handle(UpdateTenantSettingCommand request, CancellationToken cancellationToken)
    {
        if (request.UpdateTenantSetting == null) throw new NotFoundException("Update tenant setting cannot be null.");

        var tenantSettingDto = request.UpdateTenantSetting;

        var tenantSetting = await _unitOfWork.TenantSettingRepository.FindAsync(ts => ts.TenantId == tenantSettingDto.TenantId, cancellationToken: cancellationToken) ?? throw new NotFoundException("Tenant settings cannot be found.");

        tenantSetting.BaseURL = tenantSettingDto.BaseUrl ?? tenantSetting.BaseURL;
        tenantSetting.BillingContactEmail = tenantSettingDto.BillingContactEmail ?? tenantSetting.BillingContactEmail;
        tenantSetting.DbConnectionString = tenantSettingDto.DBConnectionString ?? tenantSetting.DbConnectionString;

         _unitOfWork.TenantSettingRepository.Update(tenantSetting);
        await _unitOfWork.SaveChangesAsync(cancellationToken);

        return ApiResponse<Guid>.Success(tenantSetting.Id, "Tenant setting updated successfully.");
    }
}
