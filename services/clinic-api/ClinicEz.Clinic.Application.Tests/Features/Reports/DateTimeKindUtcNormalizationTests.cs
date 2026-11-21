using System;
using System.Threading;
using System.Threading.Tasks;
using ClinicEz.Clinic.Application.Features.Billing.Queries;
using ClinicEz.Clinic.Application.Features.LabOrders.Queries;
using ClinicEz.Clinic.Application.Features.Procedures.Queries;
using ClinicEz.Clinic.Application.Features.Reports.Queries;
using ClinicEz.Clinic.Domain.Entities;
using ClinicEz.Clinic.Domain.Enums;
using ClinicEz.Clinic.Domain.Interfaces;
using ClinicEz.Shared.Common;
using FluentAssertions;
using NSubstitute;
using Xunit;

namespace ClinicEz.Clinic.Application.Tests.Features.Reports;

public class DateTimeKindUtcNormalizationTests
{
    private readonly IClinicContext _clinicContext;
    private readonly Guid _testClinicId = Guid.NewGuid();
    private const string _testTenantId = "tenant-utc-test";

    public DateTimeKindUtcNormalizationTests()
    {
        _clinicContext = Substitute.For<IClinicContext>();
        _clinicContext.ClinicId.Returns(_testClinicId);
        _clinicContext.TenantId.Returns(_testTenantId);
    }

    [Fact]
    public void DateTimeExtensions_ToStartOfDayUtc_AlwaysProducesUtcKind()
    {
        var unspecified = new DateTime(2026, 10, 20, 15, 30, 45, DateTimeKind.Unspecified);
        var local = new DateTime(2026, 10, 20, 15, 30, 45, DateTimeKind.Local);
        var utc = new DateTime(2026, 10, 20, 15, 30, 45, DateTimeKind.Utc);

        var rUnspecified = unspecified.ToStartOfDayUtc();
        var rLocal = local.ToStartOfDayUtc();
        var rUtc = utc.ToStartOfDayUtc();

        rUnspecified.Kind.Should().Be(DateTimeKind.Utc);
        rUnspecified.Should().Be(new DateTime(2026, 10, 20, 0, 0, 0, DateTimeKind.Utc));

        rLocal.Kind.Should().Be(DateTimeKind.Utc);
        rLocal.Should().Be(new DateTime(2026, 10, 20, 0, 0, 0, DateTimeKind.Utc));

        rUtc.Kind.Should().Be(DateTimeKind.Utc);
        rUtc.Should().Be(new DateTime(2026, 10, 20, 0, 0, 0, DateTimeKind.Utc));
    }

    [Fact]
    public void DateTimeExtensions_ToEndOfDayExclusiveUtc_AlwaysProducesNextDayUtcKind()
    {
        var unspecified = new DateTime(2026, 10, 20, 0, 0, 0, DateTimeKind.Unspecified);

        var result = unspecified.ToEndOfDayExclusiveUtc();

        result.Kind.Should().Be(DateTimeKind.Utc);
        result.Should().Be(new DateTime(2026, 10, 21, 0, 0, 0, DateTimeKind.Utc));
    }

    [Fact]
    public void DateTimeExtensions_AsUtc_NormalizesAllKindsSafely()
    {
        var unspecified = new DateTime(2026, 10, 20, 10, 0, 0, DateTimeKind.Unspecified);
        var utc = new DateTime(2026, 10, 20, 10, 0, 0, DateTimeKind.Utc);

        unspecified.AsUtc().Kind.Should().Be(DateTimeKind.Utc);
        utc.AsUtc().Kind.Should().Be(DateTimeKind.Utc);
    }

    [Fact]
    public async Task GetInvoicesQueryHandler_WithUnspecifiedDate_ExecutesWithoutException()
    {
        var (context, uow, sieve) = TestDbHelper.CreateTestContext(_clinicContext);
        var invoiceRepo = TestDbHelper.CreateRepository<Invoice>(context, sieve);

        var inv = new Invoice
        {
            TenantId = _testTenantId,
            ClinicId = _testClinicId,
            InvoiceNumber = "INV-UTC-001",
            PatientName = "Test Patient",
            InvoiceDate = new DateTime(2026, 10, 20, 10, 0, 0, DateTimeKind.Utc),
            GrossAmount = 1000m,
            NetAmount = 1000m,
            BalanceDue = 0m,
            AmountPaid = 1000m,
            Status = InvoiceStatus.Paid
        };
        await invoiceRepo.AddAsync(inv);
        await uow.SaveChangesAsync();

        var handler = new GetInvoicesQueryHandler(invoiceRepo, _clinicContext);
        var query = new GetInvoicesQuery(Date: new DateTime(2026, 10, 20, 0, 0, 0, DateTimeKind.Unspecified));

        var result = await handler.Handle(query, CancellationToken.None);

        result.Should().NotBeNull();
    }

    [Fact]
    public async Task GetClinicAnalyticsQueryHandler_WithUnspecifiedDateRange_ExecutesWithoutException()
    {
        var (context, uow, sieve) = TestDbHelper.CreateTestContext(_clinicContext);
        var queueRepo = TestDbHelper.CreateRepository<QueueItem>(context, sieve);
        var invoiceRepo = TestDbHelper.CreateRepository<Invoice>(context, sieve);
        var paymentRepo = TestDbHelper.CreateRepository<PaymentRecord>(context, sieve);
        var consultRepo = TestDbHelper.CreateRepository<ConsultationEncounter>(context, sieve);
        var procRepo = TestDbHelper.CreateRepository<Procedure>(context, sieve);
        var labRepo = TestDbHelper.CreateRepository<LabOrder>(context, sieve);

        var handler = new GetClinicAnalyticsQueryHandler(
            queueRepo, invoiceRepo, paymentRepo, consultRepo, procRepo, labRepo, _clinicContext);

        var query = new GetClinicAnalyticsQuery(
            StartDate: new DateTime(2026, 10, 1, 0, 0, 0, DateTimeKind.Unspecified),
            EndDate: new DateTime(2026, 10, 20, 0, 0, 0, DateTimeKind.Unspecified));

        var result = await handler.Handle(query, CancellationToken.None);

        result.Should().NotBeNull();
        result.StartDate.Kind.Should().Be(DateTimeKind.Utc);
        result.EndDate.Kind.Should().Be(DateTimeKind.Utc);
    }

    [Fact]
    public async Task GetMorbidityReportQueryHandler_WithUnspecifiedDateRange_ExecutesWithoutException()
    {
        var (context, uow, sieve) = TestDbHelper.CreateTestContext(_clinicContext);
        var consultRepo = TestDbHelper.CreateRepository<ConsultationEncounter>(context, sieve);
        var patientRepo = TestDbHelper.CreateRepository<Patient>(context, sieve);

        var handler = new GetMorbidityReportQueryHandler(consultRepo, patientRepo, _clinicContext);

        var query = new GetMorbidityReportQuery(
            StartDate: new DateTime(2026, 10, 1, 0, 0, 0, DateTimeKind.Unspecified),
            EndDate: new DateTime(2026, 10, 20, 0, 0, 0, DateTimeKind.Unspecified));

        var result = await handler.Handle(query, CancellationToken.None);

        result.Should().NotBeNull();
        result.StartDate.Kind.Should().Be(DateTimeKind.Utc);
        result.EndDate.Kind.Should().Be(DateTimeKind.Utc);
    }

    [Fact]
    public async Task GetLabOrdersQueryHandler_WithUnspecifiedDate_ExecutesWithoutException()
    {
        var (context, uow, sieve) = TestDbHelper.CreateTestContext(_clinicContext);
        var orderRepo = TestDbHelper.CreateRepository<LabOrder>(context, sieve);
        var resultRepo = TestDbHelper.CreateRepository<LabResult>(context, sieve);

        var handler = new GetClinicLabOrdersQueryHandler(orderRepo, resultRepo, _clinicContext);

        var query = new GetClinicLabOrdersQuery(Date: new DateTime(2026, 10, 20, 0, 0, 0, DateTimeKind.Unspecified));

        var result = await handler.Handle(query, CancellationToken.None);

        result.Should().NotBeNull();
    }

    [Fact]
    public async Task GetProceduresQueryHandler_WithUnspecifiedDate_ExecutesWithoutException()
    {
        var (context, uow, sieve) = TestDbHelper.CreateTestContext(_clinicContext);
        var procRepo = TestDbHelper.CreateRepository<Procedure>(context, sieve);

        var handler = new GetProceduresQueryHandler(procRepo, _clinicContext);

        var query = new GetProceduresQuery(Date: new DateTime(2026, 10, 20, 0, 0, 0, DateTimeKind.Unspecified));

        var result = await handler.Handle(query, CancellationToken.None);

        result.Should().NotBeNull();
    }

    [Fact]
    public async Task GetTaxDiscountAuditReportQueryHandler_WithUnspecifiedDateRange_ExecutesWithoutException()
    {
        var (context, uow, sieve) = TestDbHelper.CreateTestContext(_clinicContext);
        var invoiceRepo = TestDbHelper.CreateRepository<Invoice>(context, sieve);

        var handler = new GetTaxDiscountAuditReportQueryHandler(invoiceRepo, _clinicContext);

        var query = new GetTaxDiscountAuditReportQuery(
            StartDate: new DateTime(2026, 10, 1, 0, 0, 0, DateTimeKind.Unspecified),
            EndDate: new DateTime(2026, 10, 20, 0, 0, 0, DateTimeKind.Unspecified));

        var result = await handler.Handle(query, CancellationToken.None);

        result.Should().NotBeNull();
        result.StartDate.Kind.Should().Be(DateTimeKind.Utc);
        result.EndDate.Kind.Should().Be(DateTimeKind.Utc);
    }

    [Fact]
    public async Task GetDoctorSharesReportQueryHandler_WithUnspecifiedDateRange_ExecutesWithoutException()
    {
        var (context, uow, sieve) = TestDbHelper.CreateTestContext(_clinicContext);
        var consultRepo = TestDbHelper.CreateRepository<ConsultationEncounter>(context, sieve);
        var invoiceRepo = TestDbHelper.CreateRepository<Invoice>(context, sieve);
        var procRepo = TestDbHelper.CreateRepository<Procedure>(context, sieve);

        var handler = new GetDoctorSharesReportQueryHandler(
            consultRepo, invoiceRepo, procRepo, _clinicContext);

        var query = new GetDoctorSharesReportQuery(
            StartDate: new DateTime(2026, 10, 1, 0, 0, 0, DateTimeKind.Unspecified),
            EndDate: new DateTime(2026, 10, 20, 0, 0, 0, DateTimeKind.Unspecified));

        var result = await handler.Handle(query, CancellationToken.None);

        result.Should().NotBeNull();
        result.StartDate.Kind.Should().Be(DateTimeKind.Utc);
        result.EndDate.Kind.Should().Be(DateTimeKind.Utc);
    }
}
