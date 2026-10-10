using System.Security.Cryptography;
using System.Security.Cryptography.X509Certificates;
using ClinicEz.Portal.Infrastructure.Persistence;
using ClinicEz.Shared.Security;
using Microsoft.AspNetCore.DataProtection;
using Microsoft.AspNetCore.DataProtection.EntityFrameworkCore;
using Microsoft.AspNetCore.DataProtection.KeyManagement;
using Microsoft.AspNetCore.DataProtection.Repositories;
using Microsoft.EntityFrameworkCore;
using Microsoft.Extensions.Configuration;
using Microsoft.Extensions.DependencyInjection;
using Microsoft.Extensions.FileProviders;
using Microsoft.Extensions.Hosting;
using Microsoft.Extensions.Options;

namespace ClinicEz.Portal.Tests.Security;

/// <summary>
/// The Data Protection key ring protects the PhilHealth credentials stored per branch: it is persisted
/// directly inside PostgreSQL via EntityFrameworkCore (ApplicationDbContext).
/// </summary>
public sealed class DataProtectionSetupTests
{
    private sealed class FakeEnvironment(string name) : IHostEnvironment
    {
        public string EnvironmentName { get; set; } = name;
        public string ApplicationName { get; set; } = "ClinicEz.Portal.Tests";
        public string ContentRootPath { get; set; } = AppContext.BaseDirectory;
        public IFileProvider ContentRootFileProvider { get; set; } = new NullFileProvider();
    }

    private static IConfiguration Config(params (string Key, string Value)[] values) =>
        new ConfigurationBuilder().AddInMemoryCollection(values.ToDictionary(v => v.Key, v => (string?)v.Value)).Build();

    private ServiceProvider BuildDbContext(IConfiguration configuration, string environment = "Production")
    {
        var dbName = "dp_test_" + Guid.NewGuid();
        var services = new ServiceCollection();
        services.AddDbContext<ApplicationDbContext>(options =>
            options.UseInMemoryDatabase(dbName));
        services.AddPersistentDataProtection<ApplicationDbContext>(
            configuration, new FakeEnvironment(environment), "ClinicEz.Portal");
        return services.BuildServiceProvider();
    }

    private ServiceProvider BuildDbContextWithStore(DbContextOptions<ApplicationDbContext> dbOptions, IConfiguration configuration, string environment = "Production")
    {
        var services = new ServiceCollection();
        services.AddDbContext<ApplicationDbContext>(options => options.UseInMemoryDatabase(dbOptions.ContextType.Name));
        services.AddSingleton(dbOptions);
        services.AddScoped<ApplicationDbContext>(sp => new ApplicationDbContext(sp.GetRequiredService<DbContextOptions<ApplicationDbContext>>()));
        services.AddPersistentDataProtection<ApplicationDbContext>(
            configuration, new FakeEnvironment(environment), "ClinicEz.Portal");
        return services.BuildServiceProvider();
    }

    private static string NewCertificateBase64(string password)
    {
        using var rsa = RSA.Create(2048);
        var request = new CertificateRequest("CN=clinicez-dp-test", rsa, HashAlgorithmName.SHA256, RSASignaturePadding.Pkcs1);
        using var certificate = request.CreateSelfSigned(DateTimeOffset.UtcNow.AddDays(-1), DateTimeOffset.UtcNow.AddDays(30));
        return Convert.ToBase64String(certificate.Export(X509ContentType.Pfx, password));
    }

    [Fact]
    public void DbContext_KeyRing_IsPersistedToDbContext()
    {
        using var provider = BuildDbContext(Config());

        var repository = provider.GetRequiredService<IOptions<KeyManagementOptions>>().Value.XmlRepository;
        Assert.IsType<EntityFrameworkCoreXmlRepository<ApplicationDbContext>>(repository);
        Assert.Equal("ClinicEz.Portal", provider.GetRequiredService<IOptions<DataProtectionOptions>>().Value.ApplicationDiscriminator);
    }

    [Fact]
    public void ProtectedData_SurvivesARestart_BecauseTheRingIsPersistedToDbContext()
    {
        var dbOptions = new DbContextOptionsBuilder<ApplicationDbContext>()
            .UseInMemoryDatabase("dp_test_" + Guid.NewGuid())
            .Options;
        var configuration = Config();

        string protectedValue;
        using (var first = BuildDbContextWithStore(dbOptions, configuration))
        {
            protectedValue = first.GetRequiredService<IDataProtectionProvider>().CreateProtector("purpose").Protect("branch-password");
        }

        using (var db = new ApplicationDbContext(dbOptions))
        {
            Assert.NotEmpty(db.DataProtectionKeys.ToList());
        }

        using var second = BuildDbContextWithStore(dbOptions, configuration);
        Assert.Equal("branch-password", second.GetRequiredService<IDataProtectionProvider>().CreateProtector("purpose").Unprotect(protectedValue));
    }

    [Fact]
    public void WithACertificate_TheKeysAreEncryptedAtRest_AndStillUsable()
    {
        const string password = "pfx-password";
        var dbOptions = new DbContextOptionsBuilder<ApplicationDbContext>()
            .UseInMemoryDatabase("dp_test_" + Guid.NewGuid())
            .Options;
        var configuration = Config(
            ("DataProtection:CertificateBase64", NewCertificateBase64(password)),
            ("DataProtection:CertificatePassword", password));

        string protectedValue;
        using (var first = BuildDbContextWithStore(dbOptions, configuration))
        {
            protectedValue = first.GetRequiredService<IDataProtectionProvider>().CreateProtector("purpose").Protect("secret");
        }

        using (var db = new ApplicationDbContext(dbOptions))
        {
            var keyXml = db.DataProtectionKeys.Single().Xml;
            Assert.DoesNotContain("<masterKey", keyXml);
            Assert.Contains("encryptedKey", keyXml, StringComparison.OrdinalIgnoreCase);
        }

        using var second = BuildDbContextWithStore(dbOptions, configuration);
        Assert.Equal("secret", second.GetRequiredService<IDataProtectionProvider>().CreateProtector("purpose").Unprotect(protectedValue));
    }

    [Fact]
    public void ACertificateThatCannotBeLoaded_FailsWithAClearMessage()
    {
        var configuration = Config(
            ("DataProtection:CertificateBase64", NewCertificateBase64("right")),
            ("DataProtection:CertificatePassword", "wrong"));

        var ex = Assert.Throws<InvalidOperationException>(() => BuildDbContext(configuration));

        Assert.Contains("DataProtection:CertificateBase64", ex.Message);
    }
}

public sealed class RequiredSettingsTests
{
    private sealed class FakeEnvironment(string name) : IHostEnvironment
    {
        public string EnvironmentName { get; set; } = name;
        public string ApplicationName { get; set; } = "ClinicEz.Portal.Tests";
        public string ContentRootPath { get; set; } = AppContext.BaseDirectory;
        public IFileProvider ContentRootFileProvider { get; set; } = new NullFileProvider();
    }

    private static IConfiguration Config(params (string Key, string Value)[] values) =>
        new ConfigurationBuilder().AddInMemoryCollection(values.ToDictionary(v => v.Key, v => (string?)v.Value)).Build();

    [Fact]
    public void OutsideDevelopment_EveryMissingKeyIsReportedWithItsEnvironmentVariable()
    {
        var ex = Assert.Throws<InvalidOperationException>(() => RequiredSettings.EnsureConfigured(
            Config(("Internal:ApiKey", "  "), ("Xendit:SecretKey", "sk")),
            new FakeEnvironment("Production"),
            "Internal:ApiKey", "Xendit:SecretKey", "Xendit:CallbackToken"));

        Assert.Contains("Internal:ApiKey (env Internal__ApiKey)", ex.Message);
        Assert.Contains("Xendit:CallbackToken (env Xendit__CallbackToken)", ex.Message);
        Assert.DoesNotContain("Xendit:SecretKey", ex.Message);
    }

    [Fact]
    public void OutsideDevelopment_WithEverythingConfigured_Passes()
    {
        RequiredSettings.EnsureConfigured(Config(("Internal:ApiKey", "k")), new FakeEnvironment("Production"), "Internal:ApiKey");
    }

    [Fact]
    public void InDevelopment_MissingKeysAreTolerated()
    {
        RequiredSettings.EnsureConfigured(Config(), new FakeEnvironment("Development"), "Internal:ApiKey", "Xendit:CallbackToken");
    }
}
