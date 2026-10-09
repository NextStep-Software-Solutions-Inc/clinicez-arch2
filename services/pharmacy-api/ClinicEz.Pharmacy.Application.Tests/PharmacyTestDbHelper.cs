using System;
using System.Collections.Generic;
using ClinicEz.Pharmacy.Domain.Common;
using ClinicEz.Pharmacy.Domain.Interfaces;
using ClinicEz.Pharmacy.Infrastructure.Persistence;
using ClinicEz.Pharmacy.Infrastructure.Persistence.Repositories;
using Microsoft.EntityFrameworkCore;
using Microsoft.Extensions.Configuration;
using NSubstitute;
using Sieve.Services;

namespace ClinicEz.Pharmacy.Application.Tests;

/// <summary>Mutable stand-in for the per-request / per-handler pharmacy scope that the DbContext query filters read.</summary>
public sealed class TestPharmacyScope : IPharmacyContext, IPharmacyScopeSetter
{
    public TestPharmacyScope(string tenantId, Guid pharmacyId)
    {
        TenantId = tenantId;
        PharmacyId = pharmacyId;
    }

    public string TenantId { get; private set; }
    public Guid PharmacyId { get; private set; }
    public Guid? StaffId => null;
    public IReadOnlyList<string> Permissions => Array.Empty<string>();
    public bool IsInternalService => false;
    public bool HasPermission(string permission) => true;

    public void Enter(string tenantId, Guid pharmacyId)
    {
        TenantId = tenantId;
        PharmacyId = pharmacyId;
    }
}

public static class PharmacyTestDbHelper
{
    public const string TenantId = "tenant-pharmacy";
    public static readonly Guid PharmacyId = new("11111111-1111-1111-1111-111111111111");
    public static string PharmacyKey => PharmacyId.ToString();

    public static (ApplicationDbContext Context, IUnitOfWork UnitOfWork, ISieveProcessor SieveProcessor) CreateTestContext()
    {
        var context = CreateContext($"Pharmacy_TestDb_{Guid.NewGuid()}", new TestPharmacyScope(TenantId, PharmacyId));
        var sieve = Substitute.For<ISieveProcessor>();
        var productRepo = Substitute.For<IProductRepository>();
        var uow = new UnitOfWork(context, sieve, productRepo);

        return (context, uow, sieve);
    }

    /// <summary>Builds a context over a named in-memory database; two contexts with the same name share data.</summary>
    public static ApplicationDbContext CreateContext(string databaseName, IPharmacyContext scope)
    {
        var config = new ConfigurationBuilder()
            .AddInMemoryCollection(new[]
            {
                new KeyValuePair<string, string?>("DbSchema", "pharmacy_dashboard")
            })
            .Build();

        var options = new DbContextOptionsBuilder<ApplicationDbContext>()
            .UseInMemoryDatabase(databaseName)
            .Options;

        return new ApplicationDbContext(options, config, scope);
    }

    public static Repository<T> CreateRepository<T>(ApplicationDbContext context, ISieveProcessor sieve) where T : BaseEntity
    {
        return new Repository<T>(context, sieve);
    }
}
