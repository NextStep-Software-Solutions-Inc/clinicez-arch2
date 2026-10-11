using System;
using System.Collections.Generic;
using System.Globalization;
using System.Linq;
using ClinicEz.Clinic.Application.Common.Interfaces;
using ClinicEz.Clinic.Infrastructure.PhilHealth.Catalog;

namespace ClinicEz.Clinic.Infrastructure.PhilHealth.Services;

public sealed class WhoZScoreCalculator : IWhoZScoreCalculator
{
    private readonly IPhilHealthCatalogLookup _catalogLookup;

    public WhoZScoreCalculator(IPhilHealthCatalogLookup? catalogLookup = null)
    {
        _catalogLookup = catalogLookup ?? PhilHealthCatalogLookup.FromBundledSeed();
    }

    public WhoZScoreEvaluation? Calculate(
        DateOnly dateOfBirth,
        string gender,
        decimal lengthOrHeightCm,
        decimal weightKg,
        bool isMeasuredRecumbent = false,
        DateOnly? assessmentDate = null)
    {
        if (lengthOrHeightCm <= 0m || weightKg <= 0m)
        {
            return null;
        }

        var today = assessmentDate ?? DateOnly.FromDateTime(DateTime.UtcNow);
        var ageMonths = CalculateAgeInMonths(dateOfBirth, today);

        // Strict Under-5 dataset boundary: 0 to 60 months
        if (ageMonths < 0 || ageMonths > 60)
        {
            return null;
        }

        var normSex = gender.Trim().StartsWith("F", StringComparison.OrdinalIgnoreCase) ? "F" : "M";

        // Posture adjustment at 24-month boundary:
        // 0-23m: Standard is recumbent length. If measured standing, ADD 0.7 cm.
        // 24-60m: Standard is standing height. If measured recumbent, SUBTRACT 0.7 cm.
        var adjustedLengthHeight = lengthOrHeightCm;
        if (ageMonths < 24 && !isMeasuredRecumbent)
        {
            adjustedLengthHeight += 0.7m;
        }
        else if (ageMonths >= 24 && isMeasuredRecumbent)
        {
            adjustedLengthHeight -= 0.7m;
        }

        if (adjustedLengthHeight <= 0m)
        {
            return null;
        }

        // Discrete range-bracket resolution: Round to nearest 0.5 cm increment
        var roundedDim = Math.Round(adjustedLengthHeight * 2, MidpointRounding.AwayFromZero) / 2m;
        var cohortBand = ageMonths < 24 ? "0-23" : "24-60";

        // Clamping to catalog bounds
        if (cohortBand == "0-23")
        {
            roundedDim = Math.Clamp(roundedDim, 45.0m, 110.0m);
        }
        else
        {
            roundedDim = Math.Clamp(roundedDim, 65.0m, 120.0m);
        }

        var records = _catalogLookup.List("lib_zscore");
        if (records.Count == 0)
        {
            records = PhilHealthCatalogLookup.FromBundledSeed().List("lib_zscore");
        }

        var candidates = records.Where(r =>
        {
            if (r.Attributes == null) return false;
            if (!r.Attributes.TryGetValue("sex", out var s) || !string.Equals(s, normSex, StringComparison.OrdinalIgnoreCase)) return false;
            if (!r.Attributes.TryGetValue("ageMonths", out var ab) || !string.Equals(ab, cohortBand, StringComparison.OrdinalIgnoreCase)) return false;

            var dimStr = r.Attributes.TryGetValue("length", out var l) ? l : r.Attributes.GetValueOrDefault("height");
            if (string.IsNullOrWhiteSpace(dimStr)) return false;

            if (decimal.TryParse(dimStr, NumberStyles.Any, CultureInfo.InvariantCulture, out var d))
            {
                return Math.Abs(d - roundedDim) < 0.01m;
            }
            return false;
        }).ToList();

        string? category = null;
        string? code = null;
        decimal? zWeightForHeight = null;

        if (candidates.Count > 0)
        {
            var parsedCandidates = candidates.Select(c =>
            {
                var rawWeight = c.Attributes?.GetValueOrDefault("weight") ?? "0";
                // Defensive typo sanitization: "7..9" -> 7.9
                var cleanWeight = rawWeight.Replace("..", ".");
                decimal.TryParse(cleanWeight, NumberStyles.Any, CultureInfo.InvariantCulture, out var w);
                var resultCode = c.Attributes?.GetValueOrDefault("resultCode") ?? "";
                return new
                {
                    Record = c,
                    Weight = w,
                    ResultCode = resultCode,
                    Description = c.Description
                };
            }).OrderBy(c => c.Weight).ToList();

            var sdNeg3Below = parsedCandidates.FirstOrDefault(c => c.ResultCode.Contains("< -3SD"));
            var sdNeg3 = parsedCandidates.FirstOrDefault(c => c.ResultCode == "-3SD");
            var sdNeg2Below = parsedCandidates.FirstOrDefault(c => c.ResultCode.Contains("< -2SD"));
            var sdNeg2 = parsedCandidates.FirstOrDefault(c => c.ResultCode == "-2SD");
            var sdPos2 = parsedCandidates.FirstOrDefault(c => c.ResultCode == "+2SD");
            var sdPos2Above = parsedCandidates.FirstOrDefault(c => c.ResultCode.Contains("> +2SD"));
            var sdPos3 = parsedCandidates.FirstOrDefault(c => c.ResultCode == "+3SD");
            var sdPos3Above = parsedCandidates.FirstOrDefault(c => c.ResultCode.Contains("> +3SD"));

            var wNeg3 = sdNeg3?.Weight ?? sdNeg3Below?.Weight ?? 0m;
            var wNeg2 = sdNeg2?.Weight ?? sdNeg2Below?.Weight ?? 0m;
            var wPos2 = sdPos2?.Weight ?? sdPos2Above?.Weight ?? 0m;
            var wPos3 = sdPos3?.Weight ?? sdPos3Above?.Weight ?? 0m;

            if (sdNeg3Below != null && weightKg <= sdNeg3Below.Weight)
            {
                category = "Severely Wasted";
                code = sdNeg3Below.Record.Code;
            }
            else if (wNeg2 > 0m && weightKg < wNeg2)
            {
                category = "Moderately Wasted";
                code = (sdNeg2Below ?? sdNeg3 ?? parsedCandidates.First()).Record.Code;
            }
            else if (wPos2 > 0m && weightKg <= wPos2)
            {
                category = "Normal";
                code = (sdPos2 ?? sdNeg2 ?? parsedCandidates.First()).Record.Code;
            }
            else if (wPos3 > 0m && weightKg <= wPos3)
            {
                category = "Overweight";
                code = (sdPos3 ?? sdPos2Above ?? parsedCandidates.First()).Record.Code;
            }
            else
            {
                category = "Obese";
                code = (sdPos3Above ?? parsedCandidates.Last()).Record.Code;
            }

            // Approximate continuous Z-Score for Weight-for-Length/Height
            if (wNeg2 > 0m && wPos2 > 0m && wPos2 > wNeg2)
            {
                var median = (wNeg2 + wPos2) / 2m;
                if (weightKg >= median)
                {
                    var halfRange = wPos2 - median;
                    if (halfRange > 0m)
                    {
                        zWeightForHeight = Math.Round(2m * (weightKg - median) / halfRange, 2);
                    }
                }
                else
                {
                    var halfRange = median - wNeg2;
                    if (halfRange > 0m)
                    {
                        zWeightForHeight = Math.Round(2m * (weightKg - median) / halfRange, 2);
                    }
                }
            }
        }

        // Standard WHO Reference Growth Medians for Weight-for-Age & Height-for-Age
        var (expectedMedianWeight, weightSd) = GetMedianWeightForAge(ageMonths, normSex);
        var (expectedMedianHeight, heightSd) = GetMedianHeightForAge(ageMonths, normSex);

        decimal? zWeightForAge = null;
        if (weightSd > 0m)
        {
            zWeightForAge = Math.Round((weightKg - expectedMedianWeight) / weightSd, 2);
        }

        decimal? zHeightForAge = null;
        if (heightSd > 0m)
        {
            zHeightForAge = Math.Round((roundedDim - expectedMedianHeight) / heightSd, 2);
        }

        var interpretation = category != null
            ? $"{category} ({normSex}, {ageMonths} mos, {roundedDim} cm, {weightKg:F1} kg)"
            : "Under-5 pediatric growth evaluated";

        return new WhoZScoreEvaluation(
            AgeInMonths: ageMonths,
            AdjustedLengthHeightCm: roundedDim,
            WeightForAgeZScore: zWeightForAge,
            HeightForAgeZScore: zHeightForAge,
            WeightForHeightZScore: zWeightForHeight,
            PhilHealthZScoreCategory: category,
            PhilHealthZScoreCode: code,
            Interpretation: interpretation);
    }

    private static int CalculateAgeInMonths(DateOnly birthDate, DateOnly asOfDate)
    {
        var months = (asOfDate.Year - birthDate.Year) * 12 + asOfDate.Month - birthDate.Month;
        if (asOfDate.Day < birthDate.Day)
        {
            months--;
        }
        return months;
    }

    private static (decimal Median, decimal Sd) GetMedianWeightForAge(int ageMonths, string sex)
    {
        // WHO Child Growth Standards 2006 table approximations for 0-60 months
        decimal birthWeight = sex == "F" ? 3.2m : 3.3m;
        decimal oneYearWeight = sex == "F" ? 8.9m : 9.6m;
        decimal twoYearWeight = sex == "F" ? 11.5m : 12.2m;
        decimal fiveYearWeight = sex == "F" ? 18.2m : 18.3m;

        decimal median;
        if (ageMonths <= 12)
        {
            median = birthWeight + (oneYearWeight - birthWeight) * (ageMonths / 12.0m);
        }
        else if (ageMonths <= 24)
        {
            median = oneYearWeight + (twoYearWeight - oneYearWeight) * ((ageMonths - 12) / 12.0m);
        }
        else
        {
            median = twoYearWeight + (fiveYearWeight - twoYearWeight) * ((ageMonths - 24) / 36.0m);
        }

        decimal sd = Math.Max(0.5m, median * 0.12m);
        return (median, sd);
    }

    private static (decimal Median, decimal Sd) GetMedianHeightForAge(int ageMonths, string sex)
    {
        decimal birthLength = sex == "F" ? 49.1m : 49.9m;
        decimal oneYearLength = sex == "F" ? 74.0m : 75.7m;
        decimal twoYearLength = sex == "F" ? 86.4m : 87.8m;
        decimal fiveYearLength = sex == "F" ? 109.4m : 110.0m;

        decimal median;
        if (ageMonths <= 12)
        {
            median = birthLength + (oneYearLength - birthLength) * (ageMonths / 12.0m);
        }
        else if (ageMonths <= 24)
        {
            median = oneYearLength + (twoYearLength - oneYearLength) * ((ageMonths - 12) / 12.0m);
        }
        else
        {
            median = twoYearLength + (fiveYearLength - twoYearLength) * ((ageMonths - 24) / 36.0m);
        }

        decimal sd = Math.Max(1.0m, median * 0.04m);
        return (median, sd);
    }
}
