namespace ClinicEz.Portal.Application.Interfaces;

/// <summary>Encrypts the PhilHealth statutory credentials a branch stores (SOAP username, password and payload cipher key).</summary>
public interface IPhilHealthSecretProtector
{
    string Protect(string plaintext);

    /// <summary>
    /// The plaintext of a stored value. A value that was stored before encryption existed (or that this key ring cannot
    /// open) is returned as it is, so credentials entered earlier keep working.
    /// </summary>
    string Unprotect(string stored);
}