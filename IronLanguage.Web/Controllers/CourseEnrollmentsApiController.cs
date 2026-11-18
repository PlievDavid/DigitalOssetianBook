using IronLanguage.Db;
using IronLanguage.Web.Services;
using Microsoft.AspNetCore.Authorization;
using Microsoft.AspNetCore.Mvc;

namespace IronLanguage.Web.Controllers;

[ApiController, Authorize, AutoValidateAntiforgeryToken]
public sealed class CourseEnrollmentsApiController(ICourseRepository courses) : ControllerBase
{
    [HttpPost("api/v1/courses/{id:guid}/enroll")]
    public async Task<IActionResult> Enroll(Guid id, CancellationToken ct)
    {
        var enrollment = await courses.Enroll(id, User.UserId()!.Value, ct);
        return enrollment is null ? NotFound() : Ok(new { enrollment.Id, enrollment.CourseId, enrollment.VersionId, enrollment.CreatedAt });
    }

    [HttpGet("api/v1/me/courses/{id:guid}/version")]
    public async Task<IActionResult> Version(Guid id, CancellationToken ct)
    {
        var version = await courses.ForLearner(id, User.UserId()!.Value, ct);
        // Never return the internal publication snapshot: exercise adapters may store answers there.
        return version is null ? NotFound() : Ok(new { version.Id, version.CourseId, version.Number, version.PublishedAt });
    }
}
