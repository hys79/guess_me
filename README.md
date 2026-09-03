# guess me

닉네임 기반 실시간 추측 게임. 방장이 자신에 대한 질문을 던지면, 나머지 참가자들이 답을 적고,
방장이 익명으로 채점한 뒤 결과를 함께 공개한다. 목표 점수에 먼저 도달한 사람이 다음 방장이 된다.

- **프레임워크**: Next.js 15 (App Router) · React 19 · TypeScript
- **스타일**: Tailwind CSS 3 — 흰 배경 + 파란색(`#2563eb`) 포인트
- **백엔드**: Supabase (Postgres + Realtime). 인증은 사용하지 않고, 플레이어는 `localStorage` 의 `player_id` 로 식별
- **사운드**: 효과음은 Web Audio API 합성(외부 파일 없음), 배경음악만 mp3 파일 사용

## 주요 기능

- 방 생성(닉네임 · 목표 점수 1~20 · 답변 제한시간 5~100초 또는 무제한) → 4자리 참가 코드 발급
- 참가 코드 + 닉네임으로 입장 (같은 방 내 닉네임 중복 방지)
- 대기실: 참가자 실시간 표시, 방장만 게임 시작(최소 2명)
- 라운드 흐름: **질문 → 답변 수집 → 익명 채점(🙂 / 🤔 / 😠) → 결과 공개 → 방장 교체**
- 제한시간 카운트다운(마지막 5초 강조), 답변 현황판, 상시 누적 점수판(점수 변동 애니메이션)
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
3. 다음 3개 값을 확인해 둔다.
   - **Project URL** → `NEXT_PUBLIC_SUPABASE_URL`
   - **Project API keys → `anon` `public`** → `NEXT_PUBLIC_SUPABASE_ANON_KEY`
   - **Project API keys → `service_role` `secret`** → `SUPABASE_SERVICE_ROLE_KEY` (서버/스크립트 전용, 절대 공개 금지)

### 1-3. 데이터베이스 스키마 적용

좌측 **SQL Editor** 에서 `supabase/migrations/` 안의 파일을 **번호 순서대로** 붙여넣고 각각 **Run**.
네 파일 모두 여러 번 실행해도 안전하다(idempotent).

| 파일 | 내용 |
| --- | --- |
| `0001_initial_schema.sql` | 테이블(rooms/players/questions_bank/rounds/answers) · ENUM · RLS · Realtime publication |
| `0002_room_code_helper.sql` | 4자리 방 코드 생성 함수 `gen_room_code()` |
| `0003_pick_random_question.sql` | 무작위 질문 RPC `pick_random_question()` |
| `0004_round_lifecycle.sql` | 라운드 전환 RPC `advance_to_scoring` / `finalize_round` / `promote_host` |

> - Supabase CLI 를 쓴다면 `supabase db push` 로 한 번에 적용할 수도 있다.
> - `type "room_status" already exists` 같은 오류가 났었다면, 이전 실행이 중간에 멈춘 것이다.
>   현재 `0001` 은 이런 상황을 스스로 건너뛰므로 그냥 다시 실행하면 된다.
>   완전히 초기화하려면 `0001` 상단 주석의 `drop` 4줄을 풀어 먼저 실행한다.

### 1-4. 기본 질문 채우기

둘 중 하나:

- **SQL Editor** 에 [`supabase/seed.sql`](supabase/seed.sql) 붙여넣고 Run (권장 — 배포 환경에서도 동일)
- 또는 로컬에서 스크립트 실행: 아래 `.env.local` 설정 후 `npm run import:questions` ([`public/questions.csv`](public/questions.csv) 를 읽어 upsert)

### 1-5. 환경변수 파일

```bash
cp .env.local.example .env.local
```

`.env.local` 을 열어 1-2 에서 확인한 값으로 채운다.

```dotenv
NEXT_PUBLIC_SUPABASE_URL=https://xxxxxxxx.supabase.co
NEXT_PUBLIC_SUPABASE_ANON_KEY=eyJhbGciOi...
SUPABASE_SERVICE_ROLE_KEY=eyJhbGciOi...   # 질문 임포트 스크립트에서만 사용, 배포에는 불필요
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
| `SUPABASE_SERVICE_ROLE_KEY` | Project Settings → API → **service_role secret** | `npm run import:questions` 스크립트 전용 | ✅(질문 임포트 시) | ❌ 불필요 |

- `NEXT_PUBLIC_` 접두어가 붙은 값은 클라이언트 번들에 포함된다. `anon` 키는 원래 공개용이라 문제없다.
- `SUPABASE_SERVICE_ROLE_KEY` 는 RLS 를 우회하는 강력한 키다. **Vercel 에는 넣지 않는다.** 시드는 `supabase/seed.sql` 로 처리하면 된다.
- Vercel 에 넣을 값은 결국 **2개**: `NEXT_PUBLIC_SUPABASE_URL`, `NEXT_PUBLIC_SUPABASE_ANON_KEY`.

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

위 **1-2 ~ 1-4** 를 그대로 수행한다. 로컬 개발용과 배포용 Supabase 프로젝트를 나눠도 되고, 하나를 같이 써도 된다.
배포용으로 새로 만들었다면 마이그레이션 5개 + `supabase/seed.sql` 을 그 프로젝트의 SQL Editor 에서 실행한다.

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

`SUPABASE_SERVICE_ROLE_KEY` 는 추가하지 않는다.

### 3-5. 배포

**Deploy** 클릭 → 빌드 로그가 끝나면 `https://<프로젝트명>.vercel.app` 주소가 나온다. 접속해서 방 생성 → 다른 기기/브라우저로 참가 → 라운드를 한 바퀴 돌려본다.

### 3-6. 배포 후 점검

- **Realtime 동작**: 두 창에서 답변/채점이 즉시 반영되는지. 안 되면 Supabase 대시보드 **Database → Replication** 에서 `supabase_realtime` publication 에 `rooms`, `players`, `rounds`, `answers` 가 포함됐는지 확인(마이그레이션 `0001` 이 처리함).
- **환경변수 반영**: 값을 배포 후에 바꿨다면 Vercel 에서 **Redeploy** 해야 적용된다.
- **질문 없음 오류**: "랜덤 질문" 이 실패하면 `supabase/seed.sql` 을 실행하지 않은 것.

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
  migrations/              0001~0004 스키마 · RPC (idempotent)
  seed.sql                 questions_bank 시드
src/
  app/
    page.tsx               랜딩
    create/page.tsx        방 생성
    join/page.tsx          방 참가
    room/[code]/page.tsx   대기실 + 게임 진행 (단계별 화면 분기)
  components/
    room/                  QuestionDisplay · CountdownTimer · AnswerInput · AnswerProgress
                           · ScoringPanel · RevealPanel · Scoreboard · NextRoundControls
                           · HostQuestionPanel
    audio/                 SettingsButton · SettingsDialog
    RangeField.tsx
  hooks/
    useRealtimeTable.ts    한 테이블(필터) 실시간 구독 제네릭 훅
    useGameState.ts        room/players/rounds/answers 동시 구독
    useRoomByCode.ts       참가 코드 → roomId
  lib/
    supabase/              client.ts · database.types.ts
    audio/                 sfx.ts (Web Audio 합성) · SoundProvider.tsx
    rooms.ts rounds.ts answers.ts   게임 액션 (RPC 래퍼 포함)
    shuffle.ts             결정적 셔플 (채점 순서 고정)
    player.ts constants.ts
```

## 데이터 모델

- **rooms** — `code`(4자리) · `host_nickname` · `target_score`(1~20) · `answer_time_limit`(5~100초 또는 `null`) · `status`(`waiting`/`question`/`scoring`/`reveal`/`finished`)
- **players** — `room_id` · `nickname`(방 내 유일) · `score` · `is_host`(방 당 1명)
- **questions_bank** — 기본 질문 문장 풀
- **rounds** — `room_id` · `question_text` · `target_player_id`(방장) · `status`(`collecting`/`scoring`/`revealed`)
- **answers** — `round_id` · `player_id` · `answer_text` · `score`(`null` 미채점 / `1` 🙂 / `0` 🤔 / `-1` 😠). `(round_id, player_id)` 유일

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
| `npm run import:questions` | `public/questions.csv` → `questions_bank` upsert (`SUPABASE_SERVICE_ROLE_KEY` 필요) |
