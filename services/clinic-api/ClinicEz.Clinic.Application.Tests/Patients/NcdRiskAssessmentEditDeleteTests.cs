using System;
using System.Collections.Generic;
using System.Linq;
using System.Threading;
using System.Threading.Tasks;
using ClinicEz.Clinic.Application.Features.Patients.Commands;
using ClinicEz.Clinic.Application.Features.Patients.DTOs;
using ClinicEz.Clinic.Application.Features.Patients.Queries;
using ClinicEz.Clinic.Domain.Entities;
using ClinicEz.Clinic.Domain.Interfaces;
using ClinicEz.Clinic.Infrastructure.Persistence;
using ClinicEz.Clinic.Infrastructure.Persistence.Repositories;
using ClinicEz.Shared.Exceptions;
using FluentAssertions;
using Microsoft.EntityFrameworkCore;
using Microsoft.Extensions.Configuration;
using NSubstitute;
using Sieve.Models;
using Sieve.Services;
using Xunit;

namespace ClinicEz.Clinic.Application.Tests.Patients;

public class NcdRiskAssessmentEditDeleteTests
{
    private readonly ISieveProcessor _sieveProcessor;

    public NcdRiskAssessmentEditDeleteTests()
    {
        var sieveOptions = Microsoft.Extensions.Options.Options.Create(new SieveOptions());
        _sieveProcessor = new SieveProcessor(sieveOptions);
    }

    private ApplicationDbContext CreateDbContext(string dbName, Guid clinicId, string tenantId)
    {
        var clinicContext = Substitute.For<IClinicContext>();
        clinicContext.ClinicId.Returns(clinicId);
        clinicContext.TenantId.Returns(tenantId);

        var config = new ConfigurationBuilder()
            .AddInMemoryCollection(new[] { new KeyValuePair<string, string?>("DbSchema", "public") })
            .Build();

        var options = new DbContextOptionsBuilder<ApplicationDbContext>()
            .UseInMemoryDatabase(databaseName: dbName)
            .Options;

        return new ApplicationDbContext(options, config, clinicContext);
    }

    private (IUnitOfWork uow, IClinicContext ctx) CreateUnitOfWorkAndContext(ApplicationDbContext db, Guid clinicId, string tenantId, Guid? staffId = null)
    {
        var ctx = Substitute.For<IClinicContext>();
        ctx.ClinicId.Returns(clinicId);
        ctx.TenantId.Returns(tenantId);
        ctx.StaffId.Returns(staffId ?? Guid.NewGuid());

        var uow = Substitute.For<IUnitOfWork>();
        uow.SaveChangesAsync(Arg.Any<CancellationToken>()).Returns(ci => db.SaveChangesAsync(ci.Arg<CancellationToken>()));

        return (uow, ctx);
    }

    [Fact]
    public async Task UpdateNcdRiskAssessment_UpdatesValues_And_StampsAuditFields()
    {
        var dbName = $"Ncd_Update_{Guid.NewGuid()}";
        var clinicId = Guid.NewGuid();
        var tenantId = "tenant-test";
        var patientId = Guid.NewGuid();
        var staffId = Guid.NewGuid();
        var assessmentId = Guid.NewGuid();

        using var db = CreateDbContext(dbName, clinicId, tenantId);
        var initial = new NcdRiskAssessment
        {
            Id = assessmentId,
            ClinicId = clinicId,
            TenantId = tenantId,
            PatientId = patientId,
            AssessedByStaffId = staffId,
            AssessedByStaffName = "Dr. Wave Ambray",
            RiskBand = "BandA",
            CalculatedRiskScorePercent = 5.0m,
            FastingBloodSugarMgDl = 90m,
            CreatedAt = DateTime.UtcNow.AddHours(-2),
            CreatedBy = staffId.ToString()
        };
        db.NcdRiskAssessments.Add(initial);
        await db.SaveChangesAsync();

        var (uow, ctx) = CreateUnitOfWorkAndContext(db, clinicId, tenantId, staffId);
        var handler = new UpdateNcdRiskAssessmentCommandHandler(
            new Repository<NcdRiskAssessment>(db, _sieveProcessor),
            uow,
            ctx);

        var updateCommand = new UpdateNcdRiskAssessmentCommand(
            Id: assessmentId,
            PatientId: patientId,
            RiskBand: "BandC",
            CalculatedRiskScorePercent: 22.5m,
            FastingBloodSugarMgDl: 140m,
            Remarks: "Corrected fasting glucose level");

        var result = await handler.Handle(updateCommand, CancellationToken.None);

        result.Should().NotBeNull();
        result.RiskBand.Should().Be("BandC");
        result.CalculatedRiskScorePercent.Should().Be(22.5m);
        result.FastingBloodSugarMgDl.Should().Be(140m);
        result.Remarks.Should().Be("Corrected fasting glucose level");
        result.UpdatedAt.Should().NotBeNull();
    }

    [Fact]
    public async Task VoidNcdRiskAssessment_AuthorStaff_SuccessfullyVoidsRecord()
    {
        var dbName = $"Ncd_Void_Success_{Guid.NewGuid()}";
        var clinicId = Guid.NewGuid();
        var tenantId = "tenant-test";
        var patientId = Guid.NewGuid();
        var authorStaffId = Guid.NewGuid();
        var assessmentId = Guid.NewGuid();

        using var db = CreateDbContext(dbName, clinicId, tenantId);
        var assessment = new NcdRiskAssessment
        {
            Id = assessmentId,
            ClinicId = clinicId,
            TenantId = tenantId,
            PatientId = patientId,
            AssessedByStaffId = authorStaffId,
            AssessedByStaffName = "Dr. Wave Ambray",
            RiskBand = "BandE",
            CalculatedRiskScorePercent = 40m,
            CreatedAt = DateTime.UtcNow,
            CreatedBy = authorStaffId.ToString()
        };
        db.NcdRiskAssessments.Add(assessment);
        await db.SaveChangesAsync();

        var (uow, ctx) = CreateUnitOfWorkAndContext(db, clinicId, tenantId, authorStaffId);
        var handler = new VoidNcdRiskAssessmentCommandHandler(
            new Repository<NcdRiskAssessment>(db, _sieveProcessor),
            uow,
            ctx);

        var voidCommand = new VoidNcdRiskAssessmentCommand(
            Id: assessmentId,
            PatientId: patientId,
            Reason: "Duplicate entry",
            CurrentStaffName: "Dr. Wave Ambray");

        var success = await handler.Handle(voidCommand, CancellationToken.None);

        success.Should().BeTrue();

        // Verify entity state directly in DbContext (ignoring query filters)
        var voided = await db.NcdRiskAssessments.IgnoreQueryFilters().FirstOrDefaultAsync(n => n.Id == assessmentId);
        voided.Should().NotBeNull();
        voided!.IsDeleted.Should().BeTrue();
        voided.DeletedAt.Should().NotBeNull();
        voided.DeletedBy.Should().Be("Dr. Wave Ambray");
        voided.VoidReason.Should().Be("Duplicate entry");
    }

    [Fact]
    public async Task VoidNcdRiskAssessment_NonAuthorStaff_ThrowsForbiddenException()
    {
        var dbName = $"Ncd_Void_Forbidden_{Guid.NewGuid()}";
        var clinicId = Guid.NewGuid();
        var tenantId = "tenant-test";
        var patientId = Guid.NewGuid();
        var authorStaffId = Guid.NewGuid();
        var otherStaffId = Guid.NewGuid();
        var assessmentId = Guid.NewGuid();

        using var db = CreateDbContext(dbName, clinicId, tenantId);
        var assessment = new NcdRiskAssessment
        {
            Id = assessmentId,
            ClinicId = clinicId,
            TenantId = tenantId,
            PatientId = patientId,
            AssessedByStaffId = authorStaffId,
            AssessedByStaffName = "Dr. Wave Ambray",
            RiskBand = "BandE",
            CalculatedRiskScorePercent = 40m,
            CreatedAt = DateTime.UtcNow,
            CreatedBy = authorStaffId.ToString()
        };
        db.NcdRiskAssessments.Add(assessment);
        await db.SaveChangesAsync();

        // Caller is otherStaffId, not the author
        var (uow, ctx) = CreateUnitOfWorkAndContext(db, clinicId, tenantId, otherStaffId);
        var handler = new VoidNcdRiskAssessmentCommandHandler(
            new Repository<NcdRiskAssessment>(db, _sieveProcessor),
            uow,
            ctx);

        var voidCommand = new VoidNcdRiskAssessmentCommand(
            Id: assessmentId,
            PatientId: patientId,
            Reason: "I disagree with this score",
            CurrentStaffName: "Dr. Other Clinician");

        var act = () => handler.Handle(voidCommand, CancellationToken.None);

        await act.Should().ThrowAsync<ForbiddenException>()
            .WithMessage("*Only the author/creator clinician*");
    }

    [Fact]
    public async Task GetPatientNcdRiskAssessments_ExcludesVoided_ByDefault_IncludesWhenRequested()
    {
        var dbName = $"Ncd_Query_Filter_{Guid.NewGuid()}";
        var clinicId = Guid.NewGuid();
        var tenantId = "tenant-test";
        var patientId = Guid.NewGuid();
        var staffId = Guid.NewGuid();

        using var db = CreateDbContext(dbName, clinicId, tenantId);
        var activeRecord = new NcdRiskAssessment
        {
            Id = Guid.NewGuid(),
            ClinicId = clinicId,
            TenantId = tenantId,
            PatientId = patientId,
            AssessedByStaffId = staffId,
            RiskBand = "BandA",
            AssessmentDate = DateTime.UtcNow.AddDays(-1),
            IsDeleted = false
        };
        var voidedRecord = new NcdRiskAssessment
        {
            Id = Guid.NewGuid(),
            ClinicId = clinicId,
            TenantId = tenantId,
            PatientId = patientId,
            AssessedByStaffId = staffId,
            RiskBand = "BandE",
            AssessmentDate = DateTime.UtcNow,
            IsDeleted = true,
            DeletedAt = DateTime.UtcNow,
            DeletedBy = "Clinician",
            VoidReason = "Duplicate entry"
        };
        db.NcdRiskAssessments.AddRange(activeRecord, voidedRecord);
        await db.SaveChangesAsync();

        var handler = new GetPatientNcdRiskAssessmentsQueryHandler(
            new Repository<NcdRiskAssessment>(db, _sieveProcessor));

        // 1. By default: only active records returned
        var activeOnlyResult = await handler.Handle(new GetPatientNcdRiskAssessmentsQuery(patientId, IncludeVoided: false), CancellationToken.None);
        activeOnlyResult.Should().HaveCount(1);
        activeOnlyResult[0].Id.Should().Be(activeRecord.Id);

        // 2. With IncludeVoided: true: both active and voided records returned
        var allResult = await handler.Handle(new GetPatientNcdRiskAssessmentsQuery(patientId, IncludeVoided: true), CancellationToken.None);
        allResult.Should().HaveCount(2);
        allResult.Should().Contain(x => x.Id == activeRecord.Id && !x.IsDeleted);
        allResult.Should().Contain(x => x.Id == voidedRecord.Id && x.IsDeleted && x.VoidReason == "Duplicate entry");
    }
}
