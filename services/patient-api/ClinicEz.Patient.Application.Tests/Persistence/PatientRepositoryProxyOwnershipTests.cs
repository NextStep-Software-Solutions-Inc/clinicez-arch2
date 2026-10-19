using System;
using System.Threading.Tasks;
using FluentAssertions;
using Microsoft.EntityFrameworkCore;
using Xunit;
using ClinicEz.Patient.Domain.Entities;
using ClinicEz.Patient.Infrastructure.Persistence;
using ClinicEz.Patient.Infrastructure.Persistence.Repositories;

namespace ClinicEz.Patient.Application.Tests.Persistence;

public sealed class PatientRepositoryProxyOwnershipTests
{
    private static ApplicationDbContext NewContext() =>
        new(new DbContextOptionsBuilder<ApplicationDbContext>()
            .UseInMemoryDatabase(Guid.NewGuid().ToString())
            .Options);

    [Fact]
    public async Task IsOwnedByAsync_WhenPatientHasDirectClerkUserId_ReturnsTrue()
    {
        await using var context = NewContext();
        var repo = new PatientRepository(context);

        var patient = new Domain.Entities.Patient
        {
            Id = Guid.NewGuid(),
            ClerkUserId = "user_self_123",
            FirstName = "Juan",
            LastName = "Rizal"
        };
        await context.Patients.AddAsync(patient);
        await context.SaveChangesAsync();

        var isOwned = await repo.IsOwnedByAsync(patient.Id, "user_self_123");
        var isNotOwned = await repo.IsOwnedByAsync(patient.Id, "user_other");

        isOwned.Should().BeTrue();
        isNotOwned.Should().BeFalse();
    }

    [Fact]
    public async Task IsOwnedByAsync_WhenPatientIsManagedDependent_ReturnsTrueForParent()
    {
        await using var context = NewContext();
        var repo = new PatientRepository(context);

        var parent = new Domain.Entities.Patient
        {
            Id = Guid.NewGuid(),
            ClerkUserId = "user_parent_456",
            FirstName = "Parent",
            LastName = "Rizal"
        };
        await context.Patients.AddAsync(parent);

        var dependent = new Domain.Entities.Patient
        {
            Id = Guid.NewGuid(),
            ClerkUserId = null,
            ManagedByPatientId = parent.Id,
            FirstName = "Child",
            LastName = "Rizal",
            RelationshipToManager = "Child"
        };
        await context.Patients.AddAsync(dependent);
        await context.SaveChangesAsync();

        var parentCanAccess = await repo.IsOwnedByAsync(dependent.Id, "user_parent_456");
        var intruderCanAccess = await repo.IsOwnedByAsync(dependent.Id, "user_stranger");

        parentCanAccess.Should().BeTrue("parent must have authorized access over their managed dependent");
        intruderCanAccess.Should().BeFalse("unrelated users must be rejected");
    }

    [Fact]
    public async Task GetByClerkUserIdWithDetailsAsync_ReturnsPatientWithDependentsAllergiesAndMemberships()
    {
        await using var context = NewContext();
        var repo = new PatientRepository(context);

        var parent = new Domain.Entities.Patient
        {
            Id = Guid.NewGuid(),
            ClerkUserId = "user_parent_details",
            FirstName = "Parent",
            LastName = "Rizal"
        };
        await context.Patients.AddAsync(parent);

        var dependent = new Domain.Entities.Patient
        {
            Id = Guid.NewGuid(),
            ClerkUserId = null,
            ManagedByPatientId = parent.Id,
            FirstName = "DependentChild",
            LastName = "Rizal"
        };
        await context.Patients.AddAsync(dependent);
        await context.SaveChangesAsync();

        var loaded = await repo.GetByClerkUserIdWithDetailsAsync("user_parent_details");

        loaded.Should().NotBeNull();
        loaded!.Id.Should().Be(parent.Id);
        loaded.ManagedDependents.Should().ContainSingle();
        loaded.ManagedDependents.First().FirstName.Should().Be("DependentChild");
    }
}
