using System;
using System.Collections.Generic;
using System.Linq;
using System.Text.Json;
using ClinicEz.Clinic.Domain.Entities;
using Microsoft.EntityFrameworkCore;
using Microsoft.EntityFrameworkCore.ChangeTracking;
using Microsoft.EntityFrameworkCore.Metadata.Builders;
using Microsoft.EntityFrameworkCore.Storage.ValueConversion;

namespace ClinicEz.Clinic.Infrastructure.Persistence.Configurations;

public sealed class PatientLinkRequestConfiguration : IEntityTypeConfiguration<PatientLinkRequest>
{
    public void Configure(EntityTypeBuilder<PatientLinkRequest> entity)
    {
        var claimsConverter = new ValueConverter<Dictionary<string, string>?, string?>(
            v => v == null ? null : JsonSerializer.Serialize(v, (JsonSerializerOptions?)null),
            v => string.IsNullOrEmpty(v)
                ? null
                : JsonSerializer.Deserialize<Dictionary<string, string>>(v, (JsonSerializerOptions?)null));

        var claimsComparer = new ValueComparer<Dictionary<string, string>?>(
            (d1, d2) => d1 != null && d2 != null ? d1.Count == d2.Count && !d1.Except(d2).Any() : d1 == d2,
            d => d == null ? 0 : d.Aggregate(0, (a, p) => HashCode.Combine(a, p.Key.GetHashCode(), p.Value.GetHashCode())),
            d => d == null ? null : new Dictionary<string, string>(d));

        var candidatesConverter = new ValueConverter<List<PatientLinkCandidateMatch>?, string?>(
            v => v == null ? null : JsonSerializer.Serialize(v, (JsonSerializerOptions?)null),
            v => string.IsNullOrEmpty(v)
                ? null
                : JsonSerializer.Deserialize<List<PatientLinkCandidateMatch>>(v, (JsonSerializerOptions?)null));

        var candidatesComparer = new ValueComparer<List<PatientLinkCandidateMatch>?>(
            (c1, c2) => JsonSerializer.Serialize(c1, (JsonSerializerOptions?)null) == JsonSerializer.Serialize(c2, (JsonSerializerOptions?)null),
            c => c == null ? 0 : JsonSerializer.Serialize(c, (JsonSerializerOptions?)null).GetHashCode(),
            c => c == null ? null : JsonSerializer.Deserialize<List<PatientLinkCandidateMatch>>(JsonSerializer.Serialize(c, (JsonSerializerOptions?)null), (JsonSerializerOptions?)null));

        entity.ToTable("PatientLinkRequests");
        entity.HasKey(e => e.Id);

        entity.Property(e => e.ClinicEzId).IsRequired().HasMaxLength(40);
        entity.Property(e => e.FirstName).IsRequired().HasMaxLength(100);
        entity.Property(e => e.MiddleName).HasMaxLength(100);
        entity.Property(e => e.LastName).IsRequired().HasMaxLength(100);
        entity.Property(e => e.Suffix).HasMaxLength(20);
        entity.Property(e => e.VerifiedEmail).HasMaxLength(255);
        entity.Property(e => e.ContactNumber).HasMaxLength(50);

        entity.Property(e => e.IdentifierClaims)
            .HasColumnType("jsonb")
            .HasConversion(claimsConverter, claimsComparer);

        entity.Property(e => e.CandidateMatches)
            .HasColumnType("jsonb")
            .HasConversion(candidatesConverter, candidatesComparer);

        entity.Property(e => e.Status).HasConversion<string>().HasMaxLength(32);
        entity.Property(e => e.ReviewedByStaffName).HasMaxLength(150);
        entity.Property(e => e.RejectionReason).HasMaxLength(500);

        entity.HasIndex(e => new { e.ClinicId, e.Status });
        entity.HasIndex(e => new { e.ClinicId, e.CloudPatientId });
    }
}
