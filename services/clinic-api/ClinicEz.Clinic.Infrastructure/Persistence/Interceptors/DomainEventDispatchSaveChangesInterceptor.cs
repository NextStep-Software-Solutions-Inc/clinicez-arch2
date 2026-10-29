using System;
using System.Collections.Generic;
using System.Linq;
using System.Threading;
using System.Threading.Tasks;
using ClinicEz.Clinic.Domain.Common;
using ClinicEz.Clinic.Domain.Entities;
using ClinicEz.Clinic.Domain.Enums;
using MediatR;
using Microsoft.EntityFrameworkCore;
using Microsoft.EntityFrameworkCore.Diagnostics;
using Microsoft.Extensions.DependencyInjection;

namespace ClinicEz.Clinic.Infrastructure.Persistence.Interceptors;

public sealed class DomainEventDispatchSaveChangesInterceptor : SaveChangesInterceptor
{
    private readonly IServiceProvider _serviceProvider;
    private readonly List<IDomainEvent> _pendingEvents = new();

    public DomainEventDispatchSaveChangesInterceptor(IServiceProvider serviceProvider)
    {
        _serviceProvider = serviceProvider;
    }

    public override InterceptionResult<int> SavingChanges(DbContextEventData eventData, InterceptionResult<int> result)
    {
        if (eventData.Context is not null)
        {
            MaintainActiveSafetyAlerts(eventData.Context);
            CollectDomainEvents(eventData.Context);
        }
        return base.SavingChanges(eventData, result);
    }

    public override async ValueTask<InterceptionResult<int>> SavingChangesAsync(
        DbContextEventData eventData,
        InterceptionResult<int> result,
        CancellationToken cancellationToken = default)
    {
        if (eventData.Context is not null)
        {
            await MaintainActiveSafetyAlertsAsync(eventData.Context, cancellationToken);
            CollectDomainEvents(eventData.Context);
        }
        return await base.SavingChangesAsync(eventData, result, cancellationToken);
    }

    public override int SavedChanges(SaveChangesCompletedEventData eventData, int result)
    {
        DispatchEventsAsync(CancellationToken.None).GetAwaiter().GetResult();
        return base.SavedChanges(eventData, result);
    }

    public override async ValueTask<int> SavedChangesAsync(
        SaveChangesCompletedEventData eventData,
        int result,
        CancellationToken cancellationToken = default)
    {
        await DispatchEventsAsync(cancellationToken);
        return await base.SavedChangesAsync(eventData, result, cancellationToken);
    }

    private void CollectDomainEvents(DbContext context)
    {
        var entitiesWithEvents = context.ChangeTracker
            .Entries<BaseEntity>()
            .Where(e => e.Entity.DomainEvents.Count > 0)
            .Select(e => e.Entity)
            .ToList();

        foreach (var entity in entitiesWithEvents)
        {
            _pendingEvents.AddRange(entity.DomainEvents);
            entity.ClearDomainEvents();
        }
    }

    private async Task DispatchEventsAsync(CancellationToken cancellationToken)
    {
        if (_pendingEvents.Count == 0) return;

        var eventsToDispatch = _pendingEvents.ToList();
        _pendingEvents.Clear();

        var publisher = _serviceProvider.GetService<IPublisher>() ?? _serviceProvider.GetService<IMediator>();
        if (publisher == null) return;

        foreach (var domainEvent in eventsToDispatch)
        {
            await publisher.Publish(domainEvent, cancellationToken);
        }
    }

    private void MaintainActiveSafetyAlerts(DbContext context)
    {
        var affectedPatientIds = GetAffectedPatientIds(context);
        if (affectedPatientIds.Count == 0) return;

        var nowUtc = DateTime.UtcNow;

        foreach (var patientId in affectedPatientIds)
        {
            var patient = context.Set<Patient>().Local.FirstOrDefault(p => p.Id == patientId)
                ?? context.Set<Patient>().FirstOrDefault(p => p.Id == patientId);

            if (patient == null) continue;

            var hasActiveAlert = EvaluatePatientSafetyAlert(context, patientId, nowUtc);
            patient.HasActiveSafetyAlert = hasActiveAlert;
        }
    }

    private async Task MaintainActiveSafetyAlertsAsync(DbContext context, CancellationToken cancellationToken)
    {
        var affectedPatientIds = GetAffectedPatientIds(context);
        if (affectedPatientIds.Count == 0) return;

        var nowUtc = DateTime.UtcNow;

        foreach (var patientId in affectedPatientIds)
        {
            var patient = context.Set<Patient>().Local.FirstOrDefault(p => p.Id == patientId)
                ?? await context.Set<Patient>().FirstOrDefaultAsync(p => p.Id == patientId, cancellationToken);

            if (patient == null) continue;

            var hasActiveAlert = EvaluatePatientSafetyAlert(context, patientId, nowUtc);
            patient.HasActiveSafetyAlert = hasActiveAlert;
        }
    }

    private static HashSet<Guid> GetAffectedPatientIds(DbContext context)
    {
        var affectedPatientIds = new HashSet<Guid>();

        var alertEntries = context.ChangeTracker.Entries<PatientAlert>()
            .Where(e => e.State is EntityState.Added or EntityState.Modified or EntityState.Deleted);
        foreach (var entry in alertEntries)
        {
            if (entry.Entity.PatientId != Guid.Empty)
                affectedPatientIds.Add(entry.Entity.PatientId);
        }

        var allergyEntries = context.ChangeTracker.Entries<PatientAllergy>()
            .Where(e => e.State is EntityState.Added or EntityState.Modified or EntityState.Deleted);
        foreach (var entry in allergyEntries)
        {
            if (entry.Entity.PatientId != Guid.Empty)
                affectedPatientIds.Add(entry.Entity.PatientId);
        }

        return affectedPatientIds;
    }

    private static bool EvaluatePatientSafetyAlert(DbContext context, Guid patientId, DateTime nowUtc)
    {
        var localAlerts = context.Set<PatientAlert>().Local
            .Where(a => a.PatientId == patientId)
            .ToList();

        var hasActiveLocalAlert = localAlerts.Any(a =>
            !a.IsDeleted &&
            a.Status == PatientAlertStatus.Active &&
            (!a.ExpiresAt.HasValue || a.ExpiresAt.Value > nowUtc));

        if (hasActiveLocalAlert) return true;

        var localAllergies = context.Set<PatientAllergy>().Local
            .Where(a => a.PatientId == patientId)
            .ToList();

        var hasActiveLocalAllergy = localAllergies.Any(a =>
            !a.IsDeleted &&
            a.Status == AllergyStatus.Active &&
            (a.IsAnaphylactic || a.Severity >= AllergySeverity.Severe));

        if (hasActiveLocalAllergy) return true;

        var localDeletedAlertIds = localAlerts
            .Where(a => a.IsDeleted || a.Status != PatientAlertStatus.Active || (a.ExpiresAt.HasValue && a.ExpiresAt.Value <= nowUtc))
            .Select(a => a.Id)
            .ToHashSet();

        var hasDbAlert = context.Set<PatientAlert>()
            .Any(a => a.PatientId == patientId && !a.IsDeleted && a.Status == PatientAlertStatus.Active && (!a.ExpiresAt.HasValue || a.ExpiresAt > nowUtc) && !localDeletedAlertIds.Contains(a.Id));

        if (hasDbAlert) return true;

        var localDeletedAllergyIds = localAllergies
            .Where(a => a.IsDeleted || a.Status != AllergyStatus.Active || (!a.IsAnaphylactic && a.Severity < AllergySeverity.Severe))
            .Select(a => a.Id)
            .ToHashSet();

        var hasDbAllergy = context.Set<PatientAllergy>()
            .Any(a => a.PatientId == patientId && !a.IsDeleted && a.Status == AllergyStatus.Active && (a.IsAnaphylactic || a.Severity >= AllergySeverity.Severe) && !localDeletedAllergyIds.Contains(a.Id));

        return hasDbAllergy;
    }
}
