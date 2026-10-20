using System;
using System.Collections.Generic;
using System.Linq;
using System.Text;
using System.Threading;
using System.Threading.Tasks;
using ClinicEz.Clinic.Application.Common.Interfaces;
using ClinicEz.Clinic.Application.Features.Reports.DTOs;
using ClinicEz.Clinic.Application.Features.Reports.Queries;
using ClinicEz.Clinic.Domain.Entities;
using ClinicEz.Clinic.Domain.Enums;
using ClinicEz.Clinic.Domain.Interfaces;
using ClinicEz.Clinic.Infrastructure.Services;
using FluentAssertions;
using NSubstitute;
using Xunit;

namespace ClinicEz.Clinic.Application.Tests;

public class Tier5AdversarialHardeningTests
{
    private readonly IClinicContext _clinicContext;
    private readonly Guid _testClinicId = Guid.NewGuid();
    private const string _testTenantId = "tenant-tier5-adversarial";
    private readonly IClinicDocumentPdfService _pdfService = new ClinicDocumentPdfService();

    public Tier5AdversarialHardeningTests()
    {
        _clinicContext = Substitute.For<IClinicContext>();
        _clinicContext.ClinicId.Returns(_testClinicId);
        _clinicContext.TenantId.Returns(_testTenantId);
    }

    // =========================================================================
    // GROUP 1: CONCURRENCY STRESS HARNESS
    // =========================================================================

    [Fact]
    public async Task Concurrency_50ParallelEodPdfGenerations_SameClinicId_ShouldAllSucceedWithoutCorruption()
    {
        var settings = CreateDefaultSettings();
        var report = CreateSampleEodDto();

        var tasks = Enumerable.Range(0, 50).Select(_ => Task.Run(() =>
        {
            var pdfBytes = _pdfService.GenerateDailyEodReportPdf(report, settings, "DR-CONCURRENT-PRC");
            pdfBytes.Should().NotBeNull();
            pdfBytes.Length.Should().BeGreaterThan(1000);
            var header = Encoding.ASCII.GetString(pdfBytes.Take(5).ToArray());
            header.Should().Be("%PDF-");
        }));

        await Task.WhenAll(tasks);
    }

    [Fact]
    public async Task Concurrency_CrossReportTypes_MultipleDistinctClinics_ShouldExecuteSafely()
    {
        var tasks = Enumerable.Range(0, 25).Select(i => Task.Run(() =>
        {
            var clinicId = Guid.NewGuid();
            var tenantId = $"tenant-concurrent-{i}";
            var settings = new ClinicSettings
            {
                TenantId = tenantId,
                ClinicId = clinicId,
                ClinicName = $"Concurrent Medical Facility #{i}",
                TaxIdentificationNumber = $"TIN-{i:D3}-999-000",
                LetterheadHeader = $"CONCURRENT CLINIC {i}"
            };

            // 1. EOD
            var eodDto = CreateSampleEodDto(tenantId, clinicId);
            var eodPdf = _pdfService.GenerateDailyEodReportPdf(eodDto, settings);
            eodPdf.Should().NotBeNull();
            Encoding.ASCII.GetString(eodPdf.Take(5).ToArray()).Should().Be("%PDF-");

            // 2. Morbidity
            var morbDto = CreateSampleMorbidityDto(tenantId, clinicId);
            var morbPdf = _pdfService.GenerateMorbidityReportPdf(morbDto, settings);
            morbPdf.Should().NotBeNull();
            Encoding.ASCII.GetString(morbPdf.Take(5).ToArray()).Should().Be("%PDF-");

            // 3. Tax Discounts
            var taxDto = CreateSampleTaxDiscountDto(tenantId, clinicId);
            var taxPdf = _pdfService.GenerateTaxDiscountAuditReportPdf(taxDto, settings);
            taxPdf.Should().NotBeNull();
            Encoding.ASCII.GetString(taxPdf.Take(5).ToArray()).Should().Be("%PDF-");

            // 4. Doctor Shares
            var sharesDto = CreateSampleDoctorSharesDto(tenantId, clinicId);
            var sharesPdf = _pdfService.GenerateDoctorSharesReportPdf(sharesDto, settings);
            sharesPdf.Should().NotBeNull();
            Encoding.ASCII.GetString(sharesPdf.Take(5).ToArray()).Should().Be("%PDF-");

            // 5. Analytics
            var analyticsDto = CreateSampleAnalyticsDto(tenantId, clinicId);
            var analyticsPdf = _pdfService.GenerateClinicAnalyticsPdf(analyticsDto, settings);
            analyticsPdf.Should().NotBeNull();
            Encoding.ASCII.GetString(analyticsPdf.Take(5).ToArray()).Should().Be("%PDF-");
        }));

        await Task.WhenAll(tasks);
    }

    // =========================================================================
    // GROUP 2: DATABASE BOUNDARY CONDITIONS
    // =========================================================================

    [Fact]
    public async Task DatabaseBoundary_EmptyDatabase_All5Queries_ShouldReturnCleanZeroesAndEmptyLists()
    {
        var (context, _, sieve) = TestDbHelper.CreateTestContext(_clinicContext);
        var queueRepo = TestDbHelper.CreateRepository<QueueItem>(context, sieve);
        var invoiceRepo = TestDbHelper.CreateRepository<Invoice>(context, sieve);
        var paymentRepo = TestDbHelper.CreateRepository<PaymentRecord>(context, sieve);
        var consultRepo = TestDbHelper.CreateRepository<ConsultationEncounter>(context, sieve);
        var procRepo = TestDbHelper.CreateRepository<ClinicalProcedure>(context, sieve);
        var labRepo = TestDbHelper.CreateRepository<ClinicLabOrder>(context, sieve);
        var patientRepo = TestDbHelper.CreateRepository<ClinicPatient>(context, sieve);
        var settingsRepo = TestDbHelper.CreateRepository<ClinicSettings>(context, sieve);

        // 1. Daily EOD
        var eodHandler = new GetDailyEodReportQueryHandler(
            queueRepo, invoiceRepo, paymentRepo, consultRepo, procRepo, labRepo, _clinicContext, settingsRepo);
        var eodResult = await eodHandler.Handle(new GetDailyEodReportQuery(), CancellationToken.None);

        eodResult.TotalCheckedIn.Should().Be(0);
        eodResult.TotalWalkIns.Should().Be(0);
        eodResult.TotalAppointments.Should().Be(0);
        eodResult.TotalGrossAmount.Should().Be(0m);
        eodResult.TotalNetAmount.Should().Be(0m);
        eodResult.TotalAmountCollected.Should().Be(0m);
        eodResult.CashInDrawer.Should().Be(0m);
        eodResult.CollectionsByMethod.Should().BeEmpty();
        eodResult.DoctorWorkloads.Should().BeEmpty();

        // 2. Analytics
        var analyticsHandler = new GetClinicAnalyticsQueryHandler(
            queueRepo, invoiceRepo, paymentRepo, consultRepo, procRepo, labRepo, _clinicContext);
        var analyticsResult = await analyticsHandler.Handle(new GetClinicAnalyticsQuery(), CancellationToken.None);

        analyticsResult.TotalGrossRevenue.Should().Be(0m);
        analyticsResult.TotalNetRevenue.Should().Be(0m);
        analyticsResult.TotalCollections.Should().Be(0m);
        analyticsResult.AverageTicketSize.Should().Be(0m);
        analyticsResult.Flow.AverageWaitMinutes.Should().Be(0.0);
        analyticsResult.Flow.AverageConsultMinutes.Should().Be(0.0);
        analyticsResult.RevenueTrend.Should().NotBeNull();
        analyticsResult.TenderShares.Should().BeEmpty();
        analyticsResult.TopDiagnoses.Should().BeEmpty();
        analyticsResult.TopServices.Should().BeEmpty();
        analyticsResult.DoctorStats.Should().BeEmpty();

        // 3. Morbidity
        var morbHandler = new GetMorbidityReportQueryHandler(consultRepo, patientRepo, _clinicContext, settingsRepo);
        var morbResult = await morbHandler.Handle(new GetMorbidityReportQuery(), CancellationToken.None);

        morbResult.TotalEncountersReviewed.Should().Be(0);
        morbResult.TotalDiagnosesRecorded.Should().Be(0);
        morbResult.Diseases.Should().BeEmpty();

        // 4. Tax Discounts
        var taxHandler = new GetTaxDiscountAuditReportQueryHandler(invoiceRepo, _clinicContext);
        var taxResult = await taxHandler.Handle(new GetTaxDiscountAuditReportQuery(), CancellationToken.None);

        taxResult.TotalInvoicesAudited.Should().Be(0);
        taxResult.TotalGrossSales.Should().Be(0m);
        taxResult.TotalSeniorDiscounts.Should().Be(0m);
        taxResult.TotalPwdDiscounts.Should().Be(0m);
        taxResult.TotalNetCollections.Should().Be(0m);
        taxResult.Items.Should().BeEmpty();

        // 5. Doctor Shares
        var sharesHandler = new GetDoctorSharesReportQueryHandler(
            consultRepo, invoiceRepo, procRepo, _clinicContext, settingsRepo);
        var sharesResult = await sharesHandler.Handle(new GetDoctorSharesReportQuery(), CancellationToken.None);

        sharesResult.TotalClinicEncounters.Should().Be(0);
        sharesResult.TotalClinicGrossRevenue.Should().Be(0m);
        sharesResult.TotalPhysicianShares.Should().Be(0m);
        sharesResult.TotalFacilityShares.Should().Be(0m);
        sharesResult.DoctorShares.Should().BeEmpty();
    }

    [Fact]
    public void DatabaseBoundary_NewlyRegisteredClinic_NullSettings_PdfsShouldGenerateWithoutCrashing()
    {
        // Newly registered clinic with bare minimal or null settings
        var settings = new ClinicSettings
        {
            TenantId = _testTenantId,
            ClinicId = _testClinicId,
            ClinicName = "Newly Registered Clinic",
            LetterheadHeader = null,
            LetterheadSubHeader = null,
            LetterheadAddress = null,
            LetterheadContact = null,
            LetterheadFooter = null,
            TaxIdentificationNumber = null,
            AccreditationNumber = null,
            PrimaryColorHex = "",
            PaperSize = "",
            DefaultDoctorSharePercentage = 0.70m
        };

        var eodPdf = _pdfService.GenerateDailyEodReportPdf(CreateSampleEodDto(), settings);
        eodPdf.Should().NotBeNull();
        eodPdf.Length.Should().BeGreaterThan(1000);

        var morbPdf = _pdfService.GenerateMorbidityReportPdf(CreateSampleMorbidityDto(), settings);
        morbPdf.Should().NotBeNull();
        morbPdf.Length.Should().BeGreaterThan(1000);

        var taxPdf = _pdfService.GenerateTaxDiscountAuditReportPdf(CreateSampleTaxDiscountDto(), settings);
        taxPdf.Should().NotBeNull();
        taxPdf.Length.Should().BeGreaterThan(1000);

        var sharesPdf = _pdfService.GenerateDoctorSharesReportPdf(CreateSampleDoctorSharesDto(), settings);
        sharesPdf.Should().NotBeNull();
        sharesPdf.Length.Should().BeGreaterThan(1000);

        var analyticsPdf = _pdfService.GenerateClinicAnalyticsPdf(CreateSampleAnalyticsDto(), settings);
        analyticsPdf.Should().NotBeNull();
        analyticsPdf.Length.Should().BeGreaterThan(1000);
    }

    [Fact]
    public async Task DatabaseBoundary_MidnightBoundaryConditions_00_00_00_And_23_59_59_999()
    {
        var (context, uow, sieve) = TestDbHelper.CreateTestContext(_clinicContext);
        var queueRepo = TestDbHelper.CreateRepository<QueueItem>(context, sieve);
        var invoiceRepo = TestDbHelper.CreateRepository<Invoice>(context, sieve);
        var paymentRepo = TestDbHelper.CreateRepository<PaymentRecord>(context, sieve);
        var consultRepo = TestDbHelper.CreateRepository<ConsultationEncounter>(context, sieve);
        var procRepo = TestDbHelper.CreateRepository<ClinicalProcedure>(context, sieve);
        var labRepo = TestDbHelper.CreateRepository<ClinicLabOrder>(context, sieve);

        var targetDate = new DateTime(2026, 10, 20, 0, 0, 0, DateTimeKind.Utc);
        var exactMidnightStart = targetDate;
        var endOfDay = targetDate.AddDays(1).AddMilliseconds(-1); // 2026-10-20 23:59:59.999
        var nextDayMidnight = targetDate.AddDays(1); // 2026-10-21 00:00:00.000

        // 1. Transaction at exact midnight start (00:00:00.000) -> MUST be included
        var invMidnight = new Invoice
        {
            TenantId = _testTenantId,
            ClinicId = _testClinicId,
            InvoiceNumber = "INV-MIDNIGHT-001",
            InvoiceDate = exactMidnightStart,
            PatientId = Guid.NewGuid(),
            PatientName = "Midnight Patient",
            GrossAmount = 1000m,
            NetAmount = 1000m,
            BalanceDue = 0m,
            Status = InvoiceStatus.Paid
        };
        await invoiceRepo.AddAsync(invMidnight);

        // 2. Transaction at 23:59:59.999 -> MUST be included
        var invEndOfDay = new Invoice
        {
            TenantId = _testTenantId,
            ClinicId = _testClinicId,
            InvoiceNumber = "INV-ENDOFDAY-002",
            InvoiceDate = endOfDay,
            PatientId = Guid.NewGuid(),
            PatientName = "End of Day Patient",
            GrossAmount = 2000m,
            NetAmount = 2000m,
            BalanceDue = 0m,
            Status = InvoiceStatus.Paid
        };
        await invoiceRepo.AddAsync(invEndOfDay);

        // 3. Transaction at next day midnight (2026-10-21 00:00:00.000) -> MUST be excluded from today
        var invNextDay = new Invoice
        {
            TenantId = _testTenantId,
            ClinicId = _testClinicId,
            InvoiceNumber = "INV-NEXTDAY-003",
            InvoiceDate = nextDayMidnight,
            PatientId = Guid.NewGuid(),
            PatientName = "Next Day Patient",
            GrossAmount = 5000m,
            NetAmount = 5000m,
            BalanceDue = 0m,
            Status = InvoiceStatus.Paid
        };
        await invoiceRepo.AddAsync(invNextDay);
        await uow.SaveChangesAsync();

        var handler = new GetDailyEodReportQueryHandler(
            queueRepo, invoiceRepo, paymentRepo, consultRepo, procRepo, labRepo, _clinicContext);

        var result = await handler.Handle(new GetDailyEodReportQuery(targetDate), CancellationToken.None);

        // Sum must be invMidnight (1000) + invEndOfDay (2000) = 3000m, strictly excluding invNextDay (5000m)
        result.TotalGrossAmount.Should().Be(3000m);
        result.TotalNetAmount.Should().Be(3000m);
    }

    [Fact]
    public async Task DatabaseBoundary_InvertedDateRange_StartDateAfterEndDate_ShouldReturnCleanEmptyDataset()
    {
        var (context, _, sieve) = TestDbHelper.CreateTestContext(_clinicContext);
        var consultRepo = TestDbHelper.CreateRepository<ConsultationEncounter>(context, sieve);
        var invoiceRepo = TestDbHelper.CreateRepository<Invoice>(context, sieve);
        var procRepo = TestDbHelper.CreateRepository<ClinicalProcedure>(context, sieve);

        var handler = new GetDoctorSharesReportQueryHandler(
            consultRepo, invoiceRepo, procRepo, _clinicContext);

        // Inverted dates: Start = Oct 25, End = Oct 20
        var query = new GetDoctorSharesReportQuery(
            StartDate: new DateTime(2026, 10, 25),
            EndDate: new DateTime(2026, 10, 20)
        );

        var result = await handler.Handle(query, CancellationToken.None);

        result.TotalClinicEncounters.Should().Be(0);
        result.TotalClinicGrossRevenue.Should().Be(0m);
        result.DoctorShares.Should().BeEmpty();
    }

    // =========================================================================
    // GROUP 3: NUMERICAL BOUNDARIES & CENTAVO CONSERVATION
    // =========================================================================

    [Fact]
    public void NumericalBoundary_CentavoExactConservation_DoctorShares_ShouldConserveCentavosAcrossPhysicianAndFacility()
    {
        // ₱333.33 gross with 70% physician share:
        // 333.33 * 0.70 = 233.331 -> rounded to 233.33
        // Facility share must be exactly 333.33 - 233.33 = 100.00
        decimal gross = 333.33m;
        decimal doctorPct = 0.70m;
        decimal docShare = Math.Round(gross * doctorPct, 2);
        decimal facShare = gross - docShare;

        (docShare + facShare).Should().Be(gross, "Doctor share and facility share must sum exactly to gross with zero centavo leakage");
        docShare.Should().Be(233.33m);
        facShare.Should().Be(100.00m);

        var detail = new DoctorWorkloadDetailDto(
            Guid.NewGuid().ToString(),
            "Dr. Centavo Auditor",
            1,
            0,
            gross,
            0m,
            gross,
            docShare,
            facShare
        );

        var report = new DoctorSharesReportDto(
            DateTime.UtcNow.AddDays(-7),
            DateTime.UtcNow,
            _testTenantId,
            _testClinicId,
            1,
            gross,
            docShare,
            facShare,
            new List<DoctorWorkloadDetailDto> { detail }
        );

        var pdfBytes = _pdfService.GenerateDoctorSharesReportPdf(report, CreateDefaultSettings());
        pdfBytes.Should().NotBeNull();
        pdfBytes.Length.Should().BeGreaterThan(1000);
    }

    [Fact]
    public void NumericalBoundary_ExtremeValues_BillionPesoAmounts_ShouldFormatAndRenderWithoutLayoutException()
    {
        var settings = CreateDefaultSettings();

        // ₱999,999,999.99 extreme amounts
        var billion = 999_999_999.99m;
        var eodDto = new DailyEodReportDto(
            DateTime.UtcNow,
            _testTenantId,
            _testClinicId,
            99999,
            50000,
            49999,
            99999,
            0,
            billion,
            billion * 0.20m,
            billion * 0.10m,
            billion * 0.10m,
            0m,
            billion * 0.80m,
            billion * 0.80m,
            billion * 0.50m,
            0m,
            new List<PaymentModeSummary>
            {
                new("Cash", billion * 0.50m, 50000),
                new("BankTransfer", billion * 0.30m, 49999)
            },
            new List<DoctorWorkloadSummary>
            {
                new("Dr. Billionaire Healthcare Specialist", 99999)
            },
            10000,
            5000,
            20000,
            100
        );

        var eodPdf = _pdfService.GenerateDailyEodReportPdf(eodDto, settings);
        eodPdf.Should().NotBeNull();
        eodPdf.Length.Should().BeGreaterThan(1000);

        var taxDto = new TaxDiscountAuditReportDto(
            DateTime.UtcNow.AddDays(-30),
            DateTime.UtcNow,
            _testTenantId,
            _testClinicId,
            1,
            billion,
            billion * 0.20m,
            0m,
            billion * 0.12m,
            billion * 0.80m,
            new List<TaxDiscountAuditRowDto>
            {
                new(
                    "INV-BILLION-001",
                    DateTime.UtcNow,
                    "High Net Worth Individual",
                    "Senior Citizen (RA 9994)",
                    "OSCA-9999999999",
                    billion,
                    billion * 0.20m,
                    billion,
                    billion * 0.12m,
                    billion * 0.80m,
                    billion * 0.80m,
                    "OR-BILLION-001",
                    "Cash"
                )
            }
        );

        var taxPdf = _pdfService.GenerateTaxDiscountAuditReportPdf(taxDto, settings);
        taxPdf.Should().NotBeNull();
        taxPdf.Length.Should().BeGreaterThan(1000);
    }

    [Fact]
    public void NumericalBoundary_NegativeValues_DiscountsExceedGross_ShouldRenderSafely()
    {
        var settings = CreateDefaultSettings();

        // Discounts > Gross (e.g. promotional credit / retroactive adjustment)
        decimal gross = 500m;
        decimal discount = 750m;
        decimal net = gross - discount; // -250m

        var taxDto = new TaxDiscountAuditReportDto(
            DateTime.UtcNow.AddDays(-7),
            DateTime.UtcNow,
            _testTenantId,
            _testClinicId,
            1,
            gross,
            discount,
            0m,
            Math.Round(gross * 0.12m, 2),
            net,
            new List<TaxDiscountAuditRowDto>
            {
                new(
                    "INV-NEG-001",
                    DateTime.UtcNow,
                    "Adjustment Patient",
                    "Senior Citizen (RA 9994)",
                    "OSCA-12345",
                    gross,
                    discount,
                    gross,
                    Math.Round(gross * 0.12m, 2),
                    net,
                    net,
                    "OR-ADJUST-001",
                    "Cash"
                )
            }
        );

        var pdfBytes = _pdfService.GenerateTaxDiscountAuditReportPdf(taxDto, settings);
        pdfBytes.Should().NotBeNull();
        pdfBytes.Length.Should().BeGreaterThan(1000);
    }

    // =========================================================================
    // GROUP 4: NULL SAFETY, UNMAPPED STRINGS & SPECIAL UNICODE
    // =========================================================================

    [Fact]
    public void NullSafety_NullCollectionsInAllDtos_PdfGeneratorsShouldNotThrowNullReferenceException()
    {
        var settings = CreateDefaultSettings();

        // 1. Daily EOD with null collections
        var eodDto = new DailyEodReportDto(
            DateTime.UtcNow, _testTenantId, _testClinicId,
            0, 0, 0, 0, 0, 0m, 0m, 0m, 0m, 0m, 0m, 0m, 0m, 0m,
            null!, // CollectionsByMethod is null!
            null!, // DoctorWorkloads is null!
            0, 0, 0, 0
        );
        var actEod = () => _pdfService.GenerateDailyEodReportPdf(eodDto, settings);
        actEod.Should().NotThrow<NullReferenceException>();

        // 2. Morbidity with null list
        var morbDto = new MorbidityReportDto(
            DateTime.UtcNow.AddDays(-7), DateTime.UtcNow, _testTenantId, _testClinicId,
            "Clinic Name", 0, 0,
            null! // Diseases is null!
        );
        var actMorb = () => _pdfService.GenerateMorbidityReportPdf(morbDto, settings);
        actMorb.Should().NotThrow<NullReferenceException>();

        // 3. Tax Discount with null list
        var taxDto = new TaxDiscountAuditReportDto(
            DateTime.UtcNow.AddDays(-7), DateTime.UtcNow, _testTenantId, _testClinicId,
            0, 0m, 0m, 0m, 0m, 0m,
            null! // Items is null!
        );
        var actTax = () => _pdfService.GenerateTaxDiscountAuditReportPdf(taxDto, settings);
        actTax.Should().NotThrow<NullReferenceException>();

        // 4. Doctor Shares with null list
        var sharesDto = new DoctorSharesReportDto(
            DateTime.UtcNow.AddDays(-7), DateTime.UtcNow, _testTenantId, _testClinicId,
            0, 0m, 0m, 0m,
            null! // DoctorShares is null!
        );
        var actShares = () => _pdfService.GenerateDoctorSharesReportPdf(sharesDto, settings);
        actShares.Should().NotThrow<NullReferenceException>();

        // 5. Analytics with null lists and null Flow
        var analyticsDto = new ClinicAnalyticsDto(
            DateTime.UtcNow.AddDays(-7), DateTime.UtcNow, _testTenantId, _testClinicId,
            null!, // Flow is null!
            0m, 0m, 0m, 0m, 0m, 0m, 0m,
            null!, // RevenueTrend is null!
            null!, // TenderShares is null!
            null!, // TopDiagnoses is null!
            null!, // TopServices is null!
            null!  // DoctorStats is null!
        );
        var actAnalytics = () => _pdfService.GenerateClinicAnalyticsPdf(analyticsDto, settings);
        actAnalytics.Should().NotThrow<NullReferenceException>();
    }

    [Fact]
    public void SpecialUnicode_DoctorAndClinicNames_CJK_Cyrillic_Emoji_Arabic_Symbols_ShouldRenderWithoutCrash()
    {
        var settings = new ClinicSettings
        {
            TenantId = _testTenantId,
            ClinicId = _testClinicId,
            ClinicName = "🏥 St. Jude's Family Medical & Diagnostic Center (聖ユダクリニック) — 100% Care™ <script> & \"quotes\" / \\",
            LetterheadHeader = "🏥 ST. JUDE MEDICAL CENTER (医療法人 聖母医院) 👨‍⚕️",
            LetterheadSubHeader = "Accredited Outpatient & PhilHealth Provider • مركز سانت جود الطبي",
            LetterheadAddress = "124 Rizal Ave, Brgy. San José, City of Manila 1000, Philippines",
            LetterheadContact = "Tel: (02) 8876-5432 • +63 917 123 4567 • info@stjude.med.ph",
            LetterheadFooter = "Official Document. RA 8792 / RA 10173 Compliant. Validated with SHA-256.",
            TaxIdentificationNumber = "TIN-123-456-789-000",
            PrimaryColorHex = "#0D6963",
            PaperSize = "A4"
        };

        var preparedByUnicode = "Dr. José María Peña-Ñuñez, MD (доктор медицинских наук) 👨‍⚕️ دكتور أحمد";

        var eodDto = new DailyEodReportDto(
            DateTime.UtcNow,
            _testTenantId,
            _testClinicId,
            10,
            6,
            4,
            10,
            0,
            15000m,
            3000m,
            2000m,
            1000m,
            0m,
            12000m,
            12000m,
            5000m,
            0m,
            new List<PaymentModeSummary>
            {
                new("Cash (Philippine Peso ₱)", 5000m, 4),
                new("GCash / E-Wallet 📱", 7000m, 6)
            },
            new List<DoctorWorkloadSummary>
            {
                new("Dr. José María Peña-Ñuñez 👨‍⚕️", 6),
                new("Dr. 鈴木 一郎 (Dr. Suzuki) 🇯🇵", 4)
            },
            2,
            3,
            8,
            1
        );

        var pdfBytes = _pdfService.GenerateDailyEodReportPdf(eodDto, settings, preparedByUnicode);
        pdfBytes.Should().NotBeNull();
        pdfBytes.Length.Should().BeGreaterThan(1000);
        Encoding.ASCII.GetString(pdfBytes.Take(5).ToArray()).Should().Be("%PDF-");
    }

    [Fact]
    public async Task UnmappedIcd10Strings_MorbidityAndAnalytics_ShouldAggregateWithoutThrowing()
    {
        var (context, uow, sieve) = TestDbHelper.CreateTestContext(_clinicContext);
        var consultRepo = TestDbHelper.CreateRepository<ConsultationEncounter>(context, sieve);
        var patientRepo = TestDbHelper.CreateRepository<ClinicPatient>(context, sieve);
        var queueRepo = TestDbHelper.CreateRepository<QueueItem>(context, sieve);
        var invoiceRepo = TestDbHelper.CreateRepository<Invoice>(context, sieve);
        var paymentRepo = TestDbHelper.CreateRepository<PaymentRecord>(context, sieve);
        var procRepo = TestDbHelper.CreateRepository<ClinicalProcedure>(context, sieve);
        var labRepo = TestDbHelper.CreateRepository<ClinicLabOrder>(context, sieve);

        var patient = new ClinicPatient
        {
            TenantId = _testTenantId,
            ClinicId = _testClinicId,
            PatientCode = "PAT-UNICODE-001",
            FirstName = "Juan",
            LastName = "Dela Cruz",
            DateOfBirth = new DateOnly(1985, 3, 15),
            Gender = "Male",
            ContactNumber = "+639170000001"
        };
        await patientRepo.AddAsync(patient);

        var today = DateTime.UtcNow.Date.AddHours(10);
        var encounter = new ConsultationEncounter
        {
            TenantId = _testTenantId,
            ClinicId = _testClinicId,
            PatientId = patient.Id,
            PatientName = "Juan Dela Cruz",
            DoctorId = Guid.NewGuid(),
            DoctorName = "Dr. Allan Ramos",
            EncounterDate = today,
            Diagnoses = new List<EncounterDiagnosis>
            {
                // Standard ICD-10
                new() { Icd10Code = "J06.9", Description = "Acute Upper Respiratory Infection", IsPrimary = true },
                // Unmapped alphanumeric custom code
                new() { Icd10Code = "UNMAPPED-9999", Description = "Custom Clinic Clinical Finding (Unmapped)", IsPrimary = false },
                // Non-standard symbols and lowercase
                new() { Icd10Code = "covid-19*", Description = "Suspected Viral Infection & Fatigue", IsPrimary = false }
            }
        };
        await consultRepo.AddAsync(encounter);
        await uow.SaveChangesAsync();

        // 1. Morbidity Handler
        var morbHandler = new GetMorbidityReportQueryHandler(consultRepo, patientRepo, _clinicContext);
        var morbResult = await morbHandler.Handle(new GetMorbidityReportQuery(), CancellationToken.None);

        morbResult.TotalEncountersReviewed.Should().Be(1);
        morbResult.TotalDiagnosesRecorded.Should().Be(3);
        morbResult.Diseases.Should().HaveCount(3);
        morbResult.Diseases.Select(d => d.Icd10Code).Should().Contain(new[] { "J06.9", "UNMAPPED-9999", "covid-19*" });

        // Generate Morbidity PDF with unmapped codes
        var morbPdf = _pdfService.GenerateMorbidityReportPdf(morbResult, CreateDefaultSettings());
        morbPdf.Should().NotBeNull();
        morbPdf.Length.Should().BeGreaterThan(1000);

        // 2. Analytics Handler
        var analyticsHandler = new GetClinicAnalyticsQueryHandler(
            queueRepo, invoiceRepo, paymentRepo, consultRepo, procRepo, labRepo, _clinicContext);
        var analyticsResult = await analyticsHandler.Handle(new GetClinicAnalyticsQuery(), CancellationToken.None);

        analyticsResult.TopDiagnoses.Should().HaveCount(3);
    }

    [Fact]
    public async Task MissingOrUnregisteredPatientInConsultation_Morbidity_ShouldNotCrashAndTallyCleanly()
    {
        var (context, uow, sieve) = TestDbHelper.CreateTestContext(_clinicContext);
        var consultRepo = TestDbHelper.CreateRepository<ConsultationEncounter>(context, sieve);
        var patientRepo = TestDbHelper.CreateRepository<ClinicPatient>(context, sieve);

        // Encounter pointing to an unregistered/unknown patient ID
        var encounter = new ConsultationEncounter
        {
            TenantId = _testTenantId,
            ClinicId = _testClinicId,
            PatientId = Guid.NewGuid(), // Not in patientRepo
            PatientName = "Ghost Patient",
            DoctorId = Guid.NewGuid(),
            DoctorName = "Dr. Ghost Attendant",
            EncounterDate = DateTime.UtcNow.Date.AddHours(14),
            Diagnoses = new List<EncounterDiagnosis>
            {
                new() { Icd10Code = "I10", Description = "Essential Hypertension", IsPrimary = true }
            }
        };
        await consultRepo.AddAsync(encounter);
        await uow.SaveChangesAsync();

        var handler = new GetMorbidityReportQueryHandler(consultRepo, patientRepo, _clinicContext);
        var result = await handler.Handle(new GetMorbidityReportQuery(), CancellationToken.None);

        result.TotalEncountersReviewed.Should().Be(1);
        result.TotalDiagnosesRecorded.Should().Be(1);
        result.Diseases.Should().HaveCount(1);
        result.Diseases[0].Icd10Code.Should().Be("I10");
        result.Diseases[0].TotalCases.Should().Be(1);
        // When patient is not found, cohorts remain 0 without crashing
        result.Diseases[0].PediatricCases.Should().Be(0);
        result.Diseases[0].AdultCases.Should().Be(0);
        result.Diseases[0].SeniorCases.Should().Be(0);
    }

    [Fact]
    public async Task DoctorShares_InvoiceLineItemsWithMixedCategories_ShouldSumConsultAndProcAccurately()
    {
        var (context, uow, sieve) = TestDbHelper.CreateTestContext(_clinicContext);
        var consultRepo = TestDbHelper.CreateRepository<ConsultationEncounter>(context, sieve);
        var invoiceRepo = TestDbHelper.CreateRepository<Invoice>(context, sieve);
        var procRepo = TestDbHelper.CreateRepository<ClinicalProcedure>(context, sieve);
        var settingsRepo = TestDbHelper.CreateRepository<ClinicSettings>(context, sieve);

        var doctorId = Guid.NewGuid();
        var doctorName = "Dr. Specialist Surgeon";

        // Seed consultation
        var enc = new ConsultationEncounter
        {
            TenantId = _testTenantId,
            ClinicId = _testClinicId,
            PatientId = Guid.NewGuid(),
            PatientName = "Surgery Patient",
            DoctorId = doctorId,
            DoctorName = doctorName,
            EncounterDate = DateTime.UtcNow.Date.AddHours(11)
        };
        await consultRepo.AddAsync(enc);

        // Seed invoice with Consultation, Procedure, and other categories (Pharmacy, Lab, Radiology)
        var invoice = new Invoice
        {
            TenantId = _testTenantId,
            ClinicId = _testClinicId,
            InvoiceNumber = "INV-MIXED-001",
            InvoiceDate = DateTime.UtcNow.Date.AddHours(12),
            PatientId = enc.PatientId,
            PatientName = enc.PatientName,
            AttendingDoctorId = doctorId,
            AttendingDoctorName = doctorName,
            GrossAmount = 8500m,
            NetAmount = 8500m,
            BalanceDue = 0m,
            Status = InvoiceStatus.Paid,
            LineItems = new List<InvoiceLineItem>
            {
                new() { Description = "Specialist Consultation", Category = "General Consultation", TotalPrice = 1500m },
                new() { Description = "Minor Surgical Excision", Category = "Clinical Procedure", TotalPrice = 4000m },
                new() { Description = "Post-op Antibiotics", Category = "Pharmacy Drugs", TotalPrice = 2000m },
                new() { Description = "Biopsy Pathology Order", Category = "Laboratory Diagnostic", TotalPrice = 1000m }
            }
        };
        await invoiceRepo.AddAsync(invoice);

        // Seed procedure
        var proc = new ClinicalProcedure
        {
            TenantId = _testTenantId,
            ClinicId = _testClinicId,
            PatientId = enc.PatientId,
            PatientName = enc.PatientName,
            Category = "MinorSurgery",
            ProcedureName = "Minor Surgical Excision",
            OrderedByDoctorName = doctorName,
            ScheduledAt = DateTime.UtcNow.Date.AddHours(11),
            Status = ProcedureStatus.Completed
        };
        await procRepo.AddAsync(proc);
        await uow.SaveChangesAsync();

        var handler = new GetDoctorSharesReportQueryHandler(
            consultRepo, invoiceRepo, procRepo, _clinicContext, settingsRepo);

        var result = await handler.Handle(new GetDoctorSharesReportQuery(), CancellationToken.None);

        result.TotalClinicEncounters.Should().Be(1);
        result.DoctorShares.Should().HaveCount(1);

        var docShare = result.DoctorShares[0];
        docShare.DoctorName.Should().Be(doctorName);
        docShare.TotalConsultationGross.Should().Be(1500m, "Must filter strictly to line items containing 'Consultation'");
        docShare.TotalProcedureGross.Should().Be(4000m, "Must filter strictly to line items containing 'Procedure'");
        docShare.TotalGrossGenerated.Should().Be(5500m, "Total gross generated for doctor fees is Consult + Procedure (excluding Pharmacy/Lab)");
        docShare.EstimatedPhysicianShare.Should().Be(3850m, "5500 * 0.70 = 3850");
        docShare.ClinicFacilityShare.Should().Be(1650m, "5500 - 3850 = 1650");
    }

    [Fact]
    public void MultiPageScaling_200DiseaseRows_ShouldGenerateMultiPageDocumentCleanly()
    {
        var settings = CreateDefaultSettings();
        var rows = Enumerable.Range(1, 200).Select(i => new MorbidityDiseaseRowDto(
            i,
            $"ICD-{i:D3}",
            $"Systemic Epidemiological Surveillance Indicator #{i} - Pathological manifestation study",
            100 + i,
            20 + (i % 10),
            50 + (i % 20),
            30 + (i % 15),
            50 + (i % 25),
            50 + (i % 25),
            0.5
        )).ToList();

        var report = new MorbidityReportDto(
            DateTime.UtcNow.AddDays(-90),
            DateTime.UtcNow,
            _testTenantId,
            _testClinicId,
            "Mega Metropolitan Health Center",
            5000,
            12000,
            rows
        );

        var pdfBytes = _pdfService.GenerateMorbidityReportPdf(report, settings);
        pdfBytes.Should().NotBeNull();
        pdfBytes.Length.Should().BeGreaterThan(15000, "200 rows must generate a multi-page document (>15KB)");
        Encoding.ASCII.GetString(pdfBytes.Take(5).ToArray()).Should().Be("%PDF-");
    }

    [Fact]
    public void ExtremelyLongUnbrokenStrings_ShouldBeHandledByPdfGenerators()
    {
        var settings = CreateDefaultSettings();

        // 120-character unbroken string without spaces
        var unbrokenCode = new string('A', 40);
        var unbrokenDesc = new string('W', 120);

        var report = new MorbidityReportDto(
            DateTime.UtcNow.AddDays(-30),
            DateTime.UtcNow,
            _testTenantId,
            _testClinicId,
            "Unbroken String Test Clinic",
            10,
            10,
            new List<MorbidityDiseaseRowDto>
            {
                new(1, unbrokenCode, unbrokenDesc, 10, 2, 5, 3, 5, 5, 100.0)
            }
        );

        // Act - check if QuestPDF can render long unbroken words or if it throws layout exception
        var act = () => _pdfService.GenerateMorbidityReportPdf(report, settings);
        act.Should().NotThrow<Exception>("PDF generator should render long text without layout crash");
    }

    [Fact]
    public async Task AnalyticsQuery_SingleDayQueryRange_SameStartAndEndDate_ShouldGenerateExactOneTrendPoint()
    {
        var (context, _, sieve) = TestDbHelper.CreateTestContext(_clinicContext);
        var queueRepo = TestDbHelper.CreateRepository<QueueItem>(context, sieve);
        var invoiceRepo = TestDbHelper.CreateRepository<Invoice>(context, sieve);
        var paymentRepo = TestDbHelper.CreateRepository<PaymentRecord>(context, sieve);
        var consultRepo = TestDbHelper.CreateRepository<ConsultationEncounter>(context, sieve);
        var procRepo = TestDbHelper.CreateRepository<ClinicalProcedure>(context, sieve);
        var labRepo = TestDbHelper.CreateRepository<ClinicLabOrder>(context, sieve);

        var singleDay = new DateTime(2026, 10, 15, 0, 0, 0, DateTimeKind.Utc);
        var handler = new GetClinicAnalyticsQueryHandler(
            queueRepo, invoiceRepo, paymentRepo, consultRepo, procRepo, labRepo, _clinicContext);

        var query = new GetClinicAnalyticsQuery(StartDate: singleDay, EndDate: singleDay);
        var result = await handler.Handle(query, CancellationToken.None);

        result.RevenueTrend.Should().HaveCount(1, "Single-day range (start == end) must produce exactly 1 trend point for that day");
        result.RevenueTrend[0].DateLabel.Should().Be(singleDay.ToString("MMM dd"));
    }

    [Fact]
    public async Task DoctorSharesQuery_DoctorWithZeroGross_ShouldComputeZeroSharesWithoutDivisionByZero()
    {
        var (context, uow, sieve) = TestDbHelper.CreateTestContext(_clinicContext);
        var consultRepo = TestDbHelper.CreateRepository<ConsultationEncounter>(context, sieve);
        var invoiceRepo = TestDbHelper.CreateRepository<Invoice>(context, sieve);
        var procRepo = TestDbHelper.CreateRepository<ClinicalProcedure>(context, sieve);

        var docId = Guid.NewGuid();
        var docName = "Dr. Pro Bono Volunteer";

        // Consultation exists, but invoice is ₱0.00
        var enc = new ConsultationEncounter
        {
            TenantId = _testTenantId,
            ClinicId = _testClinicId,
            PatientId = Guid.NewGuid(),
            PatientName = "Charity Patient",
            DoctorId = docId,
            DoctorName = docName,
            EncounterDate = DateTime.UtcNow.Date.AddHours(9)
        };
        await consultRepo.AddAsync(enc);

        var invoice = new Invoice
        {
            TenantId = _testTenantId,
            ClinicId = _testClinicId,
            InvoiceNumber = "INV-ZERO-001",
            InvoiceDate = DateTime.UtcNow.Date.AddHours(9),
            PatientId = enc.PatientId,
            PatientName = enc.PatientName,
            AttendingDoctorId = docId,
            AttendingDoctorName = docName,
            GrossAmount = 0m,
            NetAmount = 0m,
            BalanceDue = 0m,
            Status = InvoiceStatus.Paid,
            LineItems = new List<InvoiceLineItem>
            {
                new() { Description = "Pro Bono Consultation", Category = "Consultation", TotalPrice = 0m }
            }
        };
        await invoiceRepo.AddAsync(invoice);
        await uow.SaveChangesAsync();

        var handler = new GetDoctorSharesReportQueryHandler(
            consultRepo, invoiceRepo, procRepo, _clinicContext);

        var result = await handler.Handle(new GetDoctorSharesReportQuery(), CancellationToken.None);

        result.TotalClinicEncounters.Should().Be(1);
        result.DoctorShares.Should().HaveCount(1);
        var share = result.DoctorShares[0];
        share.TotalGrossGenerated.Should().Be(0m);
        share.EstimatedPhysicianShare.Should().Be(0m);
        share.ClinicFacilityShare.Should().Be(0m);
    }

    [Fact]
    public void NullSafety_NullFieldsInsideTableRows_PdfGeneratorsBehavior()
    {
        var settings = CreateDefaultSettings();

        // Daily EOD with null DoctorName and null Method in row items
        var eodDto = new DailyEodReportDto(
            DateTime.UtcNow, _testTenantId, _testClinicId,
            1, 1, 0, 1, 0, 100m, 0m, 0m, 0m, 0m, 100m, 100m, 100m, 0m,
            new List<PaymentModeSummary>
            {
                new(null!, 100m, 1) // null Method!
            },
            new List<DoctorWorkloadSummary>
            {
                new(null!, 1) // null DoctorName!
            },
            0, 0, 0, 0
        );

        // Morbidity with null Icd10Code and Description in row
        var morbDto = new MorbidityReportDto(
            DateTime.UtcNow.AddDays(-7), DateTime.UtcNow, _testTenantId, _testClinicId,
            "Clinic Name", 1, 1,
            new List<MorbidityDiseaseRowDto>
            {
                new(1, null!, null!, 1, 0, 1, 0, 1, 0, 100.0)
            }
        );

        // Tax Discount with null OR, null Patient, null DiscountType
        var taxDto = new TaxDiscountAuditReportDto(
            DateTime.UtcNow.AddDays(-7), DateTime.UtcNow, _testTenantId, _testClinicId,
            1, 100m, 20m, 0m, 12m, 80m,
            new List<TaxDiscountAuditRowDto>
            {
                new(null!, DateTime.UtcNow, null!, null!, null, 100m, 20m, 100m, 12m, 80m, 80m, null, null)
            }
        );

        // Doctor Shares with null DoctorName
        var sharesDto = new DoctorSharesReportDto(
            DateTime.UtcNow.AddDays(-7), DateTime.UtcNow, _testTenantId, _testClinicId,
            1, 100m, 70m, 30m,
            new List<DoctorWorkloadDetailDto>
            {
                new("DOC-1", null!, 1, 0, 100m, 0m, 100m, 70m, 30m)
            }
        );

        // Analytics with null fields in child rows
        var analyticsDto = new ClinicAnalyticsDto(
            DateTime.UtcNow.AddDays(-7), DateTime.UtcNow, _testTenantId, _testClinicId,
            new FlowAnalyticsDto(1, 0, 0, 0, 1, 0.0, 0.0, 1, 0, 0),
            100m, 80m, 80m, 0m, 80m, 20m, 0m,
            new List<DailyTrendPointDto> { new(null!, 80m, 1) },
            new List<TenderShareDto> { new(null!, 80m, 100.0) },
            new List<MorbidityItemDto> { new(null!, null!, 1, 100.0) },
            new List<ServiceUsageDto> { new(null!, null!, 1) },
            new List<DoctorStatDto> { new(null!, 1, 80m) }
        );

        // Act - observe behavior
        Action actEod = () => _pdfService.GenerateDailyEodReportPdf(eodDto, settings);
        Action actMorb = () => _pdfService.GenerateMorbidityReportPdf(morbDto, settings);
        Action actTax = () => _pdfService.GenerateTaxDiscountAuditReportPdf(taxDto, settings);
        Action actShares = () => _pdfService.GenerateDoctorSharesReportPdf(sharesDto, settings);
        Action actAnalytics = () => _pdfService.GenerateClinicAnalyticsPdf(analyticsDto, settings);

        // Assert - Does QuestPDF throw ArgumentNullException or succeed?
        // Let's run and verify whether any of these throw!
        actEod.Should().NotThrow();
        actMorb.Should().NotThrow();
        actTax.Should().NotThrow();
        actShares.Should().NotThrow();
        actAnalytics.Should().NotThrow();
    }

    [Fact]
    public async Task MorbidityQuery_EncounterWithEmptyStringIcd10Code_ShouldHandleGracefully()
    {
        var (context, uow, sieve) = TestDbHelper.CreateTestContext(_clinicContext);
        var consultRepo = TestDbHelper.CreateRepository<ConsultationEncounter>(context, sieve);
        var patientRepo = TestDbHelper.CreateRepository<ClinicPatient>(context, sieve);

        var enc = new ConsultationEncounter
        {
            TenantId = _testTenantId,
            ClinicId = _testClinicId,
            PatientId = Guid.NewGuid(),
            PatientName = "Empty ICD Patient",
            DoctorId = Guid.NewGuid(),
            DoctorName = "Dr. Tester",
            EncounterDate = DateTime.UtcNow.Date.AddHours(10),
            Diagnoses = new List<EncounterDiagnosis>
            {
                new() { Icd10Code = "", Description = "Diagnosis with Empty String ICD-10 Code" }
            }
        };
        await consultRepo.AddAsync(enc);
        await uow.SaveChangesAsync();

        var handler = new GetMorbidityReportQueryHandler(consultRepo, patientRepo, _clinicContext);
        var result = await handler.Handle(new GetMorbidityReportQuery(), CancellationToken.None);

        result.TotalDiagnosesRecorded.Should().Be(1);
        result.Diseases.Should().HaveCount(1);
        result.Diseases[0].Icd10Code.Should().Be("");
    }




    // =========================================================================
    // HELPER FIXTURE GENERATORS
    // =========================================================================

    private static ClinicSettings CreateDefaultSettings() => new()
    {
        TenantId = "tenant-001",
        ClinicId = Guid.NewGuid(),
        ClinicName = "St. Jude Family Medical Clinic & Diagnostic Center",
        LetterheadHeader = "ST. JUDE FAMILY MEDICAL CLINIC",
        LetterheadSubHeader = "Accredited Primary Care Center & PhilHealth Konsulta Facility",
        LetterheadAddress = "124 Rizal Avenue, San Pedro, Laguna, Philippines",
        LetterheadContact = "Tel: (02) 8876-5432 • Mobile: +63 917 123 4567",
        LetterheadFooter = "Valid Philippine Medical Document. Generated by Clinic EZ.",
        TaxIdentificationNumber = "123-456-789-000",
        PrimaryColorHex = "#0D6963",
        PaperSize = "Letter"
    };

    private static DailyEodReportDto CreateSampleEodDto(string tenantId = "tenant-001", Guid? clinicId = null) => new(
        DateTime.UtcNow,
        tenantId,
        clinicId ?? Guid.NewGuid(),
        45, 30, 15, 45, 0,
        51900m, 5100m, 2550m, 2550m, 0m, 46800m, 46800m, 18450m, 0m,
        new List<PaymentModeSummary>
        {
            new("Cash", 18450m, 20),
            new("GCash", 12300m, 12),
            new("Maya", 6150m, 6),
            new("CreditCard", 9900m, 7)
        },
        new List<DoctorWorkloadSummary>
        {
            new("Dr. Allan Ramos", 25),
            new("Dr. Maria Santos", 20)
        },
        5, 8, 32, 2
    );

    private static MorbidityReportDto CreateSampleMorbidityDto(string tenantId = "tenant-001", Guid? clinicId = null) => new(
        DateTime.UtcNow.AddDays(-30),
        DateTime.UtcNow,
        tenantId,
        clinicId ?? Guid.NewGuid(),
        "St. Jude Family Medical Clinic",
        125,
        140,
        new List<MorbidityDiseaseRowDto>
        {
            new(1, "J06.9", "Acute Upper Respiratory Infection", 52, 20, 25, 7, 26, 26, 37.1),
            new(2, "I10", "Essential (Primary) Hypertension", 38, 0, 22, 16, 18, 20, 27.1),
            new(3, "E11.9", "Type 2 Diabetes Mellitus without complications", 26, 0, 15, 11, 12, 14, 18.6)
        }
    );

    private static TaxDiscountAuditReportDto CreateSampleTaxDiscountDto(string tenantId = "tenant-001", Guid? clinicId = null) => new(
        DateTime.UtcNow.AddDays(-30),
        DateTime.UtcNow,
        tenantId,
        clinicId ?? Guid.NewGuid(),
        2,
        7500m,
        1000m,
        500m,
        900m,
        6000m,
        new List<TaxDiscountAuditRowDto>
        {
            new("INV-202610-001", DateTime.UtcNow.AddDays(-10), "Juan Dela Cruz", "Senior Citizen (RA 9994)", "OSCA-12345", 5000m, 1000m, 5000m, 600m, 4000m, 4000m, "OR-202610-001", "Cash"),
            new("INV-202610-002", DateTime.UtcNow.AddDays(-5), "Maria Clara", "PWD (RA 10754)", "PWD-67890", 2500m, 500m, 2500m, 300m, 2000m, 2000m, "OR-202610-002", "GCash")
        }
    );

    private static DoctorSharesReportDto CreateSampleDoctorSharesDto(string tenantId = "tenant-001", Guid? clinicId = null) => new(
        DateTime.UtcNow.AddDays(-30),
        DateTime.UtcNow,
        tenantId,
        clinicId ?? Guid.NewGuid(),
        45,
        74500m,
        52150m,
        22350m,
        new List<DoctorWorkloadDetailDto>
        {
            new(Guid.NewGuid().ToString(), "Dr. Allan Ramos", 25, 5, 25000m, 15000m, 40000m, 28000m, 12000m),
            new(Guid.NewGuid().ToString(), "Dr. Maria Santos", 20, 2, 22500m, 12000m, 34500m, 24150m, 10350m)
        }
    );

    private static ClinicAnalyticsDto CreateSampleAnalyticsDto(string tenantId = "tenant-001", Guid? clinicId = null) => new(
        DateTime.UtcNow.AddDays(-7),
        DateTime.UtcNow,
        tenantId,
        clinicId ?? Guid.NewGuid(),
        new FlowAnalyticsDto(32, 2, 1, 3, 26, 11.2, 16.8, 25, 6, 1),
        485200m,
        460000m,
        455000m,
        5000m,
        1150m,
        15200m,
        10000m,
        new List<DailyTrendPointDto>
        {
            new("Oct 14", 65000m, 30),
            new("Oct 15", 72000m, 35)
        },
        new List<TenderShareDto>
        {
            new("Cash", 227500m, 50.0),
            new("GCash", 136500m, 30.0),
            new("Card", 91000m, 20.0)
        },
        new List<MorbidityItemDto>
        {
            new("J06.9", "Acute URI", 18, 36.0),
            new("I10", "Hypertension", 12, 24.0)
        },
        new List<ServiceUsageDto>
        {
            new("Procedure", "Wound Dressing", 8),
            new("LabOrder", "Complete Blood Count", 14)
        },
        new List<DoctorStatDto>
        {
            new("Dr. Allan Ramos", 18, 240000m),
            new("Dr. Maria Santos", 14, 220000m)
        }
    );
}
