using System.Threading.Channels;
using IronLanguage.Db;
namespace IronLanguage.Web.Services;

public sealed class AnalyticsRecorder(IHttpContextAccessor accessor, TimeProvider clock)
{
    private readonly Channel<(DateOnly Day, string Section, string Event)> queue = Channel.CreateBounded<(DateOnly, string, string)>(new BoundedChannelOptions(4096) { FullMode = BoundedChannelFullMode.DropWrite, SingleReader = true });
    public ChannelReader<(DateOnly Day, string Section, string Event)> Reader => queue.Reader;
    public void Record(string section, string eventName) => queue.Writer.TryWrite((DateOnly.FromDateTime(clock.GetUtcNow().UtcDateTime), section, eventName));
    public void Guest<T>(string eventName)
    {
        if (accessor.HttpContext is not { } context || context.User.Identity?.IsAuthenticated == true) return;
        var section = typeof(T).Name switch {
            nameof(ExerciseAttempt) => "exercises", nameof(DialogueSession) => "dialogues", nameof(LessonRun) => "lessons",
            nameof(MatchingService.MatchingState) => "matching", nameof(PictureService.PictureState) => "picture", nameof(WordleGame) => "wordle", _ => null };
        if (section is not null) Record(section, eventName);
    }
    public static string? PageSection(string path)
    {
        var exact = path.TrimEnd('/').ToLowerInvariant();
        return exact switch {
            "" => "home", "/courses" => "courses", "/lessons" => "lessons", "/reading" => "reading", "/games" => "games",
            "/games/wordle" => "wordle", "/games/crosswords" => "crosswords", "/vocabulary" or "/word-practice" or "/game" => "words",
            "/audio-puzzles" or "/translate" or "/listening" => "exercises", "/dialogs" => "dialogues",
            "/matching" => "matching", "/picture" => "picture", _ => DynamicPage(exact) };
    }
    private static string? DynamicPage(string path)
    {
        var parts = path.Split('/', StringSplitOptions.RemoveEmptyEntries);
        if (parts.Length == 3 && parts[0] == "lessons" && parts[1] == "runs" && Guid.TryParse(parts[2], out _)) return "lessons";
        if (parts.Length is < 2 or > 3 || !Guid.TryParse(parts[1], out _)) return null;
        return parts[0] switch { "courses" when parts.Length == 2 || parts[2] is "about" or "contents" => "courses",
            "reading" when parts.Length == 2 => "reading", "lessons" when parts.Length == 2 => "lessons", _ => null };
    }
}
public sealed class AnalyticsWorker(AnalyticsRecorder recorder, IServiceScopeFactory scopes, TimeProvider clock, ILogger<AnalyticsWorker> logger) : BackgroundService
{
    protected override Task ExecuteAsync(CancellationToken stoppingToken) => Task.WhenAll(Consume(stoppingToken), Cleanup(stoppingToken));
    private async Task Consume(CancellationToken ct)
    {
        await foreach (var metric in recorder.Reader.ReadAllAsync(ct))
        {
            try { using var scope = scopes.CreateScope(); await scope.ServiceProvider.GetRequiredService<IAnalyticsRepository>().Increment(metric.Day, metric.Section, metric.Event, ct); }
            catch (Exception) when (!ct.IsCancellationRequested) { logger.LogWarning("Не удалось сохранить агрегат аналитики; событие пропущено."); }
        }
    }
    private async Task Cleanup(CancellationToken ct)
    {
        while (!ct.IsCancellationRequested)
        {
            try { using var scope = scopes.CreateScope(); await scope.ServiceProvider.GetRequiredService<IAnalyticsRepository>().Cleanup(DateOnly.FromDateTime(clock.GetUtcNow().UtcDateTime), ct); }
            catch (Exception) when (!ct.IsCancellationRequested) { logger.LogWarning("Очистка старых агрегатов отложена."); }
            await Task.Delay(TimeSpan.FromDays(1), clock, ct);
        }
    }
}
