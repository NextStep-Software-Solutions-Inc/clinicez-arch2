using ClinicEz.Clinic.Domain.Entities;
using ClinicEz.Clinic.Domain.Interfaces;
using ClinicEz.Clinic.Infrastructure.PhilHealth.Catalog;
using FluentAssertions;
using Microsoft.EntityFrameworkCore;
using Microsoft.Extensions.Logging.Abstractions;
using NSubstitute;

namespace ClinicEz.Clinic.Application.Tests;

public class PhilHealthCatalogTests
{
    private static string SourceDirectory => Path.Combine(AppContext.BaseDirectory, "PhilHealthSource");

    private static (Infrastructure.Persistence.ApplicationDbContext Db, PhilHealthCatalogImportService Import, PhilHealthCatalogQueryService Query) Create()
    {
        var clinic = Substitute.For<IClinicContext>();
        clinic.ClinicId.Returns(Guid.Empty);
        var (db, _, _) = TestDbHelper.CreateTestContext(clinic);
        return (db, new PhilHealthCatalogImportService(db, NullLogger<PhilHealthCatalogImportService>.Instance), new PhilHealthCatalogQueryService(db));
    }

    private static PhilHealthCatalogFile Small(string version = "1.0", params (string Code, string Description, bool Active)[] rows) =>
        new("lib_test", version, rows.Select(r => new PhilHealthCatalogEntry(r.Code, r.Description, r.Active)).ToList());

    // ---- bundled seed -----------------------------------------------------------------------------------------

    [Fact]
    public void All_28_official_libraries_are_bundled()
    {
        var libraries = PhilHealthCatalogEmbeddedSeed.ReadAll().Select(f => f.Library).ToList();

        libraries.Should().HaveCount(28);
        libraries.Should().OnlyHaveUniqueItems();
        libraries.Should().Contain(new[] { "lib_icd", "lib_medicine", "lib_mdiseases", "lib_signs_symptoms", "lib_diagnostic", "lib_zscore" });
    }

    [Fact]
    public void Bundled_seed_is_valid_and_has_unique_keys()
    {
        foreach (var file in PhilHealthCatalogEmbeddedSeed.ReadAll())
        {
            PhilHealthCatalogKeys.IsValidLibraryName(file.Library).Should().BeTrue(file.Library);
            file.KitVersion.Should().Be("1.1", file.Library);
            file.Items.Should().NotBeEmpty(file.Library);

            var keys = file.Items.Select(i => PhilHealthCatalogKeys.ItemKey(file.Library, i.Code, i.Description)).ToList();
            keys.Should().OnlyHaveUniqueItems($"{file.Library} must have unique identities");
            file.Items.Should().OnlyContain(i => i.Code.Length > 0 && i.Code.Length <= PhilHealthCatalogKeys.MaxCodeLength, file.Library);
        }
    }

    [Fact]
    public void Seed_json_is_equivalent_to_the_official_xlsx()
    {
        Directory.Exists(SourceDirectory).Should().BeTrue("the official xlsx files are copied next to the tests");

        var seed = PhilHealthCatalogEmbeddedSeed.ReadAll().ToDictionary(f => f.Library);
        var workbooks = Directory.GetFiles(SourceDirectory, "lib_*.xlsx").OrderBy(f => f, StringComparer.Ordinal).ToList();
        workbooks.Should().HaveCount(28);

        foreach (var path in workbooks)
        {
            var library = PhilHealthCatalogXlsxReader.LibraryFromFileName(path)!;
            using var stream = File.OpenRead(path);
            var fromXlsx = PhilHealthCatalogXlsxReader.Read(stream, library, "1.1");
            var (xlsxItems, _) = PhilHealthCatalogKeys.Dedupe(library, fromXlsx.Items);

            seed.Should().ContainKey(library);
            var json = seed[library].Items;

            json.Count.Should().Be(xlsxItems.Count, library);
            for (var i = 0; i < json.Count; i++)
            {
                json[i].Code.Should().Be(xlsxItems[i].Code, $"{library} row {i}");
                json[i].Description.Should().Be(xlsxItems[i].Description, $"{library} row {i}");
                json[i].IsActive.Should().Be(xlsxItems[i].IsActive, $"{library} row {i}");
                PhilHealthCatalogKeys.AttributesJson(json[i].Attributes).Should()
                    .Be(PhilHealthCatalogKeys.AttributesJson(xlsxItems[i].Attributes), $"{library} row {i}");
            }
        }
    }

    [Fact]
    public void Known_official_codes_are_present()
    {
        var seed = PhilHealthCatalogEmbeddedSeed.ReadAll().ToDictionary(f => f.Library);

        seed["lib_mdiseases"].Items.Should().Contain(i => i.Code == "011" && i.Description == "Hypertension");
        seed["lib_mdiseases"].Items.Should().Contain(i => i.Code == "017" && i.Description == "Urinary Tract Infection");
        seed["lib_signs_symptoms"].Items.Should().Contain(i => i.Code == "37" && i.Description == "FEVER");
        seed["lib_icd"].Items.Should().Contain(i => i.Code == "E50.9");
        seed["lib_medicine"].Items.Should().Contain(i => i.Code == "ZOLPI0000000069TAB490000000000" && i.Attributes!["genCode"] == "ZOLPI");
    }

    // ---- idempotent import ------------------------------------------------------------------------------------

    [Fact]
    public async Task Importing_the_same_file_twice_changes_nothing_the_second_time()
    {
        var (db, import, _) = Create();
        var file = Small("1.0", ("1", "One", true), ("2", "Two", true));

        var first = await import.ImportAsync(file, PhilHealthCatalogImportSource.Upload, "admin");
        var second = await import.ImportAsync(file, PhilHealthCatalogImportSource.Upload, "admin");

        first.Status.Should().Be(PhilHealthCatalogImportStatus.Applied);
        first.Added.Should().Be(2);
        second.Status.Should().Be(PhilHealthCatalogImportStatus.Unchanged);
        second.Added.Should().Be(0);
        (await db.PhilHealthCatalogItems.CountAsync()).Should().Be(2);
    }

    [Fact]
    public async Task Seeding_on_every_boot_is_a_no_op_once_loaded()
    {
        var (db, import, _) = Create();
        var file = PhilHealthCatalogEmbeddedSeed.ReadAll().First(f => f.Library == "lib_mdiseases");

        var first = await import.ImportAsync(file, PhilHealthCatalogImportSource.Seed, PhilHealthCatalogSeedHostedService.SystemActor);
        var logsAfterFirst = await db.PhilHealthCatalogImportLogs.CountAsync();
        var second = await import.ImportAsync(file, PhilHealthCatalogImportSource.Seed, PhilHealthCatalogSeedHostedService.SystemActor);

        first.Status.Should().Be(PhilHealthCatalogImportStatus.Applied);
        first.Added.Should().Be(file.Items.Count);
        second.Status.Should().Be(PhilHealthCatalogImportStatus.Unchanged);
        (await db.PhilHealthCatalogImportLogs.CountAsync()).Should().Be(logsAfterFirst, "boot no-ops are not logged");
        (await db.PhilHealthCatalogItems.CountAsync(i => i.Library == "lib_mdiseases")).Should().Be(file.Items.Count);
    }

    [Fact]
    public async Task Changed_rows_are_updated_and_missing_rows_are_deactivated_never_deleted()
    {
        var (db, import, _) = Create();
        await import.ImportAsync(Small("1.0", ("1", "One", true), ("2", "Two", true), ("3", "Three", true)), PhilHealthCatalogImportSource.Upload, "admin");

        var result = await import.ImportAsync(
            Small("1.1", ("1", "One (revised)", true), ("2", "Two", true), ("4", "Four", true)),
            PhilHealthCatalogImportSource.Upload,
            "admin");

        result.Updated.Should().Be(1);
        result.Unchanged.Should().Be(1);
        result.Added.Should().Be(1);
        result.Deactivated.Should().Be(1);

        var rows = await db.PhilHealthCatalogItems.ToListAsync();
        rows.Should().HaveCount(4);
        rows.Single(r => r.Code == "1").Description.Should().Be("One (revised)");
        rows.Single(r => r.Code == "3").IsActive.Should().BeFalse();
        rows.Single(r => r.Code == "4").KitVersion.Should().Be("1.1");
    }

    [Fact]
    public async Task An_older_kit_version_is_rejected_for_uploads_and_skipped_for_the_seed()
    {
        var (db, import, _) = Create();
        await import.ImportAsync(Small("1.2", ("1", "One", true)), PhilHealthCatalogImportSource.Upload, "admin");

        var upload = await import.ImportAsync(Small("1.1", ("1", "Old", true)), PhilHealthCatalogImportSource.Upload, "admin");
        var seed = await import.ImportAsync(Small("1.1", ("1", "Old", true)), PhilHealthCatalogImportSource.Seed, "system:seed");

        upload.Status.Should().Be(PhilHealthCatalogImportStatus.Rejected);
        seed.Status.Should().Be(PhilHealthCatalogImportStatus.Skipped);
        (await db.PhilHealthCatalogItems.SingleAsync()).Description.Should().Be("One");
    }

    [Fact]
    public async Task The_bundled_seed_never_overwrites_a_newer_or_equal_administrator_upload()
    {
        var (db, import, _) = Create();
        await import.ImportAsync(Small("1.1", ("1", "Uploaded", true)), PhilHealthCatalogImportSource.Upload, "admin");

        var sameVersionSeed = await import.ImportAsync(Small("1.1", ("1", "Bundled", true)), PhilHealthCatalogImportSource.Seed, "system:seed");
        var newerSeed = await import.ImportAsync(Small("1.3", ("1", "Bundled 1.3", true)), PhilHealthCatalogImportSource.Seed, "system:seed");

        sameVersionSeed.Status.Should().Be(PhilHealthCatalogImportStatus.Skipped);
        newerSeed.Status.Should().Be(PhilHealthCatalogImportStatus.Applied);
        (await db.PhilHealthCatalogItems.SingleAsync()).Description.Should().Be("Bundled 1.3");
    }

    [Fact]
    public async Task Version_comparison_is_numeric_not_alphabetical()
    {
        var (_, import, _) = Create();
        await import.ImportAsync(Small("1.9", ("1", "One", true)), PhilHealthCatalogImportSource.Upload, "admin");

        var newer = await import.ImportAsync(Small("1.10", ("1", "One v110", true)), PhilHealthCatalogImportSource.Upload, "admin");

        newer.Status.Should().Be(PhilHealthCatalogImportStatus.Applied);
    }

    [Fact]
    public async Task Dry_run_reports_counts_without_writing()
    {
        var (db, import, _) = Create();

        var result = await import.ImportAsync(Small("1.0", ("1", "One", true), ("2", "Two", true)), PhilHealthCatalogImportSource.Upload, "admin", dryRun: true);

        result.Status.Should().Be(PhilHealthCatalogImportStatus.DryRun);
        result.Added.Should().Be(2);
        (await db.PhilHealthCatalogItems.CountAsync()).Should().Be(0);
        (await db.PhilHealthCatalogImportLogs.CountAsync()).Should().Be(0);
    }

    [Fact]
    public async Task Invalid_input_is_rejected_before_anything_changes()
    {
        var (db, import, _) = Create();

        Func<Task> badLibrary = () => import.ImportAsync(new PhilHealthCatalogFile("ICD; DROP", "1.0", [new("1", "x")]), PhilHealthCatalogImportSource.Upload, "a");
        Func<Task> empty = () => import.ImportAsync(Small("1.0"), PhilHealthCatalogImportSource.Upload, "a");
        Func<Task> noVersion = () => import.ImportAsync(new PhilHealthCatalogFile("lib_test", " ", [new("1", "x")]), PhilHealthCatalogImportSource.Upload, "a");
        Func<Task> blankCode = () => import.ImportAsync(new PhilHealthCatalogFile("lib_test", "1.0", [new(" ", "x")]), PhilHealthCatalogImportSource.Upload, "a");

        await badLibrary.Should().ThrowAsync<PhilHealthCatalogValidationException>();
        await empty.Should().ThrowAsync<PhilHealthCatalogValidationException>();
        await noVersion.Should().ThrowAsync<PhilHealthCatalogValidationException>();
        await blankCode.Should().ThrowAsync<PhilHealthCatalogValidationException>();
        (await db.PhilHealthCatalogItems.CountAsync()).Should().Be(0);
    }

    [Fact]
    public async Task Libraries_that_list_several_terms_per_code_keep_all_of_them()
    {
        var (db, import, _) = Create();
        var file = new PhilHealthCatalogFile("lib_icd", "1.1",
        [
            new("E50.9", "Vitamin A deficiency, unspecified"),
            new("E50.9", "Vitamin A deficiency"),
            new("E50.9", "VITAMIN A DEFICIENCY"), // same term, different case: identical identity
        ]);

        var result = await import.ImportAsync(file, PhilHealthCatalogImportSource.Upload, "admin");

        result.Added.Should().Be(2);
        result.DuplicatesIgnored.Should().Be(1);
        (await db.PhilHealthCatalogItems.CountAsync()).Should().Be(2);
    }

    [Fact]
    public async Task The_full_bundled_catalog_loads_and_a_second_load_is_a_no_op()
    {
        var (db, import, query) = Create();
        var files = PhilHealthCatalogEmbeddedSeed.ReadAll().ToList();

        foreach (var file in files) await import.ImportAsync(file, PhilHealthCatalogImportSource.Seed, "system:seed");
        var itemsAfterFirst = await db.PhilHealthCatalogItems.CountAsync();
        foreach (var file in files)
        {
            var again = await import.ImportAsync(file, PhilHealthCatalogImportSource.Seed, "system:seed");
            again.Status.Should().Be(PhilHealthCatalogImportStatus.Unchanged, file.Library);
        }

        itemsAfterFirst.Should().Be(files.Sum(f => PhilHealthCatalogKeys.Dedupe(f.Library, f.Items).Items.Count));
        (await db.PhilHealthCatalogItems.CountAsync()).Should().Be(itemsAfterFirst);
        (await query.GetLibrariesAsync()).Should().HaveCount(28);
    }

    // ---- queries ----------------------------------------------------------------------------------------------

    [Fact]
    public async Task Queries_filter_by_text_and_hide_deactivated_rows_by_default()
    {
        var (_, import, query) = Create();
        await import.ImportAsync(
            Small("1.1", ("1", "Flat", true), ("2", "Distended abdomen", true), ("3", "Hyperactive bowel sounds", false)),
            PhilHealthCatalogImportSource.Upload,
            "admin");

        var active = await query.GetItemsAsync("lib_test", null, activeOnly: true, 0, 50);
        var all = await query.GetItemsAsync("lib_test", null, activeOnly: false, 0, 50);
        var search = await query.GetItemsAsync("lib_test", "DISTENDED", activeOnly: true, 0, 50);

        active!.Total.Should().Be(2);
        all!.Total.Should().Be(3);
        search!.Items.Should().ContainSingle().Which.Code.Should().Be("2");
        active.KitVersion.Should().Be("1.1");
        (await query.GetItemsAsync("lib_missing", null, true, 0, 10)).Should().BeNull();
        (await query.GetItemsAsync("not a library", null, true, 0, 10)).Should().BeNull();
    }

    [Fact]
    public async Task Paging_is_stable_and_bounded()
    {
        var (_, import, query) = Create();
        await import.ImportAsync(
            Small("1.0", Enumerable.Range(1, 30).Select(n => (n.ToString("000"), $"Item {n}", true)).ToArray()),
            PhilHealthCatalogImportSource.Upload,
            "admin");

        var page1 = await query.GetItemsAsync("lib_test", null, true, 0, 10);
        var page2 = await query.GetItemsAsync("lib_test", null, true, 10, 10);
        var huge = await query.GetItemsAsync("lib_test", null, true, 0, int.MaxValue);

        page1!.Items.Select(i => i.Code).Should().Equal(Enumerable.Range(1, 10).Select(n => n.ToString("000")));
        page2!.Items.First().Code.Should().Be("011");
        huge!.Take.Should().Be(PhilHealthCatalogQueryService.MaxPageSize);
    }

    [Fact]
    public async Task Attributes_round_trip()
    {
        var (_, import, query) = Create();
        var file = new PhilHealthCatalogFile("lib_test", "1.0",
        [
            new("A", "With attributes", true, new Dictionary<string, string> { ["formCode"] = "TAB49", ["genCode"] = "ZOLPI" }),
        ]);
        await import.ImportAsync(file, PhilHealthCatalogImportSource.Upload, "admin");

        var page = await query.GetItemsAsync("lib_test", null, true, 0, 10);

        page!.Items.Single().Attributes.Should().BeEquivalentTo(new Dictionary<string, string> { ["formCode"] = "TAB49", ["genCode"] = "ZOLPI" });
    }

    [Fact]
    public void Json_uploads_are_parsed_and_malformed_json_is_a_validation_error()
    {
        using var good = new MemoryStream("""{"library":"lib_x","kitVersion":"2.0","items":[{"code":" 1 ","description":" One ","isActive":false}]}"""u8.ToArray());
        var parsed = PhilHealthCatalogEmbeddedSeed.Parse(good);
        parsed.Library.Should().Be("lib_x");
        parsed.Items.Single().Should().Be(new PhilHealthCatalogEntry("1", "One", false));

        using var bad = new MemoryStream("{ not json"u8.ToArray());
        Action act = () => PhilHealthCatalogEmbeddedSeed.Parse(bad);
        act.Should().Throw<PhilHealthCatalogValidationException>();
    }

    [Fact]
    public void Permission_is_registered_for_administrators()
    {
        ClinicEz.Clinic.Domain.Constants.ClinicPermissions.All.Should().Contain("philhealth.catalog.import");
    }
}
