using System;
using System.Collections.Generic;
using System.Linq;
using System.Text.Json;
using System.Threading;
using System.Threading.Tasks;
using ClinicEz.Clinic.Application.Common.Interfaces;
using ClinicEz.Clinic.Application.Features.Yakap.Commands.CreateYakapTransmittal;
using ClinicEz.Clinic.Application.Features.Yakap.Commands.SubmitYakapTransmittal;
using ClinicEz.Clinic.Application.Features.Yakap.Commands.ValidateYakapTransmittal;
using ClinicEz.Clinic.Application.Features.Yakap.DTOs;
using ClinicEz.Clinic.Application.Features.Yakap.Queries.GetEligibleYakapEncounters;
using ClinicEz.Clinic.Application.Features.Yakap.Queries.GetYakapTransmittalRawXml;
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

public class YakapTranche2BatchTransmittalTests
{
    private readonly Guid _clinicId = Guid.NewGuid();
    private readonly string _tenantId = "tenant_tranche2_test";
    private readonly IClinicContext _clinicContext;
    private readonly IYakapClinicalMapper _mapper = new YakapClinicalMapper();

    public YakapTranche2BatchTransmittalTests()
    {
        _clinicContext = Substitute.For<IClinicContext>();
        _clinicContext.ClinicId.Returns(_clinicId);
        _clinicContext.TenantId.Returns(_tenantId);
        _clinicContext.StaffId.Returns(Guid.NewGuid());
    }

    [Fact]
    public async Task GetEligibleYakapEncounters_OnlyReturnsSignedAndUnsubmittedEncounters()
    {
        // Arrange
        var (context, uow, sieve) = TestDbHelper.CreateTestContext(_clinicContext);
        var transmittalRepo = TestDbHelper.CreateRepository<YakapTransmittal>(context, sieve);
        var encounterRepo = TestDbHelper.CreateRepository<ConsultationEncounter>(context, sieve);
        var patientRepo = TestDbHelper.CreateRepository<ClinicPatient>(context, sieve);
        var labOrderRepo = TestDbHelper.CreateRepository<ClinicLabOrder>(context, sieve);

        var patient = new ClinicPatient
        {
            Id = Guid.NewGuid(),
            TenantId = _tenantId,
            ClinicId = _clinicId,
            PatientCode = "PAT-002",
            FirstName = "Juan",
            LastName = "Luna",
            DateOfBirth = new DateOnly(1985, 10, 23),
            Gender = "Male",
            ContactNumber = "09170002222",
            PhilHealthNumber = "120345678901"
        };
        await patientRepo.AddAsync(patient);

        // Encounter 1: Signed and eligible
        var encEligible = new ConsultationEncounter
        {
            Id = Guid.NewGuid(),
            TenantId = _tenantId,
            ClinicId = _clinicId,
            PatientId = patient.Id,
            PatientName = "Juan Luna",
            DoctorId = Guid.NewGuid(),
            DoctorName = "Dr. Jose Rizal",
            EncounterDate = DateTime.UtcNow.AddDays(-2),
            IsSigned = true,
            Subjective = "Persistent dry cough",
            Assessment = "Acute Bronchitis",
            Diagnoses = new List<EncounterDiagnosis>
            {
                new() { Icd10Code = "J20.9", Description = "Acute bronchitis, unspecified", IsPrimary = true }
            },
            Prescriptions = new List<PrescriptionItem>
            {
                new() { GenericName = "Amoxicillin", Dosage = "500mg", Form = "CAP", Sig = "1 cap TID", Quantity = 21 }
            }
        };

        // Encounter 2: Not signed
        var encUnsigned = new ConsultationEncounter
        {
            Id = Guid.NewGuid(),
            TenantId = _tenantId,
            ClinicId = _clinicId,
            PatientId = patient.Id,
            PatientName = "Juan Luna",
            DoctorId = Guid.NewGuid(),
            DoctorName = "Dr. Jose Rizal",
            EncounterDate = DateTime.UtcNow.AddDays(-1),
            IsSigned = false,
            Subjective = "Follow-up check"
        };

        // Encounter 3: Signed, but already submitted in a successful transmittal
        var encAlreadySubmitted = new ConsultationEncounter
        {
            Id = Guid.NewGuid(),
            TenantId = _tenantId,
            ClinicId = _clinicId,
            PatientId = patient.Id,
            PatientName = "Juan Luna",
            DoctorId = Guid.NewGuid(),
            DoctorName = "Dr. Jose Rizal",
            EncounterDate = DateTime.UtcNow.AddDays(-5),
            IsSigned = true,
            Subjective = "Initial consultation"
        };

        await encounterRepo.AddAsync(encEligible);
        await encounterRepo.AddAsync(encUnsigned);
        await encounterRepo.AddAsync(encAlreadySubmitted);

        // Transmittal with encAlreadySubmitted
        var submittedTransmittal = new YakapTransmittal
        {
            Id = Guid.NewGuid(),
            TenantId = _tenantId,
            ClinicId = _clinicId,
            TransmittalNumber = "RHCI00092120269999",
            ReportTagging = "2",
            EffectiveYear = "2026",
            Status = YakapTransmittalStatus.Submitted,
            Items = new List<YakapTransmittalItem>
            {
                new()
                {
                    Id = Guid.NewGuid(),
                    TenantId = _tenantId,
                    ClinicId = _clinicId,
                    PatientId = patient.Id,
                    PatientName = "Juan Luna",
                    PhilHealthIdentificationNumber = "120345678901",
                    ConsultationEncounterId = encAlreadySubmitted.Id,
                    ItemType = "Soap",
                    ReportStatus = "A"
                }
            }
        };
        await transmittalRepo.AddAsync(submittedTransmittal);

        // Lab Order for encEligible
        var labOrder = new ClinicLabOrder
        {
            Id = Guid.NewGuid(),
            TenantId = _tenantId,
            ClinicId = _clinicId,
            OrderNumber = "LAB-2026-001",
            PatientId = patient.Id,
            PatientName = "Juan Luna",
            ConsultationId = encEligible.Id,
            Items = new List<ClinicLabOrderItem>
            {
                new() { TestName = "Chest X-Ray PA", Category = "Imaging", PhilHealthServiceCode = "11" },
                new() { TestName = "Complete Blood Count", Category = "Hematology", PhilHealthServiceCode = "1" }
            }
        };
        await labOrderRepo.AddAsync(labOrder);
        await uow.SaveChangesAsync();

        var queryHandler = new GetEligibleYakapEncountersQueryHandler(
            encounterRepo, patientRepo, transmittalRepo, labOrderRepo, _clinicContext);

        // Act
        var result = await queryHandler.Handle(new GetEligibleYakapEncountersQuery(ReportTagging: "2"), CancellationToken.None);

        // Assert
        result.Succeeded.Should().BeTrue();
        result.Data.Should().HaveCount(1);
        var item = result.Data![0];
        item.EncounterId.Should().Be(encEligible.Id);
        item.PatientName.Should().Be("Juan Luna");
        item.PrimaryDiagnosis.Should().Be("Acute bronchitis, unspecified");
        item.DiagnosesCount.Should().Be(1);
        item.PrescriptionsCount.Should().Be(1);
        item.DiagnosticsCount.Should().Be(2); // CXR & CBC
        item.HasPhilHealthPin.Should().BeTrue();
    }

    [Fact]
    public async Task CreateYakapTransmittal_Tranche2_MapsDiagnosticsResultsAndFeeSchedulePricing()
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
            PatientCode = "PAT-003",
            FirstName = "Melchora",
            LastName = "Aquino",
            DateOfBirth = new DateOnly(1950, 1, 6),
            Gender = "Female",
            ContactNumber = "09180003333",
            PhilHealthNumber = "180293847561"
        };
        await patientRepo.AddAsync(patient);

        var encounter = new ConsultationEncounter
        {
            Id = Guid.NewGuid(),
            TenantId = _tenantId,
            ClinicId = _clinicId,
            PatientId = patient.Id,
            PatientName = "Melchora Aquino",
            DoctorId = Guid.NewGuid(),
            DoctorName = "Dr. Jose Rizal",
            EncounterDate = DateTime.UtcNow,
            IsSigned = true,
            Subjective = "Routine hypertension and diabetes monitoring",
            Plan = "Continue maintenance medicines and diet restriction",
            RxDispenseStatus = PrescriptionDispenseStatus.DispensedAtPartnerPharmacy,
            RxDispensedAt = DateTime.UtcNow,
            RxDispensedPharmacistName = "Pharm. Gabriela Silang",
            Diagnoses = new List<EncounterDiagnosis>
            {
                new() { Icd10Code = "I10", Description = "Essential hypertension", IsPrimary = true },
                new() { Icd10Code = "E11.9", Description = "Type 2 diabetes mellitus", IsPrimary = false }
            },
            Prescriptions = new List<PrescriptionItem>
            {
                new()
                {
                    GenericName = "Amlodipine",
                    Dosage = "5mg",
                    Form = "TAB",
                    Sig = "1 tab OD morning",
                    Quantity = 30,
                    PhilHealthDrugCode = "AMLOD0000000005TAB00000000100"
                },
                new()
                {
                    GenericName = "Metformin",
                    Dosage = "500mg",
                    Form = "TAB",
                    Sig = "1 tab BID after meals",
                    Quantity = 60,
                    PhilHealthDrugCode = "METFO0000000500TAB00000000100"
                }
            }
        };
        await encounterRepo.AddAsync(encounter);

        // Lab Order with Discrete ObservationsJson
        var observations = new[]
        {
            new { analyteCode = "FBS", value = "105" },
            new { analyteCode = "HGB", value = "135" },
            new { analyteCode = "HCT", value = "0.41" },
            new { analyteCode = "WBC", value = "6.8" },
            new { analyteCode = "PLT", value = "220" }
        };

        var labOrder = new ClinicLabOrder
        {
            Id = Guid.NewGuid(),
            TenantId = _tenantId,
            ClinicId = _clinicId,
            OrderNumber = "LAB-2026-002",
            PatientId = patient.Id,
            PatientName = "Melchora Aquino",
            ConsultationId = encounter.Id,
            ExternalLabName = "St. Jude Diagnostic Center",
            ReportReleasedAt = DateTime.UtcNow,
            ObservationsJson = JsonSerializer.Serialize(observations),
            Items = new List<ClinicLabOrderItem>
            {
                new() { TestName = "Fasting Blood Sugar", Category = "Chemistry", PhilHealthServiceCode = "5" },
                new() { TestName = "Complete Blood Count", Category = "Hematology", PhilHealthServiceCode = "1" }
            }
        };
        await labOrderRepo.AddAsync(labOrder);

        // Fee Schedule Items
        await serviceItemRepo.AddAsync(new ClinicServiceItem
        {
            TenantId = _tenantId,
            ClinicId = _clinicId,
            Code = "MED-AMLOD-5",
            PhilHealthCode = "AMLOD0000000005TAB00000000100",
            Name = "Amlodipine 5mg Tab",
            Category = "Medicine",
            StandardPrice = 4.50m
        });
        await serviceItemRepo.AddAsync(new ClinicServiceItem
        {
            TenantId = _tenantId,
            ClinicId = _clinicId,
            Code = "MED-METFO-500",
            PhilHealthCode = "METFO0000000500TAB00000000100",
            Name = "Metformin 500mg Tab",
            Category = "Medicine",
            StandardPrice = 3.25m
        });

        var settings = new ClinicSettings
        {
            Id = Guid.NewGuid(),
            TenantId = _tenantId,
            ClinicId = _clinicId,
            ClinicName = "Pugad Lawin Health Station",
            AccreditationNumber = "00921"
        };
        await settingsRepo.AddAsync(settings);
        await uow.SaveChangesAsync();

        var handler = new CreateYakapTransmittalCommandHandler(
            transmittalRepo, encounterRepo, patientRepo, vitalsRepo, settingsRepo,
            labOrderRepo, serviceItemRepo,
            uow, _clinicContext, _mapper);

        // Act
        var result = await handler.Handle(
            new CreateYakapTransmittalCommand(new List<Guid> { encounter.Id }, "2", "2026"),
            CancellationToken.None);

        // Assert
        result.Succeeded.Should().BeTrue();
        result.Data.Should().NotBeNull();
        result.Data!.ReportTagging.Should().Be("2");
        result.Data.Status.Should().Be(YakapTransmittalStatus.Draft);

        // Verify that the mapper was called with Tranche 2 data including lab orders & fee schedule
        var reportDoc = _mapper.MapToYakapReportDocument(
            "2", "2026", settings, new List<ConsultationEncounter> { encounter },
            new Dictionary<Guid, ClinicPatient> { { patient.Id, patient } },
            new Dictionary<Guid, TriageVitals>(),
            result.Data.TransmittalNumber,
            ncdMap: null,
            labOrdersMap: new Dictionary<Guid, List<ClinicLabOrder>> { { encounter.Id, new List<ClinicLabOrder> { labOrder } } },
            feeScheduleMap: new Dictionary<string, decimal>
            {
                { "AMLOD0000000005TAB00000000100", 4.50m },
                { "METFO0000000500TAB00000000100", 3.25m }
            });

        // 1. Diagnostics in SOAP
        reportDoc.Soaps.Should().HaveCount(1);
        reportDoc.Soaps[0].Diagnostics.Should().HaveCount(2);
        reportDoc.Soaps[0].Diagnostics.Select(d => d.DiagnosticId).Should().Contain(["5", "1"]);

        // 2. Diagnostic Results
        reportDoc.DiagnosticResults.Should().HaveCount(1);
        reportDoc.DiagnosticResults[0].FbsResults.Should().NotBeNull();
        reportDoc.DiagnosticResults[0].FbsResults![0].GlucoseMg.Should().Be("105");
        reportDoc.DiagnosticResults[0].CbcResults.Should().NotBeNull();
        reportDoc.DiagnosticResults[0].CbcResults![0].HemoglobinG.Should().Be("135");

        // 3. Medicines with GAMOT UPSC & fee schedule pricing
        reportDoc.Medicines.Should().HaveCount(2);
        var amlod = reportDoc.Medicines.First(m => m.DrugCode.StartsWith("AMLOD"));
        amlod.ActualUnitPrice.Should().Be("4.50");
        amlod.TotalAmtPrice.Should().Be((4.50m * 30).ToString("F2"));
        amlod.IsDispensed.Should().Be("Y");
        amlod.DispensingPersonnel.Should().Be("Pharm. Gabriela Silang");

        var metfo = reportDoc.Medicines.First(m => m.DrugCode.StartsWith("METFO"));
        metfo.ActualUnitPrice.Should().Be("3.25");
        metfo.TotalAmtPrice.Should().Be((3.25m * 60).ToString("F2"));
    }

    [Fact]
    public async Task GetYakapTransmittalRawXml_WhenCached_ReturnsRawXmlDirectly()
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

        var rawXml = "<?xml version=\"1.0\" encoding=\"UTF-8\"?><!DOCTYPE PCB SYSTEM \"KonsultaData_v1.14.dtd\"><PCB pUsername=\"TEST\"></PCB>";

        var transmittal = new YakapTransmittal
        {
            Id = Guid.NewGuid(),
            TenantId = _tenantId,
            ClinicId = _clinicId,
            TransmittalNumber = "RHCI00092120261111",
            ReportTagging = "2",
            EffectiveYear = "2026",
            Status = YakapTransmittalStatus.Validated,
            RawXmlPayload = rawXml
        };
        await transmittalRepo.AddAsync(transmittal);
        await uow.SaveChangesAsync();

        var handler = new GetYakapTransmittalRawXmlQueryHandler(
            transmittalRepo, encounterRepo, patientRepo, vitalsRepo, settingsRepo,
            labOrderRepo, serviceItemRepo,
            proxyClient, uow, _clinicContext, _mapper);

        // Act
        var result = await handler.Handle(new GetYakapTransmittalRawXmlQuery(transmittal.Id), CancellationToken.None);

        // Assert
        result.Succeeded.Should().BeTrue();
        result.Data.Should().Be(rawXml);
        await proxyClient.DidNotReceive().ValidateReportAsync(Arg.Any<GenerateAndValidateReportProxyRequest>(), Arg.Any<CancellationToken>());
    }

    [Fact]
    public async Task GetYakapTransmittalRawXml_WhenNotCached_GeneratesViaProxyAndCaches()
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
        var generatedXml = "<?xml version=\"1.0\" encoding=\"UTF-8\"?><!DOCTYPE PCB SYSTEM \"KonsultaData_v1.14.dtd\"><PCB pGenerated=\"true\"></PCB>";

        proxyClient.ValidateReportAsync(Arg.Any<GenerateAndValidateReportProxyRequest>(), Arg.Any<CancellationToken>())
            .Returns(ApiResponse<YakapValidationProxyResponse>.Success(
                new YakapValidationProxyResponse(
                    IsValid: true,
                    TransmittalNumber: "RHCI00092120262222",
                    RawXml: generatedXml,
                    EncryptedPayload: "ENCRYPTED_PAYLOAD_ABC",
                    PhilHealthSoapResponse: "OK",
                    ValidationErrors: [])));

        var transmittal = new YakapTransmittal
        {
            Id = Guid.NewGuid(),
            TenantId = _tenantId,
            ClinicId = _clinicId,
            TransmittalNumber = "RHCI00092120262222",
            ReportTagging = "2",
            EffectiveYear = "2026",
            Status = YakapTransmittalStatus.Draft,
            RawXmlPayload = null // not yet cached
        };
        await transmittalRepo.AddAsync(transmittal);
        await uow.SaveChangesAsync();

        var handler = new GetYakapTransmittalRawXmlQueryHandler(
            transmittalRepo, encounterRepo, patientRepo, vitalsRepo, settingsRepo,
            labOrderRepo, serviceItemRepo,
            proxyClient, uow, _clinicContext, _mapper);

        // Act
        var result = await handler.Handle(new GetYakapTransmittalRawXmlQuery(transmittal.Id), CancellationToken.None);

        // Assert
        result.Succeeded.Should().BeTrue();
        result.Data.Should().Be(generatedXml);

        var updated = (await context.YakapTransmittals.FirstOrDefaultAsync(t => t.Id == transmittal.Id))!;
        updated.RawXmlPayload.Should().Be(generatedXml);
        updated.EncryptedPayloadHash.Should().Be("ENCRYPTED_PAYLOAD_ABC");
    }
}
