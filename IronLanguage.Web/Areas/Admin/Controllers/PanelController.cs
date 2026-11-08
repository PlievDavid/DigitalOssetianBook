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
[Area("Admin"), Authorize(Roles = "Admin"), AutoValidateAntiforgeryToken, Route("admin")]
[TypeFilter(typeof(AdminExceptionFilter))]
[ResponseCache(NoStore = true, Location = ResponseCacheLocation.None)]
public sealed class PanelController(IAdminRepository repository, AdminService service, UserManager<UserAccount> users, TimeProvider clock) : Controller
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
}
