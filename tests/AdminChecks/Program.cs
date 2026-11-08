using System.Diagnostics;
using System.Security.Cryptography;
using System.Text.Json;
using IronLanguage.Db;
using IronLanguage.Web.Services;
using Microsoft.AspNetCore.Http;
using Microsoft.AspNetCore.Identity;
using Microsoft.EntityFrameworkCore;
using Microsoft.EntityFrameworkCore.Infrastructure;
using Microsoft.EntityFrameworkCore.Migrations;
using Microsoft.Extensions.DependencyInjection;
using Microsoft.Extensions.Logging;
using Npgsql;

var connection = Environment.GetEnvironmentVariable("ConnectionStrings__Adam") ?? throw new Exception("Загрузите локальную настройку подключения.");
var schema = "admin_check_" + Guid.NewGuid().ToString("N");
var original = new NpgsqlConnectionStringBuilder(connection);
if (original.Host is not ("localhost" or "127.0.0.1" or "::1")) throw new Exception("Проверки разрешены только на локальной базе.");
await using var control = new NpgsqlConnection(connection); await control.OpenAsync();
await using (var command = new NpgsqlCommand($"CREATE SCHEMA \"{schema}\"", control)) await command.ExecuteNonQueryAsync();
var isolated = new NpgsqlConnectionStringBuilder(connection) { SearchPath = schema }.ConnectionString;
var options = new DbContextOptionsBuilder<AdamDbContext>().UseNpgsql(isolated, x => x.MigrationsHistoryTable("__EFMigrationsHistory", schema)).Options;
var checks = 0;
void Check(bool condition, string message) { if (!condition) throw new Exception(message); checks++; }
Process? site = null;
try
{
    var id = Guid.NewGuid(); var legacyEmail = $"legacy-{Guid.NewGuid():N}@example.invalid"; var password = "aA1!" + Convert.ToBase64String(RandomNumberGenerator.GetBytes(24));
    var hash = new PasswordHasher<UserAccount>().HashPassword(new UserAccount(), password);
    await using (var db = new AdamDbContext(options))
    {
        await db.GetService<IMigrator>().MigrateAsync("20261106232921_CourseRatingsAndPublicName");
        await db.Database.ExecuteSqlInterpolatedAsync($"INSERT INTO \"Users\" (\"Id\", \"Email\", \"PasswordHash\", \"IsEditor\", \"CreatedAt\", \"PublicName\", \"AvatarJson\") VALUES ({id}, {legacyEmail}, {hash}, TRUE, {DateTimeOffset.UtcNow.AddDays(-5)}, {"Проверка Ӕ ӕ"}, {"{}"})");
        await db.Database.ExecuteSqlInterpolatedAsync($"INSERT INTO \"DailyActivities\" (\"UserId\", \"Day\", \"Points\") VALUES ({id}, {DateOnly.FromDateTime(DateTime.UtcNow)}, 17)");
        await db.Database.MigrateAsync();
        Check(!db.Database.HasPendingModelChanges(), "Модель не соответствует миграции");
        var legacy = await db.Users.SingleAsync(x => x.Id == id);
        Check(legacy.PasswordHash == hash && !legacy.TwoFactorEnabled && legacy.PublicName == "Проверка Ӕ ӕ" && legacy.AvatarJson == "{}", "Миграция повредила аккаунт");
        Check(await db.DailyActivities.AnyAsync(x => x.UserId == id && x.Points == 17), "Миграция повредила прогресс");
        Check(await db.UserRoles.AnyAsync(x => x.UserId == id && db.Roles.Any(r => r.Id == x.RoleId && r.Name == "Editor")), "Не перенесён Editor");
        Check(!await db.UserRoles.AnyAsync(x => x.UserId == id && db.Roles.Any(r => r.Id == x.RoleId && r.Name == "Admin")), "Editor получил Admin автоматически");
    }
    var services = new ServiceCollection(); services.AddLogging(); services.AddDataProtection(); services.AddHttpContextAccessor();
    services.AddDbContext<AdamDbContext>(o => o.UseNpgsql(isolated));
    services.AddIdentity<UserAccount, IdentityRole<Guid>>(o => { o.User.RequireUniqueEmail = true; o.Password.RequireNonAlphanumeric = false; })
        .AddEntityFrameworkStores<AdamDbContext>().AddSignInManager<AdamSignInManager>().AddClaimsPrincipalFactory<AdamClaimsFactory>();
    services.AddScoped<IAdminRepository, EfAdminRepository>(); services.AddScoped<AdminService>();
    await using var provider = services.BuildServiceProvider();
    async Task<UserAccount> NewUser(string name)
    {
        using var scope = provider.CreateScope(); var manager = scope.ServiceProvider.GetRequiredService<UserManager<UserAccount>>();
        var email = $"admin-check-{Guid.NewGuid():N}@example.invalid"; var user = new UserAccount { UserName = email, Email = email, PublicName = name };
        var result = await manager.CreateAsync(user, password); Check(result.Succeeded, "Создание Identity пользователя"); return user;
    }
    using (var scope = provider.CreateScope())
    {
        var manager = scope.ServiceProvider.GetRequiredService<UserManager<UserAccount>>();
        Check(await manager.CheckPasswordAsync((await manager.FindByEmailAsync(legacyEmail))!, password), "Прежний пароль не работает");
    }
    var admin = await NewUser("Администратор Ӕ"); var second = await NewUser("Второй администратор"); var learner = await NewUser("Ученик ӕ");
    async Task Change(Guid? actor, Guid target, string action, bool bootstrap = false, string? stamp = null)
    {
        using var scope = provider.CreateScope(); var manager = scope.ServiceProvider.GetRequiredService<UserManager<UserAccount>>();
        var current = await manager.FindByIdAsync(target.ToString());
        await scope.ServiceProvider.GetRequiredService<AdminService>().Change(actor, target, action, "Интеграционная проверка", stamp ?? current!.ConcurrencyStamp!, CancellationToken.None, bootstrap);
    }
    async Task Reject(Func<Task> operation, string label)
    {
        try { await operation(); } catch (Exception e) when (e is ArgumentException or UnauthorizedAccessException) { checks++; return; }
        throw new Exception(label);
    }
    await Change(null, admin.Id, "grant-admin", true);
    await Reject(() => Change(learner.Id, learner.Id, "grant-admin"), "Ученик повысил себя");
    await Reject(() => Change(admin.Id, admin.Id, "block"), "Самоблокировка разрешена");
    await Reject(() => Change(admin.Id, admin.Id, "revoke-admin"), "Снятие собственного Admin разрешено");
    await Change(admin.Id, second.Id, "grant-admin");
    await Change(admin.Id, learner.Id, "grant-editor");
    string oldStamp;
    using (var scope = provider.CreateScope())
    {
        var manager = scope.ServiceProvider.GetRequiredService<UserManager<UserAccount>>(); var u = (await manager.FindByIdAsync(admin.Id.ToString()))!;
        var principal = await scope.ServiceProvider.GetRequiredService<IUserClaimsPrincipalFactory<UserAccount>>().CreateAsync(u);
        Check(principal.IsInRole("Admin") && principal.IsInRole("Editor"), "Admin не наследует Editor");
        oldStamp = (await manager.FindByIdAsync(learner.Id.ToString()))!.ConcurrencyStamp!;
    }
    await Change(admin.Id, learner.Id, "block");
    await Reject(() => Change(admin.Id, learner.Id, "unblock", stamp: oldStamp), "Принято устаревшее изменение");
    await Change(admin.Id, learner.Id, "unblock");
    await Change(admin.Id, learner.Id, "revoke-editor");
    await Change(admin.Id, learner.Id, "signout");
    await Change(admin.Id, learner.Id, "revoke-editor"); // Repeating an already applied state is a no-op.
    // Competing administrators cannot revoke one another and leave zero administrators.
    await Task.WhenAll(new[] { (admin.Id, second.Id), (second.Id, admin.Id) }.Select(async pair => { try { await Change(pair.Item1, pair.Item2, "revoke-admin"); } catch (UnauthorizedAccessException) { } catch (ArgumentException) { } }));
    using (var scope = provider.CreateScope())
    {
        var repo = scope.ServiceProvider.GetRequiredService<IAdminRepository>(); Check(await repo.ActiveAdmins(default) == 1, "Гонка оставила платформу без Admin");
        var db = scope.ServiceProvider.GetRequiredService<AdamDbContext>();
        Check(await db.AdminAudits.CountAsync() == 8, "Неожиданное число записей аудита");
        var activeAdmin = await db.Users.Where(u => !u.IsBlocked && db.UserRoles.Any(ur => ur.UserId == u.Id && db.Roles.Any(r => r.Id == ur.RoleId && r.Name == "Admin"))).Select(u => u.Id).SingleAsync();
        await db.Database.ExecuteSqlRawAsync("CREATE FUNCTION reject_test_audit() RETURNS trigger LANGUAGE plpgsql AS $$ BEGIN RAISE EXCEPTION 'Test audit failure'; END; $$; CREATE TRIGGER reject_test_audit BEFORE INSERT ON \"AdminAudits\" FOR EACH ROW EXECUTE FUNCTION reject_test_audit();");
        try
        {
            try { await Change(activeAdmin, learner.Id, "grant-editor"); throw new Exception("Изменение без журнала принято"); }
            catch (DbUpdateException) { checks++; }
            Check(!await db.UserRoles.AnyAsync(ur => ur.UserId == learner.Id && db.Roles.Any(r => r.Id == ur.RoleId && r.Name == "Editor")), "Роль не откатилась при ошибке аудита");
        }
        finally { await db.Database.ExecuteSqlRawAsync("DROP TRIGGER reject_test_audit ON \"AdminAudits\"; DROP FUNCTION reject_test_audit();"); }
        var day = DateOnly.FromDateTime(DateTime.UtcNow); var analytics = new EfAnalyticsRepository(db);
        await analytics.Increment(day, "home", "view", default); await analytics.Increment(day, "home", "view", default);
        await analytics.Increment(day.AddMonths(-12).AddDays(-1), "home", "view", default);
        await analytics.Cleanup(day, default);
        Check(await db.DailyMetrics.CountAsync() == 1 && (await db.DailyMetrics.SingleAsync()).Count == 2, "Агрегация или очистка счётчиков неверна");
        var overview = await repo.Overview(7, DateTimeOffset.UtcNow, default);
        Check(overview.Active == 1 && overview.Users == 4 && overview.Timeline.Sum(x => x.Views) == 2, "Статистика неверна");
        var details = await repo.User(id, default); Check(details?.Points == 17, "Карточка пользователя неверна");
        Check((await repo.Users("несуществующее", null, null, null, 99, default)).Page == 1, "Пустая страница не исправлена");
        var startUtc = new DateTimeOffset(day.AddDays(-6).ToDateTime(TimeOnly.MinValue), TimeSpan.Zero);
        var endUtc = new DateTimeOffset(day.AddDays(1).ToDateTime(TimeOnly.MinValue), TimeSpan.Zero);
        db.Attempts.AddRange(new[] { startUtc.AddTicks(-10), startUtc, endUtc.AddTicks(-10), endUtc }.Select(time => new ExerciseAttempt { UserId = id, CompletedAt = time }));
        var published = new WordEntry { Ossetian = "ӕ", Russian = "Осетинская буква ӕ", Published = true };
        var draft = new WordEntry { Ossetian = "ӕ", Russian = "Осетинская буква ӕ" };
        var archived = new WordEntry { Ossetian = "ӕ", Russian = "Осетинская буква ӕ", Published = true, Archived = true };
        db.Words.AddRange(published, draft, archived);
        db.ContentRevisions.AddRange(new ContentRevision { Kind = "word", ContentId = published.Id, EditorId = admin.Id }, new ContentRevision { Kind = "word", ContentId = archived.Id, EditorId = admin.Id });
        await db.SaveChangesAsync();
        Check((await repo.Overview(7, DateTimeOffset.UtcNow, default)).Exercises == 2, "Границы UTC неверны");
        var words = (await repo.Materials(default)).Single(x => x.Kind == "word");
        Check(words.Published >= 1 && words.Draft == 2 && words.Archived == 1, "Неверный подсчёт черновиков и архива");
    }
    Check(AnalyticsRecorder.PageSection("/admin") == null && AnalyticsRecorder.PageSection("/api/v1/books") == null && AnalyticsRecorder.PageSection("/account/login") == null && AnalyticsRecorder.PageSection("/games/wordle") == "wordle", "Неверный список аналитики");
    var accessor = new HttpContextAccessor { HttpContext = new DefaultHttpContext() };
    var recorder = new AnalyticsRecorder(accessor, TimeProvider.System);
    using (var guests = new GuestLearningStore(recorder))
    {
        var owner = Guid.NewGuid(); var attempt = new ExerciseAttempt(); guests.Add(owner, attempt.Id, attempt);
        var entry = guests.Find<ExerciseAttempt>(owner, attempt.Id)!; guests.Completed(entry); guests.Completed(entry);
        var events = new List<string>(); while (recorder.Reader.TryRead(out var metric)) events.Add(metric.Event);
        Check(events.SequenceEqual(new[] { "start", "complete" }), "Гостевое завершение записано повторно");
    }
    if (args.Contains("--browser"))
    {
        await Change(null, admin.Id, "grant-admin", true);
        using (var scope = provider.CreateScope())
        {
            var db = scope.ServiceProvider.GetRequiredService<AdamDbContext>();
            for (var i = 0; i < 27; i++) db.Users.Add(new UserAccount { Email = $"page-{i}@example.invalid", UserName = $"page-{i}@example.invalid", NormalizedUserName = $"PAGE-{i}@EXAMPLE.INVALID", PublicName = $"Ученик {i}" });
            await db.SaveChangesAsync();
        }
        var root = Path.GetFullPath("."); var webRoot = Path.Combine(root, "IronLanguage.Web");
        var start = new ProcessStartInfo("dotnet") { WorkingDirectory = webRoot, UseShellExecute = false, CreateNoWindow = true, RedirectStandardOutput = true, RedirectStandardError = true };
        start.ArgumentList.Add(Path.Combine(webRoot, "bin/Debug/net10.0/IronLanguage.Web.dll"));
        start.Environment["ConnectionStrings__Adam"] = isolated;
        start.Environment["ASPNETCORE_URLS"] = "http://127.0.0.1:58429"; start.Environment["ASPNETCORE_ENVIRONMENT"] = "Development";
        start.Environment["DataProtection__KeysDirectory"] = Path.Combine(root, ".run-admin/keys");
        start.ArgumentList.Add("admin-grant"); start.ArgumentList.Add("--email"); start.ArgumentList.Add(admin.Email!);
        using (var cli = Process.Start(start)!)
        {
            var cliOutput = cli.StandardOutput.ReadToEndAsync(); var cliError = cli.StandardError.ReadToEndAsync();
            await cli.WaitForExitAsync(); await cliOutput; await cliError;
            Check(cli.ExitCode == 0, "Команда admin-grant не выполнилась");
        }
        start.ArgumentList.RemoveAt(3); start.ArgumentList.RemoveAt(2); start.ArgumentList.RemoveAt(1);
        site = Process.Start(start)!; site.OutputDataReceived += (_, _) => { }; site.ErrorDataReceived += (_, _) => { }; site.BeginOutputReadLine(); site.BeginErrorReadLine();
        using var http = new HttpClient(); var ready = false;
        for (var i = 0; i < 80; i++) { if (site.HasExited) throw new Exception("Тестовый сервер завершился до запуска браузера"); try { ready = (await http.GetAsync("http://127.0.0.1:58429/account/login")).IsSuccessStatusCode; if (ready) break; } catch (HttpRequestException) { } await Task.Delay(250); }
        Check(ready, "Тестовый сервер недоступен");
        var browser = new ProcessStartInfo("node") { WorkingDirectory = root, UseShellExecute = false, CreateNoWindow = true, RedirectStandardOutput = true, RedirectStandardError = true };
        browser.ArgumentList.Add("tests/admin-browser.cjs"); browser.Environment["ADAM_TEST_URL"] = "http://127.0.0.1:58429";
        browser.Environment["ADAM_ADMIN_FIXTURE"] = JsonSerializer.Serialize(new { admin = admin.Email, learner = learner.Email, legacy = legacyEmail, password, learnerId = learner.Id });
        using var process = Process.Start(browser)!;
        var browserOutput = process.StandardOutput.ReadToEndAsync(); var browserError = process.StandardError.ReadToEndAsync();
        await process.WaitForExitAsync(); Console.Write(await browserOutput); Console.Error.Write(await browserError); Check(process.ExitCode == 0, "Браузерная проверка не прошла");
    }
    Console.WriteLine($"Admin checks: {checks} passed. Temporary schema will be removed.");
}
catch (Exception error) { Console.Error.WriteLine(error.Message); Environment.ExitCode = 1; }
finally
{
    if (site is { HasExited: false }) { site.Kill(entireProcessTree: true); await site.WaitForExitAsync(); }
    NpgsqlConnection.ClearAllPools();
    // This identifier is generated above, never supplied by the caller; remove only our own fixture schema.
    await using var command = new NpgsqlCommand($"DROP SCHEMA \"{schema}\" CASCADE", control); await command.ExecuteNonQueryAsync();
}
