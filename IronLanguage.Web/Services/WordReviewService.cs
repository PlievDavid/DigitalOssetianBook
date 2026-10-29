using System.Text;
using System.Text.Json;
using IronLanguage.Db;

namespace IronLanguage.Web.Services;

public sealed record ReviewCardSnapshot(Guid WordId, bool Reverse, string Prompt, string[] Answers, string Kind,
    string[] Options, int Stage, DateTimeOffset? DueAt, bool NewWord, string PracticeKind = "input", string[]? PracticeOptions = null,
    ReviewCardSnapshot? Opposite = null, bool InitialPractice = false, ReviewCardSnapshot[]? Pairs = null);
public sealed record ReviewAnswerResult(bool Correct, string Expected, DateTimeOffset NextDue);
public sealed record ReviewPairView(Guid WordId, string Prompt, string? Expected, bool? Correct);
public sealed record ReviewPairBatch(int[] Submission, ReviewAnswerResult?[] Results);
public sealed record ReviewCardView(Guid WordId, string Direction, string Prompt, string Kind, string[] Options, string? Translation, ReviewPairView[]? Pairs = null, int[]? PairIndices = null);
public sealed record ReviewSessionView(Guid Id, int Index, int Total, string Mode, string Format, bool Revealed,
    ReviewCardView? Card, ReviewAnswerResult? Result, int Correct, int Errors, int Skipped, int Points);
public sealed record ReviewCommand(int Index, string Action, string? Answer = null, bool? Known = null, int[]? PairIndices = null);

public static class WordReviewRules
{
    public static readonly TimeSpan[] Intervals = [TimeSpan.FromHours(4), TimeSpan.FromHours(12), TimeSpan.FromDays(1),
        TimeSpan.FromDays(6), TimeSpan.FromDays(12), TimeSpan.FromDays(48), TimeSpan.FromDays(96)];
    public static string Normalize(string text) => string.Join(' ', text.Normalize(NormalizationForm.FormD)
        .Replace("\u0301", "").Replace("\u0341", "").Replace('æ', 'ӕ').Replace('Æ', 'Ӕ')
        .Normalize(NormalizationForm.FormC).ToLowerInvariant().Split((char[]?)null, StringSplitOptions.RemoveEmptyEntries));

    public static void Apply(WordReviewState state, bool correct, bool choice, DateTimeOffset now)
    {
        var previous = state.Stage;
        var day = DateOnly.FromDateTime(now.UtcDateTime);
        if (correct)
        {
            if (choice && state.LastChoiceDay != day)
            {
                state.ChoiceDays++;
                state.LastChoiceDay = day;
            }
            state.Stage = Math.Min(7, previous + 1);
            // Recognition is an introduction, never a way to mark a word mastered.
            if (choice) state.Stage = Math.Max(previous, Math.Min(state.Stage, state.ChoiceDays >= 3 ? 3 : 2));
            if (!choice && previous >= 4) state.Mastered = true;
        }
        else
        {
            state.Stage = Math.Max(0, previous - 1);
            state.Errors++;
            if (choice) { state.ChoiceDays = 0; state.LastChoiceDay = null; }
            state.Mastered = false;
        }
        state.DueAt = state.Stage == 7 ? now.AddMonths(6) : now.Add(Intervals[state.Stage]);
    }

    public static ReviewCardSnapshot[] Order(IEnumerable<ReviewCardSnapshot> candidates, string mode)
    {
        var pending = candidates.ToList();
        var result = new List<ReviewCardSnapshot>();
        var reviewRun = 0;
        while (pending.Count > 0)
        {
            var recent = result.TakeLast(3).Select(x => x.WordId).ToHashSet();
            bool Eligible(ReviewCardSnapshot item) => !recent.Contains(item.WordId) &&
                (!item.Reverse || !item.NewWord || result.Any(x => x.WordId == item.WordId && !x.Reverse));
            var preferNew = mode == "new" || mode == "mixed" && reviewRun >= 3;
            var next = pending.FirstOrDefault(x => Eligible(x) && x.NewWord == preferNew) ?? pending.FirstOrDefault(Eligible);
            if (next is null) break; // The opposite direction waits for another session if there aren't three other cards.
            result.Add(next); pending.Remove(next);
            reviewRun = next.NewWord ? 0 : reviewRun + 1;
        }
        return result.ToArray();
    }
}

public sealed class WordReviewService(IWordReviewRepository repository, TimeProvider clock)
{
    private static readonly JsonSerializerOptions Json = new(JsonSerializerDefaults.Web);
    // PostgreSQL stores microseconds; keep the JSON snapshot at the same precision.
    private DateTimeOffset Now
    {
        get { var now = clock.GetUtcNow(); return new(now.UtcTicks - now.UtcTicks % 10, TimeSpan.Zero); }
    }
    private static ReviewCardSnapshot[] Cards(WordReviewSession session) => JsonSerializer.Deserialize<ReviewCardSnapshot[]>(session.ItemsJson, Json) ?? [];
    private static IEnumerable<Guid> Words(ReviewCardSnapshot card) => card.Pairs?.Select(x => x.WordId) ?? [card.WordId];
    private static void Store(WordReviewSession session, IEnumerable<ReviewCardSnapshot> cards) => session.ItemsJson = JsonSerializer.Serialize(cards, Json);
    private static ReviewPairBatch? Batch(WordReviewSession session) => session.ResultJson is null ? null : JsonSerializer.Deserialize<ReviewPairBatch>(session.ResultJson, Json);
    private static void Advance(WordReviewSession session)
    {
        session.Index++; session.Revealed = false; session.ResultJson = null;
        var cards = Cards(session).ToList();
        var recent = cards.Take(session.Index).SelectMany(Words).TakeLast(3).ToHashSet();
        var next = cards.FindIndex(session.Index, x => !Words(x).Any(recent.Contains));
        if (next < 0) cards = cards.Take(session.Index).ToList();
        else if (next > session.Index) { var item = cards[next]; cards.RemoveAt(next); cards.Insert(session.Index, item); }
        Store(session,cards);
    }
    public static ReviewSessionView View(WordReviewSession session)
    {
        var cards = Cards(session);var item = cards.ElementAtOrDefault(session.Index);
        ReviewAnswerResult? result=null;ReviewPairView[]? pairs=null;int[]? submission=null;
        if(item?.Kind=="pairs")
        {
            var batch=Batch(session);var complete=batch is not null && batch.Results.All(x=>x is not null);
            submission=batch?.Submission;
            if(complete)result=new(batch!.Results.All(x=>x!.Correct),"",batch.Results.Min(x=>x!.NextDue));
            pairs=item.Pairs!.Select((x,i)=>new ReviewPairView(x.WordId,x.Prompt,complete?batch!.Results[i]!.Expected:null,complete?batch!.Results[i]!.Correct:null)).ToArray();
        }
        else if(session.ResultJson is not null)result=JsonSerializer.Deserialize<ReviewAnswerResult>(session.ResultJson,Json);
        var card=item is null?null:new ReviewCardView(item.WordId,item.Reverse?"Русский → осетинский":"Осетинский → русский",item.Prompt,item.Kind,item.Options,
            item.Kind=="cards" && session.Revealed || item.Kind!="pairs" && result is not null ? item.Answers[0] : null,pairs,submission);
        return new(session.Id,session.Index,cards.Length,session.Mode,"auto",session.Revealed,card,result,session.Correct,session.Errors,session.Skipped,session.Points);
    }
    public async Task<ReviewSessionView?> Current(Guid userId,CancellationToken ct)
    {
        var session=await repository.Session(userId,ct);
        return session is null || session.StartedAt<Now.AddDays(-7)?null:View(session);
    }
    private static ReviewCardSnapshot[] PairRounds(ReviewCardSnapshot[] cards)
    {
        var output=new List<ReviewCardSnapshot>();var rounds=0;
        for(var i=0;i<cards.Length;)
        {
            var group=new List<ReviewCardSnapshot>();
            if(cards[i].Kind=="choice")for(var j=i;j<cards.Length && group.Count<4;j++)
            {
                var candidate=cards[j];
                if(candidate.Kind!="choice" || candidate.Reverse!=cards[i].Reverse || group.Any(x=>x.WordId==candidate.WordId || WordReviewRules.Normalize(x.Prompt)==WordReviewRules.Normalize(candidate.Prompt) || x.Answers.Select(WordReviewRules.Normalize).Intersect(candidate.Answers.Select(WordReviewRules.Normalize)).Any()))break;
                group.Add(candidate);
            }
            if(group.Count>=2 && rounds++%2==0)
            {
                output.Add(cards[i] with {Kind="pairs",Prompt="Соедините слова и переводы",Options=group.Select(x=>x.Answers[0]).OrderBy(_=>Random.Shared.Next()).ToArray(),Pairs=group.ToArray()});i+=group.Count;
            }
            else output.Add(cards[i++]);
        }
        return output.ToArray();
    }
    public async Task<ReviewSessionView> Start(Guid userId,string mode,CancellationToken ct)
    {
        if(mode is not("new" or "due" or "mixed"))throw new ArgumentException("Выберите режим занятия.");
        var settings=await repository.Settings(userId,ct);var sources=await repository.Sources(userId,ct);var now=Now;
        var pool=sources.Select(x=>x.Saved.Word).ToArray();var candidates=new List<ReviewCardSnapshot>();
        foreach(var source in sources.OrderBy(x=>x.Forward?.DueAt??x.Backward?.DueAt??DateTimeOffset.MaxValue).ThenBy(x=>x.Saved.AddedAt))
        {
            var word=source.Saved.Word;var fresh=(source.Forward is null||source.Forward.Stage<0&&source.Forward.DueAt is null) && (source.Backward is null||source.Backward.Stage<0&&source.Backward.DueAt is null);
            if(mode=="new"&&!fresh || mode=="due"&&fresh)continue;
            ReviewCardSnapshot Practice(bool reverse,WordReviewState? state)
            {
                var answers=pool.Where(x=>WordReviewRules.Normalize(reverse?x.Russian:x.Ossetian)==WordReviewRules.Normalize(reverse?word.Russian:word.Ossetian))
                    .Select(x=>reverse?x.Ossetian:x.Russian).Where(x=>!string.IsNullOrWhiteSpace(x)).Distinct().ToArray();
                var kind=!settings.DirectInput&&(state?.ChoiceDays??0)<3&&(state?.Stage??-1)<3?"choice":"input";string[] options=[];
                if(kind=="choice")
                {
                    var correct=answers.Select(WordReviewRules.Normalize).ToHashSet();
                    var distractors=pool.Select(x=>reverse?x.Ossetian:x.Russian).Where(x=>!string.IsNullOrWhiteSpace(x)&&!correct.Contains(WordReviewRules.Normalize(x)))
                        .DistinctBy(WordReviewRules.Normalize).OrderBy(_=>Random.Shared.Next()).Take(3).ToArray();
                    if(distractors.Length==0)kind="input";else options=distractors.Append(answers[0]).OrderBy(_=>Random.Shared.Next()).ToArray();
                }
                return new(word.Id,reverse,reverse?word.Russian:word.Ossetian,answers,kind,options,state?.Stage??-1,state?.DueAt,fresh);
            }
            if(string.IsNullOrWhiteSpace(word.Ossetian)||string.IsNullOrWhiteSpace(word.Russian))continue;
            var forward=Practice(false,source.Forward);var backward=Practice(true,source.Backward);
            if(fresh)candidates.Add(forward with {Kind="cards",Options=[],PracticeKind=forward.Kind,PracticeOptions=forward.Options,Opposite=backward});
            else
            {
                if(source.Forward?.DueAt is null || source.Forward.DueAt<=now)candidates.Add(forward);
                if(source.Backward?.DueAt is null || source.Backward.DueAt<=now)candidates.Add(backward);
            }
        }
        var session=new WordReviewSession {UserId=userId,StartedAt=now,Mode=mode,Format="auto",ItemsJson=JsonSerializer.Serialize(PairRounds(WordReviewRules.Order(candidates,mode)),Json)};
        await repository.Start(session,ct);return View(session);
    }
    private async Task<ReviewSessionView?> Match(Guid userId,Guid id,ReviewCommand input,ReviewCardSnapshot round,DateTimeOffset now,CancellationToken ct)
    {
        var choices=input.PairIndices??[];var pairs=round.Pairs!;
        if(choices.Length!=pairs.Length || choices.Any(x=>x<0||x>=round.Options.Length) || choices.Distinct().Count()!=choices.Length)throw new ArgumentException("Соедините каждое слово с одним переводом.");
        WordReviewSession? result=null;
        for(var index=0;index<pairs.Length;index++)
        {
            var pair=pairs[index];var slot=index;
            result=await repository.Mutate(userId,id,pair.WordId,pair.Reverse,now,(current,state,saved)=>
            {
                if(input.Index<current.Index)return false;
                if(input.Index!=current.Index || Cards(current).ElementAtOrDefault(input.Index)?.Kind!="pairs")throw new InvalidOperationException("Занятие изменилось. Обновите страницу.");
                var batch=Batch(current)??new ReviewPairBatch(choices,new ReviewAnswerResult?[pairs.Length]);
                if(!batch.Submission.SequenceEqual(choices))throw new InvalidOperationException("Эти пары уже отправлены. Продолжите занятие.");
                if(batch.Results[slot] is not null)return false;
                if(saved is null||!saved.Word.Published||saved.Word.Archived||state is null)throw new InvalidOperationException("Слово недоступно. Пропустите это задание.");
                if(state.Stage!=pair.Stage || state.DueAt!=pair.DueAt)throw new InvalidOperationException("Расписание изменилось. Начните новое занятие.");
                var correct=pair.Answers.Any(x=>WordReviewRules.Normalize(x)==WordReviewRules.Normalize(round.Options[choices[slot]]));
                WordReviewRules.Apply(state,correct,true,now);saved.ReviewedAt=now;
                if(correct)current.Correct++;else current.Errors++;
                batch.Results[slot]=new(correct,pair.Answers[0],state.DueAt!.Value);current.ResultJson=JsonSerializer.Serialize(batch,Json);return correct;
            },ct);
            if(result is null)return null;
        }
        return View(result!);
    }
    public async Task<ReviewSessionView?> Command(Guid userId,Guid id,ReviewCommand command,CancellationToken ct)
    {
        if(command.Index<0||command.Answer?.Length>1000||command.PairIndices?.Length>4||command.Action is not("reveal" or "answer" or "next" or "skip" or "finish"))throw new ArgumentException("Некорректное действие.");
        var snapshot=await repository.Session(userId,ct);if(snapshot is null||snapshot.Id!=id||snapshot.StartedAt<Now.AddDays(-7))return null;
        var item=Cards(snapshot).ElementAtOrDefault(command.Index);var now=Now;
        if(item?.Kind=="pairs"&&command.Action=="answer")return await Match(userId,id,command,item,now,ct);
        var session=await repository.Mutate(userId,id,item?.WordId,item?.Reverse??false,now,(current,state,saved)=>
        {
            if(command.Index<current.Index)return false;
            if(command.Index!=current.Index||item is null)throw new InvalidOperationException("Занятие изменилось в другой вкладке. Обновите страницу.");
            if(command.Action=="finish"){current.Index=Cards(current).Length;current.Revealed=false;current.ResultJson=null;return false;}
            if(command.Action is "skip" or "next")
            {
                if(command.Action=="next"&&(current.ResultJson is null || item.Kind=="pairs"&&Batch(current)!.Results.Any(x=>x is null)))throw new ArgumentException("Сначала ответьте или пропустите задание.");
                if(current.ResultJson is null){current.Skipped++;var ids=Words(item).ToHashSet();Store(current,Cards(current).Where((x,i)=>i<=current.Index||!Words(x).Any(ids.Contains)));}
                Advance(current);return false;
            }
            if(current.ResultJson is not null)return false;
            if(saved is null||!saved.Word.Published||saved.Word.Archived)throw new InvalidOperationException("Слово больше недоступно. Пропустите его.");
            if(command.Action=="reveal")
            {
                if(item.Kind!="cards")throw new ArgumentException("Переворот доступен только для знакомства со словом.");current.Revealed=true;return false;
            }
            // Retrying a diagnostic answer must not answer the practice task that replaced it.
            if(command.Known is not null && item.Kind!="cards")return false;
            if(state is null||state.Stage!=item.Stage||state.DueAt!=item.DueAt)throw new InvalidOperationException("Расписание изменилось. Начните новое занятие.");
            bool correct;
            if(item.Kind=="cards")
            {
                if(!current.Revealed||command.Known is null)throw new ArgumentException("Сначала откройте перевод и оцените ответ.");
                if(command.Known==false)
                {
                    state.Mastered=false;state.Stage=state.Stage<0?-1:Math.Max(0,state.Stage-1);state.DueAt=now;
                    var practice=item with {Kind=item.PracticeKind,Options=item.PracticeOptions??[],Stage=state.Stage,DueAt=now,InitialPractice=item.Stage<0,Opposite=null,NewWord=false};
                    var cards=Cards(current).ToList();cards[current.Index]=practice;
                    if(item.Opposite is {} opposite)
                    {
                        var next=opposite with {Stage=opposite.Stage<0?-1:Math.Max(0,opposite.Stage-1),DueAt=now,InitialPractice=opposite.Stage<0,NewWord=false};
                        var existing=cards.FindIndex(current.Index+1,x=>x.WordId==item.WordId&&x.Reverse!=item.Reverse);
                        if(existing>=0)cards[existing]=next;else cards.Add(next);
                    }
                    Store(current,cards);current.Revealed=false;return new ReviewWrite(false,Introduce:true);
                }
                correct=true;
            }
            else
            {
                if(string.IsNullOrWhiteSpace(command.Answer))throw new ArgumentException("Введите или выберите перевод.");
                if(item.Kind=="choice"&&!item.Options.Contains(command.Answer))throw new ArgumentException("Выберите один из предложенных ответов.");
                correct=item.Answers.Any(x=>WordReviewRules.Normalize(x)==WordReviewRules.Normalize(command.Answer));
            }
            if(item.InitialPractice)state.Stage=-1;
            WordReviewRules.Apply(state,correct,item.Kind=="choice",now);
            if(item.Kind=="cards")
            {
                state.Mastered=true;state.Stage=Math.Max(5,state.Stage);state.DueAt=state.Stage==7?now.AddMonths(6):now.Add(WordReviewRules.Intervals[state.Stage]);
                Store(current,Cards(current).Where((x,i)=>i<=current.Index||!Words(x).Contains(item.WordId)));
            }
            if(correct)current.Correct++;else current.Errors++;saved.ReviewedAt=now;
            current.ResultJson=JsonSerializer.Serialize(new ReviewAnswerResult(correct,item.Answers[0],state.DueAt!.Value),Json);
            return new ReviewWrite(correct,MarkKnown:item.Kind=="cards");
        },ct);
        return session is null?null:View(session);
    }
}
