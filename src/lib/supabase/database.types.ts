/**
 * DB 스키마와 1:1 로 맞춘 타입.
 * (Supabase CLI 를 쓰면 `supabase gen types typescript` 로 자동 생성 가능하지만,
 *  현재는 수동 관리한다. 스키마 변경 시 이 파일도 함께 갱신할 것.)
 */

export type RoomStatus =
  | "waiting"
  | "question"
  | "scoring"
  | "reveal"
  | "finished";

export type RoundStatus = "collecting" | "scoring" | "revealed";

/** king = 왕 모드(질문자 고정, 목표 도달 시 수동 승격) / everyone = 다같이 모드(질문자 순환, 도달 시 게임 종료) */
export type RoomMode = "king" | "everyone";

/** null = 미채점, 1 = 👍 좋아요, 0 = 👎 별로예요 */
export type AnswerScore = 0 | 1;

// 주의: 아래 row 타입은 반드시 `type` 별칭이어야 한다.
// `interface` 는 인덱스 시그니처가 없어 supabase-js 의 `Record<string, unknown>`
// 제약(GenericTable)을 만족하지 못하고, 그 결과 쿼리 타입이 전부 `never` 가 된다.
export type Room = {
  id: string;
  code: string;
  host_nickname: string;
  /** 게임 종류 — 앱의 게임 레지스트리 id (guess_me / song / ...) */
  game_type: string;
  target_score: number;
  answer_time_limit: number | null;
  status: RoomStatus;
  // game_mode / winner_player_id 는 guess_me 와 song 이 같이 쓴다(왕 모드·다같이 모드).
  // current_questioner_id 는 guess_me 전용 — 다른 게임의 방에서는 null 로 남는다.
  game_mode: RoomMode;
  /** 현재 라운드의 질문자(=답변 대상) player id. 소프트 참조(FK 없음), null 이면 방장으로 폴백. */
  current_questioner_id: string | null;
  /** 다같이 모드에서 목표 점수에 도달해 게임이 끝났을 때의 우승자. 소프트 참조. */
  winner_player_id: string | null;
  created_at: string;
  /** 마지막 활동 시각. 2시간 이상 조용하면 cron 이 방을 삭제한다. */
  last_active_at: string;
};

export type Player = {
  id: string;
  room_id: string;
  nickname: string;
  score: number;
  is_host: boolean;
  created_at: string;
};

export type QuestionBankRow = {
  id: number;
  question_text: string;
};

export type Round = {
  id: string;
  room_id: string;
  question_text: string;
  target_player_id: string;
  status: RoundStatus;
  created_at: string;
};

export type Answer = {
  id: string;
  round_id: string;
  player_id: string;
  answer_text: string;
  score: AnswerScore | null;
  submitted_at: string;
  is_editing: boolean;
};

/** 답변 공감 — "좋아요" 단일 이모지 */
export type ReactionEmoji = "❤️";

export type AnswerReaction = {
  id: string;
  round_id: string;
  answer_id: string;
  player_id: string;
  emoji: ReactionEmoji;
  created_at: string;
};

// --- 노래 맞히기 (song) -------------------------------------------------------

/** setup(출제 중) → ready(준비 대기) → playing(재생·정답 제출) → revealed(정답 공개) */
export type SongRoundStatus = "setup" | "ready" | "playing" | "revealed";

export type SongRound = {
  id: string;
  room_id: string;
  /** 출제자 player id (소프트 참조) */
  setter_id: string;
  status: SongRoundStatus;
  video_id: string | null;
  start_sec: number | null;
  duration_sec: number | null;
  /** 재생 시작 시각(서버 기준, 카운트다운 포함) */
  started_at: string | null;
  /** 정답 마감 시각. null = 무제한 */
  deadline_at: string | null;
  /** 정답 표시용 — 라운드가 끝난 뒤에만 채워진다 */
  answer_display: string | null;
  revealed_at: string | null;
  created_at: string;
};

/** 출제자가 직접 쓴 힌트 */
export type SongHint = {
  id: string;
  round_id: string;
  content: string;
  created_at: string;
};

/** 정답을 맞힌 기록 (오답·답안 텍스트는 저장되지 않는다) */
export type SongGuess = {
  id: string;
  round_id: string;
  player_id: string;
  place: number;
  points: number;
  hints_used: number;
  created_at: string;
};

/**
 * 제출된 답안 피드 — 모두가 볼 수 있다.
 *  pending  : 정답이 아닌 답안 (answer_text 공개, 출제자가 인정할 수 있다)
 *  correct  : 자동 정답 (answer_text 없음)
 *  accepted : 출제자가 정답으로 인정 (answer_text 없음)
 */
export type SongAttemptStatus = "pending" | "correct" | "accepted";

export type SongAttempt = {
  id: string;
  round_id: string;
  player_id: string;
  answer_text: string | null;
  status: SongAttemptStatus;
  created_at: string;
};

/** Five Link(1인용) 하루 랭킹 한 줄 */
export type FiveLinkScore = {
  day: string; // YYYY-MM-DD (한국 시간 기준)
  nickname_key: string;
  nickname: string;
  score: number;
  moves: number;
  best_combo: number;
  created_at: string;
  updated_at: string;
};

export type SongReady = {
  id: string;
  round_id: string;
  player_id: string;
  /** 이 사람의 브라우저가 영상을 재생하지 못했다면 유튜브 오류 코드(예: 150). 정상이면 null */
  error_code: number | null;
  created_at: string;
};

export type SongHintRequest = Omit<SongReady, "error_code">;

export interface Database {
  public: {
    Tables: {
      rooms: {
        Row: Room;
        Insert: {
          id?: string;
          code?: string;
          host_nickname: string;
          game_type?: string;
          target_score?: number;
          answer_time_limit?: number | null;
          status?: RoomStatus;
          game_mode?: RoomMode;
          current_questioner_id?: string | null;
          winner_player_id?: string | null;
          created_at?: string;
          last_active_at?: string;
        };
        Update: Partial<Room>;
        Relationships: [];
      };
      players: {
        Row: Player;
        Insert: {
          id?: string;
          room_id: string;
          nickname: string;
          score?: number;
          is_host?: boolean;
          created_at?: string;
        };
        Update: Partial<Player>;
        Relationships: [];
      };
      questions_bank: {
        Row: QuestionBankRow;
        Insert: { id?: number; question_text: string };
        Update: { id?: number; question_text?: string };
        Relationships: [];
      };
      rounds: {
        Row: Round;
        Insert: {
          id?: string;
          room_id: string;
          question_text: string;
          target_player_id: string;
          status?: RoundStatus;
          created_at?: string;
        };
        Update: Partial<Round>;
        Relationships: [];
      };
      answers: {
        Row: Answer;
        Insert: {
          id?: string;
          round_id: string;
          player_id: string;
          answer_text: string;
          score?: AnswerScore | null;
          submitted_at?: string;
          is_editing?: boolean;
        };
        Update: Partial<Answer>;
        Relationships: [];
      };
      answer_reactions: {
        Row: AnswerReaction;
        Insert: {
          id?: string;
          round_id: string;
          answer_id: string;
          player_id: string;
          emoji?: ReactionEmoji;
          created_at?: string;
        };
        Update: Partial<AnswerReaction>;
        Relationships: [];
      };
      // song_round_secrets(정답)는 anon 이 접근할 수 없으므로 일부러 타입에 넣지 않는다.
      // song_rounds / song_hints / song_guesses 는 읽기 전용(쓰기는 RPC 로만).
      song_rounds: {
        Row: SongRound;
        Insert: Partial<SongRound>;
        Update: Partial<SongRound>;
        Relationships: [];
      };
      song_hints: {
        Row: SongHint;
        Insert: Partial<SongHint>;
        Update: Partial<SongHint>;
        Relationships: [];
      };
      song_guesses: {
        Row: SongGuess;
        Insert: Partial<SongGuess>;
        Update: Partial<SongGuess>;
        Relationships: [];
      };
      song_attempts: {
        Row: SongAttempt;
        Insert: Partial<SongAttempt>;
        Update: Partial<SongAttempt>;
        Relationships: [];
      };
      five_link_scores: {
        Row: FiveLinkScore;
        Insert: Partial<FiveLinkScore>;
        Update: Partial<FiveLinkScore>;
        Relationships: [];
      };
      song_ready: {
        Row: SongReady;
        Insert: {
          round_id: string;
          player_id: string;
          error_code?: number | null;
          id?: string;
          created_at?: string;
        };
        Update: Partial<SongReady>;
        Relationships: [];
      };
      song_hint_requests: {
        Row: SongHintRequest;
        Insert: { round_id: string; player_id: string; id?: string; created_at?: string };
        Update: Partial<SongHintRequest>;
        Relationships: [];
      };
    };
    Views: { [_ in never]: never };
    Functions: {
      gen_room_code: {
        Args: Record<PropertyKey, never>;
        Returns: string;
      };
      pick_random_question: {
        Args: Record<PropertyKey, never>;
        Returns: string;
      };
      advance_to_scoring: {
        Args: { p_round_id: string };
        Returns: undefined;
      };
      finalize_round: {
        Args: { p_round_id: string };
        Returns: undefined;
      };
      promote_host: {
        Args: { p_room_id: string; p_new_host: string };
        Returns: undefined;
      };
      next_questioner: {
        Args: { p_room_id: string; p_current_id: string };
        Returns: string;
      };
      restart_everyone_game: {
        Args: { p_room_id: string };
        Returns: undefined;
      };
      song_server_time: {
        Args: Record<PropertyKey, never>;
        Returns: string;
      };
      song_start_game: {
        Args: { p_room_id: string; p_player_id: string };
        Returns: undefined;
      };
      song_submit_round: {
        Args: {
          p_round_id: string;
          p_player_id: string;
          p_video_id: string;
          p_start_sec: number;
          p_duration_sec: number;
          p_title: string;
        };
        Returns: undefined;
      };
      song_start_round: {
        Args: { p_round_id: string; p_player_id: string };
        Returns: undefined;
      };
      song_reveal_hint: {
        Args: {
          p_round_id: string;
          p_player_id: string;
          p_content: string;
        };
        Returns: undefined;
      };
      song_submit_guess: {
        Args: { p_round_id: string; p_player_id: string; p_text: string };
        Returns: string;
      };
      song_promote_host: {
        Args: { p_room_id: string; p_player_id: string };
        Returns: undefined;
      };
      song_reset_round: {
        Args: { p_round_id: string; p_player_id: string };
        Returns: undefined;
      };
      song_accept_attempt: {
        Args: { p_attempt_id: string; p_player_id: string };
        Returns: undefined;
      };
      song_finish_round: {
        Args: { p_round_id: string; p_player_id: string };
        Returns: undefined;
      };
      song_next_round: {
        Args: { p_room_id: string; p_player_id: string };
        Returns: undefined;
      };
      five_link_today: {
        Args: Record<PropertyKey, never>;
        Returns: string;
      };
      five_link_submit: {
        Args: {
          p_day: string;
          p_nickname: string;
          p_score: number;
          p_moves: number;
          p_best_combo: number;
        };
        Returns: number;
      };
    };
    Enums: {
      room_status: RoomStatus;
      round_status: RoundStatus;
      room_mode: RoomMode;
    };
    CompositeTypes: { [_ in never]: never };
  };
}
