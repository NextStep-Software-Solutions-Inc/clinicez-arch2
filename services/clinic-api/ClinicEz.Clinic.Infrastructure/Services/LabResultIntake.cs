using System;
using System.Linq;
using System.Threading;
using System.Threading.Tasks;
using ClinicEz.Clinic.Application.Common;
using ClinicEz.Clinic.Application.Common.Interfaces;
using ClinicEz.Clinic.Application.Features.LabOrders;
using ClinicEz.Clinic.Domain.Entities;
using ClinicEz.Clinic.Domain.Enums;
using ClinicEz.Clinic.Infrastructure.Persistence;
using ClinicEz.Shared.Exceptions;
using ClinicEz.Shared.Interoperability;
using Microsoft.EntityFrameworkCore;
using Microsoft.Extensions.Options;

namespace ClinicEz.Clinic.Infrastructure.Services;

public sealed class LabResultIntake : ILabResultIntake
{
    private readonly ApplicationDbContext _db;
    private readonly ILabResultFileStore _files;
    private readonly IPatientDocumentPublisher _documents;
    private readonly ClinicUploadOptions _options;

    public LabResultIntake(
        ApplicationDbContext db,
        ILabResultFileStore files,
        IPatientDocumentPublisher documents,
        IOptions<ClinicUploadOptions> options)
    {
        _db = db;
        _files = files;
        _documents = documents;
        _options = options.Value;
    }

    public async Task<LabResultIntakeOutcome> SubmitAsync(LabResultSubmission submission, CancellationToken ct)
    {
        if (submission.Source == ResultSource.ClinicEzLab)
        {
            throw new ArgumentException("A ClinicEZ laboratory report is ingested from its finalized-report message, not through the upload intake.", nameof(submission));
        }

        var contentType = NormalizeContentType(submission.ContentType);
        ValidateFile(submission.Content, contentType);

        var order = await _db.LabOrders
            .IgnoreQueryFilters()
            .Include(o => o.Items)
            .FirstOrDefaultAsync(o => !o.IsDeleted && o.ClinicId == submission.ClinicId && o.Id == submission.LabOrderId, ct)
            ?? throw new NotFoundException("Lab order was not found.");

        var now = DateTime.UtcNow;
        if (submission.Grant is { } grant)
        {
            if (grant.ClinicId != order.ClinicId || grant.LabOrderId != order.Id
                || grant.RevokedAt != null || grant.ExpiresAt <= now || grant.Used >= grant.MaxUploads)
            {
                throw new NotFoundException("Invalid or expired laboratory upload link.");
            }

            grant.Used++;
            _db.UploadGrants.Update(grant);
        }

        var result = new ClinicLabResult
        {
            Id = Guid.NewGuid(),
            TenantId = order.TenantId ?? string.Empty,
            ClinicId = order.ClinicId,
            LabOrderId = order.Id,
            Source = submission.Source,
            Verification = VerificationState.Unverified,
            ExternalLabName = submission.ExternalLabName?.Trim(),
            Notes = submission.Notes?.Trim(),
            FileName = SafeFileName(submission.FileName),
            ContentType = contentType,
            UploadedByPatientId = submission.UploadedByPatientId,
            SubmittedAt = now,
            CreatedAt = now,
            CreatedBy = submission.Source.ToString()
        };
        await _files.StoreAsync(result, submission.Content, ct);
        _db.LabResults.Add(result);

        if (order.Stage != LabOrderStage.ResultFinalized)
        {
            order.Stage = LabOrderStage.ExternalSubmitted;
            order.StageChangedAt = now;
        }

        order.Status = LabOrderStatus.CompletedWithExternalReport;
        order.UploadedBy = submission.Source == ResultSource.PatientUploaded ? "Patient" : "ExternalLab";
        order.ReportReleasedAt = now;
        if (!string.IsNullOrWhiteSpace(result.ExternalLabName))
        {
            order.ExternalLabName = result.ExternalLabName;
        }

        foreach (var item in order.Items)
        {
            item.Status = LabOrderStatus.CompletedWithExternalReport;
        }

        await _documents.PublishAsync(LabResultDocuments.For(order, result), ct);
        await _db.SaveChangesAsync(ct);

        return new LabResultIntakeOutcome(result.Id, order.OrderNumber, now);
    }

    private void ValidateFile(byte[] content, string contentType)
    {
        if (content.Length == 0)
        {
            throw new BadRequestException("The uploaded file is empty.");
        }

        if (content.LongLength > _options.UploadMaxBytes)
        {
            throw new BadRequestException($"The file is larger than the {_options.UploadMaxBytes / (1024 * 1024)} MB upload limit.");
        }

        if (!_options.UploadAllowedContentTypes.Contains(contentType, StringComparer.OrdinalIgnoreCase))
        {
            throw new BadRequestException(
                $"Files of type '{contentType}' are not accepted. Allowed: {string.Join(", ", _options.UploadAllowedContentTypes)}.");
        }
    }

    /// <summary>The bare media type, lower-cased, without parameters (<c>application/pdf; charset=...</c> becomes <c>application/pdf</c>).</summary>
    public static string NormalizeContentType(string? contentType)
    {
        var bare = contentType?.Split(';')[0].Trim().ToLowerInvariant();
        return string.IsNullOrEmpty(bare) ? "application/octet-stream" : bare;
    }

    private static string? SafeFileName(string? fileName)
    {
        if (string.IsNullOrWhiteSpace(fileName)) return null;

        var name = System.IO.Path.GetFileName(fileName.Trim());
        foreach (var invalid in System.IO.Path.GetInvalidFileNameChars())
        {
            name = name.Replace(invalid, '_');
        }

        return name.Length > 255 ? name[..255] : name;
    }
}
