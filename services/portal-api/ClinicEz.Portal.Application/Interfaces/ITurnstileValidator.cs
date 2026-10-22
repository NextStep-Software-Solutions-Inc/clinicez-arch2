using System.Threading;
using System.Threading.Tasks;

namespace ClinicEz.Portal.Application.Interfaces;

/// <summary>
/// Service contract for validating Cloudflare Turnstile bot protection tokens.
/// Inherits from unified shared Turnstile contract.
/// </summary>
public interface ITurnstileValidator : ClinicEz.Shared.Security.Turnstile.ITurnstileValidator
{
}
