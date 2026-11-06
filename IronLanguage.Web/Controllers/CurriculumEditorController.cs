using System.Text.Json;
using IronLanguage.Db;
using IronLanguage.Web.Models;
using IronLanguage.Web.Services;
using Microsoft.AspNetCore.Authorization;
using Microsoft.AspNetCore.Mvc;

namespace IronLanguage.Web.Controllers;

[Authorize(Roles = "Editor"), AutoValidateAntiforgeryToken, Route("editor/curriculum")]
public sealed class CurriculumEditorController(ICurriculumRepository repository, CurriculumService curriculum) : Controller
{
    [HttpGet("")]
    public async Task<IActionResult> Index(string? kind, string? q, CancellationToken ct)
    {
        kind = string.IsNullOrEmpty(kind) ? "course" : kind;
        if (!CurriculumService.IsKind(kind)) return NotFound();
        q = (q ?? "").Trim();
        ViewData["Kind"] = kind;
        ViewData["Query"] = q;
        var items = (await repository.ListOwned(kind, User.UserId()!.Value, false, ct))
            .Select(x => new CurriculumItem(x, CurriculumService.Parse(x)))
            .Where(x => q.Length == 0 || x.Document.Title.Contains(q, StringComparison.CurrentCultureIgnoreCase))
            .OrderBy(x => x.Document.Title).ToArray();
        return View(items);
    }

    [HttpGet("{kind}/new")]
    public async Task<IActionResult> New(string kind, CancellationToken ct) => !CurriculumService.IsKind(kind) ? NotFound() :
        View("Form", new CurriculumEditorModel(kind, Guid.NewGuid(), new CurriculumForm(), await curriculum.Choices(kind, User.UserId()!.Value, ct)));

    [HttpGet("{kind}/{id:guid}/edit")]
    public async Task<IActionResult> Edit(string kind, Guid id, CancellationToken ct)
    {
        if (!CurriculumService.IsKind(kind)) return NotFound();
        var revision = await repository.GetOwned(kind, id, User.UserId()!.Value, ct);
        return revision is null ? NotFound() : View("Form", new CurriculumEditorModel(kind, id, CurriculumService.Form(revision), await curriculum.Choices(kind, User.UserId()!.Value, ct)));
    }

    [HttpPost("{kind}/{id:guid}/edit"), RequestSizeLimit(1_000_000)]
    public async Task<IActionResult> Save(string kind, Guid id, CurriculumForm form, string? action, CancellationToken ct)
    {
        if (!CurriculumService.IsKind(kind)) return NotFound();
        var existing = await repository.Get(kind, id, true, ct);
        if (existing is not null && await repository.GetOwned(kind, id, User.UserId()!.Value, ct) is null) return NotFound();
        try
        {
            var document = await curriculum.Validate(kind, form, User.UserId()!.Value, ct);
            if (!ModelState.IsValid) throw new ArgumentException("Проверьте заполнение полей.");
            if (!await repository.Save(kind, id, JsonSerializer.Serialize(document, CurriculumService.JsonOptions), User.UserId()!.Value, form.Stamp ?? "", ct))
            {
                Response.StatusCode = 409;
                throw new ArgumentException("Материал изменился в другой вкладке. Скопируйте свои правки и откройте конструктор заново.");
            }
            if (kind == "lesson" && action is "create-audio" or "create-translation" or "create-dialogue")
                return Redirect($"/editor/new/{action[7..]}?lessonId={id}");
            if (action != "preview") TempData["CurriculumSaved"] = "Черновик сохранён";
            return Redirect($"/editor/curriculum/{kind}/{id}/{(action == "preview" ? "preview" : "edit")}");
        }
        catch (ArgumentException error) { ModelState.AddModelError("", error.Message); }
        return View("Form", new CurriculumEditorModel(kind, id, form, await curriculum.Choices(kind, User.UserId()!.Value, ct)));
    }

    [HttpGet("{kind}/{id:guid}/preview")]
    public async Task<IActionResult> Preview(string kind, Guid id, CancellationToken ct)
    {
        if (!CurriculumService.IsKind(kind)) return NotFound();
        var revision = await repository.GetOwned(kind, id, User.UserId()!.Value, ct);
        return revision is null ? NotFound() : View(new CurriculumPreview(kind, revision, CurriculumService.Parse(revision), await curriculum.Choices(kind, User.UserId()!.Value, ct)));
    }

    [HttpPost("{kind}/{id:guid}/publish")]
    public async Task<IActionResult> Publish(string kind, Guid id, Guid draftId, string stamp, bool reviewed, CancellationToken ct)
    {
        if (!CurriculumService.IsKind(kind)) return NotFound();
        var revision = await repository.GetOwned(kind, id, User.UserId()!.Value, ct);
        if (revision is null || revision.Published) return NotFound();
        try
        {
            if (!reviewed) throw new ArgumentException("Подтвердите проверку материала и прав на него.");
            await curriculum.Validate(kind, CurriculumService.Form(revision), User.UserId()!.Value, ct, publishing: true);
            if (!await repository.Publish(kind, id, draftId, stamp, User.UserId()!.Value, ct))
            {
                Response.StatusCode = 409;
                throw new ArgumentException("Черновик изменился. Просмотрите актуальную версию перед публикацией.");
            }
            return Redirect($"/editor/curriculum?kind={kind}");
        }
        catch (ArgumentException error)
        {
            return View("Preview", new CurriculumPreview(kind, revision, CurriculumService.Parse(revision), await curriculum.Choices(kind, User.UserId()!.Value, ct), error.Message));
        }
    }

    [HttpGet("{kind}/choices")]
    public async Task<IActionResult> Choices(string kind, CancellationToken ct) => !CurriculumService.IsKind(kind) ? NotFound() : Json(await curriculum.Choices(kind, User.UserId()!.Value, ct));
}
