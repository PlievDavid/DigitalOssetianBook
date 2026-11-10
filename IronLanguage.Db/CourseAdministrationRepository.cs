using Microsoft.EntityFrameworkCore;

namespace IronLanguage.Db;

public sealed record CourseAdminItem(Course Course, string Author, CourseVersion? Publication);
public sealed record CourseMaterialAdminItem(string Kind, Guid Id, string Title, Guid? OwnerId, bool Blocked);

public interface ICourseAdministrationRepository
{
    Task<CourseAdminItem[]> Courses(CancellationToken ct);
    Task<CourseVersion[]> History(Guid course, CancellationToken ct);
    Task<bool> ChangeCourse(Guid actor, Guid course, bool blocked, string reason, CancellationToken ct);
    Task<CourseMaterialAdminItem[]> Materials(CancellationToken ct);
    Task<bool> ChangeMaterial(Guid actor, string kind, Guid id, Guid? owner, bool? blocked, string reason, CancellationToken ct);
}

public sealed class EfCourseAdministrationRepository(AdamDbContext db) : ICourseAdministrationRepository
{
    public Task<CourseAdminItem[]> Courses(CancellationToken ct) =>
        (from course in db.Courses.AsNoTracking()
         join user in db.Users on course.OwnerId equals user.Id
         join version in db.CourseVersions on course.PublishedVersionId equals (Guid?)version.Id into published
         from version in published.DefaultIfEmpty()
         orderby course.CreatedAt descending
         select new CourseAdminItem(course, user.PublicName ?? "Автор курса", version)).ToArrayAsync(ct);

    public Task<CourseVersion[]> History(Guid course, CancellationToken ct) =>
        db.CourseVersions.AsNoTracking().Where(x => x.CourseId == course).OrderByDescending(x => x.Number).ToArrayAsync(ct);

    public async Task<bool> ChangeCourse(Guid actor, Guid course, bool blocked, string reason, CancellationToken ct)
    {
        await using var tx = await db.Database.BeginTransactionAsync(ct);
        await db.Database.ExecuteSqlInterpolatedAsync($"SELECT pg_advisory_xact_lock(hashtextextended({"course-v2:" + course}, 0))", ct);
        var row = await db.Courses.SingleOrDefaultAsync(x => x.Id == course, ct);
        if (row is null) return false;
        if ((row.BlockReason != null) == blocked) return true;
        row.BlockReason = blocked ? reason : null;
        Audit(actor, course, "course-access", reason, blocked ? "open" : "blocked", blocked ? "blocked" : "open");
        await db.SaveChangesAsync(ct);
        await tx.CommitAsync(ct);
        return true;
    }

    public async Task<CourseMaterialAdminItem[]> Materials(CancellationToken ct)
    {
        var access = await db.CourseMaterialAccesses.AsNoTracking().ToDictionaryAsync(x => (x.Kind, x.MaterialId), ct);
        var materials = (await db.Exercises.Select(x => new { x.Kind, x.Id, Title = x.RussianPrompt }).ToArrayAsync(ct)).AsEnumerable()
            .Concat(await db.Matchings.Select(x => new { Kind = "matching", x.Id, x.Title }).ToArrayAsync(ct))
            .Concat(await db.PictureMatchings.Select(x => new { Kind = "picture", x.Id, x.Title }).ToArrayAsync(ct))
            .Concat(await db.Grammars.Select(x => new { Kind = "grammar", x.Id, x.Title }).ToArrayAsync(ct))
            .Concat(await db.Dialogues.Select(x => new { Kind = "dialogue", x.Id, x.Title }).ToArrayAsync(ct));
        return materials.Select(x =>
        {
            var settings = access.GetValueOrDefault((x.Kind, x.Id));
            return new CourseMaterialAdminItem(x.Kind, x.Id, x.Title, settings?.OwnerId, settings?.Blocked ?? false);
        }).OrderBy(x => x.Title).ToArray();
    }

    public async Task<bool> ChangeMaterial(Guid actor, string kind, Guid id, Guid? owner, bool? blocked, string reason, CancellationToken ct)
    {
        if (owner is null && blocked is null) return false;
        if (owner is Guid user && !await (from account in db.Users
            join membership in db.UserRoles on account.Id equals membership.UserId
            join role in db.Roles on membership.RoleId equals role.Id
            where account.Id == user && !account.IsBlocked && (role.Name == "Editor" || role.Name == "Admin")
            select account.Id).AnyAsync(ct)) return false;
        await using var tx = await db.Database.BeginTransactionAsync(ct);
        await db.Database.ExecuteSqlInterpolatedAsync($"SELECT pg_advisory_xact_lock(hashtextextended({$"course-material:{kind}:{id}"}, 0))", ct);
        var row = await db.CourseMaterialAccesses.SingleOrDefaultAsync(x => x.Kind == kind && x.MaterialId == id, ct);
        if (row is null)
        {
            if (!(await Materials(ct)).Any(x => x.Kind == kind && x.Id == id)) return false;
            row = new CourseMaterialAccess { Kind = kind, MaterialId = id, InCatalog = true };
            db.CourseMaterialAccesses.Add(row);
        }
        if (owner is Guid nextOwner)
        {
            if (row.OwnerId is not null) return false;
            row.OwnerId = nextOwner;
            Audit(actor, id, "material-owner", reason, "", nextOwner.ToString());
        }
        if (blocked is bool block && row.Blocked != block)
        {
            row.Blocked = block;
            Audit(actor, id, "material-access", reason, block ? "open" : "blocked", block ? "blocked" : "open");
        }
        await db.SaveChangesAsync(ct);
        await tx.CommitAsync(ct);
        return true;
    }

    private void Audit(Guid actor, Guid target, string action, string reason, string before, string after) =>
        db.AdminAudits.Add(new AdminAudit { ActorId = actor, TargetId = target, Action = action, Reason = reason, Before = before, After = after });
}
