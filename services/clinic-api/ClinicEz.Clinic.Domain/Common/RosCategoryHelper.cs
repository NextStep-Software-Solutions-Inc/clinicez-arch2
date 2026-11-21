using System;
using ClinicEz.Clinic.Domain.Enums;

namespace ClinicEz.Clinic.Domain.Common;

public static class RosCategoryHelper
{
    public static RosSystem ParseOrDefault(string? raw, RosSystem defaultValue = RosSystem.EssentiallyNormal)
    {
        return TryParse(raw, out var parsed) ? parsed : defaultValue;
    }

    public static RosSystem? ParseNullable(string? raw) => ParseOptional(raw);

    public static RosSystem? ParseOptional(string? raw)
    {
        if (string.IsNullOrWhiteSpace(raw))
        {
            return null;
        }

        return TryParse(raw, out var parsed) ? parsed : RosSystem.EssentiallyNormal;
    }

    public static bool TryParse(string? raw, out RosSystem result)
    {
        result = RosSystem.EssentiallyNormal;
        if (string.IsNullOrWhiteSpace(raw))
        {
            return false;
        }

        var trimmed = raw.Trim();
        if (trimmed.Contains(','))
        {
            RosSystem? firstNormal = null;
            foreach (var segment in trimmed.Split(',', StringSplitOptions.RemoveEmptyEntries | StringSplitOptions.TrimEntries))
            {
                if (TryParseSingle(segment, out var item))
                {
                    if (item != RosSystem.EssentiallyNormal)
                    {
                        result = item;
                        return true;
                    }
                    firstNormal ??= item;
                }
            }

            if (firstNormal.HasValue)
            {
                result = firstNormal.Value;
                return true;
            }

            return false;
        }

        return TryParseSingle(trimmed, out result);
    }

    private static bool TryParseSingle(string trimmed, out RosSystem result)
    {
        result = RosSystem.EssentiallyNormal;
        if (Enum.TryParse<RosSystem>(trimmed, ignoreCase: true, out var exact) && Enum.IsDefined(exact))
        {
            result = exact;
            return true;
        }

        var normalized = trimmed.ToLowerInvariant()
            .Replace("_", "")
            .Replace("-", "")
            .Replace("/", "")
            .Replace(" ", "");

        result = normalized switch
        {
            "essentiallynormal" or "normal" or "none" or "00" => RosSystem.EssentiallyNormal,
            "general" or "constitutional" => RosSystem.General,
            "derma" or "dermatologic" or "dermatology" => RosSystem.Dermatologic,
            "skin" or "skinextremities" or "integumentary" => RosSystem.Skin,
            "heent" or "dental" or "ent" or "eyes" or "oral" => RosSystem.Heent,
            "respi" or "respiratory" or "pulmonary" or "lungs" or "chest" => RosSystem.Respiratory,
            "cardio" or "cardiovascular" or "heart" or "cvs" => RosSystem.Cardiovascular,
            "cardiorespiratory" => RosSystem.Cardiorespiratory,
            "gi" or "gastro" or "gastrointestinal" or "abdomen" or "abdominal" => RosSystem.Gastrointestinal,
            "gu" or "genitourinary" or "reproductive" or "obgyne" or "renal" => RosSystem.Genitourinary,
            "msk" or "musculoskeletal" or "ortho" => RosSystem.Musculoskeletal,
            "neuro" or "neurological" or "neurologic" or "cns" => RosSystem.Neurological,
            "psych" or "psychiatric" or "psychiatricneurodevelopmental" or "behavioral" or "mentalhealth" => RosSystem.PsychiatricNeurodevelopmental,
            "endocrine" or "endocrinemetabolic" or "metabolic" => RosSystem.EndocrineMetabolic,
            "hematologic" or "hematologiclymphatic" or "lymphatic" or "heme" => RosSystem.HematologicLymphatic,
            "allergic" or "allergy" or "immunologic" or "allergicimmunologic" or "allergyimmuno" => RosSystem.AllergicImmunologic,
            _ => default
        };

        if (result != RosSystem.EssentiallyNormal ||
            normalized is "essentiallynormal" or "normal" or "none" or "00")
        {
            return true;
        }

        return false;
    }

    public static string ToDisplayLabel(RosSystem system) => system switch
    {
        RosSystem.EssentiallyNormal => "Essentially Normal",
        RosSystem.General => "General",
        RosSystem.Skin => "Skin / Dermatologic",
        RosSystem.Dermatologic => "Dermatologic",
        RosSystem.Heent => "HEENT",
        RosSystem.Cardiorespiratory => "Cardiorespiratory",
        RosSystem.Respiratory => "Respiratory",
        RosSystem.Cardiovascular => "Cardiovascular",
        RosSystem.Gastrointestinal => "Gastrointestinal",
        RosSystem.Genitourinary => "Genitourinary",
        RosSystem.Musculoskeletal => "Musculoskeletal",
        RosSystem.Neurological => "Neurological",
        RosSystem.PsychiatricNeurodevelopmental => "Psychiatric / Neurodevelopmental",
        RosSystem.EndocrineMetabolic => "Endocrine / Metabolic",
        RosSystem.HematologicLymphatic => "Hematologic / Lymphatic",
        RosSystem.AllergicImmunologic => "Allergic / Immunologic",
        _ => system.ToString()
    };

    public static RosSystem InferFromSymptom(string? code, string? title = null)
    {
        var normalizedCode = (code ?? string.Empty).Trim().ToUpperInvariant();
        switch (normalizedCode)
        {
            case "00":
                return RosSystem.EssentiallyNormal;
            case "01" or "11" or "18" or "33":
                return RosSystem.Neurological;
            case "02" or "07" or "10" or "12" or "19" or "23" or "30" or "35":
                return RosSystem.Gastrointestinal;
            case "03" or "05" or "32" or "36" or "37":
                return RosSystem.General;
            case "04" or "06" or "15":
                return RosSystem.Heent;
            case "08" or "25" or "27" or "28":
                return RosSystem.Cardiovascular;
            case "09" or "13" or "21":
                return RosSystem.Respiratory;
            case "14" or "16" or "17" or "20" or "34":
                return RosSystem.Genitourinary;
            case "22":
                return RosSystem.PsychiatricNeurodevelopmental;
            case "24" or "26":
                return RosSystem.Musculoskeletal;
            case "29" or "31":
                return RosSystem.Dermatologic;
        }

        var text = $"{code} {title}".ToLowerInvariant();
        if (string.IsNullOrWhiteSpace(text) || text.Contains("essentially normal"))
            return RosSystem.EssentiallyNormal;
        if (text.Contains("allerg") || text.Contains("urticaria") || text.Contains("hives") || text.Contains("anaphylax") || text.Contains("immun"))
            return RosSystem.AllergicImmunologic;
        if (text.Contains("rash") || text.Contains("itch") || text.Contains("prurit") || text.Contains("skin") || text.Contains("lesion") || text.Contains("wound") || text.Contains("burn") || text.Contains("derma"))
            return RosSystem.Dermatologic;
        if (text.Contains("cough") || text.Contains("cold") || text.Contains("dyspnea") || text.Contains("hemoptysis") || text.Contains("wheez") || text.Contains("sputum") || text.Contains("asthma") || text.Contains("breath"))
            return RosSystem.Respiratory;
        if (text.Contains("chest pain") || text.Contains("chest discomfort") || text.Contains("orthopnea") || text.Contains("palpitation") || text.Contains("hypertens") || text.Contains("edema"))
            return RosSystem.Cardiovascular;
        if (text.Contains("headache") || text.Contains("sensorium") || text.Contains("dizz") || text.Contains("vertigo") || text.Contains("seizure") || text.Contains("numb") || text.Contains("migraine") || text.Contains("syncope"))
            return RosSystem.Neurological;
        if (text.Contains("stomach") || text.Contains("abdom") || text.Contains("epigastric") || text.Contains("dysphagia") || text.Contains("hematemesis") || text.Contains("jaundice") || text.Contains("stool") || text.Contains("nausea") || text.Contains("vomit") || text.Contains("diarrhea") || text.Contains("constipat") || text.Contains("hyperacid"))
            return RosSystem.Gastrointestinal;
        if (text.Contains("tooth") || text.Contains("gum") || text.Contains("epistaxis") || text.Contains("vision") || text.Contains("throat") || text.Contains("ear") || text.Contains("eye") || text.Contains("nasal") || text.Contains("rhin") || text.Contains("tonsil") || text.Contains("sore throat"))
            return RosSystem.Heent;
        if (text.Contains("dysuria") || text.Contains("hematuria") || text.Contains("urgency") || text.Contains("urin") || text.Contains("dysmenorrhea") || text.Contains("menstru") || text.Contains("pelvic") || text.Contains("flank"))
            return RosSystem.Genitourinary;
        if (text.Contains("joint") || text.Contains("muscle") || text.Contains("myalgia") || text.Contains("leg cramp") || text.Contains("back pain") || text.Contains("sprain") || text.Contains("arthralgia"))
            return RosSystem.Musculoskeletal;
        if (text.Contains("anxiet") || text.Contains("irritab") || text.Contains("insomnia") || text.Contains("stress") || text.Contains("depress"))
            return RosSystem.PsychiatricNeurodevelopmental;
        if (text.Contains("polydipsia") || text.Contains("polyphagia") || text.Contains("thyroid") || text.Contains("heat intolerance") || text.Contains("cold intolerance"))
            return RosSystem.EndocrineMetabolic;
        if (text.Contains("bruis") || text.Contains("petechia") || text.Contains("lymphaden") || text.Contains("pallor") || text.Contains("anemia"))
            return RosSystem.HematologicLymphatic;
        if (text.Contains("fever") || text.Contains("chills") || text.Contains("anorexia") || text.Contains("weight loss") || text.Contains("sweat") || text.Contains("fatigue") || text.Contains("malaise") || text.Contains("weakness"))
            return RosSystem.General;

        return RosSystem.General;
    }
}
