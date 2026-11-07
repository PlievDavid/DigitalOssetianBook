using System.Security.Claims;
using System.Text.Json;
using IronLanguage.Db;
using IronLanguage.Web.Models;
using IronLanguage.Web.Services;
using Microsoft.AspNetCore.Authentication;
using Microsoft.AspNetCore.Authentication.Cookies;
using Microsoft.AspNetCore.DataProtection;
using Microsoft.EntityFrameworkCore;
using Microsoft.Extensions.Caching.Memory;

// Проверка общего времени жизни и вытеснения без обращения к базе.
#pragma warning disable CS0618 // MemoryCacheOptions.Clock позволяет управлять временем в тесте.
var clock = new TestClock();
using (var cacheCheck = new GuestLearningStore(new MemoryCacheOptions { SizeLimit = 3, Clock = clock }))
#pragma warning restore CS0618
{
    var ownerCheck = Guid.NewGuid(); var runCheck = new LessonRun(); var attemptCheck = new ExerciseAttempt();
    cacheCheck.AddGroup(ownerCheck, group => { group.Add(runCheck.Id, runCheck); group.Add(attemptCheck.Id, attemptCheck); });
    if (cacheCheck.Find<LessonRun>(Guid.NewGuid(), runCheck.Id) is not null || cacheCheck.Find<ExerciseAttempt>(Guid.NewGuid(), attemptCheck.Id) is not null)
        throw new Exception("Гостевой пакет доступен другому владельцу");
    clock.Advance(TimeSpan.FromMinutes(20));
    if (cacheCheck.Find<ExerciseAttempt>(ownerCheck, attemptCheck.Id) is null) throw new Exception("Попытка пропала слишком рано");
    clock.Advance(TimeSpan.FromMinutes(20));
    if (cacheCheck.Find<LessonRun>(ownerCheck, runCheck.Id) is null) throw new Exception("Обращение к попытке не продлило урок");
    clock.Advance(TimeSpan.FromMinutes(31));
    if (cacheCheck.Find<LessonRun>(ownerCheck, runCheck.Id) is not null || cacheCheck.Find<ExerciseAttempt>(ownerCheck, attemptCheck.Id) is not null)
        throw new Exception("Сроки жизни урока и попытки различаются");
    var evictedRun = new LessonRun(); var evictedAttempt = new ExerciseAttempt();
    cacheCheck.AddGroup(ownerCheck, group => { group.Add(evictedRun.Id, evictedRun); group.Add(evictedAttempt.Id, evictedAttempt); });
    clock.Advance(TimeSpan.FromSeconds(1));
    cacheCheck.Add(ownerCheck, Guid.NewGuid(), new ExerciseAttempt());
    clock.Advance(TimeSpan.FromSeconds(1));
    cacheCheck.Add(ownerCheck, Guid.NewGuid(), new ExerciseAttempt());
    if (cacheCheck.Find<LessonRun>(ownerCheck, evictedRun.Id) is not null || cacheCheck.Find<ExerciseAttempt>(ownerCheck, evictedAttempt.Id) is not null)
        throw new Exception("Вытеснение разделило гостевой пакет");
}

// Только подготовленная локальная БД; секреты и cookie остаются в игнорируемом .run-local.
var connection = Environment.GetEnvironmentVariable("ConnectionStrings__Adam") ?? throw new InvalidOperationException("Загрузите .run-local/connection.ps1.");
var root = Directory.GetCurrentDirectory();
var fixturePath = Path.Combine(root, ".run-local", "curriculum-checks.json");
var options = new DbContextOptionsBuilder<AdamDbContext>().UseNpgsql(connection).Options;
await using var db = new AdamDbContext(options);
var ct = CancellationToken.None;
var json = CurriculumService.JsonOptions;
if (args.Contains("--cleanup"))
{
    var saved = JsonSerializer.Deserialize<Fixture>(await File.ReadAllTextAsync(fixturePath), json)!;
    var lessonIds = await db.ContentRevisions.Where(x => x.EditorId == saved.UserId && x.Kind == "lesson").Select(x => x.ContentId).ToListAsync();
    await db.LessonRuns.Where(x => x.UserId == saved.UserId && (lessonIds.Contains(x.LessonId) || x.LessonId == saved.ConcurrentLessonId)).ExecuteDeleteAsync();
    await db.Attempts.Where(x => x.UserId == saved.UserId || saved.ExerciseIds.Contains(x.ExerciseId)).ExecuteDeleteAsync();
    await db.DialogueSessions.Where(x => x.UserId == saved.UserId || saved.DialogueIds.Contains(x.DialogueId)).ExecuteDeleteAsync();
    await db.ExerciseRewards.Where(x => x.UserId == saved.UserId).ExecuteDeleteAsync();
    await db.DialogueRewards.Where(x => x.UserId == saved.UserId).ExecuteDeleteAsync();
    await db.DailyActivities.Where(x => x.UserId == saved.UserId).ExecuteDeleteAsync();
    await db.Achievements.Where(x => x.UserId == saved.UserId).ExecuteDeleteAsync();
    await db.ContentRevisions.Where(x => x.EditorId == saved.UserId).ExecuteDeleteAsync();
    await db.Exercises.Where(x => saved.ExerciseIds.Contains(x.Id)).ExecuteDeleteAsync();
    await db.Dialogues.Where(x => saved.DialogueIds.Contains(x.Id)).ExecuteDeleteAsync();
    await db.Users.Where(x => x.Id == saved.UserId).ExecuteDeleteAsync();
    foreach (var media in saved.MediaPaths)
    {
        if (Path.GetFileName(media) != media || !media.StartsWith("curriculum-check-", StringComparison.Ordinal)) throw new Exception("Недопустимый путь фикстуры.");
        File.Delete(Path.Combine(root, "IronLanguage.Web", "wwwroot", "media", media));
    }
    File.Delete(fixturePath);
    Console.WriteLine("Тестовые записи удалены.");
    return;
}
if (File.Exists(fixturePath)) throw new InvalidOperationException("Сначала выполните --cleanup предыдущей проверки.");
if (db.Database.HasPendingModelChanges()) throw new Exception("Модель и миграции расходятся.");
if ((await db.Database.GetPendingMigrationsAsync()).Any(x => x.EndsWith("CoursesAndLessons") || x.EndsWith("LessonAttemptOrigins"))) throw new Exception("Сначала примените миграции курсов.");
var catalog = new EfCatalogRepository(db);
var repository = new EfCurriculumRepository(db);
var progress = new EfProgressRepository(db);
using var guests = new GuestLearningStore();
var learning = new LearningService(catalog, progress, guests);
var service = new CurriculumService(repository, catalog, progress, learning, guests);
var webRoot = Path.Combine(root, "IronLanguage.Web", "wwwroot");
var sources = (await catalog.Exercises(ct: ct))
    .Where(x => x.Kind == "translation" ||
        (x.Kind == "audio" && x.AudioPath is { } path && path.StartsWith("/media/", StringComparison.Ordinal) &&
            File.Exists(Path.Combine(webRoot, "media", Path.GetFileName(path)))))
    .GroupBy(x => x.Kind).Select(g => g.First()).ToList();
var mediaPaths = new List<string>();
if (!sources.Any(x => x.Kind == "audio") || !sources.Any(x => x.Kind == "translation"))
{
    using var seedFile = JsonDocument.Parse(await File.ReadAllTextAsync(Path.Combine(root, "IronLanguage.Web", "Data", "exercises", "exercises.json")));
    var seed = seedFile.RootElement[0]; var tokens = seed.GetProperty("tokens").Deserialize<string[]>()!;
    foreach (var kind in new[] { "audio", "translation" }.Where(kind => !sources.Any(x => x.Kind == kind)))
    {
        string? audioPath = null;
        if (kind == "audio")
        {
            var name = $"curriculum-check-{Guid.NewGuid():N}.mp3";
            Directory.CreateDirectory(Path.Combine(root, "IronLanguage.Web", "wwwroot", "media"));
            File.Copy(Path.Combine(root, "IronLanguage.Web", "Data", "exercises", "audio", seed.GetProperty("audio").GetString()!), Path.Combine(root, "IronLanguage.Web", "wwwroot", "media", name));
            mediaPaths.Add(name); audioPath = "/media/" + name;
        }
        sources.Add(new Exercise { Kind = kind, Published = true, RussianPrompt = seed.GetProperty("russianPrompt").GetString()!,
            OssetianAnswer = string.Join(' ', tokens), TokensJson = JsonSerializer.Serialize(tokens), DistractorsJson = seed.GetProperty("distractors").GetRawText(), AudioPath = audioPath });
    }
}
var exercises = sources.Select(x => { var copy = JsonSerializer.Deserialize<Exercise>(JsonSerializer.Serialize(x, json), json)!; copy.Id = Guid.NewGuid(); return copy; }).ToArray();
var sourceDialog = (await catalog.Dialogues(ct)).FirstOrDefault();
if (sourceDialog is null)
{
    using var seedFile = JsonDocument.Parse(await File.ReadAllTextAsync(Path.Combine(root, "IronLanguage.Web", "Data", "dialogues", "dialogues.json")));
    var seed = seedFile.RootElement[0];
    var parsed = DialogueScript.Parse(seed.GetProperty("title").GetString(), seed.GetProperty("dialect").GetString(), seed.GetProperty("level").GetInt32(),
        seed.GetProperty("characters").GetString(), seed.GetProperty("lines").GetString(), seed.GetProperty("turns").GetString());
    if (parsed.Material is null) throw new Exception("Исходный диалог не прошёл проверку");
    sourceDialog = new Dialogue { Title = parsed.Material.Title, Dialect = parsed.Material.Dialect, Level = parsed.Material.Level, ScriptJson = JsonSerializer.Serialize(parsed.Material, json), Published = true };
}
var dialogs = sourceDialog is null ? Array.Empty<Dialogue>() : new[] { JsonSerializer.Deserialize<Dialogue>(JsonSerializer.Serialize(sourceDialog, json), json)! };
foreach (var d in dialogs) d.Id = Guid.NewGuid();
var user = new UserAccount { Email = $"curriculum-{Guid.NewGuid():N}@example.invalid", IsEditor = true };
db.Users.Add(user); db.Exercises.AddRange(exercises); db.Dialogues.AddRange(dialogs); await db.SaveChangesAsync();
var lessonId = Guid.NewGuid(); var courseId = Guid.NewGuid(); var concurrentLessonId = Guid.NewGuid();
var fixture = new Fixture(user.Id, lessonId, courseId, concurrentLessonId, exercises.Select(x => x.Id).ToArray(), dialogs.Select(x => x.Id).ToArray(), "", dialogs.ToDictionary(x => x.Id, x => x.ScriptJson), mediaPaths.ToArray());
await File.WriteAllTextAsync(fixturePath, JsonSerializer.Serialize(fixture, json));
var checks = 0;
void Check(bool condition, string message) { if (!condition) throw new Exception(message); checks++; }
async Task Invalid(CurriculumForm form) { try { await service.Validate("lesson", form, user.Id, ct); throw new Exception("Невалидный урок принят"); } catch (ArgumentException) { checks++; } }
var theory = new CurriculumCard { Kind = "theory", Template = "comparison", Title = "Проверка букв", Body = "Ӕ ӕ", Secondary = "<script>не выполнять</script>" };
var cards = new[] { theory }.Concat(exercises.Select(x => new CurriculumCard { Kind = x.Kind, MaterialId = x.Id })).Concat(dialogs.Select(x => new CurriculumCard { Kind = "dialogue", MaterialId = x.Id })).ToArray();
var form = new CurriculumForm { Title = "Проверка курсов Ӕ ӕ", Description = "Временный материал для проверки интерфейса", StructureJson = JsonSerializer.Serialize(cards, json) };
await Invalid(new CurriculumForm { Title = "Проверка", StructureJson = "[null]" });
var emptyLesson = new CurriculumForm { Title = "Пустой урок" };
Check((await service.Validate("lesson", emptyLesson, user.Id, ct)).Cards.Length == 0, "Пустой черновик урока не сохраняется");
try { await service.Validate("lesson", emptyLesson, user.Id, ct, publishing: true); throw new Exception("Пустой урок разрешено публиковать"); }
catch (ArgumentException) { checks++; }
await Invalid(new CurriculumForm { Title = "Проверка", StructureJson = "[{}]" });
await Invalid(new CurriculumForm { Title = "Проверка", StructureJson = JsonSerializer.Serialize(new[] { new CurriculumCard { Kind = "audio", MaterialId = Guid.NewGuid() } }, json) });
await Invalid(new CurriculumForm { Title = "Проверка", StructureJson = JsonSerializer.Serialize(new[] { cards[1], cards[1] }, json) });
var doc = await service.Validate("lesson", form, user.Id, ct);
Check(await repository.Save("lesson", lessonId, JsonSerializer.Serialize(doc, json), user.Id, "", ct), "Черновик не сохранён");
Check(await repository.Get("lesson", lessonId, false, ct) is null, "Черновик раскрыт ученику");
Check(!await repository.Save("lesson", lessonId, "{}", user.Id, "", ct), "Устаревшее сохранение принято");
var draft = (await repository.Get("lesson", lessonId, true, ct))!;
var otherEditor = Guid.NewGuid();
Check(await repository.GetOwned("lesson", lessonId, otherEditor, ct) is null, "Чужой черновик раскрыт редактору");
Check(!(await repository.ListOwned("lesson", otherEditor, false, ct)).Any(x => x.ContentId == lessonId), "Чужой урок попал в библиотеку");
Check(!await repository.Save("lesson", lessonId, "{}", otherEditor, EfCurriculumRepository.Stamp(draft), ct), "Чужой черновик изменён");
Check(!await repository.Publish("lesson", lessonId, draft.Id, EfCurriculumRepository.Stamp(draft), otherEditor, ct), "Чужой черновик опубликован");
var draftCourse = new CurriculumForm { Title = "Проверка чернового курса", Outcomes = "Цели Ӕ ӕ", Audience = "Начинающие", StructureJson = JsonSerializer.Serialize(new[] { lessonId }) };
var draftCourseDoc = await service.Validate("course", draftCourse, user.Id, ct);
Check(draftCourseDoc.LessonIds.SequenceEqual([lessonId]), "Черновой урок нельзя добавить в черновой курс");
try { await service.Validate("course", draftCourse, user.Id, ct, publishing: true); throw new Exception("Курс с неопубликованным уроком разрешено публиковать"); } catch (ArgumentException) { checks++; }
try { await service.Validate("course", draftCourse, otherEditor, ct); throw new Exception("Разрешено добавить чужой урок"); } catch (ArgumentException) { checks++; }
var emptyCourse = new CurriculumForm { Title = "Пустой черновик" };
Check((await service.Validate("course", emptyCourse, user.Id, ct)).LessonIds.Length == 0, "Пустой черновик курса не сохраняется");
try { await service.Validate("course", emptyCourse, user.Id, ct, publishing: true); throw new Exception("Пустой курс разрешено публиковать"); } catch (ArgumentException) { checks++; }
var roundTrip = CurriculumService.Form(new ContentRevision { Kind = "course", PayloadJson = JsonSerializer.Serialize(draftCourseDoc, json) });
Check(roundTrip.Outcomes == draftCourse.Outcomes && roundTrip.Audience == draftCourse.Audience, "Поля о курсе потеряны");
try { await service.Validate("course", new CurriculumForm { Title = "Длина", Outcomes = new string('x', 2001) }, user.Id, ct); throw new Exception("Длина целей не ограничена"); } catch (ArgumentException) { checks++; }
Check(await repository.Publish("lesson", lessonId, draft.Id, EfCurriculumRepository.Stamp(draft), user.Id, ct), "Публикация не выполнена");
Check(!await repository.Publish("lesson", lessonId, draft.Id, EfCurriculumRepository.Stamp(draft), user.Id, ct), "Повторная публикация принята");
var courseDoc = await service.Validate("course", new CurriculumForm
{
    Title = "Проверочный курс",
    StructureJson = JsonSerializer.Serialize(new[] { lessonId }),
    ModulesJson = JsonSerializer.Serialize(new[] { new CourseModule("Приветствие", [lessonId]) }, json)
}, user.Id, ct, publishing: true);
Check(courseDoc.Modules.Single().LessonIds.SequenceEqual([lessonId]), "Модуль не сохранился");
await repository.Save("course", courseId, JsonSerializer.Serialize(courseDoc, json), user.Id, "", ct);
var courseDraft = (await repository.Get("course", courseId, true, ct))!;
await repository.Publish("course", courseId, courseDraft.Id, EfCurriculumRepository.Stamp(courseDraft), user.Id, ct);
// Независимые контексты имитируют одновременные запросы к одному уроку.
async Task<LessonRun> ConcurrentStart()
{
    await using var context = new AdamDbContext(options);
    return await new EfCurriculumRepository(context).Start(new LessonRun { UserId = user.Id, LessonId = concurrentLessonId, SnapshotJson = "{}" }, [], [], ct);
}
var simultaneousRuns = await Task.WhenAll(ConcurrentStart(), ConcurrentStart());
Check(simultaneousRuns[0].Id == simultaneousRuns[1].Id &&
    await db.LessonRuns.CountAsync(x => x.UserId == user.Id && x.LessonId == concurrentLessonId && x.CompletedAt == null) == 1,
    "Одновременный старт создал несколько активных уроков");
async Task<bool> ConcurrentAdvance()
{
    await using var context = new AdamDbContext(options);
    return await new EfCurriculumRepository(context).Advance(user.Id, simultaneousRuns[0].Id, 0, 2, ct);
}
var transitions = await Task.WhenAll(ConcurrentAdvance(), ConcurrentAdvance());
Check(transitions.All(x => x) && (await repository.Run(user.Id, simultaneousRuns[0].Id, ct))!.Step == 1,
    "Одновременный переход изменил шаг несколько раз");
Check(!await repository.Advance(Guid.NewGuid(), simultaneousRuns[0].Id, 1, 2, ct), "Чужой урок удалось продвинуть");
var run = (await service.Start(user.Id, Guid.Empty, lessonId, ct, courseId))!;
Check(CurriculumService.Snapshot(run).CourseId == courseId, "Урок не привязан к курсу в отчёте");
var editorRepository = new EfEditorRepository(db);
Check((await repository.MaterialUsage(exercises[0].Kind, exercises[0].Id, ct)).Any(row => row.ContentId == lessonId),
    "Связанный урок не найден");
Check(!await editorRepository.SetArchived(exercises[0].Kind, exercises[0].Id, true, ct), "Связанное задание снято с публикации");
Check((await service.Start(user.Id, Guid.Empty, lessonId, ct))!.Id == run.Id, "Повторный старт не восстановил урок");
// Самостоятельный запуск не должен подхватывать ещё не открытую карточку урока.
var lessonSnapshot = CurriculumService.Snapshot(run);
var exerciseCardIndex = Array.FindIndex(cards, c => c.Kind == "translation");
var lessonAttemptId = lessonSnapshot.AttemptIds[exerciseCardIndex]!.Value;
var standaloneExercise = (await learning.Start(user.Id, cards[exerciseCardIndex].MaterialId, ct))!.Value.Attempt!;
Check(standaloneExercise.Id != lessonAttemptId && standaloneExercise.LessonRunId is null &&
    (await progress.Attempt(user.Id, lessonAttemptId, ct))!.LessonRunId == run.Id,
    "Самостоятельное упражнение использовало попытку урока");
Check((await learning.Start(user.Id, cards[exerciseCardIndex].MaterialId, ct))!.Value.Attempt!.Id == standaloneExercise.Id,
    "Самостоятельное упражнение не восстановило собственную попытку");
var dialogueCardIndex = Array.FindIndex(cards, c => c.Kind == "dialogue");
var lessonSessionId = lessonSnapshot.AttemptIds[dialogueCardIndex]!.Value;
var dialogueService = new DialogueService(catalog, progress, guests);
var standaloneDialogue = (await dialogueService.Start(user.Id, cards[dialogueCardIndex].MaterialId, ct))!;
Check(standaloneDialogue.SessionId != lessonSessionId &&
    (await progress.Session(user.Id, standaloneDialogue.SessionId, ct))!.LessonRunId is null &&
    (await progress.Session(user.Id, lessonSessionId, ct))!.LessonRunId == run.Id,
    "Самостоятельный диалог использовал сессию урока");
Check((await dialogueService.Start(user.Id, cards[dialogueCardIndex].MaterialId, ct))!.SessionId == standaloneDialogue.SessionId,
    "Самостоятельный диалог не восстановил собственную сессию");

Check(await repository.Run(Guid.NewGuid(), run.Id, ct) is null, "Чужой урок раскрыт");
Check(!await service.Advance(user.Id, Guid.Empty, run, 1, ct), "Разрешён пропуск карточки");
var published = (await repository.Get("lesson", lessonId, false, ct))!;
var edited = CurriculumService.Form(published); edited.Title = "Проверка курсов Ӕ ӕ — новая версия";
var editedDoc = await service.Validate("lesson", edited, user.Id, ct);
Check(await repository.Save("lesson", lessonId, JsonSerializer.Serialize(editedDoc, json), user.Id, edited.Stamp, ct), "Новая версия не сохранена");
Check(CurriculumService.Parse((await repository.Get("lesson", lessonId, false, ct))!).Title == doc.Title, "Черновик заменил публикацию");
var newDraft = (await repository.Get("lesson", lessonId, true, ct))!;
Check(await repository.Publish("lesson", lessonId, newDraft.Id, EfCurriculumRepository.Stamp(newDraft), user.Id, ct, preserveProgress: true),
    "Мелкая правка не опубликована");
var minor = (await repository.Get("lesson", lessonId, false, ct))!;
Check(CurriculumService.CountsForProgress(run, new(minor, CurriculumService.Parse(minor))), "Мелкая правка сбросила результат");
Check(await repository.Save("lesson", lessonId, JsonSerializer.Serialize(editedDoc, json), user.Id, EfCurriculumRepository.Stamp(minor), ct),
    "Существенная версия не сохранена");
var majorDraft = (await repository.Get("lesson", lessonId, true, ct))!;
Check(await repository.Publish("lesson", lessonId, majorDraft.Id, EfCurriculumRepository.Stamp(majorDraft), user.Id, ct),
    "Существенная версия не опубликована");
var major = (await repository.Get("lesson", lessonId, false, ct))!;
Check(!CurriculumService.CountsForProgress(run, new(major, CurriculumService.Parse(major))), "Существенная правка засчитала старую попытку");
Check(CurriculumService.Snapshot((await repository.Run(user.Id, run.Id, ct))!).Title == doc.Title, "Публикация изменила снимок");
Check(await service.Advance(user.Id, Guid.Empty, run, 0, ct), "Теория не пройдена");
run = (await repository.Run(user.Id, run.Id, ct))!;
Check(await service.Advance(user.Id, Guid.Empty, run, 0, ct) && (await repository.Run(user.Id, run.Id, ct))!.Step == 1, "Повтор перехода пропустил карточку");
Check(!await service.Advance(user.Id, Guid.Empty, run, 1, ct), "Непройденное задание пропущено");
var snapshot = CurriculumService.Snapshot(run);
var index = Array.FindIndex(cards, c => c.Kind == "translation");
var attemptId = snapshot.AttemptIds[index]!.Value;
var attempt = (await progress.Attempt(user.Id, attemptId, ct))!;
var indices = LearningService.ParseTokens(attempt.TokensJson).Select((_, i) => i).ToArray();
var sourceAnswer = attempt.ExpectedAnswer;
var sourceExercise = exercises.Single(x => x.Id == attempt.ExerciseId);
await db.Exercises.Where(x => x.Id == sourceExercise.Id).ExecuteUpdateAsync(s => s.SetProperty(x => x.TokensJson, "[]").SetProperty(x => x.Version, 99));
Check((await learning.SnapshotCard("translation", attempt, ct)).Tokens.Length == indices.Length && attempt.ExpectedAnswer == sourceAnswer, "Редактирование задания изменило снимок");
await db.Exercises.Where(x => x.Id == sourceExercise.Id).ExecuteUpdateAsync(s => s.SetProperty(x => x.TokensJson, sourceExercise.TokensJson).SetProperty(x => x.Version, sourceExercise.Version));
Check(await learning.Answer(Guid.NewGuid(), attemptId, indices, ct) is null, "Чужой ответ принят");
var answered = await learning.Answer(user.Id, attemptId, indices, ct);
Check(answered is not null && !answered.AlreadySubmitted, "Ответ не проверен");
var points = (await progress.Activities(user.Id, ct)).Sum(x => x.Points);
Check((await learning.Answer(user.Id, attemptId, indices, ct))!.AlreadySubmitted, "Повтор не обнаружен");
Check((await progress.Activities(user.Id, ct)).Sum(x => x.Points) == points, "Повторные очки начислены");
Check(await service.Advance(user.Id, Guid.Empty, run, index, ct), "Завершённая карточка не отмечена");
var afterFuture = (await repository.Run(user.Id, run.Id, ct))!;
Check(CurriculumService.CompletedSteps(afterFuture, CurriculumService.Snapshot(afterFuture)).Contains(index), "Результат карточки не сохранён");
if (index > 1) Check(afterFuture.Step == 1 && afterFuture.CompletedAt is null, "Переход к будущей карточке завершил пропущенные карточки");

var report = await service.Report((await repository.Get("course", courseId, false, ct))!, ct);
Check(report.Lessons.Single().Started == 1 && report.Lessons.Single().Completed == 0, "Итоги отчёта неверны");
Check(report.Lessons.Single().Cards[index].Answered == 1, "Ответ не вошёл в отчёт");
var listening = new ListeningService(catalog, progress, guests);
var listeningSource = new Exercise { Kind = "listening", AudioPath = "/media/test.wav",
    OptionsJson = "[\"Первый\",\"Второй\",\"Третий\",\"Четвёртый\"]", CorrectOption = 2 };
var listeningAttempt = ListeningService.CreateSnapshot(listeningSource, Guid.Empty);
Check(listeningAttempt?.CorrectOption == 2 && listeningAttempt.ExpectedAnswer == "Третий", "Условия аудирования не попали в снимок");
var listeningOwner = Guid.NewGuid();
guests.Add(listeningOwner, listeningAttempt!.Id, listeningAttempt);
Check(await listening.AnswerGuest(Guid.NewGuid(), listeningAttempt.Id, 2, ct) is null, "Чужой ответ на аудирование принят");
Check((await listening.AnswerGuest(listeningOwner, listeningAttempt.Id, 2, ct))?.Correct == true, "Ответ по снимку аудирования не проверен");
Check((await listening.AnswerGuest(listeningOwner, listeningAttempt.Id, 1, ct))?.AlreadySubmitted == true, "Повторный ответ изменил результат аудирования");

var before = await db.Attempts.CountAsync(); var beforeRuns = await db.LessonRuns.CountAsync();
var owner = Guid.NewGuid(); var guestRun = (await service.Start(null, owner, lessonId, ct))!;
Check(await service.Run(null, Guid.NewGuid(), guestRun.Id, ct) is null, "Чужой гостевой урок раскрыт");
Check(await service.Advance(null, owner, guestRun, 0, ct), "Гостевая теория не пройдена");
Check(await service.SaveGuestDraft(Guid.NewGuid(), guestRun, [0], ct) is null, "Чужой черновик принят");
Check(await service.SaveGuestDraft(owner, guestRun, [0], ct) == true, "Гостевой черновик не сохранён");
var currentGuestAttempt = guests.Find<ExerciseAttempt>(owner, CurriculumService.Snapshot(guestRun).AttemptIds[guestRun.Step]!.Value)!.Value;
Check(JsonSerializer.Deserialize<int[]>(currentGuestAttempt.DraftIndicesJson)!.SequenceEqual([0]), "Гостевой черновик не восстановлен");
try { await service.SaveGuestDraft(owner, guestRun, [9999], ct); throw new Exception("Неверный гостевой черновик принят"); }
catch (ArgumentException) { checks++; }
var guestSnap = CurriculumService.Snapshot(guestRun);
var guestAttempt = guests.Find<ExerciseAttempt>(owner, guestSnap.AttemptIds[index]!.Value)!.Value;
Check(await learning.AnswerGuest(Guid.NewGuid(), guestAttempt.Id, indices, ct) is null, "Чужой гостевой ответ принят");
await learning.AnswerGuest(owner, guestAttempt.Id, indices, ct);
Check((await learning.AnswerGuest(owner, guestAttempt.Id, indices, ct))!.AlreadySubmitted, "Гостевой повтор не обнаружен");
Check(await db.Attempts.CountAsync() == before && await db.LessonRuns.CountAsync() == beforeRuns, "Гостевой прогресс записан в БД");
// Cookie нужен только локальному браузерному прогону. Он не выводится и не попадает в Git.
var protection = DataProtectionProvider.Create(new DirectoryInfo(Environment.GetEnvironmentVariable("DataProtection__KeysDirectory") ?? Path.Combine(root, "IronLanguage.Web", ".data-protection-keys")), b => b.SetApplicationName("Adam"));
var format = new TicketDataFormat(protection.CreateProtector("Microsoft.AspNetCore.Authentication.Cookies.CookieAuthenticationMiddleware", "Cookies", "v2"));
var identity = new ClaimsIdentity(new[] { new Claim(ClaimTypes.NameIdentifier, user.Id.ToString()), new Claim(ClaimTypes.Name, user.Email), new Claim(ClaimTypes.Role, "Editor") }, "Cookies");
var cookie = format.Protect(new AuthenticationTicket(new ClaimsPrincipal(identity), new AuthenticationProperties { ExpiresUtc = DateTimeOffset.UtcNow.AddHours(1) }, "Cookies"));
await File.WriteAllTextAsync(fixturePath, JsonSerializer.Serialize(fixture with { Cookie = cookie }, json));
Console.WriteLine($"Проверок: {checks}. Типы заданий в фикстуре: {string.Join(", ", cards.Where(c => c.Kind != "theory").Select(c => c.Kind))}. После браузерного прогона выполните --cleanup.");

record Fixture(Guid UserId, Guid LessonId, Guid CourseId, Guid ConcurrentLessonId, Guid[] ExerciseIds, Guid[] DialogueIds, string Cookie, Dictionary<Guid, string> Scripts, string[] MediaPaths);

#pragma warning disable CS0618
sealed class TestClock : Microsoft.Extensions.Internal.ISystemClock
{
    public DateTimeOffset UtcNow { get; private set; } = DateTimeOffset.UtcNow;
    public void Advance(TimeSpan interval) => UtcNow += interval;
}
#pragma warning restore CS0618
