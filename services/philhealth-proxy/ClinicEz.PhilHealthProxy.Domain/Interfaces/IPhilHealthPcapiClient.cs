using System.Threading;
using System.Threading.Tasks;
using ClinicEz.PhilHealthProxy.Domain.Entities;
using ClinicEz.PhilHealthProxy.Domain.Models;

namespace ClinicEz.PhilHealthProxy.Domain.Interfaces;

public interface IPhilHealthPcapiClient
{
    Task<PcapiTokenData> AuthenticateAsync(PhilHealthTenant tenant, CancellationToken ct = default);
    Task<PcuStartResponse> StartPcuAsync(PcuStartRequest req, PhilHealthTenant tenant, CancellationToken ct = default);
    Task<PcuVerifyResponse> VerifyPcuAsync(PcuVerifyRequest req, PhilHealthTenant tenant, CancellationToken ct = default);
    Task<YakapValidatorResponse> ValidateStandingAsync(YakapValidateStandingRequest req, PhilHealthTenant tenant, CancellationToken ct = default);
    Task<YakapEmpanelmentResponse> SubmitEmpanelmentAsync(YakapEmpanelmentRequest req, PhilHealthTenant tenant, CancellationToken ct = default);
    Task<YakapSelectionResponse> SubmitSelectionAsync(YakapSelectionRequest req, PhilHealthTenant tenant, CancellationToken ct = default);
    Task<MasterlistDownloadResponse> DownloadIndividualMasterlistAsync(MasterlistIndividualRequest req, PhilHealthTenant tenant, CancellationToken ct = default);
    Task<MasterlistDownloadResponse> DownloadBatchMasterlistAsync(MasterlistBatchRequest req, PhilHealthTenant tenant, CancellationToken ct = default);
    Task<DataUploadResponse> UploadDataAsync(string form, PhilHealthEncryptedPayload envelope, PhilHealthTenant tenant, CancellationToken ct = default);
    Task<DataUploadStatusResponse> GetUploadStatusAsync(string uploadTxNo, PhilHealthTenant tenant, CancellationToken ct = default);
    Task<VerificationCodeResponse> ValidateVerificationCodeAsync(VerificationCodeRequest req, PhilHealthTenant tenant, CancellationToken ct = default);
    Task<PhilHealthEncryptedPayload> GenerateAvailmentSlipAsync(AvailmentSlipRequest req, PhilHealthTenant tenant, CancellationToken ct = default);
}
