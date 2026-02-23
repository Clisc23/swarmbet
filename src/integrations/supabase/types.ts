export type Json =
  | string
  | number
  | boolean
  | null
  | { [key: string]: Json | undefined }
  | Json[]

export type Database = {
  // Allows to automatically instantiate createClient with right options
  // instead of createClient<Database, { PostgrestVersion: 'XX' }>(URL, KEY)
  __InternalSupabase: {
    PostgrestVersion: "14.1"
  }
  public: {
    Tables: {
      accuracy_by_sport: {
        Row: {
          accuracy: number | null
          correct: number | null
          id: string
          sport: string
          total: number | null
          updated_at: string | null
          user_id: string
        }
        Insert: {
          accuracy?: number | null
          correct?: number | null
          id?: string
          sport: string
          total?: number | null
          updated_at?: string | null
          user_id: string
        }
        Update: {
          accuracy?: number | null
          correct?: number | null
          id?: string
          sport?: string
          total?: number | null
          updated_at?: string | null
          user_id?: string
        }
        Relationships: [
          {
            foreignKeyName: "accuracy_by_sport_user_id_fkey"
            columns: ["user_id"]
            isOneToOne: false
            referencedRelation: "users"
            referencedColumns: ["id"]
          },
        ]
      }
      points_history: {
        Row: {
          amount: number
          created_at: string | null
          description: string | null
          id: string
          poll_id: string | null
          type: string
          user_id: string
        }
        Insert: {
          amount: number
          created_at?: string | null
          description?: string | null
          id?: string
          poll_id?: string | null
          type: string
          user_id: string
        }
        Update: {
          amount?: number
          created_at?: string | null
          description?: string | null
          id?: string
          poll_id?: string | null
          type?: string
          user_id?: string
        }
        Relationships: [
          {
            foreignKeyName: "points_history_poll_id_fkey"
            columns: ["poll_id"]
            isOneToOne: false
            referencedRelation: "polls"
            referencedColumns: ["id"]
          },
          {
            foreignKeyName: "points_history_user_id_fkey"
            columns: ["user_id"]
            isOneToOne: false
            referencedRelation: "users"
            referencedColumns: ["id"]
          },
        ]
      }
      poll_options: {
        Row: {
          created_at: string | null
          display_order: number
          flag_emoji: string | null
          id: string
          is_winner: boolean | null
          label: string
          poll_id: string
          polymarket_price: number | null
          vote_count: number | null
          vote_percentage: number | null
        }
        Insert: {
          created_at?: string | null
          display_order: number
          flag_emoji?: string | null
          id?: string
          is_winner?: boolean | null
          label: string
          poll_id: string
          polymarket_price?: number | null
          vote_count?: number | null
          vote_percentage?: number | null
        }
        Update: {
          created_at?: string | null
          display_order?: number
          flag_emoji?: string | null
          id?: string
          is_winner?: boolean | null
          label?: string
          poll_id?: string
          polymarket_price?: number | null
          vote_count?: number | null
          vote_percentage?: number | null
        }
        Relationships: [
          {
            foreignKeyName: "poll_options_poll_id_fkey"
            columns: ["poll_id"]
            isOneToOne: false
            referencedRelation: "polls"
            referencedColumns: ["id"]
          },
        ]
      }
      polls: {
        Row: {
          actual_outcome_option_id: string | null
          category: string
          closes_at: string
          created_at: string | null
          crowd_consensus_option_id: string | null
          day_number: number
          description: string | null
          id: string
          opens_at: string
          points_for_consensus: number | null
          points_for_voting: number | null
          polymarket_event_id: string | null
          polymarket_slug: string | null
          question: string
          resolved_at: string | null
          resolves_at: string | null
          status: string
          total_votes: number | null
          vocdoni_election_id: string | null
          winning_option_id: string | null
        }
        Insert: {
          actual_outcome_option_id?: string | null
          category: string
          closes_at: string
          created_at?: string | null
          crowd_consensus_option_id?: string | null
          day_number: number
          description?: string | null
          id?: string
          opens_at: string
          points_for_consensus?: number | null
          points_for_voting?: number | null
          polymarket_event_id?: string | null
          polymarket_slug?: string | null
          question: string
          resolved_at?: string | null
          resolves_at?: string | null
          status?: string
          total_votes?: number | null
          vocdoni_election_id?: string | null
          winning_option_id?: string | null
        }
        Update: {
          actual_outcome_option_id?: string | null
          category?: string
          closes_at?: string
          created_at?: string | null
          crowd_consensus_option_id?: string | null
          day_number?: number
          description?: string | null
          id?: string
          opens_at?: string
          points_for_consensus?: number | null
          points_for_voting?: number | null
          polymarket_event_id?: string | null
          polymarket_slug?: string | null
          question?: string
          resolved_at?: string | null
          resolves_at?: string | null
          status?: string
          total_votes?: number | null
          vocdoni_election_id?: string | null
          winning_option_id?: string | null
        }
        Relationships: [
          {
            foreignKeyName: "polls_actual_outcome_option_id_fkey"
            columns: ["actual_outcome_option_id"]
            isOneToOne: false
            referencedRelation: "poll_options"
            referencedColumns: ["id"]
          },
        ]
      }
      referrals: {
        Row: {
          created_at: string | null
          id: string
          points_awarded: number | null
          referred_id: string
          referrer_id: string
        }
        Insert: {
          created_at?: string | null
          id?: string
          points_awarded?: number | null
          referred_id: string
          referrer_id: string
        }
        Update: {
          created_at?: string | null
          id?: string
          points_awarded?: number | null
          referred_id?: string
          referrer_id?: string
        }
        Relationships: [
          {
            foreignKeyName: "referrals_referred_id_fkey"
            columns: ["referred_id"]
            isOneToOne: true
            referencedRelation: "users"
            referencedColumns: ["id"]
          },
          {
            foreignKeyName: "referrals_referrer_id_fkey"
            columns: ["referrer_id"]
            isOneToOne: false
            referencedRelation: "users"
            referencedColumns: ["id"]
          },
        ]
      }
      users: {
        Row: {
          accuracy_score: number | null
          auth_provider: string
          auth_uid: string
          avatar_seed: string | null
          correct_predictions: number | null
          created_at: string | null
          current_streak: number | null
          display_name: string | null
          id: string
          last_voted_date: string | null
          max_streak: number | null
          nullifier_hash: string
          referral_code: string
          referral_count: number | null
          referred_by: string | null
          swarm_points: number
          total_predictions: number | null
          updated_at: string | null
          username: string
          wallet_address: string | null
        }
        Insert: {
          accuracy_score?: number | null
          auth_provider?: string
          auth_uid: string
          avatar_seed?: string | null
          correct_predictions?: number | null
          created_at?: string | null
          current_streak?: number | null
          display_name?: string | null
          id?: string
          last_voted_date?: string | null
          max_streak?: number | null
          nullifier_hash: string
          referral_code: string
          referral_count?: number | null
          referred_by?: string | null
          swarm_points?: number
          total_predictions?: number | null
          updated_at?: string | null
          username: string
          wallet_address?: string | null
        }
        Update: {
          accuracy_score?: number | null
          auth_provider?: string
          auth_uid?: string
          avatar_seed?: string | null
          correct_predictions?: number | null
          created_at?: string | null
          current_streak?: number | null
          display_name?: string | null
          id?: string
          last_voted_date?: string | null
          max_streak?: number | null
          nullifier_hash?: string
          referral_code?: string
          referral_count?: number | null
          referred_by?: string | null
          swarm_points?: number
          total_predictions?: number | null
          updated_at?: string | null
          username?: string
          wallet_address?: string | null
        }
        Relationships: [
          {
            foreignKeyName: "users_referred_by_fkey"
            columns: ["referred_by"]
            isOneToOne: false
            referencedRelation: "users"
            referencedColumns: ["id"]
          },
        ]
      }
      votes: {
        Row: {
          confidence: string
          id: string
          is_correct: boolean | null
          matched_consensus: boolean | null
          option_id: string | null
          points_earned: number | null
          poll_id: string
          user_id: string
          vocdoni_vote_id: string | null
          voted_at: string | null
        }
        Insert: {
          confidence: string
          id?: string
          is_correct?: boolean | null
          matched_consensus?: boolean | null
          option_id?: string | null
          points_earned?: number | null
          poll_id: string
          user_id: string
          vocdoni_vote_id?: string | null
          voted_at?: string | null
        }
        Update: {
          confidence?: string
          id?: string
          is_correct?: boolean | null
          matched_consensus?: boolean | null
          option_id?: string | null
          points_earned?: number | null
          poll_id?: string
          user_id?: string
          vocdoni_vote_id?: string | null
          voted_at?: string | null
        }
        Relationships: [
          {
            foreignKeyName: "votes_option_id_fkey"
            columns: ["option_id"]
            isOneToOne: false
            referencedRelation: "poll_options"
            referencedColumns: ["id"]
          },
          {
            foreignKeyName: "votes_poll_id_fkey"
            columns: ["poll_id"]
            isOneToOne: false
            referencedRelation: "polls"
            referencedColumns: ["id"]
          },
          {
            foreignKeyName: "votes_user_id_fkey"
            columns: ["user_id"]
            isOneToOne: false
            referencedRelation: "users"
            referencedColumns: ["id"]
          },
        ]
      }
    }
    Views: {
      [_ in never]: never
    }
    Functions: {
      award_referral_points: {
        Args: { p_points: number; p_referred_id: string; p_referrer_id: string }
        Returns: undefined
      }
      award_user_points: {
        Args: {
          p_increment_correct?: boolean
          p_points: number
          p_user_id: string
        }
        Returns: undefined
      }
      get_leaderboard: {
        Args: { page_limit?: number; page_offset?: number }
        Returns: {
          accuracy_score: number
          avatar_seed: string
          current_streak: number
          max_streak: number
          player_id: string
          rank: number
          swarm_points: number
          total_predictions: number
          username: string
        }[]
      }
      get_total_users: { Args: never; Returns: number }
      get_user_rank: { Args: { target_user_id: string }; Returns: number }
      increment_option_vote_count: {
        Args: { p_option_id: string }
        Returns: undefined
      }
      increment_poll_total_votes: {
        Args: { p_poll_id: string }
        Returns: undefined
      }
      update_user_after_vote: {
        Args: {
          p_last_voted_date: string
          p_new_max_streak: number
          p_new_streak: number
          p_points: number
          p_user_id: string
        }
        Returns: undefined
      }
    }
    Enums: {
      [_ in never]: never
    }
    CompositeTypes: {
      [_ in never]: never
    }
  }
}

type DatabaseWithoutInternals = Omit<Database, "__InternalSupabase">

type DefaultSchema = DatabaseWithoutInternals[Extract<keyof Database, "public">]

export type Tables<
  DefaultSchemaTableNameOrOptions extends
    | keyof (DefaultSchema["Tables"] & DefaultSchema["Views"])
    | { schema: keyof DatabaseWithoutInternals },
  TableName extends DefaultSchemaTableNameOrOptions extends {
    schema: keyof DatabaseWithoutInternals
  }
    ? keyof (DatabaseWithoutInternals[DefaultSchemaTableNameOrOptions["schema"]]["Tables"] &
        DatabaseWithoutInternals[DefaultSchemaTableNameOrOptions["schema"]]["Views"])
    : never = never,
> = DefaultSchemaTableNameOrOptions extends {
  schema: keyof DatabaseWithoutInternals
}
  ? (DatabaseWithoutInternals[DefaultSchemaTableNameOrOptions["schema"]]["Tables"] &
      DatabaseWithoutInternals[DefaultSchemaTableNameOrOptions["schema"]]["Views"])[TableName] extends {
      Row: infer R
    }
    ? R
    : never
  : DefaultSchemaTableNameOrOptions extends keyof (DefaultSchema["Tables"] &
        DefaultSchema["Views"])
    ? (DefaultSchema["Tables"] &
        DefaultSchema["Views"])[DefaultSchemaTableNameOrOptions] extends {
        Row: infer R
      }
      ? R
      : never
    : never

export type TablesInsert<
  DefaultSchemaTableNameOrOptions extends
    | keyof DefaultSchema["Tables"]
    | { schema: keyof DatabaseWithoutInternals },
  TableName extends DefaultSchemaTableNameOrOptions extends {
    schema: keyof DatabaseWithoutInternals
  }
    ? keyof DatabaseWithoutInternals[DefaultSchemaTableNameOrOptions["schema"]]["Tables"]
    : never = never,
> = DefaultSchemaTableNameOrOptions extends {
  schema: keyof DatabaseWithoutInternals
}
  ? DatabaseWithoutInternals[DefaultSchemaTableNameOrOptions["schema"]]["Tables"][TableName] extends {
      Insert: infer I
    }
    ? I
    : never
  : DefaultSchemaTableNameOrOptions extends keyof DefaultSchema["Tables"]
    ? DefaultSchema["Tables"][DefaultSchemaTableNameOrOptions] extends {
        Insert: infer I
      }
      ? I
      : never
    : never

export type TablesUpdate<
  DefaultSchemaTableNameOrOptions extends
    | keyof DefaultSchema["Tables"]
    | { schema: keyof DatabaseWithoutInternals },
  TableName extends DefaultSchemaTableNameOrOptions extends {
    schema: keyof DatabaseWithoutInternals
  }
    ? keyof DatabaseWithoutInternals[DefaultSchemaTableNameOrOptions["schema"]]["Tables"]
    : never = never,
> = DefaultSchemaTableNameOrOptions extends {
  schema: keyof DatabaseWithoutInternals
}
  ? DatabaseWithoutInternals[DefaultSchemaTableNameOrOptions["schema"]]["Tables"][TableName] extends {
      Update: infer U
    }
    ? U
    : never
  : DefaultSchemaTableNameOrOptions extends keyof DefaultSchema["Tables"]
    ? DefaultSchema["Tables"][DefaultSchemaTableNameOrOptions] extends {
        Update: infer U
      }
      ? U
      : never
    : never

export type Enums<
  DefaultSchemaEnumNameOrOptions extends
    | keyof DefaultSchema["Enums"]
    | { schema: keyof DatabaseWithoutInternals },
  EnumName extends DefaultSchemaEnumNameOrOptions extends {
    schema: keyof DatabaseWithoutInternals
  }
    ? keyof DatabaseWithoutInternals[DefaultSchemaEnumNameOrOptions["schema"]]["Enums"]
    : never = never,
> = DefaultSchemaEnumNameOrOptions extends {
  schema: keyof DatabaseWithoutInternals
}
  ? DatabaseWithoutInternals[DefaultSchemaEnumNameOrOptions["schema"]]["Enums"][EnumName]
  : DefaultSchemaEnumNameOrOptions extends keyof DefaultSchema["Enums"]
    ? DefaultSchema["Enums"][DefaultSchemaEnumNameOrOptions]
    : never

export type CompositeTypes<
  PublicCompositeTypeNameOrOptions extends
    | keyof DefaultSchema["CompositeTypes"]
    | { schema: keyof DatabaseWithoutInternals },
  CompositeTypeName extends PublicCompositeTypeNameOrOptions extends {
    schema: keyof DatabaseWithoutInternals
  }
    ? keyof DatabaseWithoutInternals[PublicCompositeTypeNameOrOptions["schema"]]["CompositeTypes"]
    : never = never,
> = PublicCompositeTypeNameOrOptions extends {
  schema: keyof DatabaseWithoutInternals
}
  ? DatabaseWithoutInternals[PublicCompositeTypeNameOrOptions["schema"]]["CompositeTypes"][CompositeTypeName]
  : PublicCompositeTypeNameOrOptions extends keyof DefaultSchema["CompositeTypes"]
    ? DefaultSchema["CompositeTypes"][PublicCompositeTypeNameOrOptions]
    : never

export const Constants = {
  public: {
    Enums: {},
  },
} as const
