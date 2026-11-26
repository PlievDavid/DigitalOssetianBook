using Microsoft.EntityFrameworkCore;
using System.Text.Json;

namespace IronLanguage.Db;

public sealed class CourseMaterialAccess
{
    public required string Kind { get; set; }
    public Guid MaterialId { get; set; }
    public Guid? OwnerId { get; set; }
    public bool InCatalog { get; set; }
    public bool Shared { get; set; }
    public bool Blocked { get; set; }
}

internal sealed class CourseMaterialItem
{
    public Guid Id { get; init; }
    public required string Kind { get; init; }
    public required string Title { get; init; }
    public string? ScriptJson { get; init; }
    public string? AudioPath { get; init; }
    public string? Fragment { get; init; }
}
public sealed record CourseMaterialChoice(Guid Id, string Kind, string Title, string Fragment, string? AudioPath, string? ImagePath, string Author, bool Own, string[] Answers);
public sealed record CourseMaterialPage(CourseMaterialChoice[] Items, bool HasMore);
public sealed record CourseMaterialSummary(Guid Id, string Kind, string Title, string Author, bool Own);

public interface ICourseMaterialRepository
{
    Task<CourseMaterialAccess?> Access(string kind, Guid id, CancellationToken ct);
    Task<CourseMaterialPage> Search(Guid owner, string? kind, string? query, bool own, int page, CancellationToken ct);
    Task<CourseMaterialSummary[]> Selected(Guid owner, Guid[] ids, CancellationToken ct);
    Task<Exercise?> Exercise(Guid owner, string kind, Guid id, CancellationToken ct);
    Task<bool> Available(Guid owner, string kind, Guid id, CancellationToken ct);
    Task<bool> Configure(Guid owner, string kind, Guid id, bool inCatalog, bool shared, CancellationToken ct);
    Task<HashSet<Guid>> Editable(Guid owner, CancellationToken ct);
    Task<HashSet<Guid>> Blocked(Guid[] ids, CancellationToken ct);
    Task<bool> CanReadMedia(string path, Guid? editor, CancellationToken ct);
}

public sealed class EfCourseMaterialRepository(AdamDbContext db) : ICourseMaterialRepository
{
    private static readonly JsonSerializerOptions Json = new(JsonSerializerDefaults.Web);
    internal static Task LockAccess(AdamDbContext db, string kind, Guid id, CancellationToken ct) =>
        db.Database.ExecuteSqlInterpolatedAsync($"SELECT pg_advisory_xact_lock(hashtextextended({$"course-material:{kind}:{id}"}, 0))", ct);

    public static bool Supports(string kind) => kind is "audio" or "translation" or "listening" or "matching" or "picture" or "grammar" or "dialogue";

    public Task<CourseMaterialAccess?> Access(string kind, Guid id, CancellationToken ct) =>
        db.CourseMaterialAccesses.AsNoTracking().SingleOrDefaultAsync(x => x.Kind == kind && x.MaterialId == id, ct);

    public async Task<HashSet<Guid>> Editable(Guid owner, CancellationToken ct) =>
        (await db.CourseMaterialAccesses.Where(x => x.OwnerId == owner).Select(x => x.MaterialId).ToArrayAsync(ct)).ToHashSet();

    public async Task<HashSet<Guid>> Blocked(Guid[] ids, CancellationToken ct) =>
        (await db.CourseMaterialAccesses.Where(x => x.Blocked && ids.Contains(x.MaterialId)).Select(x => x.MaterialId).ToArrayAsync(ct)).ToHashSet();

    public async Task<bool> CanReadMedia(string path, Guid? editor, CancellationToken ct)
    {
        var normalized = path.ToLowerInvariant();
        var jsonValue = System.Text.Json.JsonSerializer.Serialize(normalized);
        var access = await db.CourseMaterialAccesses.AsNoTracking().Where(a =>
            db.Exercises.Any(e => e.Id == a.MaterialId && e.Kind == a.Kind && e.AudioPath != null && e.AudioPath.ToLower() == normalized)
            || a.Kind == "picture" && db.PictureMatchings.Any(p => p.Id == a.MaterialId && p.ScriptJson.ToLower().Contains(jsonValue))
            || db.ContentRevisions.Any(r => r.ContentId == a.MaterialId && r.Kind == a.Kind && r.PayloadJson.ToLower().Contains(jsonValue)))
            .ToArrayAsync(ct);
        if (access.Length == 0) return true;
        if (editor is Guid uid && access.Any(a => a.OwnerId == uid || a.Shared && !a.Blocked)) return true;
        var publicIds = access.Where(a => !a.Blocked && a.InCatalog).Select(a => a.MaterialId).ToArray();
        return await db.Exercises.AnyAsync(e => publicIds.Contains(e.Id) && e.Published && !e.Archived && e.AudioPath != null && e.AudioPath.ToLower() == normalized, ct)
            || await db.PictureMatchings.AnyAsync(p => publicIds.Contains(p.Id) && p.Published && !p.Archived && p.ScriptJson.ToLower().Contains(jsonValue), ct);
    }

    public async Task<CourseMaterialPage> Search(Guid owner, string? kind, string? query, bool own, int page, CancellationToken ct)
    {
        const int size = 15;
        var term = query?.Trim();
        var byNumber = Guid.TryParseExact(term, "D", out var materialId);
        var source = Inventory();
        var choices = from material in source
                      join access in db.CourseMaterialAccesses on new { material.Kind, MaterialId = material.Id } equals new { access.Kind, access.MaterialId }
                      join author in db.Users on access.OwnerId equals (Guid?)author.Id
                      where !access.Blocked && (kind == null || material.Kind == kind)
                          && (byNumber ? access.OwnerId == owner || access.Shared
                              : own ? access.OwnerId == owner : access.OwnerId != owner && access.Shared)
                      select new { material.Id, material.Kind, material.Title, material.ScriptJson, material.AudioPath, material.Fragment,
                          Author = author.PublicName ?? "Преподаватель", Own = access.OwnerId == owner };
        if (byNumber)
        {
            choices = choices.Where(x => x.Id == materialId);
        }
        else if (!string.IsNullOrEmpty(term))
        {
            var pattern = "%" + term.Replace(@"\", @"\\").Replace("%", @"\%").Replace("_", @"\_") + "%";
            choices = choices.Where(x => x.Kind == "grammar" || EF.Functions.ILike(x.Title, pattern) ||
                x.Fragment != null && EF.Functions.ILike(x.Fragment, pattern));
        }
        var items = new List<CourseMaterialChoice>(size);
        var skip = (page - 1) * size;
        await foreach (var row in choices.OrderBy(x => x.Title).ThenBy(x => x.Id).AsAsyncEnumerable().WithCancellation(ct))
        {
            var preview = ReadPreview(row.Kind, row.ScriptJson);
            if (preview is null) continue;
            var (fragment, image, answers) = preview.Value;
            if (!byNumber && row.Kind == "grammar" && !string.IsNullOrEmpty(term) &&
                !row.Title.Contains(term, StringComparison.OrdinalIgnoreCase) &&
                fragment?.Contains(term, StringComparison.OrdinalIgnoreCase) != true) continue;
            if (skip > 0) { skip--; continue; }
            if (items.Count == size) return new(items.ToArray(), true);
            items.Add(new(row.Id, row.Kind, row.Title, fragment ?? row.Fragment ?? row.Title, row.AudioPath, image, row.Author, row.Own, answers));
        }
        return new(items.ToArray(), false);
    }

    private sealed record ExercisePreview(string? Answer, string? Values, int Correct);

    private static (string? Fragment, string? Image, string[] Answers)? ReadPreview(string kind, string? payload)
    {
        if (payload is null) return null;
        try
        {
            switch (kind)
            {
                case "matching" when JsonSerializer.Deserialize<MatchingMaterial>(payload, Json)?.Pairs is { Length: > 0 } pairs &&
                    pairs.All(pair => pair is not null && !string.IsNullOrWhiteSpace(pair.Left) && !string.IsNullOrWhiteSpace(pair.Right)):
                    return (null, null, pairs.Select(pair => $"{pair.Left} — {pair.Right}").ToArray());
                case "dialogue" when JsonSerializer.Deserialize<DialogueMaterial>(payload, Json)?.Turns is { } turns &&
                    turns.All(turn => turn?.References is not null):
                    return (null, null, turns.Where(turn => turn.References.Length > 0)
                        .Select(turn => $"{turn.LineNumber}: {string.Join(" / ", turn.References)}").ToArray());
                case "picture" when JsonSerializer.Deserialize<PictureMaterial>(payload, Json) is { Word.Length: > 0, PicturePath.Length: > 0 } picture:
                    return (null, picture.PicturePath, [picture.Word]);
                case "grammar" when JsonSerializer.Deserialize<GrammarMaterial>(payload, Json) is { Correct.Length: > 0, Prompt.Length: > 0 } grammar:
                    return (grammar.Prompt, null, [grammar.Correct]);
                case "audio" or "translation" or "listening":
                    if (JsonSerializer.Deserialize<ExercisePreview>(payload, Json) is not { Values: { } values } exercise ||
                        JsonSerializer.Deserialize<string[]>(values) is not { } options) return null;
                    if (kind == "listening")
                        return exercise.Correct >= 0 && exercise.Correct < options.Length && !string.IsNullOrWhiteSpace(options[exercise.Correct])
                            ? (null, null, [options[exercise.Correct]]) : null;
                    return !string.IsNullOrWhiteSpace(exercise.Answer)
                        ? (null, null, options.Prepend(exercise.Answer).Where(answer => !string.IsNullOrWhiteSpace(answer)).Distinct().ToArray()) : null;
                default: return null;
            }
        }
        catch (JsonException) { return null; }
    }

    public Task<CourseMaterialSummary[]> Selected(Guid owner, Guid[] ids, CancellationToken ct)
    {
        if (ids.Length == 0) return Task.FromResult(Array.Empty<CourseMaterialSummary>());
        return (from material in Inventory()
                join access in db.CourseMaterialAccesses on new { material.Kind, MaterialId = material.Id } equals new { access.Kind, access.MaterialId }
                join author in db.Users on access.OwnerId equals (Guid?)author.Id
                where ids.Contains(material.Id) && !access.Blocked && (access.OwnerId == owner || access.Shared)
                select new CourseMaterialSummary(material.Id, material.Kind, material.Title, author.PublicName ?? "Преподаватель", access.OwnerId == owner))
            .ToArrayAsync(ct);
    }

    private IQueryable<CourseMaterialItem> Inventory() => db.Database.SqlQueryRaw<CourseMaterialItem>("""
        SELECT "Id", "Kind", "RussianPrompt" AS "Title",
            json_build_object('answer', "OssetianAnswer", 'values',
                CASE WHEN "Kind" = 'listening' THEN "OptionsJson" ELSE "AlternativesJson" END,
                'correct', "CorrectOption")::text AS "ScriptJson",
            "AudioPath", "RussianPrompt" AS "Fragment"
        FROM "Exercises" WHERE "Published" AND NOT "Archived"
        UNION ALL
        SELECT "Id", 'matching', "Title", "ScriptJson", NULL, NULL FROM "Matchings" WHERE "Published" AND NOT "Archived"
        UNION ALL
        SELECT "Id", 'picture', "Title", "ScriptJson", NULL, NULL FROM "PictureMatchings" WHERE "Published" AND NOT "Archived"
        UNION ALL
        SELECT "Id", 'grammar', "Title", "ScriptJson", NULL, NULL FROM "Grammars" WHERE "Published" AND NOT "Archived"
        UNION ALL
        SELECT "Id", 'dialogue', "Title", "ScriptJson", NULL, NULL FROM "Dialogues" WHERE "Published" AND NOT "Archived"
        """);

    public Task<Exercise?> Exercise(Guid owner, string kind, Guid id, CancellationToken ct) =>
        db.Exercises.AsNoTracking().SingleOrDefaultAsync(x => x.Id == id && x.Kind == kind && x.Published && !x.Archived
            && db.CourseMaterialAccesses.Any(a => a.MaterialId == id && a.Kind == kind && !a.Blocked && (a.OwnerId == owner || a.Shared)), ct);

    public Task<bool> Available(Guid owner, string kind, Guid id, CancellationToken ct) =>
        Inventory().AnyAsync(x => x.Id == id && x.Kind == kind &&
            db.CourseMaterialAccesses.Any(a => a.MaterialId == id && a.Kind == kind && !a.Blocked && (a.OwnerId == owner || a.Shared)), ct);

    public async Task<bool> Configure(Guid owner, string kind, Guid id, bool inCatalog, bool shared, CancellationToken ct) =>
        await db.CourseMaterialAccesses.Where(x => x.OwnerId == owner && x.Kind == kind && x.MaterialId == id)
            .ExecuteUpdateAsync(update => update.SetProperty(x => x.InCatalog, inCatalog).SetProperty(x => x.Shared, shared), ct) == 1;
}
