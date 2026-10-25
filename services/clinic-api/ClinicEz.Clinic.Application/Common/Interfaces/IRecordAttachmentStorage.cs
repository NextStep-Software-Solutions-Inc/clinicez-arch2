using System;
using System.Threading;
using System.Threading.Tasks;
using ClinicEz.Clinic.Domain.Entities;

namespace ClinicEz.Clinic.Application.Common.Interfaces;

public interface IRecordAttachmentStorage
{
    Task<ClinicRecordAttachment> EncryptAndStoreAsync(
        string tenantId,
        Guid clinicId,
        Guid patientId,
        Guid? consultationId,
        string fileName,
        string contentType,
        byte[] content,
        string recordType,
        string? notes,
        string uploadedByName,
        CancellationToken ct = default);
}
