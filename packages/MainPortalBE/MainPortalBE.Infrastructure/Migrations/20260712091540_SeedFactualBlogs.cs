using System;
using System.Collections.Generic;
using Microsoft.EntityFrameworkCore.Migrations;

#nullable disable

#pragma warning disable CA1814 // Prefer jagged arrays over multidimensional

namespace MainPortalBE.Infrastructure.Migrations
{
    /// <inheritdoc />
    public partial class SeedFactualBlogs : Migration
    {
        /// <inheritdoc />
        protected override void Up(MigrationBuilder migrationBuilder)
        {
            migrationBuilder.InsertData(
                schema: "main",
                table: "BlogArticles",
                columns: new[] { "Id", "Author", "BannerUrl", "Category", "Content", "CreatedAt", "CreatedBy", "DeletedAt", "DeletedBy", "IsDeleted", "PublishedAt", "Slug", "Status", "Summary", "Title", "UpdatedAt", "UpdatedBy", "Views" },
                values: new object[,]
                {
                    { new Guid("b5555555-5555-5555-5555-555555555555"), "Dr. Raymond Santos", "https://images.unsplash.com/photo-1454165804606-c3d57bc86b40?auto=format&fit=crop&w=1200&q=80", "Guides", "# Accreditation Roadmap: How Clinics Can Become PhilHealth Konsulta Providers\n\nExpanding primary healthcare services is a priority under the Universal Health Care (UHC) law. The **PhilHealth Konsulta** program provides access to primary care consultations, laboratory diagnostic services, and selected outpatient medicines.\n\nFor clinics aiming to become accredited Konsulta providers, here is a factual checklist:\n\n## Step 1: Self-Assessment & Registration\nFacilities must submit their application to the local PhilHealth Regional Office (PRO). Key requirements include:\n- A valid **DOH License to Operate** (LTO) for primary care facilities or medical clinics.\n- Professional credentials of affiliated medical staff (PRC licenses, board certifications).\n\n## Step 2: Physical & Manpower Compliance\nAccredited facilities must house basic diagnostics equipment and support staff:\n1. **Manpower**: At least one primary care physician and supporting nursing or administrative personnel.\n2. **Infrastructure**: Dedicated consultation rooms, clean patient waiting areas, and secure medical storage.\n3. **Services**: Capacity to perform or outsource basic lab diagnostics (CBC, urinalysis, fasting blood sugar, sputum microscopy).\n\n## Step 3: Accredited EMR Integration\nManual reporting is prohibited under the program. Accredited clinics must use a certified **Electronic Medical Record (EMR)** provider like **Clinic EZ** to synchronize consultation details and register patient profiles.\n\nAccreditation not only elevates the standard of care but also provides facilities with predictable capitation payments, enabling sustainable operations.", new DateTime(2026, 7, 12, 0, 0, 0, 0, DateTimeKind.Utc), "System", null, null, false, new DateTime(2026, 7, 12, 0, 0, 0, 0, DateTimeKind.Utc), "philhealth-konsulta-accreditation-roadmap", "Published", "A step-by-step roadmap detailing registration, equipment compliance, and EMR integration checklists for primary care facilities.", "Accreditation Roadmap: How Clinics Can Become PhilHealth Konsulta Providers", null, null, 312 },
                    { new Guid("b6666666-6666-6666-6666-666666666666"), "Wave Ambray", "https://images.unsplash.com/photo-1516549655169-df83a0774514?auto=format&fit=crop&w=1200&q=80", "Health Tech", "# How Digital Lab Orders & PACS Integrations Speed Up Primary Care Diagnostics\n\nIn traditional primary care clinics, requesting laboratory tests or imaging scans involves writing a paper requisition slip, handing it to the patient, and waiting for the printed result to be returned. This manual workflow introduces diagnostic delays and increases administrative overhead.\n\nDirect digital integrations bridge this gap:\n\n## Direct Digital Requisitions\nWith an integrated EMR, physicians submit diagnostic requests directly to affiliated laboratory systems.\n- **Accurate mapping**: Requisition codes match specific diagnostic instruments, removing transcription errors.\n- **Specimen Tracking**: Specimen collection is barcoded and tracked in real-time.\n\n## PACS & DICOM Image Sync\nFor radiology (X-ray, MRI, ultrasound), integrating the EMR with a **Picture Archiving and Communication System (PACS)** allows doctors to view medical images directly from the patient's record.\n- Avoids manual CD copying or printing film.\n- Radiologists input reports directly into the shared portal.\n- Primary care physicians review reports and images side-by-side during consultations.\n\nIntegrating digital lab requests and PACS workflows speeds up patient diagnostics and improves care coordination.", new DateTime(2026, 7, 12, 0, 0, 0, 0, DateTimeKind.Utc), "System", null, null, false, new DateTime(2026, 7, 12, 0, 0, 0, 0, DateTimeKind.Utc), "lab-orders-pacs-primary-care", "Published", "Analyzing how direct digital lab transmissions from primary care physicians to diagnostic centers reduce error rates and cut diagnostic turnaround times.", "How Digital Lab Orders & PACS Integrations Speed Up Primary Care Diagnostics", null, null, 215 }
                });
        }

        /// <inheritdoc />
        protected override void Down(MigrationBuilder migrationBuilder)
        {
            migrationBuilder.DeleteData(
                schema: "main",
                table: "BlogArticles",
                keyColumn: "Id",
                keyValue: new Guid("b5555555-5555-5555-5555-555555555555"));

            migrationBuilder.DeleteData(
                schema: "main",
                table: "BlogArticles",
                keyColumn: "Id",
                keyValue: new Guid("b6666666-6666-6666-6666-666666666666"));

            migrationBuilder.UpdateData(
                schema: "main",
                table: "AdminRoles",
                keyColumn: "Id",
                keyValue: new Guid("44444444-4444-4444-4444-444444444444"),
                column: "Permissions",
                value: new List<string> { "view:analytics", "view:tenants", "manage:tenants", "toggle:subscription", "manage:blogs", "manage:roles", "manage:admins" });

            migrationBuilder.UpdateData(
                schema: "main",
                table: "AdminRoles",
                keyColumn: "Id",
                keyValue: new Guid("55555555-5555-5555-5555-555555555555"),
                column: "Permissions",
                value: new List<string> { "view:analytics", "view:tenants", "manage:blogs" });

            migrationBuilder.UpdateData(
                schema: "main",
                table: "AdminRoles",
                keyColumn: "Id",
                keyValue: new Guid("66666666-6666-6666-6666-666666666666"),
                column: "Permissions",
                value: new List<string> { "manage:blogs" });
        }
    }
}
