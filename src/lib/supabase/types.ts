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
          full_name: string;
          mobile: string;
          dob: string;
          city: string | null;
          city_id: string | null;
          email: string | null;
          area: string | null;
          pincode: string | null;
          status: string;
          referred_by: string | null;
          ip_address: string | null;
          user_agent: string | null;
          is_flagged_duplicate: boolean;
          refill_required: boolean;
          refill_reason: string | null;
          refill_requested_at: string | null;
          refill_completed_at: string | null;
          refill_token: string | null;
          eligibility_manual_override: boolean;
          eligibility_override_reason: string | null;
          eligibility_overridden_at: string | null;
          acquisition_source: string | null;
          acquisition_type: string | null;
          referral_platform: string | null;
          other_source: string | null;
          verified_at: string | null;
          verification_method: string | null;
          dm_status: string | null;
          instagram_id: string | null;
          instagram_visibility: string;
          call_disposition: string | null;
          call_disposition_notes: string | null;
          call_disposition_at: string | null;
          upi_id: string | null;
          upi_submitted_at: string | null;
          device_fingerprint: string | null;
          duplicate_flag: boolean;
          duplicate_reason: string | null;
          duplicate_detected_at: string | null;
          review_status: string;
          original_participant_lead_id: string | null;
          created_at: string;
        },
        {
          lead_id?: string;
          referral_code: string;
          full_name: string;
          mobile: string;
          dob: string;
          city?: string | null;
          city_id?: string | null;
          email?: string | null;
          area?: string | null;
          pincode?: string | null;
          status?: string;
          referred_by?: string | null;
          ip_address?: string | null;
          user_agent?: string | null;
          is_flagged_duplicate?: boolean;
          refill_required?: boolean;
          refill_reason?: string | null;
          refill_requested_at?: string | null;
          refill_completed_at?: string | null;
          refill_token?: string | null;
          eligibility_manual_override?: boolean;
          eligibility_override_reason?: string | null;
          eligibility_overridden_at?: string | null;
          acquisition_source?: string | null;
          acquisition_type?: string | null;
          referral_platform?: string | null;
          other_source?: string | null;
          verified_at?: string | null;
          verification_method?: string | null;
          dm_status?: string | null;
          instagram_id?: string | null;
          instagram_visibility?: string;
          call_disposition?: string | null;
          call_disposition_notes?: string | null;
          call_disposition_at?: string | null;
          upi_id?: string | null;
          upi_submitted_at?: string | null;
          device_fingerprint?: string | null;
          duplicate_flag?: boolean;
          duplicate_reason?: string | null;
          duplicate_detected_at?: string | null;
          review_status?: string;
          original_participant_lead_id?: string | null;
          created_at?: string;
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
          self_reported_area_type: string | null;
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
          self_reported_area_type?: string | null;
        }
      >;
      cities: TableDefinition<
        {
          id: string;
          name: string;
          state: string;
          area_type: string;
          capacity: number;
          is_active: boolean;
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
          capacity: number;
          is_active?: boolean;
          created_at?: string;
          updated_at?: string;
          created_by?: string | null;
          updated_by?: string | null;
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
          call_dispositions: Json;
          study_config: Json;
        },
        {
          id?: string;
          form_type: string;
          active_version?: number;
          message_templates?: Json;
          call_dispositions?: Json;
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
    };
    Views: Record<string, never>;
    Functions: {
      count_qualified_completions: {
        Args: { p_city_id?: string | null };
        Returns: number;
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
          p_city_id: string;
          p_self_reported_area_type: string | null;
        };
        Returns: Json;
      };
    };
    Enums: Record<string, never>;
    CompositeTypes: Record<string, never>;
  };
};
