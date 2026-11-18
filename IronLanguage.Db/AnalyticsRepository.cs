using Microsoft.EntityFrameworkCore;
namespace IronLanguage.Db;
public interface IAnalyticsRepository
{
    Task Increment(DateOnly day, string section, string eventName, CancellationToken ct);
    Task Cleanup(DateOnly today, CancellationToken ct);
}
public sealed class EfAnalyticsRepository(AdamDbContext db) : IAnalyticsRepository
{
    public async Task Increment(DateOnly day, string section, string eventName, CancellationToken ct)
    {
        await db.Database.ExecuteSqlInterpolatedAsync($"INSERT INTO \"AnalyticsStates\" (\"Id\", \"StartedAt\") VALUES (1, CURRENT_TIMESTAMP) ON CONFLICT (\"Id\") DO NOTHING", ct);
        await db.Database.ExecuteSqlInterpolatedAsync($"INSERT INTO \"DailyMetrics\" (\"Day\", \"Section\", \"Event\", \"Count\") VALUES ({day}, {section}, {eventName}, 1) ON CONFLICT (\"Day\", \"Section\", \"Event\") DO UPDATE SET \"Count\" = \"DailyMetrics\".\"Count\" + 1", ct);
    }
    public Task Cleanup(DateOnly today, CancellationToken ct) => db.DailyMetrics.Where(x => x.Day < today.AddMonths(-12)).ExecuteDeleteAsync(ct);
}
