using System.Data.Common;
using IronLanguage.Db;
using System.Diagnostics;
using Microsoft.AspNetCore.Mvc;
using IronLanguage.Web.Models;

namespace IronLanguage.Web.Controllers;

public class HomeController(ICatalogRepository catalog, ILogger<HomeController> logger) : Controller
{
    public IActionResult Index() => View();

    [HttpGet("/exercises")]
    public async Task<IActionResult> Exercises(CancellationToken ct)
    {
        try
        {
            return View(await catalog.ExerciseCounts(ct));
        }
        catch (Exception error) when (!ct.IsCancellationRequested && error is DbException or TimeoutException)
        {
            logger.LogWarning("Не удалось загрузить количества заданий ({ErrorType}).", error.GetType().Name);
            return View();
        }
    }

    public IActionResult Illustrations() => View();

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
