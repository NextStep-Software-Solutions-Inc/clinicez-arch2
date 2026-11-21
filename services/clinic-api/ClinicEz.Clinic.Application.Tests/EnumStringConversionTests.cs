using System;
using System.Linq;
using System.Text.Json;
using System.Threading.Tasks;
using ClinicEz.Clinic.Api;
using ClinicEz.Clinic.Domain.Entities;
using ClinicEz.Clinic.Domain.Enums;
using ClinicEz.Clinic.Infrastructure.Persistence;
using ClinicEz.Shared.Common;
using FluentAssertions;
using Microsoft.AspNetCore.Mvc;
using Microsoft.EntityFrameworkCore;
using Microsoft.EntityFrameworkCore.Metadata;
using Microsoft.Extensions.Configuration;
using Microsoft.Extensions.DependencyInjection;
using Microsoft.Extensions.Options;
using Xunit;

namespace ClinicEz.Clinic.Application.Tests;

public class EnumStringConversionTests
{
    private ApplicationDbContext CreateDbContext()
    {
        var config = new ConfigurationBuilder()
            .AddInMemoryCollection(new[]
            {
                new System.Collections.Generic.KeyValuePair<string, string?>("DbSchema", "public")
            })
            .Build();

        var options = new DbContextOptionsBuilder<ApplicationDbContext>()
            .UseInMemoryDatabase(databaseName: $"ClinicEz_EnumTest_{Guid.NewGuid()}")
            .Options;

        return new ApplicationDbContext(options, config);
    }

    [Fact]
    public void Model_PersistsEveryEnumProperty_AsString()
    {
        using var context = CreateDbContext();

        StringEnumModel.FindNonStringEnumProperties(context.Model).Should().BeEmpty("every enum must be persisted as its string name");

        var enumPropertyCount = context.Model.GetEntityTypes()
            .SelectMany(e => e.GetProperties())
            .Count(p => (Nullable.GetUnderlyingType(p.ClrType) ?? p.ClrType).IsEnum);
        enumPropertyCount.Should().BeGreaterThan(20, "the guard must actually be looking at the clinic's enum columns");
    }

    [Fact]
    public void Model_NullableEnumAndFlagsColumns_AreStrings()
    {
        using var context = CreateDbContext();

        var nullableEnums = context.Model.GetEntityTypes()
            .SelectMany(e => e.GetProperties())
            .Where(p => Nullable.GetUnderlyingType(p.ClrType)?.IsEnum == true)
            .ToList();
        nullableEnums.Should().OnlyContain(p => p.GetProviderClrType() == typeof(string));

        var scopes = context.Model.FindEntityType(typeof(ShareImport))!.FindProperty(nameof(ShareImport.Scopes))!;
        scopes.GetProviderClrType().Should().Be(typeof(string));
        scopes.GetMaxLength().Should().Be(200);

        var grantScopes = context.Model.FindEntityType(typeof(Patient))!.FindProperty(nameof(Patient.ShareGrantScopes))!;
        grantScopes.GetProviderClrType().Should().Be(typeof(string));
        grantScopes.GetMaxLength().Should().Be(200);
    }

    [Fact]
    public void ApiJsonPipeline_SerializesEnumsAsStrings()
    {
        var options = ApiJsonOptions();

        var json = JsonSerializer.Serialize(new EnumPayload(QueueStatus.Triaged, null, StaffRole.Doctor), options);

        json.Should().Contain("\"status\":\"Triaged\"");
        json.Should().Contain("\"priority\":null");
        json.Should().Contain("\"role\":\"Doctor\"");
        JsonSerializer.Deserialize<EnumPayload>(json, options)!.Status.Should().Be(QueueStatus.Triaged);
    }

    [Theory]
    [InlineData("{\"status\":1,\"role\":\"Doctor\"}")]
    [InlineData("{\"status\":\"1\",\"role\":\"Doctor\"}")]
    [InlineData("{\"status\":\"NotAStatus\",\"role\":\"Doctor\"}")]
    [InlineData("{\"status\":\"Triaged\",\"priority\":2,\"role\":\"Doctor\"}")]
    [InlineData("{\"status\":\"Triaged\",\"role\":1}")]
    public void ApiJsonPipeline_RejectsNumericAndUnknownEnumValues(string body)
    {
        var act = () => JsonSerializer.Deserialize<EnumPayload>(body, ApiJsonOptions());

        act.Should().Throw<JsonException>();
    }

    private sealed record EnumPayload(QueueStatus Status, QueuePriority? Priority, StaffRole Role);

    private static JsonSerializerOptions ApiJsonOptions()
    {
        using var provider = new ServiceCollection()
            .AddLogging()
            .AddApiServices()
            .BuildServiceProvider();
        return new JsonSerializerOptions(provider.GetRequiredService<IOptions<JsonOptions>>().Value.JsonSerializerOptions);
    }

    [Fact]
    public async Task EntitiesWithEnums_PersistAndRetrieveCorrectly()
    {
        // Arrange
        using var context = CreateDbContext();
        var tenantId = "tenant_test";
        var clinicId = Guid.NewGuid();

        var staff = new StaffMember
        {
            Id = Guid.NewGuid(),
            TenantId = tenantId,
            ClinicId = clinicId,
            FirstName = "Maria",
            LastName = "Santos",
            Role = StaffRole.Doctor,
            PrcLicenseNumber = "PRC-123456"
        };

        var appt = new Appointment
        {
            Id = Guid.NewGuid(),
            TenantId = tenantId,
            ClinicId = clinicId,
            PatientId = Guid.NewGuid(),
            PatientName = "Juan Dela Cruz",
            Status = AppointmentStatus.CheckedIn,
            ScheduledAt = DateTime.UtcNow
        };

        var queueItem = new QueueItem
        {
            Id = Guid.NewGuid(),
            TenantId = tenantId,
            ClinicId = clinicId,
            QueueNumber = "Q-001",
            SequenceNumber = 1,
            QueueDate = DateOnly.FromDateTime(DateTime.UtcNow),
            PatientId = appt.PatientId,
            PatientName = appt.PatientName,
            Priority = QueuePriority.Urgent,
            Status = QueueStatus.Triaged
        };

        // Act
        await context.StaffMembers.AddAsync(staff);
        await context.Appointments.AddAsync(appt);
        await context.QueueItems.AddAsync(queueItem);
        await context.SaveChangesAsync();

        // Assert
        var fetchedStaff = await context.StaffMembers.IgnoreQueryFilters().FirstAsync(s => s.Id == staff.Id);
        fetchedStaff.Role.Should().Be(StaffRole.Doctor);

        var fetchedAppt = await context.Appointments.IgnoreQueryFilters().FirstAsync(a => a.Id == appt.Id);
        fetchedAppt.Status.Should().Be(AppointmentStatus.CheckedIn);

        var fetchedQueue = await context.QueueItems.IgnoreQueryFilters().FirstAsync(q => q.Id == queueItem.Id);
        fetchedQueue.Priority.Should().Be(QueuePriority.Urgent);
        fetchedQueue.Status.Should().Be(QueueStatus.Triaged);
    }
}
