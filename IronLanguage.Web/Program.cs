using Microsoft.AspNetCore.Identity;
using System.Text.Json;
using Microsoft.AspNetCore.DataProtection;
using Microsoft.EntityFrameworkCore;
using Microsoft.EntityFrameworkCore.Infrastructure;
using Microsoft.EntityFrameworkCore.Migrations;
using IronLanguage.Db;
using IronLanguage.Web.Services;

var builder = WebApplication.CreateBuilder(args);
builder.Logging.ClearProviders();
builder.Logging.AddConsole();

// Add services to the container.
builder.Services.AddControllersWithViews();
var connection = builder.Configuration.GetConnectionString("Adam")
    ?? throw new InvalidOperationException("Set ConnectionStrings:Adam to a PostgreSQL connection string.");
builder.Services.AddDbContext<AdamDbContext>(options => options.UseNpgsql(connection));
builder.Services.AddScoped<IAdminRepository, EfAdminRepository>();
builder.Services.AddScoped<AdminService>();
builder.Services.AddScoped<IAnalyticsRepository, EfAnalyticsRepository>();
builder.Services.AddSingleton<AnalyticsRecorder>();
builder.Services.AddHostedService<AnalyticsWorker>();
builder.Services.AddScoped<IAccountRepository, EfAccountRepository>();
builder.Services.AddScoped<AvatarService>();
builder.Services.AddScoped<ICatalogRepository, EfCatalogRepository>();
builder.Services.AddScoped<IEditorRepository, EfEditorRepository>();
builder.Services.AddScoped<IReadingLibraryRepository, EfReadingLibraryRepository>();
builder.Services.AddScoped<ReadingSeedService>();
builder.Services.AddScoped<ICurriculumRepository, EfCurriculumRepository>();
builder.Services.AddScoped<ICourseRepository, EfCourseRepository>();
builder.Services.AddScoped<ICourseMaterialRepository, EfCourseMaterialRepository>();
builder.Services.AddScoped<ICourseAdministrationRepository, EfCourseAdministrationRepository>();
builder.Services.AddScoped<ILessonLibraryRepository, EfLessonLibraryRepository>();
builder.Services.AddScoped<CourseAuthoringService>();
builder.Services.AddSingleton<CourseTheoryMediaStore>();
builder.Services.AddScoped<ICourseLearningRepository, EfCourseLearningRepository>();
builder.Services.AddScoped<CourseLearningService>();
builder.Services.AddScoped<CourseAnalytics>();
builder.Services.AddScoped<ICourseRatingRepository, EfCourseRatingRepository>();
builder.Services.AddScoped<CurriculumService>();
builder.Services.AddScoped<IProgressRepository, EfProgressRepository>();
builder.Services.AddScoped<LearningService>();
builder.Services.AddScoped<ListeningService>();
builder.Services.AddSingleton<GuestLearningStore>();
builder.Services.AddScoped<DialogueService>();
builder.Services.AddScoped<MatchingService>();
builder.Services.AddScoped<PictureService>();
builder.Services.AddScoped<GrammarService>();
builder.Services.AddScoped<DictionaryService>();
builder.Services.AddScoped<IDictionarySourceRepository, EfDictionarySourceRepository>();
builder.Services.AddSingleton<CrosswordCatalog>();
builder.Services.AddScoped<CrosswordService>();
builder.Services.AddScoped<ICrosswordRepository, EfCrosswordRepository>();
builder.Services.AddSingleton(TimeProvider.System);
builder.Services.AddSingleton<WordleCatalog>();
builder.Services.AddScoped<WordleService>();
builder.Services.AddScoped<IWordleRepository, EfWordleRepository>();
builder.Services.AddScoped<DialogueSeedService>();
builder.Services.AddScoped<ExerciseSeedService>();
builder.Services.AddIdentity<UserAccount, IdentityRole<Guid>>(options =>
{
    options.User.RequireUniqueEmail = true;
    options.User.AllowedUserNameCharacters = "";
    options.Password.RequiredLength = 8;
    options.Password.RequireDigit = false;
    options.Password.RequireLowercase = false;
    options.Password.RequireUppercase = false;
    options.Password.RequireNonAlphanumeric = false;
    options.Lockout.MaxFailedAccessAttempts = 5;
    options.Lockout.DefaultLockoutTimeSpan = TimeSpan.FromMinutes(5);
}).AddEntityFrameworkStores<AdamDbContext>().AddSignInManager<AdamSignInManager>()
    .AddClaimsPrincipalFactory<AdamClaimsFactory>().AddDefaultTokenProviders();
builder.Services.Configure<SecurityStampValidatorOptions>(options => options.ValidationInterval = TimeSpan.Zero);
builder.Services.ConfigureApplicationCookie(options =>
{
    options.LoginPath = "/account/login";
    options.AccessDeniedPath = "/account/access-denied";
    options.Cookie.Name = "Adam.Identity";
    options.Cookie.HttpOnly = true;
    options.Cookie.SameSite = SameSiteMode.Lax;
    options.ExpireTimeSpan = TimeSpan.FromDays(30);
    options.SlidingExpiration = true;
    options.Events.OnRedirectToLogin = context =>
    {
        if (context.Request.Path.StartsWithSegments("/api")) context.Response.StatusCode = 401;
        else context.Response.Redirect(context.RedirectUri);
        return Task.CompletedTask;
    };
    options.Events.OnRedirectToAccessDenied = context =>
    {
        if (context.Request.Path.StartsWithSegments("/api")) context.Response.StatusCode = 403;
        else context.Response.Redirect(context.RedirectUri);
        return Task.CompletedTask;
    };
});
var keysPath = builder.Configuration["DataProtection:KeysDirectory"] ?? Path.Combine(builder.Environment.ContentRootPath, ".data-protection-keys");
Directory.CreateDirectory(keysPath);
builder.Services.AddDataProtection().SetApplicationName("Adam").PersistKeysToFileSystem(new DirectoryInfo(keysPath));

var app = builder.Build();

if (args.FirstOrDefault() == "admin-grant")
{
    if (args.Length != 3 || args[1] != "--email") throw new ArgumentException("Использование: admin-grant --email <email>");
    using var scope = app.Services.CreateScope();
    var users = scope.ServiceProvider.GetRequiredService<UserManager<UserAccount>>();
    var user = await users.FindByEmailAsync(args[2].Trim()) ?? throw new ArgumentException("Существующий аккаунт не найден.");
    await scope.ServiceProvider.GetRequiredService<AdminService>().Change(null, user.Id, "grant-admin", "Выдача Admin серверной командой", "", CancellationToken.None, bootstrap: true);
    Console.WriteLine("Роль Admin назначена. Для доступа войдите заново.");
    return;
}

if (args.Contains("reading-seed", StringComparer.OrdinalIgnoreCase))
{
    using var scope = app.Services.CreateScope();
    await scope.ServiceProvider.GetRequiredService<AdamDbContext>().Database.MigrateAsync();
    var result = await scope.ServiceProvider.GetRequiredService<ReadingSeedService>().PublishSeeds(CancellationToken.None);
    Console.WriteLine($"Сиды чтения: добавлено {result.Added}, обновлено {result.Updated}, без изменений {result.Unchanged}.");
    return;
}

if (args.Contains("reading-import", StringComparer.OrdinalIgnoreCase))
{
    if (!args.Contains("--replace-library", StringComparer.Ordinal))
        throw new InvalidOperationException("Укажите --replace-library: старые опубликованные книги будут перемещены в архив.");
    using var scope = app.Services.CreateScope();
    await scope.ServiceProvider.GetRequiredService<AdamDbContext>().Database.MigrateAsync();
    var result = await scope.ServiceProvider.GetRequiredService<ReadingSeedService>().Import(CancellationToken.None);
    Console.WriteLine($"Чтение: добавлено {result.Added}, перенесено в архив {result.Archived}. Черновые переводы доступны только редактору.");
    return;
}

if (args.Contains("dictionary-check", StringComparer.OrdinalIgnoreCase))
{
    var source = Path.Combine(app.Environment.ContentRootPath, "Data", "ossetian-russian-dictionary.csv");
    var result = DictionaryService.InspectSource(source);
    Console.WriteLine($"Dictionary: {result.Rows} rows, {result.Meanings} meanings.");
    Console.WriteLine($"Stress and æ/ӕ: {DictionaryService.Key("фæлǽ") == DictionaryService.Key("ФӕЛӕ")}");
    return;
}

if (args.Contains("migration-check", StringComparer.OrdinalIgnoreCase))
{
    using var scope = app.Services.CreateScope();
    var db = scope.ServiceProvider.GetRequiredService<AdamDbContext>();
    var script = db.GetService<IMigrator>().GenerateScript();
    Console.WriteLine($"Migration script generated: {script.Length} characters; poem: {script.Contains("Азар!", StringComparison.Ordinal)}; dictionary: {script.Contains("DictionarySenses", StringComparison.Ordinal)}; pending model changes: {db.Database.HasPendingModelChanges()}");
    return;
}

if (args.Contains("dictionary-import", StringComparer.OrdinalIgnoreCase))
{
    using var scope = app.Services.CreateScope();
    var source = Path.Combine(app.Environment.ContentRootPath, "Data", "ossetian-russian-dictionary.csv");
    await scope.ServiceProvider.GetRequiredService<AdamDbContext>().Database.MigrateAsync();
    var count = await scope.ServiceProvider.GetRequiredService<DictionaryService>()
        .ImportAndRebuild(source, CancellationToken.None);
    Console.WriteLine($"Imported {count} dictionary meanings and rebuilt book matches.");
    return;
}

if (args.Contains("dialogue-check", StringComparer.OrdinalIgnoreCase)
    || args.Contains("dialogue-import", StringComparer.OrdinalIgnoreCase))
{
    var dryRun = args.Contains("dialogue-check", StringComparer.OrdinalIgnoreCase);
    var editorEmail = args.FirstOrDefault(x => !x.StartsWith("dialogue-", StringComparison.OrdinalIgnoreCase));
    try
    {
        using var scope = app.Services.CreateScope();
        var source = Path.Combine(app.Environment.ContentRootPath, "Data", "dialogues", "dialogues.json");
        var seeds = DialogueSeedService.Read(source);
        if (!dryRun) await scope.ServiceProvider.GetRequiredService<AdamDbContext>().Database.MigrateAsync();
        var results = await scope.ServiceProvider.GetRequiredService<DialogueSeedService>()
            .ImportAsync(seeds, editorEmail, dryRun, CancellationToken.None);
        foreach (var result in results)
            Console.WriteLine($"{result.Title}: {result.Action}{(result.Error is null ? "" : $" — {result.Error}")}");
        var failed = results.Count(x => x.Error is not null);
        Console.WriteLine($"Dialogues: {results.Count} in {seeds.Count} seeds; created {results.Count(x => x.Action == "создан")}, updated {results.Count(x => x.Action is "обновлён" or "дополнен")}, unchanged {results.Count(x => x.Action == "без изменений")}, errors {failed}.");
        if (failed > 0) Environment.ExitCode = 1;
    }
    catch (Exception error) when (error is InvalidOperationException or JsonException or IOException)
    {
        Console.WriteLine($"Dialogue seed failed: {error.Message}");
        Environment.ExitCode = 1;
    }
    return;
}

if (args.Contains("exercise-check", StringComparer.OrdinalIgnoreCase)
    || args.Contains("exercise-seed", StringComparer.OrdinalIgnoreCase))
{
    var dryRun = args.Contains("exercise-check", StringComparer.OrdinalIgnoreCase);
    var editorEmail = args.FirstOrDefault(x => !x.StartsWith("exercise-", StringComparison.OrdinalIgnoreCase));
    try
    {
        using var scope = app.Services.CreateScope();
        var source = Path.Combine(app.Environment.ContentRootPath, "Data", "exercises", "exercises.json");
        var seeds = ExerciseSeedService.Read(source);
        if (!dryRun) await scope.ServiceProvider.GetRequiredService<AdamDbContext>().Database.MigrateAsync();
        var results = await scope.ServiceProvider.GetRequiredService<ExerciseSeedService>()
            .ImportAsync(seeds, editorEmail, dryRun, CancellationToken.None);
        foreach (var result in results)
            Console.WriteLine($"{result.Prompt}: {result.Action}{(result.Error is null ? "" : $" — {result.Error}")}");
        var failed = results.Count(x => x.Error is not null);
        Console.WriteLine($"Audio puzzles: {results.Count} in {seeds.Count} seeds; created {results.Count(x => x.Action == "создан")}, updated {results.Count(x => x.Action is "обновлён" or "дополнен")}, unchanged {results.Count(x => x.Action == "без изменений")}, errors {failed}.");
        if (failed > 0) Environment.ExitCode = 1;
    }
    catch (Exception error) when (error is InvalidOperationException or JsonException or IOException)
    {
        Console.WriteLine($"Exercise seed failed: {error.Message}");
        Environment.ExitCode = 1;
    }
    return;
}

// Configure the HTTP request pipeline.
if (!app.Environment.IsDevelopment())
{
    app.UseExceptionHandler("/Home/Error");
    // The default HSTS value is 30 days. You may want to change this for production scenarios, see https://aka.ms/aspnetcore-hsts.
    app.UseHsts();
}

app.UseHttpsRedirection();
app.UseRouting();
app.UseAuthentication();

app.UseAuthorization();
app.Use(async (context, next) =>
{
    await next();
    if (HttpMethods.IsGet(context.Request.Method) && context.Response.StatusCode == 200 &&
        context.Response.ContentType?.StartsWith("text/html", StringComparison.OrdinalIgnoreCase) == true &&
        AnalyticsRecorder.PageSection(context.Request.Path.Value ?? "") is string section)
        context.RequestServices.GetRequiredService<AnalyticsRecorder>().Record(section, "view");
});

app.Use(async (context, next) =>
{
    var path = context.Request.Path.Value;
    var extension = Path.GetExtension(path)?.ToLowerInvariant();
    if (path is not null && (path.StartsWith("/media/pictures/", StringComparison.OrdinalIgnoreCase) ||
        path.StartsWith("/media/", StringComparison.OrdinalIgnoreCase) && extension is ".mp3" or ".ogg" or ".wav"))
    {
        var editor = context.User.IsInRole("Editor") ? context.User.UserId() : null;
        if (!await context.RequestServices.GetRequiredService<ICourseMaterialRepository>().CanReadMedia(path, editor, context.RequestAborted))
        {
            context.Response.StatusCode = StatusCodes.Status404NotFound;
            return;
        }
    }
    await next();
});
app.UseStaticFiles(); // Uploaded media is added after build, outside the static asset manifest.
app.MapStaticAssets();

foreach (var (legacyPath, webpPath) in ReadingArtwork.LegacyPaths)
    app.MapMethods(legacyPath, ["GET", "HEAD"], () => Results.Redirect(webpPath, permanent: true));

app.MapControllerRoute(
    name: "default",
    pattern: "{controller=Home}/{action=Index}/{id?}")
    .WithStaticAssets();


app.Run();
