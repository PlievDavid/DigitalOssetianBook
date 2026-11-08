using IronLanguage.Db;
using IronLanguage.Web.Services;
using Microsoft.EntityFrameworkCore;
using Npgsql;

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
    Console.WriteLine($"Проверок пройдено: {count}. Изолированная схема будет удалена.");
}
finally
{
    await using var cleanup = new NpgsqlCommand($"DROP SCHEMA \"{schema}\" CASCADE", control);
    await cleanup.ExecuteNonQueryAsync();
}
