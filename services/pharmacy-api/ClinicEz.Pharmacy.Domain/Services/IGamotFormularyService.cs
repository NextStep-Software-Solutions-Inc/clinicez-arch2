using System.Collections.Generic;

namespace ClinicEz.Pharmacy.Domain.Services;

public sealed record GamotFormularyItem(
    string DrugCode,
    string GenericName,
    string Dosage,
    string Form,
    string TherapeuticCategory,
    decimal ReferenceUnitPrice,
    bool RequiresSpecialistRecommendation = false);

public interface IGamotFormularyService
{
    IReadOnlyList<GamotFormularyItem> GetAllFormularyItems();
    GamotFormularyItem? FindByDrugCode(string drugCode);
    GamotFormularyItem? MatchByGenericName(string genericName, string? dosage = null);
    bool IsGamotCovered(string genericOrDrugCode);
    decimal GetReferencePrice(string genericOrDrugCode, decimal fallbackPrice);
}
