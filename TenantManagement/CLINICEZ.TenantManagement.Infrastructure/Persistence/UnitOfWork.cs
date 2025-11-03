using CLINICEZ.TenantManagement.Domain.Interfaces;
using CLINICEZ.Shared.Interfaces;
using Sieve.Services;

namespace CLINICEZ.TenantManagement.Infrastructure.Persistence;
public sealed class UnitOfWork : IUnitOfWork, IDisposable
{
    private readonly ApplicationDbContext _context;

    public ITenantRepository TenantRepository { get; }
    public ITenantSettingRepository TenantSettingRepository { get; }
    public ITenantMemberRepository TenantMemberRepository { get; }
    public ITenantSubscriptionRepository TenantSubscriptionRepository { get; }
    public IModuleRepository ModuleRepository { get; }

    private ICurrentUserService CurrentUser { get; }

    public UnitOfWork(
        ApplicationDbContext context,
        ISieveProcessor sieveProcessor,
        ITenantMemberRepository tenantMemberRepository,
        ITenantRepository tenantRepository,
        ITenantSubscriptionRepository tenantSubscriptionRepository,
        ITenantSettingRepository tenantSettingRepository,
        ICurrentUserService currentUser,
        IModuleRepository moduleRepository)
    {
        _context = context ?? throw new ArgumentNullException(nameof(context));
        CurrentUser = currentUser ?? throw new ArgumentNullException(nameof(currentUser));
        TenantMemberRepository = tenantMemberRepository ?? throw new ArgumentNullException(nameof(tenantMemberRepository));
        TenantRepository = tenantRepository ?? throw new ArgumentNullException(nameof(tenantRepository));
        TenantSettingRepository = tenantSettingRepository ?? throw new ArgumentNullException(nameof(tenantSettingRepository));
        ModuleRepository = moduleRepository ?? throw new ArgumentNullException(nameof(moduleRepository));
        TenantSubscriptionRepository = tenantSubscriptionRepository ?? throw new ArgumentNullException(nameof(tenantSubscriptionRepository));
    }

    public Task<int> SaveChangesAsync(CancellationToken cancellationToken = default)
    {
        return _context.SaveChangesAsync(cancellationToken);
    }



    public void Dispose() => _context.Dispose();
}
