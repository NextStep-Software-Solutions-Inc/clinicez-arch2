using System;
using System.Collections.Generic;
using System.Linq;
using System.Threading;
using System.Threading.Tasks;
using ClinicEz.Laboratory.Application.Features.Requisitions.Commands;
using ClinicEz.Laboratory.Application.Features.Requisitions.Queries;
using ClinicEz.Laboratory.Domain.Entities;
using ClinicEz.Laboratory.Domain.Enums;
using ClinicEz.Laboratory.Domain.Interfaces;
using ClinicEz.Laboratory.Infrastructure.Persistence;
using ClinicEz.Shared.Interop;
using ClinicEz.Shared.Interop.Handling;
using FluentAssertions;
using Microsoft.EntityFrameworkCore;
using Microsoft.Extensions.DependencyInjection;
using Xunit;

namespace ClinicEz.Laboratory.Application.Tests;

/// <summary>
/// Cross-tenant leakage suite (plan 4.9): data is visible and writable only inside ONE (tenant, laboratory) pair, a missing
/// scope sees nothing (no null bypass) and only an explicit system scope sees everything.
/// </summary>
public class LabTenantIsolationTests
{
    private const string TenantA = "tenant-lab";
    private static readonly Guid LabA = LabInteropTestData.LabId;
    private const string TenantB = "tenant-other-lab";
    private static readonly Guid LabB = LabInteropTestData.OtherLabId;
    private const string SameAccession = "ACC-SAME";

    private static LabRequisition Requisition(string tenantId, Guid laboratoryId, string patient, string accession = SameAccession) => new()
    {
        Id = Guid.NewGuid(),
        TenantId = tenantId,
        LaboratoryId = laboratoryId,
        AccessionNumber = accession,
        PatientName = patient,
        ExternalRequisitionId = Guid.NewGuid()
    };

    /// <summary>Two laboratories of two tenants holding a requisition with the SAME accession number, plus one more laboratory of tenant A.</summary>
    private static async Task<(Guid RequisitionA, Guid RequisitionB)> SeedAsync(LabInteropHost host) => await host.WithDbAsync(async db =>
    {
        var a = Requisition(TenantA, LabA, "Patient A");
        var b = Requisition(TenantB, LabB, "Patient B");
        db.LabRequisitions.AddRange(a, b);
        db.LabRequisitions.Add(Requisition(TenantA, Guid.NewGuid(), "Patient A2 (second lab of tenant A)"));
        db.QcLots.Add(new QcLot { Id = Guid.NewGuid(), TenantId = TenantA, LaboratoryId = LabA, LotNumber = "LOT-1", ControlName = "Chem", AnalyteCode = "FBS" });
        db.QcLots.Add(new QcLot { Id = Guid.NewGuid(), TenantId = TenantB, LaboratoryId = LabB, LotNumber = "LOT-1", ControlName = "Chem", AnalyteCode = "FBS" });
        db.Products.Add(new Product { Id = Guid.NewGuid(), TenantId = TenantA, LaboratoryId = LabA, Name = "FBS", Sku = "FBS", Price = 1m });
        db.Products.Add(new Product { Id = Guid.NewGuid(), TenantId = TenantB, LaboratoryId = LabB, Name = "FBS", Sku = "FBS", Price = 2m });
        db.CriticalPanicDispatchLogs.Add(new CriticalPanicDispatchLog { Id = Guid.NewGuid(), TenantId = TenantA, LaboratoryId = LabA, RequisitionId = a.Id, AccessionNumber = SameAccession, PatientName = "Patient A", CriticalFindings = "K+ 7.1", DispatchedByMedTechName = "x", NotifiedDoctorName = "y" });
        db.CriticalPanicDispatchLogs.Add(new CriticalPanicDispatchLog { Id = Guid.NewGuid(), TenantId = TenantB, LaboratoryId = LabB, RequisitionId = b.Id, AccessionNumber = SameAccession, PatientName = "Patient B", CriticalFindings = "K+ 7.1", DispatchedByMedTechName = "x", NotifiedDoctorName = "y" });
        await db.SaveChangesAsync();
        return (a.Id, b.Id);
    });

    [Fact]
    public async Task A_laboratory_sees_only_its_own_rows_even_when_another_tenant_uses_the_same_accession_number()
    {
        using var host = new LabInteropHost();
        var (idA, idB) = await SeedAsync(host);

        await host.InLabScopeAsync(async sp =>
        {
            var db = sp.GetRequiredService<ApplicationDbContext>();
            (await db.LabRequisitions.Where(r => r.AccessionNumber == SameAccession).Select(r => r.PatientName).ToListAsync())
                .Should().Equal("Patient A");
            (await db.LabRequisitions.CountAsync()).Should().Be(1, "another laboratory of the SAME tenant is a different scope too");
            (await db.QcLots.Select(l => l.TenantId).ToListAsync()).Should().Equal(TenantA);
            (await db.Products.Select(p => p.Price).ToListAsync()).Should().Equal(1m);
            (await db.CriticalPanicDispatchLogs.Select(l => l.TenantId).ToListAsync()).Should().Equal(TenantA);

            var repository = sp.GetRequiredService<IRepository<LabRequisition>>();
            (await repository.GetByIdAsync(idA)).Should().NotBeNull();
            (await repository.GetByIdAsync(idB)).Should().BeNull("a foreign id is simply not found");
            return 0;
        }, TenantA, LabA);

        await host.InLabScopeAsync(async sp =>
        {
            var db = sp.GetRequiredService<ApplicationDbContext>();
            (await db.LabRequisitions.Select(r => r.PatientName).ToListAsync()).Should().Equal("Patient B");
            (await db.QcLots.Select(l => l.TenantId).ToListAsync()).Should().Equal(TenantB);
            return 0;
        }, TenantB, LabB);
    }

    [Fact]
    public async Task Queries_by_accession_or_id_never_cross_the_scope()
    {
        using var host = new LabInteropHost();
        var (_, idB) = await SeedAsync(host);

        await host.InLabScopeAsync(async sp =>
        {
            var handler = new GetRequisitionByIdQueryHandler(sp.GetRequiredService<IRepository<LabRequisition>>());

            var byAccession = await handler.Handle(new GetRequisitionByIdQuery(AccessionNumber: SameAccession), CancellationToken.None);
            var foreignById = await handler.Handle(new GetRequisitionByIdQuery(Id: idB), CancellationToken.None);
            var worklist = await new GetWorklistQueryHandler(sp.GetRequiredService<IRepository<LabRequisition>>())
                .Handle(new GetWorklistQuery(SearchTerm: "Patient"), CancellationToken.None);

            byAccession!.PatientName.Should().Be("Patient A");
            foreignById.Should().BeNull();
            worklist.Select(r => r.PatientName).Should().Equal("Patient A");
            return 0;
        }, TenantA, LabA);
    }

    [Fact]
    public async Task Without_a_scope_nothing_is_visible_and_only_the_system_scope_sees_everything()
    {
        using var host = new LabInteropHost();
        await SeedAsync(host);

        using (var scope = host.Provider.CreateScope())
        {
            scope.ServiceProvider.GetRequiredService<ILabContext>().ScopeKind.Should().Be(LabScopeKind.None);
            var db = scope.ServiceProvider.GetRequiredService<ApplicationDbContext>();
            (await db.LabRequisitions.CountAsync()).Should().Be(0);
            (await db.Products.CountAsync()).Should().Be(0);
            (await db.QcLots.CountAsync()).Should().Be(0);
            (await db.LabSettings.CountAsync()).Should().Be(0);
        }

        (await host.WithDbAsync(db => db.LabRequisitions.CountAsync())).Should().Be(3);
    }

    [Fact]
    public async Task A_facility_scope_without_tenant_or_laboratory_is_refused_and_an_unknown_pair_matches_nothing()
    {
        using var host = new LabInteropHost();
        await SeedAsync(host);

        var noTenant = () => host.InLabScopeAsync(sp => sp.GetRequiredService<ApplicationDbContext>().LabRequisitions.CountAsync(), string.Empty, Guid.Empty);
        await noTenant.Should().ThrowAsync<ArgumentException>();
        var noLab = () => host.InLabScopeAsync(sp => sp.GetRequiredService<ApplicationDbContext>().LabRequisitions.CountAsync(), TenantA, Guid.Empty);
        await noLab.Should().ThrowAsync<ArgumentException>();
        (await host.InLabScopeAsync(sp => sp.GetRequiredService<ApplicationDbContext>().LabRequisitions.CountAsync(), TenantB, LabA))
            .Should().Be(0, "a tenant/laboratory pair that does not exist matches nothing");
    }

    [Fact]
    public async Task Writes_are_stamped_with_the_scope_and_a_row_of_another_scope_is_refused()
    {
        using var host = new LabInteropHost();
        var (_, idB) = await SeedAsync(host);

        // A new row without an owner takes the active scope.
        var stamped = await host.InLabScopeAsync(async sp =>
        {
            var db = sp.GetRequiredService<ApplicationDbContext>();
            var product = new Product { Id = Guid.NewGuid(), Name = "CBC", Sku = "CBC", Price = 3m };
            db.Products.Add(product);
            await db.SaveChangesAsync();
            return product;
        }, TenantA, LabA);
        stamped.TenantId.Should().Be(TenantA);
        stamped.LaboratoryId.Should().Be(LabA);

        // A row that claims another tenant's laboratory cannot be written from this scope.
        Func<Task> foreignInsert = () => host.InLabScopeAsync(async sp =>
        {
            var db = sp.GetRequiredService<ApplicationDbContext>();
            db.LabRequisitions.Add(Requisition(TenantB, LabB, "smuggled"));
            await db.SaveChangesAsync();
            return 0;
        }, TenantA, LabA);
        await foreignInsert.Should().ThrowAsync<InvalidOperationException>();

        // Neither can a foreign row be updated by attaching it.
        Func<Task> foreignUpdate = () => host.InLabScopeAsync(async sp =>
        {
            var db = sp.GetRequiredService<ApplicationDbContext>();
            var foreign = new LabRequisition { Id = idB, TenantId = TenantB, LaboratoryId = LabB, AccessionNumber = SameAccession, PatientName = "hijacked" };
            db.LabRequisitions.Update(foreign);
            await db.SaveChangesAsync();
            return 0;
        }, TenantA, LabA);
        await foreignUpdate.Should().ThrowAsync<InvalidOperationException>();

        (await host.WithDbAsync(db => db.LabRequisitions.AsNoTracking().Where(r => r.Id == idB).Select(r => r.PatientName).SingleAsync()))
            .Should().Be("Patient B");
        (await host.WithDbAsync(db => db.LabRequisitions.CountAsync(r => r.PatientName == "smuggled"))).Should().Be(0);
    }

    [Fact]
    public async Task Orders_with_the_same_accession_for_two_tenants_laboratories_stay_in_their_own_worklists()
    {
        using var host = new LabInteropHost();
        await host.SeedLabAsync(PaymentPolicy.None);
        await host.WithDbAsync(async db =>
        {
            await LabInteropTestData.SeedLabAsync(db, PaymentPolicy.None, TenantB, LabB, "Other Laboratory");
            return 0;
        });
        var orderForA = LabInteropTestData.Order(SameAccession);
        var orderForB = LabInteropTestData.Order(SameAccession);

        (await host.Dispatcher.DispatchAsync(LabInteropTestData.OrderEnvelope(orderForA, LabInteropTestData.ClinicA, LabInteropTestData.Lab), default))
            .Outcome.Should().Be(DispatchOutcome.Handled);
        (await host.Dispatcher.DispatchAsync(LabInteropTestData.OrderEnvelope(orderForB, LabInteropTestData.ClinicB, LabInteropTestData.OtherLab), default))
            .Outcome.Should().Be(DispatchOutcome.Handled);

        var inA = await host.InLabScopeAsync(sp => sp.GetRequiredService<ApplicationDbContext>().LabRequisitions.ToListAsync(), TenantA, LabA);
        var inB = await host.InLabScopeAsync(sp => sp.GetRequiredService<ApplicationDbContext>().LabRequisitions.ToListAsync(), TenantB, LabB);

        inA.Should().ContainSingle().Which.ExternalRequisitionId.Should().Be(orderForA.RequisitionId);
        inB.Should().ContainSingle().Which.ExternalRequisitionId.Should().Be(orderForB.RequisitionId);
        inA[0].AccessionNumber.Should().Be(SameAccession, "accession numbers are per laboratory, so nothing is renamed");
        inB[0].AccessionNumber.Should().Be(SameAccession);
        inA[0].TenantId.Should().Be(TenantA);
        inB[0].TenantId.Should().Be(TenantB);
    }

    [Fact]
    public async Task Commands_cannot_touch_another_laboratorys_requisition()
    {
        using var host = new LabInteropHost();
        var (idA, _) = await SeedAsync(host);

        Func<Task> accession = () => host.InLabScopeAsync(async sp =>
        {
            var handler = new AccessionSpecimenCommandHandler(
                sp.GetRequiredService<IRepository<LabRequisition>>(),
                sp.GetRequiredService<IUnitOfWork>(),
                sp.GetRequiredService<ClinicEz.Laboratory.Application.Common.Interfaces.ILabOrderLifecycle>());
            await handler.Handle(new AccessionSpecimenCommand(idA, "intruder", new List<SpecimenAccessionInput>()), CancellationToken.None);
            return 0;
        }, TenantB, LabB);

        await accession.Should().ThrowAsync<KeyNotFoundException>();
        (await host.WithDbAsync(db => db.LabRequisitions.AsNoTracking().Where(r => r.Id == idA).Select(r => r.Stage).SingleAsync()))
            .Should().Be(RequisitionStage.Routed);
    }
}
