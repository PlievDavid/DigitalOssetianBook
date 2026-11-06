using IronLanguage.Db;
using IronLanguage.Web.Models;
using IronLanguage.Web.Services;
using Microsoft.AspNetCore.Mvc;

namespace IronLanguage.Web.Controllers;

[AutoValidateAntiforgeryToken]
public sealed class CurriculumController(ICurriculumRepository repository, CurriculumService curriculum, GuestLearningStore guests) : Controller
{
    private static string CourseQuery(Guid? id) => id.HasValue ? $"?courseId={id}" : "";

    [HttpGet("courses")]
    public Task<IActionResult> Index(CancellationToken ct, string? q = null, string filter = "all") => Catalog("course", q, filter, ct);

    [HttpGet("lessons")]
    public Task<IActionResult> Lessons(CancellationToken ct, string? q = null) => Catalog("lesson", q, "all", ct);

    private async Task<IActionResult> Catalog(string kind, string? q, string filter, CancellationToken ct)
    {
        var query = (q ?? "").Trim();
        var items = (await repository.List(kind, false, ct)).Select(x => new CurriculumItem(x, CurriculumService.Parse(x))).ToArray();
        var lessons = kind == "lesson" ? items : (await repository.List("lesson", false, ct)).Select(x => new CurriculumItem(x, CurriculumService.Parse(x))).ToArray();
        var runs = User.UserId() is Guid user ? await repository.Runs(user, ct) : [];
        bool Complete(CurriculumItem item) => item.Document.LessonIds.Length > 0 && item.Document.LessonIds.All(id =>
            lessons.Any(lesson => lesson.Revision.ContentId == id && runs.Any(run => run.LessonId == id && run.LessonVersion == lesson.Revision.Version && run.CompletedAt != null)));
        filter = filter is "started" or "completed" ? filter : "all";
        items = items.Where(x => x.Document.Title.Contains(query, StringComparison.OrdinalIgnoreCase) &&
            (filter == "all" || filter == "completed" && Complete(x) || filter == "started" && !Complete(x) && runs.Any(run => x.Document.LessonIds.Contains(run.LessonId))))
            .OrderBy(x => x.Document.Title).ToArray();
        return View("Index", new CurriculumCatalog(items, lessons, runs, kind, query, filter));
    }

    [HttpGet("courses/{id:guid}")]
    public async Task<IActionResult> Course(Guid id, CancellationToken ct)
    {
        var course = await repository.Get("course", id, false, ct);
        if (course is null) return NotFound();
        var document = CurriculumService.Parse(course);
        var lessons = new List<CurriculumItem>();
        foreach (var lessonId in document.LessonIds)
        {
            var revision = await repository.Get("lesson", lessonId, false, ct);
            if (revision is not null) lessons.Add(new(revision, CurriculumService.Parse(revision)));
        }
        ViewData["CourseAbout"] = true;
        return View("About", new CoursePage(new(course, document), lessons.ToArray(), User.UserId() is Guid user ? await repository.Runs(user, ct) : []));
    }

    [HttpGet("courses/{id:guid}/contents")]
    public async Task<IActionResult> Contents(Guid id, CancellationToken ct)
    {
        var result = await Course(id, ct);
        if (result is not ViewResult view) return result;
        ViewData["CourseAbout"] = false;
        return View("Course", view.Model);
    }

    [HttpGet("courses/{id:guid}/about")]
    public async Task<IActionResult> About(Guid id, CancellationToken ct)
    {
        var result = await Course(id, ct);
        if (result is not ViewResult view) return result;
        return View("About", view.Model);
    }

    [HttpGet("lessons/{id:guid}")]
    public async Task<IActionResult> Lesson(Guid id, CancellationToken ct, Guid? courseId = null)
    {
        var revision = await repository.Get("lesson", id, false, ct);
        ViewData["CourseId"] = courseId;
        return revision is null ? NotFound() : View(new CurriculumItem(revision, CurriculumService.Parse(revision)));
    }

    [HttpPost("lessons/{id:guid}/start")]
    public async Task<IActionResult> Start(Guid id, CancellationToken ct, Guid? courseId = null)
    {
        try
        {
            var run = await curriculum.Start(User.UserId(), guests.Owner(HttpContext), id, ct);
            return run is null ? NotFound() : Redirect($"/lessons/runs/{run.Id}{CourseQuery(courseId)}");
        }
        catch (GuestCapacityException error) { return StatusCode(503, error.Message); }
        catch (ArgumentException error)
        {
            TempData["LessonError"] = error.Message;
            return Redirect($"/lessons/{id}{CourseQuery(courseId)}");
        }
    }

    [HttpGet("lessons/runs/{id:guid}")]
    public async Task<IActionResult> Run(Guid id, CancellationToken ct, Guid? courseId = null, int? step = null)
    {
        var run = await curriculum.Run(User.UserId(), guests.Owner(HttpContext), id, ct);
        if (run is null) return NotFound();
        CoursePage? course = null;
        if (courseId is Guid courseKey && await Course(courseKey, ct) is ViewResult { Model: CoursePage candidate } && candidate.Lessons.Any(x => x.Revision.ContentId == run.LessonId))
            course = candidate;
        var snapshot = CurriculumService.Snapshot(run);
        var selected = step ?? Math.Min(run.Step, snapshot.Cards.Length - 1);
        if (selected < 0 || selected >= snapshot.Cards.Length) return NotFound();
        return View(new LessonPage(run, snapshot, TempData[$"LessonError:{id}"] as string, course, selected, CurriculumService.CompletedSteps(run, snapshot)));
    }

    [HttpPost("lessons/runs/{id:guid}/next")]
    public async Task<IActionResult> Next(Guid id, int step, CancellationToken ct, Guid? courseId = null)
    {
        if (!ModelState.IsValid) return BadRequest();
        var owner = guests.Owner(HttpContext);
        var run = await curriculum.Run(User.UserId(), owner, id, ct);
        if (run is null) return NotFound();
        if (!await curriculum.Advance(User.UserId(), owner, run, step, ct))
        {
            TempData[$"LessonError:{id}"] = "Сначала завершите задание. Если урок открыт в другой вкладке, обновите страницу.";
            return Redirect($"/lessons/runs/{id}?step={step}" + (courseId.HasValue ? $"&courseId={courseId}" : ""));
        }
        return Redirect($"/lessons/runs/{id}{CourseQuery(courseId)}");
    }

    [HttpPut("api/v1/lessons/runs/{id:guid}/draft")]
    public async Task<IActionResult> GuestDraft(Guid id, [FromBody] AnswerInput? input, CancellationToken ct, int? step = null)
    {
        if (input is null || !ModelState.IsValid) return BadRequest(new { error = "Некорректный черновик ответа." });
        if (User.UserId() is not null) return NotFound();
        var owner = guests.Owner(HttpContext);
        var run = await curriculum.Run(null, owner, id, ct);
        if (run is null) return NotFound();
        try
        {
            var saved = await curriculum.SaveGuestDraft(owner, run, input.TokenIndices ?? [], ct, step);
            return saved is null ? NotFound() : saved.Value ? NoContent() : Conflict();
        }
        catch (ArgumentException error) { return BadRequest(new { error = error.Message }); }
    }

    [HttpGet("api/v1/lessons/runs/{id:guid}/exercise")]
    public async Task<IActionResult> Exercise(Guid id, CancellationToken ct, int? step = null)
    {
        var owner = guests.Owner(HttpContext);
        var run = await curriculum.Run(User.UserId(), owner, id, ct);
        if (run is null) return NotFound();
        var data = await curriculum.Exercise(User.UserId(), owner, run, ct, step);
        return data is null ? NotFound() : Json(data);
    }
}
