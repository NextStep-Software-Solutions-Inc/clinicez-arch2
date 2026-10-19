using ClinicEz.Portal.Application.Interfaces;
using Microsoft.AspNetCore.DataProtection;

namespace ClinicEz.Portal.Infrastructure.PhilHealth;

public sealed class PhilHealthSecretProtector(IDataProtectionProvider dataProtectionProvider) : IPhilHealthSecretProtector
{
    private const string Purpose = "ClinicEz.Portal.PhilHealthCredentials";

    private readonly IDataProtector _protector = dataProtectionProvider.CreateProtector(Purpose);

    public string Protect(string plaintext) => _protector.Protect(plaintext);

    public string Unprotect(string stored)
    {
        try
        {
            return _protector.Unprotect(stored);
        }
        catch (System.Security.Cryptography.CryptographicException)
        {
            return stored;
        }
    }
}