using Microsoft.EntityFrameworkCore;

namespace IronLanguage.Db;

public sealed class WordleGame
{
    public Guid UserId { get; set; }
    public DateOnly Day { get; set; }
    public string ExpectedWord { get; set; } = "";
    public string Russian { get; set; } = "";
    public string GuessesJson { get; set; } = "[]";
    public int Revision { get; set; }
    public bool Won { get; set; }
}

public interface IWordleRepository
{
    Task<WordleGame?> Find(Guid userId, DateOnly day, CancellationToken ct);
    Task<WordleGame> Open(WordleGame initial, CancellationToken ct);
    Task<bool> Save(Guid userId, DateOnly day, int revision, string guessesJson, bool won, DateTimeOffset now, CancellationToken ct);
    Task<List<WordleGame>> History(Guid userId, CancellationToken ct);
}

public sealed class EfWordleRepository(AdamDbContext db) : IWordleRepository
{
    public Task<WordleGame?> Find(Guid userId, DateOnly day, CancellationToken ct) =>
        db.WordleGames.AsNoTracking().SingleOrDefaultAsync(x => x.UserId == userId && x.Day == day, ct);
    public async Task<WordleGame> Open(WordleGame initial, CancellationToken ct)
    {
        await db.Database.ExecuteSqlInterpolatedAsync($"INSERT INTO \"WordleGames\" (\"UserId\", \"Day\", \"ExpectedWord\", \"Russian\", \"GuessesJson\", \"Revision\", \"Won\") VALUES ({initial.UserId}, {initial.Day}, {initial.ExpectedWord}, {initial.Russian}, '[]', 0, FALSE) ON CONFLICT DO NOTHING", ct);
        return await db.WordleGames.AsNoTracking().SingleAsync(x => x.UserId == initial.UserId && x.Day == initial.Day, ct);
    }

    public async Task<bool> Save(Guid userId, DateOnly day, int revision, string guessesJson, bool won, DateTimeOffset now, CancellationToken ct)
    {
        await using var tx = await db.Database.BeginTransactionAsync(ct);
        var updated = await db.WordleGames.Where(x => x.UserId == userId && x.Day == day && x.Revision == revision && !x.Won && x.Revision < 6)
            .ExecuteUpdateAsync(x => x.SetProperty(p => p.GuessesJson, guessesJson).SetProperty(p => p.Won, won).SetProperty(p => p.Revision, revision + 1), ct);
        if (updated != 1) return false;
        // A win marks a day of the existing activity streak, without awarding points.
        if (won) await DailyActivityWriter.Record(db, userId, day, now, 0, ct);
        await tx.CommitAsync(ct);
        return true;
    }

    public Task<List<WordleGame>> History(Guid userId, CancellationToken ct) =>
        db.WordleGames.AsNoTracking().Where(x => x.UserId == userId).OrderByDescending(x => x.Day).ToListAsync(ct);
}

internal static class DailyActivityWriter
{
    public static async Task Record(AdamDbContext db, Guid userId, DateOnly day, DateTimeOffset now, int points, CancellationToken ct)
    {
        await db.Database.ExecuteSqlInterpolatedAsync($"INSERT INTO \"DailyActivities\" (\"UserId\", \"Day\", \"Points\") VALUES ({userId}, {day}, {points}) ON CONFLICT (\"UserId\", \"Day\") DO UPDATE SET \"Points\" = \"DailyActivities\".\"Points\" + {points}", ct);
        var days = (await db.DailyActivities.AsNoTracking().Where(x => x.UserId == userId && x.Day <= day).Select(x => x.Day).ToListAsync(ct)).ToHashSet();
        var streak = 0;
        for (var cursor = day; days.Contains(cursor); cursor = cursor.AddDays(-1)) streak++;
        foreach (var code in new[] { "first", streak >= 7 ? "streak-7" : "", streak >= 30 ? "streak-30" : "" }.Where(x => x.Length > 0))
            await db.Database.ExecuteSqlInterpolatedAsync($"INSERT INTO \"Achievements\" (\"UserId\", \"Code\", \"AwardedAt\") VALUES ({userId}, {code}, {now}) ON CONFLICT (\"UserId\", \"Code\") DO NOTHING", ct);
    }
}
