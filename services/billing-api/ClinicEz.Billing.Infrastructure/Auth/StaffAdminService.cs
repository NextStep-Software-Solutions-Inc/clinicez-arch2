using ClinicEz.Billing.Application.Abstractions;
using ClinicEz.Billing.Application.Services;
using ClinicEz.Billing.Domain.Entities;
using ClinicEz.Billing.Infrastructure.Persistence;
using ClinicEz.Shared.Exceptions;
using ClinicEz.Shared.LocalAuth;
using Microsoft.EntityFrameworkCore;

namespace ClinicEz.Billing.Infrastructure.Auth;

/// <summary>
/// Staff administration. Allowed for an administrator (<c>staff:manage</c>) of the tenant, or for the trusted internal-service
/// principal that bootstraps the first administrator of a cell. Every change is audited; accounts are deactivated, never deleted.
/// </summary>
public sealed class StaffAdminService
{
    private readonly ApplicationDbContext _db;
    private readonly IBillingContext _context;
    private readonly IFacilityPasswordHasher _hasher;
    private readonly IFacilityTokenService _tokens;
    private readonly IStaffAccessCache _accessCache;
    private readonly AuditTrail _audit;
    private readonly TimeProvider _clock;

    public StaffAdminService(
        ApplicationDbContext db, IBillingContext context, IFacilityPasswordHasher hasher, IFacilityTokenService tokens,
        IStaffAccessCache accessCache, AuditTrail audit, TimeProvider clock)
    {
        _db = db;
        _context = context;
        _hasher = hasher;
        _tokens = tokens;
        _accessCache = accessCache;
        _audit = audit;
        _clock = clock;
    }

    public async Task<IReadOnlyList<StaffDto>> ListAsync(CancellationToken ct)
    {
        var tenantId = RequireTenant();
        var staff = await _db.BillingStaff.AsNoTracking().Where(s => s.TenantId == tenantId)
            .OrderBy(s => s.FacilityId).ThenBy(s => s.FullName).ToListAsync(ct);
        return staff.Select(ToDto).ToList();
    }

    public async Task<StaffDto> CreateAsync(CreateStaffRequest request, CancellationToken ct)
    {
        var tenantId = RequireTenant();
        var facilityId = request.FacilityId?.Trim();
        var email = StaffNormalizer.Email(request.Email);
        var fullName = request.FullName?.Trim();

        if (string.IsNullOrEmpty(facilityId)) throw new BadRequestException("The counter facility is required.");
        if (email is null) throw new BadRequestException("A valid email address is required.");
        if (string.IsNullOrEmpty(fullName)) throw new BadRequestException("The full name is required.");
        if (!Enum.IsDefined(request.Role)) throw new BadRequestException("Unknown staff role.");
        if (!Enum.IsDefined(request.FacilityType)) throw new BadRequestException("Unknown facility type.");

        var problems = _hasher.ValidateStrength(request.Password, _tokens.Options.MinPasswordLength);
        if (problems.Count > 0) throw new BadRequestException(problems[0]);

        if (await _db.BillingStaff.AnyAsync(s => s.TenantId == tenantId && s.FacilityId == facilityId && s.Email == email, ct))
            throw new ConflictException("A staff member with this email already exists at this counter.");

        var now = _clock.GetUtcNow().UtcDateTime;
        var facility = await _db.BillingFacilities.FirstOrDefaultAsync(f => f.TenantId == tenantId && f.FacilityId == facilityId, ct);
        if (facility is null)
        {
            _db.BillingFacilities.Add(new BillingFacility
            {
                Id = Guid.NewGuid(), TenantId = tenantId, FacilityId = facilityId, FacilityType = request.FacilityType, FirstSeenUtc = now, LastSeenUtc = now
            });
        }
        else if (facility.FacilityType != request.FacilityType)
        {
            throw new ConflictException($"Facility '{facilityId}' is already registered as {facility.FacilityType}.");
        }

        var staff = new BillingStaff
        {
            Id = Guid.NewGuid(),
            TenantId = tenantId,
            FacilityId = facilityId,
            Email = email,
            FullName = fullName,
            PasswordHash = _hasher.Hash(request.Password),
            Role = request.Role,
            IsActive = true,
            CreatedAtUtc = now
        };
        _db.BillingStaff.Add(staff);
        _audit.Record(_context.TryGetStaff(), tenantId, facilityId, "staff.created", nameof(BillingStaff), staff.Id, new { staff.Email, staff.Role });

        await _db.SaveChangesAsync(ct);
        return ToDto(staff);
    }

    public async Task<StaffDto> DeactivateAsync(Guid staffId, CancellationToken ct)
    {
        var tenantId = RequireTenant();
        var staff = await _db.BillingStaff.FirstOrDefaultAsync(s => s.TenantId == tenantId && s.Id == staffId, ct)
            ?? throw new NotFoundException("Staff member not found.");

        var actor = _context.TryGetStaff();
        if (actor?.UserId == staff.Id) throw new ConflictException("You cannot deactivate your own account.");

        staff.IsActive = false;
        staff.TokenVersion++;
        _audit.Record(actor, tenantId, staff.FacilityId, "staff.deactivated", nameof(BillingStaff), staff.Id, new { staff.Email });

        await _db.SaveChangesAsync(ct);
        _accessCache.Invalidate(staff.Id);
        return ToDto(staff);
    }

    private string RequireTenant()
    {
        var tenantId = _context.TenantId;
        if (string.IsNullOrWhiteSpace(tenantId)) throw new ForbiddenException("A tenant is required (X-Tenant-Id for internal callers).");
        return tenantId;
    }

    private static StaffDto ToDto(BillingStaff s) => new(s.Id, s.FacilityId, s.Email, s.FullName, s.Role, s.IsActive, s.CreatedAtUtc, s.LastLoginAtUtc);
}
