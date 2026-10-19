using ClinicEz.Clinic.Application.Features.Prescriptions.Queries;
using ClinicEz.Clinic.Domain.Entities;
using ClinicEz.Clinic.Domain.Interfaces;
using ClinicEz.Clinic.Infrastructure.Persistence.Repositories;
using FluentAssertions;
using NSubstitute;

namespace ClinicEz.Clinic.Application.Tests;

public class RecentExternalPharmaciesTests
{
    private static async Task<IReadOnlyList<string>> Run(int take, params string?[] pharmacies)
    {
        var clinicContext = Substitute.For<IClinicContext>();
        clinicContext.TenantId.Returns("tenant1");
        clinicContext.ClinicId.Returns(Guid.Empty);

        var (context, _, sieve) = TestDbHelper.CreateTestContext(clinicContext);
        foreach (var name in pharmacies)
        {
            context.Set<ConsultationEncounter>().Add(new ConsultationEncounter
            {
                TenantId = "tenant1",
                PatientId = Guid.NewGuid(),
                PatientName = "Test Patient",
                DoctorId = Guid.NewGuid(),
                DoctorName = "Dr Test",
                RxDispensedPharmacyName = name,
            });
        }
        await context.SaveChangesAsync();

        var handler = new GetRecentExternalPharmaciesQueryHandler(new Repository<ConsultationEncounter>(context, sieve));
        return await handler.Handle(new GetRecentExternalPharmaciesQuery(take), CancellationToken.None);
    }

    [Fact]
    public async Task Returns_nothing_when_no_dispense_was_recorded_so_there_is_no_built_in_list()
    {
        (await Run(12, null, "", "  ")).Should().BeEmpty();
    }

    [Fact]
    public async Task Orders_by_use_and_merges_spellings_that_differ_only_by_case_or_spacing()
    {
        var result = await Run(12, "Botika ni Juan", "BOTIKA NI JUAN ", "Botika ni Juan", "Farmacia Cruz");

        result.Should().Equal("Botika ni Juan", "Farmacia Cruz");
    }

    [Fact]
    public async Task Respects_take_and_falls_back_to_the_default_for_out_of_range_values()
    {
        var names = Enumerable.Range(1, 20).Select(i => $"Drugstore {i:00}").ToArray();

        (await Run(3, names)).Should().HaveCount(3);
        (await Run(0, names)).Should().HaveCount(12);
        (await Run(500, names)).Should().HaveCount(12);
    }
}
