using System;
using System.Collections.Generic;
using System.Linq;
using System.Text;
using System.Threading;
using System.Threading.Tasks;
using ClinicEz.Clinic.Application.Common.Interfaces;
using ClinicEz.Clinic.Application.Features.Billing.Commands;
using ClinicEz.Clinic.Application.Features.Billing.DTOs;
using ClinicEz.Clinic.Application.Tests.TestInfrastructure;
using ClinicEz.Clinic.Domain.Entities;
using ClinicEz.Clinic.Domain.Enums;
using ClinicEz.Clinic.Domain.Interfaces;
using ClinicEz.Clinic.Infrastructure.Persistence;
using ClinicEz.Clinic.Infrastructure.Persistence.Interceptors;
using ClinicEz.Clinic.Infrastructure.Persistence.Repositories;
using ClinicEz.Clinic.Infrastructure.Services;
using ClinicEz.Shared.Interop;
using FluentAssertions;
using Microsoft.Data.Sqlite;
using Microsoft.EntityFrameworkCore;
using Microsoft.Extensions.Configuration;
using Npgsql;
using NSubstitute;
using Sieve.Services;
using Testcontainers.PostgreSql;
using Xunit;

namespace ClinicEz.Clinic.Application.Tests.Features.Billing;

/// <summary>
/// Integration tests verifying Walk-In Retail POS invoices persist PatientId = NULL
/// against relational foreign-key constraints (always-on SQLite FK enforcement +
/// real PostgreSQL 17 Testcontainers with EF Core migrations).
/// </summary>
public class WalkInRetailPostgresIntegrationTests
{
    private static (Guid ClinicId, string TenantId, IClinicContext ClinicContext) CreateClinicContext()
    {
        var clinicId = Guid.NewGuid();
        var tenantId = $"tenant_retail_fk_{Guid.NewGuid():N}";
        var clinicContext = Substitute.For<IClinicContext>();
        clinicContext.ClinicId.Returns(clinicId);
        clinicContext.TenantId.Returns(tenantId);
        clinicContext.StaffId.Returns(Guid.NewGuid());
        return (clinicId, tenantId, clinicContext);
    }

    private static async Task<(SqliteConnection Connection, ApplicationDbContext Db, UnitOfWork Uow, ISieveProcessor Sieve)>
        CreateRelationalSqliteContextAsync(IClinicContext clinicContext)
    {
        var connection = new SqliteConnection("DataSource=:memory:");
        await connection.OpenAsync();

        await using (var pragmaCmd = connection.CreateCommand())
        {
            pragmaCmd.CommandText = "PRAGMA foreign_keys = ON;";
            await pragmaCmd.ExecuteNonQueryAsync();
        }

        var config = new ConfigurationBuilder()
            .AddInMemoryCollection(new[] { new KeyValuePair<string, string?>("DbSchema", "public") })
            .Build();

        var options = new DbContextOptionsBuilder<ApplicationDbContext>()
            .UseSqlite(connection)
            .AddInterceptors(
                new SoftDeleteSaveChangesInterceptor(),
                new ClinicPortalProjectionInterceptor(),
                new DomainEventDispatchSaveChangesInterceptor(Substitute.For<IServiceProvider>()))
            .Options;

        var db = new ApplicationDbContext(options, config, clinicContext);
        await db.Database.EnsureCreatedAsync();

        await using (var verifyCmd = connection.CreateCommand())
        {
            verifyCmd.CommandText = "PRAGMA foreign_keys;";
            var fkEnabled = Convert.ToInt64(await verifyCmd.ExecuteScalarAsync());
            fkEnabled.Should().Be(1L, "SQLite PRAGMA foreign_keys must be active to enforce FK_Invoices_Patients_PatientId");
        }

        var sieve = Substitute.For<ISieveProcessor>();
        var uow = new UnitOfWork(db, sieve, Substitute.For<IProductRepository>());
        return (connection, db, uow, sieve);
    }

    [Fact]
    public async Task RelationalFk_WalkInRetailInvoice_WithNullPatientId_CreatesAndSettlesPaymentAndRendersPdf()
    {
        var (clinicId, tenantId, clinicContext) = CreateClinicContext();
        var (connection, db, uow, sieve) = await CreateRelationalSqliteContextAsync(clinicContext);
        await using var _ = connection;
        await using var __ = db;

        var settings = new FacilitySettings
        {
            Id = Guid.NewGuid(),
            TenantId = tenantId,
            ClinicId = clinicId,
            ClinicName = "Walk-In Retail Test Clinic",
            CashierMode = "ClinicDesk"
        };
        await db.Set<FacilitySettings>().AddAsync(settings);
        await db.SaveChangesAsync();

        var invoiceRepo = new Repository<Invoice>(db, sieve);
        var patientRepo = new Repository<Patient>(db, sieve);
        var encounterRepo = new Repository<ConsultationEncounter>(db, sieve);
        var settingsRepo = new Repository<FacilitySettings>(db, sieve);
        var publisher = Substitute.For<IBillingRequestPublisher>();

        var createHandler = new CreateInvoiceCommandHandler(
            invoiceRepo, patientRepo, encounterRepo, settingsRepo, uow, clinicContext, publisher);

        var created = await createHandler.Handle(new CreateInvoiceCommand(
            PatientId: null,
            PatientName: null,
            DiscountType: DiscountType.None,
            LineItems: new List<CreateInvoiceLineItemRequest>
            {
                new(null, "PROC-WOUND", "Wound Dressing & Debridement", "Procedure", 350m, 1)
            },
            AllowDuplicate: true,
            IsWalkInRetail: true,
            WalkInCustomerName: "Walk-In Customer"), CancellationToken.None);

        created.PatientId.Should().BeNull();
        created.PatientName.Should().Be("Walk-In Customer");
        created.NetAmount.Should().Be(350m);
        created.Status.Should().Be(InvoiceStatus.Draft);

        var persisted = await db.Invoices.AsNoTracking().SingleAsync(i => i.Id == created.Id);
        persisted.PatientId.Should().BeNull();
        persisted.IsWalkInRetail.Should().BeTrue();

        var paymentHandler = new RecordPaymentCommandHandler(
            invoiceRepo, null, uow, clinicContext, Substitute.For<IInteropPublisher>());

        var paid = await paymentHandler.Handle(
            new RecordPaymentCommand(created.Id, 350m, PaymentMethod.Cash, Notes: "Retail POS cash"),
            CancellationToken.None);

        paid.Status.Should().Be(InvoiceStatus.Paid);
        paid.PatientId.Should().BeNull();
        paid.AmountPaid.Should().Be(350m);
        paid.BalanceDue.Should().Be(0m);
        paid.Payments.Should().ContainSingle();
        paid.Payments[0].PaymentNumber.Should().StartWith("OR-");

        var paidEntity = await db.Invoices
            .Include(i => i.LineItems)
            .Include(i => i.Payments)
            .SingleAsync(i => i.Id == created.Id);

        var pdfService = new ClinicDocumentPdfService();
        var soaBytes = pdfService.GenerateInvoicePdf(paidEntity, settings);
        var receiptBytes = pdfService.GenerateOfficialReceiptPdf(paidEntity, paidEntity.Payments.First(), settings);

        Encoding.ASCII.GetString(soaBytes, 0, 5).Should().Be("%PDF-");
        Encoding.ASCII.GetString(receiptBytes, 0, 5).Should().Be("%PDF-");
    }

    [Fact]
    public async Task RelationalFk_WalkInRetailInvoice_WithEmptyGuidPatientId_NormalizesToNullAndSettlesPayment()
    {
        var (clinicId, tenantId, clinicContext) = CreateClinicContext();
        var (connection, db, uow, sieve) = await CreateRelationalSqliteContextAsync(clinicContext);
        await using var _ = connection;
        await using var __ = db;

        var invoiceRepo = new Repository<Invoice>(db, sieve);
        var createHandler = new CreateInvoiceCommandHandler(
            invoiceRepo,
            new Repository<Patient>(db, sieve),
            new Repository<ConsultationEncounter>(db, sieve),
            new Repository<FacilitySettings>(db, sieve),
            uow,
            clinicContext,
            Substitute.For<IBillingRequestPublisher>());

        var created = await createHandler.Handle(new CreateInvoiceCommand(
            PatientId: Guid.Empty,
            PatientName: "Walk-In Guest",
            LineItems: new List<CreateInvoiceLineItemRequest>
            {
                new(null, "MED-PCM", "Paracetamol 500mg", "Medicine", 25m, 2)
            },
            IsWalkInRetail: true,
            WalkInCustomerName: "Walk-In Guest"), CancellationToken.None);

        created.PatientId.Should().BeNull("Guid.Empty on IsWalkInRetail must normalize to NULL");

        var persisted = await db.Invoices.AsNoTracking().SingleAsync(i => i.Id == created.Id);
        persisted.PatientId.Should().BeNull();

        var paymentHandler = new RecordPaymentCommandHandler(
            invoiceRepo, null, uow, clinicContext, Substitute.For<IInteropPublisher>());

        var paid = await paymentHandler.Handle(
            new RecordPaymentCommand(created.Id, 50m, PaymentMethod.Cash),
            CancellationToken.None);

        paid.Status.Should().Be(InvoiceStatus.Paid);
        paid.BalanceDue.Should().Be(0m);
    }

    [Fact]
    public async Task RelationalFk_WalkInRetailInvoice_UpdateInCashierCounterMode_DoesNotForwardToBillingCounter()
    {
        var (clinicId, tenantId, clinicContext) = CreateClinicContext();
        var (connection, db, uow, sieve) = await CreateRelationalSqliteContextAsync(clinicContext);
        await using var _ = connection;
        await using var __ = db;

        await db.Set<FacilitySettings>().AddAsync(new FacilitySettings
        {
            Id = Guid.NewGuid(),
            TenantId = tenantId,
            ClinicId = clinicId,
            ClinicName = "Centralized Hospital Clinic",
            CashierMode = "CashierCounter"
        });
        await db.SaveChangesAsync();

        var invoiceRepo = new Repository<Invoice>(db, sieve);
        var patientRepo = new Repository<Patient>(db, sieve);
        var encounterRepo = new Repository<ConsultationEncounter>(db, sieve);
        var settingsRepo = new Repository<FacilitySettings>(db, sieve);
        var publisher = Substitute.For<IBillingRequestPublisher>();

        var createHandler = new CreateInvoiceCommandHandler(
            invoiceRepo, patientRepo, encounterRepo, settingsRepo, uow, clinicContext, publisher);

        var created = await createHandler.Handle(new CreateInvoiceCommand(
            PatientId: null,
            LineItems: new List<CreateInvoiceLineItemRequest>
            {
                new(null, "SUP-MASK", "Surgical Mask Box", "Supply", 150m, 1)
            },
            IsWalkInRetail: true,
            WalkInCustomerName: "Retail Customer"), CancellationToken.None);

        var updateHandler = new UpdateInvoiceCommandHandler(
            invoiceRepo, patientRepo, encounterRepo, settingsRepo, uow, clinicContext, publisher);

        var updated = await updateHandler.Handle(new UpdateInvoiceCommand(
            InvoiceId: created.Id,
            Notes: "Updated retail quantity",
            LineItems: new List<CreateInvoiceLineItemRequest>
            {
                new(null, "SUP-MASK", "Surgical Mask Box", "Supply", 150m, 2)
            }), CancellationToken.None);

        updated.PatientId.Should().BeNull();
        updated.NetAmount.Should().Be(300m);

        await publisher.DidNotReceiveWithAnyArgs().PublishInvoiceRequestedAsync(default!, default!);

        var persisted = await db.Invoices.AsNoTracking().SingleAsync(i => i.Id == created.Id);
        persisted.BillingRequestedAt.Should().BeNull();

        var paymentHandler = new RecordPaymentCommandHandler(
            invoiceRepo, null, uow, clinicContext, Substitute.For<IInteropPublisher>());

        var paid = await paymentHandler.Handle(
            new RecordPaymentCommand(created.Id, 300m, PaymentMethod.Cash),
            CancellationToken.None);

        paid.Status.Should().Be(InvoiceStatus.Paid);
    }

    [Fact]
    public async Task RelationalFk_DirectInsertWithGuidEmptyPatientId_ThrowsForeignKeyViolation()
    {
        var (clinicId, tenantId, clinicContext) = CreateClinicContext();
        var (connection, db, _, _) = await CreateRelationalSqliteContextAsync(clinicContext);
        await using var _ = connection;
        await using var __ = db;

        db.Invoices.Add(new Invoice
        {
            Id = Guid.NewGuid(),
            TenantId = tenantId,
            ClinicId = clinicId,
            InvoiceNumber = "INV-FK-NEGATIVE-001",
            PatientId = Guid.Empty,
            PatientName = "Invalid FK Walk-In",
            IsWalkInRetail = true,
            GrossAmount = 100m,
            NetAmount = 100m,
            BalanceDue = 100m,
            Status = InvoiceStatus.Draft
        });

        var act = () => db.SaveChangesAsync();
        await act.Should().ThrowAsync<DbUpdateException>(
            "Inserting Guid.Empty into a foreign-keyed PatientId column must fail when relational FK constraints are enabled");
    }

    [DockerAvailableFact]
    public async Task PostgreSql_WalkInRetailInvoice_NullPatientId_SatisfiesForeignKeyAndSettlesPayment()
    {
        await using var postgres = new PostgreSqlBuilder("postgres:17-alpine")
            .WithDatabase("clinicez_clinic_test")
            .Build();

        await postgres.StartAsync();

        var (clinicId, tenantId, clinicContext) = CreateClinicContext();
        var config = new ConfigurationBuilder()
            .AddInMemoryCollection(new[] { new KeyValuePair<string, string?>("DbSchema", "public") })
            .Build();

        var options = new DbContextOptionsBuilder<ApplicationDbContext>()
            .UseNpgsql(
                postgres.GetConnectionString() + ";SSL Mode=Disable;Trust Server Certificate=true",
                npgsql => npgsql.MigrationsHistoryTable("__EFMigrationsHistory", "public"))
            .AddInterceptors(
                new SoftDeleteSaveChangesInterceptor(),
                new ClinicPortalProjectionInterceptor(),
                new DomainEventDispatchSaveChangesInterceptor(Substitute.For<IServiceProvider>()))
            .Options;

        await using (var migrationDb = new ApplicationDbContext(options, config, clinicContext))
        {
            await migrationDb.Database.MigrateAsync();
        }

        // Negative control: verify PostgreSQL rejects Guid.Empty with SQLSTATE 23503 (FOREIGN_KEY_VIOLATION)
        await using (var negativeDb = new ApplicationDbContext(options, config, clinicContext))
        {
            negativeDb.Invoices.Add(new Invoice
            {
                Id = Guid.NewGuid(),
                TenantId = tenantId,
                ClinicId = clinicId,
                InvoiceNumber = "INV-PG-FK-NEG-001",
                PatientId = Guid.Empty,
                PatientName = "Broken Retail Invoice",
                IsWalkInRetail = true,
                GrossAmount = 350m,
                NetAmount = 350m,
                BalanceDue = 350m,
                Status = InvoiceStatus.Draft
            });

            var negativeAct = () => negativeDb.SaveChangesAsync();
            var ex = (await negativeAct.Should().ThrowAsync<DbUpdateException>()).Which;
            ex.InnerException.Should().BeOfType<PostgresException>()
                .Which.SqlState.Should().Be(PostgresErrorCodes.ForeignKeyViolation);
        }

        // Positive end-to-end test: CreateInvoiceCommand + RecordPaymentCommand with IsWalkInRetail = true & PatientId = null
        await using var db = new ApplicationDbContext(options, config, clinicContext);
        var sieve = Substitute.For<ISieveProcessor>();
        var uow = new UnitOfWork(db, sieve, Substitute.For<IProductRepository>());
        var invoiceRepo = new Repository<Invoice>(db, sieve);
        var patientRepo = new Repository<Patient>(db, sieve);
        var encounterRepo = new Repository<ConsultationEncounter>(db, sieve);
        var settingsRepo = new Repository<FacilitySettings>(db, sieve);
        var publisher = Substitute.For<IBillingRequestPublisher>();

        var createHandler = new CreateInvoiceCommandHandler(
            invoiceRepo, patientRepo, encounterRepo, settingsRepo, uow, clinicContext, publisher);

        var created = await createHandler.Handle(new CreateInvoiceCommand(
            PatientId: null,
            PatientName: null,
            DiscountType: DiscountType.None,
            LineItems: new List<CreateInvoiceLineItemRequest>
            {
                new(null, "PROC-WOUND", "Wound Dressing & Debridement", "Procedure", 350m, 1)
            },
            AllowDuplicate: true,
            IsWalkInRetail: true,
            WalkInCustomerName: "Juan Dela Cruz"), CancellationToken.None);

        created.PatientId.Should().BeNull();
        created.PatientName.Should().Be("Juan Dela Cruz");
        created.Status.Should().Be(InvoiceStatus.Draft);

        var paymentHandler = new RecordPaymentCommandHandler(
            invoiceRepo, null, uow, clinicContext, Substitute.For<IInteropPublisher>());

        var paid = await paymentHandler.Handle(
            new RecordPaymentCommand(created.Id, 350m, PaymentMethod.Cash, Notes: "Retail POS cash"),
            CancellationToken.None);

        paid.Status.Should().Be(InvoiceStatus.Paid);
        paid.PatientId.Should().BeNull();
        paid.AmountPaid.Should().Be(350m);
        paid.BalanceDue.Should().Be(0m);
        paid.Payments.Should().ContainSingle();

        var persisted = await db.Invoices
            .AsNoTracking()
            .Include(i => i.Payments)
            .SingleAsync(i => i.Id == created.Id);

        persisted.PatientId.Should().BeNull();
        persisted.IsWalkInRetail.Should().BeTrue();
        persisted.Status.Should().Be(InvoiceStatus.Paid);
        persisted.Payments.Should().ContainSingle();
    }
}
