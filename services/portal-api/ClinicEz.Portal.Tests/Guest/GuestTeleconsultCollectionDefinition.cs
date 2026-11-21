using Xunit;

namespace ClinicEz.Portal.Tests.Guest;

/// <summary>
/// Serializes execution of tests interacting with GuestVerificationService's in-memory store
/// to prevent concurrent ClearStore() calls from racing across parallel test classes.
/// </summary>
[CollectionDefinition("GuestTeleconsultTests", DisableParallelization = true)]
public class GuestTeleconsultCollectionDefinition
{
}
