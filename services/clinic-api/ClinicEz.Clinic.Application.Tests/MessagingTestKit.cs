using System;
using System.Collections.Generic;
using System.Linq;
using System.Threading;
using ClinicEz.Clinic.Domain.Entities;
using ClinicEz.Clinic.Domain.Interfaces;
using ClinicEz.Clinic.Infrastructure.Messaging;
using ClinicEz.Clinic.Infrastructure.Persistence;
using ClinicEz.Shared.Common;
using ClinicEz.Shared.Interop;
using ClinicEz.Shared.Interop.Handling;
using ClinicEz.Shared.Interop.Persistence;
using Microsoft.EntityFrameworkCore;
using Microsoft.Extensions.Configuration;
using Microsoft.Extensions.Logging.Abstractions;
using NSubstitute;

namespace ClinicEz.Clinic.Application.Tests;

/// <summary>Builds the pieces interop handler and publisher tests need, on an in-memory database.</summary>
internal static class MessagingTestKit
{
    public static ApplicationDbContext CreateDbContext(IClinicContext? clinicContext = null)
    {
        var config = new ConfigurationBuilder()
            .AddInMemoryCollection(new[] { new KeyValuePair<string, string?>("DbSchema", "public") })
            .Build();

        var options = new DbContextOptionsBuilder<ApplicationDbContext>()
            .UseInMemoryDatabase(databaseName: $"ClinicEz_InteropTest_{Guid.NewGuid()}")
            .Options;

        return new ApplicationDbContext(options, config, clinicContext);
    }

    public static FacilitySettings SeedClinic(ApplicationDbContext db, Guid clinicId, string tenantId, string name = "Test Clinic")
    {
        var settings = new FacilitySettings
        {
            Id = Guid.NewGuid(),
            TenantId = tenantId,
            ClinicId = clinicId,
            ClinicName = name,
            CreatedAt = DateTime.UtcNow,
            CreatedBy = "test"
        };
        db.Settings.Add(settings);
        db.SaveChanges();
        return settings;
    }

    public static ClinicRecipientResolver Recipient(ApplicationDbContext db) =>
        new(db, NullLogger<ClinicRecipientResolver>.Instance);

    public static ClinicPatientAddressResolver Addresses(ApplicationDbContext db) => new(db);

    public static Party ClinicParty(string tenantId, Guid clinicId) =>
        Party.ForFacility(tenantId, clinicId.ToString(), FacilityType.Clinic);

    public static Party LabParty() =>
        Party.ForFacility("lab-tenant", Guid.NewGuid().ToString(), FacilityType.Laboratory);

    public static Party PharmacyParty() =>
        Party.ForFacility("pharmacy-tenant", Guid.NewGuid().ToString(), FacilityType.Pharmacy);

    /// <summary>The context a handler receives for a delivered message.</summary>
    public static InteropMessageContext Delivered<T>(string type, Party from, Party to, Guid correlationId, T payload) =>
        new(InteropEnvelope.Create(type, from, to, correlationId, payload));

    /// <summary>
    /// Wraps a unit of work so a test can see what is pending at the instant of every save: an interop outbox row
    /// queued next to the business change means both commit in the same transaction.
    /// </summary>
    public sealed class SaveProbe
    {
        public List<(int PendingOutbox, int PendingBusiness)> Saves { get; } = new();

        public IUnitOfWork Wrap(ApplicationDbContext db, IUnitOfWork inner)
        {
            var wrapped = Substitute.For<IUnitOfWork>();
            wrapped.SaveChangesAsync(Arg.Any<CancellationToken>()).Returns(call =>
            {
                var pendingOutbox = db.ChangeTracker.Entries<InteropOutboxMessage>().Count(e => e.State == EntityState.Added);
                var pendingBusiness = db.ChangeTracker.Entries().Count(e => e.State == EntityState.Added && e.Entity is not InteropOutboxMessage);
                Saves.Add((pendingOutbox, pendingBusiness));
                return inner.SaveChangesAsync(call.Arg<CancellationToken>());
            });
            return wrapped;
        }
    }
}
