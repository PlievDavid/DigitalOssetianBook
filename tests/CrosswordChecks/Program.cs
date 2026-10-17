using IronLanguage.Db;
using IronLanguage.Web.Services;
using Microsoft.AspNetCore.Hosting;
using Microsoft.Extensions.FileProviders;
using Microsoft.VisualBasic.FileIO;
using System.Text;
using System.Text.Json;
using Microsoft.EntityFrameworkCore;

var directory = new DirectoryInfo(AppContext.BaseDirectory);
while (directory is not null && !File.Exists(Path.Combine(directory.FullName, "IronLanguage.slnx"))) directory = directory.Parent;
var root = directory?.FullName ?? throw new Exception("Run checks from the project workspace.");
var environment = new TestEnvironment { ContentRootPath = Path.Combine(root, "IronLanguage.Web") };
var catalog = new CrosswordCatalog(environment);
var repository = new MemoryRepository();
var service = new CrosswordService(catalog, repository);
void Require(bool condition, string message) { if (!condition) throw new Exception(message); }
using var parser = new TextFieldParser(Path.Combine(environment.ContentRootPath, "Data/ossetian-russian-dictionary.csv"), Encoding.UTF8);
parser.SetDelimiters(","); parser.HasFieldsEnclosedInQuotes = true;
var rows = new List<string[]>();
while (!parser.EndOfData) rows.Add(parser.ReadFields()!);
using var source = JsonDocument.Parse(File.ReadAllText(Path.Combine(environment.ContentRootPath, "Data/crosswords/levels.json")));
foreach (var level in source.RootElement.EnumerateArray()) foreach (var word in level.GetProperty("words").EnumerateArray())
{
    var row = rows[word.GetProperty("sourceRow").GetInt32() - 1];
    Require(DictionaryService.Key(row[word.GetProperty("sourceColumn").GetInt32()]) == word.GetProperty("answer").GetString(), "Dictionary provenance");
    Require(DictionaryService.Key(row[0].Split(',')[0]) == word.GetProperty("clue").GetString()!.ToLowerInvariant().Replace(" (грецкий)", ""), "Clue provenance");
}
Require(catalog.Current.Count() == 10, "Ten levels");
var fixtureRoot = Path.Combine(Path.GetTempPath(), $"adam-crossword-catalog-{Guid.NewGuid():N}");
var fixtureData = Path.Combine(fixtureRoot, "Data", "crosswords");
Directory.CreateDirectory(fixtureData);
try
{
    var level = catalog.Current.First();
    var fixturePath = Path.Combine(fixtureData, "levels.json");
    var fixtureEnvironment = new TestEnvironment { ContentRootPath = fixtureRoot };
    File.WriteAllText(fixturePath, JsonSerializer.Serialize(new[] { level, level }));
    try
    {
        _ = new CrosswordCatalog(fixtureEnvironment);
        throw new Exception("Duplicate level/version must fail while loading the catalog");
    }
    catch (InvalidOperationException error)
    {
        Require(error.Message.Contains("levels.json") && error.Message.Contains($"ID {level.Id}") && error.Message.Contains($"версией {level.Version}"), "Duplicate error identifies the source, ID and version");
    }
    var nextVersion = level with { Version = level.Version + 1 };
    File.WriteAllText(fixturePath, JsonSerializer.Serialize(new[] { level, nextVersion }));
    var versionedCatalog = new CrosswordCatalog(fixtureEnvironment);
    Require(versionedCatalog.Current.Single().Version == nextVersion.Version, "Different versions are valid and the latest is current");
    Require(versionedCatalog.Find(level.Id, level.Version) is not null, "Older versions remain available");
}
finally { Directory.Delete(fixtureRoot, true); }
foreach (var level in catalog.Current)
{
    var grid = new Dictionary<string, string?>();
    var owners = new Dictionary<string, List<int>>();
    foreach (var w in level.Words)
    {
        Require(w.Answer.All(c => char.IsLetter(c)) && w.Answer.Length > 1, "Only letters");
        for (var i = 0; i < w.Answer.Length; i++)
        {
            var r = w.Row + (w.Down ? i : 0); var c = w.Column + (w.Down ? 0 : i); var key = $"{r},{c}";
            Require(r >= 0 && r < level.Rows && c >= 0 && c < level.Columns, "Inside grid");
            Require(!grid.ContainsKey(key) || grid[key] == w.Answer[i].ToString(), "Matching intersections");
            grid[key] = w.Answer[i].ToString();
            if (!owners.ContainsKey(key)) owners[key] = [];
            owners[key].Add(w.Id);
        }
    }
    var connected = new HashSet<int> { level.Words[0].Id };
    for (var i = 0; i < level.Words.Length; i++) foreach (var group in owners.Values)
        if (group.Any(connected.Contains)) connected.UnionWith(group);
    Require(connected.Count == level.Words.Length, "Connected crossword");
    // No accidental adjacent letter runs that are not a declared word.
    foreach (var entry in owners)
    {
        var xy = entry.Key.Split(',').Select(int.Parse).ToArray();
        foreach (var delta in new[] { (1, 0), (0, 1) })
            if (owners.TryGetValue($"{xy[0] + delta.Item1},{xy[1] + delta.Item2}", out var adjacent))
                Require(entry.Value.Intersect(adjacent).Any(), "No touching unrelated words");
    }
    var blank = JsonSerializer.SerializeToElement(await service.Open(null, level.Id, level.Version, default));
    Require(blank.GetProperty("words").EnumerateArray().All(x => x.GetProperty("answer").ValueKind == JsonValueKind.Null), "No answer leaks");
    var empty = JsonSerializer.SerializeToElement(await service.Check(null, level.Id, level.Version, [], default));
    Require(empty.GetProperty("stars").GetInt32() == 0, "Empty has zero stars");
    var result = JsonSerializer.SerializeToElement(await service.Check(null, level.Id, level.Version, grid, default));
    Require(result.GetProperty("stars").GetInt32() == 3, "Complete has three stars");
    // Normalization of uppercase and Latin æ is accepted.
    var uppercase = grid.ToDictionary(x => x.Key, x => (string?)x.Value!.ToUpperInvariant().Replace('Ӕ', 'Æ'));
    result = JsonSerializer.SerializeToElement(await service.Check(null, level.Id, level.Version, uppercase, default));
    Require(result.GetProperty("stars").GetInt32() == 3, "Ossetian normalization");
    Require(repository.Saves == 0, "Guests do not save");
}
Require(CrosswordService.Stars(1, 4) == 1 && CrosswordService.Stars(2, 4) == 2 && CrosswordService.Stars(3, 5) == 2 && CrosswordService.Stars(2, 5) == 1, "Star thresholds");
var first = catalog.Current.First(); var userA = Guid.NewGuid(); var userB = Guid.NewGuid();
var one = first.Words[0]; var partial = Enumerable.Range(0, one.Answer.Length).ToDictionary(i => $"{one.Row + (one.Down ? i : 0)},{one.Column + (one.Down ? 0 : i)}", i => (string?)one.Answer[i].ToString());
await service.Check(userA, first.Id, first.Version, partial, default);
await service.Check(userA, first.Id, first.Version, partial, default);
await service.Check(userA, first.Id, first.Version, [], default);
Require(repository.Items.Count == 1, "Repeat and empty checks preserve progress without duplicates");
var resumed = JsonSerializer.SerializeToElement(await service.Open(userA, first.Id, first.Version, default));
Require(resumed.GetProperty("words").EnumerateArray().Count(x => x.GetProperty("solved").GetBoolean()) == 1, "Resume saved word");
var other = JsonSerializer.SerializeToElement(await service.Open(userB, first.Id, first.Version, default));
Require(other.GetProperty("words").EnumerateArray().All(x => !x.GetProperty("solved").GetBoolean()), "Account isolation");
Require(await service.Open(userA, first.Id, 999, default) is null, "Unknown version");
Require(await service.Check(null, 999, 1, [], default) is null, "Unknown level");
try { await service.Check(null, 1, 1, new() { ["0,0"] = "слишком длинно" }, default); throw new Exception("Missing validation"); }
catch (ArgumentException) { }
Console.WriteLine("Crossword checks passed: dictionary sources, all 10 grids, normalization, stars, guest checks, resume, retries, user isolation and versions.");

if (args.Contains("--database"))
{
    var connection = Environment.GetEnvironmentVariable("ConnectionStrings__Adam") ?? throw new Exception("Load .run-local/connection.ps1 first.");
    var options = new DbContextOptionsBuilder<AdamDbContext>().UseNpgsql(connection).Options;
    await using var db = new AdamDbContext(options);
    Require(!db.Database.HasPendingModelChanges(), "Migration snapshot matches model");
    Require(!(await db.Database.GetPendingMigrationsAsync()).Any(), "Migration applied");
    var ids = new[] { Guid.NewGuid(), Guid.NewGuid() };
    try
    {
        db.Users.AddRange(ids.Select(id => new UserAccount { Id = id, Email = $"crossword-check-{id:N}@example.invalid" }));
        await db.SaveChangesAsync();
        var realService = new CrosswordService(catalog, new EfCrosswordRepository(db));
        await realService.Check(ids[0], first.Id, first.Version, partial, default);
        await realService.Check(ids[0], first.Id, first.Version, partial, default);
        await using var concurrentA = new AdamDbContext(options);
        await using var concurrentB = new AdamDbContext(options);
        await Task.WhenAll(new EfCrosswordRepository(concurrentA).Save(ids[0], 1, 1, [one.Id], default), new EfCrosswordRepository(concurrentB).Save(ids[0], 1, 1, [one.Id], default));
        Require(await db.CrosswordSolvedWords.CountAsync(x => x.UserId == ids[0]) == 1, "Database retries are idempotent");
        Require(await db.CrosswordSolvedWords.CountAsync(x => x.UserId == ids[1]) == 0, "Database account isolation");
        var opened = JsonSerializer.SerializeToElement(await realService.Open(ids[0], 1, 1, default));
        Require(opened.GetProperty("words").EnumerateArray().Count(x => x.GetProperty("solved").GetBoolean()) == 1, "Database resume");
        await realService.Check(null, 1, 1, partial, default);
        Require(await db.CrosswordSolvedWords.CountAsync(x => ids.Contains(x.UserId)) == 1, "Guests do not write to database");
        Console.WriteLine("PostgreSQL checks passed: migration snapshot, saved progress, concurrent retries, guest no-write and account isolation.");
    }
    finally { await db.Users.Where(x => ids.Contains(x.Id)).ExecuteDeleteAsync(); }
}

sealed class MemoryRepository : ICrosswordRepository
{
    public List<CrosswordSolvedWord> Items { get; } = [];
    public int Saves { get; private set; }
    public Task<List<CrosswordSolvedWord>> Solved(Guid userId, CancellationToken ct) => Task.FromResult(Items.Where(x => x.UserId == userId).ToList());
    public Task Save(Guid userId, int levelId, int version, IEnumerable<int> ids, CancellationToken ct)
    {
        Saves++;
        foreach (var id in ids) if (!Items.Any(x => x.UserId == userId && x.LevelId == levelId && x.Version == version && x.WordId == id))
            Items.Add(new() { UserId = userId, LevelId = levelId, Version = version, WordId = id });
        return Task.CompletedTask;
    }
}
sealed class TestEnvironment : IWebHostEnvironment
{
    public string ApplicationName { get; set; } = "CrosswordChecks";
    public string EnvironmentName { get; set; } = "Development";
    public string ContentRootPath { get; set; } = "";
    public string WebRootPath { get; set; } = "";
    public IFileProvider WebRootFileProvider { get; set; } = new NullFileProvider();
    public IFileProvider ContentRootFileProvider { get; set; } = new NullFileProvider();
}
