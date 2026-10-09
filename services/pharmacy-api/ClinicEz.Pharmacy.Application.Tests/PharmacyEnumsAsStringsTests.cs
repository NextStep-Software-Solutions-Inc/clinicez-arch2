using System;
using System.Linq;
using System.Text.Json;
using System.Text.RegularExpressions;
using ClinicEz.Pharmacy.Application.Common;
using ClinicEz.Pharmacy.Application.Features.Staff.DTOs;
using ClinicEz.Pharmacy.Domain.Enums;
using ClinicEz.Shared.Common;
using FluentAssertions;
using Microsoft.AspNetCore.Mvc;
using Microsoft.EntityFrameworkCore;
using Microsoft.EntityFrameworkCore.Migrations.Operations;
using Microsoft.Extensions.DependencyInjection;
using Microsoft.Extensions.Options;
using Xunit;

namespace ClinicEz.Pharmacy.Application.Tests;

/// <summary>Enums are strings on the wire and in the database; numbers are never accepted.</summary>
public class PharmacyEnumsAsStringsTests
{
    [Fact]
    public void Model_Should_Persist_Every_Enum_Property_As_String()
    {
        using var db = PharmacyTestDbHelper.CreateContext($"enums-{Guid.NewGuid()}", new TestPharmacyScope(string.Empty, Guid.Empty));

        StringEnumModel.FindNonStringEnumProperties(db.Model).Should().BeEmpty();
    }

    [Fact]
    public void Model_Should_Cap_Enum_Columns_At_64_Characters()
    {
        using var db = PharmacyTestDbHelper.CreateContext($"enums-{Guid.NewGuid()}", new TestPharmacyScope(string.Empty, Guid.Empty));

        var property = db.Model.FindEntityType(typeof(Domain.Entities.PrescriptionOrder))!.FindProperty(nameof(Domain.Entities.PrescriptionOrder.Status))!;

        property.GetMaxLength().Should().Be(64);
    }

    public static TheoryData<string, string, Type> MigratedColumns => new()
    {
        { "PrescriptionOrders", "Status", typeof(PrescriptionStatus) },
        { "PrescriptionOrders", "PaymentStatus", typeof(PrescriptionPaymentStatus) },
        { "PrescriptionOrders", "PaymentPolicy", typeof(PharmacyPaymentPolicy) },
        { "PrescriptionOrderItems", "Status", typeof(ItemDispenseStatus) },
        { "PharmacyStaffMembers", "Role", typeof(PharmacyStaffRole) },
        { "PharmacySettings", "PaymentPolicy", typeof(PharmacyPaymentPolicy) },
        { "InventoryBatches", "Status", typeof(BatchStatus) },
        { "GamotLedgerTransactions", "Status", typeof(GamotTransactionStatus) },
    };

    [Theory]
    [MemberData(nameof(MigratedColumns))]
    public void Migration_Should_Map_Every_Enum_Member_Between_Integer_And_Name(string table, string column, Type enumType)
    {
        var migration = new Infrastructure.Migrations.EnumsAsStrings();
        var expected = Enum.GetValues(enumType).Cast<object>()
            .Select(member => (Value: Convert.ToInt32(member), Name: member.ToString()!))
            .OrderBy(pair => pair.Value)
            .ToList();

        var up = migration.UpOperations.OfType<SqlOperation>().Single(op => op.Sql.Contains($"\"{table}\" ALTER COLUMN \"{column}\" TYPE character varying(64)"));
        var down = migration.DownOperations.OfType<SqlOperation>().Single(op => op.Sql.Contains($"\"{table}\" ALTER COLUMN \"{column}\" TYPE integer"));

        Regex.Matches(up.Sql, @"WHEN (\d+) THEN '(\w+)'")
            .Select(m => (Value: int.Parse(m.Groups[1].Value), Name: m.Groups[2].Value))
            .OrderBy(pair => pair.Value)
            .Should().Equal(expected);
        Regex.Matches(down.Sql, @"WHEN '(\w+)' THEN (\d+)")
            .Select(m => (Value: int.Parse(m.Groups[2].Value), Name: m.Groups[1].Value))
            .OrderBy(pair => pair.Value)
            .Should().Equal(expected);
    }

    [Fact]
    public void Migration_Should_Cover_Exactly_The_Enum_Columns_Of_The_Model()
    {
        using var db = PharmacyTestDbHelper.CreateContext($"enums-{Guid.NewGuid()}", new TestPharmacyScope(string.Empty, Guid.Empty));
        var modelColumns = db.Model.GetEntityTypes()
            .SelectMany(entity => entity.GetProperties()
                .Where(p => (Nullable.GetUnderlyingType(p.ClrType) ?? p.ClrType).IsEnum)
                .Select(p => $"{p.Name}:{(Nullable.GetUnderlyingType(p.ClrType) ?? p.ClrType).Name}"))
            .Order()
            .ToList();

        var migrated = MigratedColumns.Select(row => $"{row[1]}:{((Type)row[2]).Name}").Order().ToList();

        migrated.Should().Equal(modelColumns);
    }

    private static JsonSerializerOptions MvcJsonOptions()
    {
        var services = new ServiceCollection();
        services.AddOptions();
        services.AddStrictStringEnums();
        using var provider = services.BuildServiceProvider();
        return new JsonSerializerOptions(provider.GetRequiredService<IOptions<JsonOptions>>().Value.JsonSerializerOptions);
    }

    private static PharmacyStaffMemberDto Staff(PharmacyStaffRole role) => new(
        Guid.NewGuid(), "tenant", Guid.NewGuid(), "Ana", "Reyes", null, null, role, null, null, null, null, true, DateTime.UtcNow);

    [Fact]
    public void Json_Should_Write_Enums_As_Names()
    {
        var json = JsonSerializer.Serialize(Staff(PharmacyStaffRole.Cashier), MvcJsonOptions());

        using var doc = JsonDocument.Parse(json);
        doc.RootElement.GetProperty("role").ValueKind.Should().Be(JsonValueKind.String);
        doc.RootElement.GetProperty("role").GetString().Should().Be("Cashier");
    }

    [Fact]
    public void Json_Should_Round_Trip_Enum_Names()
    {
        var options = MvcJsonOptions();
        var json = JsonSerializer.Serialize(Staff(PharmacyStaffRole.InventoryClerk), options);

        var back = JsonSerializer.Deserialize<PharmacyStaffMemberDto>(json, options);

        back!.Role.Should().Be(PharmacyStaffRole.InventoryClerk);
    }

    [Fact]
    public void Json_Should_Reject_Numeric_Enum_Values()
    {
        var options = MvcJsonOptions();
        var json = JsonSerializer.Serialize(Staff(PharmacyStaffRole.Cashier), options).Replace("\"Cashier\"", "3");

        var act = () => JsonSerializer.Deserialize<PharmacyStaffMemberDto>(json, options);

        act.Should().Throw<JsonException>();
    }

    [Fact]
    public void Json_Should_Reject_Numeric_Strings_And_Unknown_Names()
    {
        var options = MvcJsonOptions();
        var template = JsonSerializer.Serialize(Staff(PharmacyStaffRole.Cashier), options);

        foreach (var bad in new[] { "\"3\"", "\"NotARole\"" })
        {
            var act = () => JsonSerializer.Deserialize<PharmacyStaffMemberDto>(template.Replace("\"Cashier\"", bad), options);
            act.Should().Throw<JsonException>(because: bad);
        }
    }

    [Theory]
    [InlineData("Pending", PrescriptionStatus.Pending)]
    [InlineData("readyforpickup", PrescriptionStatus.ReadyForPickup)]
    [InlineData(" Dispensed ", PrescriptionStatus.Dispensed)]
    public void EnumNames_Should_Parse_Names_Case_Insensitively(string input, PrescriptionStatus expected)
    {
        EnumNames.TryParse<PrescriptionStatus>(input, out var parsed).Should().BeTrue();
        parsed.Should().Be(expected);
    }

    [Theory]
    [InlineData(null)]
    [InlineData("")]
    [InlineData("1")]
    [InlineData("-1")]
    [InlineData("99")]
    [InlineData("Pending,Dispensed")]
    [InlineData("Nope")]
    public void EnumNames_Should_Reject_Numbers_And_Unknown_Names(string? input)
    {
        EnumNames.TryParse<PrescriptionStatus>(input, out _).Should().BeFalse();
    }
}
