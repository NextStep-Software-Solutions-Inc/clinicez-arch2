using System.Security.Cryptography.X509Certificates;
using Microsoft.AspNetCore.DataProtection;
using Microsoft.AspNetCore.DataProtection.EntityFrameworkCore;
using Microsoft.EntityFrameworkCore;
using Microsoft.Extensions.Configuration;
using Microsoft.Extensions.DependencyInjection;
using Microsoft.Extensions.Hosting;

namespace ClinicEz.Shared.Security;

/// <summary>
/// ASP.NET Data Protection for services that store protected values (tenant credentials, tokens).
/// Key ring XMLs are persisted strictly in PostgreSQL via Entity Framework Core (PersistKeysToDbContext).
/// </summary>
/// <remarks>
/// Settings (section <c>DataProtection</c>): optional <c>CertificateBase64</c> (+ <c>CertificatePassword</c>): a PKCS#12
/// (.pfx) file as base64 that encrypts the key ring at rest.
/// </remarks>
public static class DataProtectionSetup
{
    public const string SectionName = "DataProtection";

    public static IDataProtectionBuilder AddPersistentDataProtection<TDbContext>(
        this IServiceCollection services,
        IConfiguration configuration,
        IHostEnvironment environment,
        string applicationName)
        where TDbContext : DbContext, IDataProtectionKeyContext
    {
        ArgumentNullException.ThrowIfNull(services);
        ArgumentNullException.ThrowIfNull(configuration);
        ArgumentNullException.ThrowIfNull(environment);
        ArgumentException.ThrowIfNullOrWhiteSpace(applicationName);

        var section = configuration.GetSection(SectionName);
        var certificateBase64 = section["CertificateBase64"];

        var builder = services.AddDataProtection()
            .SetApplicationName(applicationName)
            .PersistKeysToDbContext<TDbContext>();

        if (!string.IsNullOrWhiteSpace(certificateBase64))
        {
            builder.ProtectKeysWithCertificate(LoadCertificate(certificateBase64, section["CertificatePassword"]));
        }

        return builder;
    }

    private static X509Certificate2 LoadCertificate(string certificateBase64, string? password)
    {
        try
        {
            return X509CertificateLoader.LoadPkcs12(Convert.FromBase64String(certificateBase64.Trim()), password);
        }
        catch (Exception ex) when (ex is FormatException or System.Security.Cryptography.CryptographicException)
        {
            throw new InvalidOperationException(
                "DataProtection:CertificateBase64 is not the base64 of a valid PKCS#12 (.pfx) file, or DataProtection:CertificatePassword is wrong.", ex);
        }
    }
}
