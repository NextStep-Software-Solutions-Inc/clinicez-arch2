using Microsoft.AspNetCore.Identity;

namespace ClinicEz.Shared.LocalAuth;

public interface IFacilityPasswordHasher
{
    string Hash(string password);

    bool Verify(string hash, string password);

    /// <summary>Returns a list of human-readable problems; empty when the password is acceptable.</summary>
    IReadOnlyList<string> ValidateStrength(string? password, int minLength);
}

/// <summary>PBKDF2 hashing via ASP.NET Core's <see cref="PasswordHasher{TUser}"/> (versioned, self-describing hashes).</summary>
public sealed class FacilityPasswordHasher : IFacilityPasswordHasher
{
    private static readonly PasswordHasher<object> Hasher = new();
    private static readonly object Subject = new();

    public string Hash(string password) => Hasher.HashPassword(Subject, password);

    public bool Verify(string hash, string password)
    {
        if (string.IsNullOrEmpty(hash) || string.IsNullOrEmpty(password)) return false;
        var result = Hasher.VerifyHashedPassword(Subject, hash, password);
        return result is PasswordVerificationResult.Success or PasswordVerificationResult.SuccessRehashNeeded;
    }

    public IReadOnlyList<string> ValidateStrength(string? password, int minLength)
    {
        var problems = new List<string>();
        if (string.IsNullOrWhiteSpace(password) || password.Length < minLength)
            problems.Add($"Password must be at least {minLength} characters long.");
        if (password is not null && password.Length > 128)
            problems.Add("Password must be at most 128 characters long.");
        if (password is not null && !password.Any(char.IsLetter))
            problems.Add("Password must contain at least one letter.");
        if (password is not null && !password.Any(char.IsDigit))
            problems.Add("Password must contain at least one digit.");
        return problems;
    }
}
