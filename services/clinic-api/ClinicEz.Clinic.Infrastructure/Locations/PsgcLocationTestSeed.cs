using System;
using System.Collections.Generic;
using ClinicEz.Clinic.Domain.Entities;

namespace ClinicEz.Clinic.Infrastructure.Locations;

/// <summary>
/// Reference seed containing all 17 Philippine regions, key provinces, major metropolitan cities,
/// and representative urban barangays with deterministic 10-digit PSGC hierarchy codes.
/// </summary>
public static class PsgcLocationTestSeed
{
    public static IReadOnlyList<PsgcLocation> GetLocations()
    {
        var list = new List<PsgcLocation>();

        void Add(string code, string name, PsgcLevel level, string? parent = null, string? reg = null, string? prov = null, string? city = null, string? zip = null)
        {
            list.Add(new PsgcLocation
            {
                Id = Guid.NewGuid(),
                PsgcCode = code,
                Name = name,
                Level = level,
                ParentPsgcCode = parent,
                RegionPsgc = reg,
                ProvincePsgc = prov,
                CityMunicipalityPsgc = city,
                ZipCode = zip,
                IsActive = true
            });
        }

        // =====================================================================
        // 17 Regions of the Philippines (Level = Region, 10-digit codes)
        // =====================================================================
        Add("0100000000", "Region I (Ilocos Region)", PsgcLevel.Region, null, "0100000000");
        Add("0200000000", "Region II (Cagayan Valley)", PsgcLevel.Region, null, "0200000000");
        Add("0300000000", "Region III (Central Luzon)", PsgcLevel.Region, null, "0300000000");
        Add("0400000000", "Region IV-A (CALABARZON)", PsgcLevel.Region, null, "0400000000");
        Add("1700000000", "MIMAROPA Region", PsgcLevel.Region, null, "1700000000");
        Add("0500000000", "Region V (Bicol Region)", PsgcLevel.Region, null, "0500000000");
        Add("0600000000", "Region VI (Western Visayas)", PsgcLevel.Region, null, "0600000000");
        Add("0700000000", "Region VII (Central Visayas)", PsgcLevel.Region, null, "0700000000");
        Add("0800000000", "Region VIII (Eastern Visayas)", PsgcLevel.Region, null, "0800000000");
        Add("0900000000", "Region IX (Zamboanga Peninsula)", PsgcLevel.Region, null, "0900000000");
        Add("1000000000", "Region X (Northern Mindanao)", PsgcLevel.Region, null, "1000000000");
        Add("1100000000", "Region XI (Davao Region)", PsgcLevel.Region, null, "1100000000");
        Add("1200000000", "Region XII (SOCCSKSARGEN)", PsgcLevel.Region, null, "1200000000");
        Add("1300000000", "National Capital Region (NCR)", PsgcLevel.Region, null, "1300000000");
        Add("1400000000", "Cordillera Administrative Region (CAR)", PsgcLevel.Region, null, "1400000000");
        Add("1500000000", "Bangsamoro Autonomous Region in Muslim Mindanao (BARMM)", PsgcLevel.Region, null, "1500000000");
        Add("1600000000", "Region XIII (Caraga)", PsgcLevel.Region, null, "1600000000");

        // =====================================================================
        // Provinces / Districts (Level = Province)
        // =====================================================================
        // NCR Districts
        Add("1339000000", "NCR, City of Manila, First District", PsgcLevel.Province, "1300000000", "1300000000", "1339000000");
        Add("1374000000", "NCR, Second District", PsgcLevel.Province, "1300000000", "1300000000", "1374000000");
        Add("1375000000", "NCR, Third District", PsgcLevel.Province, "1300000000", "1300000000", "1375000000");
        Add("1376000000", "NCR, Fourth District", PsgcLevel.Province, "1300000000", "1300000000", "1376000000");

        // Region IV-A
        Add("0410000000", "Batangas", PsgcLevel.Province, "0400000000", "0400000000", "0410000000");
        Add("0421000000", "Cavite", PsgcLevel.Province, "0400000000", "0400000000", "0421000000");
        Add("0434000000", "Laguna", PsgcLevel.Province, "0400000000", "0400000000", "0434000000");
        Add("0456000000", "Quezon", PsgcLevel.Province, "0400000000", "0400000000", "0456000000");
        Add("0458000000", "Rizal", PsgcLevel.Province, "0400000000", "0400000000", "0458000000");

        // Region III
        Add("0314000000", "Bulacan", PsgcLevel.Province, "0300000000", "0300000000", "0314000000");
        Add("0354000000", "Pampanga", PsgcLevel.Province, "0300000000", "0300000000", "0354000000");

        // Region VII
        Add("0722000000", "Cebu", PsgcLevel.Province, "0700000000", "0700000000", "0722000000");
        Add("0712000000", "Bohol", PsgcLevel.Province, "0700000000", "0700000000", "0712000000");

        // Region XI
        Add("1124000000", "Davao del Sur", PsgcLevel.Province, "1100000000", "1100000000", "1124000000");
        Add("1123000000", "Davao del Norte", PsgcLevel.Province, "1100000000", "1100000000", "1123000000");

        // Region VI
        Add("0630000000", "Iloilo", PsgcLevel.Province, "0600000000", "0600000000", "0630000000");
        Add("0645000000", "Negros Occidental", PsgcLevel.Province, "0600000000", "0600000000", "0645000000");

        // =====================================================================
        // Cities & Municipalities (Level = CityMunicipality)
        // =====================================================================
        // NCR
        Add("1339010000", "City of Manila", PsgcLevel.CityMunicipality, "1339000000", "1300000000", "1339000000", "1339010000", "1000");
        Add("1374010000", "Quezon City", PsgcLevel.CityMunicipality, "1374000000", "1300000000", "1374000000", "1374010000", "1100");
        Add("1376010000", "City of Makati", PsgcLevel.CityMunicipality, "1376000000", "1300000000", "1376000000", "1376010000", "1200");
        Add("1376030000", "City of Pasig", PsgcLevel.CityMunicipality, "1376000000", "1300000000", "1376000000", "1376030000", "1600");
        Add("1376040000", "City of Taguig", PsgcLevel.CityMunicipality, "1376000000", "1300000000", "1376000000", "1376040000", "1630");

        // Region IV-A
        Add("0421030000", "City of Bacoor", PsgcLevel.CityMunicipality, "0421000000", "0400000000", "0421000000", "0421030000", "4102");
        Add("0421080000", "City of Dasmariñas", PsgcLevel.CityMunicipality, "0421000000", "0400000000", "0421000000", "0421080000", "4114");
        Add("0421090000", "City of Imus", PsgcLevel.CityMunicipality, "0421000000", "0400000000", "0421000000", "0421090000", "4103");
        Add("0434040000", "City of Calamba", PsgcLevel.CityMunicipality, "0434000000", "0400000000", "0434000000", "0434040000", "4027");
        Add("0434250000", "City of Santa Rosa", PsgcLevel.CityMunicipality, "0434000000", "0400000000", "0434000000", "0434250000", "4026");

        // Region III
        Add("0354010000", "Angeles City", PsgcLevel.CityMunicipality, "0354000000", "0300000000", "0354000000", "0354010000", "2009");
        Add("0354130000", "City of San Fernando", PsgcLevel.CityMunicipality, "0354000000", "0300000000", "0354000000", "0354130000", "2000");

        // Region VII
        Add("0722170000", "Cebu City", PsgcLevel.CityMunicipality, "0722000000", "0700000000", "0722000000", "0722170000", "6000");
        Add("0722260000", "Lapu-Lapu City", PsgcLevel.CityMunicipality, "0722000000", "0700000000", "0722000000", "0722260000", "6015");
        Add("0722300000", "Mandaue City", PsgcLevel.CityMunicipality, "0722000000", "0700000000", "0722000000", "0722300000", "6014");

        // Region XI
        Add("1124020000", "Davao City", PsgcLevel.CityMunicipality, "1124000000", "1100000000", "1124000000", "1124020000", "8000");

        // =====================================================================
        // Barangays (Level = Barangay)
        // =====================================================================
        // Manila
        Add("1339010001", "Barangay 1", PsgcLevel.Barangay, "1339010000", "1300000000", "1339000000", "1339010000", "1000");
        Add("1339010659", "Ermita", PsgcLevel.Barangay, "1339010000", "1300000000", "1339000000", "1339010000", "1000");
        Add("1339010660", "Malate", PsgcLevel.Barangay, "1339010000", "1300000000", "1339000000", "1339010000", "1004");
        Add("1339010669", "Paco", PsgcLevel.Barangay, "1339010000", "1300000000", "1339000000", "1339010000", "1007");
        Add("1339010672", "Santa Ana", PsgcLevel.Barangay, "1339010000", "1300000000", "1339000000", "1339010000", "1009");

        // Quezon City
        Add("1374010001", "Alicia", PsgcLevel.Barangay, "1374010000", "1300000000", "1374000000", "1374010000", "1105");
        Add("1374010008", "Bagong Pag-asa", PsgcLevel.Barangay, "1374010000", "1300000000", "1374000000", "1374010000", "1105");
        Add("1374010010", "Batasan Hills", PsgcLevel.Barangay, "1374010000", "1300000000", "1374000000", "1374010000", "1126");
        Add("1374010025", "Diliman", PsgcLevel.Barangay, "1374010000", "1300000000", "1374000000", "1374010000", "1101");
        Add("1374010045", "Loyola Heights", PsgcLevel.Barangay, "1374010000", "1300000000", "1374000000", "1374010000", "1108");

        // Makati
        Add("1376010002", "Bel-Air", PsgcLevel.Barangay, "1376010000", "1300000000", "1376000000", "1376010000", "1209");
        Add("1376010015", "Poblacion", PsgcLevel.Barangay, "1376010000", "1300000000", "1376000000", "1376010000", "1210");
        Add("1376010019", "San Antonio", PsgcLevel.Barangay, "1376010000", "1300000000", "1376000000", "1376010000", "1203");
        Add("1376010026", "Urdaneta", PsgcLevel.Barangay, "1376010000", "1300000000", "1376000000", "1376010000", "1225");

        // Cebu City
        Add("0722170001", "Apas", PsgcLevel.Barangay, "0722170000", "0700000000", "0722000000", "0722170000", "6000");
        Add("0722170002", "Banilad", PsgcLevel.Barangay, "0722170000", "0700000000", "0722000000", "0722170000", "6000");
        Add("0722170003", "Guadalupe", PsgcLevel.Barangay, "0722170000", "0700000000", "0722000000", "0722170000", "6000");
        Add("0722170004", "Lahug", PsgcLevel.Barangay, "0722170000", "0700000000", "0722000000", "0722170000", "6000");
        Add("0722170005", "Mabolo", PsgcLevel.Barangay, "0722170000", "0700000000", "0722000000", "0722170000", "6000");

        // Davao City
        Add("1124020001", "Bucana", PsgcLevel.Barangay, "1124020000", "1100000000", "1124000000", "1124020000", "8000");
        Add("1124020002", "Buhangin", PsgcLevel.Barangay, "1124020000", "1100000000", "1124000000", "1124020000", "8000");
        Add("1124020003", "Matina Crossing", PsgcLevel.Barangay, "1124020000", "1100000000", "1124000000", "1124020000", "8000");
        Add("1124020004", "Poblacion", PsgcLevel.Barangay, "1124020000", "1100000000", "1124000000", "1124020000", "8000");

        return list;
    }
}
