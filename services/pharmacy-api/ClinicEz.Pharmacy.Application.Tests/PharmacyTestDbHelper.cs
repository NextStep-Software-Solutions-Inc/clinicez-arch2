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

public static class PharmacyTestDbHelper
{
    public static (ApplicationDbContext Context, IUnitOfWork UnitOfWork, ISieveProcessor SieveProcessor) CreateTestContext()
    {
        var config = new ConfigurationBuilder()
            .AddInMemoryCollection(new[]
            {
                new KeyValuePair<string, string?>("DbSchema", "pharmacy_dashboard")
            })
            .Build();

        var options = new DbContextOptionsBuilder<ApplicationDbContext>()
            .UseInMemoryDatabase(databaseName: $"Pharmacy_TestDb_{Guid.NewGuid()}")
            .Options;

        var context = new ApplicationDbContext(options, config);
        var sieve = Substitute.For<ISieveProcessor>();
        var productRepo = Substitute.For<IProductRepository>();
        var uow = new UnitOfWork(context, sieve, productRepo);

        return (context, uow, sieve);
    }

    public static Repository<T> CreateRepository<T>(ApplicationDbContext context, ISieveProcessor sieve) where T : BaseEntity
    {
        return new Repository<T>(context, sieve);
    }
}
