using System.Threading;
using System.Threading.Tasks;
using ClinicEz.PhilHealthProxy.Domain.Models;

namespace ClinicEz.PhilHealthProxy.Domain.Interfaces;

public interface IPcapiSandboxService
{
    Task<PcuStartResponse> StartPcuAsync(PcuStartRequest req, string accreNo, CancellationToken ct = default);
    Task<PcuVerifyResponse> VerifyPcuAsync(PcuVerifyRequest req, string accreNo, CancellationToken ct = default);
    Task<YakapValidatorResponse> ValidateStandingAsync(YakapValidateStandingRequest req, string accreNo, CancellationToken ct = default);
    Task<YakapEmpanelmentResponse> SubmitEmpanelmentAsync(YakapEmpanelmentRequest req, string accreNo, CancellationToken ct = default);
    Task<YakapSelectionResponse> SubmitSelectionAsync(YakapSelectionRequest req, string accreNo, CancellationToken ct = default);
    Task<MasterlistDownloadResponse> DownloadIndividualMasterlistAsync(MasterlistIndividualRequest req, string accreNo, CancellationToken ct = default);
    Task<MasterlistDownloadResponse> DownloadBatchMasterlistAsync(MasterlistBatchRequest req, string accreNo, CancellationToken ct = default);
    Task<DataUploadResponse> UploadDataAsync(string form, PhilHealthEncryptedPayload envelope, string accreNo, string cipherKey, CancellationToken ct = default);
    Task<DataUploadStatusResponse> GetUploadStatusAsync(string uploadTxNo, string accreNo, CancellationToken ct = default);
    Task<VerificationCodeResponse> ValidateVerificationCodeAsync(VerificationCodeRequest req, string accreNo, CancellationToken ct = default);
    Task<PhilHealthEncryptedPayload> GenerateAvailmentSlipAsync(AvailmentSlipRequest req, string accreNo, string cipherKey, CancellationToken ct = default);

    SandboxStatus GetStatus();
    void SetScenario(PcapiFaultScenario scenario);
    void Reset();
}
