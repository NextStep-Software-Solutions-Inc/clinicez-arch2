using CLINICEZ.Shared.Common;
using CLINICEZ.Shared.Exceptions;
using CLINICEZ.TenantManagement.Domain.Entities;
using CLINICEZ.TenantManagement.Domain.Interfaces;
using MediatR;

namespace CLINICEZ.TenantManagement.Application.Features.TenantSettings.Commands.CreateTenantSetting;

public sealed class CreateTenantSettingCommandHandler(IUnitOfWork _unitOfWork)
    : IRequestHandler<CreateTenantSettingCommand, ApiResponse<Guid>>
{
    public async Task<ApiResponse<Guid>> Handle(CreateTenantSettingCommand command, CancellationToken cancellationToken)
    {
        var tenantSettingExists = await _unitOfWork.TenantSettingRepository.FindAsync(ts => ts.TenantId == command.TenantId, cancellationToken);

        if (tenantSettingExists != null) throw new ConflictException("Tenant setting already exists.");

        var tenantExists = await _unitOfWork.TenantRepository.FindAsync(t => t.Id == command.TenantId, cancellationToken) ?? throw new NotFoundException("Tenant not found.");
        
        var tenantSetting = new TenantSetting
        {
            TenantId = command.TenantId,
            BaseURL = command.BaseUrl,
            BillingContactEmail = command.BillingContactEmail,
            DbConnectionString = command.DBConnectionString
        };

        await _unitOfWork.TenantSettingRepository.AddAsync(tenantSetting, cancellationToken);
        await _unitOfWork.SaveChangesAsync(cancellationToken);

        return ApiResponse<Guid>.Success(tenantSetting.Id, "Tenant setting created successfully.");
    }
}
