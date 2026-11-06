using System.Text.Json;
using IronLanguage.Db;
using IronLanguage.Web.Models;

namespace IronLanguage.Web.Services;

public sealed class CurriculumService(ICurriculumRepository repository, ICatalogRepository catalog,
    IProgressRepository progress, LearningService learning, GuestLearningStore guests)
{
    public static readonly JsonSerializerOptions JsonOptions = new(JsonSerializerDefaults.Web);
    public static bool IsKind(string kind) => kind is "course" or "lesson";
    public static CurriculumDocument Parse(ContentRevision revision) => JsonSerializer.Deserialize<CurriculumDocument>(revision.PayloadJson, JsonOptions)!;
    public static LessonSnapshot Snapshot(LessonRun run) => JsonSerializer.Deserialize<LessonSnapshot>(run.SnapshotJson, JsonOptions)!;

    public async Task<CurriculumChoice[]> Choices(string kind, Guid editor, CancellationToken ct)
    {
        if (kind == "course")
            return (await repository.ListOwned("lesson", editor, false, ct)).Select(x => new CurriculumChoice(x.ContentId, "lesson", Parse(x).Title, x.Published)).OrderBy(x => x.Title).ToArray();
        return (await catalog.Exercises(ct: ct)).Where(x => x.Kind is "audio" or "translation").Select(x => new CurriculumChoice(x.Id, x.Kind, x.RussianPrompt))
            .Concat((await catalog.Dialogues(ct)).Select(x => new CurriculumChoice(x.Id, "dialogue", x.Title))).OrderBy(x => x.Title).ToArray();
    }

    public async Task<CurriculumDocument> Validate(string kind, CurriculumForm form, Guid editor, CancellationToken ct, bool publishing = false)
    {
        if (!IsKind(kind)) throw new ArgumentException("Неизвестный вид материала.");
        if (string.IsNullOrWhiteSpace(form.Title) || form.Title.Length > 200) throw new ArgumentException("Укажите название до 200 символов.");
        if ((form.Description?.Length ?? 0) > 2000) throw new ArgumentException("Описание: не более 2000 символов.");
        if (form.StructureJson is null || form.StructureJson.Length > 250_000) throw new ArgumentException("Слишком большой материал.");
        if ((form.Outcomes?.Length ?? 0) > 2000 || (form.Audience?.Length ?? 0) > 2000)
            throw new ArgumentException("Цели и аудитория: не более 2000 символов в каждом поле.");
        var document = new CurriculumDocument { Title = form.Title.Trim(), Description = form.Description?.Trim() ?? "",
            Outcomes = form.Outcomes?.Trim() ?? "", Audience = form.Audience?.Trim() ?? "" };
        var choices = await Choices(kind, editor, ct);
        try
        {
            if (kind == "course")
            {
                document.LessonIds = JsonSerializer.Deserialize<Guid[]>(form.StructureJson, JsonOptions) ?? [];
                if (document.LessonIds.Length > 100 || (publishing && document.LessonIds.Length == 0) || document.LessonIds.Distinct().Count() != document.LessonIds.Length)
                    throw new ArgumentException("В курсе должно быть от 1 до 100 разных уроков.");
                if (document.LessonIds.Any(id => !choices.Any(c => c.Id == id))) throw new ArgumentException("Выберите уроки из своей библиотеки.");
                if (publishing)
                {
                    var published = await repository.ListOwned("lesson", editor, true, ct);
                    if (document.LessonIds.Any(id => !published.Any(x => x.ContentId == id)))
                        throw new ArgumentException("Перед публикацией курса опубликуйте все добавленные уроки.");
                }
            }
            else
            {
                document.Cards = JsonSerializer.Deserialize<CurriculumCard[]>(form.StructureJson, JsonOptions) ?? [];
                if (document.Cards.Length > 50 || (publishing && document.Cards.Length == 0)) throw new ArgumentException("В уроке должно быть от 1 до 50 карточек.");
                foreach (var card in document.Cards)
                {
                    if (card is null) throw new ArgumentException("Пустая карточка.");
                    if (card.Kind == "theory")
                    {
                        if (card.Template is not ("text" or "rule" or "example" or "comparison")) throw new ArgumentException("Неизвестный шаблон теории.");
                        if (string.IsNullOrWhiteSpace(card.Title) || card.Title.Length > 200 || string.IsNullOrWhiteSpace(card.Body) || card.Body.Length > 5000)
                            throw new ArgumentException("Для теории нужны заголовок до 200 и текст до 5000 символов.");
                        if (card.Secondary is null || card.Secondary.Length > 5000 || (card.Template is "example" or "comparison" && string.IsNullOrWhiteSpace(card.Secondary)))
                            throw new ArgumentException("Заполните второе поле примера или сравнения (до 5000 символов).");
                        card.MaterialId = Guid.Empty;
                    }
                    else if (card.Kind is "audio" or "translation" or "dialogue")
                    {
                        var choice = choices.SingleOrDefault(x => x.Id == card.MaterialId && x.Kind == card.Kind)
                            ?? throw new ArgumentException("Выберите опубликованное задание для каждой карточки.");
                        card.Title = choice.Title; card.Body = ""; card.Secondary = ""; card.Template = "";
                    }
                    else throw new ArgumentException("Неизвестный тип карточки.");
                }
                var references = document.Cards.Where(c => c.Kind != "theory").Select(c => c.MaterialId).ToArray();
                if (references.Distinct().Count() != references.Length) throw new ArgumentException("Одно задание можно добавить в урок один раз.");
            }
        }
        catch (JsonException) { throw new ArgumentException("Не удалось прочитать структуру материала. Перезагрузите конструктор."); }
        return document;
    }

    public static CurriculumForm Form(ContentRevision revision)
    {
        var doc = Parse(revision);
        return new CurriculumForm { Title = doc.Title, Description = doc.Description, Outcomes = doc.Outcomes, Audience = doc.Audience, Stamp = EfCurriculumRepository.Stamp(revision),
            StructureJson = revision.Kind == "course" ? JsonSerializer.Serialize(doc.LessonIds, JsonOptions) : JsonSerializer.Serialize(doc.Cards, JsonOptions) };
    }

    public async Task<LessonRun?> Start(Guid? user, Guid owner, Guid lessonId, CancellationToken ct)
    {
        if (user.HasValue)
        {
            var active = (await repository.Runs(user.Value, ct)).FirstOrDefault(x => x.LessonId == lessonId && x.CompletedAt == null);
            if (active is not null) return active;
        }
        var revision = await repository.Get("lesson", lessonId, false, ct);
        if (revision is null) return null;
        var document = Parse(revision);
        var attempts = new List<ExerciseAttempt>();
        var dialogs = new List<DialogueSession>();
        var ids = new Guid?[document.Cards.Length];
        for (var i = 0; i < document.Cards.Length; i++)
        {
            var card = document.Cards[i];
            if (card.Kind == "theory") continue;
            if (card.Kind == "dialogue")
            {
                var dialogue = await catalog.Dialogue(card.MaterialId, ct) ?? throw new ArgumentException("Диалог снят с публикации. Сообщите редактору.");
                var session = DialogueService.CreateSnapshot(dialogue, user ?? Guid.Empty);
                dialogs.Add(session); ids[i] = session.Id;
            }
            else
            {
                var exercise = await catalog.Exercise(card.MaterialId, ct: ct) ?? throw new ArgumentException("Задание снято с публикации. Сообщите редактору.");
                if (exercise.Kind != card.Kind) throw new ArgumentException("Вид задания изменился. Сообщите редактору.");
                var attempt = LearningService.CreateSnapshot(exercise, user ?? Guid.Empty);
                attempts.Add(attempt); ids[i] = attempt.Id;
            }
        }
        var run = new LessonRun { UserId = user ?? Guid.Empty, LessonId = lessonId, LessonVersion = revision.Version,
            SnapshotJson = JsonSerializer.Serialize(new LessonSnapshot(document.Title, document.Cards, ids), JsonOptions) };
        if (user.HasValue) return await repository.Start(run, attempts, dialogs, ct);
        guests.AddGroup(owner, group =>
        {
            group.Add(run.Id, run);
            foreach (var attempt in attempts) group.Add(attempt.Id, attempt);
            foreach (var dialog in dialogs) group.Add(dialog.Id, dialog);
        });
        return run;
    }

    public Task<LessonRun?> Run(Guid? user, Guid owner, Guid id, CancellationToken ct) => user.HasValue
        ? repository.Run(user.Value, id, ct) : Task.FromResult(guests.Find<LessonRun>(owner, id)?.Value);

    public static int[] CompletedSteps(LessonRun run, LessonSnapshot snapshot) =>
        snapshot.CompletedSteps ?? Enumerable.Range(0, Math.Min(run.Step, snapshot.Cards.Length)).ToArray();

    public async Task<object?> Exercise(Guid? user, Guid owner, LessonRun run, CancellationToken ct, int? selectedStep = null)
    {
        var snapshot = Snapshot(run);
        var step = selectedStep ?? run.Step;
        if (step < 0 || step >= snapshot.Cards.Length || snapshot.Cards[step].Kind is "theory" or "dialogue" || snapshot.AttemptIds[step] is not Guid id) return null;
        var attempt = user.HasValue ? await progress.Attempt(user.Value, id, ct) : guests.Find<ExerciseAttempt>(owner, id)?.Value;
        if (attempt is null) return null;
        return new { card = await learning.SnapshotCard(snapshot.Cards[step].Kind, attempt, ct), attemptId = id,
            draftIndices = JsonSerializer.Deserialize<int[]>(attempt.DraftIndicesJson), completed = attempt.CompletedAt is not null,
            result = attempt.CompletedAt is null ? null : new AnswerResult(attempt.Correct ?? false, attempt.ExpectedAnswer, attempt.Explanation, true) };
    }

    public async Task<bool?> SaveGuestDraft(Guid owner, LessonRun run, int[] indices, CancellationToken ct, int? selectedStep = null)
    {
        var snapshot = Snapshot(run);
        var step = selectedStep ?? run.Step;
        if (run.CompletedAt is not null || step < 0 || step >= snapshot.Cards.Length ||
            snapshot.Cards[step].Kind is not ("audio" or "translation") || snapshot.AttemptIds[step] is not Guid attemptId) return null;
        var entry = guests.Find<ExerciseAttempt>(owner, attemptId);
        if (entry is null) return null;
        await entry.Gate.WaitAsync(ct);
        try
        {
            var attempt = entry.Value;
            if (attempt.CompletedAt is not null) return false;
            var length = LearningService.ParseTokens(attempt.TokensJson).Length;
            if (indices.Length > length || indices.Distinct().Count() != indices.Length || indices.Any(i => i < 0 || i >= length))
                throw new ArgumentException("Неверный набор слов.");
            attempt.DraftIndicesJson = JsonSerializer.Serialize(indices);
            return true;
        }
        finally { entry.Gate.Release(); }
    }

    public async Task<bool> Advance(Guid? user, Guid owner, LessonRun run, int step, CancellationToken ct)
    {
        var snapshot = Snapshot(run);
        if (step < 0 || step >= snapshot.Cards.Length) return false;
        if (CompletedSteps(run, snapshot).Contains(step)) return true;
        var card = snapshot.Cards[step];
        var attemptId = snapshot.AttemptIds[step];
        if (card.Kind != "theory")
        {
            if (!attemptId.HasValue) return false;
            var completed = card.Kind == "dialogue"
                ? (user.HasValue ? await progress.Session(user.Value, attemptId!.Value, ct) : guests.Find<DialogueSession>(owner, attemptId!.Value)?.Value)?.CompletedAt
                : (user.HasValue ? await progress.Attempt(user.Value, attemptId!.Value, ct) : guests.Find<ExerciseAttempt>(owner, attemptId!.Value)?.Value)?.CompletedAt;
            if (completed is null) return false;
        }
        if (user.HasValue) return await repository.Advance(user.Value, run.Id, step, snapshot.Cards.Length, ct);
        var entry = guests.Find<LessonRun>(owner, run.Id);
        if (entry is null) return false;
        await entry.Gate.WaitAsync(ct);
        try
        {
            var current = Snapshot(entry.Value);
            var completed = CompletedSteps(entry.Value, current).ToHashSet();
            completed.Add(step);
            entry.Value.SnapshotJson = JsonSerializer.Serialize(current with { CompletedSteps = completed.Order().ToArray() }, JsonOptions);
            entry.Value.Step = Enumerable.Range(0, current.Cards.Length).FirstOrDefault(x => !completed.Contains(x), current.Cards.Length);
            if (entry.Value.Step == current.Cards.Length) entry.Value.CompletedAt ??= DateTimeOffset.UtcNow;
            return true;
        }
        finally { entry.Gate.Release(); }
    }
}
