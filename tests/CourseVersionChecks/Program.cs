using IronLanguage.Db;
using IronLanguage.Web.Services;
using IronLanguage.Web.Models;
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
var rich = block with { RichText = JsonSerializer.SerializeToElement(new { ops = new[] { new { insert = "Ӕ ӕ\n", attributes = new { bold = true, color = "#173f32", size = "22px" } } } }) };
Check(CourseRichText.PlainText(rich) == "Ӕ ӕ", "Форматирование потеряло осетинские символы");
foreach (var unsafeJson in new[] { "{\"ops\":[{\"insert\":{\"image\":\"https://example.invalid/x\"}}]}", "{\"ops\":[{\"insert\":\"x\",\"attributes\":{\"link\":\"javascript:alert(1)\"}}]}", "{\"ops\":[{\"insert\":\"x\",\"attributes\":{\"color\":\"url(x)\"}}]}", "{\"ops\":[{\"delete\":1}]}" })
{
    var rejected = false;
    try { CourseRichText.PlainText(block with { RichText = JsonSerializer.Deserialize<JsonElement>(unsafeJson) }); } catch (ArgumentException) { rejected = true; }
    Check(rejected, "Опасное оформление прошло проверку");
}
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
string? browserAudioFile = null;
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
    var unordered = await lessons.Start(new CourseLessonSession { UserId = learner.Id, CourseId = course.Id, VersionId = first.Id, LessonId = Guid.NewGuid() }, [], ct);
    Check(await lessons.Advance(learner.Id, unordered.Id, 2, 3, null, ct), "Не сохранён просмотр последнего блока");
    var unorderedState = (await lessons.Session(learner.Id, unordered.Id, ct))!;
    Check(unorderedState.Step == 0 && unorderedState.CompletedAt is null && unorderedState.CompletedSteps.Contains(2), "Просмотр последнего блока завершил весь урок");
    Check(!await lessons.Advance(other.Id, unordered.Id, 0, 3, null, ct), "Чужой прогресс изменён");
    await lessons.Advance(learner.Id, unordered.Id, 0, 3, null, ct);
    await lessons.Advance(learner.Id, unordered.Id, 1, 3, null, ct);
    Check((await lessons.Session(learner.Id, unordered.Id, ct))!.Step == 3, "Не учтён ранее просмотренный блок");
    Check(await lessons.Advance(learner.Id, unordered.Id, 2, 3, null, ct), "Повтор просмотра не идемпотентен");
    await db.CourseLessonSessions.Where(s => s.Id == unordered.Id).ExecuteDeleteAsync(ct);
    var audioExercise = new Exercise { Kind = "listening", Published = true, RussianPrompt = "Тестовый вопрос", AudioPath = $"/media/{Guid.NewGuid():N}.wav", OptionsJson = "[\"Вариант 1\",\"Вариант 2\",\"Вариант 3\",\"Вариант 4\"]", CorrectOption = 2 };
    db.Exercises.Add(audioExercise); await db.SaveChangesAsync(ct);
    db.CourseMaterialAccesses.Add(new CourseMaterialAccess { Kind = audioExercise.Kind, MaterialId = audioExercise.Id, OwnerId = owner.Id });
    await db.SaveChangesAsync(ct);
    var audioBlock = new CourseDraftBlock(Guid.NewGuid(), "listening", "Аудирование", "") { MaterialId = audioExercise.Id };
    var audioLesson = new CourseDraftLesson(Guid.NewGuid(), "Урок", [audioBlock]);
    var materialAccess = new EfCourseMaterialRepository(db);
    Check(await catalog.Exercise(audioExercise.Id, ct: ct) is null, "Личное упражнение доступно в общем каталоге");
    Check(!await materialAccess.CanReadMedia(audioExercise.AudioPath!, null, ct), "Аудио личного материала выдаётся напрямую");
    Check(await materialAccess.CanReadMedia(audioExercise.AudioPath!, owner.Id, ct), "Автор не может прослушать свой материал");
    Check((await materialAccess.Search(owner.Id, "listening", "вопрос", true, 1, ct)).Items.Single().Id == audioExercise.Id, "Свое упражнение не найдено");
    Check((await materialAccess.Selected(owner.Id, [audioExercise.Id], ct)).Single().Own, "Сохранённое упражнение владельца не найдено");
    Check((await materialAccess.Selected(other.Id, [audioExercise.Id], ct)).Length == 0, "Сведения о личном упражнении доступны другому автору");
    Check((await materialAccess.Search(other.Id, "listening", null, false, 1, ct)).Items.Length == 0, "Другой преподаватель видит личное упражнение");
    Check(!await materialAccess.Configure(other.Id, "listening", audioExercise.Id, true, true, ct), "Чужой преподаватель поменял права");
    var audioAuthor = new CourseAuthoringService(repo, materialAccess, lessons);
    var audioCourse = await audioAuthor.Create(owner.Id, new CourseDraft("Проверка аудирования", "Описание", [new(Guid.NewGuid(), "Модуль", [audioLesson])]), ct);
    await audioAuthor.Publish(audioCourse.Id, owner.Id, audioCourse.DraftStamp, true, ct);
    var borrowedDraft = CourseLearningService.Read((await lessons.Version(audioCourse.Id, null, ct))!);
    await materialAccess.Configure(owner.Id, "listening", audioExercise.Id, false, true, ct);
    Check(!(await materialAccess.Selected(other.Id, [audioExercise.Id], ct)).Single().Own, "Общий материал не показан как чужой");
    var borrowed = await audioAuthor.Create(other.Id, borrowedDraft, ct);
    Check(await audioAuthor.Publish(borrowed.Id, other.Id, 0, true, ct) is not null, "Разрешённое упражнение не опубликовано");
    await materialAccess.Configure(owner.Id, "listening", audioExercise.Id, false, false, ct);
    Check((await materialAccess.Selected(other.Id, [audioExercise.Id], ct)).Length == 0, "Отзыв не скрыл сведения об упражнении");
    await audioAuthor.Save(borrowed.Id, other.Id, 0, borrowedDraft with { Title = "Изменено описание курса" }, ct);
    Check(await audioAuthor.Publish(borrowed.Id, other.Id, 1, true, ct) is not null, "Отзыв уничтожил опубликованное включение");
    var newInclusionRejected = false;
    try { await audioAuthor.Create(other.Id, borrowedDraft, ct); }
    catch (ArgumentException) { newInclusionRejected = true; }
    Check(newInclusionRejected, "Отозванный материал добавлен в новый курс");
    var audioSession = (await runner.Start(audioCourse.Id, audioLesson.Id, learner.Id, Guid.NewGuid(), ct))!;
    Check(!await runner.Advance(audioSession.Id, audioBlock.Id, learner.Id, Guid.Empty, ct), "Аудирование зачтено без ответа");
    var failedAttempt = JsonSerializer.Deserialize<Guid?[]>(audioSession.AttemptIdsJson)![0]!.Value;
    Check(await learning.Answer(learner.Id, failedAttempt, [2], ct) is null, "Упражнение курса доступно через общий API ответов");
    Check(!(await runner.Answer(audioSession.Id, audioBlock.Id, [0], learner.Id, Guid.Empty, ct))!.Correct, "Неверный ответ принят");
    Check(!await runner.Advance(audioSession.Id, audioBlock.Id, learner.Id, Guid.Empty, ct), "Неверный ответ завершил блок");
    Check(!await runner.Retry(audioSession.Id, audioBlock.Id, failedAttempt, other.Id, Guid.Empty, ct), "Чужая попытка заменена");
    Check(await runner.Retry(audioSession.Id, audioBlock.Id, failedAttempt, learner.Id, Guid.Empty, ct), "Повторная попытка не создана");
    var retried = (await lessons.Session(learner.Id, audioSession.Id, ct))!.AttemptIdsJson;
    Check(await runner.Retry(audioSession.Id, audioBlock.Id, failedAttempt, learner.Id, Guid.Empty, ct) && (await lessons.Session(learner.Id, audioSession.Id, ct))!.AttemptIdsJson == retried, "Дубликат заменил новую попытку");
    Check(await db.Attempts.AnyAsync(a => a.Id == failedAttempt && a.Correct == false && a.CompletedAt != null, ct), "История ошибки потеряна");
    var staleRejected = false;
    try { await runner.Answer(audioSession.Id, audioBlock.Id, [0], learner.Id, Guid.Empty, ct, failedAttempt); }
    catch (ArgumentException) { staleRejected = true; }
    Check(staleRejected, "Устаревшая вкладка ответила за новую попытку");
    Check((await runner.Answer(audioSession.Id, audioBlock.Id, [2], learner.Id, Guid.Empty, ct))!.Correct, "Аудирование не проверено");
    Check((await runner.Answer(audioSession.Id, audioBlock.Id, [0], learner.Id, Guid.Empty, ct))!.AlreadySubmitted, "Повтор аудирования изменил результат");
    Check(await runner.Advance(audioSession.Id, audioBlock.Id, learner.Id, Guid.Empty, ct), "Аудирование не завершилось");
    var guestOwner = Guid.NewGuid();
    var guestAudio = (await runner.Start(audioCourse.Id, audioLesson.Id, null, guestOwner, ct))!;
    var guestAttempt = JsonSerializer.Deserialize<Guid?[]>(guestAudio.AttemptIdsJson)![0]!.Value;
    await runner.Answer(guestAudio.Id, audioBlock.Id, [0], null, guestOwner, ct);
    Check(!await runner.Advance(guestAudio.Id, audioBlock.Id, null, guestOwner, ct), "Гостю зачтён неверный ответ");
    Check(await runner.Retry(guestAudio.Id, audioBlock.Id, guestAttempt, null, guestOwner, ct), "Гостевая повторная попытка недоступна");
    Check((await runner.Answer(guestAudio.Id, audioBlock.Id, [2], null, guestOwner, ct))!.Correct && await runner.Advance(guestAudio.Id, audioBlock.Id, null, guestOwner, ct), "Гость не завершил повторную попытку");
    var materialEditor = new EfEditorRepository(db);
    var kinds = new (string Kind, object Payload)[]
    {
        ("audio", new ExerciseMaterial("audio", "Проверка", "Ӕ ӕ", ["Ӕ", "ӕ"], [], "", [], "/media/test.mp3", [["А", "Б"], ["В", "Г"]])),
        ("matching", new MatchingMaterial("Пары", [new("А", "Б"), new("В", "Г")], [], [])),
        ("picture", new PictureMaterial("Картинка", "/media/test.png", "Ӕ", "free", [], [])),
        ("grammar", new GrammarMaterial("Форма", "А ___", "___", "ӕ", "Правило", ["А", "Б"], [])),
        ("dialogue", new DialogueMaterial("Диалог", "iron", 1, [new("npc", "Собеседник", "#203F34")],
            [new(1, "npc", "Ӕ"), new(2, "student", "")], [new(2, "choice", ["ӕ"], ["ӕ", "Б"], 2, false)]))
    };
    var practiceBlocks = new List<CourseDraftBlock>();
    foreach (var (kind, payload) in kinds)
    {
        var material = await materialEditor.Create(kind, JsonSerializer.Serialize(payload, CourseAuthoringService.JsonOptions), ct, owner.Id);
        Check(await materialEditor.PublishDraft(kind, material, owner.Id, ct), "Не опубликована тестовая версия " + kind);
        practiceBlocks.Add(new(Guid.NewGuid(), kind, kind, "") { MaterialId = material });
    }
    var practiceAuthor = new CourseAuthoringService(repo, materialAccess, lessons, materialEditor, new EfLessonLibraryRepository(db));
    var practiceLesson = lesson with { Id = Guid.NewGuid(), Blocks = practiceBlocks.ToArray() };
    var practiceCourse = await practiceAuthor.Create(owner.Id, draft with { Modules = [module with { Lessons = [practiceLesson] }] }, ct);
    Check(await practiceAuthor.Publish(practiceCourse.Id, owner.Id, 0, true, ct) is not null, "Новые типы не опубликованы в курсе");
    var practiceSession = (await runner.Start(practiceCourse.Id, practiceLesson.Id, learner.Id, guestOwner, ct))!;
    foreach (var exercise in practiceBlocks)
    {
        Check(!await runner.Advance(practiceSession.Id, exercise.Id, learner.Id, guestOwner, ct), "Блок зачтён без ответа: " + exercise.Kind);
        var exerciseState = JsonSerializer.SerializeToElement(await runner.State(practiceSession.Id, learner.Id, guestOwner, ct, exercise.Id), CourseAuthoringService.JsonOptions).GetProperty("block");
        if (exercise.Kind == "audio")
        {
            var deck = exerciseState.GetProperty("card").GetProperty("tokens").EnumerateArray().Select(x => x.GetString()).ToArray();
            Check((await runner.Answer(practiceSession.Id, exercise.Id, [Array.IndexOf(deck, "Ӕ"), Array.IndexOf(deck, "ӕ")], learner.Id, guestOwner, ct))!.Correct, "Аудиопазл не проверен");
        }
        else
        {
            var board = exerciseState.GetProperty("practice").GetProperty("board");
            var input = new CoursePracticeInput(exercise.Id, 0, null, null, null);
            if (exercise.Kind == "matching")
            {
                int Right(string word) => board.GetProperty("right").EnumerateArray().Single(x => x.GetProperty("text").GetString() == word).GetProperty("index").GetInt32();
                await runner.PracticeAnswer(practiceSession.Id, input with { Pair = new(0, Right("Б")) }, learner.Id, guestOwner, ct);
                Check(!await runner.Advance(practiceSession.Id, exercise.Id, learner.Id, guestOwner, ct), "Одна пара завершила соотнесение");
                input = input with { Revision = 1, Pair = new(1, Right("Г")) };
            }
            else if (exercise.Kind == "picture") input = input with { Choice = new(null, "Ӕ") };
            else if (exercise.Kind == "grammar")
            {
                var answerOptions = board.GetProperty("options").EnumerateArray().Select(x => x.GetString()).ToArray();
                input = input with { Choice = new(Array.IndexOf(answerOptions, "ӕ"), null) };
            }
            else input = input with { Dialogue = new DialogueAnswerInput(2, "ӕ", false) };
            Check(await runner.PracticeAnswer(practiceSession.Id, input, other.Id, guestOwner, ct) is null, "Чужое упражнение приняло ответ");
            await runner.PracticeAnswer(practiceSession.Id, input, learner.Id, guestOwner, ct);
        }
        Check(await runner.Advance(practiceSession.Id, exercise.Id, learner.Id, guestOwner, ct), "Успешный ответ не зачёл " + exercise.Kind);
    }
    var analytics = new CourseAnalytics(repo, lessons);
    Check(await analytics.Report(practiceCourse.Id, other.Id, null, 30, 1, ct) is null, "Чужой автор видит отчёт");
    Check(await analytics.Report(practiceCourse.Id, owner.Id, learner.Id, 30, 1, ct) is not null, "Автор не видит результат ученика");
    var administration = new EfCourseAdministrationRepository(db);
    Check(await administration.ChangeCourse(owner.Id, practiceCourse.Id, true, "Проверка блокировки", ct), "Курс не заблокирован");
    Check(await lessons.Version(practiceCourse.Id, learner.Id, ct) is null, "Записанный ученик видит заблокированный курс");
    Check(!await runner.Advance(practiceSession.Id, practiceBlocks[0].Id, learner.Id, guestOwner, ct), "Старая ссылка обошла блокировку курса");
    Check(await administration.ChangeCourse(owner.Id, practiceCourse.Id, false, "Проверка разблокировки", ct), "Курс не разблокирован");
    var session = (await runner.Start(course.Id, lesson.Id, learner.Id, guestOwner, ct))!;
    Check(session.VersionId == second.Id, "Урок не обновился до опубликованной версии");
    Check((await runner.Start(course.Id, lesson.Id, learner.Id, guestOwner, ct))!.Id == session.Id, "Повтор запуска создал сессию");
    Check(await runner.State(session.Id, other.Id, guestOwner, ct) is null, "Чужая сессия доступна");
    Check(!await runner.Advance(session.Id, Guid.NewGuid(), learner.Id, guestOwner, ct), "Зачтён чужой блок");
    Check(await runner.Advance(session.Id, block.Id, learner.Id, guestOwner, ct), "Теория не завершилась");
    Check(await runner.Advance(session.Id, block.Id, learner.Id, guestOwner, ct), "Повтор завершения не идемпотентен");
    var reviewed = JsonSerializer.SerializeToElement(await runner.State(session.Id, learner.Id, guestOwner, ct, block.Id), CourseAuthoringService.JsonOptions);
    Check(reviewed.GetProperty("viewStep").GetInt32() == 0 && reviewed.GetProperty("step").GetInt32() == 1 && reviewed.GetProperty("completed").GetBoolean(), "Повторный просмотр сбросил прогресс");
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
    var evolving = await service.Create(owner.Id, draft, ct);
    await service.Publish(evolving.Id, owner.Id, 0, true, ct);
    var evolvingSession = (await runner.Start(evolving.Id, lesson.Id, learner.Id, guestOwner, ct))!;
    await runner.Advance(evolvingSession.Id, block.Id, learner.Id, guestOwner, ct);
    var guestEvolution = (await runner.Start(evolving.Id, lesson.Id, null, guestOwner, ct))!;
    await runner.Advance(guestEvolution.Id, block.Id, null, guestOwner, ct);
    var extra = new CourseDraftBlock(Guid.NewGuid(), "theory", "Добавленный блок", "Новый текст");
    var revised = draft with { Modules = [module with { Lessons = [lesson with { Blocks = [block, extra] }] }] };
    await service.Save(evolving.Id, owner.Id, 0, revised, ct);
    var latest = (await service.Publish(evolving.Id, owner.Id, 1, true, ct))!;
    var counts = await runner.BlockProgress(evolving.Id, latest, learner.Id, guestOwner, ct);
    Check(counts.Completed == 1 && counts.Total == 2, "Добавленный блок не изменил знаменатель прогресса");
    var refreshed = JsonSerializer.SerializeToElement(await runner.State(evolvingSession.Id, learner.Id, guestOwner, ct), CourseAuthoringService.JsonOptions);
    Check(refreshed.GetProperty("count").GetInt32() == 2 && refreshed.GetProperty("steps")[0].GetProperty("completed").GetBoolean() && !refreshed.GetProperty("steps")[1].GetProperty("completed").GetBoolean(), "Старая ссылка не обновила программу и прогресс");
    var refreshedGuest = JsonSerializer.SerializeToElement(await runner.State(guestEvolution.Id, null, guestOwner, ct), CourseAuthoringService.JsonOptions);
    Check(refreshedGuest.GetProperty("count").GetInt32() == 2 && refreshedGuest.GetProperty("steps")[0].GetProperty("completed").GetBoolean(), "Гостевая программа не обновилась");
    var altered = revised with { Modules = [module with { Lessons = [lesson with { Blocks = [block with { Text = "Изменённый текст" }, extra] }] }] };
    await service.Save(evolving.Id, owner.Id, 1, altered, ct);
    var alteredVersion = (await service.Publish(evolving.Id, owner.Id, 2, true, ct))!;
    Check((await runner.BlockProgress(evolving.Id, alteredVersion, learner.Id, guestOwner, ct)).Completed == 0, "Изменённый блок сохранил зачёт");
    Check(await runner.State(evolvingSession.Id, other.Id, guestOwner, ct) is null, "Обновление открыло чужую попытку");
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
        db.CourseMaterialAccesses.Add(new CourseMaterialAccess { Kind = phrase.Kind, MaterialId = phrase.Id, OwnerId = owner.Id });
        var password = "aA1!" + Convert.ToBase64String(RandomNumberGenerator.GetBytes(24));
        foreach (var u in new[] { owner, other, learner })
        {
            u.UserName = u.Email; u.NormalizedEmail = u.Email!.ToUpperInvariant(); u.NormalizedUserName = u.NormalizedEmail;
            u.PasswordHash = new PasswordHasher<UserAccount>().HashPassword(u, password); u.PublicName = "Проверка курсов";
        }
        var role = await db.Roles.FirstAsync(x => x.Name == "Editor");
        db.UserRoles.Add(new IdentityUserRole<Guid> { UserId = owner.Id, RoleId = role.Id });
        db.UserRoles.Add(new IdentityUserRole<Guid> { UserId = other.Id, RoleId = role.Id });
        await db.SaveChangesAsync();
        var webRoot = Path.GetFullPath("IronLanguage.Web");
        var playable = new Exercise
        {
            Kind = "listening", Published = true, RussianPrompt = "Проверка записи",
            AudioPath = $"/media/{Guid.NewGuid():N}.wav", OptionsJson = audioExercise.OptionsJson, CorrectOption = audioExercise.CorrectOption
        };
        db.Exercises.Add(playable);
        db.CourseMaterialAccesses.Add(new CourseMaterialAccess { Kind = playable.Kind, MaterialId = playable.Id, OwnerId = owner.Id });
        await db.SaveChangesAsync(ct);
        var mediaFolder = Path.Combine(webRoot, "wwwroot", "media");
        Directory.CreateDirectory(mediaFolder);
        var audioFile = Path.Combine(mediaFolder, Path.GetFileName(playable.AudioPath));
        using (var writer = new BinaryWriter(new FileStream(audioFile, FileMode.CreateNew)))
        {
            browserAudioFile = audioFile;
            // A tenth of a second of silent, mono PCM at 8 kHz.
            writer.Write("RIFF"u8); writer.Write(1636); writer.Write("WAVEfmt "u8); writer.Write(16);
            writer.Write((short)1); writer.Write((short)1); writer.Write(8000); writer.Write(16000);
            writer.Write((short)2); writer.Write((short)16); writer.Write("data"u8); writer.Write(1600);
            writer.Write(new byte[1600]);
        }
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
        browser.Environment["ADAM_COURSE_FIXTURE"] = JsonSerializer.Serialize(new { owner = owner.Email, learner = learner.Email, other = other.Email, password, phraseId = phrase.Id, tokens = LearningService.ParseTokens(phrase.TokensJson), expected = phrase.OssetianAnswer,
            phraseTitle = phrase.RussianPrompt, missingAudioId = audioExercise.Id, playableAudioId = playable.Id, audioPath = playable.AudioPath });
        using var process = Process.Start(browser)!;
        var output = process.StandardOutput.ReadToEndAsync(); var error = process.StandardError.ReadToEndAsync();
        await process.WaitForExitAsync(); Console.Write(await output); Console.Error.Write(await error); Check(process.ExitCode == 0, "Браузерная проверка не прошла");
    }
    Console.WriteLine($"Проверок пройдено: {count}. Изолированная схема будет удалена.");
}
finally
{
    if (site is { HasExited: false }) { site.Kill(entireProcessTree: true); await site.WaitForExitAsync(); }
    if (browserAudioFile is not null) File.Delete(browserAudioFile);
    NpgsqlConnection.ClearAllPools();
    await using var cleanup = new NpgsqlCommand($"DROP SCHEMA \"{schema}\" CASCADE", control);
    await cleanup.ExecuteNonQueryAsync();
}
