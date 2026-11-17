# 미니게임 모음

방 코드 하나로 친구들과 바로 한 판 — 닉네임 기반 실시간 파티 미니게임 허브.
방 코드 · 닉네임 · 대기실 · 점수판은 모든 게임이 공유하고, 게임은 모듈 단위로 추가한다
(`rooms.game_type` 으로 구분). 개발 인수인계 메모는 [`HANDOFF_minigame_hub.md`](HANDOFF_minigame_hub.md).

| 게임 | 설명 |
| --- | --- |
| 🎯 **Guess Me!** | "나를 가장 잘 아는 사람은 누구?" 질문자가 자신에 대한 질문을 던지면 나머지가 답을 적고, 질문자가 익명으로 채점한 뒤 결과를 함께 공개한다. |
| 🎧 **노래 맞히기** | 출제자가 유튜브 링크 + 구간 + 정답을 정하면 모두가 같은 구간을 듣고(영상은 가려짐) 제목을 맞힌다. 왕 모드 / 다같이 모드. 먼저 맞힌 순서대로 점수(맞히는 사람이 N명이면 1등 N점). 제출한 답안은 모두에게 공개되고 출제자가 재밌거나 비슷한 답을 정답으로 인정할 수 있다. 정답 공개 때 노래가 이어서 나온다. |

- **프레임워크**: Next.js 15 (App Router) · React 19 · TypeScript
- **스타일**: Tailwind CSS 3 — 흰 배경 + 파란색(`#2563eb`) 포인트, 은은한 그라데이션/그림자
- **백엔드**: Supabase (Postgres + Realtime). 인증은 사용하지 않고, 플레이어는 `localStorage` 의 `player_id` 로 식별
- **사운드**: 효과음은 Web Audio API 합성(외부 파일 없음), 배경음악만 mp3 파일 사용

## Guess Me! — 게임 모드

방을 만들 때 둘 중 하나를 고른다.

- **👑 왕 모드** — 방장이 계속 질문자. 목표 점수 도달자가 나오면 **게임 종료 화면**이 뜨고(누가 도달했는지, 공감 어워드, 누적 점수), 방장이 "👑 왕위 넘기기"를 누르면 그 사람이 새 방장이 되고 모두의 점수가 초기화된 뒤 대기실로 돌아간다.
- **🔄 다같이 모드** — 참가 순서(방장부터, 참가한 순서대로)를 돌아가며 모두가 질문자가 된다. 내 차례가 되면 알림 팝업 + 효과음으로 알려준다. 목표 점수 도달자가 나오면 그 자리에서 **게임 종료 화면**, "다시 시작"을 누르면 점수가 초기화되고 **직전 우승자부터** 대기실을 거치지 않고 바로 다음 게임이 시작된다.

두 모드 모두 목표 점수 도달 시 서버가 직접 판정해 게임을 종료하며(`finalize_round`), 질문자가 방을 나가면 다음 사람에게 자동으로 넘어간다(왕 모드는 최고 점수자, 다같이 모드는 순서상 다음 사람).

**방 정리**: 마지막 참가자가 나가면 방이 즉시 삭제되고(트리거), 그 외 방치된 방(탭만 닫는 경우 등)은 마지막 활동 후 2시간이 지나면 `pg_cron` 이 15분마다 훑어 삭제한다. 하위 데이터는 FK cascade 로 함께 지워진다.

## 주요 기능

- 방 생성(닉네임 · 게임 모드 · 목표 점수 1~20 · 답변 제한시간 5~100초 또는 무제한) → 4자리 참가 코드 발급
- 참가 코드 + 닉네임으로 입장 (같은 방 내 닉네임 중복 방지). **진행 중인 게임에도 언제든 코드로 합류 가능**
- 대기실: 참가자 실시간 표시, 방장만 게임 시작(최소 2명)
- 라운드 흐름: **질문 → 답변 수집 → 익명 채점(👍 좋아요 / 👎 별로예요) → 결과 공개(접기/펼치기, ❤️ 좋아요) → 다음 질문자**
- 결과 공개 화면에서 답변마다 ❤️ 좋아요 하나로 반응 가능 (사람당 답변 하나에 1개, 다시 누르면 취소)
- 게임 종료 화면에 **❤️ 가장 많은 공감을 받은 답변** — 게임 전체에서 좋아요를 가장 많이 받은 답변 하나를 "누가 낸 질문에 · 누구의 어떤 답변인지"와 함께 보여줌(동점은 무작위, 0개면 생략)
- 시간 초과로 미제출 시 빈 답변은 👎(0점) 처리, 수정 중에는 시간이 남아 있으면 자동 마감 안 됨
- 제한시간 카운트다운(마지막 5초 강조), 답변 현황판, 상시 누적 점수판(현재 질문자 🎤 표시, 점수 변동 애니메이션)
- Supabase Realtime 으로 모든 참가자 화면이 즉시 동기화
- 사운드 설정 팝업(전체 음소거 · 배경음악/효과음 볼륨)

## 사전 준비물

- Node.js 20 이상
- Supabase 계정 (무료 플랜으로 충분)
- 배포 시: GitHub 계정, Vercel 계정

---

## 1. 로컬 실행

### 1-1. 저장소 클론 & 의존성 설치

```bash
git clone <이-저장소-URL>
cd guess_me
npm install
```

### 1-2. Supabase 프로젝트 만들기

1. <https://supabase.com/dashboard> 에서 **New project** 생성 (Region 은 가까운 곳, 예: Northeast Asia (Seoul))
2. 프로젝트가 준비되면 좌측 **Project Settings → API** 로 이동
3. 다음 2개 값을 확인해 둔다.
   - **Project URL** → `NEXT_PUBLIC_SUPABASE_URL`
   - **Project API keys → `anon` `public`** → `NEXT_PUBLIC_SUPABASE_ANON_KEY`

### 1-3. 데이터베이스 스키마 적용

좌측 **SQL Editor** 에서 `supabase/migrations/` 의 파일을 **번호 순서대로** 붙여넣고 각각 **Run**.
전부 여러 번 실행해도 안전하다(idempotent). 이전 버전 DB 에서 이어 올리는 경우에도 그대로 다시
실행하면 현재 상태로 맞춰진다. **게임 1개 = SQL 파일 1개**.

| 파일 | 내용 |
| --- | --- |
| [`0001_common.sql`](supabase/migrations/0001_common.sql) | 공통: `rooms`(+`game_type`) · `players` · 방 코드 · `next_questioner`(차례 돌리기) · 탈주 공통 처리(`handle_player_leave`: **마지막 1명이 나가면 방 삭제**, 방장 승계, `<game_type>_on_leave` 훅 호출) · 활동 갱신 트리거 · RLS · Realtime |
| [`0002_cleanup_cron.sql`](supabase/migrations/0002_cleanup_cron.sql) | 운영: `pg_cron` 이 15분마다 "마지막 활동이 2시간 넘은 방" 삭제(하위 행 cascade). `create extension` 이 권한으로 막히면 대시보드 **Database → Extensions** 에서 `pg_cron` 을 켠 뒤 이 파일만 다시 실행 |
| [`0003_game_guess_me.sql`](supabase/migrations/0003_game_guess_me.sql) | Guess Me 전용: `rounds` · `answers` · `answer_reactions` · `questions_bank`(레거시) · `advance_to_scoring` · `finalize_round` · `promote_host` · `restart_everyone_game` · `guess_me_on_leave` |
| [`0004_game_song.sql`](supabase/migrations/0004_game_song.sql) | 노래 맞히기 전용: `song_*` 테이블 · 정답 보호(RLS) · 출제/재생/정답/힌트 RPC · `song_on_leave` |
| [`0005_game_five_link.sql`](supabase/migrations/0005_game_five_link.sql) | Link Ten(1인용) 전용: `five_link_scores`(하루 랭킹) · `five_link_today` · `five_link_submit`. 방/플레이어와 무관, pg_cron 불필요(7일 지난 기록은 제출 때 함께 삭제) |

> - 새 게임을 추가하면 `0006_game_<이름>.sql` 처럼 다음 번호로 한 파일만 더하면 된다(공통 파일은 수정 불필요).
> - 이전에는 `0001_schema.sql` 한 파일이었다. 공통 / 게임별로 쪼갰을 뿐 내용은 이어진다.
> - Supabase CLI 를 쓴다면 `supabase db push` 로도 적용할 수 있다.
> - SQL Editor 는 붙여넣은 스크립트 전체를 한 트랜잭션으로 실행한다. 중간에 하나라도
>   에러가 나면 그 실행분은 전부 롤백되니, 에러를 고친 뒤 **파일 전체를 다시** 붙여넣고 재실행한다.
>   각 파일 상단 주석에 그 파일만 처음부터 다시 만드는 `drop` 블록이 있다.

### 1-4. 질문 목록

랜덤 질문은 앱에 번들되는 [`public/questions.csv`](public/questions.csv) 를 **실행 시점에 직접 읽는다.**
이 파일만 수정해서 커밋/재배포하면 질문이 바로 반영된다. DB 작업이 전혀 필요 없다.

- 형식: 첫 줄 헤더 `question`, 이후 한 줄에 "방장 닉네임 뒤에 붙일 문장" 하나. 반드시 **UTF-8** 로 저장(현재 파일은 BOM 포함).
- `questions_bank` 테이블은 스키마에 남아 있지만(폴백용 `pick_random_question` RPC 전용) 앱에서 더 이상 사용하지 않는다.

### 1-5. 환경변수 파일

```bash
cp .env.local.example .env.local
```

`.env.local` 을 열어 1-2 에서 확인한 값으로 채운다.

```dotenv
NEXT_PUBLIC_SUPABASE_URL=https://xxxxxxxx.supabase.co
NEXT_PUBLIC_SUPABASE_ANON_KEY=eyJhbGciOi...
```

### 1-6. 개발 서버

```bash
npm run dev
```

<http://localhost:3000> 접속. 방을 만들고, 다른 브라우저(또는 시크릿 창)에서 참가 코드로 들어가면 실시간 동작을 확인할 수 있다.

### (선택) 배경음악 추가

`public/audio/bgm.mp3` 에 mp3 파일을 넣으면 첫 화면 클릭/터치 시 루프 재생된다.
파일명을 바꾸려면 [`src/lib/audio/SoundProvider.tsx`](src/lib/audio/SoundProvider.tsx) 의 `BGM_SRC` 를 수정.
파일이 없어도 효과음은 정상 동작한다.

---

## 2. 환경변수 정리

| 이름 | 값 위치 (Supabase) | 사용처 | 로컬(`.env.local`) | Vercel |
| --- | --- | --- | :---: | :---: |
| `NEXT_PUBLIC_SUPABASE_URL` | Project Settings → API → **Project URL** | 브라우저(클라이언트) | ✅ | ✅ |
| `NEXT_PUBLIC_SUPABASE_ANON_KEY` | Project Settings → API → **anon public** | 브라우저(클라이언트) | ✅ | ✅ |

- `NEXT_PUBLIC_` 접두어가 붙은 값은 클라이언트 번들에 포함된다. `anon` 키는 원래 공개용이라 문제없다.
- 필요한 값은 이 **2개뿐**이다. `service_role` 키는 앱에서 쓰지 않는다.

---

## 3. Vercel 배포 — 처음부터 하나씩

### 3-1. GitHub 저장소에 올리기

```bash
# 프로젝트 폴더에서
git init                 # 이미 git 저장소면 생략
git add .
git commit -m "guess me: initial version"
```

GitHub 에서 새 저장소(`guess-me` 등)를 만들고(README/gitignore 추가 옵션은 끄기), 안내대로 원격을 연결한다.

```bash
git remote add origin https://github.com/<사용자명>/<저장소명>.git
git branch -M main
git push -u origin main
```

`.env.local` 은 `.gitignore` 에 있으므로 커밋되지 않는다. `.env.local.example` 만 올라간다 — 정상.

### 3-2. Supabase 프로젝트 준비 (아직 안 했다면)

위 **1-2 ~ 1-3** 을 그대로 수행한다. 로컬 개발용과 배포용 Supabase 프로젝트를 나눠도 되고, 하나를 같이 써도 된다.
배포용으로 새로 만들었다면 `supabase/migrations/` 의 `0001` ~ `0005` 를 번호 순서대로 그 프로젝트의 SQL Editor 에서 실행한다.
질문은 CSV 에서 읽으므로 DB 시드 작업은 없다.

### 3-3. Vercel 에 프로젝트 가져오기

1. <https://vercel.com/new> 접속 → GitHub 계정 연결(최초 1회, 저장소 접근 권한 허용)
2. 방금 push 한 저장소 옆의 **Import** 클릭
3. 설정 화면:
   - **Framework Preset**: `Next.js` (자동 감지됨)
   - **Root Directory**: 그대로 (`./`)
   - **Build / Output / Install**: 기본값 그대로 (`next build` / 자동 / `npm install`)

### 3-4. 환경변수 입력

Import 화면의 **Environment Variables** 섹션(또는 배포 후 **Project → Settings → Environment Variables**)에서 추가:

| Key | Value | Environment |
| --- | --- | --- |
| `NEXT_PUBLIC_SUPABASE_URL` | `https://xxxx.supabase.co` | Production, Preview, Development 모두 체크 |
| `NEXT_PUBLIC_SUPABASE_ANON_KEY` | `eyJhbGciOi...` (anon public 키) | Production, Preview, Development 모두 체크 |

이 2개면 끝이다.

### 3-5. 배포

**Deploy** 클릭 → 빌드 로그가 끝나면 `https://<프로젝트명>.vercel.app` 주소가 나온다. 접속해서 방 생성 → 다른 기기/브라우저로 참가 → 라운드를 한 바퀴 돌려본다.

### 3-6. 배포 후 점검

- **Realtime 동작**: 두 창에서 답변/채점이 즉시 반영되는지. 안 되면 Supabase 대시보드 **Database → Replication** 에서 `supabase_realtime` publication 에 `rooms`, `players`, `rounds`, `answers`, `answer_reactions` 가 포함됐는지 확인(`0001`·`0003`·`0004` 가 처리함. 노래 맞히기는 `song_rounds`·`song_hints`·`song_guesses`·`song_ready`·`song_hint_requests` 도 포함).
- **환경변수 반영**: 값을 배포 후에 바꿨다면 Vercel 에서 **Redeploy** 해야 적용된다.
- **질문 목록 수정**: [`public/questions.csv`](public/questions.csv) 를 고치고 `git push` 하면 재배포되어 바로 반영된다. (DB 작업 불필요)

### 3-7. 이후 업데이트

`git push` 하면 Vercel 이 자동으로 다시 빌드·배포한다(main 브랜치 → Production).

### (선택) 커스텀 도메인

Vercel **Project → Settings → Domains** 에서 도메인을 추가하고, 도메인 등록업체 DNS 에 안내된 레코드(A/CNAME)를 넣으면 된다.

---

## 프로젝트 구조

```
public/
  questions.csv            기본 질문 목록 (UTF-8 BOM, "{닉네임}" 뒤에 붙는 문장)
  audio/bgm.mp3            (직접 추가) 배경음악
supabase/
  migrations/0001_common.sql        공통(rooms · players · 탈주 공통 처리 · RLS · Realtime)
  migrations/0002_cleanup_cron.sql  방치된 방 자동 삭제(pg_cron, 2시간 TTL)
  migrations/0003_game_guess_me.sql Guess Me 전용
  migrations/0004_game_song.sql     노래 맞히기 전용
  migrations/0005_game_five_link.sql Link Ten(1인용) 하루 랭킹
src/
  app/
    page.tsx               홈: 게임 카드 목록 + 혼자 하기 + 방 코드로 참가
    solo/link-ten/page.tsx  1인용 게임은 방 없이 /solo/<게임> 으로 바로 시작
    create/page.tsx        /create?game=<id> 방 생성 (게임별 옵션)
    join/page.tsx          방 참가 (게임 무관)
    room/[code]/page.tsx   방 셸: 실시간 구독 · 입장 확인 · 대기실 · 게임 화면 선택
  games/
    registry.ts            게임 메타데이터 (이름·아이콘·최소 인원·BGM) + 허브 이름
    types.ts ui.ts         게임이 구현할 계약(GameUI) · 게임 id → 구현 매핑
    guess-me/              GuessMeRoom · CreateOptions · components/ · lib/ · hooks/
    link-ten/              1인용: LinkTenGame · rules.ts(점수/콤보) · engine.ts(순수 로직)
                           components/ (Board · Hud · ResultCard · RankingPanel) · hooks/useLinkTen · lib/ranking
    song/                  SongRoom · CreateOptions · rules.ts
                           components/ (SongSetup · ClipPlayer · YouTubeFrame · GuessPanel
                                        · SetterPanel · HintList · RevealCard · SongFinished)
                           lib/ (youtube · songs · setterNote) · hooks/ (useSongState · useServerClock)
  components/
    common/                Lobby · Scoreboard · CountdownTimer · RoomSettingsFields
    audio/                 SettingsButton · SettingsDialog
    ui/                    ConfirmDialog
    RangeField.tsx
  hooks/
    useRealtimeTable.ts    한 테이블(필터) 실시간 구독 제네릭 훅
    useRoomBase.ts         방 + 참가자 실시간 구독 (모든 게임 공통)
    useRoomByCode.ts       참가 코드 → roomId
  lib/
    supabase/              client.ts · database.types.ts
    audio/                 sfx.ts (Web Audio 합성) · SoundProvider.tsx
    rooms.ts               방 생성 / 참가 / 나가기 (게임 무관)
    player.ts constants.ts
```

**1인용 게임 추가**: `registry.ts` 의 `SOLO_GAMES` 에 한 줄 → `src/app/solo/<경로>/page.tsx` → `src/games/<id>/` 모듈. 방/대기실/`games/ui.ts` 는 필요 없다. 랭킹이 필요하면 게임 SQL 1개.

**새 게임 추가**: `registry.ts` 에 한 줄 → `src/games/<id>/` 모듈(`ui.ts` 에서 `GameUI` 구현) → `games/ui.ts` 에 한 줄 → `supabase/migrations/` 에 게임 SQL 1개.

## 데이터 모델

**공통 (0001)**
- **rooms** — `code`(4자리) · `host_nickname` · `game_type`(`guess_me`/`song`/…) · `target_score`(1~20) · `answer_time_limit`(5~100초 또는 `null`, 게임별 의미) · `status`(`waiting`/`question`/`scoring`/`reveal`/`finished`) · `last_active_at`(2시간 방치 시 cron 이 삭제)
- **players** — `room_id` · `nickname`(방 내 유일) · `score` · `is_host`(방 관리자, 방 당 1명)

**Guess Me (0003)**
- **rooms 전용 컬럼** — `game_mode`(`king`/`everyone`) · `current_questioner_id`(현재 질문자, 소프트 참조) · `winner_player_id`(다같이 모드 우승자, 소프트 참조)
- **rounds** — `room_id` · `question_text` · `target_player_id`(이 라운드의 질문자) · `status`(`collecting`/`scoring`/`revealed`)
- **answers** — `round_id` · `player_id` · `answer_text` · `score`(`null` 미채점 / `1` 👍 좋아요 / `0` 👎 별로예요) · `is_editing`. `(round_id, player_id)` 유일
- **answer_reactions** — `round_id` · `answer_id` · `player_id` · `emoji`(❤️ 고정). `(answer_id, player_id)` 유일 — 결과 공개 화면 좋아요 전용
- **questions_bank** — (레거시) 스키마에만 존재, 앱 미사용

**Link Ten (0005)** — 1인용, 방 없음
- **five_link_scores** — `(day, nickname_key)` 유일. 닉네임별 그날 최고 점수 한 줄. `day` 는 한국 시간 기준 날짜. 쓰기는 `five_link_submit` RPC 로만, 읽기는 누구나. 점수는 브라우저가 보내므로 조작 가능(친구끼리 전제).

**노래 맞히기 (0004)**
- **song_rounds** — `room_id` · `setter_id`(출제자) · `status`(`setup`/`ready`/`playing`/`revealed`) · `video_id` · `start_sec` · `duration_sec` · `started_at`(재생 시작 시각) · `deadline_at` · `answer_display`(종료 후에만 채워짐)
- **song_round_secrets** — 정답·인정 답안. **anon 접근 불가**, RPC(`security definer`)만 읽고 씀
- **song_hints** · **song_guesses**(정답자 + 받은 점수, 오답은 저장 안 함) · **song_ready**(준비 완료) · **song_hint_requests**(힌트 요청)

라운드 전환은 모두 Postgres RPC 안에서 라운드 row 를 `FOR UPDATE` 로 잠그고 현재 상태를 확인한 뒤 수행하므로,
여러 클라이언트가 동시에 호출해도 전환은 한 번만 일어난다.

## 보안 메모

인증이 없어 `anon` 키로 모든 접근이 이뤄지며 RLS 정책은 `anon` 에게 전체 CRUD 를 허용한다.
공개 서비스로 키우려면 쓰기 경로를 Edge Function / RPC(`security definer`) 뒤로 옮기는 것을 권장한다.

## 스크립트

| 명령 | 설명 |
| --- | --- |
| `npm run dev` | 개발 서버 |
| `npm run build` | 프로덕션 빌드 |
| `npm run start` | 빌드 결과 실행 |
| `npm run lint` | ESLint |
