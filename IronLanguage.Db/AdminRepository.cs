using Microsoft.EntityFrameworkCore;
namespace IronLanguage.Db;

public sealed record AdminUserRow(Guid Id, string Email, string Name, DateTimeOffset CreatedAt, bool Blocked, string[] Roles);
public sealed record AdminUserPage(List<AdminUserRow> Rows, int Total, int Page, string Query, string Role, string Status, string Sort)
{
    public int Pages => Math.Max(1, (Total + 24) / 25);
}
public sealed record AdminUserDetails(AdminUserRow User, int ActiveDays, int Points, int Exercises, int Dialogues, int Lessons, int SavedWords);
public sealed record RegistrationDay(DateOnly Day, int Count);
public sealed record AdminDay(DateOnly Day, int Registrations, int Active, long Views);
public sealed record AdminOverview(int Days, int Users, int Registrations, int Active, int Exercises, int Dialogues, int Lessons,
    DateTimeOffset? AnalyticsStarted, List<AdminDay> Timeline, List<DailyMetric> Metrics);
public sealed record MaterialCount(string Kind, int Published, int Draft, int Archived);
public sealed record AuditPage(List<AdminAudit> Rows, int Total, int Page) { public int Pages => Math.Max(1, (Total + 24) / 25); }

public interface IAdminRepository
{
    Task<AdminUserPage> Users(string? query, string? role, string? status, string? sort, int page, CancellationToken ct);
    Task<AdminUserDetails?> User(Guid id, CancellationToken ct);
    Task<AdminOverview> Overview(int days, DateTimeOffset now, CancellationToken ct);
    Task<List<MaterialCount>> Materials(CancellationToken ct);
    Task<AuditPage> Audit(int page, CancellationToken ct);
    Task Mutate(Func<Task> operation, CancellationToken ct);
    Task<bool> IsActiveAdmin(Guid id, CancellationToken ct);
    Task<int> ActiveAdmins(CancellationToken ct);
    Task AddAudit(AdminAudit audit, CancellationToken ct);
}
public sealed class EfAdminRepository(AdamDbContext db) : IAdminRepository
{
    private IQueryable<UserAccount> ActiveAdminQuery => db.Users.Where(u => !u.IsBlocked && db.UserRoles.Any(ur => ur.UserId == u.Id && db.Roles.Any(r => r.Id == ur.RoleId && r.Name == "Admin")));
    public Task<bool> IsActiveAdmin(Guid id, CancellationToken ct) => ActiveAdminQuery.AnyAsync(x => x.Id == id, ct);
    public Task<int> ActiveAdmins(CancellationToken ct) => ActiveAdminQuery.CountAsync(ct);
    public async Task Mutate(Func<Task> operation, CancellationToken ct)
    {
        await using var transaction = await db.Database.BeginTransactionAsync(ct);
        // All admin mutations (including the CLI) take the same transaction-scoped lock.
        await db.Database.ExecuteSqlRawAsync("SELECT pg_advisory_xact_lock(1840257901)", ct);
        await operation();
        await transaction.CommitAsync(ct);
    }
    public async Task AddAudit(AdminAudit audit, CancellationToken ct) { db.AdminAudits.Add(audit); await db.SaveChangesAsync(ct); }
    private async Task<List<AdminUserRow>> Rows(List<UserAccount> users, CancellationToken ct)
    {
        var ids = users.Select(x => x.Id).ToArray();
        var roles = await (from ur in db.UserRoles join r in db.Roles on ur.RoleId equals r.Id where ids.Contains(ur.UserId) select new { ur.UserId, r.Name }).ToListAsync(ct);
        return users.Select(u => new AdminUserRow(u.Id, u.Email ?? "", u.PublicName ?? "", u.CreatedAt, u.IsBlocked,
            roles.Where(r => r.UserId == u.Id).Select(r => r.Name!).Order().ToArray())).ToList();
    }
    public async Task<AdminUserPage> Users(string? query, string? role, string? status, string? sort, int page, CancellationToken ct)
    {
        query = (query ?? "").Trim(); if (query.Length > 254) query = query[..254];
        role = role is "Admin" or "Editor" ? role : ""; status = status is "blocked" or "active" ? status : ""; sort = sort is "oldest" or "name" ? sort : "newest";
        var q = db.Users.AsNoTracking();
        if (query.Length > 0) { var search = query.ToLowerInvariant(); q = q.Where(u => (u.Email ?? "").ToLower().Contains(search) || (u.PublicName ?? "").ToLower().Contains(search)); }
        if (role.Length > 0) q = q.Where(u => db.UserRoles.Any(ur => ur.UserId == u.Id && db.Roles.Any(r => r.Id == ur.RoleId && r.Name == role)));
        if (status.Length > 0) q = q.Where(u => u.IsBlocked == (status == "blocked"));
        var total = await q.CountAsync(ct); page = Math.Clamp(page, 1, Math.Max(1, (total + 24) / 25));
        q = sort switch { "oldest" => q.OrderBy(u => u.CreatedAt).ThenBy(u => u.Id), "name" => q.OrderBy(u => u.PublicName).ThenBy(u => u.Id), _ => q.OrderByDescending(u => u.CreatedAt).ThenBy(u => u.Id) };
        return new(await Rows(await q.Skip((page - 1) * 25).Take(25).ToListAsync(ct), ct), total, page, query, role, status, sort);
    }
    public async Task<AdminUserDetails?> User(Guid id, CancellationToken ct)
    {
        var u = await db.Users.AsNoTracking().SingleOrDefaultAsync(x => x.Id == id, ct); if (u is null) return null;
        return new((await Rows([u], ct))[0], await db.DailyActivities.CountAsync(x => x.UserId == id, ct),
            await db.DailyActivities.Where(x => x.UserId == id).SumAsync(x => x.Points, ct),
            await db.Attempts.CountAsync(x => x.UserId == id && x.CompletedAt != null, ct),
            await db.DialogueSessions.CountAsync(x => x.UserId == id && x.CompletedAt != null, ct),
            await db.LessonRuns.CountAsync(x => x.UserId == id && x.CompletedAt != null, ct), await db.SavedWords.CountAsync(x => x.UserId == id, ct));
    }
    public async Task<AdminOverview> Overview(int days, DateTimeOffset now, CancellationToken ct)
    {
        days = days is 7 or 90 ? days : 30;
        var today = DateOnly.FromDateTime(now.UtcDateTime); var first = today.AddDays(1 - days);
        var start = new DateTimeOffset(first.ToDateTime(TimeOnly.MinValue), TimeSpan.Zero); var end = new DateTimeOffset(today.AddDays(1).ToDateTime(TimeOnly.MinValue), TimeSpan.Zero);
        var registrations = await db.Database.SqlQuery<RegistrationDay>($"SELECT (\"CreatedAt\" AT TIME ZONE 'UTC')::date AS \"Day\", count(*)::int AS \"Count\" FROM \"Users\" WHERE \"CreatedAt\" >= {start} AND \"CreatedAt\" < {end} GROUP BY 1").ToListAsync(ct);
        var activity = await db.DailyActivities.Where(x => x.Day >= first && x.Day <= today).GroupBy(x => x.Day).Select(g => new { Day = g.Key, Count = g.Count() }).ToListAsync(ct);
        var metrics = await db.DailyMetrics.AsNoTracking().Where(x => x.Day >= first && x.Day <= today).ToListAsync(ct);
        var timeline = Enumerable.Range(0, days).Select(i => { var day = first.AddDays(i); return new AdminDay(day,
            registrations.FirstOrDefault(x => x.Day == day)?.Count ?? 0, activity.FirstOrDefault(x => x.Day == day)?.Count ?? 0,
            metrics.Where(x => x.Day == day && x.Event == "view").Sum(x => x.Count)); }).ToList();
        return new(days, await db.Users.CountAsync(ct), registrations.Sum(x => x.Count),
            await db.DailyActivities.Where(x => x.Day >= first && x.Day <= today).Select(x => x.UserId).Distinct().CountAsync(ct),
            await db.Attempts.CountAsync(x => x.CompletedAt >= start && x.CompletedAt < end, ct),
            await db.DialogueSessions.CountAsync(x => x.CompletedAt >= start && x.CompletedAt < end, ct),
            await db.LessonRuns.CountAsync(x => x.CompletedAt >= start && x.CompletedAt < end, ct),
            await db.AnalyticsStates.Select(x => (DateTimeOffset?)x.StartedAt).SingleOrDefaultAsync(ct), timeline, metrics);
    }
    public async Task<List<MaterialCount>> Materials(CancellationToken ct)
    {
        var rows = await db.Words.Where(x => x.DictionarySenseId == null).Select(x => new { Kind = "word", x.Published, x.Archived, Draft = !x.Published || db.ContentRevisions.Any(r => r.Kind == "word" && r.ContentId == x.Id && !r.Published) })
            .Concat(db.Exercises.Select(x => new { Kind = x.Kind, x.Published, x.Archived, Draft = !x.Published || db.ContentRevisions.Any(r => r.Kind == x.Kind && r.ContentId == x.Id && !r.Published) }))
            .Concat(db.Books.Select(x => new { Kind = "book", x.Published, x.Archived, Draft = !x.Published || db.ContentRevisions.Any(r => r.Kind == "book" && r.ContentId == x.Id && !r.Published) }))
            .Concat(db.Dialogues.Select(x => new { Kind = "dialogue", x.Published, x.Archived, Draft = !x.Published || db.ContentRevisions.Any(r => r.Kind == "dialogue" && r.ContentId == x.Id && !r.Published) }))
            .Concat(db.Matchings.Select(x => new { Kind = "matching", x.Published, x.Archived, Draft = !x.Published || db.ContentRevisions.Any(r => r.Kind == "matching" && r.ContentId == x.Id && !r.Published) }))
            .Concat(db.PictureMatchings.Select(x => new { Kind = "picture", x.Published, x.Archived, Draft = !x.Published || db.ContentRevisions.Any(r => r.Kind == "picture" && r.ContentId == x.Id && !r.Published) }))
            .GroupBy(x => x.Kind).Select(g => new { Kind = g.Key, Published = g.Count(x => x.Published && !x.Archived), Draft = g.Count(x => x.Draft && !x.Archived), Archived = g.Count(x => x.Archived) }).ToListAsync(ct);
        var result = rows.Select(x => new MaterialCount(x.Kind, x.Published, x.Draft, x.Archived)).ToList();
        result.Add(new("course", await db.Courses.CountAsync(x => !x.Archived && x.PublishedVersionId != null, ct),
            await db.Courses.CountAsync(x => !x.Archived && !db.CourseVersions.Any(v => v.Id == x.PublishedVersionId && v.SourceDraftStamp == x.DraftStamp), ct),
            await db.Courses.CountAsync(x => x.Archived, ct)));
        return result.OrderBy(x => x.Kind).ToList();
    }
    public async Task<AuditPage> Audit(int page, CancellationToken ct)
    {
        var count = await db.AdminAudits.CountAsync(ct); page = Math.Clamp(page, 1, Math.Max(1, (count + 24) / 25));
        return new(await db.AdminAudits.AsNoTracking().OrderByDescending(x => x.Id).Skip((page - 1) * 25).Take(25).ToListAsync(ct), count, page);
    }
}
