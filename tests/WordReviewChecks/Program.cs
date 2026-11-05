using System.Diagnostics;
using System.Security.Claims;
using System.Text.Json;
using IronLanguage.Db;
using IronLanguage.Web.Services;
using Microsoft.AspNetCore.Authentication;
using Microsoft.AspNetCore.Authentication.Cookies;
using Microsoft.AspNetCore.DataProtection;
using Microsoft.EntityFrameworkCore;

var passed = 0;
void Check(bool condition, string name) { if (!condition) throw new Exception(name); passed++; }
async Task Fails<T>(Func<Task> action) where T : Exception { try { await action(); } catch (T) { passed++; return; } throw new Exception($"Expected {typeof(T).Name}"); }
var now = new DateTimeOffset(2026, 10, 28, 12, 0, 0, TimeSpan.Zero);
var state = new WordReviewState();
WordReviewRules.Apply(state, true, false, now);
Check(state.Stage == 0 && state.DueAt == now.AddHours(4), "First success: 4 hours");
for (var i = 0; i < 5; i++) { now = state.DueAt!.Value; WordReviewRules.Apply(state, true, false, now); }
Check(state.Stage == 5 && state.Mastered && state.DueAt == now.AddDays(48), "Mastered after successful 12-day review");
WordReviewRules.Apply(state, false, false, now);
Check(state.Stage == 4 && !state.Mastered && state.DueAt == now.AddDays(12), "One-step lapse, mastered removed below threshold");
state.Stage = 7; WordReviewRules.Apply(state, true, false, now);
Check(state.DueAt == now.AddMonths(6), "Last interval: six calendar months");
var choice = new WordReviewState();
WordReviewRules.Apply(choice, true, true, now); WordReviewRules.Apply(choice, true, true, now.AddHours(4));
Check(choice.ChoiceDays == 1 && !choice.Mastered, "Multiple choices same UTC day do not advance introduction days");
WordReviewRules.Apply(choice, true, true, now.AddDays(1)); WordReviewRules.Apply(choice, true, true, now.AddDays(2));
Check(choice.ChoiceDays == 3 && !choice.Mastered, "Three distinct choice days");
WordReviewRules.Apply(choice, false, true, now.AddDays(3)); Check(choice.ChoiceDays == 0, "Choice failure resets consecutive success days");
Check(WordReviewRules.Normalize("  ФÆЛǼ   ") == WordReviewRules.Normalize("фӕлӕ"), "Unicode, stress, case and whitespace");
Check(WordReviewRules.Normalize("тӕмǽн") == WordReviewRules.Normalize("тӕмӕн"), "Precomposed acute ligature is normalized");
Check(WordReviewRules.Normalize("Ё Й") == "ё й", "Stress removal preserves diaeresis and breve");
ReviewCardSnapshot Card(Guid id, bool reverse, bool fresh) => new(id, reverse, "", [""], "cards", [], -1, null, fresh);
var ids = Enumerable.Range(0, 8).Select(_ => Guid.NewGuid()).ToArray();
var ordered = WordReviewRules.Order(ids.SelectMany(id => new[] { Card(id, false, true), Card(id, true, true) }), "new");
Check(ordered.Length == 16, "Enough words: both directions scheduled");
for (var i = 0; i < ordered.Length; i++) Check(!ordered.Take(i).TakeLast(3).Any(x => x.WordId == ordered[i].WordId), "Three intervening cards");
Check(WordReviewRules.Order([Card(ids[0], false, true), Card(ids[0], true, true)], "new").Length == 1, "Small dictionary defers reverse direction");
var mix = WordReviewRules.Order(ids.Take(6).Select(id => Card(id, false, false)).Concat(ids.Skip(6).Select(id => Card(id,false,true))), "mixed");
Check(mix.Take(3).All(x => !x.NewWord) && mix[3].NewWord && mix.Skip(4).Take(3).All(x => !x.NewWord), "Mixed 3:1");
var memory = new ReviewMemoryRepository();
var memoryOwner = Guid.NewGuid();
var memoryClock = new TestClock(now);
var memoryService = new WordReviewService(memory, memoryClock);
var singleWord = new WordEntry { Ossetian = "чиныг", Russian = "книга", Published = true };
memory.Words.Add(new(new SavedWord { UserId = memoryOwner, WordId = singleWord.Id, Word = singleWord }, null, null));
var single = await memoryService.Start(memoryOwner, "mixed", default);
Check(single.Total == 1 && single.Card is { Translation: null }, "One-word flashcard hides answer and defers reverse");
await Fails<ArgumentException>(() => memoryService.Command(memoryOwner, single.Id, new(0,"answer",Known:true), default));
await memoryService.Command(memoryOwner,single.Id,new(0,"reveal"),default);
single = (await memoryService.Command(memoryOwner,single.Id,new(0,"answer",Known:true),default))!;
Check(single.Points == 1 && single.Correct == 1 && single.Card?.Translation == "книга", "Self assessment after reveal");
single = (await memoryService.Command(memoryOwner,single.Id,new(0,"answer",Known:false),default))!;
Check(single.Correct == 1 && single.Errors == 0 && single.Points == 1, "Duplicate answer cannot change result or award");
Check(memory.States.Where(x => x.Key.Item1 == memoryOwner).All(x => x.Value.Mastered) && memory.States.Count == 2, "Knowing explicitly masters the whole word in both directions");
// A partially introduced word from an earlier session must still offer the deferred direction.
memory.States.Remove((memoryOwner,singleWord.Id,true));
memory.States[(memoryOwner,singleWord.Id,false)].Stage=0;
single = await memoryService.Start(memoryOwner,"due",default);
Check(single.Card?.Direction == "Русский → осетинский", "Deferred reverse available in next session before first direction is due");
Check(await memoryService.Command(Guid.NewGuid(),single.Id,new(0,"reveal"),default) is null, "Other account cannot reveal");
await memory.SaveSettings(new() { UserId=memoryOwner,Format="test" },default);
single = await memoryService.Start(memoryOwner,"due",default);
Check(single.Card?.Kind == "input", "Insufficient confirmed distractors fall back to input");
single = (await memoryService.Command(memoryOwner,single.Id,new(0,"answer",Answer:" ЧИНЫГ  "),default))!;
Check(single.Result!.Correct && single.Points == 0, "Typed answer normalization, same-word reverse earns no extra point");
memoryClock.Now=memoryClock.Now.AddDays(1);
single=await memoryService.Start(memoryOwner,"due",default);
var stateCount=memory.States.Count;
single=(await memoryService.Command(memoryOwner,single.Id,new(single.Index,"finish"),default))!;
Check(single.Card is null && memory.States.Count==stateCount && single.Correct==0 && single.Points==0,"Finish ends session without answering remaining cards or awarding");
memoryClock.Now = memoryClock.Now.AddDays(8);
Check(await memoryService.Current(memoryOwner,default) is null, "Snapshot expires after seven days");
await memory.SaveSettings(new() { UserId=memoryOwner,Format="cards" },default);
foreach(var pair in new[] { ("чиныг","книга"),("карк","курица"),("гогыз","индюк"),("кӕсаг","рыба") }) {
    var word=new WordEntry {Ossetian=pair.Item1,Russian=pair.Item2,Published=true};
    memory.Words.Add(new(new SavedWord {UserId=memoryOwner,WordId=word.Id,Word=word},null,null));
}
single=await memoryService.Start(memoryOwner,"new",default);
var unfamiliarId = single.Card!.WordId;
await memoryService.Command(memoryOwner, single.Id, new(0, "reveal"), default);
single = (await memoryService.Command(memoryOwner, single.Id, new(0, "answer", Known: false), default))!;
Check(single.Index == 1 && single.Result is null && single.Errors == 0, "Unknown introduction advances without grading");
var repeated = (await memoryService.Command(memoryOwner, single.Id, new(0, "answer", Known: false), default))!;
Check(repeated.Index == 1 && repeated.Card?.WordId == single.Card?.WordId, "Diagnostic retry leaves the next task unchanged");
for (var i = 0; i < 3; i++)
{
    Check(single.Card is { Kind: "cards" } && single.Card.WordId != unfamiliarId, "An intervening task uses another word");
    await memoryService.Command(memoryOwner, single.Id, new(single.Index, "reveal"), default);
    single = (await memoryService.Command(memoryOwner, single.Id, new(single.Index, "answer", Known: true), default))!;
    single=(await memoryService.Command(memoryOwner,single.Id,new(single.Index,"next"),default))!;
}
Check(single.Card is { Kind: "choice" or "input" } && single.Card.WordId == unfamiliarId, "First checked task returns after three other tasks");
var expectedTranslation = memory.Words.Single(x => x.Saved.WordId == unfamiliarId).Saved.Word.Russian;
single = (await memoryService.Command(memoryOwner, single.Id, new(single.Index, "answer", Answer: expectedTranslation), default))!;
Check(single.Result!.NextDue == memoryClock.Now.AddHours(4), "First checked success schedules four hours after diagnosis");

var shortOwner = Guid.NewGuid();
memory.Words.Add(new(new SavedWord { UserId = shortOwner, WordId = singleWord.Id, Word = singleWord }, null, null));
var shortSession = await memoryService.Start(shortOwner, "new", default);
await memoryService.Command(shortOwner, shortSession.Id, new(0, "reveal"), default);
shortSession = (await memoryService.Command(shortOwner, shortSession.Id, new(0, "answer", Known: false), default))!;
Check(shortSession.Card is null, "A one-word session ends after an unknown introduction");
shortSession = await memoryService.Start(shortOwner, "due", default);
Check(shortSession.Card is { Kind: "input" } && shortSession.Card.WordId == singleWord.Id, "Deferred practice survives into the next session");
var legacy = new WordReviewSession
{
    UserId = shortOwner, StartedAt = memoryClock.Now,
    ItemsJson = JsonSerializer.Serialize(new[] { Card(singleWord.Id, false, false) with { Kind = "input", InitialPractice = true } })
};
await memory.Start(legacy, default);
Check((await memoryService.Current(shortOwner, default))?.Card is null, "An old snapshot defers its immediate practice when reopened");
var matchingMemory=new ReviewMemoryRepository();
foreach(var entry in memory.Words.TakeLast(4)) {
    matchingMemory.Words.Add(entry);
    foreach(var reverse in new[]{false,true})matchingMemory.States[(memoryOwner,entry.Saved.WordId,reverse)]=new(){UserId=memoryOwner,WordId=entry.Saved.WordId,Reverse=reverse,Stage=0,DueAt=memoryClock.Now};
}
var matchingService=new WordReviewService(matchingMemory,memoryClock);
var round=await matchingService.Start(memoryOwner,"due",default);
Check(round.Card?.Kind=="pairs" && round.Card.Pairs!.Length>=2 && round.Card.Pairs.All(x=>x.Expected is null),"Recognition includes matching with no exposed mapping");
var mapping=round.Card!.Pairs!.Select(pair=>{
    var word=matchingMemory.Words.Single(x=>x.Saved.WordId==pair.WordId).Saved.Word;
    var expected=round.Card.Direction.StartsWith("Русский")?word.Ossetian:word.Russian;
    return Array.FindIndex(round.Card.Options,x=>WordReviewRules.Normalize(x)==WordReviewRules.Normalize(expected));
}).ToArray();
round=(await matchingService.Command(memoryOwner,round.Id,new(round.Index,"answer",PairIndices:mapping),default))!;
Check(round.Result?.Correct==true && round.Points==mapping.Length,"Matching checks and awards each word through review schedule");
var retry=(await matchingService.Command(memoryOwner,round.Id,new(round.Index,"answer",PairIndices:mapping),default))!;
Check(retry.Points==round.Points && retry.Correct==round.Correct,"Matching retry idempotent");
await Fails<InvalidOperationException>(()=>matchingService.Command(memoryOwner,round.Id,new(round.Index,"answer",PairIndices:mapping.Reverse().ToArray()),default));
Console.WriteLine($"Rules and service: {passed} checks passed.");
if (!args.Contains("--database")) return;
var connection = Environment.GetEnvironmentVariable("ConnectionStrings__Adam") ?? throw new Exception("Load .run-local/connection.ps1");
var options = new DbContextOptionsBuilder<AdamDbContext>().UseNpgsql(connection).Options;
await using var db = new AdamDbContext(options);
var pending = (await db.Database.GetPendingMigrationsAsync()).ToArray();
if (db.Database.HasPendingModelChanges() || pending.Any(x => !(args.Contains("--keep-translation-alternatives") && x == "20261023090000_ClearTranslationAlternatives")))
    throw new Exception("Apply prepared migration before checks");
var directory = new DirectoryInfo(AppContext.BaseDirectory);
while (directory is not null && !File.Exists(Path.Combine(directory.FullName, "IronLanguage.slnx"))) directory = directory.Parent;
var root = directory!.FullName;
var accounts = new[] { new UserAccount { Email = $"review-{Guid.NewGuid():N}@example.invalid" }, new UserAccount { Email = $"review-{Guid.NewGuid():N}@example.invalid" } };
var owners = accounts.Select(x => x.Id).ToArray();
using var source = JsonDocument.Parse(File.ReadAllText(Path.Combine(root, "IronLanguage.Web/Data/wordle/words.json")));
// Fixture copies confirmed project vocabulary, never creates invented translations.
var entries = source.RootElement.GetProperty("answers").EnumerateArray().Take(35).Select(x => new WordEntry { Ossetian = x.GetProperty("word").GetString()!, Russian = x.GetProperty("russian").GetString()!, Published = true }).ToArray();
var wordIds = entries.Select(x => x.Id).ToArray();
var extraIds = new List<Guid>();
var clock = new TestClock(DateTimeOffset.UtcNow);
try {
    db.Users.AddRange(accounts); db.Words.AddRange(entries);
    db.SavedWords.AddRange(entries.Select(x => new SavedWord { UserId = owners[0], WordId = x.Id })); await db.SaveChangesAsync(); db.ChangeTracker.Clear();
    var repo = new EfWordReviewRepository(db);
    var service = new WordReviewService(repo, clock);
    var summary = await repo.Counts(owners[0], clock.Now, default);
    Check(summary.Total == 35 && summary.New == 35 && summary.Learning==35 && summary.PointsToday == 0, "Saved words immediately count as learning without progress writes");
    Check(!await db.WordReviewStates.AnyAsync(x => x.UserId == owners[0]), "GET creates no state");
    var page = await repo.Page(owners[0], "", "all", "due", 1, 30, default);
    Check(page.Items.Length == 30 && page.Pages == 2 && page.Total == 35, "Server pagination");
    Check((await repo.Page(owners[0], "", "all", "due", 999, 30, default)).Page == 2, "Page clamped");
    Check((await repo.Page(owners[0], entries[0].Ossetian, "all", "alphabet", 1, 30, default)).Total >= 1, "Search across dictionary");
    Check((await repo.Page(owners[0], "%", "all", "recent", 1, 30, default)).Total == 0, "Search wildcard escaped");
    foreach (var sort in new[] { "due", "recent", "alphabet", "errors" }) await repo.Page(owners[0], "", "learning", sort, 1, 30, default);
    Check((await repo.Page(owners[1], "", "all", "due", 1, 30, default)).Total == 0, "Dictionary owner isolation");
    var opened = await service.Start(owners[0], "mixed", default);
    Check(opened.Card?.Kind == "cards" && opened.Card.Translation is null && opened.Card.Options.Length == 0, "Front response contains no answer");
    Check(await service.Command(owners[1], opened.Id, new(0, "reveal"), default) is null, "Session owner isolation");
    await Fails<ArgumentException>(() => service.Command(owners[0], opened.Id, new(0,"answer", Known:true), default));
    opened = (await service.Command(owners[0], opened.Id, new(0,"reveal"), default))!;
    Check(opened.Revealed && opened.Card?.Translation is not null, "Reveal persisted");
    await using (var a = new AdamDbContext(options)) await using (var b = new AdamDbContext(options)) {
        var ra = new WordReviewService(new EfWordReviewRepository(a), clock); var rb = new WordReviewService(new EfWordReviewRepository(b), clock);
        var answers = await Task.WhenAll(ra.Command(owners[0],opened.Id,new(0,"answer",Known:true),default),rb.Command(owners[0],opened.Id,new(0,"answer",Known:true),default));
        Check(answers.All(x => x!.Correct == 1 && x.Points == 1), "Concurrent duplicate answer awarded once");
    }
    db.ChangeTracker.Clear();
    Check((await service.Current(owners[0], default))!.Result!.Correct, "Resume includes checked result");
    var firstWord = opened.Card!.WordId;
    var current = (await service.Command(owners[0], opened.Id, new(0, "next"), default))!;
    current = (await service.Command(owners[0], opened.Id, new(0, "next"), default))!;
    Check(current.Index == 1, "Duplicate advance doesn't skip another card");
    while (current.Card is not null) {
        await service.Command(owners[0], current.Id, new(current.Index,"reveal"), default);
        await service.Command(owners[0], current.Id, new(current.Index,"answer",Known:true), default);
        current = (await service.Command(owners[0], current.Id, new(current.Index,"next"), default))!;
    }
    db.ChangeTracker.Clear();
    var day = DateOnly.FromDateTime(clock.Now.UtcDateTime);
    Check(await db.WordReviewRewards.CountAsync(x => x.UserId == owners[0]) == 20, "Daily reward cap 20");
    Check((await db.DailyActivities.SingleAsync(x => x.UserId == owners[0] && x.Day == day)).Points == 20, "Shared daily activity and points");
    Check(await db.WordReviewStates.CountAsync(x => x.UserId == owners[0] && x.WordId == firstWord) == 2, "Directions tracked independently");
    clock.Now = clock.Now.AddDays(49);
    await repo.SaveSettings(new() { UserId = owners[0], Format = "test", DirectInput = true },default);
    current = await service.Start(owners[0], "due", default);
    Check(current.Card?.Kind == "input" && current.Card.Translation is null, "Settings change keeps schedule and hides typed answer");
    await service.Command(owners[0], current.Id, new(current.Index,"answer",Answer:"неверный ответ"),default);
    var failed = (await service.Current(owners[0],default))!;
    Check(failed.Result is { Correct:false } && failed.Card!.Translation is not null, "Failure reveals expected answer only after check");
    var skippedId = current.Id;
    current = await service.Start(owners[0], "due", default);
    Check(await service.Command(owners[0], skippedId, new(0,"reveal"),default) is null, "New session invalidates old session id");
    var statesBefore = await db.WordReviewStates.AsNoTracking().Where(x => x.UserId == owners[0]).Select(x => new { x.WordId, x.Reverse, x.Stage, x.DueAt }).ToListAsync();
    await service.Command(owners[0],current.Id,new(current.Index,"skip"),default);
    var statesAfter = await db.WordReviewStates.AsNoTracking().Where(x => x.UserId == owners[0]).Select(x => new { x.WordId, x.Reverse, x.Stage, x.DueAt }).ToListAsync();
    Check(statesBefore.SequenceEqual(statesAfter), "Skip does not change schedule");
    foreach(var word in entries.Take(4)) {
        db.SavedWords.Add(new(){UserId=owners[1],WordId=word.Id});
        foreach(var reverse in new[]{false,true})db.WordReviewStates.Add(new(){UserId=owners[1],WordId=word.Id,Reverse=reverse,Stage=0,DueAt=clock.Now});
    }
    await db.SaveChangesAsync();db.ChangeTracker.Clear();
    var pairSession=await service.Start(owners[1],"due",default);
    Check(pairSession.Card?.Kind=="pairs","Prepared learning words use integrated matching");
    var pairMapping=pairSession.Card!.Pairs!.Select(pair=>{
        var word=entries.Single(x=>x.Id==pair.WordId);var expected=pairSession.Card.Direction.StartsWith("Русский")?word.Ossetian:word.Russian;
        return Array.FindIndex(pairSession.Card.Options,x=>WordReviewRules.Normalize(x)==WordReviewRules.Normalize(expected));
    }).ToArray();
    await using(var a=new AdamDbContext(options))await using(var b=new AdamDbContext(options)) {
        var sa=new WordReviewService(new EfWordReviewRepository(a),clock);var sb=new WordReviewService(new EfWordReviewRepository(b),clock);
        var parallel=await Task.WhenAll(sa.Command(owners[1],pairSession.Id,new(pairSession.Index,"answer",PairIndices:pairMapping),default),sb.Command(owners[1],pairSession.Id,new(pairSession.Index,"answer",PairIndices:pairMapping),default));
        Check(parallel.All(x=>x!.Result?.Correct==true&&x.Points==pairMapping.Length),"Concurrent matching batches award each word once");
    }
    var extra = Enumerable.Range(0,1000).Select(i => new WordEntry { Ossetian=entries[i % entries.Length].Ossetian,
        Russian=entries[i % entries.Length].Russian,Published=true }).ToArray();
    extraIds.AddRange(extra.Select(x => x.Id));
    db.Words.AddRange(extra); db.SavedWords.AddRange(extra.Select(x => new SavedWord { UserId=owners[0],WordId=x.Id }));
    await db.SaveChangesAsync(); db.ChangeTracker.Clear();
    var large = await repo.Page(owners[0],"","all","due",35,30,default);
    Check(large.Total == 1035 && large.Pages == 35 && large.Items.Length == 15, "Thousand-word dictionary remains paginated on server");
    if (args.Contains("--browser")) {
        await repo.SaveSettings(new() { UserId=owners[0], Format="cards" },default);
        clock.Now = DateTimeOffset.UtcNow;
        // Make fixture words due without touching any user data.
        await db.WordReviewStates.Where(x => x.UserId == owners[0]).ExecuteUpdateAsync(x => x.SetProperty(s => s.DueAt, DateTimeOffset.UtcNow.AddHours(-1)));
        var earlyIds=entries.Take(8).Select(x=>x.Id).ToArray();
        await db.WordReviewStates.Where(x=>x.UserId==owners[0]&&earlyIds.Contains(x.WordId)).ExecuteUpdateAsync(x=>x.SetProperty(s=>s.Stage,0).SetProperty(s=>s.Mastered,false).SetProperty(s=>s.ChoiceDays,0));
        var topicData = JsonSerializer.Deserialize<VocabularyTopicSource[]>(File.ReadAllText(Path.Combine(root,"IronLanguage.Web/Data/crosswords/levels.json")),new JsonSerializerOptions(JsonSerializerDefaults.Web))!;
        var topicKeys = topicData.SelectMany(x => x.Words).Select(x => x.Key).Distinct().ToArray();
        var alreadyExisting = await db.Words.Where(x => topicKeys.Contains(x.Id)).Select(x => x.Id).ToArrayAsync();
        extraIds.AddRange(topicKeys.Except(alreadyExisting));
        var protection = DataProtectionProvider.Create(new DirectoryInfo(Path.Combine(root,"IronLanguage.Web/.data-protection-keys")), cfg => cfg.SetApplicationName("Adam"));
        var protector = protection.CreateProtector("Microsoft.AspNetCore.Authentication.Cookies.CookieAuthenticationMiddleware","Cookies","v2");
        var ticket = new AuthenticationTicket(new ClaimsPrincipal(new ClaimsIdentity([new Claim(ClaimTypes.NameIdentifier,owners[0].ToString()),new Claim(ClaimTypes.Name,"Проверка повторения")],"Cookies")),new AuthenticationProperties { IssuedUtc=DateTimeOffset.UtcNow,ExpiresUtc=DateTimeOffset.UtcNow.AddHours(1) },"Cookies");
        var start = new ProcessStartInfo("node","tests/word-review-browser.cjs") { WorkingDirectory=root, UseShellExecute=false };
        start.Environment["ADAM_REVIEW_COOKIE"] = new TicketDataFormat(protector).Protect(ticket);
        start.Environment["ADAM_REVIEW_WORDS"] = JsonSerializer.Serialize(entries.Select(x=>new{id=x.Id,ossetian=x.Ossetian,russian=x.Russian}));
        using var process = Process.Start(start)!; await process.WaitForExitAsync(); Check(process.ExitCode == 0,"Browser scenario");
    }
    Console.WriteLine($"Rules and PostgreSQL: {passed} checks passed.");
} finally {
    db.ChangeTracker.Clear();
    await db.SavedWords.Where(x => owners.Contains(x.UserId)).ExecuteDeleteAsync();
    await db.DailyActivities.Where(x => owners.Contains(x.UserId)).ExecuteDeleteAsync();
    await db.Achievements.Where(x => owners.Contains(x.UserId)).ExecuteDeleteAsync();
    await db.Users.Where(x => owners.Contains(x.Id)).ExecuteDeleteAsync();
    var cleanupWords = wordIds.Concat(extraIds).ToArray();
    await db.Words.Where(x => cleanupWords.Contains(x.Id) && !db.SavedWords.Any(saved => saved.WordId == x.Id)).ExecuteDeleteAsync();
}
sealed class TestClock(DateTimeOffset now) : TimeProvider { public DateTimeOffset Now = now; public override DateTimeOffset GetUtcNow() => Now; }
