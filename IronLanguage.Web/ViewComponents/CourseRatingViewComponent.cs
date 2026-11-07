using IronLanguage.Db;
using IronLanguage.Web.Services;
using Microsoft.AspNetCore.Mvc;

namespace IronLanguage.Web.ViewComponents;

public sealed class CourseRatingViewComponent(ICourseRatingRepository ratings) : ViewComponent
{
    public async Task<IViewComponentResult> InvokeAsync(Guid courseId)
    {
        var summary = await ratings.Summary(courseId, UserClaimsPrincipal.UserId(), HttpContext.RequestAborted);
        return View(new CourseRatingViewModel(courseId, summary));
    }
}
public sealed record CourseRatingViewModel(Guid CourseId, CourseRatingSummary Summary);
