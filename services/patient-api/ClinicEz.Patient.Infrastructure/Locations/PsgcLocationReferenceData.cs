using System.Collections.Generic;
using ClinicEz.Patient.Application.Common.Interfaces;

namespace ClinicEz.Patient.Infrastructure.Locations;

/// <summary>
/// Canonical reference dataset containing all 17 Philippine regions, key provinces,
/// metropolitan cities, and representative barangays with deterministic 10-digit PSGC hierarchy codes.
/// </summary>
public static class PsgcLocationReferenceData
{
    private static readonly List<PsgcLocationDto> _locations = new();

    static PsgcLocationReferenceData()
    {
        void Add(string code, string name, string level, string? parent = null, string? reg = null, string? prov = null, string? city = null, string? zip = null)
        {
            _locations.Add(new PsgcLocationDto(code, name, level, parent, reg, prov, city, zip));
        }

        // 17 Philippine Regions
        Add("0100000000", "Region I (Ilocos Region)", "Region", null, "0100000000");
        Add("0200000000", "Region II (Cagayan Valley)", "Region", null, "0200000000");
        Add("0300000000", "Region III (Central Luzon)", "Region", null, "0300000000");
        Add("0400000000", "Region IV-A (CALABARZON)", "Region", null, "0400000000");
        Add("1700000000", "MIMAROPA Region", "Region", null, "1700000000");
        Add("0500000000", "Region V (Bicol Region)", "Region", null, "0500000000");
        Add("0600000000", "Region VI (Western Visayas)", "Region", null, "0600000000");
        Add("0700000000", "Region VII (Central Visayas)", "Region", null, "0700000000");
        Add("0800000000", "Region VIII (Eastern Visayas)", "Region", null, "0800000000");
        Add("0900000000", "Region IX (Zamboanga Peninsula)", "Region", null, "0900000000");
        Add("1000000000", "Region X (Northern Mindanao)", "Region", null, "1000000000");
        Add("1100000000", "Region XI (Davao Region)", "Region", null, "1100000000");
        Add("1200000000", "Region XII (SOCCSKSARGEN)", "Region", null, "1200000000");
        Add("1300000000", "National Capital Region (NCR)", "Region", null, "1300000000");
        Add("1400000000", "Cordillera Administrative Region (CAR)", "Region", null, "1400000000");
        Add("1500000000", "Bangsamoro Autonomous Region in Muslim Mindanao (BARMM)", "Region", null, "1500000000");
        Add("1600000000", "Region XIII (Caraga)", "Region", null, "1600000000");

        // Provinces / NCR Districts
        Add("1339000000", "NCR, City of Manila, First District", "Province", "1300000000", "1300000000", "1339000000");
        Add("1374000000", "NCR, Second District", "Province", "1300000000", "1300000000", "1374000000");
        Add("1375000000", "NCR, Third District", "Province", "1300000000", "1300000000", "1375000000");
        Add("1376000000", "NCR, Fourth District", "Province", "1300000000", "1300000000", "1376000000");
        Add("0410000000", "Batangas", "Province", "0400000000", "0400000000", "0410000000");
        Add("0421000000", "Cavite", "Province", "0400000000", "0400000000", "0421000000");
        Add("0434000000", "Laguna", "Province", "0400000000", "0400000000", "0434000000");
        Add("0456000000", "Quezon", "Province", "0400000000", "0400000000", "0456000000");
        Add("0458000000", "Rizal", "Province", "0400000000", "0400000000", "0458000000");
        Add("0314000000", "Bulacan", "Province", "0300000000", "0300000000", "0314000000");
        Add("0354000000", "Pampanga", "Province", "0300000000", "0300000000", "0354000000");
        Add("0722000000", "Cebu", "Province", "0700000000", "0700000000", "0722000000");
        Add("0712000000", "Bohol", "Province", "0700000000", "0700000000", "0712000000");
        Add("1124000000", "Davao del Sur", "Province", "1100000000", "1100000000", "1124000000");
        Add("1123000000", "Davao del Norte", "Province", "1100000000", "1100000000", "1123000000");
        Add("0630000000", "Iloilo", "Province", "0600000000", "0600000000", "0630000000");
        Add("0645000000", "Negros Occidental", "Province", "0600000000", "0600000000", "0645000000");

        // Cities & Municipalities
        Add("1339010000", "City of Manila", "CityMunicipality", "1339000000", "1300000000", "1339000000", "1339010000", "1000");
        Add("1374010000", "Quezon City", "CityMunicipality", "1374000000", "1300000000", "1374000000", "1374010000", "1100");
        Add("1376010000", "City of Makati", "CityMunicipality", "1376000000", "1300000000", "1376000000", "1376010000", "1200");
        Add("1376030000", "City of Pasig", "CityMunicipality", "1376000000", "1300000000", "1376000000", "1376030000", "1600");
        Add("1376040000", "City of Taguig", "CityMunicipality", "1376000000", "1300000000", "1376000000", "1376040000", "1630");
        Add("0421030000", "City of Bacoor", "CityMunicipality", "0421000000", "0400000000", "0421000000", "0421030000", "4102");
        Add("0421080000", "City of Dasmariñas", "CityMunicipality", "0421000000", "0400000000", "0421000000", "0421080000", "4114");
        Add("0421090000", "City of Imus", "CityMunicipality", "0421000000", "0400000000", "0421000000", "0421090000", "4103");
        Add("0434040000", "City of Calamba", "CityMunicipality", "0434000000", "0400000000", "0434000000", "0434040000", "4027");
        Add("0434250000", "City of Santa Rosa", "CityMunicipality", "0434000000", "0400000000", "0434000000", "0434250000", "4026");
        Add("0354010000", "Angeles City", "CityMunicipality", "0354000000", "0300000000", "0354000000", "0354010000", "2009");
        Add("0722170000", "Cebu City", "CityMunicipality", "0722000000", "0700000000", "0722000000", "0722170000", "6000");
        Add("0722300000", "Mandaue City", "CityMunicipality", "0722000000", "0700000000", "0722000000", "0722300000", "6014");
        Add("1124020000", "Davao City", "CityMunicipality", "1124000000", "1100000000", "1124000000", "1124020000", "8000");
        Add("0630220000", "Iloilo City", "CityMunicipality", "0630000000", "0600000000", "0630000000", "0630220000", "5000");
        Add("0645010000", "Bacolod City", "CityMunicipality", "0645000000", "0600000000", "0645000000", "0645010000", "6100");

        // Representative Barangays
        Add("1339010001", "Barangay 1", "Barangay", "1339010000", "1300000000", "1339000000", "1339010000", "1012");
        Add("1374010001", "Alicia", "Barangay", "1374010000", "1300000000", "1374000000", "1374010000", "1105");
        Add("1376010001", "Bel-Air", "Barangay", "1376010000", "1300000000", "1376000000", "1376010000", "1209");
        Add("1376010002", "Poblacion", "Barangay", "1376010000", "1300000000", "1376000000", "1376010000", "1210");
        Add("1376010003", "San Lorenzo", "Barangay", "1376010000", "1300000000", "1376000000", "1376010000", "1223");
        Add("0421090001", "Alapan I-A", "Barangay", "0421090000", "0400000000", "0421000000", "0421090000", "4103");
        Add("0421090002", "Bucandala I", "Barangay", "0421090000", "0400000000", "0421000000", "0421090000", "4103");
        Add("0722170001", "Lahug", "Barangay", "0722170000", "0700000000", "0722000000", "0722170000", "6000");
        Add("0722170002", "Mabolo", "Barangay", "0722170000", "0700000000", "0722000000", "0722170000", "6000");
        Add("1124020001", "Poblacion", "Barangay", "1124020000", "1100000000", "1124000000", "1124020000", "8000");
    }

    public static IReadOnlyList<PsgcLocationDto> AllLocations => _locations;
}
