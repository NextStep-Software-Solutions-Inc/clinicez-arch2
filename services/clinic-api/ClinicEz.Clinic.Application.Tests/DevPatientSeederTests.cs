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

    [Fact]
    public async Task PurgeClinicTestRecordsAsync_Removes_Test_Patients_And_Cascades_To_Child_Entities()
    {
        // Arrange
        var (context, _, _) = TestDbHelper.CreateTestContext(_clinicContext);
        var clinicId = Guid.NewGuid();

        // 1. Seed 10 test patients
        await DevPatientSeeder.SeedAsync(context, new PatientSeedOptions
        {
            Count = 10,
            TenantId = "tenant_test",
            ClinicId = clinicId
        });

        // 2. Add 1 manual real patient (not seeded)
        var realPatientId = Guid.NewGuid();
        context.Patients.Add(new ClinicPatient
        {
            Id = realPatientId,
            TenantId = "tenant_test",
            ClinicId = clinicId,
            PatientCode = "REG-2026-00001",
            FirstName = "Maria",
            LastName = "Santos",
            ContactNumber = "0917-123-4567",
            DateOfBirth = new DateOnly(1990, 1, 1),
            Gender = "Female",
            CreatedBy = "staff-user-123"
        });
        await context.SaveChangesAsync();

        // Act: Purge with purgeAll = false
        var cleared = await DevPatientSeeder.PurgeClinicTestRecordsAsync(context, clinicId, "tenant_test", purgeAll: false);

        // Assert
        Assert.Equal(10, cleared);

        var remainingPatients = await context.Patients.IgnoreQueryFilters().Where(p => p.ClinicId == clinicId).ToListAsync();
        Assert.Single(remainingPatients);
        Assert.Equal(realPatientId, remainingPatients[0].Id);

        // All child entities for seeded patients must have been purged
        var remainingEncounters = await context.Consultations.IgnoreQueryFilters().Where(c => c.ClinicId == clinicId).ToListAsync();
        Assert.Empty(remainingEncounters);

        var remainingCerts = await context.MedicalCertificates.IgnoreQueryFilters().Where(c => c.ClinicId == clinicId).ToListAsync();
        Assert.Empty(remainingCerts);
    }

    [Fact]
    public async Task PurgeClinicTestRecordsAsync_With_PurgeAll_Clears_All_Clinic_Records()
    {
        // Arrange
        var (context, _, _) = TestDbHelper.CreateTestContext(_clinicContext);
        var clinicId = Guid.NewGuid();

        // Seed 5 test patients
        await DevPatientSeeder.SeedAsync(context, new PatientSeedOptions
        {
            Count = 5,
            TenantId = "tenant_test",
            ClinicId = clinicId
        });

        // Add 1 manual patient with a different prefix and creator
        context.Patients.Add(new ClinicPatient
        {
            Id = Guid.NewGuid(),
            TenantId = "tenant_test",
            ClinicId = clinicId,
            PatientCode = "CUSTOM-999",
            FirstName = "Juan",
            LastName = "Dela Cruz",
            ContactNumber = "0918-987-6543",
            DateOfBirth = new DateOnly(1985, 5, 20),
            Gender = "Male",
            CreatedBy = "admin"
        });
        await context.SaveChangesAsync();

        // Act: Purge with purgeAll = true
        var cleared = await DevPatientSeeder.PurgeClinicTestRecordsAsync(context, clinicId, "tenant_test", purgeAll: true);

        // Assert: All 6 patients removed
        Assert.Equal(6, cleared);

        var remainingPatients = await context.Patients.IgnoreQueryFilters().Where(p => p.ClinicId == clinicId).CountAsync();
        Assert.Equal(0, remainingPatients);

        var remainingEncounters = await context.Consultations.IgnoreQueryFilters().Where(c => c.ClinicId == clinicId).CountAsync();
        Assert.Equal(0, remainingEncounters);

        var remainingCerts = await context.MedicalCertificates.IgnoreQueryFilters().Where(c => c.ClinicId == clinicId).CountAsync();
        Assert.Equal(0, remainingCerts);
    }

    [Fact]
    public async Task SeedAsync_Generates_Unique_Certificate_And_Prescription_Numbers()
    {
        // Arrange
        var (context, _, _) = TestDbHelper.CreateTestContext(_clinicContext);
        var clinicId = Guid.NewGuid();

        // Act: Seed 50 patients (generates dozens of certs and prescriptions)
        var result = await DevPatientSeeder.SeedAsync(context, new PatientSeedOptions
        {
            Count = 50,
            TenantId = "tenant_test",
            ClinicId = clinicId
        });

        // Assert
        var certNumbers = await context.MedicalCertificates.IgnoreQueryFilters()
            .Where(m => m.ClinicId == clinicId)
            .Select(m => m.CertificateNumber)
            .ToListAsync();

        Assert.Equal(certNumbers.Count, certNumbers.Distinct().Count());

        var rxNumbers = await context.Consultations.IgnoreQueryFilters()
            .Where(c => c.ClinicId == clinicId && c.PrescriptionNumber != null)
            .Select(c => c.PrescriptionNumber!)
            .ToListAsync();

        Assert.Equal(rxNumbers.Count, rxNumbers.Distinct().Count());
    }
}
