using System;
using System.Collections.Generic;
using ClinicEz.Laboratory.Application.Common.Interfaces;
using ClinicEz.Laboratory.Application.Interop;
using ClinicEz.Laboratory.Domain.Common;
using ClinicEz.Laboratory.Domain.Entities;
using ClinicEz.Laboratory.Domain.Interfaces;
using ClinicEz.Laboratory.Infrastructure.Persistence;
using ClinicEz.Laboratory.Infrastructure.Persistence.Repositories;
using ClinicEz.Shared.Interop;
using Microsoft.EntityFrameworkCore;
using Microsoft.Extensions.Configuration;
using Microsoft.Extensions.Logging.Abstractions;
using NSubstitute;
using Sieve.Services;

namespace ClinicEz.Laboratory.Application.Tests;

public static class LabTestDbHelper
{
    public static (ApplicationDbContext Context, IUnitOfWork UnitOfWork, ISieveProcessor SieveProcessor) CreateTestContext()
    {
        var config = new ConfigurationBuilder()
            .AddInMemoryCollection(new[]
            {
                new KeyValuePair<string, string?>("DbSchema", "laboratory_dashboard")
            })
            .Build();

        var options = new DbContextOptionsBuilder<ApplicationDbContext>()
            .UseInMemoryDatabase(databaseName: $"Laboratory_TestDb_{Guid.NewGuid()}")
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

    /// <summary>Lifecycle over a publisher substitute: for handler tests that do not assert on the status messages.</summary>
    public static ILabOrderLifecycle CreateLifecycle(ApplicationDbContext context, ISieveProcessor sieve) =>
        new LabOrderLifecycle(
            Substitute.For<IInteropPublisher>(),
            CreateRepository<LabSettings>(context, sieve),
            NullLogger<LabOrderLifecycle>.Instance);

    public static ILabPrintoutConfigProvider CreatePrintoutConfig(ApplicationDbContext context, ISieveProcessor sieve) =>
        new ClinicEz.Laboratory.Application.Common.LabPrintoutConfigProvider(CreateRepository<LabSettings>(context, sieve));

    public static ILabOrderBilling CreateBilling(ApplicationDbContext context, ISieveProcessor sieve, IInteropPublisher publisher) =>
        new LabOrderBilling(
            publisher,
            CreateRepository<Product>(context, sieve),
            NullLogger<LabOrderBilling>.Instance);
}
