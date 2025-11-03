namespace CLINICEZ.TenantManagement.Domain.Interfaces;

public interface IUnitOfWork
{
    ITenantRepository TenantRepository { get; }
    ITenantSettingRepository TenantSettingRepository { get; }
    IModuleRepository ModuleRepository { get; }
    ITenantMemberRepository TenantMemberRepository { get; }
    ITenantSubscriptionRepository TenantSubscriptionRepository { get; }
    Task<int> SaveChangesAsync(CancellationToken cancellationToken = default);
}