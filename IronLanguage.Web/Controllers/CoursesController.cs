using System.Text.Json;
using IronLanguage.Db;
using IronLanguage.Web.Services;
using Microsoft.AspNetCore.Authorization;
using Microsoft.AspNetCore.Mvc;

namespace IronLanguage.Web.Controllers;

[AutoValidateAntiforgeryToken, RequestSizeLimit(1_000_000)]
public sealed class CoursesController(ICourseRepository courses, ICourseLearningRepository repository, CourseLearningService learning,
    ICatalogRepository catalog, GuestLearningStore guests, ILessonLibraryRepository library) : Controller
{
    [HttpGet("courses")]
    [HttpGet("courses/{id:guid}")]
    [HttpGet("courses/{id:guid}/contents")]
    [HttpGet("courses/sessions/{session:guid}")]
    public IActionResult Index() => View("Workspace");

    [HttpGet("my-courses"), Authorize]
    public IActionResult MyCourses() => View("Workspace");

    [HttpGet("author/courses"), Authorize(Roles = "Editor")]
    [HttpGet("courses/teaching"), Authorize(Roles = "Editor")]
    [HttpGet("author/courses/{id:guid}"), Authorize(Roles = "Editor")]
    public IActionResult Author() => View("Workspace");

    [HttpGet("api/v1/author/lesson-library"), Authorize(Roles = "Editor")]
    public async Task<IActionResult> LessonLibrary(CancellationToken ct) => Json((await library.Owned(User.UserId()!.Value, ct))
        .Select(x => new { x.Id, x.CreatedAt, lesson = JsonSerializer.Deserialize<CourseDraftLesson>(x.LessonJson, CourseAuthoringService.JsonOptions) }));

    public sealed record LibraryInput(long Stamp);
    [HttpPost("api/v1/author/courses/{id:guid}/lessons/{lesson:guid}/library"), Authorize(Roles = "Editor")]
    public async Task<IActionResult> SaveLibrary(Guid id, Guid lesson, [FromBody] LibraryInput input, CancellationToken ct)
    {
        if (input is null || !ModelState.IsValid) return BadRequest();
        var course = await courses.Owned(id, User.UserId()!.Value, ct);
        if (course is null) return NotFound();
        if (course.DraftStamp != input.Stamp) return Conflict(new { error = "Урок изменился. Сохраните актуальную версию." });
        var draft = JsonSerializer.Deserialize<CourseDraft>(course.DraftJson, CourseAuthoringService.JsonOptions)!;
        var selected = draft.Modules.SelectMany(m => m.Lessons).SingleOrDefault(l => l.Id == lesson);
        if (selected is null) return NotFound();
        selected = selected with { Blocks = selected.Blocks.Select(b => b with { PublishedExercise = null }).ToArray() };
        var result = await library.Save(new LibraryLesson { OwnerId = User.UserId()!.Value, SourceCourseId = id, SourceLessonId = lesson,
            SourceStamp = input.Stamp, LessonJson = JsonSerializer.Serialize(selected, CourseAuthoringService.JsonOptions) }, ct);
        return Json(new { result.Id });
    }

    [HttpGet("editor/curriculum"), Authorize(Roles = "Editor")]
    public IActionResult OldEditor() => Redirect("/author/courses");

    [HttpGet("api/v1/courses")]
    public async Task<IActionResult> Catalog(CancellationToken ct)
    {
        var versions = await repository.Published(ct);
        var authors = await repository.AuthorNames(versions.Select(v => v.CourseId).ToArray(), ct);
        return Json(versions.Select(v => { var d = CourseLearningService.Read(v); return new { id = v.CourseId, d.Title, d.Description, d.Level,
            author = authors.GetValueOrDefault(v.CourseId, "Автор курса"), lessons = d.Modules.Sum(x => x.Lessons.Length), version = v.Number }; }));
    }

    [HttpGet("api/v1/me/courses"), Authorize]
    public async Task<IActionResult> Mine(CancellationToken ct)
    {
        var list = new List<object>();
        foreach (var e in await repository.Enrollments(User.UserId()!.Value, ct))
            if (await learning.Version(e.CourseId, User.UserId(), guests.Owner(HttpContext), ct) is { } v)
            {
                var d = CourseLearningService.Read(v);
                var done = await learning.Completed(e.CourseId, v.Id, User.UserId(), guests.Owner(HttpContext), ct);
                list.Add(new { id = e.CourseId, d.Title, d.Description, d.Level, lessons = d.Modules.Sum(x => x.Lessons.Length), completed = done.Count, version = v.Number });
            }
        return Json(list);
    }

    [HttpGet("api/v1/courses/{id:guid}")]
    public async Task<IActionResult> Details(Guid id, CancellationToken ct)
    {
        var owner = guests.Owner(HttpContext);
        var v = await learning.Version(id, User.UserId(), owner, ct);
        if (v is null) return NotFound();
        var d = CourseLearningService.Read(v);
        var done = await learning.Completed(id, v.Id, User.UserId(), owner, ct);
        var unlocked = true;
        var modules = d.Modules.Select(m => new { m.Id, m.Title, lessons = m.Lessons.Select(l => {
            var available = !d.Sequential || unlocked;
            if (!done.Contains(l.Id)) unlocked = false;
            return new { l.Id, l.Title, blocks = l.Blocks.Length, completed = done.Contains(l.Id), available };
        }).ToArray() }).ToArray();
        var author = (await repository.AuthorNames([id], ct)).GetValueOrDefault(id, "Автор курса");
        return Json(new { id, d.Title, d.Description, d.Outcomes, d.Level, d.Sequential, author, version = v.Number, modules });
    }

    [HttpGet("api/v1/author/courses"), Authorize(Roles = "Editor")]
    public async Task<IActionResult> Owned(CancellationToken ct) => Json((await repository.Owned(User.UserId()!.Value, ct)).Select(c => {
        var d = JsonSerializer.Deserialize<CourseDraft>(c.DraftJson, CourseAuthoringService.JsonOptions)!;
        return new { c.Id, d.Title, d.Description, c.Archived, published = c.PublishedVersionId != null, c.DraftStamp, modules = d.Modules.Length, lessons = d.Modules.Sum(m => m.Lessons.Length) };
    }));

    [HttpGet("api/v1/author/course-materials"), Authorize(Roles = "Editor")]
    public async Task<IActionResult> Materials(CancellationToken ct) => Json((await catalog.Exercises(ct: ct)).Where(x => x.Kind == "translation")
        .Select(x => new { x.Id, title = x.RussianPrompt, x.Kind }));

    [HttpPost("api/v1/author/courses/{id:guid}/archive"), Authorize(Roles = "Editor")]
    public async Task<IActionResult> Archive(Guid id, CancellationToken ct) => await repository.Archive(id, User.UserId()!.Value, ct) ? NoContent() : NotFound();

    [HttpPost("api/v1/courses/{id:guid}/lessons/{lesson:guid}/sessions")]
    public async Task<IActionResult> Start(Guid id, Guid lesson, CancellationToken ct)
    {
        try
        {
            var s = await learning.Start(id, lesson, User.UserId(), guests.Owner(HttpContext), ct);
            return s is null ? NotFound() : Json(new { s.Id });
        }
        catch (ArgumentException e) { return BadRequest(new { error = e.Message }); }
        catch (GuestCapacityException e) { return StatusCode(503, new { error = e.Message }); }
    }

    [HttpPost("api/v1/author/courses/{id:guid}/preview/{lesson:guid}"), Authorize(Roles = "Editor")]
    public async Task<IActionResult> Preview(Guid id, Guid lesson, CancellationToken ct)
    {
        var course = await courses.Owned(id, User.UserId()!.Value, ct);
        if (course is null) return NotFound();
        try
        {
            var draft = JsonSerializer.Deserialize<CourseDraft>(course.DraftJson, CourseAuthoringService.JsonOptions)!;
            var selected = draft.Modules.SelectMany(x => x.Lessons).SingleOrDefault(x => x.Id == lesson);
            if (selected is null) return NotFound();
            CourseAuthoringService.Validate(draft with { Modules = [new(Guid.NewGuid(), "Предпросмотр", [selected])] }, true);
            var blocks = new List<CourseDraftBlock>();
            foreach (var block in selected.Blocks)
            {
                if (block.Kind == "theory") { blocks.Add(block); continue; }
                var exercise = await catalog.Exercise(block.MaterialId!.Value, ct: ct);
                if (exercise is null || exercise.Kind != "translation") throw new ArgumentException("Выберите доступное упражнение.");
                blocks.Add(block with { PublishedExercise = exercise });
            }
            var preview = new CourseVersion { CourseId = id, SnapshotJson = JsonSerializer.Serialize(draft with {
                Modules = [new(Guid.NewGuid(), "Предпросмотр", [selected with { Blocks = blocks.ToArray() }])] }, CourseAuthoringService.JsonOptions) };
            var s = await learning.Start(id, lesson, User.UserId(), guests.Owner(HttpContext), ct, preview);
            return Json(new { s!.Id });
        }
        catch (ArgumentException e) { return BadRequest(new { error = e.Message }); }
        catch (GuestCapacityException e) { return StatusCode(503, new { error = e.Message }); }
    }

    [HttpGet("api/v1/course-sessions/{id:guid}")]
    public async Task<IActionResult> Session(Guid id, CancellationToken ct)
    {
        if (!CanAccessSession(id)) return NotFound();
        try { return await learning.State(id, User.UserId(), guests.Owner(HttpContext), ct) is { } state ? Json(state) : NotFound(); }
        catch (ArgumentException e) { return BadRequest(new { error = e.Message }); }
    }

    public sealed record StepInput(Guid BlockId);
    public sealed record AnswerInput(Guid BlockId, int[] TokenIndices);
    [HttpPost("api/v1/course-sessions/{id:guid}/answers")]
    public async Task<IActionResult> Answer(Guid id, [FromBody] AnswerInput input, CancellationToken ct)
    {
        if (!CanAccessSession(id)) return NotFound();
        if (!ModelState.IsValid || input is null || input.TokenIndices is null) return BadRequest();
        try { return await learning.Answer(id, input.BlockId, input.TokenIndices, User.UserId(), guests.Owner(HttpContext), ct) is { } answer ? Json(answer) : NotFound(); }
        catch (ArgumentException e) { return BadRequest(new { error = e.Message }); }
    }
    [HttpPost("api/v1/course-sessions/{id:guid}/next")]
    public async Task<IActionResult> Next(Guid id, [FromBody] StepInput input, CancellationToken ct)
    {
        if (!CanAccessSession(id)) return NotFound();
        if (!ModelState.IsValid || input is null) return BadRequest();
        return await learning.Advance(id, input.BlockId, User.UserId(), guests.Owner(HttpContext), ct) ? NoContent() : Conflict(new { error = "Сначала завершите текущий блок." });
    }
    private bool CanAccessSession(Guid id) => guests.Find<GuestCourseSession>(guests.Owner(HttpContext), id)?.Value.Preview != true || User.IsInRole("Editor");
}
