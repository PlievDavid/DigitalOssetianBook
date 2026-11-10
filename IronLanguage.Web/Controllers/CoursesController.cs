using System.Text.Json;
using IronLanguage.Db;
using IronLanguage.Web.Services;
using Microsoft.AspNetCore.Authorization;
using Microsoft.AspNetCore.Mvc;

namespace IronLanguage.Web.Controllers;

[AutoValidateAntiforgeryToken, RequestSizeLimit(1_000_000)]
public sealed class CoursesController(ICourseRepository courses, ICourseLearningRepository repository, CourseLearningService learning,
    ICourseMaterialRepository materials, CourseAuthoringService authoring, GuestLearningStore guests, ILessonLibraryRepository library, IWebHostEnvironment environment) : Controller
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
    [HttpGet("author/courses/{id:guid}/analytics"), Authorize(Roles = "Editor")]
    public IActionResult Author() => View("Workspace");

    [HttpGet("api/v1/author/lesson-library"), Authorize(Roles = "Editor")]
    public async Task<IActionResult> LessonLibrary(CancellationToken ct) => Json((await library.Owned(User.UserId()!.Value, ct))
        .Select(x => new { x.Id, x.CreatedAt, x.SourceCourseId, x.SourceLessonId, x.SourceStamp, lesson = JsonSerializer.Deserialize<CourseDraftLesson>(x.LessonJson, CourseAuthoringService.JsonOptions) }));

    [HttpGet("api/v1/author/lesson-library/{id:guid}/uses"), Authorize(Roles = "Editor")]
    public async Task<IActionResult> LibraryUses(Guid id, CancellationToken ct)
    {
        var owner = User.UserId()!.Value;
        var source = await library.Owned(owner, id, ct);
        if (source is null) return NotFound();
        var older = (await library.Owned(owner, ct)).Where(x => x.SourceCourseId == source.SourceCourseId &&
            x.SourceLessonId == source.SourceLessonId && x.SourceStamp < source.SourceStamp).Select(x => x.Id).ToHashSet();
        return Json((await repository.Owned(owner, ct)).Select(x =>
        {
            var draft = JsonSerializer.Deserialize<CourseDraft>(x.DraftJson, CourseAuthoringService.JsonOptions)!;
            return new { x.Id, x.DraftStamp, draft.Title, count = draft.Modules.SelectMany(m => m.Lessons)
                .Count(l => l.LibraryVersionId is Guid version && older.Contains(version)) };
        }).Where(x => x.count > 0));
    }

    [HttpGet("api/v1/author/lesson-library/{id:guid}/inclusion"), Authorize(Roles = "Editor")]
    public async Task<IActionResult> LibraryInclusion(Guid id, CancellationToken ct) =>
        await library.Owned(User.UserId()!.Value, id, ct) is { } source ? Json(CourseAuthoringService.Include(source, Guid.NewGuid())) : NotFound();

    public sealed record LibraryUpdate(Guid CourseId, long Stamp);
    public sealed record LibraryUpdates(LibraryUpdate[] Courses);
    [HttpPost("api/v1/author/lesson-library/{id:guid}/update"), Authorize(Roles = "Editor")]
    public async Task<IActionResult> ApplyLibrary(Guid id, [FromBody] LibraryUpdates input, CancellationToken ct)
    {
        if (!ModelState.IsValid || input?.Courses is not { Length: > 0 and <= 100 }) return BadRequest();
        var owner = User.UserId()!.Value;
        var source = await library.Owned(owner, id, ct);
        if (source is null) return NotFound();
        var older = (await library.Owned(owner, ct)).Where(x => x.SourceCourseId == source.SourceCourseId &&
            x.SourceLessonId == source.SourceLessonId && x.SourceStamp < source.SourceStamp).ToDictionary(x => x.Id);
        var results = new List<object>();
        foreach (var update in input.Courses.DistinctBy(x => x.CourseId))
        {
            var course = await courses.Owned(update.CourseId, owner, ct);
            if (course is null || course.DraftStamp != update.Stamp)
            {
                results.Add(new { id = update.CourseId, saved = false, error = "Черновик изменился или недоступен." });
                continue;
            }
            try
            {
                var draft = JsonSerializer.Deserialize<CourseDraft>(course.DraftJson, CourseAuthoringService.JsonOptions)!;
                var modules = draft.Modules.Select(m => m with { Lessons = m.Lessons.Select(l =>
                {
                    if (l.LibraryVersionId is not Guid version || !older.TryGetValue(version, out var previous)) return l;
                    if (JsonSerializer.Serialize(l, CourseAuthoringService.JsonOptions) != JsonSerializer.Serialize(CourseAuthoringService.Include(previous, l.Id), CourseAuthoringService.JsonOptions))
                        throw new ArgumentException($"Связанный урок «{l.Title}» содержит локальные изменения. Отделите копию перед обновлением.");
                    return CourseAuthoringService.Include(source, l.Id);
                }).ToArray() }).ToArray();
                var saved = await authoring.Save(course.Id, owner, update.Stamp, draft with { Modules = modules }, ct) is not null;
                results.Add(new { id = course.Id, saved, error = saved ? null : "Черновик изменился." });
            }
            catch (ArgumentException error) { results.Add(new { id = course.Id, saved = false, error = error.Message }); }
        }
        return Json(results);
    }

    [HttpPost("api/v1/author/courses/{id:guid}/cover"), Authorize(Roles = "Editor"), RequestSizeLimit(6_000_000)]
    public async Task<IActionResult> Cover(Guid id, IFormFile file, CancellationToken ct)
    {
        if (await courses.Owned(id, User.UserId()!.Value, ct) is null) return NotFound();
        if (file is null || file.Length == 0 || file.Length > 5_000_000) return BadRequest(new { error = "Выберите изображение до 5 МБ." });
        await using var buffer = new MemoryStream(); await file.CopyToAsync(buffer, ct);
        var bytes = buffer.ToArray(); var extension = Path.GetExtension(file.FileName).ToLowerInvariant();
        var valid = extension switch {
            ".png" => bytes.Length >= 8 && bytes.AsSpan(0, 8).SequenceEqual(new byte[] { 137, 80, 78, 71, 13, 10, 26, 10 }),
            ".jpg" or ".jpeg" => bytes.Length >= 3 && bytes[0] == 255 && bytes[1] == 216 && bytes[2] == 255,
            ".webp" => bytes.Length >= 12 && System.Text.Encoding.ASCII.GetString(bytes, 0, 4) == "RIFF" && System.Text.Encoding.ASCII.GetString(bytes, 8, 4) == "WEBP",
            _ => false
        };
        if (!valid) return BadRequest(new { error = "Нужен PNG, JPEG или WebP." });
        var folder = Path.Combine(environment.WebRootPath, "media", "course-covers"); Directory.CreateDirectory(folder);
        var name = Guid.NewGuid().ToString("N") + extension;
        await System.IO.File.WriteAllBytesAsync(Path.Combine(folder, name), bytes, ct);
        return Json(new { path = "/media/course-covers/" + name });
    }
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
        if (selected.LibraryVersionId is not null) return BadRequest(new { error = "Откройте оригинал связанного урока." });
        selected = selected with { Blocks = selected.Blocks.Select(b => b with { PublishedExercise = null, PublishedActivity = null }).ToArray() };
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
        var counts = await learning.Counts(versions.ToArray(), User.UserId(), guests.Owner(HttpContext), ct);
        return Json(versions.Select(v => CourseCard(v, counts[v.CourseId], authors.GetValueOrDefault(v.CourseId, "Автор курса"))));
    }

    [HttpGet("api/v1/me/courses"), Authorize]
    public async Task<IActionResult> Mine(CancellationToken ct)
    {
        var versions = await repository.Mine(User.UserId()!.Value, ct);
        var counts = await learning.Counts(versions, User.UserId(), guests.Owner(HttpContext), ct);
        return Json(versions.Select(v => CourseCard(v, counts[v.CourseId], null)));
    }

    private static object CourseCard(CourseVersion version, CourseLearningService.CourseCounts progress, string? author)
    {
        var draft = CourseLearningService.Read(version);
        return new { id = version.CourseId, draft.Title, draft.Description, draft.CoverPath, draft.Theme, draft.Level, author,
            lessons = draft.Modules.Sum(m => m.Lessons.Length), completed = progress.CompletedLessons,
            progress.CompletedBlocks, progress.TotalBlocks, progress.Percent, version = version.Number };
    }

    [HttpGet("api/v1/courses/{id:guid}")]
    public async Task<IActionResult> Details(Guid id, CancellationToken ct)
    {
        var owner = guests.Owner(HttpContext);
        if (await repository.BlockReason(id, ct) is { } reason) return StatusCode(403, new { error = "Курс недоступен. " + reason });
        var v = await learning.Version(id, User.UserId(), owner, ct);
        if (v is null) return NotFound();
        var d = CourseLearningService.Read(v);
        var done = await learning.Completed(id, v.Id, User.UserId(), owner, ct);
        var active = await learning.Opened(id, User.UserId(), owner, ct);
        var unlocked = true;
        var modules = d.Modules.Select(m => new { m.Id, m.Title, lessons = m.Lessons.Select(l => {
            var available = !d.Sequential || unlocked || active.Any(s => s.LessonId == l.Id);
            if (!done.Contains(l.Id)) unlocked = false;
            return new { l.Id, l.Title, blocks = l.Blocks.Length, completed = done.Contains(l.Id), started = active.Any(s => s.LessonId == l.Id), available };
        }).ToArray() }).ToArray();
        var blocks = await learning.BlockProgress(id, v, User.UserId(), owner, ct);
        var firstCompletedAt = await learning.FirstCompletion(id, User.UserId(), owner, ct);
        var author = (await repository.AuthorNames([id], ct)).GetValueOrDefault(id, "Автор курса");
        return Json(new { totalBlocks = blocks.Total, completedBlocks = blocks.Completed, percent = blocks.Total == 0 ? 0 : blocks.Completed * 100 / blocks.Total,
            firstCompletedAt, id, d.Title, d.Description, d.DescriptionRichText, d.CoverPath, d.Theme, d.Outcomes, d.Level, d.Sequential, author, version = v.Number, modules,
            started = active.Length > 0 || done.Count > 0,
            resumeLessonId = active.FirstOrDefault(s => !done.Contains(s.LessonId) && modules.SelectMany(m => m.lessons).Any(l => l.Id == s.LessonId))?.LessonId });
    }

    [HttpGet("api/v1/author/courses"), Authorize(Roles = "Editor")]
    public async Task<IActionResult> Owned(CancellationToken ct) => Json((await repository.Owned(User.UserId()!.Value, ct)).Select(c => {
        var d = JsonSerializer.Deserialize<CourseDraft>(c.DraftJson, CourseAuthoringService.JsonOptions)!;
        return new { c.Id, d.Title, d.Description, c.Archived, published = c.PublishedVersionId != null, c.DraftStamp, modules = d.Modules.Length, lessons = d.Modules.Sum(m => m.Lessons.Length) };
    }));

    [HttpGet("api/v1/author/course-materials"), Authorize(Roles = "Editor")]
    public async Task<IActionResult> Materials(CancellationToken ct, string? kind, string? q, bool own = true, int page = 1)
    {
        if (page is < 1 or > 10_000 || q?.Length > 150) return BadRequest();
        return Json(await materials.Search(User.UserId()!.Value, kind, q, own, page, ct));
    }

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
    public async Task<IActionResult> Preview(Guid id, Guid lesson, CancellationToken ct, Guid? version = null)
    {
        var course = await courses.Owned(id, User.UserId()!.Value, ct);
        if (course is null) return NotFound();
        try
        {
            if (version is Guid historical)
            {
                if (await repository.Snapshot(historical, ct) is not { } snapshot || snapshot.CourseId != id ||
                    !CourseLearningService.Read(snapshot).Modules.SelectMany(m => m.Lessons).Any(l => l.Id == lesson)) return NotFound();
                var historicalSession = await learning.Start(id, lesson, User.UserId(), guests.Owner(HttpContext), ct, snapshot);
                return Json(new { historicalSession!.Id });
            }
            var draft = JsonSerializer.Deserialize<CourseDraft>(course.DraftJson, CourseAuthoringService.JsonOptions)!;
            var selected = draft.Modules.SelectMany(x => x.Lessons).SingleOrDefault(x => x.Id == lesson);
            if (selected is null) return NotFound();
            draft = draft with { Modules = [new(Guid.NewGuid(), "Предпросмотр", [selected])] };
            CourseAuthoringService.Validate(draft, true);
            var resolved = await authoring.Resolve(course, draft, ct);
            var preview = new CourseVersion { CourseId = id, SnapshotJson = JsonSerializer.Serialize(resolved, CourseAuthoringService.JsonOptions) };
            var s = await learning.Start(id, lesson, User.UserId(), guests.Owner(HttpContext), ct, preview);
            return Json(new { s!.Id });
        }
        catch (ArgumentException e) { return BadRequest(new { error = e.Message }); }
        catch (GuestCapacityException e) { return StatusCode(503, new { error = e.Message }); }
    }

    [HttpGet("api/v1/course-sessions/{id:guid}")]
    public async Task<IActionResult> Session(Guid id, CancellationToken ct, [FromQuery] Guid? block = null)
    {
        if (!CanAccessSession(id)) return NotFound();
        try { return await learning.State(id, User.UserId(), guests.Owner(HttpContext), ct, block, upgrade: false) is { } state ? Json(state) : NotFound(); }
        catch (ArgumentException e) { return BadRequest(new { error = e.Message }); }
    }

    [HttpGet("api/v1/course-sessions/{id:guid}/media/{block:guid}")]
    [HttpHead("api/v1/course-sessions/{id:guid}/media/{block:guid}")]
    [ResponseCache(NoStore = true, Location = ResponseCacheLocation.None)]
    public async Task<IActionResult> LessonMedia(Guid id, Guid block, CancellationToken ct)
    {
        if (!CanAccessSession(id)) return NotFound();
        var path = await learning.Media(id, block, User.UserId(), guests.Owner(HttpContext), ct);
        if (path is null || !path.StartsWith("/media/", StringComparison.Ordinal) || path.Contains('\\') ||
            path.Split('/').Any(part => part is "." or "..")) return NotFound();
        var file = environment.WebRootFileProvider.GetFileInfo(path);
        if (!file.Exists || file.IsDirectory || !new Microsoft.AspNetCore.StaticFiles.FileExtensionContentTypeProvider().TryGetContentType(path, out var type)) return NotFound();
        return File(file.CreateReadStream(), type, enableRangeProcessing: true);
    }

    [HttpPost("api/v1/course-sessions/{id:guid}/update")]
    public async Task<IActionResult> UpdateSession(Guid id, CancellationToken ct, [FromQuery] Guid? block = null)
    {
        if (!CanAccessSession(id)) return NotFound();
        try { return await learning.State(id, User.UserId(), guests.Owner(HttpContext), ct, block) is { } state ? Json(state) : NotFound(); }
        catch (ArgumentException e) { return BadRequest(new { error = e.Message }); }
    }
    public sealed record StepInput(Guid BlockId);
    [HttpPost("api/v1/course-sessions/{id:guid}/view"), Authorize]
    public async Task<IActionResult> RecordView(Guid id, [FromBody] StepInput input, CancellationToken ct)
    {
        if (!ModelState.IsValid || input is null) return BadRequest();
        return await learning.ViewBlock(id, input.BlockId, User.UserId()!.Value, guests.Owner(HttpContext), ct) ? NoContent() : NotFound();
    }
    public sealed record RetryInput(Guid BlockId, Guid AttemptId);
    [HttpPost("api/v1/course-sessions/{id:guid}/retry")]
    public async Task<IActionResult> Retry(Guid id, [FromBody] RetryInput input, CancellationToken ct)
    {
        if (!CanAccessSession(id)) return NotFound();
        if (!ModelState.IsValid || input is null) return BadRequest();
        return await learning.Retry(id, input.BlockId, input.AttemptId, User.UserId(), guests.Owner(HttpContext), ct)
            ? NoContent() : Conflict(new { error = "Повторная попытка недоступна. Обновите занятие." });
    }
    public sealed record AnswerInput(Guid BlockId, int[] TokenIndices, Guid? AttemptId = null);
    [HttpPost("api/v1/course-sessions/{id:guid}/practice")]
    public async Task<IActionResult> Practice(Guid id, [FromBody] CoursePracticeInput input, CancellationToken ct)
    {
        if (!CanAccessSession(id)) return NotFound();
        if (input is null || !ModelState.IsValid) return BadRequest();
        try { return await learning.PracticeAnswer(id, input, User.UserId(), guests.Owner(HttpContext), ct) is { } answer ? Json(answer) : NotFound(); }
        catch (ArgumentException error) { return BadRequest(new { error = error.Message }); }
    }
    [HttpPost("api/v1/course-sessions/{id:guid}/answers")]
    public async Task<IActionResult> Answer(Guid id, [FromBody] AnswerInput input, CancellationToken ct)
    {
        if (!CanAccessSession(id)) return NotFound();
        if (!ModelState.IsValid || input is null || input.TokenIndices is null) return BadRequest();
        try { return await learning.Answer(id, input.BlockId, input.TokenIndices, User.UserId(), guests.Owner(HttpContext), ct, input.AttemptId) is { } answer ? Json(answer) : NotFound(); }
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
