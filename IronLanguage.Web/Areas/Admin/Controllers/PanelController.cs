using System.ComponentModel.DataAnnotations;
using IronLanguage.Db;
using IronLanguage.Web.Services;
using Microsoft.AspNetCore.Authorization;
using Microsoft.AspNetCore.Identity;
using Microsoft.AspNetCore.Mvc;
namespace IronLanguage.Web.Areas.Admin.Controllers;

public sealed class AdminChangeInput
{
    [Required] public string Action { get; set; } = "";
    [Required, StringLength(500, MinimumLength = 3, ErrorMessage = "Укажите причину от 3 до 500 символов.")] public string Reason { get; set; } = "";
    [Required] public string Stamp { get; set; } = "";
}
public sealed record AdminUserModel(AdminUserDetails Details, string Stamp);
public sealed record AdminCourseRow(CourseAdminItem Item, CourseDraft Draft);
[Area("Admin"), Authorize(Roles = "Admin"), AutoValidateAntiforgeryToken, Route("admin")]
[TypeFilter(typeof(AdminExceptionFilter))]
[ResponseCache(NoStore = true, Location = ResponseCacheLocation.None)]
public sealed class PanelController(IAdminRepository repository, AdminService service, UserManager<UserAccount> users, TimeProvider clock,
    ICourseAdministrationRepository courses) : Controller
{
    [HttpGet("")]
    public async Task<IActionResult> Index(int days = 30, CancellationToken ct = default) => View(await repository.Overview(days, clock.GetUtcNow(), ct));
    [HttpGet("users")]
    public async Task<IActionResult> Users(string? q, string? role, string? status, string? sort, int page = 1, CancellationToken ct = default) => View(await repository.Users(q, role, status, sort, page, ct));
    [HttpGet("users/{id:guid}")]
    public async Task<IActionResult> Details(Guid id, CancellationToken ct)
    {
        var details = await repository.User(id, ct); if (details is null) return NotFound();
        var user = await users.FindByIdAsync(id.ToString()); if (user is null) return NotFound();
        return View(new AdminUserModel(details, user.ConcurrencyStamp!));
    }
    [HttpPost("users/{id:guid}")]
    public async Task<IActionResult> Change(Guid id, AdminChangeInput input, CancellationToken ct)
    {
        if (ModelState.IsValid)
        {
            try
            {
                await service.Change(User.UserId(), id, input.Action, input.Reason, input.Stamp, ct);
                TempData["AdminSuccess"] = "Изменение сохранено.";
                return RedirectToAction(nameof(Details), new { id });
            }
            catch (ArgumentException error) { ModelState.AddModelError("", error.Message); }
            catch (UnauthorizedAccessException) { return Forbid(); }
        }
        Response.StatusCode = 400;
        ViewData["Reason"] = input.Reason;
        var details = await repository.User(id, ct); if (details is null) return NotFound();
        var user = await users.FindByIdAsync(id.ToString());
        return View("Details", new AdminUserModel(details, user?.ConcurrencyStamp ?? ""));
    }
    [HttpGet("materials")]
    public async Task<IActionResult> Materials(CancellationToken ct) => View(await repository.Materials(ct));
    [HttpGet("audit")]
    public async Task<IActionResult> Audit(int page = 1, CancellationToken ct = default) => View(await repository.Audit(page, ct));

    [HttpGet("courses")]
    public async Task<IActionResult> Courses(string? q, string? status, int page = 1, CancellationToken ct = default)
    {
        q = q?.Trim() ?? "";
        var rows = (await courses.Courses(ct)).Select(x => new AdminCourseRow(x, ReadDraft(x.Course.DraftJson)))
            .Where(x => (x.Draft.Title.Contains(q, StringComparison.OrdinalIgnoreCase) || x.Item.Author.Contains(q, StringComparison.OrdinalIgnoreCase)) &&
                (status switch { "blocked" => x.Item.Course.BlockReason != null, "archived" => x.Item.Course.Archived,
                    "published" => x.Item.Course.PublishedVersionId != null && x.Item.Course.BlockReason == null && !x.Item.Course.Archived,
                    "draft" => x.Item.Course.PublishedVersionId == null, _ => true })).ToArray();
        page = Math.Clamp(page, 1, Math.Max(1, (rows.Length + 19) / 20));
        ViewData["Query"] = q; ViewData["Status"] = status; ViewData["Page"] = page; ViewData["More"] = page * 20 < rows.Length;
        return View(rows.Skip((page - 1) * 20).Take(20).ToArray());
    }

    [HttpGet("courses/{id:guid}")]
    public async Task<IActionResult> CourseHistory(Guid id, CancellationToken ct)
    {
        var course = (await courses.Courses(ct)).FirstOrDefault(x => x.Course.Id == id);
        if (course is null) return NotFound();
        ViewData["Course"] = course;
        return View(await courses.History(id, ct));
    }

    [HttpPost("courses/{id:guid}/access")]
    public async Task<IActionResult> CourseAccess(Guid id, bool blocked, string? reason, CancellationToken ct)
    {
        if (!ValidReason(reason)) return BadRequest("Укажите причину от 3 до 500 символов.");
        return await courses.ChangeCourse(User.UserId()!.Value, id, blocked, reason!.Trim(), ct)
            ? RedirectToAction(nameof(CourseHistory), new { id }) : NotFound();
    }

    [HttpGet("course-materials")]
    public async Task<IActionResult> CourseMaterials(string? q, int page = 1, CancellationToken ct = default)
    {
        q = q?.Trim() ?? "";
        var rows = (await courses.Materials(ct)).Where(x => x.Title.Contains(q, StringComparison.OrdinalIgnoreCase)).ToArray();
        page = Math.Clamp(page, 1, Math.Max(1, (rows.Length + 19) / 20));
        ViewData["Query"] = q; ViewData["Page"] = page; ViewData["More"] = page * 20 < rows.Length;
        return View(rows.Skip((page - 1) * 20).Take(20).ToArray());
    }

    [HttpGet("course-materials/{kind}/{id:guid}")]
    public async Task<IActionResult> CourseMaterial(string kind, Guid id, CancellationToken ct)
    {
        var item = (await courses.Materials(ct)).FirstOrDefault(x => x.Kind == kind && x.Id == id);
        if (item is null) return NotFound();
        var active = (await courses.Courses(ct)).Where(x => x.Publication is not null && CourseLearningService.Read(x.Publication).Modules
            .SelectMany(m => m.Lessons).SelectMany(l => l.Blocks).Any(b => b.Kind == kind && b.MaterialId == id)).ToArray();
        ViewData["Affected"] = active;
        return View(item);
    }

    [HttpPost("course-materials/{kind}/{id:guid}")]
    public async Task<IActionResult> MaterialAccess(string kind, Guid id, Guid? owner, bool? blocked, string? reason, CancellationToken ct)
    {
        if (!ModelState.IsValid || !ValidReason(reason)) return BadRequest("Проверьте владельца и укажите причину от 3 до 500 символов.");
        return await courses.ChangeMaterial(User.UserId()!.Value, kind, id, owner, blocked, reason!.Trim(), ct)
            ? RedirectToAction(nameof(CourseMaterial), new { kind, id }) : NotFound();
    }

    private static bool ValidReason(string? reason) => reason?.Trim().Length is >= 3 and <= 500;
    private static CourseDraft ReadDraft(string value) => System.Text.Json.JsonSerializer.Deserialize<CourseDraft>(value, CourseAuthoringService.JsonOptions)!;
}
