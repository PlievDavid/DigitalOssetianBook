using IronLanguage.Db;
using IronLanguage.Web.Services;
using Microsoft.AspNetCore.Authorization;
using Microsoft.AspNetCore.Mvc;

namespace IronLanguage.Web.Controllers;

[NonController, Authorize, AutoValidateAntiforgeryToken]
public sealed class CourseRatingsController(ICourseRatingRepository ratings, ICurriculumRepository curriculum) : Controller
{
    [HttpPost("courses/{id:guid}/rating")]
    public async Task<IActionResult> Set(Guid id, int score, CancellationToken ct)
    {
        if (score is < 1 or > 5) return BadRequest("Выберите оценку от 1 до 5.");
        var eligibility = await CourseRatingProgress.Get(curriculum, id, User.UserId()!.Value, ct);
        if (eligibility is null) return NotFound();
        if (!eligibility.Allowed) return StatusCode(403, "Оценка доступна после завершения половины курса.");
        if (!await ratings.Set(id, User.UserId()!.Value, score, ct)) return NotFound();
        if (Request.Headers.Accept.ToString() == "application/json")
        {
            var summary = await ratings.Summary(id, User.UserId()!.Value, ct);
            return Json(summary);
        }
        return Redirect($"/courses/{id}/about#course-rating");
    }
}
