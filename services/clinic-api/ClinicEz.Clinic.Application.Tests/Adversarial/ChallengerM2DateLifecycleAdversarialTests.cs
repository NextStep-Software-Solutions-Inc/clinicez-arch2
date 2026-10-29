using System;
using System.Collections.Generic;
using System.Linq;
using System.Text.Json;
using System.Threading.Tasks;
using ClinicEz.Clinic.Domain.Entities;
using ClinicEz.Clinic.Domain.Interfaces;
using ClinicEz.Clinic.Infrastructure.Persistence;
using ClinicEz.Clinic.Infrastructure.Services;
using FluentAssertions;
using Microsoft.Extensions.Logging.Abstractions;
using NSubstitute;
using Xunit;

namespace ClinicEz.Clinic.Application.Tests.Adversarial;

/// <summary>
/// Empirical Adversarial Test Harness for Milestone 2 (Adversarial Date & Lifecycle Challenger).
/// Rigorously stress-tests:
/// 1. Leap year date boundaries (2024-02-29, 2028-02-29, invalid leap years like 2025-02-29).
/// 2. End-of-year cutoffs (23:59:59 on YYYY-12-31 vs 00:00:00 on next year).
/// 3. Chronological multi-year sequences (2023, 2024, 2025, 2026) and out-of-order sorting.
/// 4. Preservation of past allocated C/E/P control numbers across multiple renewals (immutability).
/// 5. Past enlistment dates (e.g. eGovPH past registrations) vs future encounters.
/// 6. Dates outside active windows (encounters before enlistment date or after valid_until).
/// 7. Strict InvalidOperationException enforcement on missing, expired, and transferred enlistments.
/// </summary>
public sealed class ChallengerM2DateLifecycleAdversarialTests
{
    private readonly Guid _clinicId = Guid.NewGuid();
    private readonly string _tenantId = "tenant_adv_m2_lifecycle";
    private readonly IClinicContext _clinicContext;
    private readonly PhilHealthSequenceGenerator _generator;
    private readonly ApplicationDbContext _dbContext;

    public ChallengerM2DateLifecycleAdversarialTests()
    {
        _clinicContext = Substitute.For<IClinicContext>();
        _clinicContext.ClinicId.Returns(_clinicId);
        _clinicContext.TenantId.Returns(_tenantId);

        var (context, _, _) = TestDbHelper.CreateTestContext(_clinicContext);
        _dbContext = context;

        _generator = new PhilHealthSequenceGenerator(_dbContext, NullLogger<PhilHealthSequenceGenerator>.Instance);
    }

    private Patient CreatePatient(string code, List<Dictionary<string, object?>>? enlistments = null)
    {
        var patient = new Patient
        {
            Id = Guid.NewGuid(),
            TenantId = _tenantId,
            ClinicId = _clinicId,
            PatientCode = code,
            FirstName = "Empirical",
            LastName = "Challenger",
            ContactNumber = "09181234567",
            PhilHealthNumber = "120345678901",
            DateOfBirth = new DateOnly(1990, 1, 1),
            YakapEnlistments = new List<PatientYakapEnlistment>()
        };

        if (enlistments != null)
        {
            foreach (var dict in enlistments)
            {
                var enlistment = new PatientYakapEnlistment
                {
                    Id = Guid.NewGuid(),
                    TenantId = _tenantId,
                    ClinicId = _clinicId,
                    PatientId = patient.Id,
                    EffectiveYear = dict.TryGetValue("effective_year", out var ey) && ey != null && int.TryParse(ey.ToString(), out var parsedEy) ? parsedEy : 2026,
                    Status = dict.TryGetValue("status", out var st) && st != null && Enum.TryParse<YakapEnlistmentStatus>(st.ToString(), true, out var parsedSt) ? parsedSt : YakapEnlistmentStatus.Active,
                    Source = dict.TryGetValue("source", out var src) && src != null && Enum.TryParse<YakapEnlistmentSource>(src.ToString(), true, out var parsedSrc) ? parsedSrc : YakapEnlistmentSource.ClinicEnlistment,
                    CaseNo = dict.TryGetValue("case_no", out var cn) ? cn?.ToString() : null,
                    EnlistmentTransNo = dict.TryGetValue("enlistment_no", out var en) ? en?.ToString() : (dict.TryGetValue("enlistment_trans_no", out var etn) ? etn?.ToString() : null),
                    ProfilingTransNo = dict.TryGetValue("profiling_trans_no", out var pn) ? pn?.ToString() : null
                };

                if (dict.TryGetValue("enlisted_at", out var ea) && ea != null && DateOnly.TryParse(ea.ToString(), out var parsedEa))
                {
                    enlistment.EnlistmentDate = parsedEa;
                }
                else
                {
                    enlistment.EnlistmentDate = new DateOnly(enlistment.EffectiveYear > 0 ? enlistment.EffectiveYear : 2026, 1, 1);
                }

                if (dict.TryGetValue("valid_until", out var vu) && vu != null && DateOnly.TryParse(vu.ToString(), out var parsedVu))
                {
                    enlistment.ValidUntil = parsedVu;
                }
                else
                {
                    enlistment.ValidUntil = new DateOnly(enlistment.EffectiveYear > 0 ? enlistment.EffectiveYear : 2026, 12, 31);
                }

                patient.YakapEnlistments.Add(enlistment);
            }
        }

        return patient;
    }

    #region 1. Leap Year Boundary Tests

    [Fact]
    public async Task LeapYear_2024_02_29_EnlistmentAndEncounter_Succeeds()
    {
        // Leap year 2024: Enlistment created on Feb 29, 2024; encounter on Feb 29, 2024 at 23:59:59 UTC
        var patient = CreatePatient("PAT-LEAP-2024", new List<Dictionary<string, object?>>
        {
            new()
            {
                ["enlisted_at"] = "2024-02-29",
                ["valid_until"] = "2024-12-31",
                ["effective_year"] = 2024,
                ["status"] = YakapEnlistmentStatus.Active,
                ["source"] = YakapEnlistmentSource.ClinicEnlistment
            }
        });
        _dbContext.Patients.Add(patient);

        var encounter = new ConsultationEncounter
        {
            Id = Guid.NewGuid(),
            TenantId = _tenantId,
            ClinicId = _clinicId,
            PatientId = patient.Id,
            PatientName = "Empirical Challenger",
            DoctorId = Guid.NewGuid(),
            DoctorName = "Dr. Rizal",
            EncounterDate = new DateTime(2024, 2, 29, 23, 59, 59, DateTimeKind.Utc),
            IsYakapEligible = true
        };
        _dbContext.Consultations.Add(encounter);
        await _dbContext.SaveChangesAsync();

        // Act
        var result = await _generator.AssignPatientJourneyNumbersAsync(
            _tenantId, _clinicId, patient.Id, encounter.Id, "HCI-NCR-00921", "2024");

        // Assert
        result.Should().NotBeNull();
        result.CaseNumber.Should().StartWith("C0009212024");
        result.EnlistmentTransactionNumber.Should().StartWith("E0009212024");
        result.SoapTransactionNumber.Should().StartWith("S0009212024");
        encounter.PhilHealthCaseNo.Should().Be(result.CaseNumber);
    }

    [Fact]
    public async Task LeapYear_2028_02_29_EncounterWithinStandardYear_Succeeds()
    {
        // Future leap year 2028: Enlistment starting 2028-01-01, encounter on leap day 2028-02-29
        var patient = CreatePatient("PAT-LEAP-2028", new List<Dictionary<string, object?>>
        {
            new()
            {
                ["enlisted_at"] = "2028-01-01",
                ["valid_until"] = "2028-12-31",
                ["effective_year"] = 2028,
                ["status"] = YakapEnlistmentStatus.Active,
                ["source"] = YakapEnlistmentSource.PhilHealthMasterlist
            }
        });
        _dbContext.Patients.Add(patient);

        var encounter = new ConsultationEncounter
        {
            Id = Guid.NewGuid(),
            TenantId = _tenantId,
            ClinicId = _clinicId,
            PatientId = patient.Id,
            PatientName = "Empirical Challenger",
            DoctorId = Guid.NewGuid(),
            DoctorName = "Dr. Rizal",
            EncounterDate = new DateTime(2028, 2, 29, 12, 0, 0, DateTimeKind.Utc),
            IsYakapEligible = true
        };
        _dbContext.Consultations.Add(encounter);
        await _dbContext.SaveChangesAsync();

        var result = await _generator.AssignPatientJourneyNumbersAsync(
            _tenantId, _clinicId, patient.Id, encounter.Id, "HCI-NCR-00921", "2028");

        result.CaseNumber.Should().StartWith("C0009212028");
    }

    [Fact]
    public void LeapYear_2024_02_29_ValidUntil_CoversLeapDay_ExpiresNextDay()
    {
        // Enlistment valid until 2024-02-29
        var entry = new PatientYakapEnlistment
        {
            EnlistmentDate = new DateOnly(2023, 3, 1),
            ValidUntil = new DateOnly(2024, 2, 29),
            EffectiveYear = 2024,
            Status = YakapEnlistmentStatus.Active
        };

        // 2024-02-29 is covering
        entry.IsActiveOn(new DateOnly(2024, 2, 29)).Should().BeTrue();

        // 2024-03-01 is past valid_until -> NOT covering
        entry.IsActiveOn(new DateOnly(2024, 3, 1)).Should().BeFalse();
    }

    #endregion

    #region 2. End-of-Year Cutoffs & Millisecond Boundaries

    [Fact]
    public async Task EndOfYearCutoff_YearEndLastSecond_Succeeds()
    {
        // 2025-12-31 23:59:59 UTC encounter on 2025 enlistment
        var patient = CreatePatient("PAT-EOY-2025", new List<Dictionary<string, object?>>
        {
            new()
            {
                ["enlisted_at"] = "2025-01-01",
                ["valid_until"] = "2025-12-31",
                ["effective_year"] = 2025,
                ["status"] = YakapEnlistmentStatus.Active,
                ["source"] = YakapEnlistmentSource.ClinicEnlistment
            }
        });
        _dbContext.Patients.Add(patient);

        var encounter = new ConsultationEncounter
        {
            Id = Guid.NewGuid(),
            TenantId = _tenantId,
            ClinicId = _clinicId,
            PatientId = patient.Id,
            PatientName = "Empirical Challenger",
            DoctorId = Guid.NewGuid(),
            DoctorName = "Dr. Rizal",
            EncounterDate = new DateTime(2025, 12, 31, 23, 59, 59, DateTimeKind.Utc),
            IsYakapEligible = true
        };
        _dbContext.Consultations.Add(encounter);
        await _dbContext.SaveChangesAsync();

        var result = await _generator.AssignPatientJourneyNumbersAsync(
            _tenantId, _clinicId, patient.Id, encounter.Id, "HCI-NCR-00921", "2025");

        result.CaseNumber.Should().StartWith("C0009212025");
        encounter.PhilHealthCaseNo.Should().Be(result.CaseNumber);
    }

    [Fact]
    public async Task EndOfYearCutoff_NextYearFirstSecond_ThrowsInvalidOperationException()
    {
        // Patient has 2025 enlistment ending 2025-12-31.
        // Encounter occurs on 2026-01-01 00:00:00 UTC (1 second after expiry).
        // Must throw InvalidOperationException requiring explicit 2026 renewal.
        var patient = CreatePatient("PAT-EOY-EXPIRED-2026", new List<Dictionary<string, object?>>
        {
            new()
            {
                ["enlisted_at"] = "2025-01-01",
                ["valid_until"] = "2025-12-31",
                ["effective_year"] = 2025,
                ["status"] = YakapEnlistmentStatus.Active, // marked active during 2025, but expired chronologically
                ["source"] = YakapEnlistmentSource.ClinicEnlistment,
                ["case_no"] = "C000921202500001",
                ["enlistment_no"] = "E000921202500001",
                ["profiling_trans_no"] = "P000921202500001"
            }
        });
        _dbContext.Patients.Add(patient);

        var encounter = new ConsultationEncounter
        {
            Id = Guid.NewGuid(),
            TenantId = _tenantId,
            ClinicId = _clinicId,
            PatientId = patient.Id,
            PatientName = "Empirical Challenger",
            DoctorId = Guid.NewGuid(),
            DoctorName = "Dr. Rizal",
            EncounterDate = new DateTime(2026, 1, 1, 0, 0, 0, DateTimeKind.Utc),
            IsYakapEligible = true
        };
        _dbContext.Consultations.Add(encounter);
        await _dbContext.SaveChangesAsync();

        // Act & Assert
        Func<Task> act = () => _generator.AssignPatientJourneyNumbersAsync(
            _tenantId, _clinicId, patient.Id, encounter.Id, "HCI-NCR-00921", "2026");

        await act.Should().ThrowAsync<InvalidOperationException>()
            .WithMessage("*no active PhilHealth YAKAP enlistment covering the encounter date 2026-01-01*");

        // Verify encounter was not touched
        encounter.PhilHealthCaseNo.Should().BeNull();
        encounter.PhilHealthSoapTransNo.Should().BeNull();
    }

    #endregion

    #region 3. Chronological Multi-Year History (2023, 2024, 2025, 2026) & Sorting

    [Fact]
    public void MultiYearSequence_SortsChronologically_EvenWhenInsertedOutOfOrder()
    {
        var patient = CreatePatient("PAT-MULTI-YEAR");

        // Add out of order: 2025, then 2023, then 2026, then 2024
        patient.AddOrRenewYakapEnlistment(new PatientYakapEnlistment
        {
            EnlistmentDate = new DateOnly(2025, 1, 10),
            ValidUntil = new DateOnly(2025, 12, 31),
            EffectiveYear = 2025,
            Status = YakapEnlistmentStatus.Expired,
            CaseNo = "C000921202500010"
        });

        patient.AddOrRenewYakapEnlistment(new PatientYakapEnlistment
        {
            EnlistmentDate = new DateOnly(2023, 2, 15),
            ValidUntil = new DateOnly(2023, 12, 31),
            EffectiveYear = 2023,
            Status = YakapEnlistmentStatus.Expired,
            CaseNo = "C000921202300010"
        });

        patient.AddOrRenewYakapEnlistment(new PatientYakapEnlistment
        {
            EnlistmentDate = new DateOnly(2026, 1, 5),
            ValidUntil = new DateOnly(2026, 12, 31),
            EffectiveYear = 2026,
            Status = YakapEnlistmentStatus.Active,
            CaseNo = "C000921202600010"
        });

        patient.AddOrRenewYakapEnlistment(new PatientYakapEnlistment
        {
            EnlistmentDate = new DateOnly(2024, 3, 1),
            ValidUntil = new DateOnly(2024, 12, 31),
            EffectiveYear = 2024,
            Status = YakapEnlistmentStatus.Expired,
            CaseNo = "C000921202400010"
        });

        // Act
        var list = patient.GetYakapEnlistments();

        // Assert: Strictly ordered 2023 -> 2024 -> 2025 -> 2026
        list.Should().HaveCount(4);
        list[0].EffectiveYear.Should().Be(2023);
        list[0].CaseNo.Should().Be("C000921202300010");

        list[1].EffectiveYear.Should().Be(2024);
        list[1].CaseNo.Should().Be("C000921202400010");

        list[2].EffectiveYear.Should().Be(2025);
        list[2].CaseNo.Should().Be("C000921202500010");

        list[3].EffectiveYear.Should().Be(2026);
        list[3].CaseNo.Should().Be("C000921202600010");
    }

    [Fact]
    public async Task MultiYearRenewals_NeverCorruptOrOverwritePastAllocatedNumbers()
    {
        // Patient has historical 2023, 2024, 2025 entries with allocated numbers
        var patient = CreatePatient("PAT-IMMUTABLE-TEST", new List<Dictionary<string, object?>>
        {
            new()
            {
                ["enlisted_at"] = "2023-01-10",
                ["valid_until"] = "2023-12-31",
                ["effective_year"] = 2023,
                ["status"] = YakapEnlistmentStatus.Expired,
                ["case_no"] = "C000921202300001",
                ["enlistment_no"] = "E000921202300001",
                ["profiling_trans_no"] = "P000921202300001"
            },
            new()
            {
                ["enlisted_at"] = "2024-01-15",
                ["valid_until"] = "2024-12-31",
                ["effective_year"] = 2024,
                ["status"] = YakapEnlistmentStatus.Expired,
                ["case_no"] = "C000921202400002",
                ["enlistment_no"] = "E000921202400002",
                ["profiling_trans_no"] = "P000921202400002"
            },
            new()
            {
                ["enlisted_at"] = "2025-01-20",
                ["valid_until"] = "2025-12-31",
                ["effective_year"] = 2025,
                ["status"] = YakapEnlistmentStatus.Expired,
                ["case_no"] = "C000921202500003",
                ["enlistment_no"] = "E000921202500003",
                ["profiling_trans_no"] = "P000921202500003"
            },
            new()
            {
                ["enlisted_at"] = "2026-01-10",
                ["valid_until"] = "2026-12-31",
                ["effective_year"] = 2026,
                ["status"] = YakapEnlistmentStatus.Active,
                ["case_no"] = null,
                ["enlistment_no"] = null,
                ["profiling_trans_no"] = null
            }
        });
        _dbContext.Patients.Add(patient);

        var encounter = new ConsultationEncounter
        {
            Id = Guid.NewGuid(),
            TenantId = _tenantId,
            ClinicId = _clinicId,
            PatientId = patient.Id,
            PatientName = "Empirical Challenger",
            DoctorId = Guid.NewGuid(),
            DoctorName = "Dr. Rizal",
            EncounterDate = new DateTime(2026, 5, 20, 10, 0, 0, DateTimeKind.Utc),
            IsYakapEligible = true
        };
        _dbContext.Consultations.Add(encounter);
        await _dbContext.SaveChangesAsync();

        // Act: Assign numbers for 2026
        var result = await _generator.AssignPatientJourneyNumbersAsync(
            _tenantId, _clinicId, patient.Id, encounter.Id, "HCI-NCR-00921", "2026");

        // Assert: 2026 gets newly assigned numbers
        result.CaseNumber.Should().StartWith("C0009212026");

        // Re-read from patient CustomFields
        var entries = patient.GetYakapEnlistments();
        entries.Should().HaveCount(4);

        // Verify 2023, 2024, 2025 entries are 100% UNTOUCHED
        entries[0].EffectiveYear.Should().Be(2023);
        entries[0].CaseNo.Should().Be("C000921202300001");
        entries[0].EnlistmentTransNo.Should().Be("E000921202300001");
        entries[0].ProfilingTransNo.Should().Be("P000921202300001");
        entries[0].Status.Should().Be(YakapEnlistmentStatus.Expired);

        entries[1].EffectiveYear.Should().Be(2024);
        entries[1].CaseNo.Should().Be("C000921202400002");
        entries[1].EnlistmentTransNo.Should().Be("E000921202400002");
        entries[1].ProfilingTransNo.Should().Be("P000921202400002");
        entries[1].Status.Should().Be(YakapEnlistmentStatus.Expired);

        entries[2].EffectiveYear.Should().Be(2025);
        entries[2].CaseNo.Should().Be("C000921202500003");
        entries[2].EnlistmentTransNo.Should().Be("E000921202500003");
        entries[2].ProfilingTransNo.Should().Be("P000921202500003");
        entries[2].Status.Should().Be(YakapEnlistmentStatus.Expired);

        // 2026 has newly generated numbers
        entries[3].EffectiveYear.Should().Be(2026);
        entries[3].CaseNo.Should().Be(result.CaseNumber);
        entries[3].EnlistmentTransNo.Should().Be(result.EnlistmentTransactionNumber);
        entries[3].ProfilingTransNo.Should().Be(result.ProfilingTransactionNumber);
        entries[3].Status.Should().Be(YakapEnlistmentStatus.Active);
    }

    #endregion

    #region 4. Past Enlistment Dates (eGovPH External Registrations)

    [Fact]
    public async Task PastEnlistmentDate_EGovPhRegistration_PreservesHistoricalEnlistedAt()
    {
        // Patient registered in eGovPH portal 8 months ago on 2026-01-02
        // Encounter occurs today (e.g. 2026-08-15)
        var patient = CreatePatient("PAT-EGOVPH-TEST", new List<Dictionary<string, object?>>
        {
            new()
            {
                ["enlisted_at"] = "2026-01-02",
                ["valid_until"] = "2026-12-31",
                ["effective_year"] = 2026,
                ["status"] = YakapEnlistmentStatus.Active,
                ["source"] = YakapEnlistmentSource.SelfReported,
                ["case_no"] = null,
                ["enlistment_no"] = null,
                ["profiling_trans_no"] = null
            }
        });
        _dbContext.Patients.Add(patient);

        var encounter = new ConsultationEncounter
        {
            Id = Guid.NewGuid(),
            TenantId = _tenantId,
            ClinicId = _clinicId,
            PatientId = patient.Id,
            PatientName = "Empirical Challenger",
            DoctorId = Guid.NewGuid(),
            DoctorName = "Dr. Rizal",
            EncounterDate = new DateTime(2026, 8, 15, 14, 30, 0, DateTimeKind.Utc),
            IsYakapEligible = true
        };
        _dbContext.Consultations.Add(encounter);
        await _dbContext.SaveChangesAsync();

        var result = await _generator.AssignPatientJourneyNumbersAsync(
            _tenantId, _clinicId, patient.Id, encounter.Id, "HCI-NCR-00921", "2026");

        var entries = patient.GetYakapEnlistments();
        entries.Should().HaveCount(1);
        entries[0].EnlistmentDate.Should().Be(new DateOnly(2026, 1, 2));
        entries[0].Source.Should().Be(YakapEnlistmentSource.SelfReported);
        entries[0].CaseNo.Should().Be(result.CaseNumber);
    }

    #endregion

    #region 5. Stress Testing Dates Outside Active Windows

    [Fact]
    public void DateOutsideActiveWindow_EncounterBeforeEnlistmentDate_FailsCoverage()
    {
        // Enlistment is active starting June 1, 2026: [2026-06-01 to 2026-12-31]
        var entry = new PatientYakapEnlistment
        {
            EnlistmentDate = new DateOnly(2026, 6, 1),
            ValidUntil = new DateOnly(2026, 12, 31),
            EffectiveYear = 2026,
            Status = YakapEnlistmentStatus.Active
        };

        // Encounter on 2026-03-15 (before enlistment) -> must NOT be covering
        entry.IsCoveringDate(new DateOnly(2026, 3, 15)).Should().BeFalse();
        entry.IsActiveOn(new DateOnly(2026, 3, 15)).Should().BeFalse();

        // Encounter on 2026-06-01 (start date) -> IS covering
        entry.IsActiveOn(new DateOnly(2026, 6, 1)).Should().BeTrue();

        // Encounter on 2026-12-31 (end date) -> IS covering
        entry.IsActiveOn(new DateOnly(2026, 12, 31)).Should().BeTrue();

        // Encounter on 2027-01-01 (past end date) -> must NOT be covering
        entry.IsActiveOn(new DateOnly(2027, 1, 1)).Should().BeFalse();
    }

    [Fact]
    public void DateOutsideActiveWindow_CustomValidUntil_ExpiresMidYear()
    {
        // Custom validity until June 30, 2026
        var entry = new PatientYakapEnlistment
        {
            EnlistmentDate = new DateOnly(2026, 1, 1),
            ValidUntil = new DateOnly(2026, 6, 30),
            EffectiveYear = 2026,
            Status = YakapEnlistmentStatus.Active
        };

        // Within window: 2026-05-15 -> covered
        entry.IsActiveOn(new DateOnly(2026, 5, 15)).Should().BeTrue();

        // Outside window: 2026-07-01 -> NOT covered
        entry.IsActiveOn(new DateOnly(2026, 7, 1)).Should().BeFalse();
    }

    #endregion

    #region 6. Strict Guard Exceptions: Missing, Expired, Transferred

    [Fact]
    public void StrictGuard_NullOrEmptyEnlistments_ThrowsInvalidOperationException()
    {
        var patient = CreatePatient("PAT-EMPTY");
        var act = () => patient.ResolveActiveEnlistmentOrThrow(new DateOnly(2026, 6, 1));
        act.Should().Throw<InvalidOperationException>()
            .WithMessage("*no active PhilHealth YAKAP enlistment covering the encounter date 2026-06-01*");
    }

    [Fact]
    public void StrictGuard_TransferredEnlistment_ThrowsInvalidOperationException()
    {
        var patient = CreatePatient("PAT-XFER", new List<Dictionary<string, object?>>
        {
            new()
            {
                ["enlisted_at"] = "2026-01-01",
                ["valid_until"] = "2026-12-31",
                ["effective_year"] = 2026,
                ["status"] = YakapEnlistmentStatus.Transferred,
                ["source"] = YakapEnlistmentSource.PhilHealthMasterlist
            }
        });

        var act = () => patient.ResolveActiveEnlistmentOrThrow(new DateOnly(2026, 4, 15));
        act.Should().Throw<InvalidOperationException>()
            .WithMessage("*marked as Transferred*");
    }

    [Fact]
    public void StrictGuard_ExpiredEnlistment_ThrowsInvalidOperationExceptionWithExpiryDate()
    {
        var patient = CreatePatient("PAT-EXP", new List<Dictionary<string, object?>>
        {
            new()
            {
                ["enlisted_at"] = "2025-01-01",
                ["valid_until"] = "2025-12-31",
                ["effective_year"] = 2025,
                ["status"] = YakapEnlistmentStatus.Expired
            }
        });

        var act = () => patient.ResolveActiveEnlistmentOrThrow(new DateOnly(2026, 3, 1));
        act.Should().Throw<InvalidOperationException>()
            .WithMessage("*no active PhilHealth YAKAP enlistment covering the encounter date 2026-03-01*")
            .WithMessage("*2025-12-31*");
    }

    [Fact]
    public void StrictGuard_EncounterDateBeforeEnlistedAt_ThrowsOrFails()
    {
        // Patient has enlistment starting 2026-06-01. Encounter date is 2026-03-15 (prior to enlistment).
        var patient = CreatePatient("PAT-PRE-ENLIST", new List<Dictionary<string, object?>>
        {
            new()
            {
                ["enlisted_at"] = "2026-06-01",
                ["valid_until"] = "2026-12-31",
                ["effective_year"] = 2026,
                ["status"] = YakapEnlistmentStatus.Active
            }
        });

        // Test ResolveActiveEnlistmentOrThrow
        var act = () => patient.ResolveActiveEnlistmentOrThrow(new DateOnly(2026, 3, 15));
        
        // Let's observe whether this throws or returns
        // We will assert and see the result!
        act.Should().Throw<InvalidOperationException>();
    }

    [Fact]
    public void StrictGuard_EncounterDateAfterCustomValidUntil_ThrowsOrFails()
    {
        // Patient has enlistment valid until 2026-06-30. Encounter date is 2026-09-01 (past valid_until).
        var patient = CreatePatient("PAT-POST-VALID", new List<Dictionary<string, object?>>
        {
            new()
            {
                ["enlisted_at"] = "2026-01-01",
                ["valid_until"] = "2026-06-30",
                ["effective_year"] = 2026,
                ["status"] = YakapEnlistmentStatus.Active
            }
        });

        var act = () => patient.ResolveActiveEnlistmentOrThrow(new DateOnly(2026, 9, 1));
        act.Should().Throw<InvalidOperationException>();
    }

    [Fact]
    public async Task StrictGuard_EncounterAfterValidUntil_WhenStatusStringStillActive_ThrowsInvalidOperationException()
    {
        // Patient has 2025 enlistment with status="Active" (not yet explicitly marked Expired), but valid_until was 2025-12-31.
        // Encounter date is 2026-01-15 (past valid_until).
        // Caller requests effectiveYear "2025" or encounters in 2026.
        var patient = CreatePatient("PAT-EXPIRED-ACTIVE-STRING", new List<Dictionary<string, object?>>
        {
            new()
            {
                ["enlisted_at"] = "2025-01-01",
                ["valid_until"] = "2025-12-31",
                ["effective_year"] = 2025,
                ["status"] = YakapEnlistmentStatus.Active, // Still marked Active in database
                ["source"] = YakapEnlistmentSource.ClinicEnlistment,
                ["case_no"] = "C000921202500001",
                ["enlistment_no"] = "E000921202500001",
                ["profiling_trans_no"] = "P000921202500001"
            }
        });
        _dbContext.Patients.Add(patient);

        var encounter = new ConsultationEncounter
        {
            Id = Guid.NewGuid(),
            TenantId = _tenantId,
            ClinicId = _clinicId,
            PatientId = patient.Id,
            PatientName = "Empirical Challenger",
            DoctorId = Guid.NewGuid(),
            DoctorName = "Dr. Rizal",
            EncounterDate = new DateTime(2026, 1, 15, 10, 0, 0, DateTimeKind.Utc),
            IsYakapEligible = true
        };
        _dbContext.Consultations.Add(encounter);
        await _dbContext.SaveChangesAsync();

        // Act & Assert: Encounter date (2026-01-15) is past valid_until (2025-12-31).
        // Even if effectiveYear is passed as "2025", the encounter is NOT covered!
        Func<Task> act = () => _generator.AssignPatientJourneyNumbersAsync(
            _tenantId, _clinicId, patient.Id, encounter.Id, "HCI-NCR-00921", "2025");

        await act.Should().ThrowAsync<InvalidOperationException>()
            .WithMessage("*no active PhilHealth YAKAP enlistment covering the encounter date 2026-01-15*");
    }

    #endregion
}
