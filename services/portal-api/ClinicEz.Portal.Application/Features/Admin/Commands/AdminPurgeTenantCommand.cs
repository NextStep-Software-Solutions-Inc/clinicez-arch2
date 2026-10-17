using ClinicEz.Portal.Application.Features.Hub;
using ClinicEz.Portal.Application.Interfaces;
using ClinicEz.Portal.Domain.Entities;
using ClinicEz.Shared.Exceptions;
using FluentValidation;
using MediatR;
using Microsoft.EntityFrameworkCore;
using System;
using System.Linq;
using System.Threading;
using System.Threading.Tasks;

namespace ClinicEz.Portal.Application.Features.Admin.Commands;

public record AdminPurgeTenantCommand(Guid TenantId, string ConfirmSlug, string AdminName) 
    : IRequest<AdminPurgeTenantResultDto>;

public record AdminPurgeTenantResultDto(Guid TenantId, string FreedSlug, DateTime PurgedAt);

public class AdminPurgeTenantCommandValidator : AbstractValidator<AdminPurgeTenantCommand>
{
    public AdminPurgeTenantCommandValidator()
    {
        RuleFor(x => x.TenantId).NotEmpty().WithMessage("Tenant identifier is required.");
        RuleFor(x => x.ConfirmSlug).NotEmpty().WithMessage("Confirming workspace slug is required.");
        RuleFor(x => x.AdminName).NotEmpty().WithMessage("Admin name is required.");
    }
}

public class AdminPurgeTenantCommandHandler(
    IApplicationDbContext context, 
    IHubOnboardingService hubOnboarding)
    : IRequestHandler<AdminPurgeTenantCommand, AdminPurgeTenantResultDto>
{
    public async Task<AdminPurgeTenantResultDto> Handle(AdminPurgeTenantCommand request, CancellationToken cancellationToken)
    {
        var tenant = await context.Tenants
            .FirstOrDefaultAsync(t => t.Id == request.TenantId, cancellationToken)
            ?? throw new NotFoundException($"Workspace with ID '{request.TenantId}' was not found.");

        if (!string.Equals(request.ConfirmSlug?.Trim(), tenant.TenantSlug, StringComparison.OrdinalIgnoreCase))
        {
            throw new ValidationException("The entered confirmation slug does not match the workspace slug.");
        }

        // Zero-Data Invariant Checks (Mandatory for clinical, compliance, and tax reasons)
        if (tenant.ActivePatientRecordsCount > 0 || await context.Facilities.AnyAsync(f => f.TenantId == tenant.Id && f.PatientsCount > 0, cancellationToken))
        {
            throw new ConflictException("Cannot purge workspace: clinical patient records exist. Statutory medical record retention laws strictly prohibit hard deletion. You must Archive the workspace instead.");
        }

        if (await context.BillingInvoices.AnyAsync(i => i.TenantId == tenant.Id, cancellationToken) ||
            await context.PaymentReceipts.AnyAsync(r => r.TenantId == tenant.Id, cancellationToken))
        {
            throw new ConflictException("Cannot purge workspace: financial invoices or official tax receipts exist. Legal audit standards mandate archival rather than permanent deletion.");
        }

        if (await context.Subscriptions.AnyAsync(s => s.TenantId == tenant.Id && s.Status == SubscriptionStatus.Active, cancellationToken))
        {
            throw new ConflictException("Cannot purge workspace: an active paid subscription is still running. Cancel the subscription before purging.");
        }

        // Revoke any Interop Hub client registrations
        await hubOnboarding.RevokeWorkspaceAsync(tenant.Id, cancellationToken);

        // Cascade cleanup child entities
        var hubClients = await context.EdgeHubClients.Where(c => c.TenantId == tenant.Id).ToListAsync(cancellationToken);
        foreach (var c in hubClients) c.AllowHardDelete = true;
        context.EdgeHubClients.RemoveRange(hubClients);

        var facilities = await context.Facilities.Where(f => f.TenantId == tenant.Id).ToListAsync(cancellationToken);
        foreach (var f in facilities) f.AllowHardDelete = true;
        context.Facilities.RemoveRange(facilities);

        var allocations = await context.FacilityAllocations.Where(a => a.TenantId == tenant.Id).ToListAsync(cancellationToken);
        foreach (var a in allocations) a.AllowHardDelete = true;
        context.FacilityAllocations.RemoveRange(allocations);

        var branches = await context.Branches.Where(b => b.TenantId == tenant.Id).ToListAsync(cancellationToken);
        foreach (var b in branches) b.AllowHardDelete = true;
        context.Branches.RemoveRange(branches);

        var links = await context.FacilityLinks.Where(l => l.SourceTenantId == tenant.Id || l.TargetTenantId == tenant.Id).ToListAsync(cancellationToken);
        foreach (var l in links) l.AllowHardDelete = true;
        context.FacilityLinks.RemoveRange(links);

        var members = await context.WorkspaceMembers.Where(m => m.TenantId == tenant.Id).ToListAsync(cancellationToken);
        foreach (var m in members) m.AllowHardDelete = true;
        context.WorkspaceMembers.RemoveRange(members);

        var staff = await context.StaffMembers.Where(s => s.TenantId == tenant.Id).ToListAsync(cancellationToken);
        foreach (var s in staff) s.AllowHardDelete = true;
        context.StaffMembers.RemoveRange(staff);

        var subscriptions = await context.Subscriptions.Where(s => s.TenantId == tenant.Id).ToListAsync(cancellationToken);
        foreach (var s in subscriptions) s.AllowHardDelete = true;
        context.Subscriptions.RemoveRange(subscriptions);

        var entitlements = await context.PlanEntitlements.Where(e => e.TenantId == tenant.Id).ToListAsync(cancellationToken);
        foreach (var e in entitlements) e.AllowHardDelete = true;
        context.PlanEntitlements.RemoveRange(entitlements);

        var overrides = await context.EntitlementOverrides.Where(o => o.TenantId == tenant.Id).ToListAsync(cancellationToken);
        foreach (var o in overrides) o.AllowHardDelete = true;
        context.EntitlementOverrides.RemoveRange(overrides);

        var settings = await context.WorkspaceSettings.Where(w => w.TenantId == tenant.Id).ToListAsync(cancellationToken);
        foreach (var w in settings) w.AllowHardDelete = true;
        context.WorkspaceSettings.RemoveRange(settings);

        var apiKeys = await context.WorkspaceApiKeys.Where(k => k.TenantId == tenant.Id).ToListAsync(cancellationToken);
        foreach (var k in apiKeys) k.AllowHardDelete = true;
        context.WorkspaceApiKeys.RemoveRange(apiKeys);

        var notifications = await context.PortalNotifications.Where(n => n.TenantId == tenant.Id).ToListAsync(cancellationToken);
        foreach (var n in notifications) n.AllowHardDelete = true;
        context.PortalNotifications.RemoveRange(notifications);

        var webhookEndpoints = await context.WebhookEndpoints.Where(w => w.TenantId == tenant.Id).ToListAsync(cancellationToken);
        foreach (var w in webhookEndpoints) w.AllowHardDelete = true;
        context.WebhookEndpoints.RemoveRange(webhookEndpoints);

        var webhookDeliveries = await context.WebhookDeliveries.Where(w => w.TenantId == tenant.Id).ToListAsync(cancellationToken);
        foreach (var w in webhookDeliveries) w.AllowHardDelete = true;
        context.WebhookDeliveries.RemoveRange(webhookDeliveries);

        var auditEntries = await context.WorkspaceAuditEntries.Where(a => a.TenantId == tenant.Id).ToListAsync(cancellationToken);
        foreach (var a in auditEntries) a.AllowHardDelete = true;
        context.WorkspaceAuditEntries.RemoveRange(auditEntries);

        var transfers = await context.OwnershipTransfers.Where(t => t.TenantId == tenant.Id).ToListAsync(cancellationToken);
        foreach (var t in transfers) t.AllowHardDelete = true;
        context.OwnershipTransfers.RemoveRange(transfers);

        var freedSlug = tenant.TenantSlug;
        tenant.AllowHardDelete = true;
        context.Tenants.Remove(tenant);

        await context.SaveChangesAsync(cancellationToken);

        return new AdminPurgeTenantResultDto(tenant.Id, freedSlug, DateTime.UtcNow);
    }
}
