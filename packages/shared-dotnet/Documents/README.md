# ClinicEZ QuestPDF Standardized Document Layout System

This directory contains the core layout components, branding letterheads, cryptographic footers, and standardized signatory models used across all PDF document generators in ClinicEZ.

## Architectural Standard: Signatory Placement & Spacing

In all official documents (Clinical certificates, prescriptions, lab slips, referrals, billing statements/invoices, statutory reports, and lab results):

1. **Bottom Placement (`.ExtendVertical().AlignBottom()`)**: Signatories must be anchored at the bottom of the page above the footer, rather than floating mid-page when content is short.
2. **Page-Break Protection (`.ShowEntire()`)**: Signatory blocks must be wrapped in `ShowEntire()` to prevent signatures and credentials from awkwardly splitting across page boundaries.
3. **Guaranteed Clearance from Footer Rule**:
   - `DocumentSpacingConstants.SignatoryBottomPadding` (`12pt`) is applied below the signatory block.
   - `DocumentSpacingConstants.FooterTopPadding` (`8pt`) is applied above the horizontal divider in `DocumentFooterComponent`.
   - This guarantees a minimum of `20pt` (~7mm) of clean visual breathing room so signatures and verification badges **never touch ("kiss") the footer border line**.

## Extension Methods for Future Documents

When building any new PDF document in ClinicEZ, import:
```csharp
using ClinicEz.Shared.Documents.Common;
using ClinicEz.Shared.Documents.Components;
using ClinicEz.Shared.Documents.Configuration;
```

Inside your `page.Content().Column(col => { ... })`:

### 1. Clinician / Physician Documents
(e.g., Medical Certificates, Fit-to-Work, Prescriptions, Referrals, Clinical Summaries)
```csharp
col.SignatoryClinician(new ClinicianSignatoryModel
{
    DoctorName = "Dr. Roberto V. Santos, MD, FPCP",
    TitleOrSpecialty = "Internal Medicine - Adult Cardiology",
    PrcLicense = "0098451",
    PtrNumber = "8472910",
    S2License = "S2-2026-9912",
    Mode = config.DefaultSignatureMode, // WetSignature, DigitalSealOnly, or ESignatureSpecimen
    SignatureBytes = docSignatureBytes,
    DigitalSealBadgeText = "Digitally Certified & Locked"
});
```

### 2. Dual-Party Operational & Statutory Reports
(e.g., Daily EOD, Morbidity, Tax/Discount Audits, Doctor Settlements, PhilHealth Transmittals)
```csharp
col.SignatoryDual(new DualSignatoryModel
{
    Left = new SignatoryParty
    {
        Label = "PREPARED BY:",
        Name = preparedByName,
        Title = preparedByTitle
    },
    Right = new SignatoryParty
    {
        Label = "NOTED / APPROVED BY:",
        Name = approverName,
        Title = approverTitle
    }
});
```

### 3. Custom Bottom-Anchored Signatory Blocks
(e.g., Invoices, Consent forms, Multiparty acknowledgments)
```csharp
col.SignatoryBlock(sigContainer =>
{
    sigContainer.Column(c =>
    {
        // Custom signature layout here
    });
});
```
