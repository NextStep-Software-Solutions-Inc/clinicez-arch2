using System;
using System.Collections.Generic;
using ClinicEz.Clinic.Domain.Common;
using ClinicEz.Clinic.Domain.Interfaces;
using ClinicEz.Clinic.Infrastructure.Persistence;
using ClinicEz.Clinic.Infrastructure.Persistence.Repositories;
using Microsoft.EntityFrameworkCore;
using Microsoft.Extensions.Configuration;
using NSubstitute;
using Sieve.Services;

namespace ClinicEz.Clinic.Application.Tests;

public static class TestDbHelper
{
    public static (ApplicationDbContext Context, IUnitOfWork UnitOfWork, ISieveProcessor SieveProcessor) CreateTestContext(IClinicContext clinicContext)
    {
        var config = new ConfigurationBuilder()
            .AddInMemoryCollection(new[]
            {
                new KeyValuePair<string, string?>("DbSchema", "clinic_dashboard")
            })
            .Build();

        var options = new DbContextOptionsBuilder<ApplicationDbContext>()
            .UseInMemoryDatabase(databaseName: $"ClinicEz_TestDb_{Guid.NewGuid()}")
            .Options;

        var context = new ApplicationDbContext(options, config, clinicContext);
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
