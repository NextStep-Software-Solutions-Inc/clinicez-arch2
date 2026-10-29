using System;
using System.Collections.Generic;
using System.Text;
using System.Threading;
using System.Threading.Tasks;
using ClinicEz.Clinic.Api.Controllers;
using ClinicEz.Clinic.Application.Common.Interfaces;
using ClinicEz.Clinic.Application.Features.Reports.DTOs;
using ClinicEz.Clinic.Application.Features.Reports.Queries;
using ClinicEz.Clinic.Domain.Entities;
using ClinicEz.Clinic.Domain.Interfaces;
using ClinicEz.Clinic.Infrastructure.Services;
using FluentAssertions;
using MediatR;
using Microsoft.AspNetCore.Mvc;
using NSubstitute;
using Xunit;

namespace ClinicEz.Clinic.Application.Tests;

public class ChallengerM2_M3_2_StressTests
{
    private readonly IClinicDocumentPdfService _pdfService = new ClinicDocumentPdfService();
    private readonly IClinicContext _clinicContext;
    private readonly Guid _testClinicId = Guid.NewGuid();
    private const string _testTenantId = "tenant-challenger-m2m3";

    public ChallengerM2_M3_2_StressTests()
    {
        _clinicContext = Substitute.For<IClinicContext>();
        _clinicContext.ClinicId.Returns(_testClinicId);
        _clinicContext.TenantId.Returns(_testTenantId);
    }

    private static (ISender sender, IRepository<FacilitySettings> settingsRepo) SetupMocksWithDefaults(DateTime? baseDate = null)
    {
        var refDate = baseDate ?? DateTime.UtcNow.Date;
        var sender = Substitute.For<ISender>();
        var clinicContext = Substitute.For<IClinicContext>();
        clinicContext.ClinicId.Returns(Guid.NewGuid());
        clinicContext.TenantId.Returns("tenant-stress");
        var (context, _, sieve) = TestDbHelper.CreateTestContext(clinicContext);
        var settingsRepo = TestDbHelper.CreateRepository<FacilitySettings>(context, sieve);

        var eodDto = new DailyEodReportDto(
            refDate, "tenant-stress", Guid.NewGuid(), 0, 0, 0, 0, 0,
            0m, 0m, 0m, 0m, 0m, 0m, 0m, 0m, 0m,
            new List<PaymentModeSummary>(), new List<DoctorWorkloadSummary>(), 0, 0, 0, 0);

        var morbidityDto = new MorbidityReportDto(
            refDate.AddDays(-30), refDate, "tenant-stress", Guid.NewGuid(), "St. Jude Clinic", 0, 0,
            new List<MorbidityDiseaseRowDto>());

        var taxDto = new TaxDiscountAuditReportDto(
            refDate.AddDays(-30), refDate, "tenant-stress", Guid.NewGuid(), 0, 0m, 0m, 0m, 0m, 0m,
            new List<TaxDiscountAuditRowDto>());

        var sharesDto = new DoctorSharesReportDto(
            refDate.AddDays(-30), refDate, "tenant-stress", Guid.NewGuid(), 0, 0m, 0m, 0m,
            new List<DoctorWorkloadDetailDto>());

        var analyticsDto = new ClinicAnalyticsDto(
            refDate.AddDays(-7), refDate, "tenant-stress", Guid.NewGuid(),
            new FlowAnalyticsDto(0, 0, 0, 0, 0, 0, 0, 0, 0, 0),
            0m, 0m, 0m, 0m, 0m, 0m, 0m,
            new List<DailyTrendPointDto>(), new List<TenderShareDto>(), new List<MorbidityItemDto>(),
            new List<ServiceUsageDto>(), new List<DoctorStatDto>());

        sender.Send(Arg.Any<GetDailyEodReportQuery>(), Arg.Any<CancellationToken>())
            .Returns(callInfo =>
            {
                var ct = callInfo.Arg<CancellationToken>();
                ct.ThrowIfCancellationRequested();
                var query = callInfo.Arg<GetDailyEodReportQuery>();
                var target = query.Date?.Date ?? DateTime.UtcNow.Date;
                return eodDto with { ReportDate = target };
            });

        sender.Send(Arg.Any<GetMorbidityReportQuery>(), Arg.Any<CancellationToken>())
            .Returns(callInfo =>
            {
                var ct = callInfo.Arg<CancellationToken>();
                ct.ThrowIfCancellationRequested();
                var query = callInfo.Arg<GetMorbidityReportQuery>();
                var end = query.EndDate?.Date ?? DateTime.UtcNow.Date;
                var start = query.StartDate?.Date ?? end.AddDays(-30);
                return morbidityDto with { StartDate = start, EndDate = end };
            });

        sender.Send(Arg.Any<GetTaxDiscountAuditReportQuery>(), Arg.Any<CancellationToken>())
            .Returns(callInfo =>
            {
                var ct = callInfo.Arg<CancellationToken>();
                ct.ThrowIfCancellationRequested();
                var query = callInfo.Arg<GetTaxDiscountAuditReportQuery>();
                var end = query.EndDate?.Date ?? DateTime.UtcNow.Date;
                var start = query.StartDate?.Date ?? end.AddDays(-30);
                return taxDto with { StartDate = start, EndDate = end };
            });

        sender.Send(Arg.Any<GetDoctorSharesReportQuery>(), Arg.Any<CancellationToken>())
            .Returns(callInfo =>
            {
                var ct = callInfo.Arg<CancellationToken>();
                ct.ThrowIfCancellationRequested();
                var query = callInfo.Arg<GetDoctorSharesReportQuery>();
                var end = query.EndDate?.Date ?? DateTime.UtcNow.Date;
                var start = query.StartDate?.Date ?? end.AddDays(-30);
                return sharesDto with { StartDate = start, EndDate = end };
            });

        sender.Send(Arg.Any<GetClinicAnalyticsQuery>(), Arg.Any<CancellationToken>())
            .Returns(callInfo =>
            {
                var ct = callInfo.Arg<CancellationToken>();
                ct.ThrowIfCancellationRequested();
                var query = callInfo.Arg<GetClinicAnalyticsQuery>();
                var end = query.EndDate?.Date ?? DateTime.UtcNow.Date;
                var start = query.StartDate?.Date ?? end.AddDays(-7);
                return analyticsDto with { StartDate = start, EndDate = end };
            });

        return (sender, settingsRepo);
    }

    [Fact]
    public async Task ReportsController_Pdf_Endpoints_Should_Propagate_Cancellation_When_Token_Is_Cancelled()
    {
        var (sender, settingsRepo) = SetupMocksWithDefaults();
        var controller = new ReportsController(sender, _pdfService, settingsRepo);

        using var cts = new CancellationTokenSource();
        cts.Cancel();
        var cancelledToken = cts.Token;

        // 1. Daily EOD PDF
        Func<Task> actEod = () => controller.GetDailyEodReportPdf(DateTime.UtcNow, cancelledToken);
        await actEod.Should().ThrowAsync<OperationCanceledException>();

        // 2. Morbidity PDF
        Func<Task> actMorbidity = () => controller.GetMorbidityReportPdf(DateTime.UtcNow.AddDays(-7), DateTime.UtcNow, cancelledToken);
        await actMorbidity.Should().ThrowAsync<OperationCanceledException>();

        // 3. Tax Discounts PDF
        Func<Task> actTax = () => controller.GetTaxDiscountAuditReportPdf(DateTime.UtcNow.AddDays(-7), DateTime.UtcNow, cancelledToken);
        await actTax.Should().ThrowAsync<OperationCanceledException>();

        // 4. Doctor Shares PDF
        Func<Task> actShares = () => controller.GetDoctorSharesReportPdf(DateTime.UtcNow.AddDays(-7), DateTime.UtcNow, cancelledToken);
        await actShares.Should().ThrowAsync<OperationCanceledException>();

        // 5. Analytics PDF
        Func<Task> actAnalytics = () => controller.GetClinicAnalyticsPdf(DateTime.UtcNow.AddDays(-7), DateTime.UtcNow, cancelledToken);
        await actAnalytics.Should().ThrowAsync<OperationCanceledException>();
    }

    [Fact]
    public async Task ReportsController_Json_Endpoints_Should_Propagate_Cancellation_When_Token_Is_Cancelled()
    {
        var (sender, settingsRepo) = SetupMocksWithDefaults();
        var controller = new ReportsController(sender, _pdfService, settingsRepo);

        using var cts = new CancellationTokenSource();
        cts.Cancel();
        var cancelledToken = cts.Token;

        Func<Task> act1 = () => controller.GetDailyEodReport(DateTime.UtcNow, cancelledToken);
        await act1.Should().ThrowAsync<OperationCanceledException>();

        Func<Task> act2 = () => controller.GetMorbidityReport(DateTime.UtcNow.AddDays(-7), DateTime.UtcNow, cancelledToken);
        await act2.Should().ThrowAsync<OperationCanceledException>();

        Func<Task> act3 = () => controller.GetTaxDiscountAuditReport(DateTime.UtcNow.AddDays(-7), DateTime.UtcNow, cancelledToken);
        await act3.Should().ThrowAsync<OperationCanceledException>();

        Func<Task> act4 = () => controller.GetDoctorSharesReport(DateTime.UtcNow.AddDays(-7), DateTime.UtcNow, cancelledToken);
        await act4.Should().ThrowAsync<OperationCanceledException>();

        Func<Task> act5 = () => controller.GetClinicAnalytics(DateTime.UtcNow.AddDays(-7), DateTime.UtcNow, cancelledToken);
        await act5.Should().ThrowAsync<OperationCanceledException>();
    }

    [Fact]
    public async Task ReportsController_Pdf_Endpoints_Should_Handle_Completely_Null_Date_Parameters()
    {
        var (sender, settingsRepo) = SetupMocksWithDefaults();
        var controller = new ReportsController(sender, _pdfService, settingsRepo);

        // 1. Daily EOD with date = null
        var eodResult = await controller.GetDailyEodReportPdf(null, CancellationToken.None) as FileContentResult;
        eodResult.Should().NotBeNull();
        eodResult!.ContentType.Should().Be("application/pdf");
        eodResult.FileDownloadName.Should().MatchRegex(@"^DailyEodReport-\d{8}\.pdf$");
        eodResult.FileContents.Should().NotBeEmpty();
        eodResult.FileContents.Length.Should().BeGreaterThan(500);
        Encoding.ASCII.GetString(eodResult.FileContents).Should().StartWith("%PDF-");
        Encoding.ASCII.GetString(eodResult.FileContents).Should().Contain("%%EOF");

        // 2. Morbidity with startDate = null, endDate = null
        var morbResult = await controller.GetMorbidityReportPdf(null, null, CancellationToken.None) as FileContentResult;
        morbResult.Should().NotBeNull();
        morbResult!.ContentType.Should().Be("application/pdf");
        morbResult.FileDownloadName.Should().MatchRegex(@"^MorbidityReport-\d{8}-\d{8}\.pdf$");
        morbResult.FileContents.Should().NotBeEmpty();
        morbResult.FileContents.Length.Should().BeGreaterThan(500);
        Encoding.ASCII.GetString(morbResult.FileContents).Should().StartWith("%PDF-");
        Encoding.ASCII.GetString(morbResult.FileContents).Should().Contain("%%EOF");

        // 3. Tax Discounts with startDate = null, endDate = null
        var taxResult = await controller.GetTaxDiscountAuditReportPdf(null, null, CancellationToken.None) as FileContentResult;
        taxResult.Should().NotBeNull();
        taxResult!.ContentType.Should().Be("application/pdf");
        taxResult.FileDownloadName.Should().MatchRegex(@"^TaxDiscountAuditReport-\d{8}-\d{8}\.pdf$");
        taxResult.FileContents.Should().NotBeEmpty();
        taxResult.FileContents.Length.Should().BeGreaterThan(500);
        Encoding.ASCII.GetString(taxResult.FileContents).Should().StartWith("%PDF-");
        Encoding.ASCII.GetString(taxResult.FileContents).Should().Contain("%%EOF");

        // 4. Doctor Shares with startDate = null, endDate = null
        var sharesResult = await controller.GetDoctorSharesReportPdf(null, null, CancellationToken.None) as FileContentResult;
        sharesResult.Should().NotBeNull();
        sharesResult!.ContentType.Should().Be("application/pdf");
        sharesResult.FileDownloadName.Should().MatchRegex(@"^DoctorSharesReport-\d{8}-\d{8}\.pdf$");
        sharesResult.FileContents.Should().NotBeEmpty();
        sharesResult.FileContents.Length.Should().BeGreaterThan(500);
        Encoding.ASCII.GetString(sharesResult.FileContents).Should().StartWith("%PDF-");
        Encoding.ASCII.GetString(sharesResult.FileContents).Should().Contain("%%EOF");

        // 5. Analytics with startDate = null, endDate = null
        var anlResult = await controller.GetClinicAnalyticsPdf(null, null, CancellationToken.None) as FileContentResult;
        anlResult.Should().NotBeNull();
        anlResult!.ContentType.Should().Be("application/pdf");
        anlResult.FileDownloadName.Should().MatchRegex(@"^ClinicAnalyticsReport-\d{8}-\d{8}\.pdf$");
        anlResult.FileContents.Should().NotBeEmpty();
        anlResult.FileContents.Length.Should().BeGreaterThan(500);
        Encoding.ASCII.GetString(anlResult.FileContents).Should().StartWith("%PDF-");
        Encoding.ASCII.GetString(anlResult.FileContents).Should().Contain("%%EOF");
    }

    [Fact]
    public async Task ReportsController_Pdf_Endpoints_Should_Handle_Partial_Null_Dates()
    {
        var (sender, settingsRepo) = SetupMocksWithDefaults();
        var controller = new ReportsController(sender, _pdfService, settingsRepo);
        var refDate = new DateTime(2026, 10, 15, 0, 0, 0, DateTimeKind.Utc);

        // A. StartDate provided, EndDate null
        var r1 = await controller.GetMorbidityReportPdf(refDate, null, CancellationToken.None) as FileContentResult;
        r1.Should().NotBeNull();
        r1!.FileDownloadName.Should().MatchRegex(@"^MorbidityReport-\d{8}-\d{8}\.pdf$");
        Encoding.ASCII.GetString(r1.FileContents).Should().StartWith("%PDF-");

        var r2 = await controller.GetTaxDiscountAuditReportPdf(refDate, null, CancellationToken.None) as FileContentResult;
        r2.Should().NotBeNull();
        r2!.FileDownloadName.Should().MatchRegex(@"^TaxDiscountAuditReport-\d{8}-\d{8}\.pdf$");
        Encoding.ASCII.GetString(r2.FileContents).Should().StartWith("%PDF-");

        var r3 = await controller.GetDoctorSharesReportPdf(refDate, null, CancellationToken.None) as FileContentResult;
        r3.Should().NotBeNull();
        r3!.FileDownloadName.Should().MatchRegex(@"^DoctorSharesReport-\d{8}-\d{8}\.pdf$");
        Encoding.ASCII.GetString(r3.FileContents).Should().StartWith("%PDF-");

        var r4 = await controller.GetClinicAnalyticsPdf(refDate, null, CancellationToken.None) as FileContentResult;
        r4.Should().NotBeNull();
        r4!.FileDownloadName.Should().MatchRegex(@"^ClinicAnalyticsReport-\d{8}-\d{8}\.pdf$");
        Encoding.ASCII.GetString(r4.FileContents).Should().StartWith("%PDF-");

        // B. StartDate null, EndDate provided
        var r5 = await controller.GetMorbidityReportPdf(null, refDate, CancellationToken.None) as FileContentResult;
        r5.Should().NotBeNull();
        r5!.FileDownloadName.Should().MatchRegex(@"^MorbidityReport-\d{8}-\d{8}\.pdf$");
        Encoding.ASCII.GetString(r5.FileContents).Should().StartWith("%PDF-");

        var r6 = await controller.GetTaxDiscountAuditReportPdf(null, refDate, CancellationToken.None) as FileContentResult;
        r6.Should().NotBeNull();
        r6!.FileDownloadName.Should().MatchRegex(@"^TaxDiscountAuditReport-\d{8}-\d{8}\.pdf$");
        Encoding.ASCII.GetString(r6.FileContents).Should().StartWith("%PDF-");

        var r7 = await controller.GetDoctorSharesReportPdf(null, refDate, CancellationToken.None) as FileContentResult;
        r7.Should().NotBeNull();
        r7!.FileDownloadName.Should().MatchRegex(@"^DoctorSharesReport-\d{8}-\d{8}\.pdf$");
        Encoding.ASCII.GetString(r7.FileContents).Should().StartWith("%PDF-");

        var r8 = await controller.GetClinicAnalyticsPdf(null, refDate, CancellationToken.None) as FileContentResult;
        r8.Should().NotBeNull();
        r8!.FileDownloadName.Should().MatchRegex(@"^ClinicAnalyticsReport-\d{8}-\d{8}\.pdf$");
        Encoding.ASCII.GetString(r8.FileContents).Should().StartWith("%PDF-");
    }

    [Fact]
    public async Task EndToEnd_ReportsController_With_Real_Handlers_And_Null_Dates()
    {
        // Set up real database context
        var (context, _, sieve) = TestDbHelper.CreateTestContext(_clinicContext);
        var settingsRepo = TestDbHelper.CreateRepository<FacilitySettings>(context, sieve);
        var queueRepo = TestDbHelper.CreateRepository<QueueItem>(context, sieve);
        var invoiceRepo = TestDbHelper.CreateRepository<Invoice>(context, sieve);
        var paymentRepo = TestDbHelper.CreateRepository<PaymentRecord>(context, sieve);
        var consultationRepo = TestDbHelper.CreateRepository<ConsultationEncounter>(context, sieve);
        var procedureRepo = TestDbHelper.CreateRepository<Procedure>(context, sieve);
        var labOrderRepo = TestDbHelper.CreateRepository<LabOrder>(context, sieve);
        var patientRepo = TestDbHelper.CreateRepository<Patient>(context, sieve);

        // Seed clinic settings with TIN
        var settings = new FacilitySettings
        {
            TenantId = _testTenantId,
            ClinicId = _testClinicId,
            ClinicName = "Apex Care Hospital",
            TaxIdentificationNumber = "123-456-789-000",
            DefaultDoctorSharePercentage = 0.70m,
            PaperSize = "Letter"
        };
        await settingsRepo.AddAsync(settings);

        // Instantiate real handlers
        var eodHandler = new GetDailyEodReportQueryHandler(
            queueRepo, invoiceRepo, paymentRepo, consultationRepo, procedureRepo, labOrderRepo, _clinicContext, settingsRepo);
        var morbidityHandler = new GetMorbidityReportQueryHandler(
            consultationRepo, patientRepo, _clinicContext, settingsRepo);
        var taxHandler = new GetTaxDiscountAuditReportQueryHandler(
            invoiceRepo, _clinicContext);
        var sharesHandler = new GetDoctorSharesReportQueryHandler(
            consultationRepo, invoiceRepo, procedureRepo, _clinicContext, settingsRepo);
        var analyticsHandler = new GetClinicAnalyticsQueryHandler(
            queueRepo, invoiceRepo, paymentRepo, consultationRepo, procedureRepo, labOrderRepo, _clinicContext);

        // Wire sender to dispatch to real handlers
        var sender = Substitute.For<ISender>();
        sender.Send(Arg.Any<GetDailyEodReportQuery>(), Arg.Any<CancellationToken>())
            .Returns(c => eodHandler.Handle(c.Arg<GetDailyEodReportQuery>(), c.Arg<CancellationToken>()));
        sender.Send(Arg.Any<GetMorbidityReportQuery>(), Arg.Any<CancellationToken>())
            .Returns(c => morbidityHandler.Handle(c.Arg<GetMorbidityReportQuery>(), c.Arg<CancellationToken>()));
        sender.Send(Arg.Any<GetTaxDiscountAuditReportQuery>(), Arg.Any<CancellationToken>())
            .Returns(c => taxHandler.Handle(c.Arg<GetTaxDiscountAuditReportQuery>(), c.Arg<CancellationToken>()));
        sender.Send(Arg.Any<GetDoctorSharesReportQuery>(), Arg.Any<CancellationToken>())
            .Returns(c => sharesHandler.Handle(c.Arg<GetDoctorSharesReportQuery>(), c.Arg<CancellationToken>()));
        sender.Send(Arg.Any<GetClinicAnalyticsQuery>(), Arg.Any<CancellationToken>())
            .Returns(c => analyticsHandler.Handle(c.Arg<GetClinicAnalyticsQuery>(), c.Arg<CancellationToken>()));

        var controller = new ReportsController(sender, _pdfService, settingsRepo);

        // 1. Real Daily EOD PDF with null date
        var eodResult = await controller.GetDailyEodReportPdf(null, CancellationToken.None) as FileContentResult;
        eodResult.Should().NotBeNull();
        eodResult!.ContentType.Should().Be("application/pdf");
        eodResult.FileContents.Length.Should().BeGreaterThan(1000);
        Encoding.ASCII.GetString(eodResult.FileContents).Should().StartWith("%PDF-");

        // 2. Real Morbidity PDF with null dates
        var morbResult = await controller.GetMorbidityReportPdf(null, null, CancellationToken.None) as FileContentResult;
        morbResult.Should().NotBeNull();
        morbResult!.ContentType.Should().Be("application/pdf");
        morbResult.FileContents.Length.Should().BeGreaterThan(1000);
        Encoding.ASCII.GetString(morbResult.FileContents).Should().StartWith("%PDF-");

        // 3. Real Tax Discounts PDF with null dates
        var taxResult = await controller.GetTaxDiscountAuditReportPdf(null, null, CancellationToken.None) as FileContentResult;
        taxResult.Should().NotBeNull();
        taxResult!.ContentType.Should().Be("application/pdf");
        taxResult.FileContents.Length.Should().BeGreaterThan(1000);
        Encoding.ASCII.GetString(taxResult.FileContents).Should().StartWith("%PDF-");

        // 4. Real Doctor Shares PDF with null dates
        var sharesResult = await controller.GetDoctorSharesReportPdf(null, null, CancellationToken.None) as FileContentResult;
        sharesResult.Should().NotBeNull();
        sharesResult!.ContentType.Should().Be("application/pdf");
        sharesResult.FileContents.Length.Should().BeGreaterThan(1000);
        Encoding.ASCII.GetString(sharesResult.FileContents).Should().StartWith("%PDF-");

        // 5. Real Analytics PDF with null dates
        var anlResult = await controller.GetClinicAnalyticsPdf(null, null, CancellationToken.None) as FileContentResult;
        anlResult.Should().NotBeNull();
        anlResult!.ContentType.Should().Be("application/pdf");
        anlResult.FileContents.Length.Should().BeGreaterThan(1000);
        Encoding.ASCII.GetString(anlResult.FileContents).Should().StartWith("%PDF-");
    }
}
