using IronLanguage.Db;
using IronLanguage.Web.Services;
using Microsoft.AspNetCore.Authorization;
using Microsoft.AspNetCore.Mvc;

namespace IronLanguage.Web.Controllers;

[Authorize, AutoValidateAntiforgeryToken]
public sealed class CourseRatingsController(ICourseRatingRepository ratings) : Controller
{
    [HttpPost("courses/{id:guid}/rating")]
    public async Task<IActionResult> Set(Guid id, int score, CancellationToken ct)
    {
        if (score is < 1 or > 5) return BadRequest("Выберите оценку от 1 до 5.");
        if (!await ratings.Set(id, User.UserId()!.Value, score, ct)) return NotFound();
        return Redirect($"/courses/{id}/about#course-rating");
    }
}
