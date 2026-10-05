using Microsoft.EntityFrameworkCore;

namespace IronLanguage.Db;

public interface IAccountRepository
{
    Task<UserAccount?> FindByEmail(string email, CancellationToken ct = default);
    Task<UserAccount?> FindById(Guid id, CancellationToken ct = default);
    Task<UserAccount?> FirstEditor(CancellationToken ct = default);
    Task<bool> Create(UserAccount user, CancellationToken ct = default);
}

public sealed class EfAccountRepository(AdamDbContext db) : IAccountRepository
{
    public Task<UserAccount?> FindByEmail(string email, CancellationToken ct = default) =>
        db.Users.AsNoTracking().SingleOrDefaultAsync(x => x.Email == email, ct);

    public Task<UserAccount?> FindById(Guid id, CancellationToken ct = default) =>
        db.Users.AsNoTracking().SingleOrDefaultAsync(x => x.Id == id, ct);

    public Task<UserAccount?> FirstEditor(CancellationToken ct = default) =>
        db.Users.AsNoTracking().Where(x => x.IsEditor).OrderBy(x => x.CreatedAt).FirstOrDefaultAsync(ct);

    public async Task<bool> Create(UserAccount user, CancellationToken ct = default)
    {
        if (await db.Users.AnyAsync(x => x.Email == user.Email, ct)) return false;
        db.Users.Add(user);
        try { await db.SaveChangesAsync(ct); return true; }
        catch (DbUpdateException) { db.Entry(user).State = EntityState.Detached; return false; }
    }
}

public interface ICatalogRepository
{
    Task<List<Exercise>> Exercises(string? kind = null, CancellationToken ct = default);
    Task<Exercise?> Exercise(Guid id, bool includeDraft = false, CancellationToken ct = default);
    Task<List<WordEntry>> Words(CancellationToken ct = default);
    Task<WordEntry?> Word(Guid id, CancellationToken ct = default);
    Task<List<Book>> Books(CancellationToken ct = default);
    Task<Book?> Book(Guid id, CancellationToken ct = default);
    Task<List<Dialogue>> Dialogues(CancellationToken ct = default);
    Task<Dialogue?> Dialogue(Guid id, CancellationToken ct = default);
    Task<List<Exercise>> DraftExercises(CancellationToken ct = default);
    Task<List<Book>> DraftBooks(CancellationToken ct = default);
    Task<List<WordEntry>> DraftWords(CancellationToken ct = default);
    Task AddExercise(Exercise exercise, CancellationToken ct = default);
    Task AddBook(Book book, CancellationToken ct = default);
    Task<bool> AddChapter(BookChapter chapter, CancellationToken ct = default);
    Task AddWord(WordEntry word, CancellationToken ct = default);
    Task<bool> PublishExercise(Guid id, CancellationToken ct = default);
    Task<bool> PublishBook(Guid id, CancellationToken ct = default);
    Task<bool> PublishWord(Guid id, CancellationToken ct = default);
}

public sealed class EfCatalogRepository(AdamDbContext db) : ICatalogRepository
{
    public Task<List<Exercise>> Exercises(string? kind = null, CancellationToken ct = default) =>
        db.Exercises.AsNoTracking().Where(x => x.Published && !x.Archived && (kind == null || x.Kind == kind)).OrderBy(x => x.RussianPrompt).ToListAsync(ct);
    public Task<Exercise?> Exercise(Guid id, bool includeDraft = false, CancellationToken ct = default) =>
        db.Exercises.AsNoTracking().SingleOrDefaultAsync(x => x.Id == id && (includeDraft || (x.Published && !x.Archived)), ct);
    public Task<List<WordEntry>> Words(CancellationToken ct = default) =>
        db.Words.AsNoTracking().Where(x => x.Published && !x.Archived && x.DictionarySenseId == null).OrderBy(x => x.Ossetian).ToListAsync(ct);
    public Task<WordEntry?> Word(Guid id, CancellationToken ct = default) =>
        db.Words.AsNoTracking().SingleOrDefaultAsync(x => x.Id == id && x.Published && !x.Archived, ct);
    public Task<List<Book>> Books(CancellationToken ct = default) =>
        db.Books.AsNoTracking().Where(x => x.Published && !x.Archived).OrderBy(x => x.Title).ToListAsync(ct);
    public Task<Book?> Book(Guid id, CancellationToken ct = default) =>
        db.Books.AsNoTracking().Include(x => x.Chapters).SingleOrDefaultAsync(x => x.Id == id && x.Published && !x.Archived, ct);
    public Task<List<Dialogue>> Dialogues(CancellationToken ct = default) =>
        db.Dialogues.AsNoTracking().Where(x => x.Published && !x.Archived).OrderBy(x => x.Title).ToListAsync(ct);
    public Task<Dialogue?> Dialogue(Guid id, CancellationToken ct = default) =>
        db.Dialogues.AsNoTracking().SingleOrDefaultAsync(x => x.Id == id && x.Published && !x.Archived, ct);
    public Task<List<Exercise>> DraftExercises(CancellationToken ct = default) => db.Exercises.AsNoTracking().Where(x => !x.Published).ToListAsync(ct);
    public Task<List<Book>> DraftBooks(CancellationToken ct = default) => db.Books.AsNoTracking().Include(x => x.Chapters).Where(x => !x.Published).ToListAsync(ct);
    public Task<List<WordEntry>> DraftWords(CancellationToken ct = default) => db.Words.AsNoTracking().Where(x => !x.Published).ToListAsync(ct);
    public async Task AddExercise(Exercise exercise, CancellationToken ct = default) { db.Exercises.Add(exercise); await db.SaveChangesAsync(ct); }
    public async Task AddBook(Book book, CancellationToken ct = default) { db.Books.Add(book); await db.SaveChangesAsync(ct); }
    public async Task<bool> AddChapter(BookChapter chapter, CancellationToken ct = default)
    {
        if (!await db.Books.AnyAsync(x => x.Id == chapter.BookId && !x.Published, ct)) return false;
        db.Chapters.Add(chapter);
        await db.SaveChangesAsync(ct);
        return true;
    }
    public async Task AddWord(WordEntry word, CancellationToken ct = default) { db.Words.Add(word); await db.SaveChangesAsync(ct); }
    public async Task<bool> PublishExercise(Guid id, CancellationToken ct = default) => await db.Exercises.Where(x => x.Id == id && !x.Published).ExecuteUpdateAsync(x => x.SetProperty(p => p.Published, true), ct) == 1;
    public async Task<bool> PublishBook(Guid id, CancellationToken ct = default) => await db.Books.Where(x => x.Id == id && !x.Published).ExecuteUpdateAsync(x => x.SetProperty(p => p.Published, true), ct) == 1;
    public async Task<bool> PublishWord(Guid id, CancellationToken ct = default) => await db.Words.Where(x => x.Id == id && !x.Published).ExecuteUpdateAsync(x => x.SetProperty(p => p.Published, true), ct) == 1;
}

public interface IProgressRepository
{
    Task<ExerciseAttempt?> ActiveAttempt(Guid userId, Guid exerciseId, CancellationToken ct = default);
    Task<ExerciseAttempt?> Attempt(Guid userId, Guid attemptId, CancellationToken ct = default);
    Task CreateAttempt(ExerciseAttempt attempt, CancellationToken ct = default);
    Task<bool> SaveDraft(Guid userId, Guid attemptId, string indicesJson, CancellationToken ct = default);
    Task<bool> CompleteAttempt(Guid userId, Guid attemptId, string answer, bool correct, CancellationToken ct = default);
    Task<List<SavedWord>> SavedWords(Guid userId, CancellationToken ct = default);
    Task<bool> AddWord(Guid userId, Guid wordId, CancellationToken ct = default);
    Task<bool> RemoveWord(Guid userId, Guid wordId, CancellationToken ct = default);
    Task<bool> ReviewWord(Guid userId, Guid wordId, bool correct, CancellationToken ct = default);
    Task<ReadingPosition?> ReadingPosition(Guid userId, Guid bookId, CancellationToken ct = default);
    Task SaveReadingPosition(Guid userId, Guid bookId, Guid chapterId, int tokenIndex, CancellationToken ct = default);
    Task<List<DailyActivity>> Activities(Guid userId, CancellationToken ct = default);
    Task<List<Achievement>> Achievements(Guid userId, CancellationToken ct = default);
    Task<DialogueSession?> ActiveSession(Guid userId, Guid dialogueId, CancellationToken ct = default);
    Task<DialogueSession?> Session(Guid userId, Guid sessionId, CancellationToken ct = default);
    Task CreateSession(DialogueSession session, CancellationToken ct = default);
    Task<bool> SaveSessionState(Guid userId, Guid sessionId, string stateJson, int attempts, int errors, int hints, int turnsCompleted, CancellationToken ct = default);
    Task<bool> CompleteSession(Guid userId, Guid sessionId, CancellationToken ct = default);
    Task<List<DialogueSession>> SessionHistory(Guid userId, CancellationToken ct = default);
}

public sealed class EfProgressRepository(AdamDbContext db) : IProgressRepository
{
    public Task<ExerciseAttempt?> ActiveAttempt(Guid userId, Guid exerciseId, CancellationToken ct = default) =>
        db.Attempts.AsNoTracking().Where(x => x.UserId == userId && x.ExerciseId == exerciseId && x.CompletedAt == null).OrderByDescending(x => x.StartedAt).FirstOrDefaultAsync(ct);
    public Task<ExerciseAttempt?> Attempt(Guid userId, Guid attemptId, CancellationToken ct = default) =>
        db.Attempts.AsNoTracking().SingleOrDefaultAsync(x => x.UserId == userId && x.Id == attemptId, ct);
    public async Task CreateAttempt(ExerciseAttempt attempt, CancellationToken ct = default) { db.Attempts.Add(attempt); await db.SaveChangesAsync(ct); }
    public async Task<bool> SaveDraft(Guid userId, Guid attemptId, string indicesJson, CancellationToken ct = default) =>
        await db.Attempts.Where(x => x.Id == attemptId && x.UserId == userId && x.CompletedAt == null)
            .ExecuteUpdateAsync(x => x.SetProperty(p => p.DraftIndicesJson, indicesJson), ct) == 1;

    public async Task<bool> CompleteAttempt(Guid userId, Guid attemptId, string answer, bool correct, CancellationToken ct = default)
    {
        await using var tx = await db.Database.BeginTransactionAsync(ct);
        var now = DateTimeOffset.UtcNow;
        var updated = await db.Attempts.Where(x => x.Id == attemptId && x.UserId == userId && x.CompletedAt == null)
            .ExecuteUpdateAsync(x => x.SetProperty(p => p.CompletedAt, now).SetProperty(p => p.SubmittedAnswer, answer).SetProperty(p => p.Correct, correct), ct);
        if (updated != 1) { await tx.RollbackAsync(ct); return false; }
        var day = DateOnly.FromDateTime(now.UtcDateTime);
        var exerciseId = await db.Attempts.Where(x => x.Id == attemptId).Select(x => x.ExerciseId).SingleAsync(ct);
        var awarded = await db.Database.ExecuteSqlInterpolatedAsync($"INSERT INTO \"ExerciseRewards\" (\"UserId\", \"ExerciseId\", \"Day\") VALUES ({userId}, {exerciseId}, {day}) ON CONFLICT (\"UserId\", \"ExerciseId\", \"Day\") DO NOTHING", ct);
        if (awarded == 0) { await tx.CommitAsync(ct); return true; }
        await AwardDailyAsync(userId, day, now, ct);
        await tx.CommitAsync(ct);
        return true;
    }

    private async Task AwardDailyAsync(Guid userId, DateOnly day, DateTimeOffset now, CancellationToken ct)
    {
        await db.Database.ExecuteSqlInterpolatedAsync($"INSERT INTO \"DailyActivities\" (\"UserId\", \"Day\", \"Points\") VALUES ({userId}, {day}, 10) ON CONFLICT (\"UserId\", \"Day\") DO UPDATE SET \"Points\" = \"DailyActivities\".\"Points\" + 10", ct);
        var activityDays = await db.DailyActivities.AsNoTracking().Where(x => x.UserId == userId && x.Day <= day).Select(x => x.Day).ToListAsync(ct);
        var days = activityDays.ToHashSet();
        var streak = 0;
        for (var cursor = day; days.Contains(cursor); cursor = cursor.AddDays(-1)) streak++;
        foreach (var code in new[] { "first", streak >= 7 ? "streak-7" : "", streak >= 30 ? "streak-30" : "" }.Where(x => x.Length > 0))
            await db.Database.ExecuteSqlInterpolatedAsync($"INSERT INTO \"Achievements\" (\"UserId\", \"Code\", \"AwardedAt\") VALUES ({userId}, {code}, {now}) ON CONFLICT (\"UserId\", \"Code\") DO NOTHING", ct);
    }

    public Task<List<SavedWord>> SavedWords(Guid userId, CancellationToken ct = default) =>
        db.SavedWords.AsNoTracking().Include(x => x.Word).Where(x => x.UserId == userId && x.Word.Published)
            .OrderByDescending(x => x.Errors).ThenBy(x => x.ReviewedAt).ThenBy(x => x.AddedAt).ToListAsync(ct);
    public async Task<bool> AddWord(Guid userId, Guid wordId, CancellationToken ct = default)
    {
        if (!await db.Words.AnyAsync(x => x.Id == wordId && x.Published, ct)) return false;
        if (await db.SavedWords.AnyAsync(x => x.UserId == userId && x.WordId == wordId, ct)) return true;
        db.SavedWords.Add(new SavedWord { UserId = userId, WordId = wordId });
        try { await db.SaveChangesAsync(ct); return true; } catch (DbUpdateException) { return true; }
    }
    public async Task<bool> RemoveWord(Guid userId, Guid wordId, CancellationToken ct = default) =>
        await db.SavedWords.Where(x => x.UserId == userId && x.WordId == wordId).ExecuteDeleteAsync(ct) > 0;
    public async Task<bool> ReviewWord(Guid userId, Guid wordId, bool correct, CancellationToken ct = default) =>
        await db.SavedWords.Where(x => x.UserId == userId && x.WordId == wordId)
            .ExecuteUpdateAsync(x => x.SetProperty(p => p.ReviewedAt, DateTimeOffset.UtcNow)
                .SetProperty(p => p.Errors, p => correct ? p.Errors : p.Errors + 1), ct) == 1;
    public Task<ReadingPosition?> ReadingPosition(Guid userId, Guid bookId, CancellationToken ct = default) =>
        db.ReadingPositions.AsNoTracking().SingleOrDefaultAsync(x => x.UserId == userId && x.BookId == bookId, ct);
    public async Task SaveReadingPosition(Guid userId, Guid bookId, Guid chapterId, int tokenIndex, CancellationToken ct = default)
    {
        var now = DateTimeOffset.UtcNow;
        await db.Database.ExecuteSqlInterpolatedAsync($"INSERT INTO \"ReadingPositions\" (\"UserId\", \"BookId\", \"ChapterId\", \"TokenIndex\", \"UpdatedAt\") VALUES ({userId}, {bookId}, {chapterId}, {tokenIndex}, {now}) ON CONFLICT (\"UserId\", \"BookId\") DO UPDATE SET \"ChapterId\" = EXCLUDED.\"ChapterId\", \"TokenIndex\" = EXCLUDED.\"TokenIndex\", \"UpdatedAt\" = EXCLUDED.\"UpdatedAt\"", ct);
    }
    public Task<List<DailyActivity>> Activities(Guid userId, CancellationToken ct = default) => db.DailyActivities.AsNoTracking().Where(x => x.UserId == userId).OrderByDescending(x => x.Day).ToListAsync(ct);
    public Task<List<Achievement>> Achievements(Guid userId, CancellationToken ct = default) => db.Achievements.AsNoTracking().Where(x => x.UserId == userId).ToListAsync(ct);

    public Task<DialogueSession?> ActiveSession(Guid userId, Guid dialogueId, CancellationToken ct = default) =>
        db.DialogueSessions.AsNoTracking().Where(x => x.UserId == userId && x.DialogueId == dialogueId && x.CompletedAt == null).OrderByDescending(x => x.StartedAt).FirstOrDefaultAsync(ct);
    public Task<DialogueSession?> Session(Guid userId, Guid sessionId, CancellationToken ct = default) =>
        db.DialogueSessions.AsNoTracking().SingleOrDefaultAsync(x => x.UserId == userId && x.Id == sessionId, ct);
    public async Task CreateSession(DialogueSession session, CancellationToken ct = default)
    {
        db.DialogueSessions.Add(session);
        await db.SaveChangesAsync(ct);
    }
    public async Task<bool> SaveSessionState(Guid userId, Guid sessionId, string stateJson, int attempts, int errors, int hints, int turnsCompleted, CancellationToken ct = default) =>
        await db.DialogueSessions.Where(x => x.Id == sessionId && x.UserId == userId && x.CompletedAt == null)
            .ExecuteUpdateAsync(x => x.SetProperty(p => p.StateJson, stateJson)
                .SetProperty(p => p.Attempts, attempts).SetProperty(p => p.Errors, errors)
                .SetProperty(p => p.Hints, hints).SetProperty(p => p.TurnsCompleted, turnsCompleted), ct) == 1;

    public async Task<bool> CompleteSession(Guid userId, Guid sessionId, CancellationToken ct = default)
    {
        await using var tx = await db.Database.BeginTransactionAsync(ct);
        var now = DateTimeOffset.UtcNow;
        var updated = await db.DialogueSessions.Where(x => x.Id == sessionId && x.UserId == userId && x.CompletedAt == null)
            .ExecuteUpdateAsync(x => x.SetProperty(p => p.CompletedAt, now), ct);
        if (updated != 1) { await tx.RollbackAsync(ct); return false; }
        var day = DateOnly.FromDateTime(now.UtcDateTime);
        var dialogueId = await db.DialogueSessions.Where(x => x.Id == sessionId).Select(x => x.DialogueId).SingleAsync(ct);
        var awarded = await db.Database.ExecuteSqlInterpolatedAsync($"INSERT INTO \"DialogueRewards\" (\"UserId\", \"DialogueId\", \"Day\") VALUES ({userId}, {dialogueId}, {day}) ON CONFLICT (\"UserId\", \"DialogueId\", \"Day\") DO NOTHING", ct);
        if (awarded == 0) { await tx.CommitAsync(ct); return true; }
        await AwardDailyAsync(userId, day, now, ct);
        await tx.CommitAsync(ct);
        return true;
    }

    public Task<List<DialogueSession>> SessionHistory(Guid userId, CancellationToken ct = default) =>
        db.DialogueSessions.AsNoTracking().Where(x => x.UserId == userId && x.CompletedAt != null).OrderByDescending(x => x.CompletedAt).ToListAsync(ct);
}
