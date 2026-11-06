using System.Text.Json.Nodes;
using Microsoft.EntityFrameworkCore;

namespace IronLanguage.Db;

// Курсы и уроки используют общую историю материалов и её ограничения уникальности.
public interface ICurriculumRepository
{
    Task<List<ContentRevision>> List(string kind, bool editor, CancellationToken ct);
    Task<ContentRevision?> Get(string kind, Guid id, bool draft, CancellationToken ct);
    Task<List<ContentRevision>> ListOwned(string kind, Guid editor, bool publishedOnly, CancellationToken ct);
    Task<ContentRevision?> GetOwned(string kind, Guid id, Guid editor, CancellationToken ct);
    Task<bool> Save(string kind, Guid id, string payload, Guid editor, string stamp, CancellationToken ct);
    Task<bool> Publish(string kind, Guid id, Guid draftId, string stamp, Guid editor, CancellationToken ct);
    Task<LessonRun?> Run(Guid user, Guid id, CancellationToken ct);
    Task<List<LessonRun>> Runs(Guid user, CancellationToken ct);
    Task<LessonRun> Start(LessonRun run, List<ExerciseAttempt> attempts, List<DialogueSession> dialogs, CancellationToken ct);
    Task<bool> Advance(Guid user, Guid id, int step, int count, CancellationToken ct);
}

public sealed class LessonRun
{
    public Guid Id { get; set; } = Guid.NewGuid();
    public Guid UserId { get; set; }
    public Guid LessonId { get; set; }
    public int LessonVersion { get; set; }
    public string SnapshotJson { get; set; } = "{}";
    public int Step { get; set; }
    public DateTimeOffset StartedAt { get; set; } = DateTimeOffset.UtcNow;
    public DateTimeOffset? CompletedAt { get; set; }
}

public sealed class EfCurriculumRepository(AdamDbContext db) : ICurriculumRepository
{
    public static string Stamp(ContentRevision? revision) => revision is null ? "" :
        Convert.ToHexString(System.Security.Cryptography.SHA256.HashData(System.Text.Encoding.UTF8.GetBytes(
            $"{revision.Id}:{revision.Published}:{revision.PayloadJson}")));

    public async Task<List<ContentRevision>> List(string kind, bool editor, CancellationToken ct)
    {
        var rows = await db.ContentRevisions.AsNoTracking().Where(x => x.Kind == kind && (editor || x.Published)).ToListAsync(ct);
        return rows.GroupBy(x => x.ContentId).Select(g => g.OrderBy(x => x.Published).ThenByDescending(x => x.Version).First()).ToList();
    }

    public Task<ContentRevision?> Get(string kind, Guid id, bool draft, CancellationToken ct) =>
        db.ContentRevisions.AsNoTracking().Where(x => x.Kind == kind && x.ContentId == id && (draft || x.Published))
            .OrderBy(x => x.Published).ThenByDescending(x => x.Version).FirstOrDefaultAsync(ct);

    // Автор определяется по первой версии; последующие редакции не меняют владельца.
    public async Task<List<ContentRevision>> ListOwned(string kind, Guid editor, bool publishedOnly, CancellationToken ct)
    {
        var rows = await db.ContentRevisions.AsNoTracking().Where(x => x.Kind == kind).ToListAsync(ct);
        return rows.GroupBy(x => x.ContentId)
            .Where(g => g.OrderBy(x => x.Version).ThenBy(x => x.CreatedAt).First().EditorId == editor)
            .Select(g => g.Where(x => !publishedOnly || x.Published)
                .OrderBy(x => x.Published).ThenByDescending(x => x.Version).FirstOrDefault())
            .Where(x => x is not null).Select(x => x!).ToList();
    }

    public async Task<ContentRevision?> GetOwned(string kind, Guid id, Guid editor, CancellationToken ct)
    {
        var rows = await db.ContentRevisions.AsNoTracking().Where(x => x.Kind == kind && x.ContentId == id).ToListAsync(ct);
        if (rows.Count == 0 || rows.OrderBy(x => x.Version).ThenBy(x => x.CreatedAt).First().EditorId != editor) return null;
        return rows.OrderBy(x => x.Published).ThenByDescending(x => x.Version).First();
    }

    private Task Lock(Guid id, CancellationToken ct) => db.Database.ExecuteSqlInterpolatedAsync(
        $"SELECT pg_advisory_xact_lock(hashtextextended({id.ToString()}, 0))", ct);

    public async Task<bool> Save(string kind, Guid id, string payload, Guid editor, string stamp, CancellationToken ct)
    {
        await using var tx = await db.Database.BeginTransactionAsync(ct);
        await Lock(id, ct);
        var current = await Get(kind, id, true, ct);
        if (current is not null && await GetOwned(kind, id, editor, ct) is null) return false;
        if (Stamp(current) != stamp) return false;
        if (current is { Published: false })
            await db.ContentRevisions.Where(x => x.Id == current.Id).ExecuteUpdateAsync(s => s
                .SetProperty(x => x.PayloadJson, payload).SetProperty(x => x.EditorId, editor), ct);
        else
            db.ContentRevisions.Add(new ContentRevision { Kind = kind, ContentId = id, EditorId = editor,
                Version = (current?.Version ?? 0) + 1, BaseVersion = current?.Version ?? 0, PayloadJson = payload });
        await db.SaveChangesAsync(ct);
        await tx.CommitAsync(ct);
        return true;
    }

    public async Task<bool> Publish(string kind, Guid id, Guid draftId, string stamp, Guid editor, CancellationToken ct)
    {
        await using var tx = await db.Database.BeginTransactionAsync(ct);
        await Lock(id, ct);
        var draft = await GetOwned(kind, id, editor, ct);
        if (draft is null || draft.Published || draft.Id != draftId || Stamp(draft) != stamp) return false;
        await db.ContentRevisions.Where(x => x.Id == draft.Id).ExecuteUpdateAsync(s => s
            .SetProperty(x => x.Published, true).SetProperty(x => x.PublishedAt, DateTimeOffset.UtcNow), ct);
        await tx.CommitAsync(ct);
        return true;
    }

    public Task<LessonRun?> Run(Guid user, Guid id, CancellationToken ct) =>
        db.LessonRuns.AsNoTracking().SingleOrDefaultAsync(x => x.UserId == user && x.Id == id, ct);
    public Task<List<LessonRun>> Runs(Guid user, CancellationToken ct) =>
        db.LessonRuns.AsNoTracking().Where(x => x.UserId == user).OrderByDescending(x => x.StartedAt).ToListAsync(ct);

    public async Task<LessonRun> Start(LessonRun run, List<ExerciseAttempt> attempts, List<DialogueSession> dialogs, CancellationToken ct)
    {
        await using var tx = await db.Database.BeginTransactionAsync(ct);
        await db.Database.ExecuteSqlInterpolatedAsync(
            $"SELECT pg_advisory_xact_lock(hashtextextended({run.UserId.ToString() + run.LessonId.ToString()}, 0))", ct);
        var active = await db.LessonRuns.AsNoTracking().SingleOrDefaultAsync(x => x.UserId == run.UserId && x.LessonId == run.LessonId && x.CompletedAt == null, ct);
        if (active is not null) return active;
        foreach (var attempt in attempts) attempt.LessonRunId = run.Id;
        foreach (var dialog in dialogs) dialog.LessonRunId = run.Id;
        db.LessonRuns.Add(run);
        db.Attempts.AddRange(attempts);
        db.DialogueSessions.AddRange(dialogs);
        await db.SaveChangesAsync(ct);
        await tx.CommitAsync(ct);
        return run;
    }

    public async Task<bool> Advance(Guid user, Guid id, int step, int count, CancellationToken ct)
    {
        if (step < 0 || step >= count) return false;
        await using var tx = await db.Database.BeginTransactionAsync(ct);
        await Lock(id, ct);
        var run = await db.LessonRuns.SingleOrDefaultAsync(x => x.UserId == user && x.Id == id, ct);
        if (run is null) return false;
        await db.Entry(run).ReloadAsync(ct);
        var snapshot = JsonNode.Parse(run.SnapshotJson)!.AsObject();
        var completed = snapshot["completedSteps"] is JsonArray indices
            ? indices.Select(x => x!.GetValue<int>()).Where(x => x >= 0 && x < count).ToHashSet()
            : Enumerable.Range(0, Math.Min(run.Step, count)).ToHashSet();
        completed.Add(step);
        snapshot["completedSteps"] = new JsonArray(completed.Order().Select(x => (JsonNode?)JsonValue.Create(x)).ToArray());
        run.SnapshotJson = snapshot.ToJsonString();
        run.Step = Enumerable.Range(0, count).FirstOrDefault(x => !completed.Contains(x), count);
        if (run.Step == count) run.CompletedAt ??= DateTimeOffset.UtcNow;
        await db.SaveChangesAsync(ct);
        await tx.CommitAsync(ct);
        return true;
    }
}
