using System.Text.Json;
using IronLanguage.Db;

namespace IronLanguage.Web.Services;

public sealed record CrosswordWord(int Id, int Number, string Clue, string Answer, int Row, int Column, bool Down);
public sealed record CrosswordLevel(int Id, int Version, string Title, int Rows, int Columns, CrosswordWord[] Words);

public sealed class CrosswordCatalog
{
    private readonly CrosswordLevel[] levels;
    public CrosswordCatalog(IWebHostEnvironment environment)
    {
        var json = File.ReadAllText(Path.Combine(environment.ContentRootPath, "Data", "crosswords", "levels.json"));
        levels = JsonSerializer.Deserialize<CrosswordLevel[]>(json, new JsonSerializerOptions(JsonSerializerDefaults.Web))
            ?? throw new InvalidOperationException("Не удалось прочитать кроссворды.");
        var duplicate = levels.GroupBy(level => (level.Id, level.Version)).FirstOrDefault(group => group.Count() > 1);
        if (duplicate is not null)
            throw new InvalidOperationException($"В levels.json повторяется кроссворд с ID {duplicate.Key.Id} и версией {duplicate.Key.Version}.");
    }
    public IEnumerable<CrosswordLevel> Current => levels.GroupBy(x => x.Id).Select(g => g.MaxBy(x => x.Version)!);
    public CrosswordLevel? Find(int id, int version) => levels.SingleOrDefault(x => x.Id == id && x.Version == version);
}

public sealed class CrosswordService(CrosswordCatalog catalog, ICrosswordRepository repository)
{
    public static int Stars(int solved, int total) => solved == 0 ? 0 : solved == total ? 3 : solved * 2 >= total ? 2 : 1;

    public async Task<object[]> Levels(Guid? userId, CancellationToken ct)
    {
        var saved = userId is Guid uid ? await repository.Solved(uid, ct) : [];
        return catalog.Current.OrderBy(x => x.Id).Select(level =>
        {
            var count = saved.Count(s => s.LevelId == level.Id && s.Version == level.Version && level.Words.Any(w => w.Id == s.WordId));
            return (object)new { level.Id, level.Version, level.Title, total = level.Words.Length, solved = count, stars = Stars(count, level.Words.Length) };
        }).ToArray();
    }

    public async Task<object?> Open(Guid? userId, int id, int version, CancellationToken ct)
    {
        var level = catalog.Find(id, version);
        if (level is null) return null;
        var saved = userId is Guid uid ? await repository.Solved(uid, ct) : [];
        var solved = saved.Where(x => x.LevelId == id && x.Version == version).Select(x => x.WordId).ToHashSet();
        return new { level.Id, level.Version, level.Title, level.Rows, level.Columns,
            words = level.Words.Select(w => new { w.Id, w.Number, w.Clue, w.Row, w.Column, w.Down, length = w.Answer.Length,
                solved = solved.Contains(w.Id), answer = solved.Contains(w.Id) ? w.Answer : null }) };
    }

    public async Task<object?> Check(Guid? userId, int id, int version, Dictionary<string, string?> cells, CancellationToken ct)
    {
        var level = catalog.Find(id, version);
        if (level is null) return null;
        if (cells.Count > level.Rows * level.Columns || cells.Any(x => x.Value?.Length > 4))
            throw new ArgumentException("Некорректное поле кроссворда.");
        var correct = level.Words.Where(w => Enumerable.Range(0, w.Answer.Length).All(i =>
            DictionaryService.Key(cells.GetValueOrDefault($"{w.Row + (w.Down ? i : 0)},{w.Column + (w.Down ? 0 : i)}") ?? "") == w.Answer[i].ToString())).Select(w => w.Id).ToHashSet();
        if (userId is Guid uid)
        {
            await repository.Save(uid, id, version, correct, ct);
            var saved = await repository.Solved(uid, ct);
            correct.UnionWith(saved.Where(x => x.LevelId == id && x.Version == version).Select(x => x.WordId));
        }
        var solved = level.Words.Where(w => correct.Contains(w.Id)).ToArray();
        return new { solved = solved.Select(w => new { w.Id, w.Answer }), stars = Stars(solved.Length, level.Words.Length), total = level.Words.Length };
    }
}
