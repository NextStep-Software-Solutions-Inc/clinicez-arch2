using System;
using System.Collections.Generic;
using System.Linq;
using System.Threading;
using System.Threading.Tasks;
using ClinicEz.Clinic.Application.Features.Dental.Commands;
using ClinicEz.Clinic.Application.Features.Dental.DTOs;
using ClinicEz.Clinic.Application.Features.Dental.Queries;
using ClinicEz.Clinic.Application.Features.Dental.Search;
using ClinicEz.Clinic.Application.Features.Search.Queries;
using ClinicEz.Clinic.Domain.Constants;
using ClinicEz.Clinic.Domain.Entities;
using ClinicEz.Clinic.Domain.Enums;
using ClinicEz.Clinic.Domain.Interfaces;
using ClinicEz.Shared.Exceptions;
using ClinicEz.Shared.Search;
using FluentAssertions;
using MediatR;
using Microsoft.EntityFrameworkCore;
using Microsoft.Extensions.Logging;
using NSubstitute;
using Xunit;

namespace ClinicEz.Clinic.Application.Tests.Challenger;

/// <summary>
/// Milestone MD Final Challenger Verification Suite (Backend E2E Challenger):
/// Empirical stress-testing of backend dental module and pluggable search provider.
/// 
/// Core Challenge Vectors:
/// 1. Multi-tenant data isolation & cross-tenant spoofing prevention
/// 2. Concurrency & atomic transaction rollback
/// 3. FDI tooth numbering (ISO 3950) boundaries & mathematical oracle
/// 4. Canonical MODBL surface subset permutations & normalization
/// 5. Search provider query sanitization, category filtering & RBAC gating
/// </summary>
public class MilestoneMDDentalBackendEndToEndChallengerTests
{
    private static readonly Guid TenantAClinicId = Guid.Parse("11111111-1111-1111-1111-111111111111");
    private static readonly Guid TenantBClinicId = Guid.Parse("22222222-2222-2222-2222-222222222222");
    private const string TenantAId = "tenant-md-alpha";
    private const string TenantBId = "tenant-md-beta";

    private readonly IClinicContext _clinicContextA;
    private readonly IClinicContext _clinicContextB;

    public MilestoneMDDentalBackendEndToEndChallengerTests()
    {
        _clinicContextA = Substitute.For<IClinicContext>();
        _clinicContextA.ClinicId.Returns(TenantAClinicId);
        _clinicContextA.TenantId.Returns(TenantAId);
        _clinicContextA.StaffName.Returns("Dr. Alpha Challenger");
        _clinicContextA.HasPermission(Arg.Any<string>()).Returns(true);

        _clinicContextB = Substitute.For<IClinicContext>();
        _clinicContextB.ClinicId.Returns(TenantBClinicId);
        _clinicContextB.TenantId.Returns(TenantBId);
        _clinicContextB.StaffName.Returns("Dr. Beta Challenger");
        _clinicContextB.HasPermission(Arg.Any<string>()).Returns(true);
    }

    #region 1. Multi-Tenant Data Isolation & Cross-Tenant Spoofing Prevention

    [Fact]
    public async Task Challenge1_CrossTenantPatientIdSpoofing_ThrowsNotFoundInAllDentalOperations()
    {
        var dbName = $"MD_CrossTenantDb_{Guid.NewGuid()}";
        var (contextA, uowA, sieveA) = TestDbHelper.CreateSharedTestContext(dbName, _clinicContextA);
        var (contextB, uowB, sieveB) = TestDbHelper.CreateSharedTestContext(dbName, _clinicContextB);

        var patientRepoA = TestDbHelper.CreateRepository<Patient>(contextA, sieveA);
        var toothRepoA = TestDbHelper.CreateRepository<DentalToothRecord>(contextA, sieveA);
        var procRepoA = TestDbHelper.CreateRepository<Procedure>(contextA, sieveA);

        var patientRepoB = TestDbHelper.CreateRepository<Patient>(contextB, sieveB);

        // Seed Patient in Tenant B ONLY
        var tenantBPatientId = Guid.NewGuid();
        await patientRepoB.AddAsync(new Patient
        {
            Id = tenantBPatientId,
            TenantId = TenantBId,
            ClinicId = TenantBClinicId,
            PatientCode = "PAT-TENANT-B-ONLY",
            FirstName = "Target",
            LastName = "PatientB",
            ContactNumber = "09170000002"
        }, CancellationToken.None);
        await uowB.SaveChangesAsync(CancellationToken.None);

        // 1. Tenant A attempts to Query Tenant B patient's dental chart -> NotFoundException
        var queryHandlerA = new GetPatientDentalChartQueryHandler(toothRepoA, procRepoA, patientRepoA, _clinicContextA);
        var actQuery = async () => await queryHandlerA.Handle(new GetPatientDentalChartQuery(tenantBPatientId), CancellationToken.None);
        await actQuery.Should().ThrowAsync<NotFoundException>()
            .WithMessage($"*Patient '{tenantBPatientId}' not found*");

        // 2. Tenant A attempts to Upsert a tooth for Tenant B patient -> NotFoundException
        var upsertHandlerA = new UpsertDentalToothRecordCommandHandler(toothRepoA, patientRepoA, uowA, _clinicContextA);
        var actUpsert = async () => await upsertHandlerA.Handle(new UpsertDentalToothRecordCommand(
            PatientId: tenantBPatientId,
            ToothNumber: 16,
            Status: ToothStatus.Decayed
        ), CancellationToken.None);
        await actUpsert.Should().ThrowAsync<NotFoundException>()
            .WithMessage($"*Patient '{tenantBPatientId}' not found*");

        // 3. Tenant A attempts to BatchSave teeth for Tenant B patient -> NotFoundException
        var senderA = Substitute.For<ISender>();
        var batchHandlerA = new BatchSaveDentalChartCommandHandler(toothRepoA, patientRepoA, uowA, _clinicContextA, senderA);
        var actBatch = async () => await batchHandlerA.Handle(new BatchSaveDentalChartCommand(
            PatientId: tenantBPatientId,
            ConsultationId: null,
            Teeth: new List<ToothRecordInput> { new(16, ToothStatus.Decayed) }
        ), CancellationToken.None);
        await actBatch.Should().ThrowAsync<NotFoundException>()
            .WithMessage($"*Patient '{tenantBPatientId}' not found*");
    }

    [Fact]
    public async Task Challenge1_CrossTenantRecordMutation_DoesNotMutateOrLeakOtherTenantRecords()
    {
        var dbName = $"MD_MutationIsolationDb_{Guid.NewGuid()}";
        var (contextA, uowA, sieveA) = TestDbHelper.CreateSharedTestContext(dbName, _clinicContextA);
        var (contextB, uowB, sieveB) = TestDbHelper.CreateSharedTestContext(dbName, _clinicContextB);

        var patientRepoA = TestDbHelper.CreateRepository<Patient>(contextA, sieveA);
        var toothRepoA = TestDbHelper.CreateRepository<DentalToothRecord>(contextA, sieveA);

        var patientRepoB = TestDbHelper.CreateRepository<Patient>(contextB, sieveB);
        var toothRepoB = TestDbHelper.CreateRepository<DentalToothRecord>(contextB, sieveB);

        var patientAId = Guid.NewGuid();
        var patientBId = Guid.NewGuid();

        // Seed Patient A in Clinic A
        await patientRepoA.AddAsync(new Patient
        {
            Id = patientAId,
            TenantId = TenantAId,
            ClinicId = TenantAClinicId,
            PatientCode = "PAT-A",
            FirstName = "Alice",
            LastName = "Alpha",
            ContactNumber = "09170000001"
        }, CancellationToken.None);

        // Seed Patient B in Clinic B
        await patientRepoB.AddAsync(new Patient
        {
            Id = patientBId,
            TenantId = TenantBId,
            ClinicId = TenantBClinicId,
            PatientCode = "PAT-B",
            FirstName = "Bob",
            LastName = "Beta",
            ContactNumber = "09170000002"
        }, CancellationToken.None);

        // Clinic B has tooth 26 recorded as Crown with surface MOD
        await toothRepoB.AddAsync(new DentalToothRecord
        {
            Id = Guid.NewGuid(),
            TenantId = TenantBId,
            ClinicId = TenantBClinicId,
            PatientId = patientBId,
            ToothNumber = 26,
            Status = ToothStatus.Crowned,
            Surface = "MOD",
            Notes = "Tenant B Permanent Crown"
        }, CancellationToken.None);

        await uowA.SaveChangesAsync(CancellationToken.None);
        await uowB.SaveChangesAsync(CancellationToken.None);

        // Tenant A creates/updates tooth 26 for Patient A
        var upsertHandlerA = new UpsertDentalToothRecordCommandHandler(toothRepoA, patientRepoA, uowA, _clinicContextA);
        var commandA = new UpsertDentalToothRecordCommand(
            PatientId: patientAId,
            ToothNumber: 26,
            Status: ToothStatus.Decayed,
            Surface: "O",
            Notes: "Tenant A Active Decay"
        );
        var resultA = await upsertHandlerA.Handle(commandA, CancellationToken.None);

        resultA.ClinicId.Should().Be(TenantAClinicId);
        resultA.Status.Should().Be(ToothStatus.Decayed);
        resultA.Surface.Should().Be("O");

        // Verify Tenant B's tooth 26 was untouched in DB
        var toothB = await toothRepoB.Query(t => t.ClinicId == TenantBClinicId && t.ToothNumber == 26, ignoreQueryFilters: true).FirstAsync();
        toothB.Status.Should().Be(ToothStatus.Crowned);
        toothB.Surface.Should().Be("MOD");
        toothB.Notes.Should().Be("Tenant B Permanent Crown");
    }

    #endregion

    #region 2. Concurrency & Atomic Rollback Verification

    [Fact]
    public async Task Challenge2_BatchSave_AtomicRollbackOnInvalidToothNumber_LeavesZeroChanges()
    {
        var (context, uow, sieve) = TestDbHelper.CreateTestContext(_clinicContextA);
        var toothRepo = TestDbHelper.CreateRepository<DentalToothRecord>(context, sieve);
        var patientRepo = TestDbHelper.CreateRepository<Patient>(context, sieve);
        var sender = Substitute.For<ISender>();

        var patientId = Guid.NewGuid();
        await patientRepo.AddAsync(new Patient
        {
            Id = patientId,
            TenantId = TenantAId,
            ClinicId = TenantAClinicId,
            PatientCode = "PAT-ATOMIC-1",
            FirstName = "Atomic",
            LastName = "Test",
            ContactNumber = "09171234567"
        }, CancellationToken.None);
        await uow.SaveChangesAsync(CancellationToken.None);

        var handler = new BatchSaveDentalChartCommandHandler(toothRepo, patientRepo, uow, _clinicContextA, sender);

        // 5 teeth: teeth 11, 12, 13 valid; tooth 99 invalid; tooth 14 valid
        var command = new BatchSaveDentalChartCommand(
            PatientId: patientId,
            ConsultationId: null,
            Teeth: new List<ToothRecordInput>
            {
                new(ToothNumber: 11, Status: ToothStatus.Healthy),
                new(ToothNumber: 12, Status: ToothStatus.Decayed),
                new(ToothNumber: 13, Status: ToothStatus.Filled),
                new(ToothNumber: 99, Status: ToothStatus.Missing), // Invalid!
                new(ToothNumber: 14, Status: ToothStatus.Healthy)
            }
        );

        var act = async () => await handler.Handle(command, CancellationToken.None);

        await act.Should().ThrowAsync<BadRequestException>()
            .WithMessage("*'99' is invalid under ISO 3950 FDI notation*");

        // Verify zero records were saved
        var savedRecords = await toothRepo.Query(t => t.PatientId == patientId).ToListAsync();
        savedRecords.Should().BeEmpty();
    }

    [Fact]
    public async Task Challenge2_BatchSave_AtomicRollbackOnInvalidSurface_LeavesZeroChanges()
    {
        var (context, uow, sieve) = TestDbHelper.CreateTestContext(_clinicContextA);
        var toothRepo = TestDbHelper.CreateRepository<DentalToothRecord>(context, sieve);
        var patientRepo = TestDbHelper.CreateRepository<Patient>(context, sieve);
        var sender = Substitute.For<ISender>();

        var patientId = Guid.NewGuid();
        await patientRepo.AddAsync(new Patient
        {
            Id = patientId,
            TenantId = TenantAId,
            ClinicId = TenantAClinicId,
            PatientCode = "PAT-ATOMIC-2",
            FirstName = "Surface",
            LastName = "Atomic",
            ContactNumber = "09171234568"
        }, CancellationToken.None);
        await uow.SaveChangesAsync(CancellationToken.None);

        var handler = new BatchSaveDentalChartCommandHandler(toothRepo, patientRepo, uow, _clinicContextA, sender);

        // Tooth 12 has invalid surface "XYZ"
        var command = new BatchSaveDentalChartCommand(
            PatientId: patientId,
            ConsultationId: null,
            Teeth: new List<ToothRecordInput>
            {
                new(ToothNumber: 11, Status: ToothStatus.Healthy, Surface: "MOD"),
                new(ToothNumber: 12, Status: ToothStatus.Decayed, Surface: "XYZ"), // Invalid surface
                new(ToothNumber: 13, Status: ToothStatus.Filled, Surface: "B")
            }
        );

        var act = async () => await handler.Handle(command, CancellationToken.None);

        await act.Should().ThrowAsync<BadRequestException>()
            .WithMessage("*Invalid tooth surface 'XYZ'*");

        // Verify zero records saved
        var savedRecords = await toothRepo.Query(t => t.PatientId == patientId).ToListAsync();
        savedRecords.Should().BeEmpty();
    }

    [Fact]
    public async Task Challenge2_BatchSave_Deduplication_CollapsesSameToothInBatchSafely()
    {
        var (context, uow, sieve) = TestDbHelper.CreateTestContext(_clinicContextA);
        var toothRepo = TestDbHelper.CreateRepository<DentalToothRecord>(context, sieve);
        var procRepo = TestDbHelper.CreateRepository<Procedure>(context, sieve);
        var patientRepo = TestDbHelper.CreateRepository<Patient>(context, sieve);

        var patientId = Guid.NewGuid();
        await patientRepo.AddAsync(new Patient
        {
            Id = patientId,
            TenantId = TenantAId,
            ClinicId = TenantAClinicId,
            PatientCode = "PAT-DEDUP",
            FirstName = "Dedup",
            LastName = "Test",
            ContactNumber = "09171234569"
        }, CancellationToken.None);
        await uow.SaveChangesAsync(CancellationToken.None);

        var chartQueryHandler = new GetPatientDentalChartQueryHandler(toothRepo, procRepo, _clinicContextA);
        var sender = Substitute.For<ISender>();
        sender.Send(Arg.Is<GetPatientDentalChartQuery>(q => q.PatientId == patientId), Arg.Any<CancellationToken>())
            .Returns(ci => chartQueryHandler.Handle(ci.Arg<GetPatientDentalChartQuery>(), ci.Arg<CancellationToken>()));

        var handler = new BatchSaveDentalChartCommandHandler(toothRepo, patientRepo, uow, _clinicContextA, sender);

        // Multiple entries for tooth 46 in the same batch: Healthy -> Decay -> Filled
        var command = new BatchSaveDentalChartCommand(
            PatientId: patientId,
            ConsultationId: null,
            Teeth: new List<ToothRecordInput>
            {
                new(ToothNumber: 46, Status: ToothStatus.Healthy, Notes: "Pass 1"),
                new(ToothNumber: 46, Status: ToothStatus.Decayed, Surface: "O", Notes: "Pass 2"),
                new(ToothNumber: 46, Status: ToothStatus.Filled, Surface: "MOD", Notes: "Final Pass")
            }
        );

        var result = await handler.Handle(command, CancellationToken.None);

        result.Teeth.Should().HaveCount(1);
        result.Teeth[0].ToothNumber.Should().Be(46);
        result.Teeth[0].Status.Should().Be(ToothStatus.Filled);
        result.Teeth[0].Surface.Should().Be("MOD");
        result.Teeth[0].Notes.Should().Be("Final Pass");

        var dbRecords = await toothRepo.Query(t => t.PatientId == patientId).ToListAsync();
        dbRecords.Should().HaveCount(1);
    }

    #endregion

    #region 3. FDI Tooth Numbering (ISO 3950) Mathematical Oracle

    [Fact]
    public void Challenge3_FdiToothNumbering_FullIntegerRangeOracle_ExhaustiveValidation()
    {
        // Define exact valid ISO 3950 set:
        // Adult: 11..18, 21..28, 31..38, 41..48 (32 teeth)
        // Child: 51..55, 61..65, 71..75, 81..85 (20 teeth)
        var validTeeth = new HashSet<int>();
        for (int i = 11; i <= 18; i++) validTeeth.Add(i);
        for (int i = 21; i <= 28; i++) validTeeth.Add(i);
        for (int i = 31; i <= 38; i++) validTeeth.Add(i);
        for (int i = 41; i <= 48; i++) validTeeth.Add(i);
        for (int i = 51; i <= 55; i++) validTeeth.Add(i);
        for (int i = 61; i <= 65; i++) validTeeth.Add(i);
        for (int i = 71; i <= 75; i++) validTeeth.Add(i);
        for (int i = 81; i <= 85; i++) validTeeth.Add(i);

        validTeeth.Count.Should().Be(52, "ISO 3950 specifies exactly 32 adult and 20 primary teeth (52 total)");

        // Test every integer from -100 to +200 against the validator
        for (int candidate = -100; candidate <= 200; candidate++)
        {
            var isExpectedValid = validTeeth.Contains(candidate);
            var act = () => UpsertDentalToothRecordCommandHandler.ValidateToothNumber(candidate);

            if (isExpectedValid)
            {
                act.Should().NotThrow($"Tooth #{candidate} is an official ISO 3950 FDI tooth number and must be valid");
            }
            else
            {
                act.Should().Throw<BadRequestException>($"Tooth #{candidate} is NOT in ISO 3950 and must be rejected");
            }
        }
    }

    [Theory]
    // Quadrant boundary values: directly preceding and directly succeeding valid intervals
    [InlineData(10, false)] [InlineData(11, true)] [InlineData(18, true)] [InlineData(19, false)]
    [InlineData(20, false)] [InlineData(21, true)] [InlineData(28, true)] [InlineData(29, false)]
    [InlineData(30, false)] [InlineData(31, true)] [InlineData(38, true)] [InlineData(39, false)]
    [InlineData(40, false)] [InlineData(41, true)] [InlineData(48, true)] [InlineData(49, false)]
    [InlineData(50, false)] [InlineData(51, true)] [InlineData(55, true)] [InlineData(56, false)]
    [InlineData(60, false)] [InlineData(61, true)] [InlineData(65, true)] [InlineData(66, false)]
    [InlineData(70, false)] [InlineData(71, true)] [InlineData(75, true)] [InlineData(76, false)]
    [InlineData(80, false)] [InlineData(81, true)] [InlineData(85, true)] [InlineData(86, false)]
    public void Challenge3_FdiToothNumbering_ImmediateBoundariesTested(int toothNumber, bool shouldBeValid)
    {
        var act = () => UpsertDentalToothRecordCommandHandler.ValidateToothNumber(toothNumber);
        if (shouldBeValid)
        {
            act.Should().NotThrow();
        }
        else
        {
            act.Should().Throw<BadRequestException>();
        }
    }

    #endregion

    #region 4. Canonical MODBL Surface Subset Permutations & Normalization

    [Fact]
    public void Challenge4_CanonicalSurfaceSorting_All31NonEmptySubsetsNormalizedCorrectly()
    {
        // 5 canonical surface characters in order
        var canonicalOrder = new[] { 'M', 'O', 'D', 'B', 'L' };

        // Test all 2^5 - 1 = 31 non-empty subsets
        for (int mask = 1; mask < 32; mask++)
        {
            var subsetChars = new List<char>();
            for (int bit = 0; bit < 5; bit++)
            {
                if ((mask & (1 << bit)) != 0)
                {
                    subsetChars.Add(canonicalOrder[bit]);
                }
            }

            var expected = new string(subsetChars.ToArray());

            // Generate reversed permutation
            var reversedInput = new string(subsetChars.AsEnumerable().Reverse().ToArray());
            UpsertDentalToothRecordCommandHandler.NormalizeAndSortSurfaces(reversedInput).Should().Be(expected);

            // Generate lowercase with whitespace and duplicates
            var messyInput = string.Join("  ", subsetChars.Select(c => $"{char.ToLowerInvariant(c)}{char.ToUpperInvariant(c)}"));
            UpsertDentalToothRecordCommandHandler.NormalizeAndSortSurfaces(messyInput).Should().Be(expected);
        }
    }

    [Theory]
    [InlineData(null)]
    [InlineData("")]
    [InlineData("   ")]
    [InlineData("\t \r \n")]
    public void Challenge4_CanonicalSurfaceSorting_NullAndWhitespaceReturnsNull(string? input)
    {
        var result = UpsertDentalToothRecordCommandHandler.NormalizeAndSortSurfaces(input);
        result.Should().BeNull();
    }

    [Theory]
    [InlineData("A")]
    [InlineData("C")]
    [InlineData("E")]
    [InlineData("F")]
    [InlineData("123")]
    [InlineData("M,O,D")] // Punctuation is rejected
    [InlineData("M-O")]
    [InlineData("MOD!")]
    [InlineData("B_L")]
    public void Challenge4_CanonicalSurfaceSorting_InvalidCharsThrowBadRequest(string invalidInput)
    {
        var act = () => UpsertDentalToothRecordCommandHandler.NormalizeAndSortSurfaces(invalidInput);
        act.Should().Throw<BadRequestException>()
            .WithMessage($"*Invalid tooth surface '{invalidInput}'*");
    }

    #endregion

    #region 5. Search Provider Query Sanitization, Category Filtering & RBAC Gating

    [Fact]
    public async Task Challenge5_SearchProvider_SanitizationAndDefensiveExecution()
    {
        var (context, _, sieve) = TestDbHelper.CreateTestContext(_clinicContextA);
        var toothRepo = TestDbHelper.CreateRepository<DentalToothRecord>(context, sieve);
        var provider = new DentalChartSearchProvider(toothRepo);

        // Seed 1 tooth in Clinic A
        context.DentalToothRecords.Add(new DentalToothRecord
        {
            Id = Guid.NewGuid(),
            TenantId = TenantAId,
            ClinicId = TenantAClinicId,
            PatientId = Guid.NewGuid(),
            PatientName = "Santos, Maria",
            ToothNumber = 16,
            Status = ToothStatus.Decayed,
            Surface = "MOD",
            Notes = "Caries on occlusal surface"
        });
        await context.SaveChangesAsync();

        // Null / whitespace query returns empty without throwing
        (await provider.SearchAsync("", TenantAClinicId, 10, CancellationToken.None)).Should().BeEmpty();
        (await provider.SearchAsync("   ", TenantAClinicId, 10, CancellationToken.None)).Should().BeEmpty();

        // SQL injection probe executes safely without crashing
        var sqlResults = await provider.SearchAsync("'; DROP TABLE dental; --", TenantAClinicId, 10, CancellationToken.None);
        sqlResults.Should().BeEmpty();

        // XSS payload executes safely without crashing
        var xssResults = await provider.SearchAsync("<script>alert('xss')</script>", TenantAClinicId, 10, CancellationToken.None);
        xssResults.Should().BeEmpty();

        // Long query string (1000 characters) executes safely
        var longResults = await provider.SearchAsync(new string('q', 1000), TenantAClinicId, 10, CancellationToken.None);
        longResults.Should().BeEmpty();

        // Valid query matches tooth #16
        var validResults = await provider.SearchAsync("16", TenantAClinicId, 10, CancellationToken.None);
        validResults.Should().HaveCount(1);
        validResults[0].RouteParams!["toothNumber"].Should().Be("16");
        validResults[0].BadgeText.Should().Be("Decayed");
        validResults[0].BadgeVariant.Should().Be(SearchBadgeVariant.Urgent);
    }

    [Fact]
    public async Task Challenge5_GlobalSearchOrchestration_CategoryFilteringAndRbacGating()
    {
        var (context, _, sieve) = TestDbHelper.CreateTestContext(_clinicContextA);
        var toothRepo = TestDbHelper.CreateRepository<DentalToothRecord>(context, sieve);
        var dentalProvider = new DentalChartSearchProvider(toothRepo);

        // Create a mock PatientSearchProvider
        var patientProvider = Substitute.For<ISearchProvider>();
        patientProvider.Category.Returns("Patients");
        patientProvider.Priority.Returns(10);
        patientProvider.RequiredPermission.Returns(ClinicPermissions.PatientsRead);
        patientProvider.SearchAsync(Arg.Any<string>(), Arg.Any<Guid>(), Arg.Any<int>(), Arg.Any<CancellationToken>())
            .Returns(new List<SearchResultItemDto>
            {
                new("pat-1", "Patients", "Patient Alpha", "Alpha Sub", "Active", "neutral", "Patients", new())
            });

        // Seed tooth in DB
        context.DentalToothRecords.Add(new DentalToothRecord
        {
            Id = Guid.NewGuid(),
            TenantId = TenantAId,
            ClinicId = TenantAClinicId,
            PatientId = Guid.NewGuid(),
            PatientName = "Santos, Maria",
            ToothNumber = 16,
            Status = ToothStatus.Decayed,
            Surface = "MOD"
        });
        await context.SaveChangesAsync();

        var logger = Substitute.For<ILogger<GlobalClinicSearchQueryHandler>>();
        var providers = new List<ISearchProvider> { patientProvider, dentalProvider };

        var handler = new GlobalClinicSearchQueryHandler(providers, _clinicContextA, logger);

        // 1. Search with Category = "Dental" -> Only DentalChartSearchProvider executes
        var dentalQuery = new GlobalClinicSearchQuery("16", Category: "Dental", Limit: 10);
        var dentalResponse = await handler.Handle(dentalQuery, CancellationToken.None);
        dentalResponse.Items.Should().HaveCount(1);
        dentalResponse.Items[0].Category.Should().Be("Dental");

        // 2. Search with Category = "Patients" -> DentalChartSearchProvider is filtered out
        var patientQuery = new GlobalClinicSearchQuery("16", Category: "Patients", Limit: 10);
        var patientResponse = await handler.Handle(patientQuery, CancellationToken.None);
        patientResponse.Items.Should().HaveCount(1);
        patientResponse.Items[0].Category.Should().Be("Patients");

        // 3. Search with Category = null -> Both providers execute
        var globalQuery = new GlobalClinicSearchQuery("Santos", Category: null, Limit: 10);
        var globalResponse = await handler.Handle(globalQuery, CancellationToken.None);
        globalResponse.Items.Should().Contain(r => r.Category == "Dental");
        globalResponse.Items.Should().Contain(r => r.Category == "Patients");

        // 4. RBAC gating: user lacking ConsultationsRead
        var restrictedContext = Substitute.For<IClinicContext>();
        restrictedContext.ClinicId.Returns(TenantAClinicId);
        restrictedContext.HasPermission(ClinicPermissions.PatientsRead).Returns(true);
        restrictedContext.HasPermission(ClinicPermissions.ConsultationsRead).Returns(false); // No ConsultationsRead

        var restrictedHandler = new GlobalClinicSearchQueryHandler(providers, restrictedContext, logger);
        var gatedResponse = await restrictedHandler.Handle(new GlobalClinicSearchQuery("16", Category: "Dental", Limit: 10), CancellationToken.None);
        gatedResponse.Items.Should().BeEmpty("Staff lacking ConsultationsRead must be blocked from querying dental search");

        // 5. Unauthenticated clinic rejection
        var unauthContext = Substitute.For<IClinicContext>();
        unauthContext.ClinicId.Returns(Guid.Empty);
        var unauthHandler = new GlobalClinicSearchQueryHandler(providers, unauthContext, logger);
        var unauthResponse = await unauthHandler.Handle(new GlobalClinicSearchQuery("16", Category: null, Limit: 10), CancellationToken.None);
        unauthResponse.Items.Should().BeEmpty("Unauthenticated clinic context (Guid.Empty) must immediately return empty search results");
    }

    #endregion
}
