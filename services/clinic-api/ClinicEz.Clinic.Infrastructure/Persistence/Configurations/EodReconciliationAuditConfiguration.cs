using System;
using System.Collections.Generic;
using System.Linq;
using System.Text.Json;
using ClinicEz.Clinic.Domain.Common;
using ClinicEz.Clinic.Domain.Entities;
using ClinicEz.Clinic.Domain.Enums;
using ClinicEz.Shared.Interop.Persistence;
using ClinicEz.Shared.Workspace;
using Microsoft.AspNetCore.DataProtection.EntityFrameworkCore;
using Microsoft.EntityFrameworkCore;
using Microsoft.EntityFrameworkCore.ChangeTracking;
using Microsoft.EntityFrameworkCore.Metadata.Builders;
using Microsoft.EntityFrameworkCore.Storage.ValueConversion;

namespace ClinicEz.Clinic.Infrastructure.Persistence.Configurations;

public sealed class EodReconciliationAuditConfiguration : IEntityTypeConfiguration<EodReconciliationAudit>
{
    public void Configure(EntityTypeBuilder<EodReconciliationAudit> entity)
    {
            entity.ToTable("EodReconciliationAudits");
            entity.HasKey(e => e.Id);
            entity.Property(e => e.TenantId).IsRequired().HasMaxLength(100);
            entity.Property(e => e.TriggerType).IsRequired().HasMaxLength(50);
            entity.Property(e => e.ReconciledBy).IsRequired().HasMaxLength(150);
            entity.Property(e => e.AffectedTicketNumbersJson).HasColumnType("text");
            entity.Property(e => e.Notes).HasMaxLength(500);

            entity.HasIndex(e => new { e.TenantId, e.ClinicId, e.ReconciliationDate });
    }
}
