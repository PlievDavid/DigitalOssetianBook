using System.Diagnostics;
using Microsoft.AspNetCore.Mvc;
using IronLanguage.Web.Models;

namespace IronLanguage.Web.Controllers;

public class HomeController : Controller
{
    public IActionResult Index(string? q)
    {
        var lessons = LessonCatalog.All.AsEnumerable();
        if (!string.IsNullOrWhiteSpace(q))
            lessons = lessons.Where(x => x.Title.Contains(q, StringComparison.OrdinalIgnoreCase)
                || x.Description.Contains(q, StringComparison.OrdinalIgnoreCase));

        ViewData["Query"] = q?.Trim() ?? "";
        return View(lessons.ToArray());
    }

    public IActionResult Privacy()
    {
        return View();
    }

    [ResponseCache(Duration = 0, Location = ResponseCacheLocation.None, NoStore = true)]
    public IActionResult Error()
    {
        return View(new ErrorViewModel { RequestId = Activity.Current?.Id ?? HttpContext.TraceIdentifier });
    }
}
