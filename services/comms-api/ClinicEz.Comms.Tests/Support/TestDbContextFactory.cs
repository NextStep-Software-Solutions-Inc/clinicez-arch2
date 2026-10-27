using System;
using ClinicEz.Comms.Application.Common.Interfaces;
using ClinicEz.Comms.Infrastructure.Persistence;
using Microsoft.EntityFrameworkCore;
using Microsoft.Extensions.Configuration;

namespace ClinicEz.Comms.Tests.Support;

public static class TestDbContextFactory
{
    public static CommsDbContext CreateInMemory(string? dbName = null, string? tenantId = null)
    {
        var options = new DbContextOptionsBuilder<CommsDbContext>()
            .UseInMemoryDatabase(databaseName: dbName ?? Guid.NewGuid().ToString())
            .Options;

        var config = new ConfigurationBuilder().Build();
        var context = new CommsDbContext(options, config)
        {
            CurrentTenantId = tenantId
        };

        return context;
    }
}
