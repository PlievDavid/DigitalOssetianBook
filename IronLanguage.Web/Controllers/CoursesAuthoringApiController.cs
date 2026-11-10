using IronLanguage.Db;
using IronLanguage.Web.Services;
using Microsoft.AspNetCore.Authorization;
using Microsoft.AspNetCore.Mvc;

namespace IronLanguage.Web.Controllers;

[ApiController, Authorize(Roles = "Editor"), AutoValidateAntiforgeryToken]
[Route("api/v1/author/courses")]
[RequestSizeLimit(1_000_000)]
public sealed class CoursesAuthoringApiController(ICourseRepository courses, CourseAuthoringService authoring, ICourseLearningRepository publications,
    CourseAnalytics analytics, ICourseMaterialRepository materials) : ControllerBase
{
    [HttpPost]
    public async Task<IActionResult> Create(CourseDraft draft, CancellationToken ct)
    {
        try
        {
            var course = await authoring.Create(User.UserId()!.Value, draft, ct);
            return CreatedAtAction(nameof(Get), new { id = course.Id }, course);
        }
        catch (ArgumentException error) { return BadRequest(new { error = error.Message }); }
    }

    [HttpGet("{id:guid}")]
    public async Task<IActionResult> Get(Guid id, CancellationToken ct)
    {
        var owner = User.UserId()!.Value;
        if (await courses.Owned(id, owner, ct) is not { } course) return NotFound();
        var draft = System.Text.Json.JsonSerializer.Deserialize<CourseDraft>(course.DraftJson, CourseAuthoringService.JsonOptions)!;
        var references = draft.Modules.SelectMany(m => m.Lessons).SelectMany(l => l.Blocks)
            .Where(b => b.Kind != "theory" && b.MaterialId.HasValue).ToLookup(b => b.MaterialId!.Value, b => b.Kind);
        var selected = await materials.Selected(owner, references.Select(x => x.Key).ToArray(), ct);
        return Ok(new { course.Id, course.OwnerId, course.Archived, course.BlockReason, course.PublishedVersionId,
            course.DraftStamp, course.DraftJson, course.CreatedAt, materials = selected.Where(m => references[m.Id].Contains(m.Kind)) });
    }

    public sealed record SaveInput(long Stamp, CourseDraft Draft);
    public sealed record DeleteInput(long Stamp);

    [HttpDelete("{id:guid}")]
    public async Task<IActionResult> Delete(Guid id, DeleteInput input, CancellationToken ct) =>
        (await courses.Delete(id, User.UserId()!.Value, input.Stamp, ct)) switch
        {
            true => NoContent(),
            false => Conflict(new { error = "Черновик изменился. Обновите страницу перед удалением." }),
            null => NotFound()
        };

    [HttpGet("{id:guid}/access")]
    [ResponseCache(NoStore = true, Location = ResponseCacheLocation.None)]
    public async Task<IActionResult> Access(Guid id, CancellationToken ct) =>
        await courses.OwnedAccess(id, User.UserId()!.Value, ct) is { } access ? Ok(access) : NotFound();

    [HttpPatch("{id:guid}/draft")]
    public async Task<IActionResult> Save(Guid id, SaveInput input, CancellationToken ct)
    {
        if (await courses.Owned(id, User.UserId()!.Value, ct) is null) return NotFound();
        try
        {
            var course = await authoring.Save(id, User.UserId()!.Value, input.Stamp, input.Draft, ct);
            return course is null ? Conflict(new { error = "Черновик изменился. Загрузите актуальную версию." }) : Ok(course);
        }
        catch (ArgumentException error) { return BadRequest(new { error = error.Message }); }
    }

    public sealed record PublishInput(long Stamp, bool Reviewed);
    [HttpGet("{id:guid}/publication-issues")]
    public async Task<IActionResult> PublicationIssues(Guid id, CancellationToken ct)
    {
        if (await courses.Owned(id, User.UserId()!.Value, ct) is not { } course) return NotFound();
        return Ok(await authoring.PublicationIssues(course, ct));
    }
    public sealed record RestoreInput(long Stamp);

    [HttpGet("{id:guid}/analytics")]
    [ResponseCache(NoStore = true, Location = ResponseCacheLocation.None)]
    public async Task<IActionResult> Analytics(Guid id, CancellationToken ct, Guid? learner = null, int days = 30, int page = 1)
    {
        if (days is < 1 or > 365 || page is < 1 or > 10_000) return BadRequest();
        return await analytics.Report(id, User.UserId()!.Value, learner, days, page, ct) is { } report ? Ok(report) : NotFound();
    }

    [HttpGet("{id:guid}/versions")]
    public async Task<IActionResult> Versions(Guid id, CancellationToken ct)
    {
        var owner = User.UserId()!.Value;
        if (await courses.Owned(id, owner, ct) is null) return NotFound();
        var versions = await courses.History(id, owner, ct);
        var names = await publications.AuthorNames([id], ct);
        return Ok(new { author = names.GetValueOrDefault(id, "Автор курса"),
            versions = versions.Select((v, i) => CourseAuthoringService.VersionSummary(v, versions.ElementAtOrDefault(i + 1))) });
    }

    [HttpPost("{id:guid}/versions/{version:guid}/restore")]
    public async Task<IActionResult> Restore(Guid id, Guid version, RestoreInput input, CancellationToken ct)
    {
        var owner = User.UserId()!.Value;
        if (await courses.Owned(id, owner, ct) is null || await publications.Snapshot(version, ct) is not { } snapshot || snapshot.CourseId != id) return NotFound();
        return await authoring.Restore(id, owner, input.Stamp, snapshot, ct) is { } course
            ? Ok(course) : Conflict(new { error = "Черновик изменился. Загрузите актуальную версию." });
    }
    [HttpPost("{id:guid}/publish")]
    public async Task<IActionResult> Publish(Guid id, PublishInput input, CancellationToken ct)
    {
        if (await courses.OwnedAccess(id, User.UserId()!.Value, ct) is not { } access) return NotFound();
        if (access.BlockReason is { } reason) return Conflict(new { error = "Администратор заблокировал курс. Причина: " + reason });
        try
        {
            var version = await authoring.Publish(id, User.UserId()!.Value, input.Stamp, input.Reviewed, ct);
            return version is null ? Conflict(new { error = "Курс изменился или недоступен для публикации." })
                : Ok(new { version.Id, version.CourseId, version.Number, version.PublishedAt });
        }
        catch (ArgumentException error) { return BadRequest(new { error = error.Message }); }
    }
}
