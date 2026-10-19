using System;
using System.Collections.Generic;
using System.Linq;

namespace ClinicEz.Pharmacy.Domain.Services;

public sealed class GamotFormularyService : IGamotFormularyService
{
    private static readonly IReadOnlyList<GamotFormularyItem> Formulary = new List<GamotFormularyItem>
    {
        // ── Hypertension & Cardiovascular (NCD) ───────────────────────────
        new("AMLOD0000000000000000000000000", "Amlodipine", "5mg", "Tablet", "NCD-HYPERTENSION", 0.65m),
        new("AMLOD0000100000000000000000000", "Amlodipine", "10mg", "Tablet", "NCD-HYPERTENSION", 1.15m),
        new("LOSAR0000000000000000000000000", "Losartan", "50mg", "Tablet", "NCD-HYPERTENSION", 1.25m),
        new("LOSAR0000100000000000000000000", "Losartan", "100mg", "Tablet", "NCD-HYPERTENSION", 2.40m),
        new("METOP0000000000000000000000000", "Metoprolol", "50mg", "Tablet", "NCD-HYPERTENSION", 1.10m),
        new("METOP0000100000000000000000000", "Metoprolol", "100mg", "Tablet", "NCD-HYPERTENSION", 2.15m),
        new("CARVE0000000000000000000000000", "Carvedilol", "6.25mg", "Tablet", "NCD-HYPERTENSION", 2.50m),
        new("CARVE0000100000000000000000000", "Carvedilol", "25mg", "Tablet", "NCD-HYPERTENSION", 6.00m),
        new("CAPTO0000000000000000000000000", "Captopril", "25mg", "Tablet", "NCD-HYPERTENSION", 1.20m),
        new("ENALA0000000000000000000000000", "Enalapril", "10mg", "Tablet", "NCD-HYPERTENSION", 2.80m),
        new("HYDR00000000000000000000000000", "Hydrochlorothiazide", "25mg", "Tablet", "NCD-HYPERTENSION", 1.10m),

        // ── Diabetes Mellitus (NCD) ──────────────────────────────────────
        new("METFO0000000000000000000000000", "Metformin", "500mg", "Tablet", "NCD-DIABETES", 0.85m),
        new("METFO0000100000000000000000000", "Metformin", "850mg", "Tablet", "NCD-DIABETES", 1.75m),
        new("GLICL0000000000000000000000000", "Gliclazide", "30mg", "Modified Release Tablet", "NCD-DIABETES", 3.50m),
        new("GLICL0000100000000000000000000", "Gliclazide", "80mg", "Tablet", "NCD-DIABETES", 5.20m),
        new("GLIME0000000000000000000000000", "Glimepiride", "2mg", "Tablet", "NCD-DIABETES", 4.10m),
        new("INSUL0000000000000000000000000", "Regular Insulin", "100IU/ml", "Vial", "NCD-DIABETES", 280.00m, true),
        new("INSUL0000100000000000000000000", "NPH Insulin", "100IU/ml", "Vial", "NCD-DIABETES", 295.00m, true),

        // ── Dyslipidemia (NCD) ───────────────────────────────────────────
        new("SIMVA0000000000000000000000000", "Simvastatin", "20mg", "Tablet", "NCD-DYSLIPIDEMIA", 2.20m),
        new("SIMVA0000100000000000000000000", "Simvastatin", "40mg", "Tablet", "NCD-DYSLIPIDEMIA", 4.10m),
        new("ATORV0000000000000000000000000", "Atorvastatin", "20mg", "Tablet", "NCD-DYSLIPIDEMIA", 4.50m),
        new("ATORV0000100000000000000000000", "Atorvastatin", "40mg", "Tablet", "NCD-DYSLIPIDEMIA", 7.80m),
        new("ROSUV0000000000000000000000000", "Rosuvastatin", "10mg", "Tablet", "NCD-DYSLIPIDEMIA", 5.50m),
        new("ROSUV0000100000000000000000000", "Rosuvastatin", "20mg", "Tablet", "NCD-DYSLIPIDEMIA", 9.50m),
        new("FENOF0000000000000000000000000", "Fenofibrate", "160mg", "Capsule", "NCD-DYSLIPIDEMIA", 12.00m),

        // ── Respiratory & Asthma / COPD ──────────────────────────────────
        new("SALBU0000000000000000000000000", "Salbutamol", "2mg", "Tablet", "ASTHMA-COPD", 0.90m),
        new("SALBU0000100000000000000000000", "Salbutamol", "100mcg/dose", "Inhaler", "ASTHMA-COPD", 145.00m),
        new("SALBU0000200000000000000000000", "Salbutamol", "1mg/ml", "Nebule", "ASTHMA-COPD", 14.50m),
        new("IPRAT0000000000000000000000000", "Ipratropium + Salbutamol", "500mcg/2.5mg", "Nebule", "ASTHMA-COPD", 22.00m),
        new("FLUTI0000000000000000000000000", "Fluticasone + Salmeterol", "250mcg/50mcg", "Inhaler", "ASTHMA-COPD", 380.00m, true),
        new("BUDES0000000000000000000000000", "Budesonide", "250mcg/ml", "Nebule", "ASTHMA-COPD", 35.00m),

        // ── Infectious Diseases & Antibiotics ─────────────────────────────
        new("AMOXI0000000000000000000000000", "Amoxicillin", "500mg", "Capsule", "ANTIBIOTIC", 2.20m),
        new("COAMO0000000000000000000000000", "Co-Amoxiclav", "625mg", "Tablet", "ANTIBIOTIC", 14.50m),
        new("CEFAL0000000000000000000000000", "Cefalexin", "500mg", "Capsule", "ANTIBIOTIC", 4.80m),
        new("CIPRO0000000000000000000000000", "Ciprofloxacin", "500mg", "Tablet", "ANTIBIOTIC", 5.20m),
        new("AZITH0000000000000000000000000", "Azithromycin", "500mg", "Tablet", "ANTIBIOTIC", 28.00m),
        new("CLARI0000000000000000000000000", "Clarithromycin", "500mg", "Tablet", "ANTIBIOTIC", 24.50m),
        new("COTRI0000000000000000000000000", "Co-Trimoxazole", "800mg/160mg", "Tablet", "ANTIBIOTIC", 3.20m),
        new("DOXYC0000000000000000000000000", "Doxycycline", "100mg", "Capsule", "ANTIBIOTIC", 4.50m),
        new("METRO0000000000000000000000000", "Metronidazole", "500mg", "Tablet", "ANTIBIOTIC", 2.80m),

        // ── Pain, Fever & Inflammation ───────────────────────────────────
        new("PARAC0000000000000000000000000", "Paracetamol", "500mg", "Tablet", "ANALGESIC-ANTIPYRETIC", 0.75m),
        new("IBUPR0000000000000000000000000", "Ibuprofen", "400mg", "Tablet", "NSAID", 2.10m),
        new("MEFEN0000000000000000000000000", "Mefenamic Acid", "500mg", "Capsule", "NSAID", 2.50m),
        new("TRAMA0000000000000000000000000", "Tramadol", "50mg", "Capsule", "ANALGESIC", 7.50m),

        // ── Gastrointestinal & Fluids ────────────────────────────────────
        new("OMEPR0000000000000000000000000", "Omeprazole", "20mg", "Capsule", "GASTROINTESTINAL", 3.20m),
        new("OMEPR0000100000000000000000000", "Omeprazole", "40mg", "Capsule", "GASTROINTESTINAL", 6.50m),
        new("HYOSC0000000000000000000000000", "Hyoscine-N-Butylbromide", "10mg", "Tablet", "GASTROINTESTINAL", 4.80m),
        new("METOC0000000000000000000000000", "Metoclopramide", "10mg", "Tablet", "GASTROINTESTINAL", 2.50m),
        new("ORS000000000000000000000000000", "Oral Rehydration Salts", "Sachet", "Powder", "FLUIDS-ELECTROLYTES", 5.50m),
        new("ZINCS0000000000000000000000000", "Zinc Sulfate", "20mg", "Tablet", "SUPPLEMENT", 3.00m),

        // ── Micronutrients, Antihistamines & Herbal ───────────────────────
        new("CETIR0000000000000000000000000", "Cetirizine", "10mg", "Tablet", "ANTIHISTAMINE", 1.80m),
        new("LORAT0000000000000000000000000", "Loratadine", "10mg", "Tablet", "ANTIHISTAMINE", 2.20m),
        new("FERRO0000000000000000000000000", "Ferrous Sulfate + Folic Acid", "60mg/400mcg", "Tablet", "HEMATINIC", 1.50m),
        new("VITAM0000000000000000000000000", "Vitamin B Complex", "B1/B6/B12", "Tablet", "VITAMIN", 1.20m),
        new("ASCOR0000000000000000000000000", "Ascorbic Acid", "500mg", "Tablet", "VITAMIN", 1.00m),
        new("LAGUN0000000000000000000000000", "Lagundi", "600mg", "Tablet", "HERBAL-COUGH", 4.00m),
        new("SAMBO0000000000000000000000000", "Sambong", "500mg", "Tablet", "HERBAL-DIURETIC", 5.50m)
    };

    public IReadOnlyList<GamotFormularyItem> GetAllFormularyItems() => Formulary;

    public GamotFormularyItem? FindByDrugCode(string drugCode)
    {
        if (string.IsNullOrWhiteSpace(drugCode)) return null;
        var clean = drugCode.Trim().ToUpperInvariant();
        return Formulary.FirstOrDefault(f => f.DrugCode.Equals(clean, StringComparison.OrdinalIgnoreCase));
    }

    public GamotFormularyItem? MatchByGenericName(string genericName, string? dosage = null)
    {
        if (string.IsNullOrWhiteSpace(genericName)) return null;
        var g = genericName.Trim().ToLowerInvariant();

        var matches = Formulary.Where(f =>
            f.GenericName.ToLowerInvariant().Contains(g) ||
            g.Contains(f.GenericName.ToLowerInvariant())).ToList();

        if (matches.Count == 0) return null;
        if (matches.Count == 1 || string.IsNullOrWhiteSpace(dosage)) return matches[0];

        var d = dosage.Trim().ToLowerInvariant();
        var dosageMatch = matches.FirstOrDefault(m => m.Dosage.ToLowerInvariant().Contains(d) || d.Contains(m.Dosage.ToLowerInvariant()));
        return dosageMatch ?? matches[0];
    }

    public bool IsGamotCovered(string genericOrDrugCode)
    {
        if (string.IsNullOrWhiteSpace(genericOrDrugCode)) return false;
        return FindByDrugCode(genericOrDrugCode) != null || MatchByGenericName(genericOrDrugCode) != null;
    }

    public decimal GetReferencePrice(string genericOrDrugCode, decimal fallbackPrice)
    {
        var item = FindByDrugCode(genericOrDrugCode) ?? MatchByGenericName(genericOrDrugCode);
        return item?.ReferenceUnitPrice ?? fallbackPrice;
    }
}
