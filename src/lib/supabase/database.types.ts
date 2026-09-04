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
  target_score: number;
  answer_time_limit: number | null;
  status: RoomStatus;
  game_mode: RoomMode;
  /** 현재 라운드의 질문자(=답변 대상) player id. 소프트 참조(FK 없음), null 이면 방장으로 폴백. */
  current_questioner_id: string | null;
  /** 다같이 모드에서 목표 점수에 도달해 게임이 끝났을 때의 우승자. 소프트 참조. */
  winner_player_id: string | null;
  created_at: string;
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

/** 웃겨요 / 놀랐어요 / 인정해요 */
export type ReactionEmoji = "😆" | "😮" | "👏";

export type AnswerReaction = {
  id: string;
  round_id: string;
  answer_id: string;
  player_id: string;
  emoji: ReactionEmoji;
  created_at: string;
};

export interface Database {
  public: {
    Tables: {
      rooms: {
        Row: Room;
        Insert: {
          id?: string;
          code?: string;
          host_nickname: string;
          target_score?: number;
          answer_time_limit?: number | null;
          status?: RoomStatus;
          game_mode?: RoomMode;
          current_questioner_id?: string | null;
          winner_player_id?: string | null;
          created_at?: string;
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
          emoji: ReactionEmoji;
          created_at?: string;
        };
        Update: Partial<AnswerReaction>;
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
    };
    Enums: {
      room_status: RoomStatus;
      round_status: RoundStatus;
      room_mode: RoomMode;
    };
    CompositeTypes: { [_ in never]: never };
  };
}
