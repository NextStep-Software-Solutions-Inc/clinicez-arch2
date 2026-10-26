namespace ClinicEz.Comms.MigrationTool.Models;

public static class MigrationExitCodes
{
    public const int Success = 0;
    public const int ArgumentError = 1;
    public const int SignatureFailure = 2;
    public const int ChecksumMismatch = 3;
    public const int DatabaseConflict = 4;
    public const int IoOrCryptoFailure = 5;
}
