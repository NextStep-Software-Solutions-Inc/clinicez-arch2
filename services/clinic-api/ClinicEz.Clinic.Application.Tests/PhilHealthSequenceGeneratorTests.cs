using System;
using System.Threading.Tasks;
using ClinicEz.Clinic.Domain.Entities;
using ClinicEz.Clinic.Domain.Interfaces;
using ClinicEz.Clinic.Infrastructure.Services;
using FluentAssertions;
using Microsoft.Extensions.Logging.Abstractions;
using NSubstitute;
using Xunit;

namespace ClinicEz.Clinic.Application.Tests;

public sealed class PhilHealthSequenceGeneratorTests
{
    private readonly Guid _clinicId = Guid.NewGuid();
    private readonly string _tenantId = "tenant_seq_test";
    private readonly IClinicContext _clinicContext;
    private readonly PhilHealthSequenceGenerator _generator;
    private readonly Infrastructure.Persistence.ApplicationDbContext _dbContext;

    public PhilHealthSequenceGeneratorTests()
    {
        _clinicContext = Substitute.For<IClinicContext>();
        _clinicContext.ClinicId.Returns(_clinicId);
        _clinicContext.TenantId.Returns(_tenantId);

        var (context, _, _) = TestDbHelper.CreateTestContext(_clinicContext);
        _dbContext = context;

        _generator = new PhilHealthSequenceGenerator(_dbContext, NullLogger<PhilHealthSequenceGenerator>.Instance);
    }

    [Fact]
    public async Task GenerateCaseNumberAsync_IncrementsSequentially()
    {
        var case1 = await _generator.GenerateCaseNumberAsync(_tenantId, _clinicId, "HCI-NCR-00921", "2026");
        var case2 = await _generator.GenerateCaseNumberAsync(_tenantId, _clinicId, "HCI-NCR-00921", "2026");

        case1.Should().Be("C000921202600001");
        case2.Should().Be("C000921202600002");
    }

    [Fact]
    public async Task GenerateTransactionNumberAsync_UsesCorrectPrefixPerType()
    {
        var enlist = await _generator.GenerateTransactionNumberAsync(_tenantId, _clinicId, PhilHealthSequenceType.Enlistment, "HCI-NCR-00921", "2026");
        var prof = await _generator.GenerateTransactionNumberAsync(_tenantId, _clinicId, PhilHealthSequenceType.Profiling, "HCI-NCR-00921", "2026");
        var soap = await _generator.GenerateTransactionNumberAsync(_tenantId, _clinicId, PhilHealthSequenceType.Soap, "HCI-NCR-00921", "2026");
        var med = await _generator.GenerateTransactionNumberAsync(_tenantId, _clinicId, PhilHealthSequenceType.Medicine, "HCI-NCR-00921", "2026");
        var trans = await _generator.GenerateTransmittalNumberAsync(_tenantId, _clinicId, "HCI-NCR-00921", "2026");

        enlist.Should().StartWith("E0009212026");
        prof.Should().StartWith("P0009212026");
        soap.Should().StartWith("S0009212026");
        med.Should().StartWith("M0009212026");
        trans.Should().StartWith("R0009212026");
    }

    [Fact]
    public async Task AssignPatientJourneyNumbersAsync_AssignsAndPersistsNumbersOnPatientAndEncounter()
    {
        var patient = new ClinicPatient
        {
            Id = Guid.NewGuid(),
            TenantId = _tenantId,
            ClinicId = _clinicId,
            PatientCode = "PAT-2026-00001",
            FirstName = "Juan",
            LastName = "Dela Cruz",
            ContactNumber = "09171234567",
            PhilHealthNumber = "030263078507",
            DateOfBirth = new DateOnly(1985, 5, 15)
        };
        _dbContext.Patients.Add(patient);

        var encounter = new ConsultationEncounter
        {
            Id = Guid.NewGuid(),
            TenantId = _tenantId,
            ClinicId = _clinicId,
            PatientId = patient.Id,
            PatientName = "Juan Dela Cruz",
            DoctorId = Guid.NewGuid(),
            DoctorName = "Dr. Rizal"
        };
        _dbContext.Consultations.Add(encounter);
        await _dbContext.SaveChangesAsync();

        var result = await _generator.AssignPatientJourneyNumbersAsync(
            _tenantId, _clinicId, patient.Id, encounter.Id, "HCI-NCR-00921", "2026");

        result.Should().NotBeNull();
        result.CaseNumber.Should().Be("C000921202600001");
        result.EnlistmentTransactionNumber.Should().Be("E000921202600001");
        result.ProfilingTransactionNumber.Should().Be("P000921202600001");
        result.SoapTransactionNumber.Should().Be("S000921202600001");

        // Verify persisted on entities in DB
        patient.PhilHealthCaseNo.Should().Be("C000921202600001");
        patient.PhilHealthEnlistmentNo.Should().Be("E000921202600001");
        patient.PhilHealthProfilingTransNo.Should().Be("P000921202600001");
        encounter.PhilHealthCaseNo.Should().Be("C000921202600001");
        encounter.PhilHealthSoapTransNo.Should().Be("S000921202600001");

        // Calling again does not overwrite existing numbers
        var result2 = await _generator.AssignPatientJourneyNumbersAsync(
            _tenantId, _clinicId, patient.Id, encounter.Id, "HCI-NCR-00921", "2026");

        result2.CaseNumber.Should().Be("C000921202600001");
        result2.EnlistmentTransactionNumber.Should().Be("E000921202600001");
    }
}
