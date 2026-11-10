using IronLanguage.Db;
using IronLanguage.Web.Services;
using Microsoft.AspNetCore.Mvc;

namespace IronLanguage.Web.ViewComponents;

public sealed class CourseRatingViewComponent(ICourseRatingRepository ratings, ICurriculumRepository curriculum) : ViewComponent
{
    public async Task<IViewComponentResult> InvokeAsync(Guid courseId)
    {
        var summary = await ratings.Summary(courseId, UserClaimsPrincipal.UserId(), HttpContext.RequestAborted);
        var eligibility = UserClaimsPrincipal.UserId() is Guid user ? await CourseRatingProgress.Get(curriculum, courseId, user, HttpContext.RequestAborted) : null;
        return View(new CourseRatingViewModel(courseId, summary, eligibility));
    }
}
public sealed record CourseRatingViewModel(Guid CourseId, CourseRatingSummary Summary, CourseRatingEligibility? Eligibility);
