using System;
using System.Collections.Generic;
using System.Linq;
using System.Threading;
using System.Threading.Tasks;
using ClinicEz.Clinic.Application.Common.Interfaces;
using ClinicEz.Clinic.Application.Features.Yakap.Commands.CreateYakapTransmittal;
using ClinicEz.Clinic.Application.Features.Yakap.Commands.SubmitYakapTransmittal;
using ClinicEz.Clinic.Application.Features.Yakap.Commands.ValidateYakapTransmittal;
using ClinicEz.Clinic.Application.Features.Yakap.DTOs;
using ClinicEz.Clinic.Application.Features.Yakap.Queries.GetYakapTransmittalById;
using ClinicEz.Clinic.Application.Features.Yakap.Queries.GetYakapTransmittals;
using ClinicEz.Clinic.Application.Features.Yakap.Services;
using ClinicEz.Clinic.Domain.Entities;
using ClinicEz.Clinic.Domain.Enums;
using ClinicEz.Clinic.Domain.Interfaces;
using ClinicEz.Shared.Common;
using FluentAssertions;
using Microsoft.EntityFrameworkCore;
using NSubstitute;
using Xunit;

namespace ClinicEz.Clinic.Application.Tests;

public class YakapTransmittalCommandHandlersTests
{
    private readonly Guid _clinicId = Guid.NewGuid();
    private readonly string _tenantId = "tenant_yakap_test";
    private readonly IClinicContext _clinicContext;
    private readonly IYakapClinicalMapper _mapper = new YakapClinicalMapper(ClinicEz.Clinic.Infrastructure.PhilHealth.Catalog.PhilHealthCatalogLookup.FromBundledSeed());

    public YakapTransmittalCommandHandlersTests()
    {
        _clinicContext = Substitute.For<IClinicContext>();
        _clinicContext.ClinicId.Returns(_clinicId);
        _clinicContext.TenantId.Returns(_tenantId);
        _clinicContext.StaffId.Returns(Guid.NewGuid());
    }

    [Fact]
    public async Task CreateYakapTransmittal_ValidEncounters_CreatesDraftTransmittalWithItems()
    {
        // Arrange
        var (context, uow, sieve) = TestDbHelper.CreateTestContext(_clinicContext);
        var transmittalRepo = TestDbHelper.CreateRepository<YakapTransmittal>(context, sieve);
        var encounterRepo = TestDbHelper.CreateRepository<ConsultationEncounter>(context, sieve);
        var patientRepo = TestDbHelper.CreateRepository<ClinicPatient>(context, sieve);
        var vitalsRepo = TestDbHelper.CreateRepository<TriageVitals>(context, sieve);
        var settingsRepo = TestDbHelper.CreateRepository<ClinicSettings>(context, sieve);
        var labOrderRepo = TestDbHelper.CreateRepository<ClinicLabOrder>(context, sieve);
        var serviceItemRepo = TestDbHelper.CreateRepository<ClinicServiceItem>(context, sieve);

        var patient = new ClinicPatient
        {
            Id = Guid.NewGuid(),
            TenantId = _tenantId,
            ClinicId = _clinicId,
            PatientCode = "PAT-001",
            FirstName = "Andres",
            LastName = "Bonifacio",
            DateOfBirth = new DateOnly(1980, 11, 30),
            Gender = "Male",
            ContactNumber = "09170001111",
            PhilHealthNumber = "030263078507"
        };
        await patientRepo.AddAsync(patient);

        var encounter = new ConsultationEncounter
        {
            Id = Guid.NewGuid(),
            TenantId = _tenantId,
            ClinicId = _clinicId,
            PatientId = patient.Id,
            PatientName = "Andres Bonifacio",
            DoctorId = Guid.NewGuid(),
            DoctorName = "Dr. Jose Rizal",
            EncounterDate = DateTime.UtcNow,
            Subjective = "Baseline checkup"
        };
        await encounterRepo.AddAsync(encounter);

        var settings = new ClinicSettings
        {
            Id = Guid.NewGuid(),
            TenantId = _tenantId,
            ClinicId = _clinicId,
            ClinicName = "Katipunan Health Clinic",
            AccreditationNumber = "09214"
        };
        await settingsRepo.AddAsync(settings);
        await uow.SaveChangesAsync();

        var handler = new CreateYakapTransmittalCommandHandler(
            transmittalRepo, encounterRepo, patientRepo, vitalsRepo, settingsRepo,
            labOrderRepo, serviceItemRepo,
            uow, _clinicContext, _mapper);

        // Act
        var result = await handler.Handle(
            new CreateYakapTransmittalCommand(new List<Guid> { encounter.Id }, "1", "2026"),
            CancellationToken.None);

        // Assert
        result.Succeeded.Should().BeTrue();
        result.Data.Should().NotBeNull();
        result.Data!.Status.Should().Be(YakapTransmittalStatus.Draft);
        result.Data.ReportTagging.Should().Be("1");
        result.Data.EffectiveYear.Should().Be("2026");
        result.Data.TransmittalNumber.Should().StartWith("RHCI092142026");
        result.Data.Items.Should().HaveCount(3); // Enlistment, Profile, Soap
        result.Data.Items.Select(i => i.ItemType).Should().Contain(["Enlistment", "Profile", "Soap"]);
    }

    [Fact]
    public async Task ValidateYakapTransmittal_ValidDocument_UpdatesStatusToValidated()
    {
        // Arrange
        var (context, uow, sieve) = TestDbHelper.CreateTestContext(_clinicContext);
        var transmittalRepo = TestDbHelper.CreateRepository<YakapTransmittal>(context, sieve);
        var encounterRepo = TestDbHelper.CreateRepository<ConsultationEncounter>(context, sieve);
        var patientRepo = TestDbHelper.CreateRepository<ClinicPatient>(context, sieve);
        var vitalsRepo = TestDbHelper.CreateRepository<TriageVitals>(context, sieve);
        var settingsRepo = TestDbHelper.CreateRepository<ClinicSettings>(context, sieve);
        var labOrderRepo = TestDbHelper.CreateRepository<ClinicLabOrder>(context, sieve);
        var serviceItemRepo = TestDbHelper.CreateRepository<ClinicServiceItem>(context, sieve);

        var proxyClient = Substitute.For<IPhilHealthProxyClient>();
        proxyClient.ValidateReportAsync(Arg.Any<GenerateAndValidateReportProxyRequest>(), Arg.Any<CancellationToken>())
            .Returns(ApiResponse<YakapValidationProxyResponse>.Success(
                new YakapValidationProxyResponse(
                    IsValid: true,
                    TransmittalNumber: "RHCI0921420261003",
                    RawXml: "<xml>Sample</xml>",
                    EncryptedPayload: "ENCRYPTED_BASE64",
                    PhilHealthSoapResponse: "OK",
                    ValidationErrors: [])));

        var transmittal = new YakapTransmittal
        {
            Id = Guid.NewGuid(),
            TenantId = _tenantId,
            ClinicId = _clinicId,
            TransmittalNumber = "RHCI0921420261003",
            ReportTagging = "1",
            EffectiveYear = "2026",
            Status = YakapTransmittalStatus.Draft
        };
        await transmittalRepo.AddAsync(transmittal);
        await uow.SaveChangesAsync();

        var handler = new ValidateYakapTransmittalCommandHandler(
            transmittalRepo, encounterRepo, patientRepo, vitalsRepo, settingsRepo,
            labOrderRepo, serviceItemRepo,
            proxyClient, uow, _clinicContext, _mapper);

        // Act
        var result = await handler.Handle(
            new ValidateYakapTransmittalCommand(transmittal.Id),
            CancellationToken.None);

        // Assert
        result.Succeeded.Should().BeTrue();
        result.Data!.IsValid.Should().BeTrue();
        result.Data.RawXml.Should().Be("<xml>Sample</xml>");

        var updated = (await context.YakapTransmittals.FirstOrDefaultAsync(t => t.Id == transmittal.Id))!;
        updated.Status.Should().Be(YakapTransmittalStatus.Validated);
        updated.RawXmlPayload.Should().Be("<xml>Sample</xml>");
    }

    [Fact]
    public async Task ValidateYakapTransmittal_InvalidDocument_UpdatesStatusToFailedWithErrors()
    {
        // Arrange
        var (context, uow, sieve) = TestDbHelper.CreateTestContext(_clinicContext);
        var transmittalRepo = TestDbHelper.CreateRepository<YakapTransmittal>(context, sieve);
        var encounterRepo = TestDbHelper.CreateRepository<ConsultationEncounter>(context, sieve);
        var patientRepo = TestDbHelper.CreateRepository<ClinicPatient>(context, sieve);
        var vitalsRepo = TestDbHelper.CreateRepository<TriageVitals>(context, sieve);
        var settingsRepo = TestDbHelper.CreateRepository<ClinicSettings>(context, sieve);
        var labOrderRepo = TestDbHelper.CreateRepository<ClinicLabOrder>(context, sieve);
        var serviceItemRepo = TestDbHelper.CreateRepository<ClinicServiceItem>(context, sieve);

        var proxyClient = Substitute.For<IPhilHealthProxyClient>();
        proxyClient.ValidateReportAsync(Arg.Any<GenerateAndValidateReportProxyRequest>(), Arg.Any<CancellationToken>())
            .Returns(ApiResponse<YakapValidationProxyResponse>.Success(
                new YakapValidationProxyResponse(
                    IsValid: false,
                    TransmittalNumber: "RHCI0921420261003",
                    RawXml: "<xml>Sample</xml>",
                    EncryptedPayload: null,
                    PhilHealthSoapResponse: "FAILED",
                    ValidationErrors: ["Invalid PIN check digit", "Missing vital signs"])));

        var transmittal = new YakapTransmittal
        {
            Id = Guid.NewGuid(),
            TenantId = _tenantId,
            ClinicId = _clinicId,
            TransmittalNumber = "RHCI0921420261003",
            ReportTagging = "1",
            EffectiveYear = "2026",
            Status = YakapTransmittalStatus.Draft
        };
        await transmittalRepo.AddAsync(transmittal);
        await uow.SaveChangesAsync();

        var handler = new ValidateYakapTransmittalCommandHandler(
            transmittalRepo, encounterRepo, patientRepo, vitalsRepo, settingsRepo,
            labOrderRepo, serviceItemRepo,
            proxyClient, uow, _clinicContext, _mapper);

        // Act
        var result = await handler.Handle(
            new ValidateYakapTransmittalCommand(transmittal.Id),
            CancellationToken.None);

        // Assert
        result.Succeeded.Should().BeTrue();
        result.Data!.IsValid.Should().BeFalse();
        result.Data.ValidationErrors.Should().Contain("Invalid PIN check digit");

        var updated = (await context.YakapTransmittals.FirstOrDefaultAsync(t => t.Id == transmittal.Id))!;
        updated.Status.Should().Be(YakapTransmittalStatus.Failed);
        updated.ValidationErrors.Should().Contain("Invalid PIN check digit");
    }

    [Fact]
    public async Task SubmitYakapTransmittal_SuccessfulSubmission_CapturesTransactionNumberAndSetsSubmitted()
    {
        // Arrange
        var (context, uow, sieve) = TestDbHelper.CreateTestContext(_clinicContext);
        var transmittalRepo = TestDbHelper.CreateRepository<YakapTransmittal>(context, sieve);
        var encounterRepo = TestDbHelper.CreateRepository<ConsultationEncounter>(context, sieve);
        var patientRepo = TestDbHelper.CreateRepository<ClinicPatient>(context, sieve);
        var vitalsRepo = TestDbHelper.CreateRepository<TriageVitals>(context, sieve);
        var settingsRepo = TestDbHelper.CreateRepository<ClinicSettings>(context, sieve);
        var labOrderRepo = TestDbHelper.CreateRepository<ClinicLabOrder>(context, sieve);
        var serviceItemRepo = TestDbHelper.CreateRepository<ClinicServiceItem>(context, sieve);

        var proxyClient = Substitute.For<IPhilHealthProxyClient>();
        proxyClient.SubmitReportAsync(Arg.Any<GenerateAndSubmitReportProxyRequest>(), Arg.Any<CancellationToken>())
            .Returns(ApiResponse<YakapSubmissionProxyResponse>.Success(
                new YakapSubmissionProxyResponse(
                    IsSuccess: true,
                    TransmittalNumber: "RHCI0921420261003",
                    TransactionNumber: "PHIC-TXN-2026-99988",
                    RawXml: "<xml>Submitted</xml>",
                    PhilHealthSoapResponse: "Accepted",
                    ValidationErrors: [])));

        var transmittal = new YakapTransmittal
        {
            Id = Guid.NewGuid(),
            TenantId = _tenantId,
            ClinicId = _clinicId,
            TransmittalNumber = "RHCI0921420261003",
            ReportTagging = "1",
            EffectiveYear = "2026",
            Status = YakapTransmittalStatus.Validated
        };
        await transmittalRepo.AddAsync(transmittal);
        await uow.SaveChangesAsync();

        var handler = new SubmitYakapTransmittalCommandHandler(
            transmittalRepo, encounterRepo, patientRepo, vitalsRepo, settingsRepo,
            labOrderRepo, serviceItemRepo,
            proxyClient, uow, _clinicContext, _mapper);

        // Act
        var result = await handler.Handle(
            new SubmitYakapTransmittalCommand(transmittal.Id),
            CancellationToken.None);

        // Assert
        result.Succeeded.Should().BeTrue();
        result.Data!.IsSuccess.Should().BeTrue();
        result.Data.TransactionNumber.Should().Be("PHIC-TXN-2026-99988");

        var updated = (await context.YakapTransmittals.FirstOrDefaultAsync(t => t.Id == transmittal.Id))!;
        updated.Status.Should().Be(YakapTransmittalStatus.Submitted);
        updated.PhilHealthTransactionNumber.Should().Be("PHIC-TXN-2026-99988");
        updated.SubmittedAt.Should().NotBeNull();
    }

    [Fact]
    public async Task GetYakapTransmittalsQuery_FiltersByStatusCorrectly()
    {
        // Arrange
        var (context, uow, sieve) = TestDbHelper.CreateTestContext(_clinicContext);
        var transmittalRepo = TestDbHelper.CreateRepository<YakapTransmittal>(context, sieve);

        var t1 = new YakapTransmittal
        {
            Id = Guid.NewGuid(),
            TenantId = _tenantId,
            ClinicId = _clinicId,
            TransmittalNumber = "RHCI001",
            ReportTagging = "1",
            EffectiveYear = "2026",
            Status = YakapTransmittalStatus.Draft
        };
        var t2 = new YakapTransmittal
        {
            Id = Guid.NewGuid(),
            TenantId = _tenantId,
            ClinicId = _clinicId,
            TransmittalNumber = "RHCI002",
            ReportTagging = "2",
            EffectiveYear = "2026",
            Status = YakapTransmittalStatus.Submitted
        };

        await transmittalRepo.AddAsync(t1);
        await transmittalRepo.AddAsync(t2);
        await uow.SaveChangesAsync();

        var handler = new GetYakapTransmittalsQueryHandler(transmittalRepo);

        // Act
        var result = await handler.Handle(new GetYakapTransmittalsQuery(Status: YakapTransmittalStatus.Submitted), CancellationToken.None);

        // Assert
        result.Succeeded.Should().BeTrue();
        result.Data.Should().HaveCount(1);
        result.Data![0].TransmittalNumber.Should().Be("RHCI002");
    }

    [Fact]
    public async Task GetYakapTransmittalByIdQuery_ReturnsDetailsWithItems()
    {
        // Arrange
        var (context, uow, sieve) = TestDbHelper.CreateTestContext(_clinicContext);
        var transmittalRepo = TestDbHelper.CreateRepository<YakapTransmittal>(context, sieve);

        var transmittal = new YakapTransmittal
        {
            Id = Guid.NewGuid(),
            TenantId = _tenantId,
            ClinicId = _clinicId,
            TransmittalNumber = "RHCI-DETAIL-001",
            ReportTagging = "1",
            EffectiveYear = "2026",
            Status = YakapTransmittalStatus.Draft,
            Items = new List<YakapTransmittalItem>
            {
                new()
                {
                    Id = Guid.NewGuid(),
                    TenantId = _tenantId,
                    ClinicId = _clinicId,
                    PatientId = Guid.NewGuid(),
                    PatientName = "Emilio Aguinaldo",
                    PhilHealthIdentificationNumber = "123456789012",
                    ItemType = "Enlistment"
                }
            }
        };

        await transmittalRepo.AddAsync(transmittal);
        await uow.SaveChangesAsync();

        var handler = new GetYakapTransmittalByIdQueryHandler(transmittalRepo);

        // Act
        var result = await handler.Handle(new GetYakapTransmittalByIdQuery(transmittal.Id), CancellationToken.None);

        // Assert
        result.Succeeded.Should().BeTrue();
        result.Data.Should().NotBeNull();
        result.Data!.TransmittalNumber.Should().Be("RHCI-DETAIL-001");
        result.Data.Items.Should().HaveCount(1);
        result.Data.Items[0].PatientName.Should().Be("Emilio Aguinaldo");
    }
}
