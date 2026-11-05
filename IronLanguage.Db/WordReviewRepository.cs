using Microsoft.EntityFrameworkCore;
using System.Text.Json.Serialization;

namespace IronLanguage.Db;

public sealed class VocabularyItem
{
    public Guid WordId { get; init; }
    public string Ossetian { get; init; } = "";
    public string Russian { get; init; } = "";
    public string Example { get; init; } = "";
    public string? AudioPath { get; init; }
    public string DictionaryNote { get; init; } = "";
    public DateTimeOffset AddedAt { get; init; }
    public int Errors { get; init; }
    public string Status { get; init; } = "";
    public DateTimeOffset? DueAt { get; init; }
    [JsonIgnore] public bool Fresh { get; init; }
}
public sealed record VocabularyPage(VocabularyItem[] Items, int Total, int Page, int Pages);
public sealed record ReviewCounts(int Total, int New, int Learning, int Mastered, int Due, int PointsToday, DateTimeOffset? NextDue);
public sealed record MasteryDay(DateOnly Day, int Count);
public sealed record ReviewSource(SavedWord Saved, WordReviewState? Forward, WordReviewState? Backward);
public sealed record ReviewWrite(bool Award, bool MarkKnown = false, bool Introduce = false)
{
    public static implicit operator ReviewWrite(bool award) => new(award);
}

public interface IWordReviewRepository
{
    Task<ReviewCounts> Counts(Guid userId, DateTimeOffset now, CancellationToken ct);
    Task<MasteryDay[]> MasteryWeek(Guid userId, DateOnly today, CancellationToken ct);
    Task RateTopicWord(Guid userId, Guid wordId, int stage, DateTimeOffset dueAt, bool known, DateTimeOffset now, CancellationToken ct);
    Task<VocabularyPage> Page(Guid userId, string search, string status, string sort, int page, int size, CancellationToken ct);
    Task<VocabularyPage> Available(Guid? userId, string search, int page, CancellationToken ct);
    Task<List<ReviewSource>> Sources(Guid userId, CancellationToken ct);
    Task<WordReviewSettings> Settings(Guid userId, CancellationToken ct);
    Task SaveSettings(WordReviewSettings settings, CancellationToken ct);
    Task<WordReviewSession?> Session(Guid userId, CancellationToken ct);
    Task Start(WordReviewSession session, CancellationToken ct);
    Task<WordReviewSession?> Mutate(Guid userId, Guid id, Guid? wordId, bool reverse, DateTimeOffset now,
        Func<WordReviewSession, WordReviewState?, SavedWord?, ReviewWrite> action, CancellationToken ct);
    Task<DictionarySense[]> TopicSenses(int[] rows, CancellationToken ct);
    Task<Guid[]> SavedSenseIds(Guid userId, CancellationToken ct);
    Task<Guid[]> SavedWordIds(Guid userId, CancellationToken ct);
    Task<Guid> EnsureTopicWord(WordEntry word, CancellationToken ct);
}

public sealed class EfWordReviewRepository(AdamDbContext db) : IWordReviewRepository
{
    private IQueryable<VocabularyItem> Items(Guid userId) =>
        from saved in db.SavedWords.AsNoTracking()
        where saved.UserId == userId && saved.Word.Published && !saved.Word.Archived
        join forward in db.WordReviewStates.Where(x => !x.Reverse) on new { saved.UserId, saved.WordId } equals new { forward.UserId, forward.WordId } into fs
        from f in fs.DefaultIfEmpty()
        join backward in db.WordReviewStates.Where(x => x.Reverse) on new { saved.UserId, saved.WordId } equals new { backward.UserId, backward.WordId } into bs
        from b in bs.DefaultIfEmpty()
        select new VocabularyItem
        {
            WordId = saved.WordId, Ossetian = saved.Word.Ossetian, Russian = saved.Word.Russian, Example = saved.Word.Example,
            AudioPath = saved.Word.AudioPath, DictionaryNote = saved.Word.DictionaryNote, AddedAt = saved.AddedAt,
            Errors = saved.Errors + (f == null ? 0 : f.Errors) + (b == null ? 0 : b.Errors),
            Status = f != null && b != null && f.Mastered && b.Mastered ? "mastered" :
                "learning",
            Fresh = (f == null || f.Stage < 0 && f.DueAt == null) && (b == null || b.Stage < 0 && b.DueAt == null),
            // An unintroduced opposite direction is ready for the next session, even while the first direction waits.
            DueAt = f != null && f.Stage >= 0 && (b == null || b.Stage < 0) || b != null && b.Stage >= 0 && (f == null || f.Stage < 0)
                ? saved.AddedAt : f == null || f.DueAt == null ? (b == null ? null : b.DueAt) :
                b == null || b.DueAt == null || f.DueAt < b.DueAt ? f.DueAt : b.DueAt
        };

    public async Task<ReviewCounts> Counts(Guid userId, DateTimeOffset now, CancellationToken ct)
    {
        var items = Items(userId);
        var total = await items.CountAsync(ct);
        var fresh = await items.CountAsync(x => x.Fresh, ct);
        var mastered = await items.CountAsync(x => x.Status == "mastered", ct);
        var due = await items.CountAsync(x => x.Status != "new" && x.DueAt <= now, ct);
        var next = await items.Where(x => x.DueAt > now).MinAsync(x => x.DueAt, ct);
        var day = DateOnly.FromDateTime(now.UtcDateTime);
        var points = await db.WordReviewRewards.CountAsync(x => x.UserId == userId && x.Day == day, ct);
        return new(total, fresh, total - mastered, mastered, due, points, next);
    }

    public async Task<MasteryDay[]> MasteryWeek(Guid userId, DateOnly today, CancellationToken ct)
    {
        var first = today.AddDays(-6);
        var days = await db.WordReviewMasteries.AsNoTracking()
            .Where(x => x.UserId == userId && x.Day >= first && x.Day <= today)
            .GroupBy(x => x.Day).Select(group => new MasteryDay(group.Key, group.Count())).ToArrayAsync(ct);
        var counts = days.ToDictionary(x => x.Day, x => x.Count);
        return Enumerable.Range(0, 7).Select(offset => first.AddDays(offset))
            .Select(day => new MasteryDay(day, counts.GetValueOrDefault(day))).ToArray();
    }

    public async Task<VocabularyPage> Available(Guid? userId, string search, int page, CancellationToken ct)
    {
        var query = db.Words.AsNoTracking().Where(x => x.Published && !x.Archived &&
            (userId == null || !db.SavedWords.Any(s => s.UserId == userId && s.WordId == x.Id)));
        if (search.Length > 0)
        {
            var pattern = "%" + search.Replace("\\", "\\\\").Replace("%", "\\%").Replace("_", "\\_") + "%";
            query = query.Where(x => EF.Functions.ILike(x.Ossetian, pattern) || EF.Functions.ILike(x.Russian, pattern));
        }
        var total = await query.CountAsync(ct);
        var pages = Math.Max(1, (int)Math.Ceiling(total / 30d));
        page = Math.Clamp(page, 1, pages);
        var words = await query.OrderBy(x => x.Ossetian).ThenBy(x => x.Id).Skip((page - 1) * 30).Take(30).ToArrayAsync(ct);
        return new(words.Select(x => new VocabularyItem { WordId = x.Id, Ossetian = x.Ossetian, Russian = x.Russian,
            Example = x.Example, AudioPath = x.AudioPath, DictionaryNote = x.DictionaryNote, Status = "available" }).ToArray(), total, page, pages);
    }

    public async Task<VocabularyPage> Page(Guid userId, string search, string status, string sort, int page, int size, CancellationToken ct)
    {
        var query = Items(userId);
        if (search.Length > 0)
        {
            // Escape LIKE wildcards: user input is literal text, never a pattern or SQL.
            var pattern = "%" + search.Replace("\\", "\\\\").Replace("%", "\\%").Replace("_", "\\_") + "%";
            query = query.Where(x => EF.Functions.ILike(x.Ossetian, pattern) || EF.Functions.ILike(x.Russian, pattern));
        }
        if (status != "all") query = query.Where(x => x.Status == status);
        var total = await query.CountAsync(ct);
        var pages = Math.Max(1, (int)Math.Ceiling(total / (double)size));
        page = Math.Clamp(page, 1, pages);
        IOrderedQueryable<VocabularyItem> ordered = sort switch
        {
            "recent" => query.OrderByDescending(x => x.AddedAt),
            "alphabet" => query.OrderBy(x => x.Ossetian),
            "errors" => query.OrderByDescending(x => x.Errors).ThenBy(x => x.DueAt == null).ThenBy(x => x.DueAt),
            _ => query.OrderBy(x => x.DueAt == null).ThenBy(x => x.DueAt)
        };
        var results = await ordered.ThenBy(x => x.WordId).Skip((page - 1) * size).Take(size).ToArrayAsync(ct);
        return new(results, total, page, pages);
    }

    public async Task<List<ReviewSource>> Sources(Guid userId, CancellationToken ct)
    {
        var words = await db.SavedWords.AsNoTracking().Include(x => x.Word)
            .Where(x => x.UserId == userId && x.Word.Published && !x.Word.Archived).OrderBy(x => x.AddedAt).ThenBy(x => x.WordId).ToListAsync(ct);
        var states = await db.WordReviewStates.AsNoTracking().Where(x => x.UserId == userId).ToListAsync(ct);
        var byKey = states.ToDictionary(x => (x.WordId, x.Reverse));
        return words.Select(x => new ReviewSource(x, byKey.GetValueOrDefault((x.WordId, false)), byKey.GetValueOrDefault((x.WordId, true)))).ToList();
    }

    public async Task<WordReviewSettings> Settings(Guid userId, CancellationToken ct) =>
        await db.WordReviewSettings.AsNoTracking().SingleOrDefaultAsync(x => x.UserId == userId, ct) ?? new() { UserId = userId };

    private Task Lock(Guid userId, CancellationToken ct) =>
        db.Database.ExecuteSqlInterpolatedAsync($"SELECT pg_advisory_xact_lock(hashtextextended({"word-review:" + userId}, 0))", ct);

    private async Task RecordMastery(Guid userId, Guid wordId, DateTimeOffset now, CancellationToken ct)
    {
        if (!await db.WordReviewMasteries.AnyAsync(x => x.UserId == userId && x.WordId == wordId, ct))
            db.WordReviewMasteries.Add(new() { UserId = userId, WordId = wordId, Day = DateOnly.FromDateTime(now.UtcDateTime) });
    }

    public async Task RateTopicWord(Guid userId, Guid wordId, int stage, DateTimeOffset dueAt, bool known, DateTimeOffset now, CancellationToken ct)
    {
        await using var tx = await db.Database.BeginTransactionAsync(ct);
        await Lock(userId, ct);
        if (!await db.Words.AnyAsync(x => x.Id == wordId && x.Published && !x.Archived, ct))
            throw new ArgumentException("Это слово сейчас недоступно.");

        // The first successful save wins, including saves from reading or other tabs.
        var inserted = await db.Database.ExecuteSqlInterpolatedAsync($"""
            INSERT INTO "SavedWords" ("UserId", "WordId", "AddedAt", "Errors")
            VALUES ({userId}, {wordId}, {now}, 0) ON CONFLICT ("UserId", "WordId") DO NOTHING
            """, ct);
        if (inserted == 1)
        {
            db.WordReviewStates.AddRange(
                new WordReviewState { UserId = userId, WordId = wordId, Stage = stage, DueAt = dueAt, Mastered = known },
                new WordReviewState { UserId = userId, WordId = wordId, Reverse = true, Stage = stage, DueAt = dueAt, Mastered = known });
            if (known) await RecordMastery(userId, wordId, now, ct);
            await db.SaveChangesAsync(ct);
        }
        await tx.CommitAsync(ct);
    }

    public async Task SaveSettings(WordReviewSettings settings, CancellationToken ct)
    {
        await using var tx = await db.Database.BeginTransactionAsync(ct);
        await Lock(settings.UserId, ct);
        var current = await db.WordReviewSettings.SingleOrDefaultAsync(x => x.UserId == settings.UserId, ct);
        if (current is null) db.WordReviewSettings.Add(settings);
        else { current.Format = settings.Format; current.DirectInput = settings.DirectInput; }
        await db.SaveChangesAsync(ct);
        await tx.CommitAsync(ct);
    }

    public Task<WordReviewSession?> Session(Guid userId, CancellationToken ct) =>
        db.WordReviewSessions.AsNoTracking().SingleOrDefaultAsync(x => x.UserId == userId, ct);

    public async Task Start(WordReviewSession session, CancellationToken ct)
    {
        await using var tx = await db.Database.BeginTransactionAsync(ct);
        await Lock(session.UserId, ct);
        await db.WordReviewSessions.Where(x => x.UserId == session.UserId).ExecuteDeleteAsync(ct);
        foreach (var tracked in db.ChangeTracker.Entries<WordReviewSession>().Where(x => x.Entity.UserId == session.UserId).ToArray())
            tracked.State = EntityState.Detached;
        db.WordReviewSessions.Add(session);
        await db.SaveChangesAsync(ct);
        await tx.CommitAsync(ct);
    }

    public async Task<WordReviewSession?> Mutate(Guid userId, Guid id, Guid? wordId, bool reverse, DateTimeOffset now,
        Func<WordReviewSession, WordReviewState?, SavedWord?, ReviewWrite> action, CancellationToken ct)
    {
        await using var tx = await db.Database.BeginTransactionAsync(ct);
        await Lock(userId, ct);
        // A matching batch uses this context for several short, independently retryable writes.
        // Reload under the user lock rather than reusing an earlier tracked copy from this request.
        foreach(var entry in db.ChangeTracker.Entries<WordReviewSession>().Where(x=>x.Entity.UserId==userId).ToArray())entry.State=EntityState.Detached;
        foreach(var entry in db.ChangeTracker.Entries<WordReviewState>().Where(x=>x.Entity.UserId==userId&&x.Entity.WordId==wordId&&x.Entity.Reverse==reverse).ToArray())entry.State=EntityState.Detached;
        foreach(var entry in db.ChangeTracker.Entries<SavedWord>().Where(x=>x.Entity.UserId==userId&&x.Entity.WordId==wordId).ToArray())entry.State=EntityState.Detached;
        var session = await db.WordReviewSessions.SingleOrDefaultAsync(x => x.UserId == userId && x.Id == id, ct);
        if (session is null) return null;
        var saved = wordId is null ? null : await db.SavedWords.Include(x => x.Word)
            .SingleOrDefaultAsync(x => x.UserId == userId && x.WordId == wordId, ct);
        var state = wordId is null ? null : await db.WordReviewStates.SingleOrDefaultAsync(x => x.UserId == userId && x.WordId == wordId && x.Reverse == reverse, ct);
        var created = state is null && saved is not null;
        if (created) state = new() { UserId = userId, WordId = wordId!.Value, Reverse = reverse };
        var wasMastered = state?.Mastered == true;
        var write = action(session, state, saved);
        if (created && state!.DueAt is not null) db.WordReviewStates.Add(state);
        if ((write.MarkKnown || write.Introduce) && state is not null && wordId is Guid wholeWord)
        {
            var other = await db.WordReviewStates.SingleOrDefaultAsync(x => x.UserId == userId && x.WordId == wholeWord && x.Reverse != reverse, ct);
            if (other is null) { other = new() { UserId = userId, WordId = wholeWord, Reverse = !reverse }; db.WordReviewStates.Add(other); }
            other.Stage = write.MarkKnown ? state.Stage : other.Stage < 0 ? -1 : Math.Max(0,other.Stage - 1);
            other.DueAt = write.MarkKnown ? state.DueAt : now; other.Mastered = write.MarkKnown;
        }
        if (!wasMastered && state?.Mastered == true &&
            (write.MarkKnown || await db.WordReviewStates.AnyAsync(x => x.UserId == userId && x.WordId == state.WordId && x.Reverse != reverse && x.Mastered, ct)))
            await RecordMastery(userId, state.WordId, now, ct);

        if (write.Award && wordId is Guid value)
        {
            var day = DateOnly.FromDateTime(now.UtcDateTime);
            var rewarded = await db.WordReviewRewards.AnyAsync(x => x.UserId == userId && x.WordId == value && x.Day == day, ct);
            var points = !rewarded && await db.WordReviewRewards.CountAsync(x => x.UserId == userId && x.Day == day, ct) < 20 ? 1 : 0;
            if (points > 0) db.WordReviewRewards.Add(new() { UserId = userId, WordId = value, Day = day });
            session.Points += points;
            await DailyActivityWriter.Record(db, userId, day, now, points, ct);
        }
        await db.SaveChangesAsync(ct);
        await tx.CommitAsync(ct);
        return session;
    }

    public Task<DictionarySense[]> TopicSenses(int[] rows, CancellationToken ct) =>
        db.DictionarySenses.AsNoTracking().Where(x => x.Active && rows.Contains(x.SourceRow)).ToArrayAsync(ct);

    public Task<Guid[]> SavedSenseIds(Guid userId, CancellationToken ct) =>
        db.SavedWords.Where(x => x.UserId == userId && x.Word.DictionarySenseId != null)
            .Select(x => x.Word.DictionarySenseId!.Value).ToArrayAsync(ct);

    public Task<Guid[]> SavedWordIds(Guid userId, CancellationToken ct) =>
        db.SavedWords.Where(x => x.UserId == userId).Select(x => x.WordId).ToArrayAsync(ct);

    public async Task<Guid> EnsureTopicWord(WordEntry word, CancellationToken ct)
    {
        var existing = await db.Words.AsNoTracking().FirstOrDefaultAsync(x => x.Id == word.Id || word.DictionarySenseId != null && x.DictionarySenseId == word.DictionarySenseId, ct);
        if (existing is not null)
        {
            if (!existing.Published || existing.Archived) throw new ArgumentException("Слово из этой темы сейчас недоступно.");
            return existing.Id;
        }
        db.Words.Add(word);
        try { await db.SaveChangesAsync(ct); return word.Id; }
        catch (DbUpdateException)
        {
            db.Entry(word).State = EntityState.Detached;
            var concurrent = await db.Words.AsNoTracking().FirstOrDefaultAsync(x => x.Id == word.Id || word.DictionarySenseId != null && x.DictionarySenseId == word.DictionarySenseId, ct);
            if (concurrent is null) throw;
            if (!concurrent.Published || concurrent.Archived) throw new ArgumentException("Слово из этой темы сейчас недоступно.");
            return concurrent.Id;
        }
    }
}
