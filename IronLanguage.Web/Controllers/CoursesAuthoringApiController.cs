using IronLanguage.Db;
using IronLanguage.Web.Services;
using Microsoft.AspNetCore.Authorization;
using Microsoft.AspNetCore.Mvc;

namespace IronLanguage.Web.Controllers;

[ApiController, Authorize(Roles = "Editor"), AutoValidateAntiforgeryToken]
[Route("api/v1/author/courses")]
[RequestSizeLimit(1_000_000)]
public sealed class CoursesAuthoringApiController(ICourseRepository courses, CourseAuthoringService authoring) : ControllerBase
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
    public async Task<IActionResult> Get(Guid id, CancellationToken ct) =>
        await courses.Owned(id, User.UserId()!.Value, ct) is { } course ? Ok(course) : NotFound();

    public sealed record SaveInput(long Stamp, CourseDraft Draft);
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
    [HttpPost("{id:guid}/publish")]
    public async Task<IActionResult> Publish(Guid id, PublishInput input, CancellationToken ct)
    {
        if (await courses.Owned(id, User.UserId()!.Value, ct) is null) return NotFound();
        try
        {
            var version = await authoring.Publish(id, User.UserId()!.Value, input.Stamp, input.Reviewed, ct);
            return version is null ? Conflict(new { error = "Курс изменился или недоступен для публикации." })
                : Ok(new { version.Id, version.CourseId, version.Number, version.PublishedAt });
        }
        catch (ArgumentException error) { return BadRequest(new { error = error.Message }); }
    }
}
