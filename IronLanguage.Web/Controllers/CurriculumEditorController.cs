using System.Text.Json;
using IronLanguage.Db;
using IronLanguage.Web.Models;
using IronLanguage.Web.Services;
using Microsoft.AspNetCore.Authorization;
using Microsoft.AspNetCore.Mvc;

namespace IronLanguage.Web.Controllers;

[Authorize(Roles = "Editor"), AutoValidateAntiforgeryToken, Route("editor/curriculum")]
public sealed class CurriculumEditorController(ICurriculumRepository repository, CurriculumService curriculum, IWebHostEnvironment environment) : Controller
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

    [HttpGet("course/{id:guid}/report")]
    public async Task<IActionResult> Report(Guid id, CancellationToken ct)
    {
        if (await repository.GetOwned("course", id, User.UserId()!.Value, ct) is null ||
            await repository.Get("course", id, false, ct) is not { } course) return NotFound();
        return View(await curriculum.Report(course, ct));
    }

    [HttpGet("{kind}/new")]
    public async Task<IActionResult> New(string kind, CancellationToken ct) => !CurriculumService.IsKind(kind) ? NotFound() :
        await FormView(kind, Guid.NewGuid(), new CurriculumForm(), ct);

    private async Task<IActionResult> FormView(string kind, Guid id, CurriculumForm form, CancellationToken ct)
    {
        if (kind == "lesson") ViewData["LessonWords"] = await curriculum.Words(ct);
        return View("Form", new CurriculumEditorModel(kind, id, form, await curriculum.Choices(kind, User.UserId()!.Value, ct)));
    }

    [HttpGet("{kind}/{id:guid}/edit")]
    public async Task<IActionResult> Edit(string kind, Guid id, CancellationToken ct)
    {
        if (!CurriculumService.IsKind(kind)) return NotFound();
        var revision = await repository.GetOwned(kind, id, User.UserId()!.Value, ct);
        return revision is null ? NotFound() : await FormView(kind, id, CurriculumService.Form(revision), ct);
    }

    [HttpPost("{kind}/{id:guid}/edit"), RequestSizeLimit(6_000_000)]
    public async Task<IActionResult> Save(string kind, Guid id, CurriculumForm form, string? action, IFormFile? coverImage, bool removeCover, CancellationToken ct)
    {
        if (!CurriculumService.IsKind(kind)) return NotFound();
        var existing = await repository.Get(kind, id, true, ct);
        if (existing is not null && await repository.GetOwned(kind, id, User.UserId()!.Value, ct) is null) return NotFound();
        // Existing paths come only from the owned revision, never from the posted form.
        form.CoverPath = kind == "course" && existing is not null ? CurriculumService.Parse(existing).CoverPath : null;
        string? newCoverFile = null;
        try
        {
            var document = await curriculum.Validate(kind, form, User.UserId()!.Value, ct);
            if (!ModelState.IsValid) throw new ArgumentException("Проверьте заполнение полей.");
            if (kind == "course" && coverImage is { Length: > 0 })
            {
                if (coverImage.Length > 5_000_000) throw new ArgumentException("Обложка должна быть не больше 5 МБ.");
                var extension = Path.GetExtension(coverImage.FileName).ToLowerInvariant();
                await using var stream = new MemoryStream();
                await coverImage.CopyToAsync(stream, ct);
                var bytes = stream.ToArray();
                var valid = extension switch
                {
                    ".png" => bytes.Length >= 8 && bytes.AsSpan(0, 8).SequenceEqual(new byte[] { 137, 80, 78, 71, 13, 10, 26, 10 }),
                    ".jpg" or ".jpeg" => bytes.Length >= 3 && bytes[0] == 255 && bytes[1] == 216 && bytes[2] == 255,
                    ".webp" => bytes.Length >= 12 && System.Text.Encoding.ASCII.GetString(bytes, 0, 4) == "RIFF" && System.Text.Encoding.ASCII.GetString(bytes, 8, 4) == "WEBP",
                    _ => false
                };
                if (!valid) throw new ArgumentException("Выберите изображение PNG, JPEG или WebP.");
                var folder = Path.Combine(environment.WebRootPath, "media", "courses");
                Directory.CreateDirectory(folder);
                var name = Guid.NewGuid().ToString("N") + extension;
                newCoverFile = Path.Combine(folder, name);
                await System.IO.File.WriteAllBytesAsync(newCoverFile, bytes, ct);
                form.CoverPath = "/media/courses/" + name;
            }
            else if (removeCover) form.CoverPath = null;
            document.CoverPath = form.CoverPath;
            if (!await repository.Save(kind, id, JsonSerializer.Serialize(document, CurriculumService.JsonOptions), User.UserId()!.Value, form.Stamp ?? "", ct))
            {
                if (newCoverFile is not null) System.IO.File.Delete(newCoverFile);
                Response.StatusCode = 409;
                throw new ArgumentException("Материал изменился в другой вкладке. Скопируйте свои правки и откройте конструктор заново.");
            }
            if (kind == "lesson" && action is "create-audio" or "create-translation" or "create-dialogue" or "create-listening")
                return Redirect($"/editor/new/{action[7..]}?lessonId={id}");
            if (action != "preview") TempData["CurriculumSaved"] = "Черновик сохранён";
            return Redirect($"/editor/curriculum/{kind}/{id}/{(action == "preview" ? "preview" : "edit")}");
        }
        catch (ArgumentException error) { ModelState.AddModelError("", error.Message); }
        form.CoverPath = kind == "course" && existing is not null ? CurriculumService.Parse(existing).CoverPath : null;
        return await FormView(kind, id, form, ct);
    }

    [HttpGet("{kind}/{id:guid}/preview")]
    public async Task<IActionResult> Preview(string kind, Guid id, CancellationToken ct)
    {
        if (!CurriculumService.IsKind(kind)) return NotFound();
        var revision = await repository.GetOwned(kind, id, User.UserId()!.Value, ct);
        ViewData["PreviousLesson"] = kind == "lesson" && await repository.Get(kind, id, false, ct) is not null;
        return revision is null ? NotFound() : View(new CurriculumPreview(kind, revision, CurriculumService.Parse(revision), await curriculum.Choices(kind, User.UserId()!.Value, ct)));
    }

    [HttpPost("{kind}/{id:guid}/publish")]
    public async Task<IActionResult> Publish(string kind, Guid id, Guid draftId, string stamp, bool reviewed, CancellationToken ct, bool preserveProgress = false)
    {
        if (!CurriculumService.IsKind(kind)) return NotFound();
        var revision = await repository.GetOwned(kind, id, User.UserId()!.Value, ct);
        if (revision is null || revision.Published) return NotFound();
        try
        {
            if (!reviewed) throw new ArgumentException("Подтвердите проверку материала и прав на него.");
            await curriculum.Validate(kind, CurriculumService.Form(revision), User.UserId()!.Value, ct, publishing: true);
            if (!await repository.Publish(kind, id, draftId, stamp, User.UserId()!.Value, ct, preserveProgress))
            {
                Response.StatusCode = 409;
                throw new ArgumentException("Черновик изменился. Просмотрите актуальную версию перед публикацией.");
            }
            return Redirect($"/editor/curriculum?kind={kind}");
        }
        catch (ArgumentException error)
        {
            ViewData["PreviousLesson"] = kind == "lesson" && await repository.Get(kind, id, false, ct) is not null;
            return View("Preview", new CurriculumPreview(kind, revision, CurriculumService.Parse(revision), await curriculum.Choices(kind, User.UserId()!.Value, ct), error.Message));
        }
    }

    [HttpGet("{kind}/choices")]
    public async Task<IActionResult> Choices(string kind, CancellationToken ct) => !CurriculumService.IsKind(kind) ? NotFound() : Json(await curriculum.Choices(kind, User.UserId()!.Value, ct));
}
