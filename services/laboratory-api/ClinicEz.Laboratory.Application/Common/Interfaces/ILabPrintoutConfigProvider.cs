using System.Threading;
using System.Threading.Tasks;
using ClinicEz.Laboratory.Domain.Entities;
using ClinicEz.Shared.Documents.Configuration;

namespace ClinicEz.Laboratory.Application.Common.Interfaces;

/// <summary>The letterhead of the laboratory that owns an order, built only from what that laboratory has on record.</summary>
public interface ILabPrintoutConfigProvider
{
    Task<TenantPrintoutConfig> GetAsync(LabRequisition requisition, CancellationToken ct);
}
