using IronLanguage.Db;
using IronLanguage.Web.Services;
using Microsoft.EntityFrameworkCore;
using Npgsql;
using System.Diagnostics;
using System.Security.Cryptography;
using System.Text.Json;
using Microsoft.AspNetCore.Identity;

var count = 0;
void Check(bool value, string message) { if (!value) throw new Exception(message); count++; }
var draft = new CourseDraft("Проверка Ӕ/ӕ", "Описание", [new(Guid.NewGuid(), "Модуль", [new(Guid.NewGuid(), "Урок", [new(Guid.NewGuid(), "theory", "Теория", "Текст")])])]);
CourseAuthoringService.Validate(draft, true);
foreach (var invalid in new[] { draft with { Modules = [] }, draft with { Title = "" }, draft with { Modules = [draft.Modules[0], draft.Modules[0]] } })
{
    var rejected = false;
    try { CourseAuthoringService.Validate(invalid, true); } catch (ArgumentException) { rejected = true; }
    Check(rejected, "Некорректный курс прошёл проверку");
}
var module = draft.Modules[0];
var lesson = module.Lessons[0];
var block = lesson.Blocks[0];
foreach (var invalidBlock in new[] { block with { Kind = "unknown" }, block with { Id = Guid.Empty }, block with { Text = "" } })
{
    var rejected = false;
    try { CourseAuthoringService.Validate(draft with { Modules = [module with { Lessons = [lesson with { Blocks = [invalidBlock] }] }] }, true); }
    catch (ArgumentException) { rejected = true; }
    Check(rejected, "Неполный или неподдерживаемый блок опубликован");
}
CourseAuthoringService.Validate(draft with { Modules = [] }, false);
var modelOptions = new DbContextOptionsBuilder<AdamDbContext>().UseNpgsql("Host=localhost;Database=model_check").Options;
using (var modelDb = new AdamDbContext(modelOptions))
{
    Check(!modelDb.Database.HasPendingModelChanges(), "Снимок миграции не соответствует модели");
    var enrollmentModel = modelDb.Model.FindEntityType(typeof(CourseEnrollment))!;
    Check(enrollmentModel.GetIndexes().Any(x => x.IsUnique && x.Properties.Select(p => p.Name).SequenceEqual(new[] { "UserId", "CourseId" })), "Нет защиты от двойной записи");
    Check(enrollmentModel.GetForeignKeys().Any(x => x.Properties.Select(p => p.Name).SequenceEqual(new[] { "VersionId", "CourseId" })), "Не защищена принадлежность версии курсу");
}
if (args.Contains("--rules-only")) { Console.WriteLine($"Проверок правил и модели: {count}. БД не использовалась."); return; }
var connection = Environment.GetEnvironmentVariable("ConnectionStrings__Adam") ?? throw new Exception("Загрузите локальную настройку БД.");
var source = new NpgsqlConnectionStringBuilder(connection);
if (source.Host is not ("localhost" or "127.0.0.1" or "::1")) throw new Exception("Тест разрешён только в локальной БД.");
var schema = "course_version_check_" + Guid.NewGuid().ToString("N");
await using var control = new NpgsqlConnection(connection);
await control.OpenAsync();
await using (var command = new NpgsqlCommand($"CREATE SCHEMA \"{schema}\"", control)) await command.ExecuteNonQueryAsync();
Process? site = null;
try
{
    var isolated = new NpgsqlConnectionStringBuilder(connection) { SearchPath = schema }.ConnectionString;
    var options = new DbContextOptionsBuilder<AdamDbContext>().UseNpgsql(isolated, o => o.MigrationsHistoryTable("__EFMigrationsHistory", schema)).Options;
    await using var db = new AdamDbContext(options);
    await db.Database.MigrateAsync();
    Check(!db.Database.HasPendingModelChanges(), "Модель расходится с миграцией");
    var owner = new UserAccount { Email = "owner@example.invalid" };
    var other = new UserAccount { Email = "other@example.invalid" };
    var learner = new UserAccount { Email = "learner@example.invalid" };
    db.Users.AddRange(owner, other, learner); await db.SaveChangesAsync();
    var repo = new EfCourseRepository(db);
    var service = new CourseAuthoringService(repo);
    var ct = CancellationToken.None;
    var course = await service.Create(owner.Id, draft, ct);
    Check(await repo.Owned(course.Id, other.Id, ct) is null, "Чужой черновик доступен");
    Check(await repo.Enroll(course.Id, learner.Id, ct) is null, "Запись на черновик разрешена");
    Check(await service.Publish(course.Id, other.Id, 0, true, ct) is null, "Чужая публикация разрешена");
    var first = (await service.Publish(course.Id, owner.Id, 0, true, ct))!;
    Check((await service.Publish(course.Id, owner.Id, 0, true, ct))!.Id == first.Id, "Повтор создал вторую публикацию");
    var enrolled = (await repo.Enroll(course.Id, learner.Id, ct))!;
    Check((await repo.Enroll(course.Id, learner.Id, ct))!.Id == enrolled.Id, "Повтор создал вторую запись");
    Check(await repo.ForLearner(course.Id, other.Id, ct) is null, "Чужая запись доступна");
    Check(await service.Save(course.Id, other.Id, 0, draft, ct) is null, "Чужое сохранение разрешено");
    var changed = draft with { Title = "Новая версия", Modules = [new(Guid.NewGuid(), "Другой модуль", draft.Modules[0].Lessons)] };
    Check(await service.Save(course.Id, owner.Id, 0, changed, ct) is not null, "Черновик не сохранён");
    Check(await service.Save(course.Id, owner.Id, 0, draft, ct) is null, "Устаревшая вкладка перезаписала черновик");
    Check(await service.Publish(course.Id, owner.Id, 0, true, ct) is null, "Опубликована устаревшая проверка");
    var second = (await service.Publish(course.Id, owner.Id, 1, true, ct))!;
    Check(second.Number == 2 && second.Id != first.Id, "Не создана новая редакция");
    Check((await repo.ForLearner(course.Id, learner.Id, ct))!.SnapshotJson == first.SnapshotJson, "Программа ученика изменилась");
    Check((await repo.Enroll(course.Id, other.Id, ct))!.VersionId == second.Id, "Новый ученик не получил новую версию");
    Check(await db.CourseVersions.CountAsync() == 2 && await db.CourseEnrollments.CountAsync() == 2, "Дубликаты результатов");
    // Separate contexts simulate requests arriving together, rather than sharing EF's change tracker.
    async Task<Guid> EnrollAgain()
    {
        await using var concurrent = new AdamDbContext(options);
        return (await new EfCourseRepository(concurrent).Enroll(course.Id, owner.Id, ct))!.Id;
    }
    Check((await Task.WhenAll(EnrollAgain(), EnrollAgain(), EnrollAgain())).Distinct().Count() == 1, "Гонка создала дубликат записи");
    async Task<Guid> PublishAgain()
    {
        await using var concurrent = new AdamDbContext(options);
        return (await new CourseAuthoringService(new EfCourseRepository(concurrent)).Publish(course.Id, owner.Id, 1, true, ct))!.Id;
    }
    Check((await Task.WhenAll(PublishAgain(), PublishAgain())).All(id => id == second.Id), "Гонка создала лишнюю публикацию");
    var catalog = new EfCatalogRepository(db);
    var progress = new EfProgressRepository(db);
    using var guests = new GuestLearningStore();
    var learning = new LearningService(catalog, progress, guests);
    var lessons = new EfCourseLearningRepository(db);
    var runner = new CourseLearningService(repo, lessons, progress, learning, guests);
    var guestOwner = Guid.NewGuid();
    var session = (await runner.Start(course.Id, lesson.Id, learner.Id, guestOwner, ct))!;
    Check(session.VersionId == first.Id, "Урок не использует закреплённую версию");
    Check((await runner.Start(course.Id, lesson.Id, learner.Id, guestOwner, ct))!.Id == session.Id, "Повтор запуска создал сессию");
    Check(await runner.State(session.Id, other.Id, guestOwner, ct) is null, "Чужая сессия доступна");
    Check(!await runner.Advance(session.Id, Guid.NewGuid(), learner.Id, guestOwner, ct), "Зачтён чужой блок");
    Check(await runner.Advance(session.Id, block.Id, learner.Id, guestOwner, ct), "Теория не завершилась");
    Check(await runner.Advance(session.Id, block.Id, learner.Id, guestOwner, ct), "Повтор завершения не идемпотентен");
    Check((await runner.Completed(course.Id, first.Id, learner.Id, guestOwner, ct)).SetEquals([lesson.Id]), "Прогресс не сохранился");
    await using (var restored = new AdamDbContext(options))
        Check((await new EfCourseLearningRepository(restored).Session(learner.Id, session.Id, ct))?.CompletedAt != null, "Результат зависит от памяти процесса");
    var before = await db.CourseLessonSessions.CountAsync();
    var guest = (await runner.Start(course.Id, lesson.Id, null, guestOwner, ct))!;
    Check(await runner.State(guest.Id, null, Guid.NewGuid(), ct) is null, "Гостевая сессия доступна другому гостю");
    Check(await runner.Advance(guest.Id, block.Id, null, guestOwner, ct), "Гостевая теория не завершилась");
    Check(await db.CourseLessonSessions.CountAsync() == before, "Гость записал прогресс в БД");
    var following = new CourseDraftLesson(Guid.NewGuid(), "Следующий урок", [new(Guid.NewGuid(), "theory", "Теория", "Текст")]);
    var sequential = draft with { Sequential = true, Modules = [module with { Lessons = [lesson, following] }] };
    var orderedCourse = await service.Create(owner.Id, sequential, ct);
    var orderedVersion = (await service.Publish(orderedCourse.Id, owner.Id, 0, true, ct))!;
    var blocked = false;
    try { await runner.Start(orderedCourse.Id, following.Id, learner.Id, guestOwner, ct); } catch (ArgumentException) { blocked = true; }
    Check(blocked, "Прямой запрос обошёл последовательность уроков");
    var firstLesson = (await runner.Start(orderedCourse.Id, lesson.Id, learner.Id, guestOwner, ct))!;
    await runner.Advance(firstLesson.Id, block.Id, learner.Id, guestOwner, ct);
    Check(await runner.Start(orderedCourse.Id, following.Id, learner.Id, guestOwner, ct) is not null, "Следующий урок не открылся");
    Check(await runner.Start(orderedCourse.Id, lesson.Id, null, Guid.NewGuid(), ct) is not null, "Гостевой запуск не работает");
    var sessionsBeforePreview = await db.CourseLessonSessions.CountAsync();
    var previewLesson = (await runner.Start(orderedCourse.Id, lesson.Id, owner.Id, guestOwner, ct, orderedVersion))!;
    Check(await runner.State(previewLesson.Id, other.Id, guestOwner, ct) is null, "Предпросмотр доступен другому аккаунту с тем же гостевым cookie");
    Check(await runner.State(previewLesson.Id, null, guestOwner, ct) is null, "Предпросмотр доступен после выхода из аккаунта");
    Check(await runner.Advance(previewLesson.Id, block.Id, owner.Id, guestOwner, ct), "Предпросмотр не завершается");
    Check(await db.CourseLessonSessions.CountAsync() == sessionsBeforePreview, "Предпросмотр записал учебный прогресс");
    Check(await lessons.Archive(orderedCourse.Id, other.Id, ct) == false, "Чужой автор архивировал курс");
    Check(await lessons.Archive(orderedCourse.Id, owner.Id, ct), "Архивирование не выполнено");
    Check(await repo.Enroll(orderedCourse.Id, other.Id, ct) is null, "Архивный курс принимает новых учеников");
    Check(await runner.Start(orderedCourse.Id, lesson.Id, null, Guid.NewGuid(), ct) is null, "Гость начал архивный курс");
    Check(await runner.Start(orderedCourse.Id, following.Id, learner.Id, guestOwner, ct) is not null, "Архив удалил доступ записанного ученика");
    if (args.Contains("--browser"))
    {
        // Copy only a confirmed, already published phrase into our isolated fixture.
        await using var originalDb = new AdamDbContext(new DbContextOptionsBuilder<AdamDbContext>().UseNpgsql(connection).Options);
        var phrase = await originalDb.Exercises.AsNoTracking().FirstOrDefaultAsync(x => x.Kind == "translation" && x.Published && !x.Archived);
        if (phrase is null)
        {
            using var seeds = JsonDocument.Parse(await File.ReadAllTextAsync("IronLanguage.Web/Data/exercises/exercises.json"));
            var seed = seeds.RootElement[0];
            var tokens = seed.GetProperty("tokens").EnumerateArray().Select(x => x.GetString()!).ToArray();
            phrase = new Exercise { Kind = "translation", Published = true, RussianPrompt = seed.GetProperty("russianPrompt").GetString()!,
                TokensJson = JsonSerializer.Serialize(tokens), OssetianAnswer = string.Join(' ', tokens) };
        }
        phrase.Id = Guid.NewGuid(); phrase.WordIdsJson = "[]"; db.Exercises.Add(phrase);
        var password = "aA1!" + Convert.ToBase64String(RandomNumberGenerator.GetBytes(24));
        foreach (var u in new[] { owner, other, learner })
        {
            u.UserName = u.Email; u.NormalizedEmail = u.Email!.ToUpperInvariant(); u.NormalizedUserName = u.NormalizedEmail;
            u.PasswordHash = new PasswordHasher<UserAccount>().HashPassword(u, password); u.PublicName = "Проверка курсов";
        }
        var role = await db.Roles.FirstAsync(x => x.Name == "Editor");
        db.UserRoles.Add(new IdentityUserRole<Guid> { UserId = owner.Id, RoleId = role.Id });
        await db.SaveChangesAsync();
        var webRoot = Path.GetFullPath("IronLanguage.Web");
        var listener = new System.Net.Sockets.TcpListener(System.Net.IPAddress.Loopback, 0); listener.Start();
        var port = ((System.Net.IPEndPoint)listener.LocalEndpoint).Port; listener.Stop();
        var url = $"http://127.0.0.1:{port}";
        var start = new ProcessStartInfo("dotnet") { WorkingDirectory = webRoot, UseShellExecute = false, CreateNoWindow = true, RedirectStandardOutput = true, RedirectStandardError = true };
        start.ArgumentList.Add(Path.Combine(webRoot, "bin/Debug/net10.0/IronLanguage.Web.dll"));
        start.Environment["ConnectionStrings__Adam"] = isolated; start.Environment["ASPNETCORE_URLS"] = url; start.Environment["ASPNETCORE_ENVIRONMENT"] = "Development";
        start.Environment["DataProtection__KeysDirectory"] = Path.GetFullPath(".run-local/course-v2-checks/keys");
        site = Process.Start(start)!; site.OutputDataReceived += (_, _) => { }; site.ErrorDataReceived += (_, _) => { }; site.BeginOutputReadLine(); site.BeginErrorReadLine();
        using var http = new HttpClient(); var ready = false;
        for (var i = 0; i < 80; i++) { if (site.HasExited) throw new Exception("Тестовый сайт остановился"); try { ready = (await http.GetAsync(url + "/account/login")).IsSuccessStatusCode; if (ready) break; } catch (HttpRequestException) { } await Task.Delay(250); }
        Check(ready, "Тестовый сайт не запустился");
        var browser = new ProcessStartInfo("node") { UseShellExecute = false, CreateNoWindow = true, RedirectStandardOutput = true, RedirectStandardError = true };
        browser.ArgumentList.Add("tests/courses-v2-browser.cjs"); browser.Environment["ADAM_TEST_URL"] = url;
        browser.Environment["ADAM_COURSE_FIXTURE"] = JsonSerializer.Serialize(new { owner = owner.Email, learner = learner.Email, other = other.Email, password, phraseId = phrase.Id, tokens = LearningService.ParseTokens(phrase.TokensJson), expected = phrase.OssetianAnswer });
        using var process = Process.Start(browser)!;
        var output = process.StandardOutput.ReadToEndAsync(); var error = process.StandardError.ReadToEndAsync();
        await process.WaitForExitAsync(); Console.Write(await output); Console.Error.Write(await error); Check(process.ExitCode == 0, "Браузерная проверка не прошла");
    }
    Console.WriteLine($"Проверок пройдено: {count}. Изолированная схема будет удалена.");
}
finally
{
    if (site is { HasExited: false }) { site.Kill(entireProcessTree: true); await site.WaitForExitAsync(); }
    NpgsqlConnection.ClearAllPools();
    await using var cleanup = new NpgsqlCommand($"DROP SCHEMA \"{schema}\" CASCADE", control);
    await cleanup.ExecuteNonQueryAsync();
}
