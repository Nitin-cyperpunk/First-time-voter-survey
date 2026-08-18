export type Json =
  | string
  | number
  | boolean
  | null
  | { [key: string]: Json | undefined }
  | Json[];

type Relationship = {
  foreignKeyName: string;
  columns: string[];
  isOneToOne: boolean;
  referencedRelation: string;
  referencedColumns: string[];
};

type TableDefinition<
  Row extends Record<string, unknown>,
  Insert extends Record<string, unknown>,
  Relationships extends readonly Relationship[] = Relationship[],
> = {
  Row: Row;
  Insert: Insert;
  Update: Partial<Insert>;
  Relationships: Relationships;
};

export type Database = {
  public: {
    Tables: {
      participants: TableDefinition<
        {
          lead_id: string;
          referral_code: string;
          full_name: string | null;
          mobile: string | null;
          dob: string | null;
          age_band: string | null;
          city: string | null;
          city_id: string | null;
          city_raw: string | null;
          city_match_type: string | null;
          email: string | null;
          area: string | null;
          pincode: string | null;
          status: string;
          referred_by: string | null;
          ip_address: string | null;
          user_agent: string | null;
          is_flagged_duplicate: boolean;
          acquisition_source: string | null;
          acquisition_type: string | null;
          referral_platform: string | null;
          other_source: string | null;
          upi_id: string | null;
          upi_submitted_at: string | null;
          device_fingerprint: string | null;
          duplicate_flag: boolean;
          duplicate_reason: string | null;
          duplicate_detected_at: string | null;
          review_status: string;
          original_participant_lead_id: string | null;
          duplicate_cluster_id: string | null;
          is_fingerprint_cluster_original: boolean;
          duplicate_gaming_pattern: string | null;
          qc_status_override: string | null;
          survey_data_incomplete: boolean;
          survey_data_incomplete_at: string | null;
          survey_data_incomplete_reason: string | null;
          created_at: string;
          deleted_at: string | null;
          deleted_by: string | null;
          delete_reason: string | null;
        },
        {
          lead_id?: string;
          referral_code: string;
          full_name?: string | null;
          mobile?: string | null;
          dob?: string | null;
          age_band?: string | null;
          city?: string | null;
          city_id?: string | null;
          city_raw?: string | null;
          city_match_type?: string | null;
          email?: string | null;
          area?: string | null;
          pincode?: string | null;
          status?: string;
          referred_by?: string | null;
          ip_address?: string | null;
          user_agent?: string | null;
          is_flagged_duplicate?: boolean;
          acquisition_source?: string | null;
          acquisition_type?: string | null;
          referral_platform?: string | null;
          other_source?: string | null;
          upi_id?: string | null;
          upi_submitted_at?: string | null;
          device_fingerprint?: string | null;
          duplicate_flag?: boolean;
          duplicate_reason?: string | null;
          duplicate_detected_at?: string | null;
          review_status?: string;
          original_participant_lead_id?: string | null;
          duplicate_cluster_id?: string | null;
          is_fingerprint_cluster_original?: boolean;
          duplicate_gaming_pattern?: string | null;
          qc_status_override?: string | null;
          survey_data_incomplete?: boolean;
          survey_data_incomplete_at?: string | null;
          survey_data_incomplete_reason?: string | null;
          created_at?: string;
          deleted_at?: string | null;
          deleted_by?: string | null;
          delete_reason?: string | null;
        }
      >;
      payouts: TableDefinition<
        {
          lead_id: string;
          payment_status: string;
          payment_date: string | null;
          created_at: string;
          updated_at: string;
        },
        {
          lead_id: string;
          payment_status?: string;
          payment_date?: string | null;
          created_at?: string;
          updated_at?: string;
        },
        [
          {
            foreignKeyName: "payouts_lead_id_fkey";
            columns: ["lead_id"];
            isOneToOne: true;
            referencedRelation: "participants";
            referencedColumns: ["lead_id"];
          },
        ]
      >;
      referrals: TableDefinition<
        {
          id: string;
          referrer_lead_id: string | null;
          referred_lead_id: string | null;
          referral_code: string | null;
          reward_status: string;
          reward_amount: number | null;
          earned_at: string | null;
          paid_at: string | null;
          created_at: string;
        },
        {
          id?: string;
          referrer_lead_id?: string | null;
          referred_lead_id?: string | null;
          referral_code?: string | null;
          reward_status?: string;
          reward_amount?: number | null;
          earned_at?: string | null;
          paid_at?: string | null;
          created_at?: string;
        }
      >;
      referral_leads: TableDefinition<
        {
          id: string;
          full_name: string;
          mobile: string;
          city: string;
          area: string | null;
          pincode: string | null;
          dob: string;
          referral_code: string;
          referred_by: string | null;
          share_count: number;
          whatsapp_shared_at: string | null;
          instagram_shared_at: string | null;
          status: string;
          created_at: string;
          updated_at: string;
        },
        {
          id?: string;
          full_name: string;
          mobile: string;
          city: string;
          area?: string | null;
          pincode?: string | null;
          dob: string;
          referral_code: string;
          referred_by?: string | null;
          share_count?: number;
          whatsapp_shared_at?: string | null;
          instagram_shared_at?: string | null;
          status?: string;
          created_at?: string;
          updated_at?: string;
        }
      >;
      admin_users: TableDefinition<
        {
          id: string;
          auth_user_id: string;
          name: string;
          email: string;
          role: string;
          status: string;
          created_at: string;
          updated_at: string;
          created_by: string | null;
          last_login_at: string | null;
        },
        {
          id?: string;
          auth_user_id: string;
          name: string;
          email: string;
          role: string;
          status?: string;
          created_at?: string;
          updated_at?: string;
          created_by?: string | null;
          last_login_at?: string | null;
        }
      >;
      screener_responses: TableDefinition<
        {
          id: string;
          lead_id: string;
          mobile: string | null;
          form_version: number;
          answers: Json;
          response_times: Json | null;
          analytics: Json | null;
          csv_row: Json | null;
          normalized_export: Json | null;
          started_at: string | null;
          submitted_at: string;
          total_duration_sec: number | null;
          ip_address: string | null;
          completion_status: string | null;
          termination_reason: string | null;
          city_id: string | null;
          config_area_type: string | null;
          config_state: string | null;
          self_reported_area_type: string | null;
          city_raw: string | null;
          city_match_type: string | null;
          deleted_at: string | null;
          deleted_by: string | null;
          delete_reason: string | null;
        },
        {
          id?: string;
          lead_id: string;
          mobile?: string | null;
          form_version: number;
          answers: Json;
          response_times?: Json | null;
          analytics?: Json | null;
          csv_row?: Json | null;
          normalized_export?: Json | null;
          started_at?: string | null;
          submitted_at?: string;
          total_duration_sec?: number | null;
          ip_address?: string | null;
          completion_status?: string | null;
          termination_reason?: string | null;
          city_id?: string | null;
          config_area_type?: string | null;
          config_state?: string | null;
          self_reported_area_type?: string | null;
          city_raw?: string | null;
          city_match_type?: string | null;
          deleted_at?: string | null;
          deleted_by?: string | null;
          delete_reason?: string | null;
        }
      >;
      cities: TableDefinition<
        {
          id: string;
          name: string;
          state: string;
          area_type: string;
          capacity: number;
          buffer: number;
          is_open: boolean;
          is_active: boolean;
          match_key: string | null;
          created_at: string;
          updated_at: string;
          created_by: string | null;
          updated_by: string | null;
        },
        {
          id?: string;
          name: string;
          state: string;
          area_type: string;
          capacity?: number;
          buffer?: number;
          is_open?: boolean;
          is_active?: boolean;
          match_key?: string | null;
          created_at?: string;
          updated_at?: string;
          created_by?: string | null;
          updated_by?: string | null;
        }
      >;
      city_aliases: TableDefinition<
        {
          id: string;
          city_id: string;
          alias: string;
          match_key: string;
          created_at: string;
          created_by: string | null;
        },
        {
          id?: string;
          city_id: string;
          alias: string;
          match_key: string;
          created_at?: string;
          created_by?: string | null;
        },
        [
          {
            foreignKeyName: "city_aliases_city_id_fkey";
            columns: ["city_id"];
            isOneToOne: false;
            referencedRelation: "cities";
            referencedColumns: ["id"];
          },
        ]
      >;
      city_import_log: TableDefinition<
        {
          id: string;
          actor_id: string | null;
          actor_email: string | null;
          file_name: string | null;
          rows_added: number;
          rows_updated: number;
          rows_rejected: number;
          details: Json | null;
          created_at: string;
        },
        {
          id?: string;
          actor_id?: string | null;
          actor_email?: string | null;
          file_name?: string | null;
          rows_added?: number;
          rows_updated?: number;
          rows_rejected?: number;
          details?: Json | null;
          created_at?: string;
        }
      >;
      city_unmatched_reviews: TableDefinition<
        {
          match_key: string;
          sample_raw: string;
          status: string;
          resolved_city_id: string | null;
          resolved_action: string | null;
          over_quota_decision: string | null;
          actor_id: string | null;
          actor_email: string | null;
          response_count: number;
          details: Json | null;
          created_at: string;
          updated_at: string;
          restored_at: string | null;
        },
        {
          match_key: string;
          sample_raw: string;
          status: string;
          resolved_city_id?: string | null;
          resolved_action?: string | null;
          over_quota_decision?: string | null;
          actor_id?: string | null;
          actor_email?: string | null;
          response_count?: number;
          details?: Json | null;
          created_at?: string;
          updated_at?: string;
          restored_at?: string | null;
        }
      >;
      quota_cell_over_quota: TableDefinition<
        {
          state: string;
          area_type: string;
          flagged_at: string;
          flagged_by: string | null;
          reason: string | null;
        },
        {
          state: string;
          area_type: string;
          flagged_at?: string;
          flagged_by?: string | null;
          reason?: string | null;
        }
      >;
      study_state_allocations: TableDefinition<
        {
          state: string;
          allocation: number;
          urban_pct: number;
          allocation_manual: boolean;
          urban_pct_manual: boolean;
          updated_at: string;
          updated_by: string | null;
        },
        {
          state: string;
          allocation: number;
          urban_pct?: number;
          allocation_manual?: boolean;
          urban_pct_manual?: boolean;
          updated_at?: string;
          updated_by?: string | null;
        }
      >;
      quota_cell_deltas: TableDefinition<
        {
          state: string;
          area_type: string;
          delta: number;
        },
        {
          state: string;
          area_type: string;
          delta?: number;
        }
      >;
      quota_reallocations: TableDefinition<
        {
          id: string;
          actor_id: string | null;
          actor_email: string | null;
          from_state: string;
          from_area_type: string;
          to_state: string;
          to_area_type: string;
          amount: number;
          reason: string | null;
          from_achieved: number | null;
          from_allocation_before: number | null;
          from_days_since_last_completion: number | null;
          created_at: string;
        },
        {
          id?: string;
          actor_id?: string | null;
          actor_email?: string | null;
          from_state: string;
          from_area_type: string;
          to_state: string;
          to_area_type: string;
          amount: number;
          reason?: string | null;
          from_achieved?: number | null;
          from_allocation_before?: number | null;
          from_days_since_last_completion?: number | null;
          created_at?: string;
        }
      >;
      config_audit_log: TableDefinition<
        {
          id: string;
          actor_id: string | null;
          actor_email: string | null;
          entity_type: string;
          entity_id: string | null;
          field: string;
          old_value: string | null;
          new_value: string | null;
          created_at: string;
        },
        {
          id?: string;
          actor_id?: string | null;
          actor_email?: string | null;
          entity_type: string;
          entity_id?: string | null;
          field: string;
          old_value?: string | null;
          new_value?: string | null;
          created_at?: string;
        }
      >;
      participant_qc_override_log: TableDefinition<
        {
          id: string;
          lead_id: string;
          previous_auto_status: string;
          new_auto_status: string;
          previous_effective_status: string;
          new_effective_status: string;
          previous_override: string | null;
          new_override: string;
          reason: string;
          changed_by_admin_id: string | null;
          changed_by_email: string;
          created_at: string;
        },
        {
          id?: string;
          lead_id: string;
          previous_auto_status: string;
          new_auto_status: string;
          previous_effective_status: string;
          new_effective_status: string;
          previous_override?: string | null;
          new_override: string;
          reason: string;
          changed_by_admin_id?: string | null;
          changed_by_email: string;
          created_at?: string;
        },
        [
          {
            foreignKeyName: "participant_qc_override_log_lead_id_fkey";
            columns: ["lead_id"];
            isOneToOne: false;
            referencedRelation: "participants";
            referencedColumns: ["lead_id"];
          },
        ]
      >;
      participant_sessions: TableDefinition<
        {
          id: string;
          lead_id: string | null;
          token_hash: string;
          remember_me: boolean;
          expires_at: string;
          last_seen_at: string | null;
          revoked_at: string | null;
          created_at: string;
        },
        {
          id?: string;
          lead_id?: string | null;
          token_hash: string;
          remember_me?: boolean;
          expires_at: string;
          last_seen_at?: string | null;
          revoked_at?: string | null;
          created_at?: string;
        }
      >;
      status_history: TableDefinition<
        {
          id: string;
          lead_id: string;
          status: string;
          old_status: string | null;
          new_status: string | null;
          changed_by: string | null;
          notes: string | null;
          changed_at: string;
        },
        {
          id?: string;
          lead_id: string;
          status: string;
          old_status?: string | null;
          new_status?: string | null;
          changed_by?: string | null;
          notes?: string | null;
          changed_at?: string;
        }
      >;
      form_versions: TableDefinition<
        {
          id: string;
          form_type: string;
          version: number;
          name: string | null;
          html_file_path: string | null;
          html_content: string | null;
          uploaded_file_name: string | null;
          schema: Json;
          published: boolean;
          created_at: string;
        },
        {
          id?: string;
          form_type: string;
          version: number;
          name?: string | null;
          html_file_path?: string | null;
          html_content?: string | null;
          uploaded_file_name?: string | null;
          schema: Json;
          published?: boolean;
          created_at?: string;
        }
      >;
      form_settings: TableDefinition<
        {
          id: string;
          form_type: string;
          active_version: number;
          message_templates: Json;
          study_config: Json;
        },
        {
          id?: string;
          form_type: string;
          active_version?: number;
          message_templates?: Json;
          study_config?: Json;
        }
      >;
      message_templates: TableDefinition<
        {
          id: string;
          name: string;
          channel: string;
          body: string;
          variables: string[];
          is_active: boolean;
          created_at: string;
          updated_at: string;
        },
        {
          id: string;
          name: string;
          channel: string;
          body?: string;
          variables?: string[];
          is_active?: boolean;
          created_at?: string;
          updated_at?: string;
        }
      >;
      fingerprint_events: TableDefinition<
        {
          id: string;
          participant_lead_id: string;
          device_fingerprint: string | null;
          ip_address: string | null;
          user_agent: string | null;
          event_type: string;
          original_participant_lead_id: string | null;
          created_at: string;
        },
        {
          id?: string;
          participant_lead_id: string;
          device_fingerprint?: string | null;
          ip_address?: string | null;
          user_agent?: string | null;
          event_type: string;
          original_participant_lead_id?: string | null;
          created_at?: string;
        }
      >;
      form_terminations: TableDefinition<
        {
          id: string;
          lead_id: string;
          form_type: string;
          form_version: number | null;
          rule_key: string;
          rule_label: string | null;
          question_key: string | null;
          question_label: string | null;
          answer_value: string | null;
          reason_text: string | null;
          participant_status: string | null;
          submitted_at: string;
        },
        {
          id?: string;
          lead_id: string;
          form_type: string;
          form_version?: number | null;
          rule_key: string;
          rule_label?: string | null;
          question_key?: string | null;
          question_label?: string | null;
          answer_value?: string | null;
          reason_text?: string | null;
          participant_status?: string | null;
          submitted_at?: string;
        }
      >;
      ftv_responses: TableDefinition<
        {
          id: number;
          respondent_id: string;
          lead_id: string | null;
          city_id: string | null;
          survey_version: string;
          status: string;
          started_at: string | null;
          completed_at: string | null;
          terminated_at: string | null;
          duration_seconds: number | null;
          referral_code: string | null;
          payload: Json;
          created_at: string;
          deleted_at: string | null;
          deleted_by: string | null;
          delete_reason: string | null;
        },
        {
          id?: number;
          respondent_id: string;
          lead_id?: string | null;
          city_id?: string | null;
          referral_code?: string | null;
          survey_version: string;
          status: string;
          started_at?: string | null;
          completed_at?: string | null;
          terminated_at?: string | null;
          duration_seconds?: number | null;
          payload: Json;
          created_at?: string;
          deleted_at?: string | null;
          deleted_by?: string | null;
          delete_reason?: string | null;
        },
        [
          {
            foreignKeyName: "ftv_responses_lead_id_fkey";
            columns: ["lead_id"];
            isOneToOne: false;
            referencedRelation: "participants";
            referencedColumns: ["lead_id"];
          },
          {
            foreignKeyName: "ftv_responses_city_id_fkey";
            columns: ["city_id"];
            isOneToOne: false;
            referencedRelation: "cities";
            referencedColumns: ["id"];
          },
        ]
      >;
    };
    Views: {
      ftv_answers: {
        Row: {
          respondent_id: string | null;
          lead_id: string | null;
          status: string | null;
          created_at: string | null;
          answer_order: number | null;
          qid: string | null;
          question: string | null;
          question_type: string | null;
          item: string | null;
          item_code: number | null;
          rank_position: number | null;
          selection_order: number | null;
          answer_code: number | null;
          answer: string | null;
          other_text: string | null;
          answer_original: string | null;
          answer_script: string | null;
          spoken_language: string | null;
        };
        Relationships: [];
      };
      ftv_answers_all: {
        Row: {
          respondent_id: string | null;
          lead_id: string | null;
          status: string | null;
          created_at: string | null;
          answer_order: number | null;
          qid: string | null;
          question: string | null;
          question_type: string | null;
          item: string | null;
          item_code: number | null;
          rank_position: number | null;
          selection_order: number | null;
          answer_code: number | null;
          answer: string | null;
          other_text: string | null;
          answer_original: string | null;
          answer_script: string | null;
          spoken_language: string | null;
        };
        Relationships: [];
      };
      ftv_respondents: {
        Row: {
          respondent_id: string | null;
          lead_id: string | null;
          city_id: string | null;
          inbound_referral_code: string | null;
          own_referral_code: string | null;
          referred_by_lead_id: string | null;
          survey_version: string | null;
          status: string | null;
          started_at: string | null;
          completed_at: string | null;
          terminated_at: string | null;
          duration_seconds: number | null;
          created_at: string | null;
          name: string | null;
          email: string | null;
          phone: string | null;
          area: string | null;
          city: string | null;
          age_band: string | null;
          state_code: number | null;
          state: string | null;
          zip: string | null;
          dob: string | null;
          age_today: number | null;
          age_at_poll: number | null;
          age_at_qualifying_date: number | null;
          gender_code: number | null;
          gender: string | null;
          relationship_code: number | null;
          relationship_status: string | null;
          state_match: boolean | null;
          consent: string | null;
          terms_accepted: boolean | null;
          randomisation_seed: number | null;
          order_q6_blocks: Json | null;
          order_q6a: Json | null;
          order_q6b: Json | null;
          order_q14: Json | null;
        };
        Relationships: [];
      };
      ftv_respondents_all: {
        Row: {
          respondent_id: string | null;
          lead_id: string | null;
          city_id: string | null;
          inbound_referral_code: string | null;
          own_referral_code: string | null;
          referred_by_lead_id: string | null;
          survey_version: string | null;
          status: string | null;
          started_at: string | null;
          completed_at: string | null;
          terminated_at: string | null;
          duration_seconds: number | null;
          created_at: string | null;
          deleted_at: string | null;
          name: string | null;
          email: string | null;
          phone: string | null;
          area: string | null;
          city: string | null;
          age_band: string | null;
          state_code: number | null;
          state: string | null;
          zip: string | null;
          dob: string | null;
          age_today: number | null;
          age_at_poll: number | null;
          age_at_qualifying_date: number | null;
          gender_code: number | null;
          gender: string | null;
          relationship_code: number | null;
          relationship_status: string | null;
          state_match: boolean | null;
          consent: string | null;
          terms_accepted: boolean | null;
          randomisation_seed: number | null;
          order_q6_blocks: Json | null;
          order_q6a: Json | null;
          order_q6b: Json | null;
          order_q14: Json | null;
        };
        Relationships: [];
      };
      ftv_field_summary: {
        Row: {
          status: string | null;
          n: number | null;
          pct: number | null;
          avg_minutes: number | null;
          first_response: string | null;
          latest_response: string | null;
        };
        Relationships: [];
      };
    };
    Functions: {
      count_qualified_completions: {
        Args: {
          p_city_id: string | null;
          p_state?: string | null;
          p_area_type?: string | null;
        };
        Returns: number;
      };
      insert_ftv_response: {
        Args: {
          p_respondent_id: string;
          p_survey_version: string;
          p_status: string;
          p_payload: Json;
          p_started_at?: string | null;
          p_completed_at?: string | null;
          p_terminated_at?: string | null;
          p_duration_seconds?: number | null;
          p_lead_id?: string | null;
          p_city_id?: string | null;
          p_referral_code?: string | null;
        };
        Returns: Json;
      };
      insert_screener_response_with_capacity: {
        Args: {
          p_lead_id: string;
          p_mobile: string | null;
          p_form_version: number;
          p_answers: Json;
          p_completion_status: string | null;
          p_termination_reason: string | null;
          p_response_times: Json | null;
          p_analytics: Json | null;
          p_csv_row: Json | null;
          p_normalized_export: Json | null;
          p_started_at: string | null;
          p_submitted_at: string | null;
          p_total_duration_sec: number | null;
          p_ip_address: string | null;
          p_city_id: string | null;
          p_self_reported_area_type: string | null;
          p_city_raw?: string | null;
          p_city_match_type?: string | null;
        };
        Returns: Json;
      };
      apply_participant_qc_override: {
        Args: {
          p_lead_id: string;
          p_new_override: string;
          p_reason: string;
          p_previous_auto: string;
          p_new_auto: string;
          p_previous_effective: string;
          p_new_effective: string;
          p_previous_override: string | null;
          p_admin_id: string;
          p_admin_email: string;
        };
        Returns: undefined;
      };
    };
    Enums: Record<string, never>;
    CompositeTypes: Record<string, never>;
  };
};
