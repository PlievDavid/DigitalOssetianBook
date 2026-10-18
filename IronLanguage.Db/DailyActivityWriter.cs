using Microsoft.EntityFrameworkCore;

namespace IronLanguage.Db;

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
