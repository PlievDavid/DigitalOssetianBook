using Microsoft.EntityFrameworkCore;

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
public sealed record CourseMaterialChoice(Guid Id, string Kind, string Title, string Fragment, string? AudioPath, string? ImagePath, string Author, bool Own);
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
        var source = Inventory();
        var choices = from material in source
                      join access in db.CourseMaterialAccesses on new { material.Kind, MaterialId = material.Id } equals new { access.Kind, access.MaterialId }
                      join author in db.Users on access.OwnerId equals (Guid?)author.Id
                      where !access.Blocked && (kind == null || material.Kind == kind)
                          && (own ? access.OwnerId == owner : access.OwnerId != owner && access.Shared)
                      select new { material.Id, material.Kind, material.Title, material.ScriptJson, material.AudioPath, material.Fragment,
                          Author = author.PublicName ?? "Преподаватель", Own = access.OwnerId == owner };
        if (!string.IsNullOrWhiteSpace(query))
        {
            var pattern = "%" + query.Trim().Replace(@"\", @"\\").Replace("%", @"\%").Replace("_", @"\_") + "%";
            choices = choices.Where(x => EF.Functions.ILike(x.Title, pattern) || x.Fragment != null && EF.Functions.ILike(x.Fragment, pattern));
        }
        var rows = await choices.OrderBy(x => x.Title).ThenBy(x => x.Id).Skip((page - 1) * size).Take(size + 1).ToArrayAsync(ct);
        return new(rows.Take(size).Select(row =>
        {
            using var script = row.ScriptJson is null ? null : System.Text.Json.JsonDocument.Parse(row.ScriptJson);
            string? Read(string key) => script is not null && script.RootElement.TryGetProperty(key, out var field)
                && field.ValueKind == System.Text.Json.JsonValueKind.String ? field.GetString() : null;
            return new CourseMaterialChoice(row.Id, row.Kind, row.Title, row.Fragment ?? row.Title,
                row.AudioPath, row.Kind == "picture" ? Read("picturePath") : null, row.Author, row.Own);
        }).ToArray(), rows.Length > size);
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
        SELECT "Id", "Kind", "RussianPrompt" AS "Title", NULL::text AS "ScriptJson", "AudioPath", "RussianPrompt" AS "Fragment"
        FROM "Exercises" WHERE "Published" AND NOT "Archived"
        UNION ALL
        SELECT "Id", 'matching', "Title", "ScriptJson", NULL, NULL FROM "Matchings" WHERE "Published" AND NOT "Archived"
        UNION ALL
        SELECT "Id", 'picture', "Title", "ScriptJson", NULL, NULL FROM "PictureMatchings" WHERE "Published" AND NOT "Archived"
        UNION ALL
        SELECT "Id", 'grammar', "Title", "ScriptJson", NULL, "ScriptJson"::jsonb ->> 'prompt' FROM "Grammars" WHERE "Published" AND NOT "Archived"
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
