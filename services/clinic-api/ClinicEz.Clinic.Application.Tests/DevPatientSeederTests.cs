using System;
using System.Linq;
using System.Threading;
using System.Threading.Tasks;
using ClinicEz.Clinic.Domain.Entities;
using ClinicEz.Clinic.Domain.Interfaces;
using ClinicEz.Clinic.Infrastructure.Persistence;
using Microsoft.EntityFrameworkCore;
using NSubstitute;
using Xunit;

namespace ClinicEz.Clinic.Application.Tests;

public class DevPatientSeederTests
{
    private readonly IClinicContext _clinicContext;

    public DevPatientSeederTests()
    {
        _clinicContext = Substitute.For<IClinicContext>();
        _clinicContext.TenantId.Returns("tenant_dev");
        _clinicContext.ClinicId.Returns(Guid.NewGuid());
    }

    [Fact]
    public async Task SeedAsync_Creates_Target_Number_Of_Patients_With_Rich_Demographics()
    {
        // Arrange
        var (context, _, _) = TestDbHelper.CreateTestContext(_clinicContext);
        var targetCount = 30;
        var options = new PatientSeedOptions
        {
            Count = targetCount,
            TenantId = "tenant_test",
            ClinicId = Guid.NewGuid(),
            BatchSize = 15
        };

        // Act
        var result = await DevPatientSeeder.SeedAsync(context, options, null, CancellationToken.None);

        // Assert
        Assert.Equal(targetCount, result.PatientsCreated);

        var patients = await context.Patients.IgnoreQueryFilters()
            .Where(p => p.ClinicId == options.ClinicId)
            .ToListAsync();

        Assert.Equal(targetCount, patients.Count);
        Assert.All(patients, p =>
        {
            Assert.False(string.IsNullOrWhiteSpace(p.PatientCode));
            Assert.StartsWith("PAT-", p.PatientCode);
            Assert.False(string.IsNullOrWhiteSpace(p.FirstName));
            Assert.False(string.IsNullOrWhiteSpace(p.LastName));
            Assert.False(string.IsNullOrWhiteSpace(p.ContactNumber));
            Assert.False(string.IsNullOrWhiteSpace(p.PhilHealthNumber));
            Assert.Contains(p.Gender, new[] { "Male", "Female", "Other" });
            Assert.False(string.IsNullOrWhiteSpace(p.BloodType));
            Assert.True(p.DateOfBirth < DateOnly.FromDateTime(DateTime.UtcNow));
            Assert.NotNull(p.CustomFields);

            var age = DateTime.UtcNow.Year - p.DateOfBirth.Year;
            if (age >= 60)
            {
                Assert.NotNull(p.SeniorCitizenId);
                Assert.StartsWith("OSCA-", p.SeniorCitizenId);
            }
        });

        // Ensure distinct patient codes
        var distinctCodes = patients.Select(p => p.PatientCode).Distinct().Count();
        Assert.Equal(targetCount, distinctCodes);
    }

    [Fact]
    public async Task SeedAsync_Generates_Encounters_Prescriptions_And_MedicalCertificates()
    {
        // Arrange
        var (context, _, _) = TestDbHelper.CreateTestContext(_clinicContext);
        var clinicId = Guid.NewGuid();
        var options = new PatientSeedOptions
        {
            Count = 20,
            TenantId = "tenant_test",
            ClinicId = clinicId,
            BatchSize = 10
        };

        // Act
        var result = await DevPatientSeeder.SeedAsync(context, options, null, CancellationToken.None);

        // Assert
        Assert.True(result.EncountersCreated > 0);
        Assert.True(result.PrescriptionsCreated > 0);
        Assert.True(result.MedicalCertificatesCreated >= 0);

        var encounters = await context.Consultations.IgnoreQueryFilters()
            .Where(c => c.ClinicId == clinicId)
            .Include(c => c.Diagnoses)
            .Include(c => c.Prescriptions)
            .ToListAsync();

        Assert.NotEmpty(encounters);
        Assert.All(encounters, enc =>
        {
            Assert.False(string.IsNullOrWhiteSpace(enc.PatientName));
            Assert.False(string.IsNullOrWhiteSpace(enc.DoctorName));
            Assert.False(string.IsNullOrWhiteSpace(enc.DoctorPrcLicense));
            Assert.False(string.IsNullOrWhiteSpace(enc.Subjective));
            Assert.False(string.IsNullOrWhiteSpace(enc.Objective));
            Assert.False(string.IsNullOrWhiteSpace(enc.Assessment));
            Assert.False(string.IsNullOrWhiteSpace(enc.Plan));
            Assert.True(enc.IsSigned);
            Assert.NotNull(enc.SignedAt);
            Assert.NotEmpty(enc.Diagnoses);
            Assert.NotEmpty(enc.Prescriptions);
            Assert.False(string.IsNullOrWhiteSpace(enc.PrescriptionNumber));
        });

        var medCerts = await context.MedicalCertificates.IgnoreQueryFilters()
            .Where(m => m.ClinicId == clinicId)
            .ToListAsync();

        if (medCerts.Count > 0)
        {
            Assert.All(medCerts, cert =>
            {
                Assert.False(string.IsNullOrWhiteSpace(cert.CertificateNumber));
                Assert.StartsWith("MC-", cert.CertificateNumber);
                Assert.False(string.IsNullOrWhiteSpace(cert.PatientName));
                Assert.False(string.IsNullOrWhiteSpace(cert.DoctorName));
                Assert.False(string.IsNullOrWhiteSpace(cert.Diagnosis));
                Assert.False(string.IsNullOrWhiteSpace(cert.FitnessStatus));
                Assert.True(cert.IsSigned);
            });
        }
    }

    [Fact]
    public async Task SeedAsync_Generates_Comprehensive_Medical_Histories()
    {
        // Arrange
        var (context, _, _) = TestDbHelper.CreateTestContext(_clinicContext);
        var clinicId = Guid.NewGuid();
        var options = new PatientSeedOptions
        {
            Count = 25,
            TenantId = "tenant_test",
            ClinicId = clinicId,
            BatchSize = 25
        };

        // Act
        var result = await DevPatientSeeder.SeedAsync(context, options, null, CancellationToken.None);

        // Assert
        Assert.True(result.PastMedicalHistoriesCreated > 0);
        Assert.True(result.FamilyHistoriesCreated > 0);
        Assert.True(result.SocialHistoriesCreated > 0);
        Assert.True(result.PhysicalExamProfilesCreated > 0);

        var pastHistories = await context.PatientPastMedicalHistories.IgnoreQueryFilters()
            .Where(h => h.ClinicId == clinicId)
            .ToListAsync();
        Assert.NotEmpty(pastHistories);
        Assert.All(pastHistories, h =>
        {
            Assert.False(string.IsNullOrWhiteSpace(h.ConditionTitle));
            Assert.False(string.IsNullOrWhiteSpace(h.Icd10Code));
        });

        var socialHistories = await context.PatientSocialHistories.IgnoreQueryFilters()
            .Where(s => s.ClinicId == clinicId)
            .ToListAsync();
        Assert.NotEmpty(socialHistories);

        var physExams = await context.PatientPhysicalExamProfiles.IgnoreQueryFilters()
            .Where(p => p.ClinicId == clinicId)
            .ToListAsync();
        Assert.Equal(options.Count, physExams.Count);
    }

    [Fact]
    public async Task SeedAsync_ClearExisting_Purges_Prior_Seeded_Patients()
    {
        // Arrange
        var (context, _, _) = TestDbHelper.CreateTestContext(_clinicContext);
        var clinicId = Guid.NewGuid();

        // Seed initial batch of 10
        await DevPatientSeeder.SeedAsync(context, new PatientSeedOptions
        {
            Count = 10,
            TenantId = "tenant_test",
            ClinicId = clinicId
        });

        var countBefore = await context.Patients.IgnoreQueryFilters().CountAsync(p => p.ClinicId == clinicId);
        Assert.Equal(10, countBefore);

        // Act: Seed 15 with ClearExisting = true
        var result = await DevPatientSeeder.SeedAsync(context, new PatientSeedOptions
        {
            Count = 15,
            TenantId = "tenant_test",
            ClinicId = clinicId,
            ClearExistingSeededPatients = true
        });

        // Assert
        Assert.Equal(15, result.PatientsCreated);
        var countAfter = await context.Patients.IgnoreQueryFilters().CountAsync(p => p.ClinicId == clinicId);
        Assert.Equal(15, countAfter);
    }
}
