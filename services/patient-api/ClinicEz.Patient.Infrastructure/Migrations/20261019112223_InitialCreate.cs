using System;
using Microsoft.EntityFrameworkCore.Migrations;

#nullable disable

#pragma warning disable CA1814 // Prefer jagged arrays over multidimensional

namespace ClinicEz.Patient.Infrastructure.Migrations
{
    /// <inheritdoc />
    public partial class InitialCreate : Migration
    {
        /// <inheritdoc />
        protected override void Up(MigrationBuilder migrationBuilder)
        {
            migrationBuilder.CreateTable(
                name: "clinics",
                columns: table => new
                {
                    id = table.Column<Guid>(type: "uuid", nullable: false),
                    name = table.Column<string>(type: "character varying(200)", maxLength: 200, nullable: false),
                    tenant_id = table.Column<string>(type: "character varying(100)", maxLength: 100, nullable: true),
                    description = table.Column<string>(type: "character varying(1000)", maxLength: 1000, nullable: true),
                    address = table.Column<string>(type: "character varying(300)", maxLength: 300, nullable: true),
                    is_workspace_eligible = table.Column<bool>(type: "boolean", nullable: false, defaultValue: false),
                    is_directory_published = table.Column<bool>(type: "boolean", nullable: false, defaultValue: false),
                    is_public = table.Column<bool>(type: "boolean", nullable: false, defaultValue: false),
                    supports_appointments = table.Column<bool>(type: "boolean", nullable: false),
                    operating_hours = table.Column<string>(type: "character varying(200)", maxLength: 200, nullable: true),
                    is_gated = table.Column<bool>(type: "boolean", nullable: false, defaultValue: false),
                    join_code = table.Column<string>(type: "character varying(50)", maxLength: 50, nullable: true),
                    join_code_expires_at = table.Column<DateTime>(type: "timestamp with time zone", nullable: true),
                    logo_url = table.Column<string>(type: "character varying(500)", maxLength: 500, nullable: true),
                    cover_image_url = table.Column<string>(type: "character varying(500)", maxLength: 500, nullable: true),
                    privacy_policy_url = table.Column<string>(type: "character varying(500)", maxLength: 500, nullable: true),
                    terms_and_conditions_url = table.Column<string>(type: "character varying(500)", maxLength: 500, nullable: true),
                    specialties_json = table.Column<string>(type: "text", nullable: false),
                    required_share_fields_json = table.Column<string>(type: "text", nullable: false),
                    featured_score = table.Column<int>(type: "integer", nullable: false),
                    active_member_count = table.Column<int>(type: "integer", nullable: false),
                    created_at = table.Column<DateTime>(type: "timestamp with time zone", nullable: false),
                    updated_at = table.Column<DateTime>(type: "timestamp with time zone", nullable: false)
                },
                constraints: table =>
                {
                    table.PrimaryKey("pk_clinics", x => x.id);
                });

            migrationBuilder.CreateTable(
                name: "document_types",
                columns: table => new
                {
                    id = table.Column<Guid>(type: "uuid", nullable: false),
                    code = table.Column<string>(type: "character varying(100)", maxLength: 100, nullable: false),
                    label = table.Column<string>(type: "character varying(200)", maxLength: 200, nullable: false),
                    description = table.Column<string>(type: "character varying(500)", maxLength: 500, nullable: true),
                    supported_extensions_json = table.Column<string>(type: "text", nullable: false),
                    supported_mime_types_json = table.Column<string>(type: "text", nullable: false),
                    native_preview_kind = table.Column<string>(type: "character varying(50)", maxLength: 50, nullable: false),
                    is_active = table.Column<bool>(type: "boolean", nullable: false),
                    sort_order = table.Column<int>(type: "integer", nullable: false),
                    xmin = table.Column<uint>(type: "xid", rowVersion: true, nullable: false),
                    created_at = table.Column<DateTime>(type: "timestamp with time zone", nullable: false),
                    created_by = table.Column<string>(type: "text", nullable: false),
                    updated_at = table.Column<DateTime>(type: "timestamp with time zone", nullable: true),
                    updated_by = table.Column<string>(type: "text", nullable: true),
                    is_deleted = table.Column<bool>(type: "boolean", nullable: false),
                    deleted_at = table.Column<DateTime>(type: "timestamp with time zone", nullable: true),
                    deleted_by = table.Column<string>(type: "text", nullable: true)
                },
                constraints: table =>
                {
                    table.PrimaryKey("pk_document_types", x => x.id);
                });

            migrationBuilder.CreateTable(
                name: "interop_inbox",
                columns: table => new
                {
                    message_id = table.Column<Guid>(type: "uuid", nullable: false),
                    type = table.Column<string>(type: "character varying(128)", maxLength: 128, nullable: false),
                    processed_at_utc = table.Column<DateTime>(type: "timestamp with time zone", nullable: false)
                },
                constraints: table =>
                {
                    table.PrimaryKey("pk_interop_inbox", x => x.message_id);
                });

            migrationBuilder.CreateTable(
                name: "interop_outbox",
                columns: table => new
                {
                    message_id = table.Column<Guid>(type: "uuid", nullable: false),
                    correlation_id = table.Column<Guid>(type: "uuid", nullable: false),
                    type = table.Column<string>(type: "character varying(128)", maxLength: 128, nullable: false),
                    envelope_json = table.Column<string>(type: "text", nullable: false),
                    created_at_utc = table.Column<DateTime>(type: "timestamp with time zone", nullable: false),
                    attempt_count = table.Column<int>(type: "integer", nullable: false),
                    next_attempt_at_utc = table.Column<DateTime>(type: "timestamp with time zone", nullable: false),
                    dispatched_at_utc = table.Column<DateTime>(type: "timestamp with time zone", nullable: true),
                    dead_lettered_at_utc = table.Column<DateTime>(type: "timestamp with time zone", nullable: true),
                    last_error = table.Column<string>(type: "character varying(2000)", maxLength: 2000, nullable: true)
                },
                constraints: table =>
                {
                    table.PrimaryKey("pk_interop_outbox", x => x.message_id);
                });

            migrationBuilder.CreateTable(
                name: "organizations",
                columns: table => new
                {
                    id = table.Column<Guid>(type: "uuid", nullable: false),
                    slug = table.Column<string>(type: "character varying(100)", maxLength: 100, nullable: false),
                    name = table.Column<string>(type: "character varying(200)", maxLength: 200, nullable: false),
                    description = table.Column<string>(type: "character varying(1000)", maxLength: 1000, nullable: false),
                    logo_url = table.Column<string>(type: "character varying(500)", maxLength: 500, nullable: true),
                    cover_image_url = table.Column<string>(type: "character varying(500)", maxLength: 500, nullable: true),
                    address_hint = table.Column<string>(type: "character varying(300)", maxLength: 300, nullable: true),
                    is_public = table.Column<bool>(type: "boolean", nullable: false),
                    invite_code = table.Column<string>(type: "character varying(50)", maxLength: 50, nullable: true),
                    privacy_policy_url = table.Column<string>(type: "character varying(500)", maxLength: 500, nullable: true),
                    terms_and_conditions_url = table.Column<string>(type: "character varying(500)", maxLength: 500, nullable: true),
                    roles_json = table.Column<string>(type: "text", nullable: false),
                    required_share_fields_json = table.Column<string>(type: "text", nullable: false),
                    featured_score = table.Column<int>(type: "integer", nullable: false),
                    active_member_count = table.Column<int>(type: "integer", nullable: false),
                    created_at = table.Column<DateTime>(type: "timestamp with time zone", nullable: false),
                    updated_at = table.Column<DateTime>(type: "timestamp with time zone", nullable: false)
                },
                constraints: table =>
                {
                    table.PrimaryKey("pk_organizations", x => x.id);
                });

            migrationBuilder.CreateTable(
                name: "patients",
                columns: table => new
                {
                    id = table.Column<Guid>(type: "uuid", nullable: false),
                    client_id = table.Column<Guid>(type: "uuid", nullable: false),
                    clerk_user_id = table.Column<string>(type: "character varying(128)", maxLength: 128, nullable: true),
                    clinic_ez_id = table.Column<string>(type: "character varying(20)", maxLength: 20, nullable: false),
                    managed_by_patient_id = table.Column<Guid>(type: "uuid", nullable: true),
                    relationship_to_manager = table.Column<string>(type: "character varying(50)", maxLength: 50, nullable: true),
                    first_name = table.Column<string>(type: "character varying(100)", maxLength: 100, nullable: false),
                    middle_name = table.Column<string>(type: "character varying(100)", maxLength: 100, nullable: true),
                    last_name = table.Column<string>(type: "character varying(100)", maxLength: 100, nullable: false),
                    suffix = table.Column<string>(type: "character varying(20)", maxLength: 20, nullable: true),
                    sex = table.Column<string>(type: "character varying(20)", maxLength: 20, nullable: true),
                    date_of_birth = table.Column<DateOnly>(type: "date", nullable: true),
                    place_of_birth = table.Column<string>(type: "text", nullable: true),
                    civil_status = table.Column<string>(type: "character varying(20)", maxLength: 20, nullable: true),
                    blood_type = table.Column<string>(type: "character varying(15)", maxLength: 15, nullable: true),
                    nationality = table.Column<string>(type: "character varying(80)", maxLength: 80, nullable: true),
                    ethnicity = table.Column<string>(type: "character varying(80)", maxLength: 80, nullable: true),
                    religion = table.Column<string>(type: "character varying(80)", maxLength: 80, nullable: true),
                    primary_language = table.Column<string>(type: "character varying(50)", maxLength: 50, nullable: true),
                    education_level = table.Column<string>(type: "character varying(30)", maxLength: 30, nullable: true),
                    avatar_url = table.Column<string>(type: "character varying(500)", maxLength: 500, nullable: true),
                    mobile = table.Column<string>(type: "character varying(20)", maxLength: 20, nullable: true),
                    alt_phone = table.Column<string>(type: "character varying(20)", maxLength: 20, nullable: true),
                    email = table.Column<string>(type: "character varying(254)", maxLength: 254, nullable: true),
                    messenger_handle = table.Column<string>(type: "character varying(100)", maxLength: 100, nullable: true),
                    consent_to_share_info = table.Column<bool>(type: "boolean", nullable: false),
                    xmin = table.Column<uint>(type: "xid", rowVersion: true, nullable: false),
                    created_at = table.Column<DateTime>(type: "timestamp with time zone", nullable: false),
                    created_by = table.Column<string>(type: "character varying(128)", maxLength: 128, nullable: false),
                    updated_at = table.Column<DateTime>(type: "timestamp with time zone", nullable: true),
                    updated_by = table.Column<string>(type: "character varying(128)", maxLength: 128, nullable: true),
                    is_deleted = table.Column<bool>(type: "boolean", nullable: false),
                    deleted_at = table.Column<DateTime>(type: "timestamp with time zone", nullable: true),
                    deleted_by = table.Column<string>(type: "character varying(128)", maxLength: 128, nullable: true)
                },
                constraints: table =>
                {
                    table.PrimaryKey("pk_patients", x => x.id);
                    table.ForeignKey(
                        name: "fk_patients_patients_managed_by_patient_id",
                        column: x => x.managed_by_patient_id,
                        principalTable: "patients",
                        principalColumn: "id",
                        onDelete: ReferentialAction.SetNull);
                });

            migrationBuilder.CreateTable(
                name: "share_code_failures",
                columns: table => new
                {
                    id = table.Column<Guid>(type: "uuid", nullable: false),
                    patient_id = table.Column<Guid>(type: "uuid", nullable: true),
                    actor = table.Column<string>(type: "character varying(300)", maxLength: 300, nullable: false),
                    xmin = table.Column<uint>(type: "xid", rowVersion: true, nullable: false),
                    created_at = table.Column<DateTime>(type: "timestamp with time zone", nullable: false),
                    created_by = table.Column<string>(type: "character varying(128)", maxLength: 128, nullable: false),
                    updated_at = table.Column<DateTime>(type: "timestamp with time zone", nullable: true),
                    updated_by = table.Column<string>(type: "character varying(128)", maxLength: 128, nullable: true),
                    is_deleted = table.Column<bool>(type: "boolean", nullable: false),
                    deleted_at = table.Column<DateTime>(type: "timestamp with time zone", nullable: true),
                    deleted_by = table.Column<string>(type: "character varying(128)", maxLength: 128, nullable: true)
                },
                constraints: table =>
                {
                    table.PrimaryKey("pk_share_code_failures", x => x.id);
                });

            migrationBuilder.CreateTable(
                name: "share_token_uses",
                columns: table => new
                {
                    id = table.Column<Guid>(type: "uuid", nullable: false),
                    token_id = table.Column<string>(type: "character varying(64)", maxLength: 64, nullable: false),
                    patient_id = table.Column<Guid>(type: "uuid", nullable: false),
                    grant_id = table.Column<Guid>(type: "uuid", nullable: false),
                    facility_id = table.Column<Guid>(type: "uuid", nullable: false),
                    sequence = table.Column<int>(type: "integer", nullable: false),
                    message_id = table.Column<Guid>(type: "uuid", nullable: false),
                    xmin = table.Column<uint>(type: "xid", rowVersion: true, nullable: false),
                    created_at = table.Column<DateTime>(type: "timestamp with time zone", nullable: false),
                    created_by = table.Column<string>(type: "character varying(128)", maxLength: 128, nullable: false),
                    updated_at = table.Column<DateTime>(type: "timestamp with time zone", nullable: true),
                    updated_by = table.Column<string>(type: "character varying(128)", maxLength: 128, nullable: true),
                    is_deleted = table.Column<bool>(type: "boolean", nullable: false),
                    deleted_at = table.Column<DateTime>(type: "timestamp with time zone", nullable: true),
                    deleted_by = table.Column<string>(type: "character varying(128)", maxLength: 128, nullable: true)
                },
                constraints: table =>
                {
                    table.PrimaryKey("pk_share_token_uses", x => x.id);
                });

            migrationBuilder.CreateTable(
                name: "clinic_healthcare_providers",
                columns: table => new
                {
                    id = table.Column<Guid>(type: "uuid", nullable: false),
                    clinic_id = table.Column<Guid>(type: "uuid", nullable: false),
                    name = table.Column<string>(type: "character varying(200)", maxLength: 200, nullable: false),
                    specialty = table.Column<string>(type: "character varying(150)", maxLength: 150, nullable: false),
                    avatar_url = table.Column<string>(type: "character varying(500)", maxLength: 500, nullable: true),
                    professional_license_no = table.Column<string>(type: "character varying(50)", maxLength: 50, nullable: true),
                    is_active = table.Column<bool>(type: "boolean", nullable: false),
                    display_order = table.Column<int>(type: "integer", nullable: false),
                    created_at = table.Column<DateTime>(type: "timestamp with time zone", nullable: false),
                    updated_at = table.Column<DateTime>(type: "timestamp with time zone", nullable: false)
                },
                constraints: table =>
                {
                    table.PrimaryKey("pk_clinic_healthcare_providers", x => x.id);
                    table.ForeignKey(
                        name: "fk_clinic_healthcare_providers_clinics_clinic_id",
                        column: x => x.clinic_id,
                        principalTable: "clinics",
                        principalColumn: "id",
                        onDelete: ReferentialAction.Cascade);
                });

            migrationBuilder.CreateTable(
                name: "clinic_services",
                columns: table => new
                {
                    id = table.Column<Guid>(type: "uuid", nullable: false),
                    clinic_id = table.Column<Guid>(type: "uuid", nullable: false),
                    name = table.Column<string>(type: "character varying(200)", maxLength: 200, nullable: false),
                    description = table.Column<string>(type: "character varying(1000)", maxLength: 1000, nullable: true),
                    duration_minutes = table.Column<int>(type: "integer", nullable: true),
                    price = table.Column<decimal>(type: "numeric(18,2)", precision: 18, scale: 2, nullable: true),
                    is_active = table.Column<bool>(type: "boolean", nullable: false),
                    display_order = table.Column<int>(type: "integer", nullable: false),
                    created_at = table.Column<DateTime>(type: "timestamp with time zone", nullable: false),
                    updated_at = table.Column<DateTime>(type: "timestamp with time zone", nullable: false)
                },
                constraints: table =>
                {
                    table.PrimaryKey("pk_clinic_services", x => x.id);
                    table.ForeignKey(
                        name: "fk_clinic_services_clinics_clinic_id",
                        column: x => x.clinic_id,
                        principalTable: "clinics",
                        principalColumn: "id",
                        onDelete: ReferentialAction.Cascade);
                });

            migrationBuilder.CreateTable(
                name: "clinic_organization_links",
                columns: table => new
                {
                    id = table.Column<Guid>(type: "uuid", nullable: false),
                    clinic_id = table.Column<Guid>(type: "uuid", nullable: false),
                    organization_id = table.Column<Guid>(type: "uuid", nullable: false),
                    relation_type = table.Column<string>(type: "character varying(30)", maxLength: 30, nullable: false),
                    is_active = table.Column<bool>(type: "boolean", nullable: false),
                    created_at = table.Column<DateTime>(type: "timestamp with time zone", nullable: false),
                    updated_at = table.Column<DateTime>(type: "timestamp with time zone", nullable: false)
                },
                constraints: table =>
                {
                    table.PrimaryKey("pk_clinic_organization_links", x => x.id);
                    table.ForeignKey(
                        name: "fk_clinic_organization_links_clinics_clinic_id",
                        column: x => x.clinic_id,
                        principalTable: "clinics",
                        principalColumn: "id",
                        onDelete: ReferentialAction.Cascade);
                    table.ForeignKey(
                        name: "fk_clinic_organization_links_organizations_organization_id",
                        column: x => x.organization_id,
                        principalTable: "organizations",
                        principalColumn: "id",
                        onDelete: ReferentialAction.Cascade);
                });

            migrationBuilder.CreateTable(
                name: "organization_roles",
                columns: table => new
                {
                    id = table.Column<Guid>(type: "uuid", nullable: false),
                    organization_id = table.Column<Guid>(type: "uuid", nullable: false),
                    role_id = table.Column<string>(type: "character varying(50)", maxLength: 50, nullable: false),
                    name = table.Column<string>(type: "character varying(150)", maxLength: 150, nullable: false),
                    description = table.Column<string>(type: "character varying(500)", maxLength: 500, nullable: false),
                    created_at = table.Column<DateTime>(type: "timestamp with time zone", nullable: false),
                    updated_at = table.Column<DateTime>(type: "timestamp with time zone", nullable: false)
                },
                constraints: table =>
                {
                    table.PrimaryKey("pk_organization_roles", x => x.id);
                    table.ForeignKey(
                        name: "fk_organization_roles_organizations_organization_id",
                        column: x => x.organization_id,
                        principalTable: "organizations",
                        principalColumn: "id",
                        onDelete: ReferentialAction.Cascade);
                });

            migrationBuilder.CreateTable(
                name: "appointments",
                columns: table => new
                {
                    id = table.Column<Guid>(type: "uuid", nullable: false),
                    patient_id = table.Column<Guid>(type: "uuid", nullable: false),
                    clinic_id = table.Column<Guid>(type: "uuid", nullable: false),
                    provider_id = table.Column<Guid>(type: "uuid", nullable: false),
                    subject = table.Column<string>(type: "text", nullable: true),
                    chief_complaint = table.Column<string>(type: "text", nullable: true),
                    notes = table.Column<string>(type: "character varying(1000)", maxLength: 1000, nullable: true),
                    attached_file_ids_json = table.Column<string>(type: "text", nullable: false),
                    service_type = table.Column<string>(type: "character varying(200)", maxLength: 200, nullable: true),
                    scheduled_at = table.Column<DateTime>(type: "timestamp with time zone", nullable: false),
                    duration_minutes = table.Column<int>(type: "integer", nullable: false),
                    status = table.Column<string>(type: "character varying(30)", maxLength: 30, nullable: false),
                    cached_at = table.Column<DateTime>(type: "timestamp with time zone", nullable: false),
                    raw_json = table.Column<string>(type: "text", nullable: false),
                    xmin = table.Column<uint>(type: "xid", rowVersion: true, nullable: false),
                    created_at = table.Column<DateTime>(type: "timestamp with time zone", nullable: false),
                    created_by = table.Column<string>(type: "character varying(128)", maxLength: 128, nullable: false),
                    updated_at = table.Column<DateTime>(type: "timestamp with time zone", nullable: true),
                    updated_by = table.Column<string>(type: "character varying(128)", maxLength: 128, nullable: true),
                    is_deleted = table.Column<bool>(type: "boolean", nullable: false),
                    deleted_at = table.Column<DateTime>(type: "timestamp with time zone", nullable: true),
                    deleted_by = table.Column<string>(type: "text", nullable: true)
                },
                constraints: table =>
                {
                    table.PrimaryKey("pk_appointments", x => x.id);
                    table.ForeignKey(
                        name: "fk_appointments_patients_patient_id",
                        column: x => x.patient_id,
                        principalTable: "patients",
                        principalColumn: "id",
                        onDelete: ReferentialAction.Cascade);
                });

            migrationBuilder.CreateTable(
                name: "booking_drafts",
                columns: table => new
                {
                    id = table.Column<Guid>(type: "uuid", nullable: false),
                    client_id = table.Column<Guid>(type: "uuid", nullable: false),
                    patient_id = table.Column<Guid>(type: "uuid", nullable: false),
                    clinic_id = table.Column<Guid>(type: "uuid", nullable: false),
                    organization_id = table.Column<Guid>(type: "uuid", nullable: true),
                    preferred_date = table.Column<DateOnly>(type: "date", nullable: true),
                    preferred_time = table.Column<string>(type: "character varying(20)", maxLength: 20, nullable: true),
                    reason = table.Column<string>(type: "character varying(500)", maxLength: 500, nullable: true),
                    notes = table.Column<string>(type: "character varying(1000)", maxLength: 1000, nullable: true),
                    share_fields_json = table.Column<string>(type: "text", nullable: false),
                    share_sections = table.Column<string>(type: "character varying(200)", maxLength: 200, nullable: false),
                    attached_file_ids_json = table.Column<string>(type: "text", nullable: false),
                    status = table.Column<string>(type: "character varying(20)", maxLength: 20, nullable: false),
                    xmin = table.Column<uint>(type: "xid", rowVersion: true, nullable: false),
                    created_at = table.Column<DateTime>(type: "timestamp with time zone", nullable: false),
                    created_by = table.Column<string>(type: "character varying(128)", maxLength: 128, nullable: false),
                    updated_at = table.Column<DateTime>(type: "timestamp with time zone", nullable: true),
                    updated_by = table.Column<string>(type: "character varying(128)", maxLength: 128, nullable: true),
                    is_deleted = table.Column<bool>(type: "boolean", nullable: false),
                    deleted_at = table.Column<DateTime>(type: "timestamp with time zone", nullable: true),
                    deleted_by = table.Column<string>(type: "text", nullable: true)
                },
                constraints: table =>
                {
                    table.PrimaryKey("pk_booking_drafts", x => x.id);
                    table.ForeignKey(
                        name: "fk_booking_drafts_clinics_clinic_id",
                        column: x => x.clinic_id,
                        principalTable: "clinics",
                        principalColumn: "id",
                        onDelete: ReferentialAction.Restrict);
                    table.ForeignKey(
                        name: "fk_booking_drafts_organizations_organization_id",
                        column: x => x.organization_id,
                        principalTable: "organizations",
                        principalColumn: "id",
                        onDelete: ReferentialAction.SetNull);
                    table.ForeignKey(
                        name: "fk_booking_drafts_patients_patient_id",
                        column: x => x.patient_id,
                        principalTable: "patients",
                        principalColumn: "id",
                        onDelete: ReferentialAction.Cascade);
                });

            migrationBuilder.CreateTable(
                name: "clinic_memberships",
                columns: table => new
                {
                    id = table.Column<Guid>(type: "uuid", nullable: false),
                    client_id = table.Column<Guid>(type: "uuid", nullable: false),
                    patient_id = table.Column<Guid>(type: "uuid", nullable: false),
                    clinic_id = table.Column<Guid>(type: "uuid", nullable: false),
                    status = table.Column<string>(type: "character varying(20)", maxLength: 20, nullable: false),
                    consent_privacy_policy = table.Column<bool>(type: "boolean", nullable: false),
                    consent_terms_and_conditions = table.Column<bool>(type: "boolean", nullable: false),
                    consent_data_sharing = table.Column<bool>(type: "boolean", nullable: false),
                    consented_at = table.Column<DateTime>(type: "timestamp with time zone", nullable: true),
                    xmin = table.Column<uint>(type: "xid", rowVersion: true, nullable: false),
                    created_at = table.Column<DateTime>(type: "timestamp with time zone", nullable: false),
                    created_by = table.Column<string>(type: "character varying(128)", maxLength: 128, nullable: false),
                    updated_at = table.Column<DateTime>(type: "timestamp with time zone", nullable: true),
                    updated_by = table.Column<string>(type: "character varying(128)", maxLength: 128, nullable: true),
                    is_deleted = table.Column<bool>(type: "boolean", nullable: false),
                    deleted_at = table.Column<DateTime>(type: "timestamp with time zone", nullable: true),
                    deleted_by = table.Column<string>(type: "text", nullable: true)
                },
                constraints: table =>
                {
                    table.PrimaryKey("pk_clinic_memberships", x => x.id);
                    table.ForeignKey(
                        name: "fk_clinic_memberships_clinics_clinic_id",
                        column: x => x.clinic_id,
                        principalTable: "clinics",
                        principalColumn: "id",
                        onDelete: ReferentialAction.Restrict);
                    table.ForeignKey(
                        name: "fk_clinic_memberships_patients_patient_id",
                        column: x => x.patient_id,
                        principalTable: "patients",
                        principalColumn: "id",
                        onDelete: ReferentialAction.Cascade);
                });

            migrationBuilder.CreateTable(
                name: "clinical_assessments",
                columns: table => new
                {
                    id = table.Column<Guid>(type: "uuid", nullable: false),
                    patient_id = table.Column<Guid>(type: "uuid", nullable: false),
                    clinic_id = table.Column<Guid>(type: "uuid", nullable: true),
                    assessment_type = table.Column<string>(type: "character varying(40)", maxLength: 40, nullable: false),
                    date = table.Column<DateOnly>(type: "date", nullable: false),
                    assessed_by = table.Column<string>(type: "character varying(200)", maxLength: 200, nullable: true),
                    scores_json = table.Column<string>(type: "text", nullable: true),
                    findings_json = table.Column<string>(type: "text", nullable: true),
                    synced_at = table.Column<DateTime>(type: "timestamp with time zone", nullable: true),
                    server_id = table.Column<string>(type: "character varying(128)", maxLength: 128, nullable: true),
                    xmin = table.Column<uint>(type: "xid", rowVersion: true, nullable: false),
                    created_at = table.Column<DateTime>(type: "timestamp with time zone", nullable: false),
                    created_by = table.Column<string>(type: "character varying(128)", maxLength: 128, nullable: false),
                    updated_at = table.Column<DateTime>(type: "timestamp with time zone", nullable: true),
                    updated_by = table.Column<string>(type: "character varying(128)", maxLength: 128, nullable: true),
                    is_deleted = table.Column<bool>(type: "boolean", nullable: false),
                    deleted_at = table.Column<DateTime>(type: "timestamp with time zone", nullable: true),
                    deleted_by = table.Column<string>(type: "text", nullable: true)
                },
                constraints: table =>
                {
                    table.PrimaryKey("pk_clinical_assessments", x => x.id);
                    table.ForeignKey(
                        name: "fk_clinical_assessments_patients_patient_id",
                        column: x => x.patient_id,
                        principalTable: "patients",
                        principalColumn: "id",
                        onDelete: ReferentialAction.Cascade);
                });

            migrationBuilder.CreateTable(
                name: "consultations",
                columns: table => new
                {
                    id = table.Column<Guid>(type: "uuid", nullable: false),
                    patient_id = table.Column<Guid>(type: "uuid", nullable: false),
                    clinic_id = table.Column<Guid>(type: "uuid", nullable: false),
                    provider_id = table.Column<Guid>(type: "uuid", nullable: false),
                    consulted_at = table.Column<DateTime>(type: "timestamp with time zone", nullable: false),
                    chief_complaint = table.Column<string>(type: "character varying(500)", maxLength: 500, nullable: true),
                    assessment = table.Column<string>(type: "character varying(2000)", maxLength: 2000, nullable: true),
                    diagnosis = table.Column<string>(type: "character varying(500)", maxLength: 500, nullable: true),
                    icd10code = table.Column<string>(type: "character varying(20)", maxLength: 20, nullable: true),
                    plan = table.Column<string>(type: "character varying(2000)", maxLength: 2000, nullable: true),
                    notes = table.Column<string>(type: "character varying(2000)", maxLength: 2000, nullable: true),
                    xmin = table.Column<uint>(type: "xid", rowVersion: true, nullable: false),
                    created_at = table.Column<DateTime>(type: "timestamp with time zone", nullable: false),
                    created_by = table.Column<string>(type: "character varying(128)", maxLength: 128, nullable: false),
                    updated_at = table.Column<DateTime>(type: "timestamp with time zone", nullable: true),
                    updated_by = table.Column<string>(type: "character varying(128)", maxLength: 128, nullable: true),
                    is_deleted = table.Column<bool>(type: "boolean", nullable: false),
                    deleted_at = table.Column<DateTime>(type: "timestamp with time zone", nullable: true),
                    deleted_by = table.Column<string>(type: "text", nullable: true)
                },
                constraints: table =>
                {
                    table.PrimaryKey("pk_consultations", x => x.id);
                    table.ForeignKey(
                        name: "fk_consultations_patients_patient_id",
                        column: x => x.patient_id,
                        principalTable: "patients",
                        principalColumn: "id",
                        onDelete: ReferentialAction.Cascade);
                });

            migrationBuilder.CreateTable(
                name: "device_sessions",
                columns: table => new
                {
                    id = table.Column<Guid>(type: "uuid", nullable: false),
                    patient_id = table.Column<Guid>(type: "uuid", nullable: false),
                    device_id = table.Column<string>(type: "character varying(128)", maxLength: 128, nullable: false),
                    device_label = table.Column<string>(type: "character varying(200)", maxLength: 200, nullable: false),
                    clerk_session_id = table.Column<string>(type: "character varying(256)", maxLength: 256, nullable: false),
                    push_token = table.Column<string>(type: "text", nullable: true),
                    last_active_at = table.Column<DateTime>(type: "timestamp with time zone", nullable: false),
                    is_revoked = table.Column<bool>(type: "boolean", nullable: false),
                    revoked_at = table.Column<DateTime>(type: "timestamp with time zone", nullable: true),
                    xmin = table.Column<uint>(type: "xid", rowVersion: true, nullable: false),
                    created_at = table.Column<DateTime>(type: "timestamp with time zone", nullable: false),
                    created_by = table.Column<string>(type: "character varying(128)", maxLength: 128, nullable: false),
                    updated_at = table.Column<DateTime>(type: "timestamp with time zone", nullable: true),
                    updated_by = table.Column<string>(type: "character varying(128)", maxLength: 128, nullable: true),
                    is_deleted = table.Column<bool>(type: "boolean", nullable: false),
                    deleted_at = table.Column<DateTime>(type: "timestamp with time zone", nullable: true),
                    deleted_by = table.Column<string>(type: "text", nullable: true)
                },
                constraints: table =>
                {
                    table.PrimaryKey("pk_device_sessions", x => x.id);
                    table.ForeignKey(
                        name: "fk_device_sessions_patients_patient_id",
                        column: x => x.patient_id,
                        principalTable: "patients",
                        principalColumn: "id",
                        onDelete: ReferentialAction.Cascade);
                });

            migrationBuilder.CreateTable(
                name: "emergency_contacts",
                columns: table => new
                {
                    id = table.Column<Guid>(type: "uuid", nullable: false),
                    client_id = table.Column<Guid>(type: "uuid", nullable: false),
                    patient_id = table.Column<Guid>(type: "uuid", nullable: false),
                    full_name = table.Column<string>(type: "character varying(200)", maxLength: 200, nullable: false),
                    relationship = table.Column<string>(type: "character varying(80)", maxLength: 80, nullable: true),
                    mobile = table.Column<string>(type: "character varying(20)", maxLength: 20, nullable: true),
                    alt_phone = table.Column<string>(type: "character varying(20)", maxLength: 20, nullable: true),
                    is_primary = table.Column<bool>(type: "boolean", nullable: false),
                    xmin = table.Column<uint>(type: "xid", rowVersion: true, nullable: false),
                    created_at = table.Column<DateTime>(type: "timestamp with time zone", nullable: false),
                    created_by = table.Column<string>(type: "character varying(128)", maxLength: 128, nullable: false),
                    updated_at = table.Column<DateTime>(type: "timestamp with time zone", nullable: true),
                    updated_by = table.Column<string>(type: "character varying(128)", maxLength: 128, nullable: true),
                    is_deleted = table.Column<bool>(type: "boolean", nullable: false),
                    deleted_at = table.Column<DateTime>(type: "timestamp with time zone", nullable: true),
                    deleted_by = table.Column<string>(type: "text", nullable: true)
                },
                constraints: table =>
                {
                    table.PrimaryKey("pk_emergency_contacts", x => x.id);
                    table.ForeignKey(
                        name: "fk_emergency_contacts_patients_patient_id",
                        column: x => x.patient_id,
                        principalTable: "patients",
                        principalColumn: "id",
                        onDelete: ReferentialAction.Cascade);
                });

            migrationBuilder.CreateTable(
                name: "file_folders",
                columns: table => new
                {
                    id = table.Column<Guid>(type: "uuid", nullable: false),
                    client_id = table.Column<Guid>(type: "uuid", nullable: false),
                    patient_id = table.Column<Guid>(type: "uuid", nullable: false),
                    parent_id = table.Column<Guid>(type: "uuid", nullable: true),
                    name = table.Column<string>(type: "character varying(255)", maxLength: 255, nullable: false),
                    sync_status = table.Column<string>(type: "character varying(20)", maxLength: 20, nullable: false),
                    sync_error = table.Column<string>(type: "character varying(500)", maxLength: 500, nullable: true),
                    xmin = table.Column<uint>(type: "xid", rowVersion: true, nullable: false),
                    created_at = table.Column<DateTime>(type: "timestamp with time zone", nullable: false),
                    created_by = table.Column<string>(type: "character varying(128)", maxLength: 128, nullable: false),
                    updated_at = table.Column<DateTime>(type: "timestamp with time zone", nullable: true),
                    updated_by = table.Column<string>(type: "character varying(128)", maxLength: 128, nullable: true),
                    is_deleted = table.Column<bool>(type: "boolean", nullable: false),
                    deleted_at = table.Column<DateTime>(type: "timestamp with time zone", nullable: true),
                    deleted_by = table.Column<string>(type: "text", nullable: true)
                },
                constraints: table =>
                {
                    table.PrimaryKey("pk_file_folders", x => x.id);
                    table.ForeignKey(
                        name: "fk_file_folders_file_folders_parent_id",
                        column: x => x.parent_id,
                        principalTable: "file_folders",
                        principalColumn: "id",
                        onDelete: ReferentialAction.Restrict);
                    table.ForeignKey(
                        name: "fk_file_folders_patients_patient_id",
                        column: x => x.patient_id,
                        principalTable: "patients",
                        principalColumn: "id",
                        onDelete: ReferentialAction.Cascade);
                });

            migrationBuilder.CreateTable(
                name: "lab_request_slips",
                columns: table => new
                {
                    id = table.Column<Guid>(type: "uuid", nullable: false),
                    patient_id = table.Column<Guid>(type: "uuid", nullable: false),
                    requisition_id = table.Column<Guid>(type: "uuid", nullable: false),
                    ordering_tenant_id = table.Column<string>(type: "character varying(100)", maxLength: 100, nullable: false),
                    ordering_facility_id = table.Column<string>(type: "character varying(64)", maxLength: 64, nullable: false),
                    ordering_facility_name = table.Column<string>(type: "character varying(200)", maxLength: 200, nullable: false),
                    accession_number = table.Column<string>(type: "character varying(60)", maxLength: 60, nullable: false),
                    title = table.Column<string>(type: "character varying(300)", maxLength: 300, nullable: false),
                    urgency = table.Column<string>(type: "character varying(30)", maxLength: 30, nullable: false),
                    items_json = table.Column<string>(type: "text", nullable: false),
                    stage = table.Column<string>(type: "character varying(30)", maxLength: 30, nullable: false),
                    stage_changed_at = table.Column<DateTime>(type: "timestamp with time zone", nullable: true),
                    quoted_amount = table.Column<decimal>(type: "numeric(12,2)", precision: 12, scale: 2, nullable: true),
                    currency = table.Column<string>(type: "character varying(3)", maxLength: 3, nullable: true),
                    payment_required = table.Column<bool>(type: "boolean", nullable: false),
                    laboratory_name = table.Column<string>(type: "character varying(200)", maxLength: 200, nullable: true),
                    reason = table.Column<string>(type: "character varying(500)", maxLength: 500, nullable: true),
                    claim_token = table.Column<string>(type: "character varying(2000)", maxLength: 2000, nullable: true),
                    issued_at = table.Column<DateTime>(type: "timestamp with time zone", nullable: false),
                    has_details = table.Column<bool>(type: "boolean", nullable: false),
                    xmin = table.Column<uint>(type: "xid", rowVersion: true, nullable: false),
                    created_at = table.Column<DateTime>(type: "timestamp with time zone", nullable: false),
                    created_by = table.Column<string>(type: "character varying(128)", maxLength: 128, nullable: false),
                    updated_at = table.Column<DateTime>(type: "timestamp with time zone", nullable: true),
                    updated_by = table.Column<string>(type: "character varying(128)", maxLength: 128, nullable: true),
                    is_deleted = table.Column<bool>(type: "boolean", nullable: false),
                    deleted_at = table.Column<DateTime>(type: "timestamp with time zone", nullable: true),
                    deleted_by = table.Column<string>(type: "character varying(128)", maxLength: 128, nullable: true)
                },
                constraints: table =>
                {
                    table.PrimaryKey("pk_lab_request_slips", x => x.id);
                    table.ForeignKey(
                        name: "fk_lab_request_slips_patients_patient_id",
                        column: x => x.patient_id,
                        principalTable: "patients",
                        principalColumn: "id",
                        onDelete: ReferentialAction.Cascade);
                });

            migrationBuilder.CreateTable(
                name: "lab_result_reports",
                columns: table => new
                {
                    id = table.Column<Guid>(type: "uuid", nullable: false),
                    patient_id = table.Column<Guid>(type: "uuid", nullable: false),
                    report_id = table.Column<Guid>(type: "uuid", nullable: false),
                    requisition_id = table.Column<Guid>(type: "uuid", nullable: true),
                    laboratory_name = table.Column<string>(type: "character varying(200)", maxLength: 200, nullable: false),
                    title = table.Column<string>(type: "character varying(300)", maxLength: 300, nullable: false),
                    impression = table.Column<string>(type: "character varying(2000)", maxLength: 2000, nullable: true),
                    is_critical = table.Column<bool>(type: "boolean", nullable: false),
                    resulted_at = table.Column<DateTime>(type: "timestamp with time zone", nullable: false),
                    source = table.Column<string>(type: "character varying(30)", maxLength: 30, nullable: false),
                    verification = table.Column<string>(type: "character varying(20)", maxLength: 20, nullable: false),
                    reviewed_by_name = table.Column<string>(type: "character varying(200)", maxLength: 200, nullable: true),
                    reviewed_by_prc = table.Column<string>(type: "character varying(50)", maxLength: 50, nullable: true),
                    reviewed_at = table.Column<DateTime>(type: "timestamp with time zone", nullable: true),
                    review_remarks = table.Column<string>(type: "character varying(1000)", maxLength: 1000, nullable: true),
                    file_storage_key = table.Column<string>(type: "character varying(500)", maxLength: 500, nullable: true),
                    file_name = table.Column<string>(type: "character varying(260)", maxLength: 260, nullable: true),
                    file_content_type = table.Column<string>(type: "character varying(100)", maxLength: 100, nullable: true),
                    xmin = table.Column<uint>(type: "xid", rowVersion: true, nullable: false),
                    created_at = table.Column<DateTime>(type: "timestamp with time zone", nullable: false),
                    created_by = table.Column<string>(type: "character varying(128)", maxLength: 128, nullable: false),
                    updated_at = table.Column<DateTime>(type: "timestamp with time zone", nullable: true),
                    updated_by = table.Column<string>(type: "character varying(128)", maxLength: 128, nullable: true),
                    is_deleted = table.Column<bool>(type: "boolean", nullable: false),
                    deleted_at = table.Column<DateTime>(type: "timestamp with time zone", nullable: true),
                    deleted_by = table.Column<string>(type: "character varying(128)", maxLength: 128, nullable: true)
                },
                constraints: table =>
                {
                    table.PrimaryKey("pk_lab_result_reports", x => x.id);
                    table.ForeignKey(
                        name: "fk_lab_result_reports_patients_patient_id",
                        column: x => x.patient_id,
                        principalTable: "patients",
                        principalColumn: "id",
                        onDelete: ReferentialAction.Cascade);
                });

            migrationBuilder.CreateTable(
                name: "medical_certificates",
                columns: table => new
                {
                    id = table.Column<Guid>(type: "uuid", nullable: false),
                    patient_id = table.Column<Guid>(type: "uuid", nullable: false),
                    certificate_id = table.Column<Guid>(type: "uuid", nullable: false),
                    certificate_number = table.Column<string>(type: "character varying(60)", maxLength: 60, nullable: false),
                    issuer_tenant_id = table.Column<string>(type: "character varying(100)", maxLength: 100, nullable: false),
                    issuer_facility_id = table.Column<string>(type: "character varying(64)", maxLength: 64, nullable: false),
                    issuer_name = table.Column<string>(type: "character varying(200)", maxLength: 200, nullable: false),
                    doctor_name = table.Column<string>(type: "character varying(200)", maxLength: 200, nullable: false),
                    doctor_prc_license = table.Column<string>(type: "character varying(50)", maxLength: 50, nullable: false),
                    doctor_ptr_number = table.Column<string>(type: "character varying(50)", maxLength: 50, nullable: true),
                    purpose = table.Column<string>(type: "character varying(300)", maxLength: 300, nullable: false),
                    diagnosis = table.Column<string>(type: "character varying(500)", maxLength: 500, nullable: true),
                    remarks = table.Column<string>(type: "character varying(1000)", maxLength: 1000, nullable: true),
                    rest_days = table.Column<int>(type: "integer", nullable: true),
                    valid_from = table.Column<DateTime>(type: "timestamp with time zone", nullable: true),
                    valid_to = table.Column<DateTime>(type: "timestamp with time zone", nullable: true),
                    issued_at = table.Column<DateTime>(type: "timestamp with time zone", nullable: false),
                    verification_token = table.Column<string>(type: "character varying(200)", maxLength: 200, nullable: true),
                    verification_url = table.Column<string>(type: "character varying(500)", maxLength: 500, nullable: true),
                    xmin = table.Column<uint>(type: "xid", rowVersion: true, nullable: false),
                    created_at = table.Column<DateTime>(type: "timestamp with time zone", nullable: false),
                    created_by = table.Column<string>(type: "character varying(128)", maxLength: 128, nullable: false),
                    updated_at = table.Column<DateTime>(type: "timestamp with time zone", nullable: true),
                    updated_by = table.Column<string>(type: "character varying(128)", maxLength: 128, nullable: true),
                    is_deleted = table.Column<bool>(type: "boolean", nullable: false),
                    deleted_at = table.Column<DateTime>(type: "timestamp with time zone", nullable: true),
                    deleted_by = table.Column<string>(type: "character varying(128)", maxLength: 128, nullable: true)
                },
                constraints: table =>
                {
                    table.PrimaryKey("pk_medical_certificates", x => x.id);
                    table.ForeignKey(
                        name: "fk_medical_certificates_patients_patient_id",
                        column: x => x.patient_id,
                        principalTable: "patients",
                        principalColumn: "id",
                        onDelete: ReferentialAction.Cascade);
                });

            migrationBuilder.CreateTable(
                name: "notification_preferences",
                columns: table => new
                {
                    id = table.Column<Guid>(type: "uuid", nullable: false),
                    client_id = table.Column<Guid>(type: "uuid", nullable: false),
                    patient_id = table.Column<Guid>(type: "uuid", nullable: false),
                    category = table.Column<string>(type: "character varying(30)", maxLength: 30, nullable: false),
                    push_enabled = table.Column<bool>(type: "boolean", nullable: false),
                    in_app_enabled = table.Column<bool>(type: "boolean", nullable: false),
                    xmin = table.Column<uint>(type: "xid", rowVersion: true, nullable: false),
                    created_at = table.Column<DateTime>(type: "timestamp with time zone", nullable: false),
                    created_by = table.Column<string>(type: "character varying(128)", maxLength: 128, nullable: false),
                    updated_at = table.Column<DateTime>(type: "timestamp with time zone", nullable: true),
                    updated_by = table.Column<string>(type: "character varying(128)", maxLength: 128, nullable: true),
                    is_deleted = table.Column<bool>(type: "boolean", nullable: false),
                    deleted_at = table.Column<DateTime>(type: "timestamp with time zone", nullable: true),
                    deleted_by = table.Column<string>(type: "text", nullable: true)
                },
                constraints: table =>
                {
                    table.PrimaryKey("pk_notification_preferences", x => x.id);
                    table.ForeignKey(
                        name: "fk_notification_preferences_patients_patient_id",
                        column: x => x.patient_id,
                        principalTable: "patients",
                        principalColumn: "id",
                        onDelete: ReferentialAction.Cascade);
                });

            migrationBuilder.CreateTable(
                name: "notifications",
                columns: table => new
                {
                    id = table.Column<Guid>(type: "uuid", nullable: false),
                    patient_id = table.Column<Guid>(type: "uuid", nullable: false),
                    type = table.Column<string>(type: "character varying(50)", maxLength: 50, nullable: false),
                    category = table.Column<string>(type: "character varying(30)", maxLength: 30, nullable: false),
                    title = table.Column<string>(type: "character varying(300)", maxLength: 300, nullable: false),
                    body = table.Column<string>(type: "character varying(1000)", maxLength: 1000, nullable: false),
                    is_read = table.Column<bool>(type: "boolean", nullable: false),
                    read_at = table.Column<DateTime>(type: "timestamp with time zone", nullable: true),
                    expires_at = table.Column<DateTime>(type: "timestamp with time zone", nullable: true),
                    source_id = table.Column<string>(type: "character varying(128)", maxLength: 128, nullable: true),
                    payload = table.Column<string>(type: "text", nullable: true),
                    xmin = table.Column<uint>(type: "xid", rowVersion: true, nullable: false),
                    created_at = table.Column<DateTime>(type: "timestamp with time zone", nullable: false),
                    created_by = table.Column<string>(type: "character varying(128)", maxLength: 128, nullable: false),
                    updated_at = table.Column<DateTime>(type: "timestamp with time zone", nullable: true),
                    updated_by = table.Column<string>(type: "character varying(128)", maxLength: 128, nullable: true),
                    is_deleted = table.Column<bool>(type: "boolean", nullable: false),
                    deleted_at = table.Column<DateTime>(type: "timestamp with time zone", nullable: true),
                    deleted_by = table.Column<string>(type: "text", nullable: true)
                },
                constraints: table =>
                {
                    table.PrimaryKey("pk_notifications", x => x.id);
                    table.ForeignKey(
                        name: "fk_notifications_patients_patient_id",
                        column: x => x.patient_id,
                        principalTable: "patients",
                        principalColumn: "id",
                        onDelete: ReferentialAction.Cascade);
                });

            migrationBuilder.CreateTable(
                name: "organization_memberships",
                columns: table => new
                {
                    id = table.Column<Guid>(type: "uuid", nullable: false),
                    client_id = table.Column<Guid>(type: "uuid", nullable: false),
                    patient_id = table.Column<Guid>(type: "uuid", nullable: false),
                    organization_id = table.Column<Guid>(type: "uuid", nullable: false),
                    role_id = table.Column<string>(type: "character varying(50)", maxLength: 50, nullable: false),
                    role_name = table.Column<string>(type: "character varying(100)", maxLength: 100, nullable: false),
                    status = table.Column<string>(type: "character varying(20)", maxLength: 20, nullable: false),
                    consent_privacy_policy = table.Column<bool>(type: "boolean", nullable: false),
                    consent_terms_and_conditions = table.Column<bool>(type: "boolean", nullable: false),
                    consent_data_sharing = table.Column<bool>(type: "boolean", nullable: false),
                    consented_at = table.Column<DateTime>(type: "timestamp with time zone", nullable: true),
                    xmin = table.Column<uint>(type: "xid", rowVersion: true, nullable: false),
                    created_at = table.Column<DateTime>(type: "timestamp with time zone", nullable: false),
                    created_by = table.Column<string>(type: "character varying(128)", maxLength: 128, nullable: false),
                    updated_at = table.Column<DateTime>(type: "timestamp with time zone", nullable: true),
                    updated_by = table.Column<string>(type: "character varying(128)", maxLength: 128, nullable: true),
                    is_deleted = table.Column<bool>(type: "boolean", nullable: false),
                    deleted_at = table.Column<DateTime>(type: "timestamp with time zone", nullable: true),
                    deleted_by = table.Column<string>(type: "text", nullable: true)
                },
                constraints: table =>
                {
                    table.PrimaryKey("pk_organization_memberships", x => x.id);
                    table.ForeignKey(
                        name: "fk_organization_memberships_organizations_organization_id",
                        column: x => x.organization_id,
                        principalTable: "organizations",
                        principalColumn: "id",
                        onDelete: ReferentialAction.Restrict);
                    table.ForeignKey(
                        name: "fk_organization_memberships_patients_patient_id",
                        column: x => x.patient_id,
                        principalTable: "patients",
                        principalColumn: "id",
                        onDelete: ReferentialAction.Cascade);
                });

            migrationBuilder.CreateTable(
                name: "patient_access_grants",
                columns: table => new
                {
                    id = table.Column<Guid>(type: "uuid", nullable: false),
                    patient_id = table.Column<Guid>(type: "uuid", nullable: false),
                    tenant_id = table.Column<string>(type: "character varying(100)", maxLength: 100, nullable: false),
                    facility_id = table.Column<Guid>(type: "uuid", nullable: false),
                    scopes = table.Column<string>(type: "character varying(200)", maxLength: 200, nullable: false),
                    purpose = table.Column<string>(type: "character varying(200)", maxLength: 200, nullable: false),
                    expires_at = table.Column<DateTime>(type: "timestamp with time zone", nullable: false),
                    revoked_at = table.Column<DateTime>(type: "timestamp with time zone", nullable: true),
                    source = table.Column<string>(type: "character varying(20)", maxLength: 20, nullable: false),
                    draft_id = table.Column<Guid>(type: "uuid", nullable: true),
                    xmin = table.Column<uint>(type: "xid", rowVersion: true, nullable: false),
                    created_at = table.Column<DateTime>(type: "timestamp with time zone", nullable: false),
                    created_by = table.Column<string>(type: "character varying(128)", maxLength: 128, nullable: false),
                    updated_at = table.Column<DateTime>(type: "timestamp with time zone", nullable: true),
                    updated_by = table.Column<string>(type: "character varying(128)", maxLength: 128, nullable: true),
                    is_deleted = table.Column<bool>(type: "boolean", nullable: false),
                    deleted_at = table.Column<DateTime>(type: "timestamp with time zone", nullable: true),
                    deleted_by = table.Column<string>(type: "character varying(128)", maxLength: 128, nullable: true)
                },
                constraints: table =>
                {
                    table.PrimaryKey("pk_patient_access_grants", x => x.id);
                    table.ForeignKey(
                        name: "fk_patient_access_grants_patients_patient_id",
                        column: x => x.patient_id,
                        principalTable: "patients",
                        principalColumn: "id",
                        onDelete: ReferentialAction.Cascade);
                });

            migrationBuilder.CreateTable(
                name: "patient_addresses",
                columns: table => new
                {
                    id = table.Column<Guid>(type: "uuid", nullable: false),
                    client_id = table.Column<Guid>(type: "uuid", nullable: false),
                    patient_id = table.Column<Guid>(type: "uuid", nullable: false),
                    type = table.Column<string>(type: "character varying(20)", maxLength: 20, nullable: false),
                    house_street = table.Column<string>(type: "character varying(200)", maxLength: 200, nullable: true),
                    barangay = table.Column<string>(type: "character varying(100)", maxLength: 100, nullable: true),
                    city_municipality = table.Column<string>(type: "character varying(100)", maxLength: 100, nullable: true),
                    province = table.Column<string>(type: "character varying(100)", maxLength: 100, nullable: true),
                    region = table.Column<string>(type: "character varying(100)", maxLength: 100, nullable: true),
                    zip_code = table.Column<string>(type: "character varying(10)", maxLength: 10, nullable: true),
                    country = table.Column<string>(type: "character varying(80)", maxLength: 80, nullable: true),
                    is_primary = table.Column<bool>(type: "boolean", nullable: false),
                    xmin = table.Column<uint>(type: "xid", rowVersion: true, nullable: false),
                    created_at = table.Column<DateTime>(type: "timestamp with time zone", nullable: false),
                    created_by = table.Column<string>(type: "character varying(128)", maxLength: 128, nullable: false),
                    updated_at = table.Column<DateTime>(type: "timestamp with time zone", nullable: true),
                    updated_by = table.Column<string>(type: "character varying(128)", maxLength: 128, nullable: true),
                    is_deleted = table.Column<bool>(type: "boolean", nullable: false),
                    deleted_at = table.Column<DateTime>(type: "timestamp with time zone", nullable: true),
                    deleted_by = table.Column<string>(type: "text", nullable: true)
                },
                constraints: table =>
                {
                    table.PrimaryKey("pk_patient_addresses", x => x.id);
                    table.ForeignKey(
                        name: "fk_patient_addresses_patients_patient_id",
                        column: x => x.patient_id,
                        principalTable: "patients",
                        principalColumn: "id",
                        onDelete: ReferentialAction.Cascade);
                });

            migrationBuilder.CreateTable(
                name: "patient_allergies",
                columns: table => new
                {
                    id = table.Column<Guid>(type: "uuid", nullable: false),
                    client_id = table.Column<Guid>(type: "uuid", nullable: false),
                    patient_id = table.Column<Guid>(type: "uuid", nullable: false),
                    allergen_name = table.Column<string>(type: "character varying(200)", maxLength: 200, nullable: false),
                    allergy_type = table.Column<string>(type: "character varying(30)", maxLength: 30, nullable: false),
                    severity = table.Column<string>(type: "character varying(30)", maxLength: 30, nullable: false),
                    reaction = table.Column<string>(type: "character varying(500)", maxLength: 500, nullable: true),
                    onset_date = table.Column<DateOnly>(type: "date", nullable: true),
                    notes = table.Column<string>(type: "character varying(1000)", maxLength: 1000, nullable: true),
                    xmin = table.Column<uint>(type: "xid", rowVersion: true, nullable: false),
                    created_at = table.Column<DateTime>(type: "timestamp with time zone", nullable: false),
                    created_by = table.Column<string>(type: "character varying(128)", maxLength: 128, nullable: false),
                    updated_at = table.Column<DateTime>(type: "timestamp with time zone", nullable: true),
                    updated_by = table.Column<string>(type: "character varying(128)", maxLength: 128, nullable: true),
                    is_deleted = table.Column<bool>(type: "boolean", nullable: false),
                    deleted_at = table.Column<DateTime>(type: "timestamp with time zone", nullable: true),
                    deleted_by = table.Column<string>(type: "text", nullable: true)
                },
                constraints: table =>
                {
                    table.PrimaryKey("pk_patient_allergies", x => x.id);
                    table.ForeignKey(
                        name: "fk_patient_allergies_patients_patient_id",
                        column: x => x.patient_id,
                        principalTable: "patients",
                        principalColumn: "id",
                        onDelete: ReferentialAction.Cascade);
                });

            migrationBuilder.CreateTable(
                name: "patient_chronic_conditions",
                columns: table => new
                {
                    id = table.Column<Guid>(type: "uuid", nullable: false),
                    client_id = table.Column<Guid>(type: "uuid", nullable: false),
                    patient_id = table.Column<Guid>(type: "uuid", nullable: false),
                    condition_name = table.Column<string>(type: "character varying(300)", maxLength: 300, nullable: false),
                    diagnosed_at = table.Column<DateOnly>(type: "date", nullable: true),
                    is_controlled = table.Column<bool>(type: "boolean", nullable: false),
                    treatment_notes = table.Column<string>(type: "character varying(1000)", maxLength: 1000, nullable: true),
                    current_medications = table.Column<string>(type: "character varying(500)", maxLength: 500, nullable: true),
                    xmin = table.Column<uint>(type: "xid", rowVersion: true, nullable: false),
                    created_at = table.Column<DateTime>(type: "timestamp with time zone", nullable: false),
                    created_by = table.Column<string>(type: "character varying(128)", maxLength: 128, nullable: false),
                    updated_at = table.Column<DateTime>(type: "timestamp with time zone", nullable: true),
                    updated_by = table.Column<string>(type: "character varying(128)", maxLength: 128, nullable: true),
                    is_deleted = table.Column<bool>(type: "boolean", nullable: false),
                    deleted_at = table.Column<DateTime>(type: "timestamp with time zone", nullable: true),
                    deleted_by = table.Column<string>(type: "text", nullable: true)
                },
                constraints: table =>
                {
                    table.PrimaryKey("pk_patient_chronic_conditions", x => x.id);
                    table.ForeignKey(
                        name: "fk_patient_chronic_conditions_patients_patient_id",
                        column: x => x.patient_id,
                        principalTable: "patients",
                        principalColumn: "id",
                        onDelete: ReferentialAction.Cascade);
                });

            migrationBuilder.CreateTable(
                name: "patient_contraceptive_histories",
                columns: table => new
                {
                    id = table.Column<Guid>(type: "uuid", nullable: false),
                    client_id = table.Column<Guid>(type: "uuid", nullable: false),
                    patient_id = table.Column<Guid>(type: "uuid", nullable: false),
                    method = table.Column<string>(type: "character varying(200)", maxLength: 200, nullable: false),
                    is_current = table.Column<bool>(type: "boolean", nullable: false),
                    date_started = table.Column<DateOnly>(type: "date", nullable: true),
                    reason_for_stopping = table.Column<string>(type: "character varying(500)", maxLength: 500, nullable: true),
                    xmin = table.Column<uint>(type: "xid", rowVersion: true, nullable: false),
                    created_at = table.Column<DateTime>(type: "timestamp with time zone", nullable: false),
                    created_by = table.Column<string>(type: "character varying(128)", maxLength: 128, nullable: false),
                    updated_at = table.Column<DateTime>(type: "timestamp with time zone", nullable: true),
                    updated_by = table.Column<string>(type: "character varying(128)", maxLength: 128, nullable: true),
                    is_deleted = table.Column<bool>(type: "boolean", nullable: false),
                    deleted_at = table.Column<DateTime>(type: "timestamp with time zone", nullable: true),
                    deleted_by = table.Column<string>(type: "text", nullable: true)
                },
                constraints: table =>
                {
                    table.PrimaryKey("pk_patient_contraceptive_histories", x => x.id);
                    table.ForeignKey(
                        name: "fk_patient_contraceptive_histories_patients_patient_id",
                        column: x => x.patient_id,
                        principalTable: "patients",
                        principalColumn: "id",
                        onDelete: ReferentialAction.Cascade);
                });

            migrationBuilder.CreateTable(
                name: "patient_dental_visions",
                columns: table => new
                {
                    id = table.Column<Guid>(type: "uuid", nullable: false),
                    client_id = table.Column<Guid>(type: "uuid", nullable: false),
                    patient_id = table.Column<Guid>(type: "uuid", nullable: false),
                    dentist_name = table.Column<string>(type: "character varying(200)", maxLength: 200, nullable: true),
                    dentist_clinic = table.Column<string>(type: "character varying(200)", maxLength: 200, nullable: true),
                    orthodontic_device = table.Column<string>(type: "character varying(100)", maxLength: 100, nullable: true),
                    eye_doctor_name = table.Column<string>(type: "character varying(200)", maxLength: 200, nullable: true),
                    corrective_lenses = table.Column<string>(type: "character varying(20)", maxLength: 20, nullable: true),
                    xmin = table.Column<uint>(type: "xid", rowVersion: true, nullable: false),
                    created_at = table.Column<DateTime>(type: "timestamp with time zone", nullable: false),
                    created_by = table.Column<string>(type: "character varying(128)", maxLength: 128, nullable: false),
                    updated_at = table.Column<DateTime>(type: "timestamp with time zone", nullable: true),
                    updated_by = table.Column<string>(type: "character varying(128)", maxLength: 128, nullable: true),
                    is_deleted = table.Column<bool>(type: "boolean", nullable: false),
                    deleted_at = table.Column<DateTime>(type: "timestamp with time zone", nullable: true),
                    deleted_by = table.Column<string>(type: "text", nullable: true)
                },
                constraints: table =>
                {
                    table.PrimaryKey("pk_patient_dental_visions", x => x.id);
                    table.ForeignKey(
                        name: "fk_patient_dental_visions_patients_patient_id",
                        column: x => x.patient_id,
                        principalTable: "patients",
                        principalColumn: "id",
                        onDelete: ReferentialAction.Cascade);
                });

            migrationBuilder.CreateTable(
                name: "patient_disabilities",
                columns: table => new
                {
                    id = table.Column<Guid>(type: "uuid", nullable: false),
                    client_id = table.Column<Guid>(type: "uuid", nullable: false),
                    patient_id = table.Column<Guid>(type: "uuid", nullable: false),
                    body_part = table.Column<string>(type: "character varying(100)", maxLength: 100, nullable: true),
                    classification = table.Column<string>(type: "character varying(200)", maxLength: 200, nullable: true),
                    is_pwd_certified = table.Column<bool>(type: "boolean", nullable: false),
                    xmin = table.Column<uint>(type: "xid", rowVersion: true, nullable: false),
                    created_at = table.Column<DateTime>(type: "timestamp with time zone", nullable: false),
                    created_by = table.Column<string>(type: "character varying(128)", maxLength: 128, nullable: false),
                    updated_at = table.Column<DateTime>(type: "timestamp with time zone", nullable: true),
                    updated_by = table.Column<string>(type: "character varying(128)", maxLength: 128, nullable: true),
                    is_deleted = table.Column<bool>(type: "boolean", nullable: false),
                    deleted_at = table.Column<DateTime>(type: "timestamp with time zone", nullable: true),
                    deleted_by = table.Column<string>(type: "text", nullable: true)
                },
                constraints: table =>
                {
                    table.PrimaryKey("pk_patient_disabilities", x => x.id);
                    table.ForeignKey(
                        name: "fk_patient_disabilities_patients_patient_id",
                        column: x => x.patient_id,
                        principalTable: "patients",
                        principalColumn: "id",
                        onDelete: ReferentialAction.Cascade);
                });

            migrationBuilder.CreateTable(
                name: "patient_family_histories",
                columns: table => new
                {
                    id = table.Column<Guid>(type: "uuid", nullable: false),
                    client_id = table.Column<Guid>(type: "uuid", nullable: false),
                    patient_id = table.Column<Guid>(type: "uuid", nullable: false),
                    relation = table.Column<string>(type: "character varying(30)", maxLength: 30, nullable: false),
                    condition_name = table.Column<string>(type: "character varying(300)", maxLength: 300, nullable: false),
                    age_of_onset = table.Column<int>(type: "integer", nullable: true),
                    is_deceased = table.Column<bool>(type: "boolean", nullable: false),
                    notes = table.Column<string>(type: "character varying(1000)", maxLength: 1000, nullable: true),
                    xmin = table.Column<uint>(type: "xid", rowVersion: true, nullable: false),
                    created_at = table.Column<DateTime>(type: "timestamp with time zone", nullable: false),
                    created_by = table.Column<string>(type: "character varying(128)", maxLength: 128, nullable: false),
                    updated_at = table.Column<DateTime>(type: "timestamp with time zone", nullable: true),
                    updated_by = table.Column<string>(type: "character varying(128)", maxLength: 128, nullable: true),
                    is_deleted = table.Column<bool>(type: "boolean", nullable: false),
                    deleted_at = table.Column<DateTime>(type: "timestamp with time zone", nullable: true),
                    deleted_by = table.Column<string>(type: "text", nullable: true)
                },
                constraints: table =>
                {
                    table.PrimaryKey("pk_patient_family_histories", x => x.id);
                    table.ForeignKey(
                        name: "fk_patient_family_histories_patients_patient_id",
                        column: x => x.patient_id,
                        principalTable: "patients",
                        principalColumn: "id",
                        onDelete: ReferentialAction.Cascade);
                });

            migrationBuilder.CreateTable(
                name: "patient_government_ids",
                columns: table => new
                {
                    id = table.Column<Guid>(type: "uuid", nullable: false),
                    client_id = table.Column<Guid>(type: "uuid", nullable: false),
                    patient_id = table.Column<Guid>(type: "uuid", nullable: false),
                    id_type = table.Column<string>(type: "character varying(30)", maxLength: 30, nullable: false),
                    id_number = table.Column<string>(type: "character varying(100)", maxLength: 100, nullable: false),
                    issued_at = table.Column<DateOnly>(type: "date", nullable: true),
                    expires_at = table.Column<DateOnly>(type: "date", nullable: true),
                    philhealth_category = table.Column<string>(type: "text", nullable: true),
                    sponsor_pin = table.Column<string>(type: "character varying(50)", maxLength: 50, nullable: true),
                    sponsor_last_name = table.Column<string>(type: "character varying(100)", maxLength: 100, nullable: true),
                    sponsor_first_name = table.Column<string>(type: "character varying(100)", maxLength: 100, nullable: true),
                    sponsor_middle_name = table.Column<string>(type: "character varying(100)", maxLength: 100, nullable: true),
                    sponsor_suffix = table.Column<string>(type: "character varying(20)", maxLength: 20, nullable: true),
                    sponsor_dob = table.Column<DateOnly>(type: "date", nullable: true),
                    sponsor_relationship = table.Column<string>(type: "character varying(50)", maxLength: 50, nullable: true),
                    xmin = table.Column<uint>(type: "xid", rowVersion: true, nullable: false),
                    created_at = table.Column<DateTime>(type: "timestamp with time zone", nullable: false),
                    created_by = table.Column<string>(type: "character varying(128)", maxLength: 128, nullable: false),
                    updated_at = table.Column<DateTime>(type: "timestamp with time zone", nullable: true),
                    updated_by = table.Column<string>(type: "character varying(128)", maxLength: 128, nullable: true),
                    is_deleted = table.Column<bool>(type: "boolean", nullable: false),
                    deleted_at = table.Column<DateTime>(type: "timestamp with time zone", nullable: true),
                    deleted_by = table.Column<string>(type: "text", nullable: true)
                },
                constraints: table =>
                {
                    table.PrimaryKey("pk_patient_government_ids", x => x.id);
                    table.ForeignKey(
                        name: "fk_patient_government_ids_patients_patient_id",
                        column: x => x.patient_id,
                        principalTable: "patients",
                        principalColumn: "id",
                        onDelete: ReferentialAction.Cascade);
                });

            migrationBuilder.CreateTable(
                name: "patient_healthcare_providers",
                columns: table => new
                {
                    id = table.Column<Guid>(type: "uuid", nullable: false),
                    client_id = table.Column<Guid>(type: "uuid", nullable: false),
                    patient_id = table.Column<Guid>(type: "uuid", nullable: false),
                    provider_type = table.Column<string>(type: "character varying(30)", maxLength: 30, nullable: false),
                    name = table.Column<string>(type: "character varying(200)", maxLength: 200, nullable: true),
                    specialty = table.Column<string>(type: "character varying(150)", maxLength: 150, nullable: true),
                    clinic_hospital = table.Column<string>(type: "character varying(200)", maxLength: 200, nullable: true),
                    phone = table.Column<string>(type: "character varying(20)", maxLength: 20, nullable: true),
                    xmin = table.Column<uint>(type: "xid", rowVersion: true, nullable: false),
                    created_at = table.Column<DateTime>(type: "timestamp with time zone", nullable: false),
                    created_by = table.Column<string>(type: "character varying(128)", maxLength: 128, nullable: false),
                    updated_at = table.Column<DateTime>(type: "timestamp with time zone", nullable: true),
                    updated_by = table.Column<string>(type: "character varying(128)", maxLength: 128, nullable: true),
                    is_deleted = table.Column<bool>(type: "boolean", nullable: false),
                    deleted_at = table.Column<DateTime>(type: "timestamp with time zone", nullable: true),
                    deleted_by = table.Column<string>(type: "text", nullable: true)
                },
                constraints: table =>
                {
                    table.PrimaryKey("pk_patient_healthcare_providers", x => x.id);
                    table.ForeignKey(
                        name: "fk_patient_healthcare_providers_patients_patient_id",
                        column: x => x.patient_id,
                        principalTable: "patients",
                        principalColumn: "id",
                        onDelete: ReferentialAction.Cascade);
                });

            migrationBuilder.CreateTable(
                name: "patient_immunizations_self",
                columns: table => new
                {
                    id = table.Column<Guid>(type: "uuid", nullable: false),
                    client_id = table.Column<Guid>(type: "uuid", nullable: false),
                    patient_id = table.Column<Guid>(type: "uuid", nullable: false),
                    immunization_category = table.Column<string>(type: "character varying(30)", maxLength: 30, nullable: true),
                    vaccine_name = table.Column<string>(type: "character varying(200)", maxLength: 200, nullable: false),
                    dose_number = table.Column<string>(type: "character varying(20)", maxLength: 20, nullable: true),
                    lot_number = table.Column<string>(type: "character varying(50)", maxLength: 50, nullable: true),
                    date = table.Column<DateOnly>(type: "date", nullable: true),
                    administered_by = table.Column<string>(type: "character varying(200)", maxLength: 200, nullable: true),
                    xmin = table.Column<uint>(type: "xid", rowVersion: true, nullable: false),
                    created_at = table.Column<DateTime>(type: "timestamp with time zone", nullable: false),
                    created_by = table.Column<string>(type: "character varying(128)", maxLength: 128, nullable: false),
                    updated_at = table.Column<DateTime>(type: "timestamp with time zone", nullable: true),
                    updated_by = table.Column<string>(type: "character varying(128)", maxLength: 128, nullable: true),
                    is_deleted = table.Column<bool>(type: "boolean", nullable: false),
                    deleted_at = table.Column<DateTime>(type: "timestamp with time zone", nullable: true),
                    deleted_by = table.Column<string>(type: "text", nullable: true)
                },
                constraints: table =>
                {
                    table.PrimaryKey("pk_patient_immunizations_self", x => x.id);
                    table.ForeignKey(
                        name: "fk_patient_immunizations_self_patients_patient_id",
                        column: x => x.patient_id,
                        principalTable: "patients",
                        principalColumn: "id",
                        onDelete: ReferentialAction.Cascade);
                });

            migrationBuilder.CreateTable(
                name: "patient_male_reproductives",
                columns: table => new
                {
                    id = table.Column<Guid>(type: "uuid", nullable: false),
                    client_id = table.Column<Guid>(type: "uuid", nullable: false),
                    patient_id = table.Column<Guid>(type: "uuid", nullable: false),
                    has_vasectomy = table.Column<bool>(type: "boolean", nullable: false),
                    vasectomy_date = table.Column<DateOnly>(type: "date", nullable: true),
                    conditions = table.Column<string>(type: "character varying(500)", maxLength: 500, nullable: true),
                    xmin = table.Column<uint>(type: "xid", rowVersion: true, nullable: false),
                    created_at = table.Column<DateTime>(type: "timestamp with time zone", nullable: false),
                    created_by = table.Column<string>(type: "character varying(128)", maxLength: 128, nullable: false),
                    updated_at = table.Column<DateTime>(type: "timestamp with time zone", nullable: true),
                    updated_by = table.Column<string>(type: "character varying(128)", maxLength: 128, nullable: true),
                    is_deleted = table.Column<bool>(type: "boolean", nullable: false),
                    deleted_at = table.Column<DateTime>(type: "timestamp with time zone", nullable: true),
                    deleted_by = table.Column<string>(type: "text", nullable: true)
                },
                constraints: table =>
                {
                    table.PrimaryKey("pk_patient_male_reproductives", x => x.id);
                    table.ForeignKey(
                        name: "fk_patient_male_reproductives_patients_patient_id",
                        column: x => x.patient_id,
                        principalTable: "patients",
                        principalColumn: "id",
                        onDelete: ReferentialAction.Cascade);
                });

            migrationBuilder.CreateTable(
                name: "patient_medications",
                columns: table => new
                {
                    id = table.Column<Guid>(type: "uuid", nullable: false),
                    client_id = table.Column<Guid>(type: "uuid", nullable: false),
                    patient_id = table.Column<Guid>(type: "uuid", nullable: false),
                    medication_name = table.Column<string>(type: "character varying(200)", maxLength: 200, nullable: false),
                    generic_name = table.Column<string>(type: "character varying(200)", maxLength: 200, nullable: true),
                    dosage = table.Column<string>(type: "character varying(100)", maxLength: 100, nullable: true),
                    frequency = table.Column<string>(type: "character varying(100)", maxLength: 100, nullable: true),
                    route = table.Column<string>(type: "character varying(80)", maxLength: 80, nullable: true),
                    start_date = table.Column<DateOnly>(type: "date", nullable: true),
                    end_date = table.Column<DateOnly>(type: "date", nullable: true),
                    is_currently_taking = table.Column<bool>(type: "boolean", nullable: false),
                    prescribed_by = table.Column<string>(type: "character varying(200)", maxLength: 200, nullable: true),
                    purpose = table.Column<string>(type: "character varying(500)", maxLength: 500, nullable: true),
                    notes = table.Column<string>(type: "character varying(1000)", maxLength: 1000, nullable: true),
                    xmin = table.Column<uint>(type: "xid", rowVersion: true, nullable: false),
                    created_at = table.Column<DateTime>(type: "timestamp with time zone", nullable: false),
                    created_by = table.Column<string>(type: "character varying(128)", maxLength: 128, nullable: false),
                    updated_at = table.Column<DateTime>(type: "timestamp with time zone", nullable: true),
                    updated_by = table.Column<string>(type: "character varying(128)", maxLength: 128, nullable: true),
                    is_deleted = table.Column<bool>(type: "boolean", nullable: false),
                    deleted_at = table.Column<DateTime>(type: "timestamp with time zone", nullable: true),
                    deleted_by = table.Column<string>(type: "text", nullable: true)
                },
                constraints: table =>
                {
                    table.PrimaryKey("pk_patient_medications", x => x.id);
                    table.ForeignKey(
                        name: "fk_patient_medications_patients_patient_id",
                        column: x => x.patient_id,
                        principalTable: "patients",
                        principalColumn: "id",
                        onDelete: ReferentialAction.Cascade);
                });

            migrationBuilder.CreateTable(
                name: "patient_mental_health_profiles",
                columns: table => new
                {
                    id = table.Column<Guid>(type: "uuid", nullable: false),
                    client_id = table.Column<Guid>(type: "uuid", nullable: false),
                    patient_id = table.Column<Guid>(type: "uuid", nullable: false),
                    has_diagnosis = table.Column<bool>(type: "boolean", nullable: false),
                    diagnosis_name = table.Column<string>(type: "character varying(300)", maxLength: 300, nullable: true),
                    is_on_medication = table.Column<bool>(type: "boolean", nullable: false),
                    medication_name = table.Column<string>(type: "character varying(200)", maxLength: 200, nullable: true),
                    therapist_name = table.Column<string>(type: "character varying(200)", maxLength: 200, nullable: true),
                    therapy_type = table.Column<string>(type: "character varying(100)", maxLength: 100, nullable: true),
                    session_frequency = table.Column<string>(type: "character varying(100)", maxLength: 100, nullable: true),
                    notes = table.Column<string>(type: "character varying(1000)", maxLength: 1000, nullable: true),
                    xmin = table.Column<uint>(type: "xid", rowVersion: true, nullable: false),
                    created_at = table.Column<DateTime>(type: "timestamp with time zone", nullable: false),
                    created_by = table.Column<string>(type: "character varying(128)", maxLength: 128, nullable: false),
                    updated_at = table.Column<DateTime>(type: "timestamp with time zone", nullable: true),
                    updated_by = table.Column<string>(type: "character varying(128)", maxLength: 128, nullable: true),
                    is_deleted = table.Column<bool>(type: "boolean", nullable: false),
                    deleted_at = table.Column<DateTime>(type: "timestamp with time zone", nullable: true),
                    deleted_by = table.Column<string>(type: "text", nullable: true)
                },
                constraints: table =>
                {
                    table.PrimaryKey("pk_patient_mental_health_profiles", x => x.id);
                    table.ForeignKey(
                        name: "fk_patient_mental_health_profiles_patients_patient_id",
                        column: x => x.patient_id,
                        principalTable: "patients",
                        principalColumn: "id",
                        onDelete: ReferentialAction.Cascade);
                });

            migrationBuilder.CreateTable(
                name: "patient_ncd_questionnaires",
                columns: table => new
                {
                    id = table.Column<Guid>(type: "uuid", nullable: false),
                    patient_id = table.Column<Guid>(type: "uuid", nullable: false),
                    qid1yn = table.Column<string>(type: "character varying(5)", maxLength: 5, nullable: true),
                    qid2yn = table.Column<string>(type: "character varying(5)", maxLength: 5, nullable: true),
                    qid3yn = table.Column<string>(type: "character varying(5)", maxLength: 5, nullable: true),
                    qid4yn = table.Column<string>(type: "character varying(5)", maxLength: 5, nullable: true),
                    qid5ynx = table.Column<string>(type: "character varying(5)", maxLength: 5, nullable: true),
                    qid6yn = table.Column<string>(type: "character varying(5)", maxLength: 5, nullable: true),
                    qid7yn = table.Column<string>(type: "character varying(5)", maxLength: 5, nullable: true),
                    qid8yn = table.Column<string>(type: "character varying(5)", maxLength: 5, nullable: true),
                    qid9yn = table.Column<string>(type: "character varying(5)", maxLength: 5, nullable: true),
                    qid10yn = table.Column<string>(type: "character varying(5)", maxLength: 5, nullable: true),
                    qid11yn = table.Column<string>(type: "character varying(5)", maxLength: 5, nullable: true),
                    qid12yn = table.Column<string>(type: "character varying(5)", maxLength: 5, nullable: true),
                    qid13yn = table.Column<string>(type: "character varying(5)", maxLength: 5, nullable: true),
                    qid14yn = table.Column<string>(type: "character varying(5)", maxLength: 5, nullable: true),
                    qid15yn = table.Column<string>(type: "character varying(5)", maxLength: 5, nullable: true),
                    qid16yn = table.Column<string>(type: "character varying(5)", maxLength: 5, nullable: true),
                    qid17abcde = table.Column<string>(type: "character varying(5)", maxLength: 5, nullable: true),
                    qid18yn = table.Column<string>(type: "character varying(5)", maxLength: 5, nullable: true),
                    qid19yn = table.Column<string>(type: "character varying(5)", maxLength: 5, nullable: true),
                    qid19fbs_mgdl = table.Column<decimal>(type: "numeric(6,2)", precision: 6, scale: 2, nullable: true),
                    qid19fbs_mmol = table.Column<decimal>(type: "numeric(5,2)", precision: 5, scale: 2, nullable: true),
                    qid19fbs_date = table.Column<DateOnly>(type: "date", nullable: true),
                    qid20yn = table.Column<string>(type: "character varying(5)", maxLength: 5, nullable: true),
                    qid20chole_val = table.Column<decimal>(type: "numeric(6,2)", precision: 6, scale: 2, nullable: true),
                    qid20chole_date = table.Column<DateOnly>(type: "date", nullable: true),
                    qid21yn = table.Column<string>(type: "character varying(5)", maxLength: 5, nullable: true),
                    qid21keton_val = table.Column<decimal>(type: "numeric(5,2)", precision: 5, scale: 2, nullable: true),
                    qid21keton_date = table.Column<DateOnly>(type: "date", nullable: true),
                    qid22yn = table.Column<string>(type: "character varying(5)", maxLength: 5, nullable: true),
                    qid22protein_val = table.Column<decimal>(type: "numeric(5,2)", precision: 5, scale: 2, nullable: true),
                    qid22protein_date = table.Column<DateOnly>(type: "date", nullable: true),
                    qid23yn = table.Column<string>(type: "character varying(5)", maxLength: 5, nullable: true),
                    qid24yn = table.Column<string>(type: "character varying(5)", maxLength: 5, nullable: true),
                    synced_at = table.Column<DateTime>(type: "timestamp with time zone", nullable: true),
                    server_id = table.Column<string>(type: "character varying(128)", maxLength: 128, nullable: true),
                    xmin = table.Column<uint>(type: "xid", rowVersion: true, nullable: false),
                    created_at = table.Column<DateTime>(type: "timestamp with time zone", nullable: false),
                    created_by = table.Column<string>(type: "character varying(128)", maxLength: 128, nullable: false),
                    updated_at = table.Column<DateTime>(type: "timestamp with time zone", nullable: true),
                    updated_by = table.Column<string>(type: "character varying(128)", maxLength: 128, nullable: true),
                    is_deleted = table.Column<bool>(type: "boolean", nullable: false),
                    deleted_at = table.Column<DateTime>(type: "timestamp with time zone", nullable: true),
                    deleted_by = table.Column<string>(type: "text", nullable: true)
                },
                constraints: table =>
                {
                    table.PrimaryKey("pk_patient_ncd_questionnaires", x => x.id);
                    table.ForeignKey(
                        name: "fk_patient_ncd_questionnaires_patients_patient_id",
                        column: x => x.patient_id,
                        principalTable: "patients",
                        principalColumn: "id",
                        onDelete: ReferentialAction.Cascade);
                });

            migrationBuilder.CreateTable(
                name: "patient_obstetric_profiles",
                columns: table => new
                {
                    id = table.Column<Guid>(type: "uuid", nullable: false),
                    client_id = table.Column<Guid>(type: "uuid", nullable: false),
                    patient_id = table.Column<Guid>(type: "uuid", nullable: false),
                    gravida = table.Column<int>(type: "integer", nullable: true),
                    para = table.Column<int>(type: "integer", nullable: true),
                    abortus_count = table.Column<int>(type: "integer", nullable: true),
                    living_children = table.Column<int>(type: "integer", nullable: true),
                    last_menstrual_period = table.Column<DateOnly>(type: "date", nullable: true),
                    menarche = table.Column<DateOnly>(type: "date", nullable: true),
                    is_pregnant = table.Column<bool>(type: "boolean", nullable: false),
                    menstrual_cycle_length_days = table.Column<int>(type: "integer", nullable: true),
                    has_dysmenorrhea = table.Column<bool>(type: "boolean", nullable: false),
                    notes = table.Column<string>(type: "character varying(1000)", maxLength: 1000, nullable: true),
                    xmin = table.Column<uint>(type: "xid", rowVersion: true, nullable: false),
                    created_at = table.Column<DateTime>(type: "timestamp with time zone", nullable: false),
                    created_by = table.Column<string>(type: "character varying(128)", maxLength: 128, nullable: false),
                    updated_at = table.Column<DateTime>(type: "timestamp with time zone", nullable: true),
                    updated_by = table.Column<string>(type: "character varying(128)", maxLength: 128, nullable: true),
                    is_deleted = table.Column<bool>(type: "boolean", nullable: false),
                    deleted_at = table.Column<DateTime>(type: "timestamp with time zone", nullable: true),
                    deleted_by = table.Column<string>(type: "text", nullable: true)
                },
                constraints: table =>
                {
                    table.PrimaryKey("pk_patient_obstetric_profiles", x => x.id);
                    table.ForeignKey(
                        name: "fk_patient_obstetric_profiles_patients_patient_id",
                        column: x => x.patient_id,
                        principalTable: "patients",
                        principalColumn: "id",
                        onDelete: ReferentialAction.Cascade);
                });

            migrationBuilder.CreateTable(
                name: "patient_occupations",
                columns: table => new
                {
                    id = table.Column<Guid>(type: "uuid", nullable: false),
                    client_id = table.Column<Guid>(type: "uuid", nullable: false),
                    patient_id = table.Column<Guid>(type: "uuid", nullable: false),
                    occupation = table.Column<string>(type: "character varying(200)", maxLength: 200, nullable: true),
                    employer = table.Column<string>(type: "character varying(200)", maxLength: 200, nullable: true),
                    industry = table.Column<string>(type: "character varying(200)", maxLength: 200, nullable: true),
                    work_environment = table.Column<string>(type: "character varying(30)", maxLength: 30, nullable: true),
                    years_in_occupation = table.Column<int>(type: "integer", nullable: true),
                    hazard_exposure = table.Column<string>(type: "character varying(500)", maxLength: 500, nullable: true),
                    xmin = table.Column<uint>(type: "xid", rowVersion: true, nullable: false),
                    created_at = table.Column<DateTime>(type: "timestamp with time zone", nullable: false),
                    created_by = table.Column<string>(type: "character varying(128)", maxLength: 128, nullable: false),
                    updated_at = table.Column<DateTime>(type: "timestamp with time zone", nullable: true),
                    updated_by = table.Column<string>(type: "character varying(128)", maxLength: 128, nullable: true),
                    is_deleted = table.Column<bool>(type: "boolean", nullable: false),
                    deleted_at = table.Column<DateTime>(type: "timestamp with time zone", nullable: true),
                    deleted_by = table.Column<string>(type: "text", nullable: true)
                },
                constraints: table =>
                {
                    table.PrimaryKey("pk_patient_occupations", x => x.id);
                    table.ForeignKey(
                        name: "fk_patient_occupations_patients_patient_id",
                        column: x => x.patient_id,
                        principalTable: "patients",
                        principalColumn: "id",
                        onDelete: ReferentialAction.Cascade);
                });

            migrationBuilder.CreateTable(
                name: "patient_past_illnesses",
                columns: table => new
                {
                    id = table.Column<Guid>(type: "uuid", nullable: false),
                    client_id = table.Column<Guid>(type: "uuid", nullable: false),
                    patient_id = table.Column<Guid>(type: "uuid", nullable: false),
                    illness_name = table.Column<string>(type: "character varying(300)", maxLength: 300, nullable: false),
                    diagnosed_at = table.Column<DateOnly>(type: "date", nullable: true),
                    resolved_at = table.Column<DateOnly>(type: "date", nullable: true),
                    treatment_received = table.Column<string>(type: "character varying(500)", maxLength: 500, nullable: true),
                    notes = table.Column<string>(type: "character varying(1000)", maxLength: 1000, nullable: true),
                    xmin = table.Column<uint>(type: "xid", rowVersion: true, nullable: false),
                    created_at = table.Column<DateTime>(type: "timestamp with time zone", nullable: false),
                    created_by = table.Column<string>(type: "character varying(128)", maxLength: 128, nullable: false),
                    updated_at = table.Column<DateTime>(type: "timestamp with time zone", nullable: true),
                    updated_by = table.Column<string>(type: "character varying(128)", maxLength: 128, nullable: true),
                    is_deleted = table.Column<bool>(type: "boolean", nullable: false),
                    deleted_at = table.Column<DateTime>(type: "timestamp with time zone", nullable: true),
                    deleted_by = table.Column<string>(type: "text", nullable: true)
                },
                constraints: table =>
                {
                    table.PrimaryKey("pk_patient_past_illnesses", x => x.id);
                    table.ForeignKey(
                        name: "fk_patient_past_illnesses_patients_patient_id",
                        column: x => x.patient_id,
                        principalTable: "patients",
                        principalColumn: "id",
                        onDelete: ReferentialAction.Cascade);
                });

            migrationBuilder.CreateTable(
                name: "patient_physical_exam_profiles",
                columns: table => new
                {
                    id = table.Column<Guid>(type: "uuid", nullable: false),
                    patient_id = table.Column<Guid>(type: "uuid", nullable: false),
                    clinic_id = table.Column<Guid>(type: "uuid", nullable: true),
                    exam_date = table.Column<DateOnly>(type: "date", nullable: false),
                    gen_survey_id = table.Column<string>(type: "character varying(50)", maxLength: 50, nullable: true),
                    gen_survey_rem = table.Column<string>(type: "character varying(500)", maxLength: 500, nullable: true),
                    skin_rem = table.Column<string>(type: "character varying(500)", maxLength: 500, nullable: true),
                    heent_rem = table.Column<string>(type: "character varying(500)", maxLength: 500, nullable: true),
                    chest_rem = table.Column<string>(type: "character varying(500)", maxLength: 500, nullable: true),
                    heart_rem = table.Column<string>(type: "character varying(500)", maxLength: 500, nullable: true),
                    abdomen_rem = table.Column<string>(type: "character varying(500)", maxLength: 500, nullable: true),
                    neuro_rem = table.Column<string>(type: "character varying(500)", maxLength: 500, nullable: true),
                    rectal_rem = table.Column<string>(type: "character varying(500)", maxLength: 500, nullable: true),
                    gu_rem = table.Column<string>(type: "character varying(500)", maxLength: 500, nullable: true),
                    skin_id = table.Column<string>(type: "character varying(500)", maxLength: 500, nullable: true),
                    heent_id = table.Column<string>(type: "character varying(500)", maxLength: 500, nullable: true),
                    chest_id = table.Column<string>(type: "character varying(500)", maxLength: 500, nullable: true),
                    heart_id = table.Column<string>(type: "character varying(500)", maxLength: 500, nullable: true),
                    abdomen_id = table.Column<string>(type: "character varying(500)", maxLength: 500, nullable: true),
                    neuro_id = table.Column<string>(type: "character varying(500)", maxLength: 500, nullable: true),
                    gu_id = table.Column<string>(type: "character varying(500)", maxLength: 500, nullable: true),
                    rectal_id = table.Column<string>(type: "character varying(500)", maxLength: 500, nullable: true),
                    synced_at = table.Column<DateTime>(type: "timestamp with time zone", nullable: true),
                    server_id = table.Column<string>(type: "character varying(128)", maxLength: 128, nullable: true),
                    xmin = table.Column<uint>(type: "xid", rowVersion: true, nullable: false),
                    created_at = table.Column<DateTime>(type: "timestamp with time zone", nullable: false),
                    created_by = table.Column<string>(type: "character varying(128)", maxLength: 128, nullable: false),
                    updated_at = table.Column<DateTime>(type: "timestamp with time zone", nullable: true),
                    updated_by = table.Column<string>(type: "character varying(128)", maxLength: 128, nullable: true),
                    is_deleted = table.Column<bool>(type: "boolean", nullable: false),
                    deleted_at = table.Column<DateTime>(type: "timestamp with time zone", nullable: true),
                    deleted_by = table.Column<string>(type: "text", nullable: true)
                },
                constraints: table =>
                {
                    table.PrimaryKey("pk_patient_physical_exam_profiles", x => x.id);
                    table.ForeignKey(
                        name: "fk_patient_physical_exam_profiles_patients_patient_id",
                        column: x => x.patient_id,
                        principalTable: "patients",
                        principalColumn: "id",
                        onDelete: ReferentialAction.Cascade);
                });

            migrationBuilder.CreateTable(
                name: "patient_pregnancies",
                columns: table => new
                {
                    id = table.Column<Guid>(type: "uuid", nullable: false),
                    client_id = table.Column<Guid>(type: "uuid", nullable: false),
                    patient_id = table.Column<Guid>(type: "uuid", nullable: false),
                    year = table.Column<int>(type: "integer", nullable: true),
                    outcome = table.Column<string>(type: "character varying(200)", maxLength: 200, nullable: true),
                    gestational_age_weeks = table.Column<int>(type: "integer", nullable: true),
                    delivery_type = table.Column<string>(type: "character varying(100)", maxLength: 100, nullable: true),
                    birth_weight_kg = table.Column<decimal>(type: "numeric(4,2)", precision: 4, scale: 2, nullable: true),
                    complications = table.Column<string>(type: "character varying(500)", maxLength: 500, nullable: true),
                    facility = table.Column<string>(type: "character varying(200)", maxLength: 200, nullable: true),
                    xmin = table.Column<uint>(type: "xid", rowVersion: true, nullable: false),
                    created_at = table.Column<DateTime>(type: "timestamp with time zone", nullable: false),
                    created_by = table.Column<string>(type: "character varying(128)", maxLength: 128, nullable: false),
                    updated_at = table.Column<DateTime>(type: "timestamp with time zone", nullable: true),
                    updated_by = table.Column<string>(type: "character varying(128)", maxLength: 128, nullable: true),
                    is_deleted = table.Column<bool>(type: "boolean", nullable: false),
                    deleted_at = table.Column<DateTime>(type: "timestamp with time zone", nullable: true),
                    deleted_by = table.Column<string>(type: "text", nullable: true)
                },
                constraints: table =>
                {
                    table.PrimaryKey("pk_patient_pregnancies", x => x.id);
                    table.ForeignKey(
                        name: "fk_patient_pregnancies_patients_patient_id",
                        column: x => x.patient_id,
                        principalTable: "patients",
                        principalColumn: "id",
                        onDelete: ReferentialAction.Cascade);
                });

            migrationBuilder.CreateTable(
                name: "patient_social_histories",
                columns: table => new
                {
                    id = table.Column<Guid>(type: "uuid", nullable: false),
                    client_id = table.Column<Guid>(type: "uuid", nullable: false),
                    patient_id = table.Column<Guid>(type: "uuid", nullable: false),
                    smoking_status = table.Column<string>(type: "character varying(30)", maxLength: 30, nullable: true),
                    cigs_per_day = table.Column<int>(type: "integer", nullable: true),
                    pack_years = table.Column<decimal>(type: "numeric(5,1)", precision: 5, scale: 1, nullable: true),
                    quit_date = table.Column<DateOnly>(type: "date", nullable: true),
                    other_tobacco_products = table.Column<string>(type: "character varying(200)", maxLength: 200, nullable: true),
                    alcohol_use = table.Column<string>(type: "character varying(30)", maxLength: 30, nullable: true),
                    alcohol_type = table.Column<string>(type: "character varying(100)", maxLength: 100, nullable: true),
                    alcohol_frequency_days_per_week = table.Column<int>(type: "integer", nullable: true),
                    alcohol_quantity_per_occasion = table.Column<int>(type: "integer", nullable: true),
                    uses_substances = table.Column<bool>(type: "boolean", nullable: false),
                    substance_name = table.Column<string>(type: "character varying(200)", maxLength: 200, nullable: true),
                    substance_route = table.Column<string>(type: "character varying(100)", maxLength: 100, nullable: true),
                    substance_frequency = table.Column<string>(type: "character varying(100)", maxLength: 100, nullable: true),
                    activity_level = table.Column<string>(type: "character varying(30)", maxLength: 30, nullable: true),
                    exercise_type = table.Column<string>(type: "character varying(200)", maxLength: 200, nullable: true),
                    exercise_frequency_days_per_week = table.Column<int>(type: "integer", nullable: true),
                    diet_pattern = table.Column<string>(type: "character varying(200)", maxLength: 200, nullable: true),
                    food_restrictions = table.Column<string>(type: "character varying(500)", maxLength: 500, nullable: true),
                    sleep_avg_hours = table.Column<decimal>(type: "numeric(4,1)", precision: 4, scale: 1, nullable: true),
                    sleep_quality = table.Column<string>(type: "character varying(20)", maxLength: 20, nullable: true),
                    is_sexually_active = table.Column<bool>(type: "boolean", nullable: true),
                    water_intake = table.Column<string>(type: "character varying(100)", maxLength: 100, nullable: true),
                    occupational_hazards = table.Column<string>(type: "character varying(500)", maxLength: 500, nullable: true),
                    xmin = table.Column<uint>(type: "xid", rowVersion: true, nullable: false),
                    created_at = table.Column<DateTime>(type: "timestamp with time zone", nullable: false),
                    created_by = table.Column<string>(type: "character varying(128)", maxLength: 128, nullable: false),
                    updated_at = table.Column<DateTime>(type: "timestamp with time zone", nullable: true),
                    updated_by = table.Column<string>(type: "character varying(128)", maxLength: 128, nullable: true),
                    is_deleted = table.Column<bool>(type: "boolean", nullable: false),
                    deleted_at = table.Column<DateTime>(type: "timestamp with time zone", nullable: true),
                    deleted_by = table.Column<string>(type: "text", nullable: true)
                },
                constraints: table =>
                {
                    table.PrimaryKey("pk_patient_social_histories", x => x.id);
                    table.ForeignKey(
                        name: "fk_patient_social_histories_patients_patient_id",
                        column: x => x.patient_id,
                        principalTable: "patients",
                        principalColumn: "id",
                        onDelete: ReferentialAction.Cascade);
                });

            migrationBuilder.CreateTable(
                name: "patient_storage_profiles",
                columns: table => new
                {
                    id = table.Column<Guid>(type: "uuid", nullable: false),
                    patient_id = table.Column<Guid>(type: "uuid", nullable: false),
                    encrypted_mak = table.Column<string>(type: "character varying(1000)", maxLength: 1000, nullable: true),
                    quota_bytes = table.Column<long>(type: "bigint", nullable: false),
                    used_bytes = table.Column<long>(type: "bigint", nullable: false),
                    xmin = table.Column<uint>(type: "xid", rowVersion: true, nullable: false),
                    created_at = table.Column<DateTime>(type: "timestamp with time zone", nullable: false),
                    created_by = table.Column<string>(type: "character varying(128)", maxLength: 128, nullable: false),
                    updated_at = table.Column<DateTime>(type: "timestamp with time zone", nullable: true),
                    updated_by = table.Column<string>(type: "character varying(128)", maxLength: 128, nullable: true),
                    is_deleted = table.Column<bool>(type: "boolean", nullable: false),
                    deleted_at = table.Column<DateTime>(type: "timestamp with time zone", nullable: true),
                    deleted_by = table.Column<string>(type: "text", nullable: true)
                },
                constraints: table =>
                {
                    table.PrimaryKey("pk_patient_storage_profiles", x => x.id);
                    table.ForeignKey(
                        name: "fk_patient_storage_profiles_patients_patient_id",
                        column: x => x.patient_id,
                        principalTable: "patients",
                        principalColumn: "id",
                        onDelete: ReferentialAction.Cascade);
                });

            migrationBuilder.CreateTable(
                name: "patient_surgical_histories",
                columns: table => new
                {
                    id = table.Column<Guid>(type: "uuid", nullable: false),
                    client_id = table.Column<Guid>(type: "uuid", nullable: false),
                    patient_id = table.Column<Guid>(type: "uuid", nullable: false),
                    procedure_name = table.Column<string>(type: "character varying(300)", maxLength: 300, nullable: false),
                    surgeon_name = table.Column<string>(type: "character varying(200)", maxLength: 200, nullable: true),
                    hospital = table.Column<string>(type: "character varying(200)", maxLength: 200, nullable: true),
                    surgery_date = table.Column<DateOnly>(type: "date", nullable: true),
                    anesthesia_type = table.Column<string>(type: "character varying(80)", maxLength: 80, nullable: true),
                    complications = table.Column<string>(type: "character varying(1000)", maxLength: 1000, nullable: true),
                    notes = table.Column<string>(type: "character varying(1000)", maxLength: 1000, nullable: true),
                    xmin = table.Column<uint>(type: "xid", rowVersion: true, nullable: false),
                    created_at = table.Column<DateTime>(type: "timestamp with time zone", nullable: false),
                    created_by = table.Column<string>(type: "character varying(128)", maxLength: 128, nullable: false),
                    updated_at = table.Column<DateTime>(type: "timestamp with time zone", nullable: true),
                    updated_by = table.Column<string>(type: "character varying(128)", maxLength: 128, nullable: true),
                    is_deleted = table.Column<bool>(type: "boolean", nullable: false),
                    deleted_at = table.Column<DateTime>(type: "timestamp with time zone", nullable: true),
                    deleted_by = table.Column<string>(type: "text", nullable: true)
                },
                constraints: table =>
                {
                    table.PrimaryKey("pk_patient_surgical_histories", x => x.id);
                    table.ForeignKey(
                        name: "fk_patient_surgical_histories_patients_patient_id",
                        column: x => x.patient_id,
                        principalTable: "patients",
                        principalColumn: "id",
                        onDelete: ReferentialAction.Cascade);
                });

            migrationBuilder.CreateTable(
                name: "patient_travel_histories",
                columns: table => new
                {
                    id = table.Column<Guid>(type: "uuid", nullable: false),
                    client_id = table.Column<Guid>(type: "uuid", nullable: false),
                    patient_id = table.Column<Guid>(type: "uuid", nullable: false),
                    destination = table.Column<string>(type: "character varying(200)", maxLength: 200, nullable: false),
                    city_province = table.Column<string>(type: "character varying(200)", maxLength: 200, nullable: true),
                    departure_date = table.Column<DateOnly>(type: "date", nullable: true),
                    return_date = table.Column<DateOnly>(type: "date", nullable: true),
                    purpose = table.Column<string>(type: "character varying(30)", maxLength: 30, nullable: true),
                    illness_during_after_travel = table.Column<string>(type: "character varying(500)", maxLength: 500, nullable: true),
                    xmin = table.Column<uint>(type: "xid", rowVersion: true, nullable: false),
                    created_at = table.Column<DateTime>(type: "timestamp with time zone", nullable: false),
                    created_by = table.Column<string>(type: "character varying(128)", maxLength: 128, nullable: false),
                    updated_at = table.Column<DateTime>(type: "timestamp with time zone", nullable: true),
                    updated_by = table.Column<string>(type: "character varying(128)", maxLength: 128, nullable: true),
                    is_deleted = table.Column<bool>(type: "boolean", nullable: false),
                    deleted_at = table.Column<DateTime>(type: "timestamp with time zone", nullable: true),
                    deleted_by = table.Column<string>(type: "text", nullable: true)
                },
                constraints: table =>
                {
                    table.PrimaryKey("pk_patient_travel_histories", x => x.id);
                    table.ForeignKey(
                        name: "fk_patient_travel_histories_patients_patient_id",
                        column: x => x.patient_id,
                        principalTable: "patients",
                        principalColumn: "id",
                        onDelete: ReferentialAction.Cascade);
                });

            migrationBuilder.CreateTable(
                name: "prescription_documents",
                columns: table => new
                {
                    id = table.Column<Guid>(type: "uuid", nullable: false),
                    patient_id = table.Column<Guid>(type: "uuid", nullable: false),
                    prescription_id = table.Column<Guid>(type: "uuid", nullable: false),
                    prescription_number = table.Column<string>(type: "character varying(60)", maxLength: 60, nullable: false),
                    ordering_tenant_id = table.Column<string>(type: "character varying(100)", maxLength: 100, nullable: false),
                    ordering_facility_id = table.Column<string>(type: "character varying(64)", maxLength: 64, nullable: false),
                    ordering_facility_name = table.Column<string>(type: "character varying(200)", maxLength: 200, nullable: false),
                    prescriber_name = table.Column<string>(type: "character varying(200)", maxLength: 200, nullable: false),
                    prescriber_prc_license = table.Column<string>(type: "character varying(50)", maxLength: 50, nullable: false),
                    diagnosis = table.Column<string>(type: "character varying(500)", maxLength: 500, nullable: true),
                    instructions = table.Column<string>(type: "character varying(1000)", maxLength: 1000, nullable: true),
                    stage = table.Column<string>(type: "character varying(30)", maxLength: 30, nullable: false),
                    stage_changed_at = table.Column<DateTime>(type: "timestamp with time zone", nullable: true),
                    quoted_amount = table.Column<decimal>(type: "numeric(12,2)", precision: 12, scale: 2, nullable: true),
                    pharmacy_name = table.Column<string>(type: "character varying(200)", maxLength: 200, nullable: true),
                    claim_token = table.Column<string>(type: "character varying(2000)", maxLength: 2000, nullable: true),
                    verification_url = table.Column<string>(type: "character varying(500)", maxLength: 500, nullable: true),
                    receipt_number = table.Column<string>(type: "character varying(100)", maxLength: 100, nullable: true),
                    dispensed_at = table.Column<DateTime>(type: "timestamp with time zone", nullable: true),
                    external_pharmacy_name = table.Column<string>(type: "character varying(200)", maxLength: 200, nullable: true),
                    issued_at = table.Column<DateTime>(type: "timestamp with time zone", nullable: false),
                    has_details = table.Column<bool>(type: "boolean", nullable: false),
                    xmin = table.Column<uint>(type: "xid", rowVersion: true, nullable: false),
                    created_at = table.Column<DateTime>(type: "timestamp with time zone", nullable: false),
                    created_by = table.Column<string>(type: "character varying(128)", maxLength: 128, nullable: false),
                    updated_at = table.Column<DateTime>(type: "timestamp with time zone", nullable: true),
                    updated_by = table.Column<string>(type: "character varying(128)", maxLength: 128, nullable: true),
                    is_deleted = table.Column<bool>(type: "boolean", nullable: false),
                    deleted_at = table.Column<DateTime>(type: "timestamp with time zone", nullable: true),
                    deleted_by = table.Column<string>(type: "character varying(128)", maxLength: 128, nullable: true)
                },
                constraints: table =>
                {
                    table.PrimaryKey("pk_prescription_documents", x => x.id);
                    table.ForeignKey(
                        name: "fk_prescription_documents_patients_patient_id",
                        column: x => x.patient_id,
                        principalTable: "patients",
                        principalColumn: "id",
                        onDelete: ReferentialAction.Cascade);
                });

            migrationBuilder.CreateTable(
                name: "share_codes",
                columns: table => new
                {
                    id = table.Column<Guid>(type: "uuid", nullable: false),
                    patient_id = table.Column<Guid>(type: "uuid", nullable: false),
                    token_id = table.Column<string>(type: "character varying(64)", maxLength: 64, nullable: false),
                    code_hash = table.Column<string>(type: "character varying(64)", maxLength: 64, nullable: false),
                    scopes = table.Column<string>(type: "character varying(200)", maxLength: 200, nullable: false),
                    purpose = table.Column<string>(type: "character varying(200)", maxLength: 200, nullable: false),
                    expires_at = table.Column<DateTime>(type: "timestamp with time zone", nullable: false),
                    xmin = table.Column<uint>(type: "xid", rowVersion: true, nullable: false),
                    created_at = table.Column<DateTime>(type: "timestamp with time zone", nullable: false),
                    created_by = table.Column<string>(type: "character varying(128)", maxLength: 128, nullable: false),
                    updated_at = table.Column<DateTime>(type: "timestamp with time zone", nullable: true),
                    updated_by = table.Column<string>(type: "character varying(128)", maxLength: 128, nullable: true),
                    is_deleted = table.Column<bool>(type: "boolean", nullable: false),
                    deleted_at = table.Column<DateTime>(type: "timestamp with time zone", nullable: true),
                    deleted_by = table.Column<string>(type: "character varying(128)", maxLength: 128, nullable: true)
                },
                constraints: table =>
                {
                    table.PrimaryKey("pk_share_codes", x => x.id);
                    table.ForeignKey(
                        name: "fk_share_codes_patients_patient_id",
                        column: x => x.patient_id,
                        principalTable: "patients",
                        principalColumn: "id",
                        onDelete: ReferentialAction.Cascade);
                });

            migrationBuilder.CreateTable(
                name: "sync_logs",
                columns: table => new
                {
                    id = table.Column<Guid>(type: "uuid", nullable: false),
                    patient_id = table.Column<Guid>(type: "uuid", nullable: false),
                    entity_type = table.Column<string>(type: "character varying(100)", maxLength: 100, nullable: false),
                    entity_id = table.Column<Guid>(type: "uuid", nullable: true),
                    idempotency_key = table.Column<Guid>(type: "uuid", nullable: false),
                    operation = table.Column<string>(type: "character varying(20)", maxLength: 20, nullable: false),
                    client_timestamp = table.Column<DateTime>(type: "timestamp with time zone", nullable: false),
                    server_timestamp = table.Column<DateTime>(type: "timestamp with time zone", nullable: false),
                    status = table.Column<string>(type: "character varying(30)", maxLength: 30, nullable: false),
                    conflict_detail = table.Column<string>(type: "text", nullable: true),
                    payload_json = table.Column<string>(type: "text", nullable: true),
                    xmin = table.Column<uint>(type: "xid", rowVersion: true, nullable: false),
                    created_at = table.Column<DateTime>(type: "timestamp with time zone", nullable: false),
                    created_by = table.Column<string>(type: "character varying(128)", maxLength: 128, nullable: false),
                    updated_at = table.Column<DateTime>(type: "timestamp with time zone", nullable: true),
                    updated_by = table.Column<string>(type: "character varying(128)", maxLength: 128, nullable: true),
                    is_deleted = table.Column<bool>(type: "boolean", nullable: false),
                    deleted_at = table.Column<DateTime>(type: "timestamp with time zone", nullable: true),
                    deleted_by = table.Column<string>(type: "text", nullable: true)
                },
                constraints: table =>
                {
                    table.PrimaryKey("pk_sync_logs", x => x.id);
                    table.ForeignKey(
                        name: "fk_sync_logs_patients_patient_id",
                        column: x => x.patient_id,
                        principalTable: "patients",
                        principalColumn: "id",
                        onDelete: ReferentialAction.Cascade);
                });

            migrationBuilder.CreateTable(
                name: "vaccinations_administered",
                columns: table => new
                {
                    id = table.Column<Guid>(type: "uuid", nullable: false),
                    patient_id = table.Column<Guid>(type: "uuid", nullable: false),
                    clinic_id = table.Column<Guid>(type: "uuid", nullable: true),
                    vaccine_name = table.Column<string>(type: "character varying(200)", maxLength: 200, nullable: false),
                    disease_targeted = table.Column<string>(type: "character varying(200)", maxLength: 200, nullable: true),
                    dose_number = table.Column<string>(type: "character varying(20)", maxLength: 20, nullable: true),
                    date_administered = table.Column<DateOnly>(type: "date", nullable: false),
                    lot_batch_number = table.Column<string>(type: "character varying(50)", maxLength: 50, nullable: true),
                    administered_by = table.Column<string>(type: "character varying(200)", maxLength: 200, nullable: true),
                    facility = table.Column<string>(type: "character varying(200)", maxLength: 200, nullable: true),
                    route = table.Column<string>(type: "character varying(50)", maxLength: 50, nullable: true),
                    injection_site = table.Column<string>(type: "character varying(100)", maxLength: 100, nullable: true),
                    next_due_date = table.Column<DateOnly>(type: "date", nullable: true),
                    adverse_reaction = table.Column<string>(type: "character varying(20)", maxLength: 20, nullable: true),
                    adverse_reaction_description = table.Column<string>(type: "character varying(500)", maxLength: 500, nullable: true),
                    vaccine_program = table.Column<string>(type: "character varying(30)", maxLength: 30, nullable: true),
                    synced_at = table.Column<DateTime>(type: "timestamp with time zone", nullable: true),
                    server_id = table.Column<string>(type: "character varying(128)", maxLength: 128, nullable: true),
                    xmin = table.Column<uint>(type: "xid", rowVersion: true, nullable: false),
                    created_at = table.Column<DateTime>(type: "timestamp with time zone", nullable: false),
                    created_by = table.Column<string>(type: "character varying(128)", maxLength: 128, nullable: false),
                    updated_at = table.Column<DateTime>(type: "timestamp with time zone", nullable: true),
                    updated_by = table.Column<string>(type: "character varying(128)", maxLength: 128, nullable: true),
                    is_deleted = table.Column<bool>(type: "boolean", nullable: false),
                    deleted_at = table.Column<DateTime>(type: "timestamp with time zone", nullable: true),
                    deleted_by = table.Column<string>(type: "text", nullable: true)
                },
                constraints: table =>
                {
                    table.PrimaryKey("pk_vaccinations_administered", x => x.id);
                    table.ForeignKey(
                        name: "fk_vaccinations_administered_patients_patient_id",
                        column: x => x.patient_id,
                        principalTable: "patients",
                        principalColumn: "id",
                        onDelete: ReferentialAction.Cascade);
                });

            migrationBuilder.CreateTable(
                name: "provider_availabilities",
                columns: table => new
                {
                    id = table.Column<Guid>(type: "uuid", nullable: false),
                    clinic_healthcare_provider_id = table.Column<Guid>(type: "uuid", nullable: false),
                    day_of_week = table.Column<string>(type: "character varying(64)", maxLength: 64, nullable: false),
                    start_time = table.Column<TimeSpan>(type: "interval", nullable: false),
                    end_time = table.Column<TimeSpan>(type: "interval", nullable: false),
                    is_active = table.Column<bool>(type: "boolean", nullable: false),
                    xmin = table.Column<uint>(type: "xid", rowVersion: true, nullable: false),
                    created_at = table.Column<DateTime>(type: "timestamp with time zone", nullable: false),
                    created_by = table.Column<string>(type: "text", nullable: false),
                    updated_at = table.Column<DateTime>(type: "timestamp with time zone", nullable: true),
                    updated_by = table.Column<string>(type: "text", nullable: true),
                    is_deleted = table.Column<bool>(type: "boolean", nullable: false),
                    deleted_at = table.Column<DateTime>(type: "timestamp with time zone", nullable: true),
                    deleted_by = table.Column<string>(type: "text", nullable: true)
                },
                constraints: table =>
                {
                    table.PrimaryKey("pk_provider_availabilities", x => x.id);
                    table.ForeignKey(
                        name: "fk_provider_availabilities_clinic_healthcare_providers_clinic_",
                        column: x => x.clinic_healthcare_provider_id,
                        principalTable: "clinic_healthcare_providers",
                        principalColumn: "id",
                        onDelete: ReferentialAction.Cascade);
                });

            migrationBuilder.CreateTable(
                name: "imaging_results",
                columns: table => new
                {
                    id = table.Column<Guid>(type: "uuid", nullable: false),
                    patient_id = table.Column<Guid>(type: "uuid", nullable: false),
                    clinic_id = table.Column<Guid>(type: "uuid", nullable: false),
                    consultation_id = table.Column<Guid>(type: "uuid", nullable: true),
                    modality = table.Column<string>(type: "character varying(30)", maxLength: 30, nullable: false),
                    body_part = table.Column<string>(type: "character varying(100)", maxLength: 100, nullable: true),
                    findings = table.Column<string>(type: "character varying(2000)", maxLength: 2000, nullable: true),
                    impression = table.Column<string>(type: "character varying(1000)", maxLength: 1000, nullable: true),
                    image_url = table.Column<string>(type: "character varying(500)", maxLength: 500, nullable: true),
                    performed_at = table.Column<DateTime>(type: "timestamp with time zone", nullable: false),
                    xmin = table.Column<uint>(type: "xid", rowVersion: true, nullable: false),
                    created_at = table.Column<DateTime>(type: "timestamp with time zone", nullable: false),
                    created_by = table.Column<string>(type: "character varying(128)", maxLength: 128, nullable: false),
                    updated_at = table.Column<DateTime>(type: "timestamp with time zone", nullable: true),
                    updated_by = table.Column<string>(type: "character varying(128)", maxLength: 128, nullable: true),
                    is_deleted = table.Column<bool>(type: "boolean", nullable: false),
                    deleted_at = table.Column<DateTime>(type: "timestamp with time zone", nullable: true),
                    deleted_by = table.Column<string>(type: "text", nullable: true)
                },
                constraints: table =>
                {
                    table.PrimaryKey("pk_imaging_results", x => x.id);
                    table.ForeignKey(
                        name: "fk_imaging_results_consultations_consultation_id",
                        column: x => x.consultation_id,
                        principalTable: "consultations",
                        principalColumn: "id",
                        onDelete: ReferentialAction.SetNull);
                    table.ForeignKey(
                        name: "fk_imaging_results_patients_patient_id",
                        column: x => x.patient_id,
                        principalTable: "patients",
                        principalColumn: "id",
                        onDelete: ReferentialAction.Cascade);
                });

            migrationBuilder.CreateTable(
                name: "vital_signs",
                columns: table => new
                {
                    id = table.Column<Guid>(type: "uuid", nullable: false),
                    patient_id = table.Column<Guid>(type: "uuid", nullable: false),
                    clinic_id = table.Column<Guid>(type: "uuid", nullable: false),
                    consultation_id = table.Column<Guid>(type: "uuid", nullable: true),
                    recorded_at = table.Column<DateTime>(type: "timestamp with time zone", nullable: false),
                    weight_kg = table.Column<decimal>(type: "numeric(5,2)", precision: 5, scale: 2, nullable: true),
                    height_cm = table.Column<decimal>(type: "numeric(5,1)", precision: 5, scale: 1, nullable: true),
                    bmi = table.Column<decimal>(type: "numeric(5,2)", precision: 5, scale: 2, nullable: true),
                    systolic_bp = table.Column<int>(type: "integer", nullable: true),
                    diastolic_bp = table.Column<int>(type: "integer", nullable: true),
                    heart_rate_bpm = table.Column<int>(type: "integer", nullable: true),
                    temperature_celsius = table.Column<decimal>(type: "numeric(4,1)", precision: 4, scale: 1, nullable: true),
                    oxygen_saturation_percent = table.Column<decimal>(type: "numeric(4,1)", precision: 4, scale: 1, nullable: true),
                    respiratory_rate_breaths_per_min = table.Column<int>(type: "integer", nullable: true),
                    xmin = table.Column<uint>(type: "xid", rowVersion: true, nullable: false),
                    created_at = table.Column<DateTime>(type: "timestamp with time zone", nullable: false),
                    created_by = table.Column<string>(type: "character varying(128)", maxLength: 128, nullable: false),
                    updated_at = table.Column<DateTime>(type: "timestamp with time zone", nullable: true),
                    updated_by = table.Column<string>(type: "character varying(128)", maxLength: 128, nullable: true),
                    is_deleted = table.Column<bool>(type: "boolean", nullable: false),
                    deleted_at = table.Column<DateTime>(type: "timestamp with time zone", nullable: true),
                    deleted_by = table.Column<string>(type: "text", nullable: true)
                },
                constraints: table =>
                {
                    table.PrimaryKey("pk_vital_signs", x => x.id);
                    table.ForeignKey(
                        name: "fk_vital_signs_consultations_consultation_id",
                        column: x => x.consultation_id,
                        principalTable: "consultations",
                        principalColumn: "id",
                        onDelete: ReferentialAction.SetNull);
                    table.ForeignKey(
                        name: "fk_vital_signs_patients_patient_id",
                        column: x => x.patient_id,
                        principalTable: "patients",
                        principalColumn: "id",
                        onDelete: ReferentialAction.Cascade);
                });

            migrationBuilder.CreateTable(
                name: "file_records",
                columns: table => new
                {
                    id = table.Column<Guid>(type: "uuid", nullable: false),
                    client_id = table.Column<Guid>(type: "uuid", nullable: false),
                    patient_id = table.Column<Guid>(type: "uuid", nullable: false),
                    clinic_id = table.Column<Guid>(type: "uuid", nullable: true),
                    folder_id = table.Column<Guid>(type: "uuid", nullable: true),
                    file_name = table.Column<string>(type: "character varying(255)", maxLength: 255, nullable: false),
                    mime_type = table.Column<string>(type: "character varying(100)", maxLength: 100, nullable: true),
                    extension = table.Column<string>(type: "character varying(20)", maxLength: 20, nullable: true),
                    size_bytes = table.Column<long>(type: "bigint", nullable: false),
                    storage_key = table.Column<string>(type: "character varying(500)", maxLength: 500, nullable: false),
                    document_type_id = table.Column<Guid>(type: "uuid", nullable: false),
                    sync_status = table.Column<string>(type: "character varying(20)", maxLength: 20, nullable: false),
                    sync_error = table.Column<string>(type: "character varying(500)", maxLength: 500, nullable: true),
                    uploaded_at = table.Column<DateTime>(type: "timestamp with time zone", nullable: false),
                    encryption_algorithm = table.Column<string>(type: "character varying(50)", maxLength: 50, nullable: true),
                    encryption_key_id = table.Column<string>(type: "character varying(100)", maxLength: 100, nullable: true),
                    encryption_iv_base64 = table.Column<string>(type: "character varying(100)", maxLength: 100, nullable: true),
                    encryption_tag_base64 = table.Column<string>(type: "character varying(100)", maxLength: 100, nullable: true),
                    encrypted_size_bytes = table.Column<long>(type: "bigint", nullable: true),
                    encrypted_hash = table.Column<string>(type: "character varying(200)", maxLength: 200, nullable: true),
                    wrapped_key_json = table.Column<string>(type: "text", nullable: true),
                    xmin = table.Column<uint>(type: "xid", rowVersion: true, nullable: false),
                    created_at = table.Column<DateTime>(type: "timestamp with time zone", nullable: false),
                    created_by = table.Column<string>(type: "character varying(128)", maxLength: 128, nullable: false),
                    updated_at = table.Column<DateTime>(type: "timestamp with time zone", nullable: true),
                    updated_by = table.Column<string>(type: "character varying(128)", maxLength: 128, nullable: true),
                    is_deleted = table.Column<bool>(type: "boolean", nullable: false),
                    deleted_at = table.Column<DateTime>(type: "timestamp with time zone", nullable: true),
                    deleted_by = table.Column<string>(type: "text", nullable: true)
                },
                constraints: table =>
                {
                    table.PrimaryKey("pk_file_records", x => x.id);
                    table.ForeignKey(
                        name: "fk_file_records_document_types_document_type_id",
                        column: x => x.document_type_id,
                        principalTable: "document_types",
                        principalColumn: "id",
                        onDelete: ReferentialAction.Cascade);
                    table.ForeignKey(
                        name: "fk_file_records_file_folders_folder_id",
                        column: x => x.folder_id,
                        principalTable: "file_folders",
                        principalColumn: "id",
                        onDelete: ReferentialAction.SetNull);
                    table.ForeignKey(
                        name: "fk_file_records_patients_patient_id",
                        column: x => x.patient_id,
                        principalTable: "patients",
                        principalColumn: "id",
                        onDelete: ReferentialAction.Cascade);
                });

            migrationBuilder.CreateTable(
                name: "lab_results",
                columns: table => new
                {
                    id = table.Column<Guid>(type: "uuid", nullable: false),
                    patient_id = table.Column<Guid>(type: "uuid", nullable: false),
                    clinic_id = table.Column<Guid>(type: "uuid", nullable: false),
                    consultation_id = table.Column<Guid>(type: "uuid", nullable: true),
                    lab_result_report_id = table.Column<Guid>(type: "uuid", nullable: true),
                    test_name = table.Column<string>(type: "character varying(200)", maxLength: 200, nullable: false),
                    category = table.Column<string>(type: "character varying(40)", maxLength: 40, nullable: false),
                    result = table.Column<string>(type: "character varying(500)", maxLength: 500, nullable: true),
                    reference_range = table.Column<string>(type: "character varying(100)", maxLength: 100, nullable: true),
                    unit = table.Column<string>(type: "character varying(50)", maxLength: 50, nullable: true),
                    panel = table.Column<string>(type: "character varying(200)", maxLength: 200, nullable: true),
                    flag = table.Column<string>(type: "character varying(20)", maxLength: 20, nullable: true),
                    status = table.Column<string>(type: "character varying(30)", maxLength: 30, nullable: false),
                    collected_at = table.Column<DateTime>(type: "timestamp with time zone", nullable: true),
                    resulted_at = table.Column<DateTime>(type: "timestamp with time zone", nullable: true),
                    file_url = table.Column<string>(type: "character varying(500)", maxLength: 500, nullable: true),
                    xmin = table.Column<uint>(type: "xid", rowVersion: true, nullable: false),
                    created_at = table.Column<DateTime>(type: "timestamp with time zone", nullable: false),
                    created_by = table.Column<string>(type: "character varying(128)", maxLength: 128, nullable: false),
                    updated_at = table.Column<DateTime>(type: "timestamp with time zone", nullable: true),
                    updated_by = table.Column<string>(type: "character varying(128)", maxLength: 128, nullable: true),
                    is_deleted = table.Column<bool>(type: "boolean", nullable: false),
                    deleted_at = table.Column<DateTime>(type: "timestamp with time zone", nullable: true),
                    deleted_by = table.Column<string>(type: "text", nullable: true)
                },
                constraints: table =>
                {
                    table.PrimaryKey("pk_lab_results", x => x.id);
                    table.ForeignKey(
                        name: "fk_lab_results_consultations_consultation_id",
                        column: x => x.consultation_id,
                        principalTable: "consultations",
                        principalColumn: "id",
                        onDelete: ReferentialAction.SetNull);
                    table.ForeignKey(
                        name: "fk_lab_results_lab_result_reports_lab_result_report_id",
                        column: x => x.lab_result_report_id,
                        principalTable: "lab_result_reports",
                        principalColumn: "id",
                        onDelete: ReferentialAction.Cascade);
                    table.ForeignKey(
                        name: "fk_lab_results_patients_patient_id",
                        column: x => x.patient_id,
                        principalTable: "patients",
                        principalColumn: "id",
                        onDelete: ReferentialAction.Cascade);
                });

            migrationBuilder.CreateTable(
                name: "patient_access_logs",
                columns: table => new
                {
                    id = table.Column<Guid>(type: "uuid", nullable: false),
                    patient_id = table.Column<Guid>(type: "uuid", nullable: false),
                    grant_id = table.Column<Guid>(type: "uuid", nullable: false),
                    actor = table.Column<string>(type: "character varying(300)", maxLength: 300, nullable: false),
                    action = table.Column<string>(type: "character varying(60)", maxLength: 60, nullable: false),
                    detail = table.Column<string>(type: "character varying(500)", maxLength: 500, nullable: true),
                    xmin = table.Column<uint>(type: "xid", rowVersion: true, nullable: false),
                    created_at = table.Column<DateTime>(type: "timestamp with time zone", nullable: false),
                    created_by = table.Column<string>(type: "character varying(128)", maxLength: 128, nullable: false),
                    updated_at = table.Column<DateTime>(type: "timestamp with time zone", nullable: true),
                    updated_by = table.Column<string>(type: "character varying(128)", maxLength: 128, nullable: true),
                    is_deleted = table.Column<bool>(type: "boolean", nullable: false),
                    deleted_at = table.Column<DateTime>(type: "timestamp with time zone", nullable: true),
                    deleted_by = table.Column<string>(type: "character varying(128)", maxLength: 128, nullable: true)
                },
                constraints: table =>
                {
                    table.PrimaryKey("pk_patient_access_logs", x => x.id);
                    table.ForeignKey(
                        name: "fk_patient_access_logs_patient_access_grants_grant_id",
                        column: x => x.grant_id,
                        principalTable: "patient_access_grants",
                        principalColumn: "id",
                        onDelete: ReferentialAction.Cascade);
                    table.ForeignKey(
                        name: "fk_patient_access_logs_patients_patient_id",
                        column: x => x.patient_id,
                        principalTable: "patients",
                        principalColumn: "id",
                        onDelete: ReferentialAction.Cascade);
                });

            migrationBuilder.CreateTable(
                name: "prescriptions",
                columns: table => new
                {
                    id = table.Column<Guid>(type: "uuid", nullable: false),
                    consultation_id = table.Column<Guid>(type: "uuid", nullable: true),
                    prescription_document_id = table.Column<Guid>(type: "uuid", nullable: true),
                    patient_id = table.Column<Guid>(type: "uuid", nullable: false),
                    clinic_id = table.Column<Guid>(type: "uuid", nullable: false),
                    medication_name = table.Column<string>(type: "character varying(200)", maxLength: 200, nullable: false),
                    generic_name = table.Column<string>(type: "character varying(200)", maxLength: 200, nullable: true),
                    brand_name = table.Column<string>(type: "character varying(200)", maxLength: 200, nullable: true),
                    form = table.Column<string>(type: "character varying(50)", maxLength: 50, nullable: true),
                    sort_order = table.Column<int>(type: "integer", nullable: false),
                    dosage = table.Column<string>(type: "character varying(100)", maxLength: 100, nullable: true),
                    frequency = table.Column<string>(type: "character varying(100)", maxLength: 100, nullable: true),
                    duration = table.Column<string>(type: "character varying(100)", maxLength: 100, nullable: true),
                    instructions = table.Column<string>(type: "character varying(500)", maxLength: 500, nullable: true),
                    quantity = table.Column<int>(type: "integer", nullable: true),
                    issued_at = table.Column<DateTime>(type: "timestamp with time zone", nullable: false),
                    is_dispensed = table.Column<bool>(type: "boolean", nullable: false),
                    is_phil_health_gamot = table.Column<bool>(type: "boolean", nullable: false),
                    phil_health_drug_code = table.Column<string>(type: "text", nullable: true),
                    unique_prescription_security_code = table.Column<string>(type: "text", nullable: true),
                    gamot_coverage_amount = table.Column<decimal>(type: "numeric", nullable: true),
                    xmin = table.Column<uint>(type: "xid", rowVersion: true, nullable: false),
                    created_at = table.Column<DateTime>(type: "timestamp with time zone", nullable: false),
                    created_by = table.Column<string>(type: "character varying(128)", maxLength: 128, nullable: false),
                    updated_at = table.Column<DateTime>(type: "timestamp with time zone", nullable: true),
                    updated_by = table.Column<string>(type: "character varying(128)", maxLength: 128, nullable: true),
                    is_deleted = table.Column<bool>(type: "boolean", nullable: false),
                    deleted_at = table.Column<DateTime>(type: "timestamp with time zone", nullable: true),
                    deleted_by = table.Column<string>(type: "text", nullable: true)
                },
                constraints: table =>
                {
                    table.PrimaryKey("pk_prescriptions", x => x.id);
                    table.ForeignKey(
                        name: "fk_prescriptions_consultations_consultation_id",
                        column: x => x.consultation_id,
                        principalTable: "consultations",
                        principalColumn: "id",
                        onDelete: ReferentialAction.Cascade);
                    table.ForeignKey(
                        name: "fk_prescriptions_patients_patient_id",
                        column: x => x.patient_id,
                        principalTable: "patients",
                        principalColumn: "id",
                        onDelete: ReferentialAction.Restrict);
                    table.ForeignKey(
                        name: "fk_prescriptions_prescription_documents_prescription_document_",
                        column: x => x.prescription_document_id,
                        principalTable: "prescription_documents",
                        principalColumn: "id",
                        onDelete: ReferentialAction.Cascade);
                });

            migrationBuilder.InsertData(
                table: "document_types",
                columns: new[] { "id", "code", "created_at", "created_by", "deleted_at", "deleted_by", "description", "is_active", "is_deleted", "label", "native_preview_kind", "sort_order", "supported_extensions_json", "supported_mime_types_json", "updated_at", "updated_by" },
                values: new object[,]
                {
                    { new Guid("11111111-1111-1111-1111-111111111111"), "xray", new DateTime(2026, 1, 1, 0, 0, 0, 0, DateTimeKind.Utc), "system", null, null, "Radiology images and x-ray reports.", true, false, "X-ray", "image", 10, "[\"jpg\",\"jpeg\",\"png\",\"pdf\",\"dcm\"]", "[\"image/*\",\"application/pdf\"]", null, null },
                    { new Guid("22222222-2222-2222-2222-222222222222"), "lab-result", new DateTime(2026, 1, 1, 0, 0, 0, 0, DateTimeKind.Utc), "system", null, null, "Laboratory result PDFs or images.", true, false, "Lab result", "pdf", 20, "[\"pdf\",\"jpg\",\"jpeg\",\"png\"]", "[\"application/pdf\",\"image/*\"]", null, null },
                    { new Guid("33333333-3333-3333-3333-333333333333"), "medical-certificate", new DateTime(2026, 1, 1, 0, 0, 0, 0, DateTimeKind.Utc), "system", null, null, "Medical certificates and fit-to-work documents.", true, false, "Medical certificate", "pdf", 30, "[\"pdf\",\"jpg\",\"jpeg\",\"png\",\"doc\",\"docx\"]", "[\"application/pdf\",\"image/*\",\"application/msword\"]", null, null },
                    { new Guid("44444444-4444-4444-4444-444444444444"), "prescription", new DateTime(2026, 1, 1, 0, 0, 0, 0, DateTimeKind.Utc), "system", null, null, "Prescription scans, images, and PDFs.", true, false, "Prescription", "pdf", 40, "[\"pdf\",\"jpg\",\"jpeg\",\"png\"]", "[\"application/pdf\",\"image/*\"]", null, null },
                    { new Guid("55555555-5555-5555-5555-555555555555"), "id", new DateTime(2026, 1, 1, 0, 0, 0, 0, DateTimeKind.Utc), "system", null, null, "IDs and identity verification documents.", true, false, "Government ID", "image", 50, "[\"pdf\",\"jpg\",\"jpeg\",\"png\"]", "[\"application/pdf\",\"image/*\"]", null, null },
                    { new Guid("66666666-6666-6666-6666-666666666666"), "other", new DateTime(2026, 1, 1, 0, 0, 0, 0, DateTimeKind.Utc), "system", null, null, "Any other medical documents.", true, false, "Other medical file", "external", 999, "[\"pdf\",\"jpg\",\"jpeg\",\"png\"]", "[\"application/pdf\",\"image/*\"]", null, null }
                });

            migrationBuilder.CreateIndex(
                name: "ix_appointments_patient_id_scheduled_at",
                table: "appointments",
                columns: new[] { "patient_id", "scheduled_at" });

            migrationBuilder.CreateIndex(
                name: "ix_appointments_patient_id_status",
                table: "appointments",
                columns: new[] { "patient_id", "status" });

            migrationBuilder.CreateIndex(
                name: "ix_booking_drafts_clinic_id",
                table: "booking_drafts",
                column: "clinic_id");

            migrationBuilder.CreateIndex(
                name: "ix_booking_drafts_organization_id",
                table: "booking_drafts",
                column: "organization_id");

            migrationBuilder.CreateIndex(
                name: "ix_booking_drafts_patient_id_status",
                table: "booking_drafts",
                columns: new[] { "patient_id", "status" });

            migrationBuilder.CreateIndex(
                name: "ix_clinic_healthcare_providers_clinic_id_is_active",
                table: "clinic_healthcare_providers",
                columns: new[] { "clinic_id", "is_active" });

            migrationBuilder.CreateIndex(
                name: "ix_clinic_memberships_clinic_id",
                table: "clinic_memberships",
                column: "clinic_id");

            migrationBuilder.CreateIndex(
                name: "ix_clinic_memberships_patient_id_clinic_id",
                table: "clinic_memberships",
                columns: new[] { "patient_id", "clinic_id" },
                unique: true);

            migrationBuilder.CreateIndex(
                name: "ix_clinic_organization_links_clinic_id_organization_id",
                table: "clinic_organization_links",
                columns: new[] { "clinic_id", "organization_id" },
                unique: true);

            migrationBuilder.CreateIndex(
                name: "ix_clinic_organization_links_organization_id",
                table: "clinic_organization_links",
                column: "organization_id");

            migrationBuilder.CreateIndex(
                name: "ix_clinic_services_clinic_id_is_active",
                table: "clinic_services",
                columns: new[] { "clinic_id", "is_active" });

            migrationBuilder.CreateIndex(
                name: "ix_clinical_assessments_patient_id",
                table: "clinical_assessments",
                column: "patient_id");

            migrationBuilder.CreateIndex(
                name: "ix_clinics_featured_score",
                table: "clinics",
                column: "featured_score");

            migrationBuilder.CreateIndex(
                name: "ix_clinics_is_public",
                table: "clinics",
                column: "is_public");

            migrationBuilder.CreateIndex(
                name: "ix_clinics_join_code",
                table: "clinics",
                column: "join_code");

            migrationBuilder.CreateIndex(
                name: "ix_consultations_patient_id_consulted_at",
                table: "consultations",
                columns: new[] { "patient_id", "consulted_at" });

            migrationBuilder.CreateIndex(
                name: "ix_device_sessions_patient_id_device_id",
                table: "device_sessions",
                columns: new[] { "patient_id", "device_id" },
                unique: true,
                filter: "is_revoked = false");

            migrationBuilder.CreateIndex(
                name: "ix_document_types_code",
                table: "document_types",
                column: "code",
                unique: true);

            migrationBuilder.CreateIndex(
                name: "ix_emergency_contacts_patient_id",
                table: "emergency_contacts",
                column: "patient_id");

            migrationBuilder.CreateIndex(
                name: "ix_file_folders_parent_id",
                table: "file_folders",
                column: "parent_id");

            migrationBuilder.CreateIndex(
                name: "ix_file_folders_patient_id",
                table: "file_folders",
                column: "patient_id");

            migrationBuilder.CreateIndex(
                name: "ix_file_records_document_type_id",
                table: "file_records",
                column: "document_type_id");

            migrationBuilder.CreateIndex(
                name: "ix_file_records_folder_id",
                table: "file_records",
                column: "folder_id");

            migrationBuilder.CreateIndex(
                name: "ix_file_records_patient_id",
                table: "file_records",
                column: "patient_id");

            migrationBuilder.CreateIndex(
                name: "ix_imaging_results_consultation_id",
                table: "imaging_results",
                column: "consultation_id");

            migrationBuilder.CreateIndex(
                name: "ix_imaging_results_patient_id",
                table: "imaging_results",
                column: "patient_id");

            migrationBuilder.CreateIndex(
                name: "ix_interop_inbox_processed_at_utc",
                table: "interop_inbox",
                column: "processed_at_utc");

            migrationBuilder.CreateIndex(
                name: "ix_interop_outbox_correlation_id",
                table: "interop_outbox",
                column: "correlation_id");

            migrationBuilder.CreateIndex(
                name: "ix_interop_outbox_dispatched_at_utc_dead_lettered_at_utc_next_",
                table: "interop_outbox",
                columns: new[] { "dispatched_at_utc", "dead_lettered_at_utc", "next_attempt_at_utc" });

            migrationBuilder.CreateIndex(
                name: "ix_lab_request_slips_patient_id_requisition_id",
                table: "lab_request_slips",
                columns: new[] { "patient_id", "requisition_id" },
                unique: true);

            migrationBuilder.CreateIndex(
                name: "ix_lab_result_reports_patient_id_report_id",
                table: "lab_result_reports",
                columns: new[] { "patient_id", "report_id" },
                unique: true);

            migrationBuilder.CreateIndex(
                name: "ix_lab_result_reports_patient_id_requisition_id",
                table: "lab_result_reports",
                columns: new[] { "patient_id", "requisition_id" });

            migrationBuilder.CreateIndex(
                name: "ix_lab_results_consultation_id",
                table: "lab_results",
                column: "consultation_id");

            migrationBuilder.CreateIndex(
                name: "ix_lab_results_lab_result_report_id",
                table: "lab_results",
                column: "lab_result_report_id");

            migrationBuilder.CreateIndex(
                name: "ix_lab_results_patient_id",
                table: "lab_results",
                column: "patient_id");

            migrationBuilder.CreateIndex(
                name: "ix_medical_certificates_patient_id_certificate_id",
                table: "medical_certificates",
                columns: new[] { "patient_id", "certificate_id" },
                unique: true);

            migrationBuilder.CreateIndex(
                name: "ix_notification_preferences_patient_id_category",
                table: "notification_preferences",
                columns: new[] { "patient_id", "category" },
                unique: true);

            migrationBuilder.CreateIndex(
                name: "ix_notifications_patient_id_category",
                table: "notifications",
                columns: new[] { "patient_id", "category" });

            migrationBuilder.CreateIndex(
                name: "ix_notifications_patient_id_is_read",
                table: "notifications",
                columns: new[] { "patient_id", "is_read" });

            migrationBuilder.CreateIndex(
                name: "ix_organization_memberships_organization_id",
                table: "organization_memberships",
                column: "organization_id");

            migrationBuilder.CreateIndex(
                name: "ix_organization_memberships_patient_id_organization_id",
                table: "organization_memberships",
                columns: new[] { "patient_id", "organization_id" },
                unique: true);

            migrationBuilder.CreateIndex(
                name: "ix_organization_roles_organization_id_role_id",
                table: "organization_roles",
                columns: new[] { "organization_id", "role_id" },
                unique: true);

            migrationBuilder.CreateIndex(
                name: "ix_organizations_featured_score",
                table: "organizations",
                column: "featured_score");

            migrationBuilder.CreateIndex(
                name: "ix_organizations_invite_code",
                table: "organizations",
                column: "invite_code",
                filter: "invite_code IS NOT NULL");

            migrationBuilder.CreateIndex(
                name: "ix_organizations_slug",
                table: "organizations",
                column: "slug",
                unique: true);

            migrationBuilder.CreateIndex(
                name: "ix_patient_access_grants_patient_id_created_at",
                table: "patient_access_grants",
                columns: new[] { "patient_id", "created_at" });

            migrationBuilder.CreateIndex(
                name: "ix_patient_access_grants_patient_id_tenant_id_facility_id",
                table: "patient_access_grants",
                columns: new[] { "patient_id", "tenant_id", "facility_id" });

            migrationBuilder.CreateIndex(
                name: "ix_patient_access_logs_grant_id",
                table: "patient_access_logs",
                column: "grant_id");

            migrationBuilder.CreateIndex(
                name: "ix_patient_access_logs_patient_id_created_at",
                table: "patient_access_logs",
                columns: new[] { "patient_id", "created_at" });

            migrationBuilder.CreateIndex(
                name: "ix_patient_addresses_patient_id",
                table: "patient_addresses",
                column: "patient_id");

            migrationBuilder.CreateIndex(
                name: "ix_patient_allergies_patient_id",
                table: "patient_allergies",
                column: "patient_id");

            migrationBuilder.CreateIndex(
                name: "ix_patient_chronic_conditions_patient_id",
                table: "patient_chronic_conditions",
                column: "patient_id");

            migrationBuilder.CreateIndex(
                name: "ix_patient_contraceptive_histories_patient_id",
                table: "patient_contraceptive_histories",
                column: "patient_id");

            migrationBuilder.CreateIndex(
                name: "ix_patient_dental_visions_patient_id",
                table: "patient_dental_visions",
                column: "patient_id",
                unique: true);

            migrationBuilder.CreateIndex(
                name: "ix_patient_disabilities_patient_id",
                table: "patient_disabilities",
                column: "patient_id");

            migrationBuilder.CreateIndex(
                name: "ix_patient_family_histories_patient_id",
                table: "patient_family_histories",
                column: "patient_id");

            migrationBuilder.CreateIndex(
                name: "ix_patient_government_ids_patient_id_id_type",
                table: "patient_government_ids",
                columns: new[] { "patient_id", "id_type" });

            migrationBuilder.CreateIndex(
                name: "ix_patient_healthcare_providers_patient_id",
                table: "patient_healthcare_providers",
                column: "patient_id");

            migrationBuilder.CreateIndex(
                name: "ix_patient_immunizations_self_patient_id",
                table: "patient_immunizations_self",
                column: "patient_id");

            migrationBuilder.CreateIndex(
                name: "ix_patient_male_reproductives_patient_id",
                table: "patient_male_reproductives",
                column: "patient_id",
                unique: true);

            migrationBuilder.CreateIndex(
                name: "ix_patient_medications_patient_id",
                table: "patient_medications",
                column: "patient_id");

            migrationBuilder.CreateIndex(
                name: "ix_patient_mental_health_profiles_patient_id",
                table: "patient_mental_health_profiles",
                column: "patient_id",
                unique: true);

            migrationBuilder.CreateIndex(
                name: "ix_patient_ncd_questionnaires_patient_id",
                table: "patient_ncd_questionnaires",
                column: "patient_id",
                unique: true);

            migrationBuilder.CreateIndex(
                name: "ix_patient_obstetric_profiles_patient_id",
                table: "patient_obstetric_profiles",
                column: "patient_id",
                unique: true);

            migrationBuilder.CreateIndex(
                name: "ix_patient_occupations_patient_id",
                table: "patient_occupations",
                column: "patient_id",
                unique: true);

            migrationBuilder.CreateIndex(
                name: "ix_patient_past_illnesses_patient_id",
                table: "patient_past_illnesses",
                column: "patient_id");

            migrationBuilder.CreateIndex(
                name: "ix_patient_physical_exam_profiles_patient_id_exam_date",
                table: "patient_physical_exam_profiles",
                columns: new[] { "patient_id", "exam_date" });

            migrationBuilder.CreateIndex(
                name: "ix_patient_pregnancies_patient_id",
                table: "patient_pregnancies",
                column: "patient_id");

            migrationBuilder.CreateIndex(
                name: "ix_patient_social_histories_patient_id",
                table: "patient_social_histories",
                column: "patient_id",
                unique: true);

            migrationBuilder.CreateIndex(
                name: "ix_patient_storage_profiles_patient_id",
                table: "patient_storage_profiles",
                column: "patient_id",
                unique: true);

            migrationBuilder.CreateIndex(
                name: "ix_patient_surgical_histories_patient_id",
                table: "patient_surgical_histories",
                column: "patient_id");

            migrationBuilder.CreateIndex(
                name: "ix_patient_travel_histories_patient_id",
                table: "patient_travel_histories",
                column: "patient_id");

            migrationBuilder.CreateIndex(
                name: "ix_patients_clerk_user_id",
                table: "patients",
                column: "clerk_user_id",
                unique: true,
                filter: "clerk_user_id IS NOT NULL");

            migrationBuilder.CreateIndex(
                name: "ix_patients_clinic_ez_id",
                table: "patients",
                column: "clinic_ez_id",
                unique: true);

            migrationBuilder.CreateIndex(
                name: "ix_patients_managed_by_patient_id",
                table: "patients",
                column: "managed_by_patient_id");

            migrationBuilder.CreateIndex(
                name: "ix_prescription_documents_patient_id_prescription_id",
                table: "prescription_documents",
                columns: new[] { "patient_id", "prescription_id" },
                unique: true);

            migrationBuilder.CreateIndex(
                name: "ix_prescriptions_consultation_id",
                table: "prescriptions",
                column: "consultation_id");

            migrationBuilder.CreateIndex(
                name: "ix_prescriptions_patient_id",
                table: "prescriptions",
                column: "patient_id");

            migrationBuilder.CreateIndex(
                name: "ix_prescriptions_prescription_document_id",
                table: "prescriptions",
                column: "prescription_document_id");

            migrationBuilder.CreateIndex(
                name: "ix_provider_availabilities_clinic_healthcare_provider_id",
                table: "provider_availabilities",
                column: "clinic_healthcare_provider_id");

            migrationBuilder.CreateIndex(
                name: "ix_share_code_failures_actor_created_at",
                table: "share_code_failures",
                columns: new[] { "actor", "created_at" });

            migrationBuilder.CreateIndex(
                name: "ix_share_code_failures_patient_id_created_at",
                table: "share_code_failures",
                columns: new[] { "patient_id", "created_at" });

            migrationBuilder.CreateIndex(
                name: "ix_share_codes_patient_id_code_hash",
                table: "share_codes",
                columns: new[] { "patient_id", "code_hash" },
                unique: true);

            migrationBuilder.CreateIndex(
                name: "ix_share_codes_token_id",
                table: "share_codes",
                column: "token_id",
                unique: true);

            migrationBuilder.CreateIndex(
                name: "ix_share_token_uses_token_id_message_id",
                table: "share_token_uses",
                columns: new[] { "token_id", "message_id" },
                unique: true);

            migrationBuilder.CreateIndex(
                name: "ix_share_token_uses_token_id_sequence",
                table: "share_token_uses",
                columns: new[] { "token_id", "sequence" },
                unique: true);

            migrationBuilder.CreateIndex(
                name: "ix_sync_logs_entity_type_entity_id",
                table: "sync_logs",
                columns: new[] { "entity_type", "entity_id" });

            migrationBuilder.CreateIndex(
                name: "ix_sync_logs_patient_id_status",
                table: "sync_logs",
                columns: new[] { "patient_id", "status" });

            migrationBuilder.CreateIndex(
                name: "ix_vaccinations_administered_patient_id_date_administered",
                table: "vaccinations_administered",
                columns: new[] { "patient_id", "date_administered" });

            migrationBuilder.CreateIndex(
                name: "ix_vital_signs_consultation_id",
                table: "vital_signs",
                column: "consultation_id");

            migrationBuilder.CreateIndex(
                name: "ix_vital_signs_patient_id_recorded_at",
                table: "vital_signs",
                columns: new[] { "patient_id", "recorded_at" });
        }

        /// <inheritdoc />
        protected override void Down(MigrationBuilder migrationBuilder)
        {
            migrationBuilder.DropTable(
                name: "appointments");

            migrationBuilder.DropTable(
                name: "booking_drafts");

            migrationBuilder.DropTable(
                name: "clinic_memberships");

            migrationBuilder.DropTable(
                name: "clinic_organization_links");

            migrationBuilder.DropTable(
                name: "clinic_services");

            migrationBuilder.DropTable(
                name: "clinical_assessments");

            migrationBuilder.DropTable(
                name: "device_sessions");

            migrationBuilder.DropTable(
                name: "emergency_contacts");

            migrationBuilder.DropTable(
                name: "file_records");

            migrationBuilder.DropTable(
                name: "imaging_results");

            migrationBuilder.DropTable(
                name: "interop_inbox");

            migrationBuilder.DropTable(
                name: "interop_outbox");

            migrationBuilder.DropTable(
                name: "lab_request_slips");

            migrationBuilder.DropTable(
                name: "lab_results");

            migrationBuilder.DropTable(
                name: "medical_certificates");

            migrationBuilder.DropTable(
                name: "notification_preferences");

            migrationBuilder.DropTable(
                name: "notifications");

            migrationBuilder.DropTable(
                name: "organization_memberships");

            migrationBuilder.DropTable(
                name: "organization_roles");

            migrationBuilder.DropTable(
                name: "patient_access_logs");

            migrationBuilder.DropTable(
                name: "patient_addresses");

            migrationBuilder.DropTable(
                name: "patient_allergies");

            migrationBuilder.DropTable(
                name: "patient_chronic_conditions");

            migrationBuilder.DropTable(
                name: "patient_contraceptive_histories");

            migrationBuilder.DropTable(
                name: "patient_dental_visions");

            migrationBuilder.DropTable(
                name: "patient_disabilities");

            migrationBuilder.DropTable(
                name: "patient_family_histories");

            migrationBuilder.DropTable(
                name: "patient_government_ids");

            migrationBuilder.DropTable(
                name: "patient_healthcare_providers");

            migrationBuilder.DropTable(
                name: "patient_immunizations_self");

            migrationBuilder.DropTable(
                name: "patient_male_reproductives");

            migrationBuilder.DropTable(
                name: "patient_medications");

            migrationBuilder.DropTable(
                name: "patient_mental_health_profiles");

            migrationBuilder.DropTable(
                name: "patient_ncd_questionnaires");

            migrationBuilder.DropTable(
                name: "patient_obstetric_profiles");

            migrationBuilder.DropTable(
                name: "patient_occupations");

            migrationBuilder.DropTable(
                name: "patient_past_illnesses");

            migrationBuilder.DropTable(
                name: "patient_physical_exam_profiles");

            migrationBuilder.DropTable(
                name: "patient_pregnancies");

            migrationBuilder.DropTable(
                name: "patient_social_histories");

            migrationBuilder.DropTable(
                name: "patient_storage_profiles");

            migrationBuilder.DropTable(
                name: "patient_surgical_histories");

            migrationBuilder.DropTable(
                name: "patient_travel_histories");

            migrationBuilder.DropTable(
                name: "prescriptions");

            migrationBuilder.DropTable(
                name: "provider_availabilities");

            migrationBuilder.DropTable(
                name: "share_code_failures");

            migrationBuilder.DropTable(
                name: "share_codes");

            migrationBuilder.DropTable(
                name: "share_token_uses");

            migrationBuilder.DropTable(
                name: "sync_logs");

            migrationBuilder.DropTable(
                name: "vaccinations_administered");

            migrationBuilder.DropTable(
                name: "vital_signs");

            migrationBuilder.DropTable(
                name: "document_types");

            migrationBuilder.DropTable(
                name: "file_folders");

            migrationBuilder.DropTable(
                name: "lab_result_reports");

            migrationBuilder.DropTable(
                name: "organizations");

            migrationBuilder.DropTable(
                name: "patient_access_grants");

            migrationBuilder.DropTable(
                name: "prescription_documents");

            migrationBuilder.DropTable(
                name: "clinic_healthcare_providers");

            migrationBuilder.DropTable(
                name: "consultations");

            migrationBuilder.DropTable(
                name: "clinics");

            migrationBuilder.DropTable(
                name: "patients");
        }
    }
}
