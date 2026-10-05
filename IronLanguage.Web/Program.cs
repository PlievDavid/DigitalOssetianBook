using System.Text.Json;
using Microsoft.AspNetCore.DataProtection;
using Microsoft.AspNetCore.Authentication.Cookies;
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
builder.Services.AddScoped<IAccountRepository, EfAccountRepository>();
builder.Services.AddScoped<ICatalogRepository, EfCatalogRepository>();
builder.Services.AddScoped<IEditorRepository, EfEditorRepository>();
builder.Services.AddScoped<IProgressRepository, EfProgressRepository>();
builder.Services.AddScoped<LearningService>();
builder.Services.AddSingleton<GuestLearningStore>();
builder.Services.AddScoped<DialogueService>();
builder.Services.AddScoped<DictionaryService>();
builder.Services.AddScoped<DialogueSeedService>();
builder.Services.AddAuthentication(CookieAuthenticationDefaults.AuthenticationScheme).AddCookie(options =>
{
    options.LoginPath = "/account/login";
    options.AccessDeniedPath = "/account/access-denied";
    options.Cookie.Name = "Adam.Auth";
    options.Cookie.HttpOnly = true;
    options.Cookie.SameSite = SameSiteMode.Lax;
    options.ExpireTimeSpan = TimeSpan.FromDays(30);
    options.SlidingExpiration = true;
    options.Events.OnRedirectToLogin = context =>
    {
        if (context.Request.Path.StartsWithSegments("/api")) { context.Response.StatusCode = 401; return Task.CompletedTask; }
        context.Response.Redirect(context.RedirectUri);
        return Task.CompletedTask;
    };
});
var keysPath = builder.Configuration["DataProtection:KeysDirectory"] ?? Path.Combine(builder.Environment.ContentRootPath, ".data-protection-keys");
Directory.CreateDirectory(keysPath);
builder.Services.AddDataProtection().SetApplicationName("Adam").PersistKeysToFileSystem(new DirectoryInfo(keysPath));

var app = builder.Build();

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

app.UseStaticFiles(); // Uploaded media is added after build, outside the static asset manifest.
app.MapStaticAssets();

app.MapControllerRoute(
    name: "default",
    pattern: "{controller=Home}/{action=Index}/{id?}")
    .WithStaticAssets();


app.Run();
