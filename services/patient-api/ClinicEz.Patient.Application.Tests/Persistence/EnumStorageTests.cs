using ClinicEz.Patient.Infrastructure.Persistence;
using ClinicEz.Shared.Common;
using FluentAssertions;
using Microsoft.EntityFrameworkCore;
using Microsoft.EntityFrameworkCore.Metadata;

namespace ClinicEz.Patient.Application.Tests.Persistence;

/// <summary>Every enum in the model is stored as text (its C# name); no numeric enum column may exist.</summary>
public sealed class EnumStorageTests
{
    private static ApplicationDbContext NewContext() =>
        new(new DbContextOptionsBuilder<ApplicationDbContext>().UseInMemoryDatabase(Guid.NewGuid().ToString()).Options);

    private static Type Unwrap(Type type) => Nullable.GetUnderlyingType(type) ?? type;

    private static IEnumerable<IProperty> EnumProperties(ApplicationDbContext context) =>
        context.Model.GetEntityTypes()
            .SelectMany(e => e.GetDeclaredProperties())
            .Where(p => Unwrap(p.ClrType).IsEnum && !p.IsShadowProperty());

    [Fact]
    public void The_model_has_enum_properties_to_check()
    {
        using var context = NewContext();

        EnumProperties(context).Should().NotBeEmpty();
    }

    [Fact]
    public void Every_enum_property_is_stored_as_a_string()
    {
        using var context = NewContext();

        StringEnumModel.FindNonStringEnumProperties(context.Model).Should().BeEmpty("enums must be persisted by name, never as numbers");
    }

    [Fact]
    public void Every_enum_column_leaves_room_for_the_longest_member_name()
    {
        using var context = NewContext();

        var tooShort = EnumProperties(context)
            .Where(p => p.GetMaxLength() is { } max && max < LongestStoredValue(Unwrap(p.ClrType)))
            .Select(p => $"{p.DeclaringType.DisplayName()}.{p.Name}")
            .ToList();

        tooShort.Should().BeEmpty();
    }

    private static int LongestStoredValue(Type enumType)
    {
        var names = Enum.GetNames(enumType);
        return enumType.IsDefined(typeof(FlagsAttribute), inherit: false)
            ? names.Sum(n => n.Length + 2)
            : names.Max(n => n.Length);
    }

    [Fact]
    public async Task An_enum_round_trips_through_the_database_by_name()
    {
        using var context = NewContext();
        var patientId = Guid.NewGuid();
        context.Patients.Add(new Domain.Entities.Patient
        {
            Id = patientId, ClerkUserId = "clerk_enum", FirstName = "Ana", LastName = "Reyes", Sex = Domain.Enums.SexType.Female
        });
        await context.SaveChangesAsync();

        (await context.Patients.AsNoTracking().SingleAsync(p => p.Id == patientId)).Sex.Should().Be(Domain.Enums.SexType.Female);
        context.Model.FindEntityType(typeof(Domain.Entities.Patient))!.FindProperty(nameof(Domain.Entities.Patient.Sex))!
            .GetTypeMapping().Converter!.ConvertToProvider(Domain.Enums.SexType.Female).Should().Be("Female");
    }
}
