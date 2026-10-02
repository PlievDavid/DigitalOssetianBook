using IronLanguage.Web.Models;
using Microsoft.AspNetCore.Mvc;

namespace IronLanguage.Web.Controllers;

[Route("lesson")]
public sealed class LearnController : Controller
{
    private const string SessionPrefix = "lesson-";

    [HttpGet("{slug}")]
    public IActionResult Index(string slug)
    {
        var lesson = LessonCatalog.Find(slug);
        if (lesson is null) return NotFound();

        var step = Math.Clamp(HttpContext.Session.GetInt32(SessionPrefix + slug + "-step") ?? 0, 0, lesson.Questions.Length);
        var score = Math.Clamp(HttpContext.Session.GetInt32(SessionPrefix + slug + "-score") ?? 0, 0, lesson.Questions.Length);
        ViewData["Step"] = step;
        ViewData["Score"] = score;
        ViewData["Answered"] = TempData["Answered"] is "true";
        ViewData["Correct"] = TempData["Correct"] is "true";
        return View(lesson);
    }

    [HttpPost("{slug}/answer")]
    [ValidateAntiForgeryToken]
    public IActionResult Answer(string slug, int step, int option)
    {
        var lesson = LessonCatalog.Find(slug);
        if (lesson is null) return NotFound();
        var storedStep = HttpContext.Session.GetInt32(SessionPrefix + slug + "-step") ?? 0;
        if (step != storedStep || step >= lesson.Questions.Length || step < 0 || option < 0 || option >= lesson.Questions[step].Options.Length)
            return RedirectToAction(nameof(Index), new { slug });

        var correct = option == lesson.Questions[step].CorrectIndex;
        if (correct)
            HttpContext.Session.SetInt32(SessionPrefix + slug + "-score", (HttpContext.Session.GetInt32(SessionPrefix + slug + "-score") ?? 0) + 1);
        HttpContext.Session.SetInt32(SessionPrefix + slug + "-step", step + 1);
        TempData["Answered"] = "true";
        TempData["Correct"] = correct ? "true" : "false";
        return RedirectToAction(nameof(Index), new { slug });
    }

    [HttpPost("{slug}/restart")]
    [ValidateAntiForgeryToken]
    public IActionResult Restart(string slug)
    {
        if (LessonCatalog.Find(slug) is null) return NotFound();
        HttpContext.Session.Remove(SessionPrefix + slug + "-step");
        HttpContext.Session.Remove(SessionPrefix + slug + "-score");
        return RedirectToAction(nameof(Index), new { slug });
    }
}
