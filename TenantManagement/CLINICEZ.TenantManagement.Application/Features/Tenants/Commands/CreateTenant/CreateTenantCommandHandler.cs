using CLINICEZ.Shared.Common;
using CLINICEZ.Shared.Exceptions;
using CLINICEZ.Shared.Interfaces;
using CLINICEZ.TenantManagement.Domain.Entities;
using CLINICEZ.TenantManagement.Domain.Enums;
using CLINICEZ.TenantManagement.Domain.Interfaces;
using MediatR;

namespace CLINICEZ.TenantManagement.Application.Features.Tenants.Commands.CreateTenant;

public sealed class CreateTenantCommandHandler(IUnitOfWork _unitOfWork, ICurrentUserService _currentUserService) : IRequestHandler<CreateTenantCommand, ApiResponse<Guid>>
{
    public async Task<ApiResponse<Guid>> Handle(CreateTenantCommand request, CancellationToken cancellationToken)
    {
        if (string.IsNullOrWhiteSpace(_currentUserService.UserId)) throw new UnauthorizedAccessException("Current user is not authenticated.");

        var tenantExist = await _unitOfWork.TenantRepository.FindAsync(t => t.Name == request.Name, cancellationToken);
        if (tenantExist != null) throw new ConflictException("Tenant already exists.");

        var tenant = new Tenant
        {
            Name = request.Name,
            Description = request.Description,
            TenantSetting = new()
            {
                BillingContactEmail = request.BillingContactEmail,
                OnPremise = request.OnPremise,
                BaseURL = "",
                DbConnectionString = ""
            }
        };

        var module = await _unitOfWork.ModuleRepository.FindAsync(m => m.Key == "ams", cancellationToken: cancellationToken);
        if (module != null) tenant.Modules.Add(module);

        await _unitOfWork.TenantRepository.AddAsync(tenant, cancellationToken);

        var tenantMember = new TenantMember
        {
            UserId = _currentUserService.UserId,
            Role = TenantMemberRole.Owner,
            Status = Status.Active
        };
        tenant.TenantMembers.Add(tenantMember);
        await _unitOfWork.SaveChangesAsync(cancellationToken);
        return ApiResponse<Guid>.Success(tenant.Id, "Tenant created successfully.");
    }
}
