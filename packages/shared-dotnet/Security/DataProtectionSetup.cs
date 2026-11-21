using System.Security.Cryptography;
using System.Security.Cryptography.X509Certificates;
using System.Text;
using System.Xml.Linq;
using Microsoft.AspNetCore.DataProtection;
using Microsoft.AspNetCore.DataProtection.EntityFrameworkCore;
using Microsoft.AspNetCore.DataProtection.KeyManagement;
using Microsoft.AspNetCore.DataProtection.Repositories;
using Microsoft.AspNetCore.DataProtection.XmlEncryption;
using Microsoft.EntityFrameworkCore;
using Microsoft.Extensions.Configuration;
using Microsoft.Extensions.DependencyInjection;
using Microsoft.Extensions.Hosting;

namespace ClinicEz.Shared.Security;

/// <summary>
/// ASP.NET Data Protection for services that store protected values (tenant credentials, tokens).
/// Key ring XMLs are persisted strictly in PostgreSQL via Entity Framework Core (PersistKeysToDbContext)
/// and encrypted at rest using either a configured X.509 certificate or AES-256-GCM key wrapping.
/// </summary>
/// <remarks>
/// Settings (section <c>DataProtection</c>): optional <c>CertificateBase64</c> (+ <c>CertificatePassword</c>): a PKCS#12
/// (.pfx) file as base64 that encrypts the key ring at rest. When no certificate is provided, keys are encrypted at rest
/// with AES-256-GCM derived from service key material.
/// </remarks>
public static class DataProtectionSetup
{
    public const string SectionName = "DataProtection";

    public static IDataProtectionBuilder AddPersistentDataProtection<TDbContext>(
        this IServiceCollection services,
        IConfiguration configuration,
        IHostEnvironment? environment,
        string applicationName)
        where TDbContext : DbContext, IDataProtectionKeyContext
    {
        ArgumentNullException.ThrowIfNull(services);
        ArgumentNullException.ThrowIfNull(configuration);
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
        else
        {
            var keyRingKey = new DataProtectionAesKey(DeriveEncryptionKey(configuration, applicationName));
            services.AddSingleton(keyRingKey);
            services.Configure<KeyManagementOptions>(options =>
            {
                options.XmlEncryptor = new AesGcmXmlEncryptor(keyRingKey);
            });
        }

        return builder;
    }

    /// <summary>
    /// Configures Data Protection for stateless, zero-database services (e.g. philhealth-proxy) where protected values
    /// live only in an in-memory cache for the lifetime of the process.
    /// </summary>
    public static IDataProtectionBuilder AddInMemoryEncryptedDataProtection(
        this IServiceCollection services,
        IConfiguration configuration,
        string applicationName)
    {
        ArgumentNullException.ThrowIfNull(services);
        ArgumentNullException.ThrowIfNull(configuration);
        ArgumentException.ThrowIfNullOrWhiteSpace(applicationName);

        var keyRingKey = new DataProtectionAesKey(DeriveEncryptionKey(configuration, applicationName));
        var repository = new InMemoryDataProtectionXmlRepository();

        services.AddSingleton(keyRingKey);
        services.Configure<KeyManagementOptions>(options =>
        {
            options.XmlRepository = repository;
            options.XmlEncryptor = new AesGcmXmlEncryptor(keyRingKey);
        });

        return services.AddDataProtection()
            .SetApplicationName(applicationName);
    }

    internal static byte[] DeriveEncryptionKey(IConfiguration configuration, string applicationName)
    {
        var secret = configuration["DataProtection:EncryptionKey"]
            ?? configuration["ClinicEncryption:MasterSecret"]
            ?? configuration["Jwt:SigningKey"]
            ?? configuration["Sharing:SigningKey"]
            ?? configuration["ClaimToken:SigningKey"]
            ?? configuration["Messaging:SigningKey"]
            ?? configuration["Messaging:ClientSecret"]
            ?? applicationName;

        return SHA256.HashData(Encoding.UTF8.GetBytes($"ClinicEz.DataProtection.v1:{applicationName}:{secret.Trim()}"));
    }

    private static X509Certificate2 LoadCertificate(string certificateBase64, string? password)
    {
        try
        {
            return X509CertificateLoader.LoadPkcs12(Convert.FromBase64String(certificateBase64.Trim()), password);
        }
        catch (Exception ex) when (ex is FormatException or CryptographicException)
        {
            throw new InvalidOperationException(
                "DataProtection:CertificateBase64 is not the base64 of a valid PKCS#12 (.pfx) file, or DataProtection:CertificatePassword is wrong.", ex);
        }
    }
}

public sealed record DataProtectionAesKey(byte[] Key);

public sealed class AesGcmXmlEncryptor(DataProtectionAesKey keyRingKey) : IXmlEncryptor
{
    private const int NonceSize = 12;
    private const int TagSize = 16;

    public EncryptedXmlInfo Encrypt(XElement plaintextElement)
    {
        ArgumentNullException.ThrowIfNull(plaintextElement);

        var plaintextBytes = Encoding.UTF8.GetBytes(plaintextElement.ToString(SaveOptions.DisableFormatting));
        var nonce = RandomNumberGenerator.GetBytes(NonceSize);
        var ciphertext = new byte[plaintextBytes.Length];
        var tag = new byte[TagSize];

        using (var aes = new AesGcm(keyRingKey.Key, TagSize))
        {
            aes.Encrypt(nonce, plaintextBytes, ciphertext, tag);
        }

        var combined = new byte[NonceSize + TagSize + ciphertext.Length];
        Buffer.BlockCopy(nonce, 0, combined, 0, NonceSize);
        Buffer.BlockCopy(tag, 0, combined, NonceSize, TagSize);
        Buffer.BlockCopy(ciphertext, 0, combined, NonceSize + TagSize, ciphertext.Length);

        var element = new XElement("encryptedKey",
            new XComment(" This key is encrypted with AES-256-GCM. "),
            new XElement("value", Convert.ToBase64String(combined)));

        return new EncryptedXmlInfo(element, typeof(AesGcmXmlDecryptor));
    }
}

public sealed class AesGcmXmlDecryptor : IXmlDecryptor
{
    private const int NonceSize = 12;
    private const int TagSize = 16;
    private readonly byte[] _key;

    public AesGcmXmlDecryptor(IServiceProvider services)
    {
        var keyHolder = services.GetService<DataProtectionAesKey>()
            ?? throw new InvalidOperationException("DataProtectionAesKey is not registered in the service provider.");
        _key = keyHolder.Key;
    }

    public XElement Decrypt(XElement encryptedElement)
    {
        ArgumentNullException.ThrowIfNull(encryptedElement);

        var valueElement = encryptedElement.Element("value")
            ?? encryptedElement.Descendants().FirstOrDefault(e => e.Name.LocalName == "value")
            ?? throw new InvalidOperationException("Encrypted DataProtection key XML is missing the <value> element.");

        var combined = Convert.FromBase64String(valueElement.Value.Trim());
        if (combined.Length < NonceSize + TagSize)
        {
            throw new CryptographicException("Encrypted DataProtection key payload is truncated.");
        }

        var nonce = combined.AsSpan(0, NonceSize);
        var tag = combined.AsSpan(NonceSize, TagSize);
        var ciphertext = combined.AsSpan(NonceSize + TagSize);
        var plaintextBytes = new byte[ciphertext.Length];

        using (var aes = new AesGcm(_key, TagSize))
        {
            aes.Decrypt(nonce, ciphertext, tag, plaintextBytes);
        }

        return XElement.Parse(Encoding.UTF8.GetString(plaintextBytes));
    }
}

internal sealed class InMemoryDataProtectionXmlRepository : IXmlRepository
{
    private readonly List<XElement> _elements = [];
    private readonly Lock _lock = new();

    public IReadOnlyCollection<XElement> GetAllElements()
    {
        lock (_lock)
        {
            return _elements.Select(e => new XElement(e)).ToArray();
        }
    }

    public void StoreElement(XElement element, string friendlyName)
    {
        ArgumentNullException.ThrowIfNull(element);
        lock (_lock)
        {
            _elements.Add(new XElement(element));
        }
    }
}
