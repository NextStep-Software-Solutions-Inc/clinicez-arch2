using System.Security.Cryptography;
using System.Security.Cryptography.X509Certificates;
using ClinicEz.Shared.Security;
using Microsoft.AspNetCore.DataProtection;
using Microsoft.AspNetCore.DataProtection.KeyManagement;
using Microsoft.AspNetCore.DataProtection.Repositories;
using Microsoft.Extensions.Configuration;
using Microsoft.Extensions.DependencyInjection;
using Microsoft.Extensions.FileProviders;
using Microsoft.Extensions.Hosting;
using Microsoft.Extensions.Options;

namespace ClinicEz.Portal.Tests.Security;

/// <summary>
/// The Data Protection key ring protects the PhilHealth credentials stored per branch: it has to live on a persistent
/// volume (DataProtection:KeysPath) and must never silently fall back to an ephemeral ring in production.
/// </summary>
public sealed class DataProtectionSetupTests : IDisposable
{
    private readonly string _keysPath = Path.Combine(Path.GetTempPath(), "portal-dpkeys-" + Guid.NewGuid().ToString("N"));

    private sealed class FakeEnvironment(string name) : IHostEnvironment
    {
        public string EnvironmentName { get; set; } = name;
        public string ApplicationName { get; set; } = "ClinicEz.Portal.Tests";
        public string ContentRootPath { get; set; } = AppContext.BaseDirectory;
        public IFileProvider ContentRootFileProvider { get; set; } = new NullFileProvider();
    }

    private static IConfiguration Config(params (string Key, string Value)[] values) =>
        new ConfigurationBuilder().AddInMemoryCollection(values.ToDictionary(v => v.Key, v => (string?)v.Value)).Build();

    private ServiceProvider Build(IConfiguration configuration, string environment = "Production")
    {
        var services = new ServiceCollection();
        services.AddPersistentDataProtection(configuration, new FakeEnvironment(environment), "ClinicEz.Portal");
        return services.BuildServiceProvider();
    }

    private static string NewCertificateBase64(string password)
    {
        using var rsa = RSA.Create(2048);
        var request = new CertificateRequest("CN=clinicez-dp-test", rsa, HashAlgorithmName.SHA256, RSASignaturePadding.Pkcs1);
        using var certificate = request.CreateSelfSigned(DateTimeOffset.UtcNow.AddDays(-1), DateTimeOffset.UtcNow.AddDays(30));
        return Convert.ToBase64String(certificate.Export(X509ContentType.Pfx, password));
    }

    public void Dispose()
    {
        if (Directory.Exists(_keysPath)) Directory.Delete(_keysPath, recursive: true);
    }

    [Fact]
    public void KeyRing_IsPersistedToTheConfiguredPath_AndNamedAfterTheService()
    {
        using var provider = Build(Config(("DataProtection:KeysPath", _keysPath)));

        var repository = Assert.IsType<FileSystemXmlRepository>(provider.GetRequiredService<IOptions<KeyManagementOptions>>().Value.XmlRepository);
        Assert.Equal(new DirectoryInfo(_keysPath).FullName, repository.Directory.FullName);
        Assert.Equal("ClinicEz.Portal", provider.GetRequiredService<IOptions<DataProtectionOptions>>().Value.ApplicationDiscriminator);
    }

    [Fact]
    public void ProtectedData_SurvivesARestart_BecauseTheRingIsReloadedFromDisk()
    {
        var configuration = Config(("DataProtection:KeysPath", _keysPath));
        string protectedValue;
        using (var first = Build(configuration))
        {
            protectedValue = first.GetRequiredService<IDataProtectionProvider>().CreateProtector("purpose").Protect("branch-password");
        }

        using var second = Build(configuration);

        Assert.Equal("branch-password", second.GetRequiredService<IDataProtectionProvider>().CreateProtector("purpose").Unprotect(protectedValue));
        Assert.NotEmpty(Directory.GetFiles(_keysPath, "key-*.xml"));
    }

    [Fact]
    public void WithoutAKeysPath_AProductionHostRefusesToStart()
    {
        var ex = Assert.Throws<InvalidOperationException>(() => Build(Config()));

        Assert.Contains("DataProtection:KeysPath", ex.Message);
        Assert.Contains("DataProtection__KeysPath", ex.Message);
    }

    [Fact]
    public void WithoutAKeysPath_DevelopmentUsesTheDefaultKeyRing()
    {
        using var provider = Build(Config(), "Development");

        Assert.IsNotType<FileSystemXmlRepository>(provider.GetRequiredService<IOptions<KeyManagementOptions>>().Value.XmlRepository);
    }

    [Fact]
    public void WithACertificate_TheKeysAreEncryptedAtRest_AndStillUsable()
    {
        const string password = "pfx-password";
        var configuration = Config(
            ("DataProtection:KeysPath", _keysPath),
            ("DataProtection:CertificateBase64", NewCertificateBase64(password)),
            ("DataProtection:CertificatePassword", password));

        string protectedValue;
        using (var first = Build(configuration))
        {
            protectedValue = first.GetRequiredService<IDataProtectionProvider>().CreateProtector("purpose").Protect("secret");
        }

        var keyXml = File.ReadAllText(Directory.GetFiles(_keysPath, "key-*.xml").Single());
        Assert.DoesNotContain("<masterKey", keyXml);
        Assert.Contains("encryptedKey", keyXml, StringComparison.OrdinalIgnoreCase);

        using var second = Build(configuration);
        Assert.Equal("secret", second.GetRequiredService<IDataProtectionProvider>().CreateProtector("purpose").Unprotect(protectedValue));
    }

    [Fact]
    public void ACertificateThatCannotBeLoaded_FailsWithAClearMessage()
    {
        var configuration = Config(
            ("DataProtection:KeysPath", _keysPath),
            ("DataProtection:CertificateBase64", NewCertificateBase64("right")),
            ("DataProtection:CertificatePassword", "wrong"));

        var ex = Assert.Throws<InvalidOperationException>(() => Build(configuration));

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
