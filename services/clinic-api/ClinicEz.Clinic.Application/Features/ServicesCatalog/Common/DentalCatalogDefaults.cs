using System;
using System.Collections.Generic;
using System.Linq;
using ClinicEz.Clinic.Domain.Entities;

namespace ClinicEz.Clinic.Application.Features.ServicesCatalog.Common;

public static class DentalCatalogDefaults
{
    public sealed record DentalDefaultTemplate(
        string Code,
        string Name,
        string Category,
        decimal StandardPrice,
        string Description
    );

    public static readonly IReadOnlyList<DentalDefaultTemplate> Defaults = new List<DentalDefaultTemplate>
    {
        new("DENT-CONS", "Dental Consultation & Oral Examination", "Dental", 500m, "Comprehensive dental examination, oral cancer screening, and clinical evaluation"),
        new("DENT-CLEAN", "Oral Prophylaxis / Dental Cleaning", "Dental", 850m, "Routine supragingival and subgingival scaling and polishing for plaque and calculus removal"),
        new("DENT-FILL-COMP", "Composite Light-Cure Tooth Restoration", "Dental", 950m, "Direct light-cured anterior or posterior composite resin tooth filling per surface"),
        new("DENT-EXT-SIMPLE", "Tooth Extraction - Simple Exodontia", "Dental", 1000m, "Non-surgical extraction of erupted tooth under local infiltration anesthesia"),
        new("DENT-EXT-SURG", "Surgical Odontectomy - Impacted Third Molar", "Dental", 3500m, "Surgical extraction of impacted mandibular or maxillary third molar with mucoperiosteal flap and bone guttering"),
        new("DENT-SEALANT", "Pit and Fissure Sealant", "Dental", 600m, "Preventive resin sealant application to developmental pits and occlusal fissures per tooth"),
        new("DENT-FLUOR", "Topical Fluoride Varnish Application", "Dental", 500m, "High-concentration topical sodium fluoride varnish application for caries prevention and desensitization"),
        new("DENT-XR-PA", "Dental Periapical Radiograph / X-Ray", "Dental", 400m, "Intraoral digital periapical or bitewing radiograph with radiographic interpretation"),
        new("DENT-RCT", "Root Canal Therapy / Endodontic Treatment", "Dental", 4000m, "Complete endodontic chemo-mechanical biomechanical debridement, shaping, and warm gutta-percha obturation"),
        new("DENT-PULP", "Pediatric Pulpotomy", "Dental", 1500m, "Coronal vital pulp amputation and medicament placement for primary teeth")
    };

    public static List<ClinicServiceItem> CreateDefaults(string? tenantId, Guid clinicId)
    {
        return Defaults.Select(d => new ClinicServiceItem
        {
            TenantId = tenantId,
            ClinicId = clinicId,
            Code = d.Code,
            Name = d.Name,
            Category = d.Category,
            StandardPrice = d.StandardPrice,
            Description = d.Description,
            IsActive = true
        }).ToList();
    }
}
