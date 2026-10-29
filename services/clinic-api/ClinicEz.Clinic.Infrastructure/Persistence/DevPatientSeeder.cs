using System;
using System.Collections.Generic;
using System.Diagnostics;
using System.Linq;
using System.Threading;
using System.Threading.Tasks;
using ClinicEz.Clinic.Domain.Entities;
using ClinicEz.Clinic.Domain.Enums;
using ClinicEz.Clinic.Domain.Interfaces;
using Microsoft.EntityFrameworkCore;
using Microsoft.Extensions.Logging;

namespace ClinicEz.Clinic.Infrastructure.Persistence;

public sealed class PatientSeedOptions
{
    public int Count { get; set; } = 1000;
    public string? TenantId { get; set; }
    public Guid? ClinicId { get; set; }
    public bool ClearExistingSeededPatients { get; set; } = false;
    public int BatchSize { get; set; } = 100;
    public Action<int, int>? ProgressCallback { get; set; }
}

public sealed class PatientSeedResult
{
    public int PatientsCreated { get; set; }
    public int EncountersCreated { get; set; }
    public int PrescriptionsCreated { get; set; }
    public int MedicalCertificatesCreated { get; set; }
    public int PastMedicalHistoriesCreated { get; set; }
    public int FamilyHistoriesCreated { get; set; }
    public int SocialHistoriesCreated { get; set; }
    public int SurgicalHistoriesCreated { get; set; }
    public int ReproductiveHistoriesCreated { get; set; }
    public int PhysicalExamProfilesCreated { get; set; }
    public int AllergiesCreated { get; set; }
    public int ProblemsCreated { get; set; }
    public int ImmunizationsCreated { get; set; }
    public int AddressesCreated { get; set; }
    public int GuardiansCreated { get; set; }
    public int IdentityVerificationsCreated { get; set; }
    public int HospitalizationHistoriesCreated { get; set; }
    public int InjuryHistoriesCreated { get; set; }
    public int HomeMedicationsCreated { get; set; }
    public int SexualHistoriesCreated { get; set; }
    public int ReviewOfSystemsItemsCreated { get; set; }
    public int SpecificFormsCreated { get; set; }
    public int BpMonitoringLogsCreated { get; set; }
    public int YakapSubmissionsCreated { get; set; }
    public TimeSpan Elapsed { get; set; }
    public List<string> SamplePatientCodes { get; set; } = new();
    public string TenantId { get; set; } = string.Empty;
    public Guid ClinicId { get; set; }
    public string DoctorName { get; set; } = string.Empty;
}

/// <summary>
/// High-performance Development and Load-Testing Data Seeder.
/// Seeds 1,000+ realistic Philippine clinical records (demographics, encounters, prescriptions, certificates,
/// and comprehensive structured medical histories) to test API scalability, database indexing, and browser UI capacity.
/// </summary>
public static class DevPatientSeeder
{
    private static readonly string[] SingleMaleFirstNames =
    {
        "Juan", "Jose", "Antonio", "Angelo", "Gabriel", "Carlo", "Christian", "Miguel", "Joshua", "Mark",
        "Daniel", "Rafael", "Paolo", "Francis", "Emmanuel", "Ramon", "Eduardo", "Rodrigo", "Ferdinand",
        "Manuel", "Danilo", "Rolando", "Vicente", "Renato", "Arnel", "Jonathan", "Alexander", "Jerome", "Nathaniel",
        "Kenneth", "Alden", "Justin", "Enrico", "Dante", "Benedict", "Jomar", "Gerald", "Ronnie", "Dexter",
        "Jaime", "Dominic", "Lester", "Patrick", "Reynaldo", "Alfonso", "Lorenzo", "Cesar", "Noel", "Richard",
        "Andres", "Emilio", "Apolinario", "Melchor", "Marcelo", "Gregorio", "Artemio", "Teodoro", "Salvador", "Hermogenes",
        "Guillermo", "Bonifacio", "Felipe", "Mariano", "Crispulo", "Basilio", "Severino", "Leon", "Esteban", "Isagani",
        "Joaquin", "Mateo", "Lucas", "Diego", "Leonardo", "Fernando", "Sebastian", "Santiago", "Nicolas", "Alejandro",
        "Javier", "Tomas", "Carlos", "Roberto", "Alberto", "Ignacio", "Ricardo", "Bernardo", "Benjamin", "Ruben",
        "Edgardo", "Ernesto", "Rodolfo", "Felix", "Mario", "Alfredo", "Rogelio", "Arturo", "Victor", "Raul",
        "Nestor", "Oscar", "Gil", "Lito", "Boy", "Jun", "Nonoy", "Joel", "Marlon", "Jeffrey",
        "Marvin", "Ryan", "Bryan", "Dennis", "Randy", "Allan", "Darwin", "Alvin", "Roderick", "Joseph",
        "Ian", "Kevin", "Oliver", "Vincent", "Adrian", "Tristan", "Ethan", "Liam", "Kyle", "Noah",
        "Marcus", "Zachary", "Aaron", "Russell", "Neil", "Lance", "Sean", "Dave", "Paul", "Peter",
        "Eric", "Carl", "Roy", "Elmer", "Gerry", "Rommel", "Rowell", "Rey", "Rodel"
    };

    private static readonly string[] CompoundMaleFirstNames =
    {
        "John Paul", "Mark Anthony", "John Michael", "Christian Dave", "Jose Mari", "Juan Carlo", "Mark Joseph", "Angelo Gabriel",
        "Dave Allen", "Karl Vincent", "Prince Harry", "John Lloyd", "Jan Carl", "Mark Louie", "John Mark", "Carl Angelo",
        "John David", "Marc Christian", "James Patrick", "Paul Vincent", "John Lester", "Ian Gabriel", "John Patrick", "Charles Kevin",
        "Mark Lester", "John Carlo", "Neil Joshua", "John Eric", "John Christopher", "Mark Allen", "John Kevin", "John Kenneth",
        "Renz Michael", "Jan Michael", "Gian Carlo", "Mark Angelo", "John Rey", "Mark Gil", "John Robert", "Dave Matthew",
        "King Arthur", "Prince Carl", "John Raymond", "Mark Francis", "Jose Luis", "Juan Miguel", "Jose Antonio", "Juan Paolo",
        "Kurt Russell", "John Benedict", "Mark Jason", "Christian Paul", "John Vincent", "Marc Anthony", "Kim Joshua", "John Gabriel",
        "Mark Daniel", "Jan Paul", "Christian James", "Sean Patrick", "Mark Lawrence", "John Philip", "Jan Robert", "Mark Steven",
        "Carl Patrick", "John Edward", "Mark Kenneth", "Marc Joseph", "John Dominic", "John Frederick", "Mark Dennis", "John Ronald",
        "Paul Anthony", "Jan Kenneth", "Mark Ryan", "John Oliver", "Carl Jason", "John Russell", "Mark Gerald", "Prince Joshua"
    };

    private static readonly string[] HeritageMaleFirstNames =
    {
        "Bayani", "Datu", "Makisig", "Lakan", "Kidlat", "Sinag", "Bagani", "Alab", "Malakas", "Amihan",
        "Dakila", "Magtanggol", "Silang", "Lapu", "Maypagasa", "Magiting", "Tagumpay", "Kislap", "Diwa", "Tala",
        "Giting", "Haraya", "Banyuhay", "Siklab", "Kalasag", "Agila", "Banahaw", "Mayon", "Arayat", "Apo"
    };

    private static readonly string[] SingleFemaleFirstNames =
    {
        "Maria", "Ana", "Christine", "Angelica", "Bea", "Katherine", "Stephanie", "Camille", "Princess", "Althea",
        "Rochelle", "Patricia", "Jasmine", "Nicole", "Samantha", "Denise", "Kristine", "Alyssa", "Clarisse", "Bianca",
        "Giselle", "Maricel", "Rosario", "Teresa", "Carmela", "Lourdes", "Corazon", "Imelda", "Gloria", "Leonora",
        "Esperanza", "Milagros", "Rowena", "Bernadette", "Marites", "Marilou", "Lorna", "Grace", "Joy", "Cherry",
        "Gemma", "Vanessa", "Eileen", "Sheila", "Regina", "Aileen", "Hazel", "Abigail", "Lovely", "Diana",
        "Remedios", "Dolores", "Concepcion", "Socorro", "Pilar", "Paz", "Luz", "Nieves", "Consuelo", "Carmen",
        "Mercedes", "Soledad", "Amalia", "Natividad", "Purificacion", "Asuncion", "Encarnacion", "Victoria", "Cristina", "Isabel",
        "Elena", "Rosa", "Catalina", "Juana", "Lucia", "Clara", "Angela", "Andrea", "Sofia", "Gabriela",
        "Veronica", "Cecilia", "Monica", "Felicitas", "Jacinta", "Rita", "Flordeliza", "Rosalinda", "Perlita", "Estrella",
        "Aurora", "Ligaya", "Liwayway", "Nenita", "Evangeline", "Charito", "Vilma", "Nora", "Sharon", "Regine",
        "Lea", "Judy", "Claudine", "Angel", "Marian", "Sarah", "Toni", "Alex", "Kathryn", "Nadine",
        "Liza", "Julia", "Janella", "Francine", "Belle", "Yassi", "Sue", "Gabbi", "Kyline", "Jillian",
        "Xyriel", "Miles", "Shaina", "Maja", "Kim", "Erich", "Carla", "Heart", "Solenn", "Anne",
        "Coleen", "Karylle", "Iya", "Megan", "Catriona", "Pia", "Kylie", "Ruffa", "Sunshine", "Danica",
        "Ciara", "Cheska", "Gladys", "Dimples", "Melai", "Pokwang", "Eugene", "Nova", "Charo", "Dawn"
    };

    private static readonly string[] CompoundFemaleFirstNames =
    {
        "Mary Joy", "Maria Elena", "Princess Joy", "Ana Marie", "Angelica Rose", "Ma. Cristina", "Sarah Jane", "Mary Grace",
        "Jenny Rose", "Maria Clara", "Bea Bianca", "Kristine Mae", "Mary Anne", "Anna Patricia", "Maria Teresa", "Lovely Ann",
        "Joy Marie", "Lady Diane", "Mary Jane", "Rose Marie", "Maria Lourdes", "Princess Nicole", "Angelica May", "Mary Rose",
        "Ana Liza", "Maria Carmen", "Cherry Ann", "Mary Christine", "Ella Mae", "Mary Elizabeth", "Princess Sarah", "Ma. Victoria",
        "Joanna Marie", "Maria Isabel", "Mary Flor", "Anna Katrina", "Donna May", "Maria Fe", "Maria Cielo", "Mary Jean",
        "Princess Mae", "Anna Sophia", "Maria Rosario", "Angelica Joy", "Mary Claire", "Maria Dolores", "Jenny Lyn", "Rica Mae",
        "Maria Stella", "Mary Lou", "Ma. Angela", "Princess Dianne", "Anna Luisa", "Maria Luisa", "Mary Ann", "Maria Corazon",
        "Honey Grace", "Maria Socorro", "Angelica Faith", "Mary Faith", "Ana Fe", "Maria Divina", "Princess Angela", "Maria Leonora",
        "Mary Love", "Anna Theresa", "Maria Concepcion", "Lovely Joy", "Ma. Theresa", "Princess Kate", "Mary Divine", "Maria Aurora",
        "Angelica Grace", "Mary Sunshine", "Ana Carmina", "Maria Cecilia", "Apple Mae", "Princess Lorraine", "Mary Pearl", "Maria Paz"
    };

    private static readonly string[] HeritageFemaleFirstNames =
    {
        "Tala", "Mayumi", "Paraluman", "Malaya", "Luningning", "Hiraya", "Mutya", "Likha", "Dalisay", "Liwayway",
        "Diwa", "Bituin", "Marikit", "Amihan", "Sinag", "Kagandahan", "Hiyas", "Sampaguita", "Ilaya", "Lualhati",
        "Mithi", "Alon", "Araw", "Ligaya", "Dalagangbukid", "Lulay", "Kundiman", "Silayan", "Mayari", "Jasmin"
    };

    public static readonly string[] MaleFirstNames = SingleMaleFirstNames
        .Concat(CompoundMaleFirstNames)
        .Concat(HeritageMaleFirstNames)
        .Distinct()
        .ToArray();

    public static readonly string[] FemaleFirstNames = SingleFemaleFirstNames
        .Concat(CompoundFemaleFirstNames)
        .Concat(HeritageFemaleFirstNames)
        .Distinct()
        .ToArray();

    public static readonly string[] LastNames =
    {
        // Spanish-Filipino Classic & Widespread
        "Dela Cruz", "Santos", "Reyes", "Garcia", "Mendoza", "Ramos", "Bautista", "Gonzales", "Villanueva", "Fernandez",
        "Lopez", "Aquino", "Flores", "Rivera", "Castillo", "Tolentino", "Navarro", "Salazar", "Mercado", "De Leon",
        "Valdez", "Perez", "Soriano", "Corpuz", "Manalo", "Agustin", "Morales", "Santiago", "Pascual", "Cruz",
        "Delos Santos", "Bernardo", "Ocampo", "Evangelista", "Guerrero", "Domingo", "Roxas", "Enriquez", "Mallari", "Villamor",
        "Estrada", "Padilla", "Samson", "Pineda", "Miranda", "Concepcion", "Gutierrez", "Magno", "Sarmiento", "Macaraeg",
        "Del Rosario", "De Silva", "San Jose", "Del Mundo", "San Pedro", "Del Monte", "De Guzman", "San Juan", "Santa Maria", "De Castro",
        "De Chavez", "Del Prado", "San Mateo", "Del Fierro", "De Vera", "San Diego", "De Jesus", "De Mesa", "Del Castillo", "De Asis",
        "Aguilar", "Alcantara", "Alvarado", "Alvarez", "Angeles", "Antonio", "Arce", "Arellano", "Arrieta", "Atienza",
        "Avila", "Ballesteros", "Baluyot", "Barrientos", "Bartolome", "Beltran", "Benitez", "Blanco", "Bonifacio", "Borja",
        "Bravo", "Buenaventura", "Buencamino", "Buenaflor", "Bustamante", "Caballero", "Cabrera", "Calderon", "Camacho", "Campos",
        "Canlas", "Capistrano", "Carandang", "Carreon", "Casanova", "Castañeda", "Castro", "Cervantes", "Clemente", "Coloma",
        "Cordero", "Coronel", "Cortes", "Cortez", "Crisostomo", "Cuevas", "Custodio", "Dacanay", "David", "De Gracia",
        "Delgado", "Diaz", "Dionisio", "Donato", "Dulay", "Duran", "Echevarria", "Elises", "Encarnacion", "Enrique",
        "Escalante", "Escudero", "Espina", "Espino", "Espinosa", "Espiritu", "Estanislao", "Esteban", "Eugenio", "Fabian",
        "Fajardo", "Feliciano", "Felix", "Fernando", "Ferrer", "Figueroa", "Fonacier", "Fontanilla", "Francisco", "Frias",
        "Fuentes", "Gabriel", "Galang", "Gallardo", "Gallego", "Galvez", "Gamboa", "Garchitorena", "Garces", "Gaspar",
        "Gavino", "Generoso", "Geronimo", "Gil", "Gomez", "Gonzaga", "Granados", "Gregorio", "Guevarra", "Guidote",
        "Guillen", "Guinto", "Guzman", "Hermoso", "Hernandez", "Herrera", "Hilario", "Hipolito", "Ignacio", "Imperial",
        "Inocencio", "Jacinto", "Javier", "Jimenez", "Joaquin", "Jose", "Jovellanos", "Juarez", "Juliano", "Jurado",
        "Labao", "Labrador", "Laconico", "Lagman", "Laguardia", "Lapid", "Laurel", "Laureano", "Ledesma", "Legaspi",
        "Leonor", "Lerma", "Leyva", "Llamas", "Lontok", "Lorenzo", "Lozada", "Lozano", "Lucero", "Luciano",
        "Lugtu", "Luna", "Macalalad", "Macapinlac", "Maceda", "Madrigal", "Magallanes", "Magat", "Magboo", "Maglalang",
        "Magpayo", "Malit", "Mallonga", "Mamaril", "Manahan", "Manalastas", "Manalili", "Manansala", "Mangahas", "Maniago",
        "Manuel", "Manzano", "Marasigan", "Marcelino", "Marcelo", "Mariano", "Marquez", "Martelino", "Martin", "Martinez",
        "Mateo", "Matias", "Medrano", "Mejia", "Melendres", "Mendez", "Mendigoria", "Mendiola", "Meneses", "Meraña",
        "Merilles", "Mijares", "Mirasol", "Molina", "Monasterio", "Mondragon", "Montano", "Montecillo", "Montenegro", "Monterola",
        "Montes", "Montilla", "Morato", "Morelos", "Moreno", "Muñoz", "Mutuc", "Narciso", "Natividad", "Naval",
        "Navea", "Nazario", "Nepomuceno", "Nicolas", "Nolasco", "Noriega", "Novicio", "Nuñez", "Obispo", "Ochoa",
        "Olivares", "Oliveros", "Ongpauco", "Ordona", "Ordoñez", "Orendain", "Orosa", "Ortega", "Ortiz", "Pabalan",
        "Pablo", "Pacheco", "Paderanga", "Padolina", "Pagdilao", "Paguia", "Paguirigan", "Paguio", "Palacios", "Palma",
        "Palo", "Palomares", "Pamintuan", "Panlilio", "Paragas", "Paras", "Pardo", "Paredes", "Pastor", "Patinio",
        "Patricio", "Pelayo", "Peña", "Peñaranda", "Peralta", "Perdigon", "Pimentel", "Pingol", "Pinlac", "Pinto",
        "Pioquinto", "Pizarro", "Plata", "Policarpio", "Ponce", "Portillo", "Prado", "Prieto", "Prudencio", "Pugeda",
        "Pulido", "Puno", "Quevedo", "Quijano", "Quimpo", "Quirino", "Quizon", "Rabanal", "Ramirez", "Rances",
        "Raval", "Recto", "Regala", "Regalado", "Relucio", "Resurreccion", "Rey", "Ribas", "Ricarte", "Rico",
        "Rios", "Rivas", "Robredo", "Robles", "Roco", "Rodas", "Rodriguez", "Roldan", "Roman", "Romero",
        "Ronquillo", "Rosales", "Rosario", "Rovira", "Ruiz", "Sabater", "Sacay", "Sagun", "Salamanca", "Salas",
        "Salcedo", "Saldana", "Sales", "Salgado", "Salinas", "Salvador", "Samaniego", "Sampang", "San Agustin", "Sanchez",
        "Sandoval", "Sangalang", "Santana", "Santillan", "Saplala", "Saquilayan", "Sarmenta", "Saturnino", "Sauco", "Sayoc",
        "Sebastian", "Segovia", "Sembrano", "Señeres", "Serrano", "Sevilla", "Silverio", "Silvestre", "Simeon", "Simon",
        "Solis", "Soliven", "Somera", "Soria", "Soto", "Suarez", "Tablante", "Tadeo", "Tagle", "Talavera",
        "Tamayo", "Tancinco", "Tangco", "Tayag", "Tejada", "Teodoro", "Tiangco", "Timbol", "Tinio", "Tioseco",
        "Tongco", "Torralba", "Torre", "Torres", "Trajano", "Trinidad", "Tuason", "Tungol", "Urbano", "Urgino",
        "Urrutia", "Valbuena", "Valderrama", "Valdes", "Valdivia", "Valencia", "Valenzuela", "Valera", "Valero", "Valle",
        "Vallejo", "Varela", "Vargas", "Vasquez", "Velasco", "Velasquez", "Velez", "Veloso", "Ventura", "Vera",
        "Vergel", "Vergara", "Vicente", "Victorio", "Vidad", "Vidal", "Villa", "Villacorta", "Villafuerte", "Villalon",
        "Villaluz", "Villamin", "Villar", "Villareal", "Villaroman", "Villaruel", "Villegas", "Vinluan", "Viola", "Yabut",
        "Yambao", "Ybañez", "Ylagan", "Yllana", "Ynchausti", "Yñiguez", "Yulo", "Zamora", "Zapata", "Zarate",
        "Zarraga", "Zavalla", "Zialcita", "Zulueta",

        // Indigenous, Tagalog, Kapampangan, Pangasinan
        "Agbayani", "Agpalo", "Balagtas", "Batungbacal", "Calalang", "Catacutan", "Dagohoy", "Datu", "Dimalanta", "Dimaculangan",
        "Dimagiba", "Gatus", "Gatdula", "Kalaw", "Lakandula", "Lapulapu", "Mabini", "Macapagal", "Macaspac", "Magbanua",
        "Magtanggol", "Malabanan", "Mangubat", "Masangkay", "Panganiban", "Salonga", "Silang", "Soliman", "Sumulong",

        // Ilocano and Northern Luzon
        "Agcaoili", "Cabotaje", "Cariño", "Crispino", "Farinas", "Madamba", "Marcos", "Quinto", "Singson", "Umali",

        // Visayan & Mindanao
        "Abellana", "Alviola", "Balili", "Cabilao", "Cañete", "Cuenco", "Dacalos", "Maglasang", "Osmeña", "Rama", "Suico", "Villacarlos",

        // Chinese-Filipino (Chinoy) Surnames & Hispanized Chinese
        "Ang", "Chan", "Cheng", "Choa", "Chua", "Co", "Cojuangco", "Cua", "Dee", "Dizon", "Dy", "Gan",
        "Go", "Gokongwei", "King", "Ko", "Kua", "Lacson", "Lao", "Lichauco", "Lim", "Ong", "Po", "See",
        "Siy", "Sy", "Tan", "Tantoco", "Tecson", "Tee", "Tiu", "Tuazon", "Ty", "Uy", "Yap", "Yuchengco"
    };

    private static string GenerateRealisticFirstName(Random rng, bool isFemale)
    {
        var roll = rng.NextDouble();
        if (isFemale)
        {
            if (roll < 0.55)
                return SingleFemaleFirstNames[rng.Next(SingleFemaleFirstNames.Length)];
            if (roll < 0.90)
                return CompoundFemaleFirstNames[rng.Next(CompoundFemaleFirstNames.Length)];
            return HeritageFemaleFirstNames[rng.Next(HeritageFemaleFirstNames.Length)];
        }
        else
        {
            if (roll < 0.55)
                return SingleMaleFirstNames[rng.Next(SingleMaleFirstNames.Length)];
            if (roll < 0.90)
                return CompoundMaleFirstNames[rng.Next(CompoundMaleFirstNames.Length)];
            return HeritageMaleFirstNames[rng.Next(HeritageMaleFirstNames.Length)];
        }
    }

    private static readonly (string Street, string Barangay, string City, string Province)[] Locations =
    {
        ("142 Katipunan Ave", "Loyola Heights", "Quezon City", "Metro Manila"),
        ("78 Commonwealth Ave", "Batasan Hills", "Quezon City", "Metro Manila"),
        ("25 Maginhawa St", "UP Village", "Quezon City", "Metro Manila"),
        ("512 Taft Avenue", "Ermita", "Manila", "Metro Manila"),
        ("88 Rizal Avenue", "Santa Cruz", "Manila", "Metro Manila"),
        ("102 España Blvd", "Sampaloc", "Manila", "Metro Manila"),
        ("34 Ayala Ave", "San Lorenzo", "Makati City", "Metro Manila"),
        ("67 Chino Roces Ave", "Pio del Pilar", "Makati City", "Metro Manila"),
        ("12 BGC High Street", "Fort Bonifacio", "Taguig City", "Metro Manila"),
        ("45 Shaw Blvd", "Wack-Wack", "Mandaluyong City", "Metro Manila"),
        ("89 Ortigas Ave", "San Antonio", "Pasig City", "Metro Manila"),
        ("23 Marcos Highway", "Santolan", "Pasig City", "Metro Manila"),
        ("15 Alabang-Zapote Rd", "Pamplona", "Las Piñas City", "Metro Manila"),
        ("66 Dr. A. Santos Ave", "San Dionisio", "Parañaque City", "Metro Manila"),
        ("22 Sumulong Highway", "Mambugan", "Antipolo City", "Rizal"),
        ("80 Ortigas Ave Ext", "San Juan", "Taytay", "Rizal"),
        ("105 Emilio Aguinaldo Hwy", "Palico IV", "Imus City", "Cavite"),
        ("44 Governor's Drive", "Salitran II", "Dasmariñas City", "Cavite"),
        ("18 Molino Blvd", "Molino III", "Bacoor City", "Cavite"),
        ("55 National Highway", "Parian", "Calamba City", "Laguna"),
        ("92 Balibago Rd", "Balibago", "Santa Rosa City", "Laguna"),
        ("11 J.P. Laurel Highway", "Mataas Na Lupa", "Lipa City", "Batangas"),
        ("33 MacArthur Highway", "Dolores", "San Fernando City", "Pampanga"),
        ("71 Olongapo-Gapan Rd", "San Nicolas", "Angeles City", "Pampanga"),
        ("29 McArthur Hwy", "Tikay", "Malolos City", "Bulacan"),
        ("88 Osmeña Blvd", "Capitol Site", "Cebu City", "Cebu"),
        ("120 Gorordo Ave", "Lahug", "Cebu City", "Cebu"),
        ("45 J.P. Laurel Ave", "Bajada", "Davao City", "Davao del Sur"),
        ("60 MacArthur Highway", "Matina", "Davao City", "Davao del Sur")
    };

    private record ClinicalCaseTemplate(
        string ChiefComplaint,
        string Subjective,
        string Objective,
        string Assessment,
        string Plan,
        string Icd10Code,
        string DiagnosisDesc,
        (string Generic, string Brand, string Dosage, string Form, string Sig, int Qty, int Days)[] Prescriptions,
        string CertDiagnosis,
        string CertFindings,
        string CertFitness,
        int? RestDays,
        string CertPurpose
    );

    private static readonly ClinicalCaseTemplate[] CaseTemplates =
    {
        // 1. Acute URTI
        new(
            ChiefComplaint: "3-day cough, runny nose, and low-grade fever.",
            Subjective: "Patient presents with a 3-day history of non-productive cough, mild throat irritation, and low-grade fever (max 38.0 C). Denies shortness of breath, chest pain, or hemoptysis. Fluid intake adequate.",
            Objective: "BP 120/80 mmHg, HR 78 bpm, RR 18 cpm, Temp 37.6 C, SpO2 99%. HEENT: Erythematous posterior pharyngeal wall, no tonsillar exudates. Chest: Clear breath sounds bilaterally, no wheezes or crackles. Heart: Regular rate and rhythm.",
            Assessment: "Acute Upper Respiratory Tract Infection (viral rhinitis and pharyngitis).",
            Plan: "1. Adequate oral hydration (2-3L water/day) and rest.\n2. Paracetamol 500mg tab Q4H PRN for fever or headache.\n3. Cetirizine 10mg tab once daily at bedtime for rhinorrhea.\n4. Return if fever persists >3 days or dyspnea ensues.",
            Icd10Code: "J06.9",
            DiagnosisDesc: "Acute upper respiratory infection, unspecified",
            Prescriptions: new[]
            {
                ("Paracetamol", "Biogesic", "500mg", "Tablet", "1 tablet every 4 hours as needed for fever or headache", 10, 3),
                ("Cetirizine", "Zyrtec", "10mg", "Tablet", "1 tablet once daily at bedtime for 5 days", 5, 5)
            },
            CertDiagnosis: "Acute Upper Respiratory Tract Infection",
            CertFindings: "Pharyngeal congestion, mild fever at onset, clear lung fields.",
            CertFitness: "UnfitToWork",
            RestDays: 2,
            CertPurpose: "Employment"
        ),
        // 2. Essential Hypertension
        new(
            ChiefComplaint: "Routine blood pressure checkup and medication refill.",
            Subjective: "Follow-up for essential hypertension. Complies with daily medication. Denies blurring of vision, dizziness, occipital headache, palpitations, or orthopnea. Sodium reduction moderately observed.",
            Objective: "BP 138/86 mmHg, HR 72 bpm, RR 16 cpm, Temp 36.6 C, SpO2 98%. BMI 26.4 kg/m2 (Overweight). Heart: Normal rate, regular rhythm, no murmurs. Lungs: Clear, no rales. Extremities: No bipedal edema, peripheral pulses full and equal.",
            Assessment: "Essential Hypertension, Stage 1 - Fairly controlled.",
            Plan: "1. Continue Amlodipine 5mg 1 tab PO OD in the morning.\n2. Reinforce dietary sodium restriction (<2g/day) and 30 mins brisk walking 4x/week.\n3. Monitor home BP morning and evening for 1 week.\n4. Repeat serum creatinine, lipid profile, fasting blood sugar in 3 months.",
            Icd10Code: "I10",
            DiagnosisDesc: "Essential (primary) hypertension",
            Prescriptions: new[]
            {
                ("Amlodipine", "Norvasc", "5mg", "Tablet", "1 tablet once daily in the morning", 30, 30),
                ("Losartan Potassium", "Cozaar", "50mg", "Tablet", "1 tablet once daily in the morning", 30, 30)
            },
            CertDiagnosis: "Essential Hypertension - Controlled",
            CertFindings: "BP 138/86 mmHg, asymptomatic, cardiac exam normal, no focal deficits.",
            CertFitness: "FitToWork",
            RestDays: null,
            CertPurpose: "Employment"
        ),
        // 3. Type 2 Diabetes Mellitus
        new(
            ChiefComplaint: "Follow-up for diabetes management and lab review.",
            Subjective: "Established T2DM patient. Reports compliant intake of oral hypoglycemic agents. Latest FBS 128 mg/dL. Denies polydipsia, polyuria, numbness in feet, or blurred vision.",
            Objective: "BP 125/80 mmHg, HR 74 bpm, RR 18 cpm, Temp 36.5 C. BMI 27.2. Extremities: Monofilament test intact bilaterally on feet, no active ulcers, dorsalis pedis pulses palpable.",
            Assessment: "Type 2 Diabetes Mellitus - Non-insulin dependent, stable control.",
            Plan: "1. Continue Metformin 500mg 1 tab BID with meals.\n2. Low glycemic index diet, portion control, regular aerobic exercise.\n3. Daily foot hygiene and inspection.\n4. Follow-up with repeat HbA1c in 3 months.",
            Icd10Code: "E11.9",
            DiagnosisDesc: "Type 2 diabetes mellitus without complications",
            Prescriptions: new[]
            {
                ("Metformin", "Glucophage", "500mg", "Tablet", "1 tablet twice daily with meals", 60, 30)
            },
            CertDiagnosis: "Type 2 Diabetes Mellitus - Stable",
            CertFindings: "FBS 128 mg/dL, monofilament test intact, visual acuity unimpaired.",
            CertFitness: "FitToWork",
            RestDays: null,
            CertPurpose: "General"
        ),
        // 4. Acute Gastroenteritis
        new(
            ChiefComplaint: "Watery diarrhea and abdominal cramps for 1 day.",
            Subjective: "Patient had 4 episodes of watery, non-bloody bowel movements since yesterday evening after eating street food. Associated with mild crampy periumbilical pain and low-grade fever. Denies persistent vomiting; able to tolerate oral liquids.",
            Objective: "BP 110/70 mmHg, HR 88 bpm, RR 18 cpm, Temp 37.8 C. Abdomen: Soft, non-distended, hyperactive bowel sounds, mild diffuse tenderness on palpation, no rebound or guarding. Good skin turgor, moist oral mucosa.",
            Assessment: "Acute Gastroenteritis with Mild Dehydration.",
            Plan: "1. Oral Rehydration Solution (ORS) 1 sachet per loose stool.\n2. BRAT diet (banana, rice, applesauce, toast), avoid dairy/greasy food.\n3. Paracetamol for fever.\n4. Return if high fever >38.5C, bloody stool, or signs of severe dehydration.",
            Icd10Code: "A09",
            DiagnosisDesc: "Infectious gastroenteritis and colitis, unspecified",
            Prescriptions: new[]
            {
                ("Oral Rehydration Salts", "Hydrite", "1 sachet", "Powder", "Dissolve 1 sachet in 1 liter of drinking water, drink after each loose stool", 5, 3),
                ("Paracetamol", "Biogesic", "500mg", "Tablet", "1 tablet every 6 hours as needed for abdominal ache or fever", 6, 2)
            },
            CertDiagnosis: "Acute Gastroenteritis with Mild Dehydration",
            CertFindings: "Watery diarrhea, hyperactive bowel sounds, mild abdominal tenderness, stable vitals.",
            CertFitness: "UnfitToWork",
            RestDays: 3,
            CertPurpose: "Employment"
        ),
        // 5. Bronchial Asthma in Acute Flare
        new(
            ChiefComplaint: "Wheezing and shortness of breath since last night.",
            Subjective: "Patient with known bronchial asthma since childhood. Triggered by recent dust and cold exposure. Reports nocturnal coughing and mild chest tightness. Has been using Salbutamol MDI with partial relief.",
            Objective: "BP 125/82 mmHg, HR 92 bpm, RR 22 cpm, SpO2 96% on room air. Chest: Bilateral expiratory wheezes, prolonged expiratory phase, no subcostal retractions.",
            Assessment: "Bronchial Asthma in Acute Exacerbation, Mild-to-Moderate.",
            Plan: "1. In-clinic nebulization with Salbutamol + Ipratropium 1 nebule completed with good relief.\n2. Salbutamol 100mcg MDI 2 puffs Q4-6H PRN for wheezing.\n3. Short course Prednisone 20mg PO OD for 5 days.\n4. Avoid known allergen/dust triggers.",
            Icd10Code: "J45.901",
            DiagnosisDesc: "Unspecified asthma with (acute) exacerbation",
            Prescriptions: new[]
            {
                ("Salbutamol", "Ventolin", "100mcg/dose", "Inhaler", "2 puffs every 4-6 hours as needed for shortness of breath or wheezing", 1, 30),
                ("Prednisone", "Predsone", "20mg", "Tablet", "1 tablet once daily in the morning after breakfast for 5 days", 5, 5)
            },
            CertDiagnosis: "Bronchial Asthma in Acute Flare",
            CertFindings: "Expiratory wheezing, tachypnea, responsive to bronchodilators, post-treatment SpO2 99%.",
            CertFitness: "UnfitToWork",
            RestDays: 3,
            CertPurpose: "Employment"
        ),
        // 6. Gastroesophageal Reflux Disease (GERD)
        new(
            ChiefComplaint: "Heartburn and acid regurgitation for 2 weeks.",
            Subjective: "Burning retrosternal chest sensation aggravated after heavy meals and lying down. Associated with sour taste in mouth. Denies dysphagia, weight loss, or black tarry stools.",
            Objective: "BP 120/75 mmHg, HR 70 bpm, RR 16 cpm. Abdomen: Flat, soft, mild epigastric tenderness, no organomegaly.",
            Assessment: "Gastroesophageal Reflux Disease (GERD).",
            Plan: "1. Omeprazole 20mg 1 cap PO OD 30 minutes before breakfast for 14 days.\n2. Small frequent meals, avoid lying down within 3 hours after eating, avoid coffee/carbonated beverages.",
            Icd10Code: "K21.9",
            DiagnosisDesc: "Gastro-esophageal reflux disease without esophagitis",
            Prescriptions: new[]
            {
                ("Omeprazole", "Prilosec", "20mg", "Capsule", "1 capsule once daily 30 minutes before breakfast for 14 days", 14, 14),
                ("Aluminum Hydroxide + Magnesium Hydroxide", "Maalox", "400mg/400mg", "Chewable Tablet", "1 chewable tablet 1 hour after meals as needed for breakthrough acidity", 15, 7)
            },
            CertDiagnosis: "Gastroesophageal Reflux Disease",
            CertFindings: "Mild epigastric tenderness, negative cardiac workup, classic reflux presentation.",
            CertFitness: "FitToWork",
            RestDays: null,
            CertPurpose: "Employment"
        ),
        // 7. Acute Allergic Urticaria
        new(
            ChiefComplaint: "Itchy red rashes all over body.",
            Subjective: "Pruritic erythematous wheals developed 4 hours after consuming shrimp. Denies facial swelling, lip edema, or breathing difficulty.",
            Objective: "BP 118/76 mmHg, HR 76 bpm. Skin: Multiple erythematous edematous plaques with central clearing on trunk and limbs, no angioedema.",
            Assessment: "Acute Food-Induced Urticaria (Shellfish).",
            Plan: "1. Cetirizine 10mg PO OD at night.\n2. Calamine lotion topically for itch.\n3. Avoid all crustaceans and shellfish.",
            Icd10Code: "L50.0",
            DiagnosisDesc: "Allergic urticaria",
            Prescriptions: new[]
            {
                ("Cetirizine", "Allerkid/Zyrtec", "10mg", "Tablet", "1 tablet once daily at bedtime for 7 days", 7, 7),
                ("Hydrocortisone", "H-Cort", "1%", "Cream", "Apply thin layer to affected pruritic skin twice daily for 5 days", 1, 5)
            },
            CertDiagnosis: "Acute Allergic Urticaria",
            CertFindings: "Disseminated urticarial wheals, stable hemodynamics, no respiratory compromise.",
            CertFitness: "UnfitToWork",
            RestDays: 2,
            CertPurpose: "Employment"
        )
    };

    private static readonly (string Allergen, AllergyCategory Category, AllergySeverity Severity, string Reaction)[] AllergyTemplates =
    {
        ("Amoxicillin", AllergyCategory.Medication, AllergySeverity.Severe, "Facial angioedema and generalized urticaria"),
        ("Penicillin G", AllergyCategory.Medication, AllergySeverity.LifeThreatening, "Anaphylactic reaction with dyspnea"),
        ("Aspirin", AllergyCategory.Medication, AllergySeverity.Moderate, "Bronchospasm and wheezing"),
        ("Shrimp / Prawns", AllergyCategory.Food, AllergySeverity.Moderate, "Perioral itching and diffuse hives"),
        ("Crab / Crustaceans", AllergyCategory.Food, AllergySeverity.Moderate, "Pruritic macular rash and nausea"),
        ("Peanuts", AllergyCategory.Food, AllergySeverity.Severe, "Laryngeal edema and bronchospasm"),
        ("Dust Mites", AllergyCategory.Environmental, AllergySeverity.Mild, "Sneezing, allergic rhinitis, watery eyes"),
        ("Grass / Weed Pollen", AllergyCategory.Environmental, AllergySeverity.Mild, "Nasal congestion and ocular pruritus"),
        ("Latex", AllergyCategory.Biologic, AllergySeverity.Moderate, "Contact dermatitis and erythematous papules")
    };

    private static readonly (string Code, string Title, string Mdisease, ProblemSeverity Severity, bool IsChronic)[] ProblemTemplates =
    {
        ("I10", "Essential (primary) hypertension", "001", ProblemSeverity.Moderate, true),
        ("E11.9", "Type 2 diabetes mellitus without complications", "006", ProblemSeverity.Moderate, true),
        ("J45.9", "Bronchial asthma, unspecified", "002", ProblemSeverity.Moderate, true),
        ("E78.5", "Hyperlipidemia, unspecified", "011", ProblemSeverity.Mild, true),
        ("K21.9", "Gastro-esophageal reflux disease without esophagitis", "998", ProblemSeverity.Mild, false),
        ("M10.9", "Gout, unspecified", "998", ProblemSeverity.Moderate, true),
        ("J30.9", "Allergic rhinitis, unspecified", "998", ProblemSeverity.Mild, false),
        ("K27.9", "Peptic ulcer, site unspecified, unspecified as acute or chronic", "998", ProblemSeverity.Moderate, false)
    };

    private static readonly (string Library, string Code, string Vaccine, string Manufacturer)[] ImmunizationTemplates =
    {
        ("lib_immchild", "C01", "BCG Vaccine", "Serum Institute of India"),
        ("lib_immchild", "C02", "Hepatitis B Vaccine (Recombinant)", "GlaxoSmithKline"),
        ("lib_immchild", "C03", "Pentavalent (DTP-HepB-Hib)", "Sanofi Pasteur"),
        ("lib_immchild", "C04", "Oral Polio Vaccine (bOPV)", "Bio-Farma"),
        ("lib_immchild", "C07", "Measles-Mumps-Rubella (MMR)", "Merck Sharp & Dohme"),
        ("lib_immyoungw", "Y01", "Tetanus-Diphtheria (Td)", "Biological E. Limited"),
        ("lib_immyoungw", "Y02", "Human Papillomavirus (HPV Quadrivalent)", "Merck & Co."),
        ("lib_immelderly", "E01", "Pneumococcal Polysaccharide (PPSV23)", "Merck Sharp & Dohme"),
        ("lib_immelderly", "E02", "Influenza Quadrivalent", "Sanofi Pasteur"),
        ("OtherImm", "999", "COVID-19 mRNA Vaccine (BNT162b2)", "Pfizer-BioNTech")
    };

    private static readonly (string Procedure, string Hospital, string Findings)[] SurgicalTemplates =
    {
        ("Appendectomy", "Philippine General Hospital", "Suppurative appendicitis, uncomplicated removal"),
        ("Laparoscopic Cholecystectomy", "St. Luke's Medical Center", "Chronic cholecystitis with cholelithiasis (multiple cholesterol stones)"),
        ("Cesarean Section (Low Transverse)", "The Medical City", "Failure to progress in labor, delivered healthy live infant"),
        ("Inguinal Herniorrhaphy with Mesh", "Quezon City General Hospital", "Right indirect inguinal hernia, Lichtenstein repair"),
        ("Tonsillectomy", "East Avenue Medical Center", "Chronic hypertrophic tonsillitis, Grade III obstruction"),
        ("Excision of Benign Lipoma", "Amang Rodriguez Memorial Hospital", "3x4 cm subcutaneous lipoma, left posterior shoulder, margins clear")
    };

    public static async Task<PatientSeedResult> SeedAsync(
        ApplicationDbContext dbContext,
        PatientSeedOptions options,
        ILogger? logger = null,
        CancellationToken ct = default)
    {
        var sw = Stopwatch.StartNew();
        var targetCount = Math.Max(1, options.Count);
        var batchSize = Math.Max(25, Math.Min(options.BatchSize, 250));

        // Configure extended command timeout for high-volume relational operations
        if (dbContext.Database.IsRelational())
        {
            dbContext.Database.SetCommandTimeout(300);
        }

        // 1. Resolve target Clinic and Tenant strictly for this request
        Guid clinicId;
        string tenantId;
        FacilitySettings? existingSettings;

        if (options.ClinicId.HasValue && options.ClinicId.Value != Guid.Empty)
        {
            clinicId = options.ClinicId.Value;
            existingSettings = await dbContext.Settings.IgnoreQueryFilters()
                .FirstOrDefaultAsync(s => s.ClinicId == clinicId, ct);
            tenantId = options.TenantId 
                ?? existingSettings?.TenantId 
                ?? "tenant_default";
        }
        else
        {
            existingSettings = await dbContext.Settings.IgnoreQueryFilters().FirstOrDefaultAsync(ct);
            clinicId = existingSettings?.ClinicId ?? Guid.Parse("11111111-1111-1111-1111-111111111111");
            tenantId = options.TenantId ?? existingSettings?.TenantId ?? "tenant_default";
        }

        if (existingSettings == null)
        {
            existingSettings = new FacilitySettings
            {
                Id = Guid.NewGuid(),
                TenantId = tenantId,
                ClinicId = clinicId,
                ClinicName = "Primary Care Clinic",
                OperatingHours = "Mon-Fri 8:00 AM - 5:00 PM, Sat 8:00 AM - 12:00 PM",
                LetterheadHeader = "PRIMARY CARE CLINICAL CENTER",
                LetterheadSubHeader = "Accredited Primary Healthcare & Diagnostics",
                LetterheadAddress = "123 Health Ave, Brgy. Central, Quezon City",
                LetterheadContact = "+63 2 8123 4567 | care@primarycare.ph",
                LicenseToken = "dev-unrestricted-license",
                PlanTier = "Enterprise",
                MaxStaffLimit = 50,
                CreatedAt = DateTime.UtcNow,
                CreatedBy = "System:DevPatientSeeder"
            };
            dbContext.Settings.Add(existingSettings);
            await dbContext.SaveChangesAsync(ct);
            logger?.LogInformation("[DevPatientSeeder] Created ClinicSettings for Clinic: {ClinicId} (Tenant: {TenantId})", clinicId, tenantId);
        }

        // 2. Ensure default Attending Physician exists for this specific clinic
        var doctor = await dbContext.StaffMembers.IgnoreQueryFilters()
            .FirstOrDefaultAsync(s => s.ClinicId == clinicId && s.Role == StaffRole.Doctor && !s.IsDeleted, ct);

        if (doctor == null)
        {
            doctor = new StaffMember
            {
                Id = Guid.NewGuid(),
                TenantId = tenantId,
                ClinicId = clinicId,
                FirstName = "Jose",
                LastName = "Rizal",
                Title = "Dr.",
                Role = StaffRole.Doctor,
                Specialty = "Family & Internal Medicine",
                PrcLicenseNumber = "0098765",
                PtrNumber = "PTR-2026-8877",
                S2LicenseNumber = "S2-88776655",
                Email = $"dr.rizal@{tenantId.Replace(" ", "").ToLowerInvariant()}.ph",
                PhoneNumber = "0917-555-0101",
                IsActive = true,
                CreatedAt = DateTime.UtcNow,
                CreatedBy = "System:DevPatientSeeder"
            };
            dbContext.StaffMembers.Add(doctor);
            await dbContext.SaveChangesAsync(ct);
            logger?.LogInformation("[DevPatientSeeder] Created default Attending Physician for Clinic {ClinicId}: Dr. Jose Rizal (PRC: 0098765)", clinicId);
        }

        // 3. Clear existing seeded patients if requested using cascading relational cleanup
        if (options.ClearExistingSeededPatients)
        {
            logger?.LogInformation("[DevPatientSeeder] Purging existing test records for clinic {ClinicId} prior to seeding...", clinicId);
            await PurgeClinicTestRecordsAsync(dbContext, clinicId, tenantId, purgeAll: false, logger, ct);
        }

        // 4. Calculate existing max sequence for PatientCode and sync with tracker
        var year = DateTime.UtcNow.Year;
        var prefix = $"PAT-{year}-";
        var existingCodes = await dbContext.Patients.IgnoreQueryFilters()
            .Where(p => p.ClinicId == clinicId && p.PatientCode.StartsWith(prefix))
            .Select(p => p.PatientCode)
            .ToListAsync(ct);

        var currentSeq = 0;
        foreach (var code in existingCodes)
        {
            if (code.Length > prefix.Length && int.TryParse(code[prefix.Length..], out var s) && s > currentSeq)
            {
                currentSeq = s;
            }
        }

        var tracker = await dbContext.PatientCodeSequenceTrackers.IgnoreQueryFilters()
            .FirstOrDefaultAsync(t => t.ClinicId == clinicId && t.TenantId == tenantId && t.Year == year, ct);

        if (tracker != null && tracker.CurrentSequence > currentSeq)
        {
            currentSeq = tracker.CurrentSequence;
        }

        // Monotonic sequence baselines for collision-free certificate and prescription codes
        var currentRxSeq = (await dbContext.Consultations.IgnoreQueryFilters().CountAsync(c => c.ClinicId == clinicId, ct)) + 1;
        var currentCertSeq = (await dbContext.MedicalCertificates.IgnoreQueryFilters().CountAsync(m => m.ClinicId == clinicId, ct)) + 1;

        // Track existing (FirstName, LastName) combinations in this clinic to guarantee zero duplicate pairs
        var existingClinicFullNames = (await dbContext.Patients.IgnoreQueryFilters()
            .Where(p => p.ClinicId == clinicId)
            .Select(p => new { p.FirstName, p.LastName })
            .ToListAsync(ct))
            .Select(p => $"{p.FirstName.Trim().ToLowerInvariant()}|{p.LastName.Trim().ToLowerInvariant()}")
            .ToHashSet(StringComparer.OrdinalIgnoreCase);

        var result = new PatientSeedResult
        {
            TenantId = tenantId,
            ClinicId = clinicId,
            DoctorName = $"{doctor.Title} {doctor.FirstName} {doctor.LastName}"
        };

        var rng = new Random(1337); // Deterministic seed for reproducible testing distributions
        var totalCreated = 0;

        logger?.LogInformation("[DevPatientSeeder] Starting batch generation of {TargetCount} patients for Clinic {ClinicId} (Tenant: {TenantId})...",
            targetCount, clinicId, tenantId);

        var now = DateTime.UtcNow;

        while (totalCreated < targetCount)
        {
            var currentBatchSize = Math.Min(batchSize, targetCount - totalCreated);
            var batchPatients = new List<Patient>(currentBatchSize);
            var batchPhilHealthMemberships = new List<PatientPhilHealthMembership>();
            var batchYakapEnlistments = new List<PatientYakapEnlistment>();
            var batchAlerts = new List<PatientAlert>();
            var batchVitals = new List<PatientVitals>();
            var batchPastMedHist = new List<PatientMedicalHistory>();
            var batchFamilyHist = new List<PatientFamilyHistory>();
            var batchSocialHist = new List<PatientSocialHistory>();
            var batchSurgHist = new List<PatientSurgicalHistory>();
            var batchReprodHist = new List<PatientReproductiveHistory>();
            var batchPhysExam = new List<PatientPhysicalExam>();
            var batchPhysExamFindings = new List<PatientPhysicalExamFinding>();
            var batchAllergies = new List<PatientAllergy>();
            var batchProblems = new List<PatientMedicalHistory>();
            var batchImmunizations = new List<PatientImmunization>();
            var batchEncounters = new List<ConsultationEncounter>();
            var batchMedCerts = new List<MedicalCertificate>();
            var batchAddresses = new List<PatientAddress>();
            var batchGuardians = new List<PatientGuardian>();
            var batchIdentityVerifs = new List<PatientIdentityVerification>();
            var batchHospitalizations = new List<PatientHospitalizationHistory>();
            var batchInjuries = new List<PatientInjuryHistory>();
            var batchHomeMeds = new List<PatientHomeMedication>();
            var batchSexualHistories = new List<PatientSexualHistory>();
            var batchBpLogs = new List<PatientBpMonitoringLog>();
            var batchBpDays = new List<PatientBpMonitoringDay>();
            var batchRosItems = new List<EncounterReviewOfSystemsItem>();
            var batchObGyneExams = new List<EncounterObGyneExam>();
            var batchPediatricMilestones = new List<EncounterPediatricMilestone>();
            var batchPediatricDangerSigns = new List<EncounterPediatricDangerSign>();
            var batchAdolescentAssessments = new List<EncounterAdolescentAssessment>();
            var batchHeadsssAssessments = new List<EncounterHeadsssDomainAssessment>();
            var batchYakapSubmissions = new List<YakapSubmission>();

            for (var i = 0; i < currentBatchSize; i++)
            {
                currentSeq++;
                var patientId = Guid.NewGuid();

                bool isFemale;
                string firstName;
                string lastName;
                var nameAttempts = 0;
                do
                {
                    isFemale = rng.NextDouble() >= 0.48;
                    firstName = GenerateRealisticFirstName(rng, isFemale);
                    lastName = LastNames[rng.Next(LastNames.Length)];
                    nameAttempts++;
                } while (!existingClinicFullNames.Add($"{firstName.Trim().ToLowerInvariant()}|{lastName.Trim().ToLowerInvariant()}") && nameAttempts < 100);

                if (nameAttempts >= 100)
                {
                    firstName = $"{firstName} {rng.Next(1, 99)}";
                    existingClinicFullNames.Add($"{firstName.Trim().ToLowerInvariant()}|{lastName.Trim().ToLowerInvariant()}");
                }

                // Middle name represents maternal maiden surname in the Philippines and must be distinct from lastName
                string middleName;
                do
                {
                    middleName = LastNames[rng.Next(LastNames.Length)];
                } while (string.Equals(middleName, lastName, StringComparison.OrdinalIgnoreCase));

                var suffix = !isFemale && rng.NextDouble() < 0.12 ? (rng.Next(3) switch { 0 => "Jr.", 1 => "III", _ => "II" }) : null;

                // Age distribution: ~15% pediatric (<18), ~35% young adult (18-39), ~30% middle-aged (40-59), ~20% seniors (60-88)
                var ageBucket = rng.Next(100);
                int ageYears;
                if (ageBucket < 15) ageYears = rng.Next(1, 18);
                else if (ageBucket < 50) ageYears = rng.Next(18, 40);
                else if (ageBucket < 80) ageYears = rng.Next(40, 60);
                else ageYears = rng.Next(60, 89);

                var birthYear = now.Year - ageYears;
                var birthMonth = rng.Next(1, 13);
                var birthDay = rng.Next(1, 28);
                var dateOfBirth = new DateOnly(birthYear, birthMonth, birthDay);

                var civilStatus = ageYears < 18 ? "Single"
                    : ageYears < 26 ? (rng.NextDouble() < 0.8 ? "Single" : "Married")
                    : (rng.NextDouble() < 0.65 ? "Married" : (rng.NextDouble() < 0.75 ? "Single" : (rng.NextDouble() < 0.9 ? "Widowed" : "Separated")));

                var loc = Locations[rng.Next(Locations.Length)];
                var mobilePrefixes = new[] { "0917", "0918", "0919", "0920", "0922", "0927", "0935", "0949", "0998" };
                var contactNumber = $"{mobilePrefixes[rng.Next(mobilePrefixes.Length)]}-{rng.Next(100, 999)}-{rng.Next(1000, 9999)}";
                var emailName = $"{firstName.ToLowerInvariant().Replace(" ", "")}.{lastName.ToLowerInvariant().Replace(" ", "")}{rng.Next(10, 999)}";
                var emailDomains = new[] { "gmail.com", "yahoo.com", "outlook.com", "icloud.com" };
                var email = $"{emailName}@{emailDomains[rng.Next(emailDomains.Length)]}";

                var philHealthNo = $"{rng.Next(10, 25):D2}-{rng.Next(100000000, 999999999)}-{rng.Next(1, 9)}";
                var seniorCitizenId = ageYears >= 60 ? $"OSCA-{rng.Next(1000, 9999)}-{rng.Next(10000, 99999)}" : null;
                var pwdId = rng.NextDouble() < 0.06 ? $"PWD-{rng.Next(1000, 9999)}-{rng.Next(10000, 99999)}" : null;

                var bloodTypes = new[] { "O+", "A+", "B+", "AB+", "O-", "A-", "B-", "AB-" };
                var bloodType = bloodTypes[rng.Next(bloodTypes.Length)];

                // Summary alerts & chronic flags
                var hasAlert = rng.NextDouble() < 0.22;
                var alertStrings = new[] { "Severe Penicillin Allergy", "High Fall Risk", "Anticoagulation Therapy (Warfarin)", "Immunocompromised", "Asthma flare-up risk", "Renal Impairment" };
                var alerts = hasAlert ? alertStrings[rng.Next(alertStrings.Length)] : null;

                var chronicList = new List<string>();
                if (ageYears >= 45 && rng.NextDouble() < 0.45) chronicList.Add("Hypertension Stage 2");
                if (ageYears >= 40 && rng.NextDouble() < 0.30) chronicList.Add("Type 2 Diabetes Mellitus");
                if (ageYears >= 50 && rng.NextDouble() < 0.25) chronicList.Add("Dyslipidemia");
                if (rng.NextDouble() < 0.15) chronicList.Add("Bronchial Asthma");
                var chronicConditions = chronicList.Count > 0 ? string.Join(", ", chronicList) : null;

                var allergiesSummary = rng.NextDouble() < 0.35
                    ? AllergyTemplates[rng.Next(AllergyTemplates.Length)].Allergen
                    : null;

                var emergencyFirstName = rng.Next(2) == 0
                    ? MaleFirstNames[rng.Next(MaleFirstNames.Length)]
                    : FemaleFirstNames[rng.Next(FemaleFirstNames.Length)];
                var emergencyLastName = LastNames[rng.Next(LastNames.Length)];
                var patientCode = $"{prefix}{currentSeq:D5}";
                var emergencyPhone = $"{mobilePrefixes[rng.Next(mobilePrefixes.Length)]}-{rng.Next(100, 999)}-{rng.Next(1000, 9999)}";
                var emergencyRel = civilStatus == "Married" ? "Spouse" : (ageYears < 25 ? "Mother" : "Sibling");
                var emergencyName = $"{emergencyLastName}, {emergencyFirstName}";

                var classification = ageYears < 22 ? "Student" : (ageYears >= 60 ? "Retiree" : "Employee");
                var customFields = new Dictionary<string, object?>
                {
                    { "classification", classification },
                    { "category", classification },
                    { "student_id", classification == "Student" ? $"STU-{now.Year}-{rng.Next(1000, 9999)}" : null },
                    { "employee_id", classification == "Employee" ? $"EMP-{rng.Next(1000, 9999)}" : null },
                    { "workplace", loc.City },
                    { "seeded_batch", "scale_test_1000" },
                    { "primary_address_line", loc.Street },
                    { "primary_barangay", loc.Barangay },
                    { "primary_city", loc.City },
                    { "primary_province", loc.Province },
                    { "emergency_contact_name", emergencyName },
                    { "emergency_contact_phone", emergencyPhone },
                    { "emergency_contact_relationship", emergencyRel }
                };

                var patientCreatedAt = now.AddDays(-rng.Next(30, 720));

                // Seed active PhilHealth YAKAP enlistment when PhilHealthNumber is present
                if (!string.IsNullOrWhiteSpace(philHealthNo))
                {
                    var currentYear = now.Year;
                    var enlistedDate = DateOnly.FromDateTime(now.AddMonths(-rng.Next(1, 6)));
                    var validUntilDate = new DateOnly(currentYear, 12, 31);
                    var seqNum = rng.Next(1, 99999);
                    var caseNo = $"C000921{currentYear}{seqNum:D5}";
                    var enlistmentNo = $"E000921{currentYear}{seqNum:D5}";
                    var profilingTransNo = $"P000921{currentYear}{seqNum:D5}";

                    batchPhilHealthMemberships.Add(new PatientPhilHealthMembership
                    {
                        Id = Guid.NewGuid(),
                        TenantId = tenantId,
                        ClinicId = clinicId,
                        PatientId = patientId,
                        MemberType = PhilHealthMemberType.MM,
                        MemberPin = philHealthNo,
                        DefaultWalkInAtc = "ATC01",
                        CreatedAt = patientCreatedAt,
                        CreatedBy = "System:DevPatientSeeder"
                    });

                    batchYakapEnlistments.Add(new PatientYakapEnlistment
                    {
                        Id = Guid.NewGuid(),
                        TenantId = tenantId,
                        ClinicId = clinicId,
                        PatientId = patientId,
                        EffectiveYear = currentYear,
                        Status = YakapEnlistmentStatus.Active,
                        Source = YakapEnlistmentSource.ClinicEnlistment,
                        PackageType = YakapPackageType.Konsulta,
                        EnlistmentDate = enlistedDate,
                        ValidUntil = validUntilDate,
                        CaseNo = caseNo,
                        EnlistmentTransNo = enlistmentNo,
                        ProfilingTransNo = profilingTransNo,
                        CreatedAt = patientCreatedAt,
                        CreatedBy = "System:DevPatientSeeder"
                    });
                }

                var bloodTypeEnum = bloodType switch
                {
                    "O+" => BloodType.OPositive,
                    "A+" => BloodType.APositive,
                    "B+" => BloodType.BPositive,
                    "AB+" => BloodType.ABPositive,
                    "O-" => BloodType.ONegative,
                    "A-" => BloodType.ANegative,
                    "B-" => BloodType.BNegative,
                    "AB-" => BloodType.ABNegative,
                    _ => BloodType.Unknown
                };

                var civilStatusEnum = civilStatus switch
                {
                    "Married" => CivilStatus.Married,
                    "Widowed" => CivilStatus.Widowed,
                    "Separated" => CivilStatus.Separated,
                    _ => CivilStatus.Single
                };

                var patient = new Patient
                {
                    Id = patientId,
                    TenantId = tenantId,
                    ClinicId = clinicId,
                    PatientCode = patientCode,
                    FirstName = firstName,
                    LastName = lastName,
                    MiddleName = middleName,
                    Suffix = suffix,
                    DateOfBirth = dateOfBirth,
                    Gender = isFemale ? Gender.Female : Gender.Male,
                    CivilStatus = civilStatusEnum,
                    ContactNumber = contactNumber,
                    Email = email,
                    PhilHealthNumber = philHealthNo,
                    SeniorCitizenId = seniorCitizenId,
                    PwdId = pwdId,
                    BloodType = bloodTypeEnum,
                    VerificationStatus = rng.NextDouble() < 0.92 ? PatientVerificationStatus.Verified : PatientVerificationStatus.PendingVerification,
                    CustomFields = customFields,
                    CreatedAt = patientCreatedAt,
                    CreatedBy = "System:DevPatientSeeder",
                    UpdatedAt = now,
                    UpdatedBy = "System:DevPatientSeeder"
                };

                batchPatients.Add(patient);
                if (result.SamplePatientCodes.Count < 5)
                {
                    result.SamplePatientCodes.Add(patientCode);
                }

                // Seed 1NF structured address with 10-digit PSGC
                batchAddresses.Add(new PatientAddress
                {
                    Id = Guid.NewGuid(),
                    TenantId = tenantId,
                    ClinicId = clinicId,
                    PatientId = patientId,
                    AddressType = PatientAddressType.Permanent,
                    RegionPsgc = "1300000000",
                    ProvincePsgc = "1374000000",
                    CityMunicipalityPsgc = "1374040000",
                    BarangayPsgc = "1374040001",
                    StreetAddress = loc.Street,
                    ZipCode = "1100",
                    CreatedAt = patientCreatedAt,
                    CreatedBy = "System:DevPatientSeeder"
                });

                if (ageYears < 18 || rng.NextDouble() < 0.20)
                {
                    batchGuardians.Add(new PatientGuardian
                    {
                        Id = Guid.NewGuid(),
                        TenantId = tenantId,
                        ClinicId = clinicId,
                        PatientId = patientId,
                        FirstName = emergencyFirstName,
                        LastName = emergencyLastName,
                        RelationshipCode = ageYears < 18 ? "MOTHER" : "SPOUSE",
                        ContactNumber = emergencyPhone,
                        CreatedAt = patientCreatedAt,
                        CreatedBy = "System:DevPatientSeeder"
                    });
                }

                batchIdentityVerifs.Add(new PatientIdentityVerification
                {
                    Id = Guid.NewGuid(),
                    TenantId = tenantId,
                    ClinicId = clinicId,
                    PatientId = patientId,
                    VerificationDate = DateOnly.FromDateTime(patientCreatedAt),
                    Mode = YakapVerificationMode.VALID_ID,
                    ValidIdTypeCode = "01",
                    ValidIdNumber = seniorCitizenId ?? pwdId ?? philHealthNo,
                    CreatedAt = patientCreatedAt,
                    CreatedBy = "System:DevPatientSeeder"
                });

                if (rng.NextDouble() < 0.15)
                {
                    batchHospitalizations.Add(new PatientHospitalizationHistory
                    {
                        Id = Guid.NewGuid(),
                        TenantId = tenantId,
                        ClinicId = clinicId,
                        PatientId = patientId,
                        AdmissionDate = DateOnly.FromDateTime(now.AddYears(-rng.Next(1, 5))),
                        DischargeDate = DateOnly.FromDateTime(now.AddYears(-rng.Next(1, 5)).AddDays(3)),
                        ReasonForAdmission = "Acute Gastroenteritis with moderate dehydration",
                        HospitalFacilityName = "Quezon City General Hospital",
                        CreatedAt = patientCreatedAt,
                        CreatedBy = "System:DevPatientSeeder"
                    });
                }

                if (rng.NextDouble() < 0.10)
                {
                    batchInjuries.Add(new PatientInjuryHistory
                    {
                        Id = Guid.NewGuid(),
                        TenantId = tenantId,
                        ClinicId = clinicId,
                        PatientId = patientId,
                        InjuryDate = DateOnly.FromDateTime(now.AddYears(-rng.Next(1, 4))),
                        InjuryDescription = "Closed fracture of radius from accidental fall",
                        CreatedAt = patientCreatedAt,
                        CreatedBy = "System:DevPatientSeeder"
                    });
                }

                if (chronicList.Count > 0)
                {
                    batchHomeMeds.Add(new PatientHomeMedication
                    {
                        Id = Guid.NewGuid(),
                        TenantId = tenantId,
                        ClinicId = clinicId,
                        PatientId = patientId,
                        GenericDrugName = "Amlodipine",
                        DoseStrength = "5mg tablet",
                        Frequency = "Once daily in the morning",
                        CreatedAt = patientCreatedAt,
                        CreatedBy = "System:DevPatientSeeder"
                    });
                }

                if (ageYears >= 15)
                {
                    batchSexualHistories.Add(new PatientSexualHistory
                    {
                        Id = Guid.NewGuid(),
                        TenantId = tenantId,
                        ClinicId = clinicId,
                        PatientId = patientId,
                        IsSexuallyActive = civilStatus == "Married" || rng.NextDouble() < 0.5,
                        EverHadSex = true,
                        AgeAtFirstSexualContact = 18,
                        CreatedAt = patientCreatedAt,
                        CreatedBy = "System:DevPatientSeeder"
                    });
                }

                if (chronicList.Contains("Hypertension Stage 2"))
                {
                    var bpLogId = Guid.NewGuid();
                    batchBpLogs.Add(new PatientBpMonitoringLog
                    {
                        Id = bpLogId,
                        TenantId = tenantId,
                        ClinicId = clinicId,
                        PatientId = patientId,
                        StartDate = DateOnly.FromDateTime(now.AddDays(-7)),
                        EndDate = DateOnly.FromDateTime(now),
                        CreatedAt = patientCreatedAt,
                        CreatedBy = "System:DevPatientSeeder"
                    });

                    for (var d = 1; d <= 7; d++)
                    {
                        batchBpDays.Add(new PatientBpMonitoringDay
                        {
                            Id = Guid.NewGuid(),
                            TenantId = tenantId,
                            ClinicId = clinicId,
                            BpMonitoringLogId = bpLogId,
                            DayNumber = d,
                            MeasurementDate = DateOnly.FromDateTime(now.AddDays(-7 + d)),
                            AmSystolic = 130 + rng.Next(-5, 10),
                            AmDiastolic = 85 + rng.Next(-5, 5),
                            PmSystolic = 135 + rng.Next(-5, 10),
                            PmDiastolic = 88 + rng.Next(-5, 5),
                            CreatedAt = patientCreatedAt,
                            CreatedBy = "System:DevPatientSeeder"
                        });
                    }
                }

                if (hasAlert)
                {
                    batchAlerts.Add(new PatientAlert
                    {
                        Id = Guid.NewGuid(),
                        TenantId = tenantId,
                        ClinicId = clinicId,
                        PatientId = patientId,
                        Category = PatientAlertCategory.ClinicalSafety,
                        Severity = PatientAlertSeverity.Warning,
                        Status = PatientAlertStatus.Active,
                        Title = alerts ?? "Clinical Alert",
                        CreatedAt = patientCreatedAt,
                        CreatedBy = "System:DevPatientSeeder"
                    });
                }

                batchVitals.Add(new PatientVitals
                {
                    Id = Guid.NewGuid(),
                    TenantId = tenantId,
                    ClinicId = clinicId,
                    PatientId = patientId,
                    SystolicBp = rng.Next(110, 135),
                    DiastolicBp = rng.Next(70, 85),
                    HeartRateBpm = rng.Next(65, 85),
                    RespiratoryRateBreathsPerMin = rng.Next(14, 20),
                    TemperatureCelsius = Math.Round((decimal)(36.4 + rng.NextDouble() * 0.8), 1),
                    OxygenSaturationPercent = rng.Next(97, 100),
                    HeightCm = Math.Round((decimal)(150 + rng.Next(0, 30)), 1),
                    WeightKg = Math.Round((decimal)(45 + rng.Next(0, 40)), 1),
                    RecordedAt = patientCreatedAt,
                    NurseId = doctor.Id,
                    RecordedByNurseName = $"{doctor.Title} {doctor.FirstName} {doctor.LastName}",
                    CreatedAt = patientCreatedAt,
                    CreatedBy = "System:DevPatientSeeder"
                });

                // 4a. Past Medical Histories (1 to 3 items)
                var medHistCount = rng.Next(1, 4);
                var pickedProblems = ProblemTemplates.OrderBy(_ => rng.Next()).Take(medHistCount).ToList();
                foreach (var prob in pickedProblems)
                {
                    batchPastMedHist.Add(new PatientMedicalHistory
                    {
                        Id = Guid.NewGuid(),
                        TenantId = tenantId,
                        ClinicId = clinicId,
                        PatientId = patientId,
                        ConditionTitle = prob.Title,
                        PhilHealthMdiseaseCode = prob.Mdisease,
                        Icd10Code = prob.Code,
                        SpecificDescription = prob.Title,
                        OnsetDate = new DateOnly(now.Year - rng.Next(1, 10), rng.Next(1, 13), 1),
                        Status = (!prob.IsChronic && rng.NextDouble() < 0.6) ? ProblemStatus.Resolved : ProblemStatus.Active,
                        ClinicalNotes = prob.IsChronic ? "Maintained on prescription therapy." : "Resolved with treatment.",
                        CreatedAt = patient.CreatedAt,
                        CreatedBy = "System:DevPatientSeeder"
                    });
                }

                // 4b. Family Histories (1 to 2 items)
                var famCount = rng.Next(1, 3);
                var relationships = new[]
                {
                    FamilyRelationship.Father,
                    FamilyRelationship.Mother,
                    FamilyRelationship.Grandfather,
                    FamilyRelationship.Grandmother,
                    FamilyRelationship.Sibling
                };
                foreach (var prob in pickedProblems.Take(famCount))
                {
                    batchFamilyHist.Add(new PatientFamilyHistory
                    {
                        Id = Guid.NewGuid(),
                        TenantId = tenantId,
                        ClinicId = clinicId,
                        PatientId = patientId,
                        ConditionTitle = prob.Title,
                        PhilHealthMdiseaseCode = prob.Mdisease,
                        Icd10Code = prob.Code,
                        Relationship = relationships[rng.Next(relationships.Length)],
                        ClinicalNotes = "Diagnosed in middle age, under routine care.",
                        CreatedAt = patient.CreatedAt,
                        CreatedBy = "System:DevPatientSeeder"
                    });
                }

                // 4c. Social History
                if (ageYears >= 16)
                {
                    var isSmoker = rng.NextDouble() < 0.20;
                    var isDrinker = rng.NextDouble() < 0.35;
                    batchSocialHist.Add(new PatientSocialHistory
                    {
                        Id = Guid.NewGuid(),
                        TenantId = tenantId,
                        ClinicId = clinicId,
                        PatientId = patientId,
                        IsSmoker = isSmoker,
                        PacksPerDay = isSmoker ? (decimal)(rng.Next(5, 20) * 0.1) : null,
                        CigarettesPerDay = isSmoker ? rng.Next(5, 20) : null,
                        YearsSmoking = isSmoker ? rng.Next(2, 25) : null,
                        SmokingPackYears = isSmoker ? (decimal)rng.Next(2, 20) : null,
                        IsAlcoholDrinker = isDrinker,
                        AlcoholDrinksPerWeek = isDrinker ? rng.Next(1, 8) : null,
                        AlcoholFrequency = isDrinker ? (rng.Next(2) == 0 ? "Occasional" : "Weekly") : "Never",
                        PhysicalActivityFrequency = rng.Next(3) switch { 0 => "Sedentary", 1 => "Light (1-2x/week)", _ => "Moderate (3-5x/week)" },
                        DietaryHabits = "Standard Filipino diet, mixed carbohydrates and meats",
                        CreatedAt = patient.CreatedAt,
                        CreatedBy = "System:DevPatientSeeder"
                    });
                }

                // 4d. Surgical History (for ~22% of patients)
                if (ageYears >= 18 && rng.NextDouble() < 0.22)
                {
                    var surg = SurgicalTemplates[rng.Next(SurgicalTemplates.Length)];
                    batchSurgHist.Add(new PatientSurgicalHistory
                    {
                        Id = Guid.NewGuid(),
                        TenantId = tenantId,
                        ClinicId = clinicId,
                        PatientId = patientId,
                        ProcedureName = surg.Procedure,
                        HospitalName = surg.Hospital,
                        SurgeryDate = new DateOnly(now.Year - rng.Next(1, 8), rng.Next(1, 13), rng.Next(1, 28)),
                        Findings = surg.Findings,
                        Complications = "None reported, uneventful recovery.",
                        Remarks = "Surgical site well-healed.",
                        CreatedAt = patient.CreatedAt,
                        CreatedBy = "System:DevPatientSeeder"
                    });
                }

                // 4e. Reproductive History (for females >= 13)
                if (isFemale && ageYears >= 13)
                {
                    var gravida = ageYears < 20 ? 0 : rng.Next(0, 4);
                    var para = gravida == 0 ? 0 : Math.Max(0, gravida - rng.Next(0, 2));
                    batchReprodHist.Add(new PatientReproductiveHistory
                    {
                        Id = Guid.NewGuid(),
                        TenantId = tenantId,
                        ClinicId = clinicId,
                        PatientId = patientId,
                        IsApplicable = true,
                        MenarcheAge = rng.Next(11, 15),
                        LastMenstrualPeriod = new DateOnly(now.Year, now.Month, Math.Min(28, rng.Next(1, 29))),
                        PeriodDurationDays = rng.Next(3, 7),
                        CycleIntervalDays = rng.Next(26, 32),
                        PadsPerDay = rng.Next(2, 5),
                        IsMenopausal = ageYears >= 50,
                        MenopauseAge = ageYears >= 50 ? rng.Next(48, 54) : null,
                        ContraceptiveMethod = gravida > 0 ? (rng.Next(2) == 0 ? "Oral Contraceptive Pills" : "None") : "None",
                        Gravidity = gravida,
                        Parity = para,
                        TermBirths = para,
                        PretermBirths = 0,
                        Abortions = Math.Max(0, gravida - para),
                        LivingChildren = para,
                        DeliveryType = para > 0 ? (rng.Next(2) == 0 ? "Vaginal" : "Cesarean") : null,
                        CreatedAt = patient.CreatedAt,
                        CreatedBy = "System:DevPatientSeeder"
                    });
                }

                // 4f. Baseline Physical Exam Profile
                var physExamId = Guid.NewGuid();
                batchPhysExam.Add(new PatientPhysicalExam
                {
                    Id = physExamId,
                    TenantId = tenantId,
                    ClinicId = clinicId,
                    PatientId = patientId,
                    GenSurveyId = "1", // Essentially normal / Ambulatory
                    GeneralSurveyRemarks = "Conscious, coherent, ambulatory, not in cardiopulmonary distress.",
                    SkinId = "1",
                    SkinRemarks = "Warm, good turgor, no active lesions or jaundice.",
                    HeentId = "11",
                    HeentRemarks = "Anicteric sclerae, pink palpebral conjunctivae, supple neck, no cervical lymphadenopathy.",
                    ChestId = "6",
                    ChestLungsRemarks = "Symmetrical chest expansion, clear breath sounds, no rales or rhonchi.",
                    HeartId = "5",
                    HeartRemarks = "Adynamic precordium, normal rate, regular rhythm, normal S1 and S2.",
                    AbdomenId = "7",
                    AbdomenRemarks = "Flat, soft, non-tender, normoactive bowel sounds, no palpable organomegaly.",
                    NeuroId = "6",
                    NeurologicalRemarks = "Oriented x 3, intact cranial nerves, motor 5/5 on all extremities.",
                    RectalId = "1",
                    DigitalRectalRemarks = "Deferred on initial general consultation.",
                    GuId = "1",
                    GenitourinaryRemarks = "No flank tenderness, normal external genitalia.",
                    CreatedAt = patient.CreatedAt,
                    CreatedBy = "System:DevPatientSeeder"
                });

                batchPhysExamFindings.Add(new PatientPhysicalExamFinding
                {
                    Id = Guid.NewGuid(),
                    TenantId = tenantId,
                    ClinicId = clinicId,
                    PhysicalExamId = physExamId,
                    System = PhysicalExamSystem.GeneralSurvey,
                    FindingTitle = "Essentially normal / Ambulatory",
                    IsNormal = true,
                    CreatedAt = patient.CreatedAt,
                    CreatedBy = "System:DevPatientSeeder"
                });

                // 4g. Structured Allergies (for ~40% of patients)
                if (rng.NextDouble() < 0.40)
                {
                    var tmpl = AllergyTemplates[rng.Next(AllergyTemplates.Length)];
                    batchAllergies.Add(new PatientAllergy
                    {
                        Id = Guid.NewGuid(),
                        TenantId = tenantId,
                        ClinicId = clinicId,
                        PatientId = patientId,
                        Category = tmpl.Category,
                        Allergen = tmpl.Allergen,
                        Severity = tmpl.Severity,
                        ReactionManifestation = tmpl.Reaction,
                        IsAnaphylactic = tmpl.Severity == AllergySeverity.LifeThreatening,
                        Status = AllergyStatus.Active,
                        OnsetDate = new DateOnly(now.Year - rng.Next(1, 15), 1, 1),
                        Notes = "Documented during clinical intake.",
                        CreatedAt = patient.CreatedAt,
                        CreatedBy = "System:DevPatientSeeder"
                    });
                }

                // 4h. Structured Problems (for ~60% of patients)
                if (rng.NextDouble() < 0.60)
                {
                    var prb = ProblemTemplates[rng.Next(ProblemTemplates.Length)];
                    batchProblems.Add(new PatientMedicalHistory
                    {
                        Id = Guid.NewGuid(),
                        TenantId = tenantId,
                        ClinicId = clinicId,
                        PatientId = patientId,
                        Category = MedicalHistoryCategory.ProblemListItem,
                        ConditionTitle = prb.Title,
                        Icd10Code = prb.Code,
                        PhilHealthMdiseaseCode = prb.Mdisease,
                        Status = ProblemStatus.Active,
                        Severity = prb.Severity,
                        IsChronicNcd = prb.IsChronic,
                        OnsetDate = new DateOnly(now.Year - rng.Next(1, 8), rng.Next(1, 13), 1),
                        ClinicalNotes = "Regular monitoring at OPD clinic.",
                        RecordedByStaffId = doctor.Id,
                        RecordedByStaffName = $"{doctor.Title} {doctor.FirstName} {doctor.LastName}",
                        CreatedAt = patient.CreatedAt,
                        CreatedBy = "System:DevPatientSeeder"
                    });
                }

                // 4i. Structured Immunizations (1 to 2 records for ~70% of patients)
                if (rng.NextDouble() < 0.70)
                {
                    var immCount = rng.Next(1, 3);
                    var pickedImms = ImmunizationTemplates.OrderBy(_ => rng.Next()).Take(immCount);
                    foreach (var imm in pickedImms)
                    {
                        batchImmunizations.Add(new PatientImmunization
                        {
                            Id = Guid.NewGuid(),
                            TenantId = tenantId,
                            ClinicId = clinicId,
                            PatientId = patientId,
                            PatientName = $"{patient.FirstName} {patient.LastName}",
                            PhilHealthLibrary = imm.Library,
                            PhilHealthCode = imm.Code,
                            VaccineName = imm.Vaccine,
                            Manufacturer = imm.Manufacturer,
                            LotBatchNumber = $"LOT-{rng.Next(100000, 999999)}",
                            ExpirationDate = new DateOnly(now.Year + rng.Next(1, 3), rng.Next(1, 13), rng.Next(1, 28)),
                            DoseSequence = 1,
                            IsSeriesCompleted = true,
                            Route = "Intramuscular",
                            InjectionSite = "Left Deltoid",
                            AdministeredAtUtc = now.AddDays(-rng.Next(30, 365)),
                            AdministeredByStaffId = doctor.Id,
                            AdministeredByStaffName = $"{doctor.Title} {doctor.FirstName} {doctor.LastName}",
                            AdministeredByPrcLicense = doctor.PrcLicenseNumber,
                            CreatedAt = patient.CreatedAt,
                            CreatedBy = "System:DevPatientSeeder"
                        });
                    }
                }

                // 4j. Encounters (1 to 3 encounters per patient)
                var encounterCount = rng.Next(1, 4);
                for (var encIdx = 0; encIdx < encounterCount; encIdx++)
                {
                    var template = CaseTemplates[rng.Next(CaseTemplates.Length)];
                    var encounterDate = now.AddDays(-rng.Next(1, 360)).AddMinutes(-rng.Next(60, 480));
                    var encounterId = Guid.NewGuid();
                    var rxNumber = $"RX-{encounterDate:yyyyMMdd}-{currentRxSeq++:D5}-{Guid.NewGuid().ToString("N")[..4].ToUpperInvariant()}";

                    var visitWorkflowMode = !string.IsNullOrWhiteSpace(philHealthNo) && rng.NextDouble() < 0.5
                        ? VisitWorkflowMode.YakapAvailment
                        : VisitWorkflowMode.Regular;

                    var encounter = new ConsultationEncounter
                    {
                        Id = encounterId,
                        TenantId = tenantId,
                        ClinicId = clinicId,
                        PatientId = patientId,
                        PatientName = $"{patient.FirstName} {patient.LastName}",
                        DoctorId = doctor.Id,
                        DoctorName = $"{doctor.Title} {doctor.FirstName} {doctor.LastName}",
                        DoctorPrcLicense = doctor.PrcLicenseNumber,
                        DoctorPtr = doctor.PtrNumber,
                        DoctorS2License = doctor.S2LicenseNumber,
                        VisitWorkflowMode = visitWorkflowMode,
                        EncounterDate = encounterDate,
                        Subjective = template.Subjective,
                        Objective = template.Objective,
                        Assessment = template.Assessment,
                        Plan = template.Plan,
                        IsSigned = true,
                        SignedAt = encounterDate.AddMinutes(15),
                        PrescriptionNumber = rxNumber,
                        RxPublicVerificationToken = Guid.NewGuid().ToString("N")[..16],
                        RxDispenseStatus = rng.NextDouble() < 0.65 ? PrescriptionDispenseStatus.DispensedAtPartnerPharmacy : PrescriptionDispenseStatus.Issued,
                        CreatedAt = encounterDate,
                        CreatedBy = "System:DevPatientSeeder"
                    };

                    // Encounter Diagnoses
                    encounter.Diagnoses.Add(new EncounterDiagnosis
                    {
                        Id = Guid.NewGuid(),
                        ConsultationEncounterId = encounterId,
                        Icd10Code = template.Icd10Code,
                        Description = template.DiagnosisDesc,
                        IsPrimary = true,
                        CreatedAt = encounterDate,
                        CreatedBy = "System:DevPatientSeeder"
                    });

                    // Prescription Items
                    foreach (var pItem in template.Prescriptions)
                    {
                        encounter.Prescriptions.Add(new PrescriptionItem
                        {
                            Id = Guid.NewGuid(),
                            ConsultationEncounterId = encounterId,
                            GenericName = pItem.Generic,
                            BrandName = pItem.Brand,
                            Dosage = pItem.Dosage,
                            Form = pItem.Form,
                            Sig = pItem.Sig,
                            Quantity = pItem.Qty,
                            DurationDays = pItem.Days,
                            IsDangerousDrug = false,
                            CreatedAt = encounterDate,
                            CreatedBy = "System:DevPatientSeeder"
                        });
                        result.PrescriptionsCreated++;
                    }

                    batchEncounters.Add(encounter);
                    result.EncountersCreated++;

                    batchRosItems.Add(new EncounterReviewOfSystemsItem
                    {
                        Id = Guid.NewGuid(),
                        TenantId = tenantId,
                        ClinicId = clinicId,
                        ConsultationEncounterId = encounterId,
                        System = RosSystem.General,
                        SymptomCode = "00",
                        SymptomTitle = "No fever or weight loss",
                        IsNormal = true,
                        CreatedAt = encounterDate,
                        CreatedBy = "System:DevPatientSeeder"
                    });

                    if (isFemale && ageYears >= 18 && ageYears <= 49 && rng.NextDouble() < 0.35)
                    {
                        batchObGyneExams.Add(new EncounterObGyneExam
                        {
                            Id = Guid.NewGuid(),
                            TenantId = tenantId,
                            ClinicId = clinicId,
                            ConsultationEncounterId = encounterId,
                            SpeculumExam = "Normal cervix, no lesions",
                            InternalExam = "No masses or tenderness",
                            CreatedAt = encounterDate,
                            CreatedBy = "System:DevPatientSeeder"
                        });
                    }

                    if (ageYears <= 5)
                    {
                        var mId = Guid.NewGuid();
                        batchPediatricMilestones.Add(new EncounterPediatricMilestone
                        {
                            Id = mId,
                            TenantId = tenantId,
                            ClinicId = clinicId,
                            ConsultationEncounterId = encounterId,
                            MilestoneVisitAgeCode = "24M",
                            IsGrossMotorAtPar = true,
                            IsOverallDevelopmentAtPar = true,
                            GrossMotorRemarks = "Walks steadily",
                            CreatedAt = encounterDate,
                            CreatedBy = "System:DevPatientSeeder"
                        });
                        batchPediatricDangerSigns.Add(new EncounterPediatricDangerSign
                        {
                            Id = Guid.NewGuid(),
                            TenantId = tenantId,
                            ClinicId = clinicId,
                            PediatricMilestoneId = mId,
                            Domain = PediatricDevelopmentDomain.GrossMotor,
                            DangerSignCode = "NONE",
                            Description = "No danger sign",
                            IsPresent = false,
                            CreatedAt = encounterDate,
                            CreatedBy = "System:DevPatientSeeder"
                        });
                    }

                    if (ageYears >= 10 && ageYears <= 19)
                    {
                        batchAdolescentAssessments.Add(new EncounterAdolescentAssessment
                        {
                            Id = Guid.NewGuid(),
                            TenantId = tenantId,
                            ClinicId = clinicId,
                            ConsultationEncounterId = encounterId,
                            CreatedAt = encounterDate,
                            CreatedBy = "System:DevPatientSeeder"
                        });
                        batchHeadsssAssessments.Add(new EncounterHeadsssDomainAssessment
                        {
                            Id = Guid.NewGuid(),
                            TenantId = tenantId,
                            ClinicId = clinicId,
                            ConsultationEncounterId = encounterId,
                            Domain = HeadsssDomain.Home,
                            AssentConsentStatus = true,
                            CreatedAt = encounterDate,
                            CreatedBy = "System:DevPatientSeeder"
                        });
                    }

                    if (visitWorkflowMode == VisitWorkflowMode.YakapAvailment)
                    {
                        batchYakapSubmissions.Add(new YakapSubmission
                        {
                            Id = Guid.NewGuid(),
                            TenantId = tenantId,
                            ClinicId = clinicId,
                            PatientId = patientId,
                            ConsultationEncounterId = encounterId,
                            AccreditationNo = "H92000001",
                            CaseNo = $"C000921{now.Year}{rng.Next(10000, 99999)}",
                            SubmissionType = YakapSubmissionType.Consultation,
                            LocalTransactionNo = $"S000921{now.Year}{rng.Next(10000, 99999)}",
                            ProcessingStatus = YakapProcessingStatus.Accepted,
                            SubmittedAtUtc = encounterDate,
                            CompletedAtUtc = encounterDate.AddMinutes(5),
                            CreatedAt = encounterDate,
                            CreatedBy = "System:DevPatientSeeder"
                        });
                    }

                    // 4k. Medical Certificate (issued for ~30% of encounters)
                    if (rng.NextDouble() < 0.32)
                    {
                        var certDate = DateOnly.FromDateTime(encounterDate);
                        var medCert = new MedicalCertificate
                        {
                            Id = Guid.NewGuid(),
                            TenantId = tenantId,
                            ClinicId = clinicId,
                            CertificateNumber = $"MC-{certDate:yyyyMMdd}-{currentCertSeq++:D5}-{Guid.NewGuid().ToString("N")[..4].ToUpperInvariant()}",
                            PatientId = patientId,
                            PatientName = $"{patient.FirstName} {patient.LastName}",
                            ConsultationId = encounterId,
                            DoctorId = doctor.Id,
                            DoctorName = $"{doctor.Title} {doctor.FirstName} {doctor.LastName}",
                            PrcLicenseNumber = doctor.PrcLicenseNumber ?? "0098765",
                            PtrNumber = doctor.PtrNumber ?? "PTR-2026-8877",
                            IssueDate = certDate,
                            Diagnosis = template.CertDiagnosis,
                            ClinicalFindings = template.CertFindings,
                            FitnessStatus = template.CertFitness,
                            RecommendedRestDays = template.RestDays,
                            RestStartDate = template.RestDays.HasValue ? certDate : null,
                            RestEndDate = template.RestDays.HasValue ? certDate.AddDays(template.RestDays.Value - 1) : null,
                            Purpose = template.CertPurpose,
                            Remarks = "Official medical certification issued after complete physical evaluation.",
                            IsSigned = true,
                            SignedAt = encounterDate.AddMinutes(20),
                            CreatedAt = encounterDate,
                            CreatedBy = "System:DevPatientSeeder"
                        };
                        batchMedCerts.Add(medCert);
                        result.MedicalCertificatesCreated++;
                    }
                }
            }

            // 5. Persist this batch
            dbContext.Patients.AddRange(batchPatients);
            dbContext.PatientAddresses.AddRange(batchAddresses);
            dbContext.PatientGuardians.AddRange(batchGuardians);
            dbContext.PatientIdentityVerifications.AddRange(batchIdentityVerifs);
            dbContext.PatientHospitalizationHistories.AddRange(batchHospitalizations);
            dbContext.PatientInjuryHistories.AddRange(batchInjuries);
            dbContext.PatientHomeMedications.AddRange(batchHomeMeds);
            dbContext.PatientSexualHistories.AddRange(batchSexualHistories);
            dbContext.PatientBpMonitoringLogs.AddRange(batchBpLogs);
            dbContext.PatientBpMonitoringDays.AddRange(batchBpDays);
            dbContext.PatientPhilHealthMemberships.AddRange(batchPhilHealthMemberships);
            dbContext.PatientYakapEnlistments.AddRange(batchYakapEnlistments);
            dbContext.PatientAlerts.AddRange(batchAlerts);
            dbContext.PatientVitals.AddRange(batchVitals);
            dbContext.PatientMedicalHistories.AddRange(batchPastMedHist);
            dbContext.PatientFamilyHistories.AddRange(batchFamilyHist);
            dbContext.PatientSocialHistories.AddRange(batchSocialHist);
            dbContext.PatientSurgicalHistories.AddRange(batchSurgHist);
            dbContext.PatientReproductiveHistories.AddRange(batchReprodHist);
            dbContext.PatientPhysicalExams.AddRange(batchPhysExam);
            dbContext.PatientPhysicalExamFindings.AddRange(batchPhysExamFindings);
            dbContext.PatientAllergies.AddRange(batchAllergies);
            dbContext.PatientMedicalHistories.AddRange(batchProblems);
            dbContext.PatientImmunizations.AddRange(batchImmunizations);
            dbContext.Consultations.AddRange(batchEncounters);
            dbContext.EncounterReviewOfSystemsItems.AddRange(batchRosItems);
            dbContext.EncounterObGyneExams.AddRange(batchObGyneExams);
            dbContext.EncounterPediatricMilestones.AddRange(batchPediatricMilestones);
            dbContext.EncounterPediatricDangerSigns.AddRange(batchPediatricDangerSigns);
            dbContext.EncounterAdolescentAssessments.AddRange(batchAdolescentAssessments);
            dbContext.EncounterHeadsssDomainAssessments.AddRange(batchHeadsssAssessments);
            dbContext.YakapSubmissions.AddRange(batchYakapSubmissions);
            dbContext.MedicalCertificates.AddRange(batchMedCerts);

            await dbContext.SaveChangesAsync(ct);

            // Detach tracked entities to keep EF Core change tracker lightweight and fast
            dbContext.ChangeTracker.Clear();

            totalCreated += currentBatchSize;
            result.PatientsCreated += currentBatchSize;
            result.PastMedicalHistoriesCreated += batchPastMedHist.Count;
            result.FamilyHistoriesCreated += batchFamilyHist.Count;
            result.SocialHistoriesCreated += batchSocialHist.Count;
            result.SurgicalHistoriesCreated += batchSurgHist.Count;
            result.ReproductiveHistoriesCreated += batchReprodHist.Count;
            result.PhysicalExamProfilesCreated += batchPhysExam.Count;
            result.AllergiesCreated += batchAllergies.Count;
            result.ProblemsCreated += batchProblems.Count;
            result.ImmunizationsCreated += batchImmunizations.Count;
            result.AddressesCreated += batchAddresses.Count;
            result.GuardiansCreated += batchGuardians.Count;
            result.IdentityVerificationsCreated += batchIdentityVerifs.Count;
            result.HospitalizationHistoriesCreated += batchHospitalizations.Count;
            result.InjuryHistoriesCreated += batchInjuries.Count;
            result.HomeMedicationsCreated += batchHomeMeds.Count;
            result.SexualHistoriesCreated += batchSexualHistories.Count;
            result.ReviewOfSystemsItemsCreated += batchRosItems.Count;
            result.SpecificFormsCreated += batchObGyneExams.Count + batchPediatricMilestones.Count + batchAdolescentAssessments.Count;
            result.BpMonitoringLogsCreated += batchBpLogs.Count;
            result.YakapSubmissionsCreated += batchYakapSubmissions.Count;

            options.ProgressCallback?.Invoke(totalCreated, targetCount);
            logger?.LogInformation("[DevPatientSeeder] Batch committed: {TotalCreated}/{TargetCount} patients ({Percent:F1}%)...",
                totalCreated, targetCount, (double)totalCreated / targetCount * 100);
        }

        // 6. Update patient code sequence tracker in DB so future regular registrations don't collide
        tracker = await dbContext.PatientCodeSequenceTrackers.IgnoreQueryFilters()
            .FirstOrDefaultAsync(t => t.TenantId == tenantId && t.ClinicId == clinicId && t.Year == year, ct);

        if (tracker == null)
        {
            dbContext.PatientCodeSequenceTrackers.Add(new PatientCodeSequenceTracker
            {
                Id = Guid.NewGuid(),
                TenantId = tenantId,
                ClinicId = clinicId,
                Year = year,
                CurrentSequence = currentSeq,
                LastAssignedAt = DateTime.UtcNow,
                CreatedAt = DateTime.UtcNow,
                CreatedBy = "System:DevPatientSeeder"
            });
        }
        else if (tracker.CurrentSequence < currentSeq)
        {
            tracker.CurrentSequence = currentSeq;
            tracker.LastAssignedAt = DateTime.UtcNow;
            tracker.UpdatedAt = DateTime.UtcNow;
        }

        await dbContext.SaveChangesAsync(ct);

        sw.Stop();
        result.Elapsed = sw.Elapsed;

        logger?.LogInformation("[DevPatientSeeder] Complete! Successfully seeded {Patients} patients, {Encounters} encounters, {Prescriptions} prescriptions, {Certs} medical certificates in {Elapsed:F2}s.",
            result.PatientsCreated, result.EncountersCreated, result.PrescriptionsCreated, result.MedicalCertificatesCreated, result.Elapsed.TotalSeconds);

        return result;
    }

    /// <summary>
    /// Purges development seeded patient records and all dependent entities (consultations, prescriptions,
    /// diagnoses, certificates, medical histories, exam profiles, allergies, problems, immunizations, and vitals)
    /// in relational foreign-key dependency order for the target clinic.
    /// </summary>
    public static async Task<int> PurgeClinicTestRecordsAsync(
        ApplicationDbContext dbContext,
        Guid clinicId,
        string? tenantId = null,
        bool purgeAll = false,
        ILogger? logger = null,
        CancellationToken ct = default)
    {
        if (dbContext.Database.IsRelational())
        {
            dbContext.Database.SetCommandTimeout(300);
        }

        IQueryable<Patient> query = dbContext.Patients.IgnoreQueryFilters()
            .Where(p => p.ClinicId == clinicId);

        if (!purgeAll)
        {
            query = query.Where(p =>
                p.CreatedBy == "System:DevPatientSeeder" ||
                p.CreatedBy == "seeder" ||
                p.CreatedBy == "System:DevSeeder" ||
                p.PatientCode.StartsWith("PAT-") ||
                (p.Email != null && p.Email.Contains("@clinicez.ph")));
        }

        var patientIds = await query.Select(p => p.Id).ToListAsync(ct);

        logger?.LogInformation("[DevPatientSeeder] Purging {Count} patients for clinic {ClinicId} (PurgeAll: {PurgeAll})...",
            patientIds.Count, clinicId, purgeAll);

        if (patientIds.Count > 0)
        {
            foreach (var chunk in patientIds.Chunk(100))
            {
                var chunkList = chunk.ToList();

                // 1. Encounter children
                var encounterIds = await dbContext.Consultations.IgnoreQueryFilters()
                    .Where(c => c.ClinicId == clinicId && chunkList.Contains(c.PatientId))
                    .Select(c => c.Id)
                    .ToListAsync(ct);

                if (encounterIds.Count > 0)
                {
                    // 1a. Headsss Domain Assessments & Adolescent Assessments
                    var headsss = await dbContext.EncounterHeadsssDomainAssessments.IgnoreQueryFilters()
                        .Where(h => h.ClinicId == clinicId && encounterIds.Contains(h.ConsultationEncounterId))
                        .ToListAsync(ct);
                    if (headsss.Count > 0) dbContext.EncounterHeadsssDomainAssessments.RemoveRange(headsss);

                    var adol = await dbContext.EncounterAdolescentAssessments.IgnoreQueryFilters()
                        .Where(a => a.ClinicId == clinicId && encounterIds.Contains(a.ConsultationEncounterId))
                        .ToListAsync(ct);
                    if (adol.Count > 0) dbContext.EncounterAdolescentAssessments.RemoveRange(adol);

                    // 1b. Pediatric Danger Signs & Milestones
                    var pMilestones = await dbContext.EncounterPediatricMilestones.IgnoreQueryFilters()
                        .Where(m => m.ClinicId == clinicId && encounterIds.Contains(m.ConsultationEncounterId))
                        .ToListAsync(ct);
                    if (pMilestones.Count > 0)
                    {
                        var mIds = pMilestones.Select(m => m.Id).ToList();
                        var dSigns = await dbContext.EncounterPediatricDangerSigns.IgnoreQueryFilters()
                            .Where(d => mIds.Contains(d.PediatricMilestoneId))
                            .ToListAsync(ct);
                        if (dSigns.Count > 0) dbContext.EncounterPediatricDangerSigns.RemoveRange(dSigns);
                        dbContext.EncounterPediatricMilestones.RemoveRange(pMilestones);
                    }

                    // 1c. ObGyne Exams
                    var obGyne = await dbContext.EncounterObGyneExams.IgnoreQueryFilters()
                        .Where(o => o.ClinicId == clinicId && encounterIds.Contains(o.ConsultationEncounterId))
                        .ToListAsync(ct);
                    if (obGyne.Count > 0) dbContext.EncounterObGyneExams.RemoveRange(obGyne);

                    // 1d. Review of Systems
                    var ros = await dbContext.EncounterReviewOfSystemsItems.IgnoreQueryFilters()
                        .Where(r => r.ClinicId == clinicId && encounterIds.Contains(r.ConsultationEncounterId))
                        .ToListAsync(ct);
                    if (ros.Count > 0) dbContext.EncounterReviewOfSystemsItems.RemoveRange(ros);

                    // 1e. Diagnoses & Prescriptions
                    var diagnoses = await dbContext.Diagnoses.IgnoreQueryFilters()
                        .Where(d => encounterIds.Contains(d.ConsultationEncounterId))
                        .ToListAsync(ct);
                    if (diagnoses.Count > 0) dbContext.Diagnoses.RemoveRange(diagnoses);

                    var prescriptions = await dbContext.Prescriptions.IgnoreQueryFilters()
                        .Where(p => encounterIds.Contains(p.ConsultationEncounterId))
                        .ToListAsync(ct);
                    if (prescriptions.Count > 0) dbContext.Prescriptions.RemoveRange(prescriptions);
                }

                // 2. Yakap Submissions & Errors (may link to encounter or patient directly)
                var yakapSubmissions = await dbContext.YakapSubmissions.IgnoreQueryFilters()
                    .Where(y => y.ClinicId == clinicId && chunkList.Contains(y.PatientId))
                    .ToListAsync(ct);
                if (yakapSubmissions.Count > 0)
                {
                    var yIds = yakapSubmissions.Select(y => y.Id).ToList();
                    var yErrors = await dbContext.YakapSubmissionErrors.IgnoreQueryFilters()
                        .Where(e => yIds.Contains(e.YakapSubmissionId))
                        .ToListAsync(ct);
                    if (yErrors.Count > 0) dbContext.YakapSubmissionErrors.RemoveRange(yErrors);
                    dbContext.YakapSubmissions.RemoveRange(yakapSubmissions);
                }

                // 3. Encounters & Medical Certificates
                var encounters = await dbContext.Consultations.IgnoreQueryFilters()
                    .Where(c => c.ClinicId == clinicId && chunkList.Contains(c.PatientId))
                    .ToListAsync(ct);
                if (encounters.Count > 0) dbContext.Consultations.RemoveRange(encounters);

                var medCerts = await dbContext.MedicalCertificates.IgnoreQueryFilters()
                    .Where(m => m.ClinicId == clinicId && chunkList.Contains(m.PatientId))
                    .ToListAsync(ct);
                if (medCerts.Count > 0) dbContext.MedicalCertificates.RemoveRange(medCerts);

                // 4. BP Monitoring Logs & Days
                var bpLogs = await dbContext.PatientBpMonitoringLogs.IgnoreQueryFilters()
                    .Where(b => b.ClinicId == clinicId && chunkList.Contains(b.PatientId))
                    .ToListAsync(ct);
                if (bpLogs.Count > 0)
                {
                    var bIds = bpLogs.Select(b => b.Id).ToList();
                    var bpDays = await dbContext.PatientBpMonitoringDays.IgnoreQueryFilters()
                        .Where(d => bIds.Contains(d.BpMonitoringLogId))
                        .ToListAsync(ct);
                    if (bpDays.Count > 0) dbContext.PatientBpMonitoringDays.RemoveRange(bpDays);
                    dbContext.PatientBpMonitoringLogs.RemoveRange(bpLogs);
                }

                // 5. Patient 1NF Demographics & Histories
                var addrs = await dbContext.PatientAddresses.IgnoreQueryFilters()
                    .Where(a => a.ClinicId == clinicId && chunkList.Contains(a.PatientId)).ToListAsync(ct);
                if (addrs.Count > 0) dbContext.PatientAddresses.RemoveRange(addrs);

                var guards = await dbContext.PatientGuardians.IgnoreQueryFilters()
                    .Where(g => g.ClinicId == clinicId && chunkList.Contains(g.PatientId)).ToListAsync(ct);
                if (guards.Count > 0) dbContext.PatientGuardians.RemoveRange(guards);

                var idVerifs = await dbContext.PatientIdentityVerifications.IgnoreQueryFilters()
                    .Where(v => v.ClinicId == clinicId && chunkList.Contains(v.PatientId)).ToListAsync(ct);
                if (idVerifs.Count > 0) dbContext.PatientIdentityVerifications.RemoveRange(idVerifs);

                var hosps = await dbContext.PatientHospitalizationHistories.IgnoreQueryFilters()
                    .Where(h => h.ClinicId == clinicId && chunkList.Contains(h.PatientId)).ToListAsync(ct);
                if (hosps.Count > 0) dbContext.PatientHospitalizationHistories.RemoveRange(hosps);

                var injs = await dbContext.PatientInjuryHistories.IgnoreQueryFilters()
                    .Where(i => i.ClinicId == clinicId && chunkList.Contains(i.PatientId)).ToListAsync(ct);
                if (injs.Count > 0) dbContext.PatientInjuryHistories.RemoveRange(injs);

                var homeMeds = await dbContext.PatientHomeMedications.IgnoreQueryFilters()
                    .Where(m => m.ClinicId == clinicId && chunkList.Contains(m.PatientId)).ToListAsync(ct);
                if (homeMeds.Count > 0) dbContext.PatientHomeMedications.RemoveRange(homeMeds);

                var sexHist = await dbContext.PatientSexualHistories.IgnoreQueryFilters()
                    .Where(s => s.ClinicId == clinicId && chunkList.Contains(s.PatientId)).ToListAsync(ct);
                if (sexHist.Count > 0) dbContext.PatientSexualHistories.RemoveRange(sexHist);

                // 6. Structured medical histories, immunizations, allergies, problems
                var pastHist = await dbContext.PatientMedicalHistories.IgnoreQueryFilters()
                    .Where(h => h.ClinicId == clinicId && chunkList.Contains(h.PatientId))
                    .ToListAsync(ct);
                if (pastHist.Count > 0) dbContext.PatientMedicalHistories.RemoveRange(pastHist);

                var famHist = await dbContext.PatientFamilyHistories.IgnoreQueryFilters()
                    .Where(h => h.ClinicId == clinicId && chunkList.Contains(h.PatientId))
                    .ToListAsync(ct);
                if (famHist.Count > 0) dbContext.PatientFamilyHistories.RemoveRange(famHist);

                var socHist = await dbContext.PatientSocialHistories.IgnoreQueryFilters()
                    .Where(h => h.ClinicId == clinicId && chunkList.Contains(h.PatientId))
                    .ToListAsync(ct);
                if (socHist.Count > 0) dbContext.PatientSocialHistories.RemoveRange(socHist);

                var surgHist = await dbContext.PatientSurgicalHistories.IgnoreQueryFilters()
                    .Where(h => h.ClinicId == clinicId && chunkList.Contains(h.PatientId))
                    .ToListAsync(ct);
                if (surgHist.Count > 0) dbContext.PatientSurgicalHistories.RemoveRange(surgHist);

                var reproHist = await dbContext.PatientReproductiveHistories.IgnoreQueryFilters()
                    .Where(h => h.ClinicId == clinicId && chunkList.Contains(h.PatientId))
                    .ToListAsync(ct);
                if (reproHist.Count > 0) dbContext.PatientReproductiveHistories.RemoveRange(reproHist);

                var examIds = await dbContext.PatientPhysicalExams.IgnoreQueryFilters()
                    .Where(h => h.ClinicId == clinicId && chunkList.Contains(h.PatientId))
                    .Select(h => h.Id)
                    .ToListAsync(ct);
                if (examIds.Count > 0)
                {
                    var findings = await dbContext.PatientPhysicalExamFindings.IgnoreQueryFilters()
                        .Where(f => examIds.Contains(f.PhysicalExamId))
                        .ToListAsync(ct);
                    if (findings.Count > 0) dbContext.PatientPhysicalExamFindings.RemoveRange(findings);
                }

                var physExam = await dbContext.PatientPhysicalExams.IgnoreQueryFilters()
                    .Where(h => h.ClinicId == clinicId && chunkList.Contains(h.PatientId))
                    .ToListAsync(ct);
                if (physExam.Count > 0) dbContext.PatientPhysicalExams.RemoveRange(physExam);

                var memberships = await dbContext.PatientPhilHealthMemberships.IgnoreQueryFilters()
                    .Where(m => m.ClinicId == clinicId && chunkList.Contains(m.PatientId))
                    .ToListAsync(ct);
                if (memberships.Count > 0) dbContext.PatientPhilHealthMemberships.RemoveRange(memberships);

                var yakap = await dbContext.PatientYakapEnlistments.IgnoreQueryFilters()
                    .Where(y => y.ClinicId == clinicId && chunkList.Contains(y.PatientId))
                    .ToListAsync(ct);
                if (yakap.Count > 0) dbContext.PatientYakapEnlistments.RemoveRange(yakap);

                var alerts = await dbContext.PatientAlerts.IgnoreQueryFilters()
                    .Where(a => a.ClinicId == clinicId && chunkList.Contains(a.PatientId))
                    .ToListAsync(ct);
                if (alerts.Count > 0) dbContext.PatientAlerts.RemoveRange(alerts);

                var allergies = await dbContext.PatientAllergies.IgnoreQueryFilters()
                    .Where(a => a.ClinicId == clinicId && chunkList.Contains(a.PatientId))
                    .ToListAsync(ct);
                if (allergies.Count > 0) dbContext.PatientAllergies.RemoveRange(allergies);

                var imms = await dbContext.PatientImmunizations.IgnoreQueryFilters()
                    .Where(i => i.ClinicId == clinicId && chunkList.Contains(i.PatientId))
                    .ToListAsync(ct);
                if (imms.Count > 0) dbContext.PatientImmunizations.RemoveRange(imms);

                var triageVitals = await dbContext.PatientVitals.IgnoreQueryFilters()
                    .Where(v => v.ClinicId == clinicId && chunkList.Contains(v.PatientId))
                    .ToListAsync(ct);
                if (triageVitals.Count > 0) dbContext.PatientVitals.RemoveRange(triageVitals);

                var queueItems = await dbContext.QueueItems.IgnoreQueryFilters()
                    .Where(q => q.ClinicId == clinicId && chunkList.Contains(q.PatientId))
                    .ToListAsync(ct);
                if (queueItems.Count > 0) dbContext.QueueItems.RemoveRange(queueItems);

                // 7. Finally delete the patients
                var patients = await dbContext.Patients.IgnoreQueryFilters()
                    .Where(p => chunkList.Contains(p.Id))
                    .ToListAsync(ct);
                if (patients.Count > 0) dbContext.Patients.RemoveRange(patients);

                await dbContext.SaveChangesAsync(ct);
                dbContext.ChangeTracker.Clear();
            }
        }

        // 8. Clean any orphaned records for this clinic if purgeAll is true
        if (purgeAll)
        {
            var orphanCerts = await dbContext.MedicalCertificates.IgnoreQueryFilters()
                .Where(m => m.ClinicId == clinicId).ToListAsync(ct);
            if (orphanCerts.Count > 0) dbContext.MedicalCertificates.RemoveRange(orphanCerts);

            var orphanConsults = await dbContext.Consultations.IgnoreQueryFilters()
                .Where(c => c.ClinicId == clinicId).ToListAsync(ct);
            if (orphanConsults.Count > 0)
            {
                var oIds = orphanConsults.Select(c => c.Id).ToList();
                var oHeadsss = await dbContext.EncounterHeadsssDomainAssessments.IgnoreQueryFilters().Where(h => oIds.Contains(h.ConsultationEncounterId)).ToListAsync(ct);
                if (oHeadsss.Count > 0) dbContext.EncounterHeadsssDomainAssessments.RemoveRange(oHeadsss);
                var oAdol = await dbContext.EncounterAdolescentAssessments.IgnoreQueryFilters().Where(a => oIds.Contains(a.ConsultationEncounterId)).ToListAsync(ct);
                if (oAdol.Count > 0) dbContext.EncounterAdolescentAssessments.RemoveRange(oAdol);
                var oMilestones = await dbContext.EncounterPediatricMilestones.IgnoreQueryFilters().Where(m => oIds.Contains(m.ConsultationEncounterId)).ToListAsync(ct);
                if (oMilestones.Count > 0)
                {
                    var mIds = oMilestones.Select(m => m.Id).ToList();
                    var oDanger = await dbContext.EncounterPediatricDangerSigns.IgnoreQueryFilters().Where(d => mIds.Contains(d.PediatricMilestoneId)).ToListAsync(ct);
                    if (oDanger.Count > 0) dbContext.EncounterPediatricDangerSigns.RemoveRange(oDanger);
                    dbContext.EncounterPediatricMilestones.RemoveRange(oMilestones);
                }
                var oObGyne = await dbContext.EncounterObGyneExams.IgnoreQueryFilters().Where(o => oIds.Contains(o.ConsultationEncounterId)).ToListAsync(ct);
                if (oObGyne.Count > 0) dbContext.EncounterObGyneExams.RemoveRange(oObGyne);
                var oRos = await dbContext.EncounterReviewOfSystemsItems.IgnoreQueryFilters().Where(r => oIds.Contains(r.ConsultationEncounterId)).ToListAsync(ct);
                if (oRos.Count > 0) dbContext.EncounterReviewOfSystemsItems.RemoveRange(oRos);
                var oDiag = await dbContext.Diagnoses.IgnoreQueryFilters().Where(d => oIds.Contains(d.ConsultationEncounterId)).ToListAsync(ct);
                if (oDiag.Count > 0) dbContext.Diagnoses.RemoveRange(oDiag);
                var oPresc = await dbContext.Prescriptions.IgnoreQueryFilters().Where(p => oIds.Contains(p.ConsultationEncounterId)).ToListAsync(ct);
                if (oPresc.Count > 0) dbContext.Prescriptions.RemoveRange(oPresc);
                dbContext.Consultations.RemoveRange(orphanConsults);
            }

            var orphanYakap = await dbContext.YakapSubmissions.IgnoreQueryFilters().Where(y => y.ClinicId == clinicId).ToListAsync(ct);
            if (orphanYakap.Count > 0)
            {
                var yIds = orphanYakap.Select(y => y.Id).ToList();
                var yErr = await dbContext.YakapSubmissionErrors.IgnoreQueryFilters().Where(e => yIds.Contains(e.YakapSubmissionId)).ToListAsync(ct);
                if (yErr.Count > 0) dbContext.YakapSubmissionErrors.RemoveRange(yErr);
                dbContext.YakapSubmissions.RemoveRange(orphanYakap);
            }

            var orphanBp = await dbContext.PatientBpMonitoringLogs.IgnoreQueryFilters().Where(b => b.ClinicId == clinicId).ToListAsync(ct);
            if (orphanBp.Count > 0)
            {
                var bIds = orphanBp.Select(b => b.Id).ToList();
                var bDays = await dbContext.PatientBpMonitoringDays.IgnoreQueryFilters().Where(d => bIds.Contains(d.BpMonitoringLogId)).ToListAsync(ct);
                if (bDays.Count > 0) dbContext.PatientBpMonitoringDays.RemoveRange(bDays);
                dbContext.PatientBpMonitoringLogs.RemoveRange(orphanBp);
            }

            var orphanAddrs = await dbContext.PatientAddresses.IgnoreQueryFilters().Where(a => a.ClinicId == clinicId).ToListAsync(ct);
            if (orphanAddrs.Count > 0) dbContext.PatientAddresses.RemoveRange(orphanAddrs);

            var orphanGuards = await dbContext.PatientGuardians.IgnoreQueryFilters().Where(g => g.ClinicId == clinicId).ToListAsync(ct);
            if (orphanGuards.Count > 0) dbContext.PatientGuardians.RemoveRange(orphanGuards);

            var orphanVerifs = await dbContext.PatientIdentityVerifications.IgnoreQueryFilters().Where(v => v.ClinicId == clinicId).ToListAsync(ct);
            if (orphanVerifs.Count > 0) dbContext.PatientIdentityVerifications.RemoveRange(orphanVerifs);

            var orphanHosps = await dbContext.PatientHospitalizationHistories.IgnoreQueryFilters().Where(h => h.ClinicId == clinicId).ToListAsync(ct);
            if (orphanHosps.Count > 0) dbContext.PatientHospitalizationHistories.RemoveRange(orphanHosps);

            var orphanInjs = await dbContext.PatientInjuryHistories.IgnoreQueryFilters().Where(i => i.ClinicId == clinicId).ToListAsync(ct);
            if (orphanInjs.Count > 0) dbContext.PatientInjuryHistories.RemoveRange(orphanInjs);

            var orphanHomeMeds = await dbContext.PatientHomeMedications.IgnoreQueryFilters().Where(m => m.ClinicId == clinicId).ToListAsync(ct);
            if (orphanHomeMeds.Count > 0) dbContext.PatientHomeMedications.RemoveRange(orphanHomeMeds);

            var orphanSexHist = await dbContext.PatientSexualHistories.IgnoreQueryFilters().Where(s => s.ClinicId == clinicId).ToListAsync(ct);
            if (orphanSexHist.Count > 0) dbContext.PatientSexualHistories.RemoveRange(orphanSexHist);

            var orphanImms = await dbContext.PatientImmunizations.IgnoreQueryFilters().Where(i => i.ClinicId == clinicId).ToListAsync(ct);
            if (orphanImms.Count > 0) dbContext.PatientImmunizations.RemoveRange(orphanImms);

            var orphanProbs = await dbContext.PatientMedicalHistories.IgnoreQueryFilters().Where(p => p.ClinicId == clinicId).ToListAsync(ct);
            if (orphanProbs.Count > 0) dbContext.PatientMedicalHistories.RemoveRange(orphanProbs);

            var orphanAllergies = await dbContext.PatientAllergies.IgnoreQueryFilters().Where(a => a.ClinicId == clinicId).ToListAsync(ct);
            if (orphanAllergies.Count > 0) dbContext.PatientAllergies.RemoveRange(orphanAllergies);

            await dbContext.SaveChangesAsync(ct);
            dbContext.ChangeTracker.Clear();
        }

        // 6. Reset or synchronize sequence tracker
        var year = DateTime.UtcNow.Year;
        var prefix = $"PAT-{year}-";
        var remainingMaxSeq = 0;
        var remainingCodes = await dbContext.Patients.IgnoreQueryFilters()
            .Where(p => p.ClinicId == clinicId && p.PatientCode.StartsWith(prefix))
            .Select(p => p.PatientCode)
            .ToListAsync(ct);

        foreach (var code in remainingCodes)
        {
            if (code.Length > prefix.Length && int.TryParse(code[prefix.Length..], out var s) && s > remainingMaxSeq)
                remainingMaxSeq = s;
        }

        var tracker = await dbContext.PatientCodeSequenceTrackers.IgnoreQueryFilters()
            .FirstOrDefaultAsync(t => t.ClinicId == clinicId && (tenantId == null || t.TenantId == tenantId) && t.Year == year, ct);
        if (tracker != null)
        {
            tracker.CurrentSequence = remainingMaxSeq;
            tracker.LastAssignedAt = DateTime.UtcNow;
            await dbContext.SaveChangesAsync(ct);
        }

        return patientIds.Count;
    }
}
