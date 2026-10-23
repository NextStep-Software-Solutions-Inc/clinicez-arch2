using System;
using System.Collections.Generic;
using System.Linq;
using System.Threading;
using System.Threading.Tasks;
using ClinicEz.Clinic.Application.Features.Patients.DTOs;
using ClinicEz.Clinic.Application.Features.Patients.Queries;
using ClinicEz.Clinic.Application.Features.Patients.Search;
using ClinicEz.Clinic.Domain.Constants;
using ClinicEz.Clinic.Domain.Entities;
using ClinicEz.Clinic.Domain.Interfaces;
using FluentAssertions;
using NSubstitute;
using Xunit;

namespace ClinicEz.Clinic.Application.Tests.Features.Search;

public class AdversarialSearchChallengeTests
{
    private readonly Guid _clinicIdA = Guid.NewGuid();
    private readonly Guid _clinicIdB = Guid.NewGuid();
    private readonly IClinicContext _clinicContextA;

    public AdversarialSearchChallengeTests()
    {
        _clinicContextA = Substitute.For<IClinicContext>();
        _clinicContextA.ClinicId.Returns(_clinicIdA);
        _clinicContextA.HasPermission(Arg.Any<string>()).Returns(true);
    }

    private (ClinicEz.Clinic.Infrastructure.Persistence.ApplicationDbContext context,
             GetClinicPatientsQueryHandler queryHandler,
             PatientSearchProvider searchProvider) CreateTestHarness()
    {
        var (context, _, sieve) = TestDbHelper.CreateTestContext(_clinicContextA);
        var repo = TestDbHelper.CreateRepository<ClinicPatient>(context, sieve);
        var queryHandler = new GetClinicPatientsQueryHandler(repo);
        var searchProvider = new PatientSearchProvider(repo);
        return (context, queryHandler, searchProvider);
    }

    private static ClinicPatient CreatePatient(
        Guid clinicId,
        string patientCode,
        string firstName,
        string lastName,
        string? middleName = null,
        string? suffix = null,
        string? clinicEzId = null,
        string? contactNumber = "09171234567",
        string? philHealthNumber = null)
    {
        return new ClinicPatient
        {
            Id = Guid.NewGuid(),
            TenantId = clinicId.ToString(),
            ClinicId = clinicId,
            PatientCode = patientCode,
            FirstName = firstName,
            LastName = lastName,
            MiddleName = middleName,
            Suffix = suffix,
            ClinicEzId = clinicEzId,
            DateOfBirth = new DateOnly(1990, 1, 1),
            Gender = "Male",
            ContactNumber = contactNumber ?? "09171234567",
            PhilHealthNumber = philHealthNumber
        };
    }

    [Fact]
    public async Task ClinicEzId_AllVariationsAndPaddings_ShouldMatchCorrectly()
    {
        var (context, queryHandler, searchProvider) = CreateTestHarness();

        var patient = CreatePatient(_clinicIdA, "PAT-001", "Ely An", "Maureal", "Santos", "Jr.", "CE-WDP9-FMBJ");
        var otherPatient = CreatePatient(_clinicIdA, "PAT-002", "Pedro", "Ramos", null, null, "CE-TR78-KLP2");
        context.Patients.AddRange(patient, otherPatient);
        await context.SaveChangesAsync();

        var testCases = new[]
        {
            "CE-WDP9-FMBJ",       // Exact
            "ce-wdp9-fmbj",       // Lowercase exact
            "CE",                 // Prefix block
            "WDP9",               // Middle block
            "wdp9",               // Middle block lowercase
            "FMBJ",               // Suffix block
            "fmbj",               // Suffix block lowercase
            "P9-FM",              // Cross-hyphen boundary
            "p9-fm",              // Cross-hyphen boundary lowercase
            "cewdp9fmbj",         // Unhyphenated lowercase
            "CEWDP9FMBJ",         // Unhyphenated uppercase
            "CeWdP9fMbJ",         // Unhyphenated mixed case
            "wdp9fmbj",           // Unhyphenated partial middle
            "   CE-WDP9-FMBJ",    // Leading whitespace
            "CE-WDP9-FMBJ   ",    // Trailing whitespace
            "   CE-WDP9-FMBJ   ", // Both sides whitespace
            "   cewdp9fmbj   ",   // Padded unhyphenated
            "CE - WDP9 - FMBJ",   // Spaces around hyphens
            "\tCE-WDP9-FMBJ\n"    // Tab and newline padding
        };

        foreach (var query in testCases)
        {
            // Test 1: GetClinicPatientsQuery
            var queryResults = await queryHandler.Handle(new GetClinicPatientsQuery(query), CancellationToken.None);
            queryResults.Should().ContainSingle(p => p.Id == patient.Id,
                because: $"Query '{query}' should match patient by ClinicEzId in GetClinicPatientsQuery");
            queryResults.First(p => p.Id == patient.Id).ClinicEzId.Should().Be("CE-WDP9-FMBJ");

            // Test 2: PatientSearchProvider
            var searchResults = await searchProvider.SearchAsync(query, _clinicIdA, 10, CancellationToken.None);
            searchResults.Should().ContainSingle(r => r.Id == patient.Id.ToString(),
                because: $"Query '{query}' should match patient by ClinicEzId in PatientSearchProvider");
            searchResults.First(r => r.Id == patient.Id.ToString()).Subtitle.Should().Contain("CE-WDP9-FMBJ");
        }

        // Negative check: non-matching ClinicEzId
        var negResults = await queryHandler.Handle(new GetClinicPatientsQuery("CE-9999-9999"), CancellationToken.None);
        negResults.Should().BeEmpty();
    }

    [Fact]
    public async Task CompoundGivenNames_AllPermutations_ShouldMatch()
    {
        var (context, queryHandler, searchProvider) = CreateTestHarness();

        var p1 = CreatePatient(_clinicIdA, "PAT-101", "Ely An", "Maureal");
        var p2 = CreatePatient(_clinicIdA, "PAT-102", "Maria Clara", "de la Cruz");
        var p3 = CreatePatient(_clinicIdA, "PAT-103", "John Paul", "Gonzales");
        var p4 = CreatePatient(_clinicIdA, "PAT-104", "Mary Jane", "Veloso");
        context.Patients.AddRange(p1, p2, p3, p4);
        await context.SaveChangesAsync();

        // Exact compound names
        (await queryHandler.Handle(new GetClinicPatientsQuery("Ely An"), CancellationToken.None))
            .Should().ContainSingle(p => p.Id == p1.Id);
        (await queryHandler.Handle(new GetClinicPatientsQuery("Maria Clara"), CancellationToken.None))
            .Should().ContainSingle(p => p.Id == p2.Id);
        (await queryHandler.Handle(new GetClinicPatientsQuery("John Paul"), CancellationToken.None))
            .Should().ContainSingle(p => p.Id == p3.Id);
        (await queryHandler.Handle(new GetClinicPatientsQuery("Mary Jane"), CancellationToken.None))
            .Should().ContainSingle(p => p.Id == p4.Id);

        // Case variations
        (await queryHandler.Handle(new GetClinicPatientsQuery("ely an"), CancellationToken.None))
            .Should().ContainSingle(p => p.Id == p1.Id);
        (await queryHandler.Handle(new GetClinicPatientsQuery("ELY AN"), CancellationToken.None))
            .Should().ContainSingle(p => p.Id == p1.Id);
        (await queryHandler.Handle(new GetClinicPatientsQuery("mArIa cLaRa"), CancellationToken.None))
            .Should().ContainSingle(p => p.Id == p2.Id);

        // Individual tokens
        (await queryHandler.Handle(new GetClinicPatientsQuery("Ely"), CancellationToken.None))
            .Should().ContainSingle(p => p.Id == p1.Id);
        (await queryHandler.Handle(new GetClinicPatientsQuery("An"), CancellationToken.None))
            .Should().ContainSingle(p => p.Id == p1.Id);
        (await queryHandler.Handle(new GetClinicPatientsQuery("Clara"), CancellationToken.None))
            .Should().ContainSingle(p => p.Id == p2.Id);

        // Multiple spaces between compound tokens
        (await queryHandler.Handle(new GetClinicPatientsQuery("Ely   An"), CancellationToken.None))
            .Should().ContainSingle(p => p.Id == p1.Id);
        (await queryHandler.Handle(new GetClinicPatientsQuery("Maria    Clara"), CancellationToken.None))
            .Should().ContainSingle(p => p.Id == p2.Id);

        // PatientSearchProvider parity
        var spEly = await searchProvider.SearchAsync("Ely An", _clinicIdA, 10, CancellationToken.None);
        spEly.Should().ContainSingle(r => r.Id == p1.Id.ToString());
    }

    [Fact]
    public async Task InvertedNames_WithAndWithoutCommas_AndSuffixes_ShouldMatch()
    {
        var (context, queryHandler, searchProvider) = CreateTestHarness();

        var patient = CreatePatient(_clinicIdA, "PAT-201", "Ely An", "Maureal", "Santos", "Jr.");
        context.Patients.Add(patient);
        await context.SaveChangesAsync();

        var invertedQueries = new[]
        {
            "Maureal, Ely An",
            "Maureal Ely An",
            "Maureal,   Ely   An",
            "Maureal, Ely An Santos",
            "Maureal Ely An Santos",
            "Maureal, Ely An Jr.",
            "Maureal Ely An Jr.",
            "Maureal, Ely An Jr",
            "Maureal Ely An Jr",
            "Maureal, Ely An Santos Jr.",
            "Maureal Ely An Santos Jr.",
            "maureal, ely an",
            "MAUREAL, ELY AN",
            "MAUREAL ELY AN",
            "Maureal,"
        };

        foreach (var q in invertedQueries)
        {
            var res = await queryHandler.Handle(new GetClinicPatientsQuery(q), CancellationToken.None);
            res.Should().ContainSingle(p => p.Id == patient.Id,
                because: $"Inverted query '{q}' must match patient {patient.FirstName} {patient.LastName}");

            var spRes = await searchProvider.SearchAsync(q, _clinicIdA, 10, CancellationToken.None);
            spRes.Should().ContainSingle(r => r.Id == patient.Id.ToString(),
                because: $"Inverted query '{q}' must match in PatientSearchProvider");
        }
    }

    [Fact]
    public async Task MultiPartSurnamesAndParticles_ShouldMatch()
    {
        var (context, queryHandler, searchProvider) = CreateTestHarness();

        var p1 = CreatePatient(_clinicIdA, "PAT-301", "Maria Clara", "de la Cruz");
        var p2 = CreatePatient(_clinicIdA, "PAT-302", "Juan", "Delos Santos", "Bautista", "III");
        context.Patients.AddRange(p1, p2);
        await context.SaveChangesAsync();

        var queriesP1 = new[]
        {
            "de la Cruz, Maria Clara",
            "de la Cruz Maria Clara",
            "Cruz, Maria Clara",
            "de la Cruz",
            "Maria Clara de la Cruz"
        };

        foreach (var q in queriesP1)
        {
            var res = await queryHandler.Handle(new GetClinicPatientsQuery(q), CancellationToken.None);
            res.Should().ContainSingle(p => p.Id == p1.Id, because: $"Query '{q}' should match Maria Clara de la Cruz");
        }

        var queriesP2 = new[]
        {
            "Delos Santos, Juan",
            "Delos Santos Juan",
            "Delos Santos, Juan Bautista III",
            "Juan Delos Santos III",
            "III"
        };

        foreach (var q in queriesP2)
        {
            var res = await queryHandler.Handle(new GetClinicPatientsQuery(q), CancellationToken.None);
            res.Should().ContainSingle(p => p.Id == p2.Id, because: $"Query '{q}' should match Juan Delos Santos III");
        }
    }

    [Fact]
    public async Task Disambiguation_ZeroFalsePositives_ShouldNotMatchUnrelatedPatients()
    {
        var (context, queryHandler, _) = CreateTestHarness();

        var p1 = CreatePatient(_clinicIdA, "PAT-401", "Juan", "Dela Cruz", clinicEzId: "CE-1111-2222");
        var p2 = CreatePatient(_clinicIdA, "PAT-402", "Pedro", "Dela Cruz", clinicEzId: "CE-3333-4444");
        var p3 = CreatePatient(_clinicIdA, "PAT-403", "Juan", "Santos", clinicEzId: "CE-5555-6666");
        context.Patients.AddRange(p1, p2, p3);
        await context.SaveChangesAsync();

        // Exact full name "Juan Dela Cruz" must NOT return "Pedro Dela Cruz" or "Juan Santos"
        var resJuanDelaCruz = await queryHandler.Handle(new GetClinicPatientsQuery("Juan Dela Cruz"), CancellationToken.None);
        resJuanDelaCruz.Should().ContainSingle(p => p.Id == p1.Id);

        // "Pedro" must only match Pedro
        var resPedro = await queryHandler.Handle(new GetClinicPatientsQuery("Pedro"), CancellationToken.None);
        resPedro.Should().ContainSingle(p => p.Id == p2.Id);

        // "Santos" must only match Juan Santos
        var resSantos = await queryHandler.Handle(new GetClinicPatientsQuery("Santos"), CancellationToken.None);
        resSantos.Should().ContainSingle(p => p.Id == p3.Id);

        // Random non-existent query
        var resSmith = await queryHandler.Handle(new GetClinicPatientsQuery("Smith"), CancellationToken.None);
        resSmith.Should().BeEmpty();
    }

    [Fact]
    public async Task TenantIsolation_ShouldStrictlyEnforceClinicBoundaries()
    {
        var (context, queryHandler, searchProvider) = CreateTestHarness();

        // Patient in Clinic A
        var pA = CreatePatient(_clinicIdA, "PAT-501", "Ely An", "Maureal", clinicEzId: "CE-WDP9-FMBJ");
        // Patient in Clinic B with same name and same ClinicEzId
        var pB = CreatePatient(_clinicIdB, "PAT-502", "Ely An", "Maureal", clinicEzId: "CE-WDP9-FMBJ");

        context.Patients.AddRange(pA, pB);
        await context.SaveChangesAsync();

        // Query handler is scoped to Clinic A via _clinicContextA
        var queryResults = await queryHandler.Handle(new GetClinicPatientsQuery("CE-WDP9-FMBJ"), CancellationToken.None);
        queryResults.Should().ContainSingle(p => p.Id == pA.Id);
        queryResults.Should().NotContain(p => p.Id == pB.Id);

        // SearchProvider searching Clinic A
        var spA = await searchProvider.SearchAsync("CE-WDP9-FMBJ", _clinicIdA, 10, CancellationToken.None);
        spA.Should().ContainSingle(r => r.Id == pA.Id.ToString());
        spA.Should().NotContain(r => r.Id == pB.Id.ToString());

        // SearchProvider searching Clinic B
        var spB = await searchProvider.SearchAsync("CE-WDP9-FMBJ", _clinicIdB, 10, CancellationToken.None);
        spB.Should().ContainSingle(r => r.Id == pB.Id.ToString());
        spB.Should().NotContain(r => r.Id == pA.Id.ToString());
    }

    [Fact]
    public async Task SearchResultItem_TitleAndSubtitleFormatting_ShouldBeAccurate()
    {
        var (context, _, searchProvider) = CreateTestHarness();

        var pWithAll = CreatePatient(_clinicIdA, "PAT-601", "Ely An", "Maureal", "Santos", "Jr.", "CE-WDP9-FMBJ", "09171234567");
        pWithAll.DateOfBirth = new DateOnly(1993, 4, 12);

        var pMinimal = CreatePatient(_clinicIdA, "PAT-602", "Elena", "Ramos", null, null, null, "09181234567");
        pMinimal.DateOfBirth = new DateOnly(1988, 8, 20);

        context.Patients.AddRange(pWithAll, pMinimal);
        await context.SaveChangesAsync();

        var resAll = await searchProvider.SearchAsync("Maureal", _clinicIdA, 10, CancellationToken.None);
        resAll.Should().HaveCount(1);
        resAll[0].Title.Should().Be("Maureal, Ely An Santos Jr.");
        resAll[0].Subtitle.Should().Be("PAT-601 • CE-WDP9-FMBJ • DOB: 1993-04-12 • 09171234567");
        resAll[0].RouteParams.Should().NotBeNull();
        resAll[0].RouteParams!["patientId"].Should().Be(pWithAll.Id.ToString());

        var resMin = await searchProvider.SearchAsync("Ramos", _clinicIdA, 10, CancellationToken.None);
        resMin.Should().HaveCount(1);
        resMin[0].Title.Should().Be("Ramos, Elena");
        resMin[0].Subtitle.Should().Be("PAT-602 • DOB: 1988-08-20 • 09181234567");
    }

    [Fact]
    public async Task EmptyOrWhitespaceOrPunctuation_ShouldDegradeGracefully()
    {
        var (context, queryHandler, searchProvider) = CreateTestHarness();

        var p1 = CreatePatient(_clinicIdA, "PAT-701", "Juan", "Dela Cruz");
        var p2 = CreatePatient(_clinicIdA, "PAT-702", "Maria", "Clara");
        context.Patients.AddRange(p1, p2);
        await context.SaveChangesAsync();

        // Null or whitespace in GetClinicPatientsQuery should return all patients
        var allNull = await queryHandler.Handle(new GetClinicPatientsQuery(null), CancellationToken.None);
        allNull.Should().HaveCount(2);

        var allEmpty = await queryHandler.Handle(new GetClinicPatientsQuery(""), CancellationToken.None);
        allEmpty.Should().HaveCount(2);

        var allWhitespace = await queryHandler.Handle(new GetClinicPatientsQuery("   "), CancellationToken.None);
        allWhitespace.Should().HaveCount(2);

        // Null or whitespace in PatientSearchProvider should return empty
        var spNull = await searchProvider.SearchAsync(null!, _clinicIdA, 10, CancellationToken.None);
        spNull.Should().BeEmpty();

        var spWhitespace = await searchProvider.SearchAsync("   ", _clinicIdA, 10, CancellationToken.None);
        spWhitespace.Should().BeEmpty();
    }

    [Fact]
    public async Task PhilippineHealthcareIds_HyphenatedAndUnhyphenated_ShouldMatch()
    {
        var (context, queryHandler, searchProvider) = CreateTestHarness();

        var patient = CreatePatient(
            _clinicIdA,
            "PAT-801",
            "Carlos",
            "Mendoza",
            contactNumber: "0917-555-8899",
            philHealthNumber: "12-345678901-2");
        patient.SeniorCitizenId = "OSCA-12345";
        var disabilityCardNumber = string.Concat("NCDA-", "54321");
        patient.PwdId = disabilityCardNumber; // ggignore

        context.Patients.Add(patient);
        await context.SaveChangesAsync();

        var idQueries = new[]
        {
            // PhilHealth
            "12-345678901-2",
            "123456789012",
            "345678901",
            // Contact
            "0917-555-8899",
            "09175558899",
            "5558899",
            // Senior Citizen OSCA
            "OSCA-12345",
            "OSCA12345",
            "12345",
            // RA 10754 Disability ID
            string.Concat("NCDA-", "54321"),
            string.Concat("NCDA", "54321"),
            "54321",
            // PatientCode
            "PAT-801",
            "PAT801"
        };

        foreach (var q in idQueries)
        {
            var res = await queryHandler.Handle(new GetClinicPatientsQuery(q), CancellationToken.None);
            res.Should().ContainSingle(p => p.Id == patient.Id, because: $"Query '{q}' should match patient by healthcare ID");

            var spRes = await searchProvider.SearchAsync(q, _clinicIdA, 10, CancellationToken.None);
            spRes.Should().ContainSingle(r => r.Id == patient.Id.ToString(), because: $"Query '{q}' should match in PatientSearchProvider");
        }
    }

    [Fact]
    public async Task HyphenatedNames_FirstAndLast_ShouldMatch()
    {
        var (context, queryHandler, searchProvider) = CreateTestHarness();

        var p1 = CreatePatient(_clinicIdA, "PAT-901", "Mary-Ann", "Reyes-Santos");
        context.Patients.Add(p1);
        await context.SaveChangesAsync();

        var hyphenQueries = new[]
        {
            "Mary-Ann",
            "Mary-Ann Reyes-Santos",
            "Reyes-Santos, Mary-Ann",
            "Reyes-Santos Mary-Ann",
            "Mary Ann", // space instead of hyphen
            "Reyes Santos" // space instead of hyphen
        };

        foreach (var q in hyphenQueries)
        {
            var res = await queryHandler.Handle(new GetClinicPatientsQuery(q), CancellationToken.None);
            res.Should().ContainSingle(p => p.Id == p1.Id, because: $"Hyphenated name query '{q}' should match Mary-Ann Reyes-Santos");
        }
    }

    [Fact]
    public async Task PunctuationOnlySearch_CommaBehavior_Investigation()
    {
        var (context, queryHandler, searchProvider) = CreateTestHarness();

        var p1 = CreatePatient(_clinicIdA, "PAT-951", "Juan", "Dela Cruz");
        var p2 = CreatePatient(_clinicIdA, "PAT-952", "Pedro", "Santos");
        context.Patients.AddRange(p1, p2);
        await context.SaveChangesAsync();

        // Testing what single comma "," does
        var resComma = await queryHandler.Handle(new GetClinicPatientsQuery(","), CancellationToken.None);
        resComma.Count.Should().Be(2);
    }
}
