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
    PostgrestVersion: "14.15"
  }
  public: {
    Tables: {
      approval_comments: {
        Row: {
          approval_request_id: string
          author_id: string
          body: string
          comment_type: Database["public"]["Enums"]["approval_comment_type"]
          created_at: string
          id: string
          workspace_id: string
        }
        Insert: {
          approval_request_id: string
          author_id: string
          body: string
          comment_type?: Database["public"]["Enums"]["approval_comment_type"]
          created_at?: string
          id?: string
          workspace_id: string
        }
        Update: {
          approval_request_id?: string
          author_id?: string
          body?: string
          comment_type?: Database["public"]["Enums"]["approval_comment_type"]
          created_at?: string
          id?: string
          workspace_id?: string
        }
        Relationships: [
          {
            foreignKeyName: "approval_comments_request_workspace_fkey"
            columns: ["approval_request_id", "workspace_id"]
            isOneToOne: false
            referencedRelation: "approval_requests"
            referencedColumns: ["id", "workspace_id"]
          },
          {
            foreignKeyName: "approval_comments_workspace_id_fkey"
            columns: ["workspace_id"]
            isOneToOne: false
            referencedRelation: "workspaces"
            referencedColumns: ["id"]
          },
        ]
      }
      approval_events: {
        Row: {
          actor_id: string | null
          approval_request_id: string
          created_at: string
          event_type: Database["public"]["Enums"]["approval_event_type"]
          id: string
          message: string | null
          metadata: Json
          new_status:
            | Database["public"]["Enums"]["approval_request_status"]
            | null
          post_id: string
          post_revision: number
          previous_status:
            | Database["public"]["Enums"]["approval_request_status"]
            | null
          workspace_id: string
        }
        Insert: {
          actor_id?: string | null
          approval_request_id: string
          created_at?: string
          event_type: Database["public"]["Enums"]["approval_event_type"]
          id?: string
          message?: string | null
          metadata?: Json
          new_status?:
            | Database["public"]["Enums"]["approval_request_status"]
            | null
          post_id: string
          post_revision: number
          previous_status?:
            | Database["public"]["Enums"]["approval_request_status"]
            | null
          workspace_id: string
        }
        Update: {
          actor_id?: string | null
          approval_request_id?: string
          created_at?: string
          event_type?: Database["public"]["Enums"]["approval_event_type"]
          id?: string
          message?: string | null
          metadata?: Json
          new_status?:
            | Database["public"]["Enums"]["approval_request_status"]
            | null
          post_id?: string
          post_revision?: number
          previous_status?:
            | Database["public"]["Enums"]["approval_request_status"]
            | null
          workspace_id?: string
        }
        Relationships: [
          {
            foreignKeyName: "approval_events_post_workspace_fkey"
            columns: ["post_id", "workspace_id"]
            isOneToOne: false
            referencedRelation: "posts"
            referencedColumns: ["id", "workspace_id"]
          },
          {
            foreignKeyName: "approval_events_request_workspace_fkey"
            columns: ["approval_request_id", "workspace_id"]
            isOneToOne: false
            referencedRelation: "approval_requests"
            referencedColumns: ["id", "workspace_id"]
          },
          {
            foreignKeyName: "approval_events_workspace_id_fkey"
            columns: ["workspace_id"]
            isOneToOne: false
            referencedRelation: "workspaces"
            referencedColumns: ["id"]
          },
        ]
      }
      approval_requests: {
        Row: {
          assigned_approver_id: string | null
          created_at: string
          due_at: string | null
          id: string
          post_id: string
          post_revision: number
          requested_at: string
          requested_by: string
          resolution_message: string | null
          resolved_at: string | null
          resolved_by: string | null
          status: Database["public"]["Enums"]["approval_request_status"]
          submission_message: string | null
          superseded_at: string | null
          updated_at: string
          withdrawn_at: string | null
          workspace_id: string
        }
        Insert: {
          assigned_approver_id?: string | null
          created_at?: string
          due_at?: string | null
          id?: string
          post_id: string
          post_revision: number
          requested_at?: string
          requested_by: string
          resolution_message?: string | null
          resolved_at?: string | null
          resolved_by?: string | null
          status?: Database["public"]["Enums"]["approval_request_status"]
          submission_message?: string | null
          superseded_at?: string | null
          updated_at?: string
          withdrawn_at?: string | null
          workspace_id: string
        }
        Update: {
          assigned_approver_id?: string | null
          created_at?: string
          due_at?: string | null
          id?: string
          post_id?: string
          post_revision?: number
          requested_at?: string
          requested_by?: string
          resolution_message?: string | null
          resolved_at?: string | null
          resolved_by?: string | null
          status?: Database["public"]["Enums"]["approval_request_status"]
          submission_message?: string | null
          superseded_at?: string | null
          updated_at?: string
          withdrawn_at?: string | null
          workspace_id?: string
        }
        Relationships: [
          {
            foreignKeyName: "approval_requests_post_workspace_fkey"
            columns: ["post_id", "workspace_id"]
            isOneToOne: false
            referencedRelation: "posts"
            referencedColumns: ["id", "workspace_id"]
          },
          {
            foreignKeyName: "approval_requests_workspace_id_fkey"
            columns: ["workspace_id"]
            isOneToOne: false
            referencedRelation: "workspaces"
            referencedColumns: ["id"]
          },
        ]
      }
      media_assets: {
        Row: {
          alt_text: string | null
          created_at: string
          duration_seconds: number | null
          file_name: string
          file_size: number | null
          height: number | null
          id: string
          media_type: Database["public"]["Enums"]["media_type"]
          metadata: Json
          mime_type: string | null
          storage_bucket: string
          storage_path: string
          updated_at: string
          uploaded_by: string
          width: number | null
          workspace_id: string
        }
        Insert: {
          alt_text?: string | null
          created_at?: string
          duration_seconds?: number | null
          file_name: string
          file_size?: number | null
          height?: number | null
          id?: string
          media_type: Database["public"]["Enums"]["media_type"]
          metadata?: Json
          mime_type?: string | null
          storage_bucket?: string
          storage_path: string
          updated_at?: string
          uploaded_by: string
          width?: number | null
          workspace_id: string
        }
        Update: {
          alt_text?: string | null
          created_at?: string
          duration_seconds?: number | null
          file_name?: string
          file_size?: number | null
          height?: number | null
          id?: string
          media_type?: Database["public"]["Enums"]["media_type"]
          metadata?: Json
          mime_type?: string | null
          storage_bucket?: string
          storage_path?: string
          updated_at?: string
          uploaded_by?: string
          width?: number | null
          workspace_id?: string
        }
        Relationships: [
          {
            foreignKeyName: "media_assets_workspace_id_fkey"
            columns: ["workspace_id"]
            isOneToOne: false
            referencedRelation: "workspaces"
            referencedColumns: ["id"]
          },
        ]
      }
      membership_events: {
        Row: {
          actor_id: string | null
          affected_user_id: string | null
          created_at: string
          event_type: Database["public"]["Enums"]["membership_event_type"]
          id: string
          invitation_id: string | null
          message: string | null
          metadata: Json
          new_role: Database["public"]["Enums"]["workspace_role"] | null
          new_status: Database["public"]["Enums"]["membership_status"] | null
          previous_role: Database["public"]["Enums"]["workspace_role"] | null
          previous_status:
            | Database["public"]["Enums"]["membership_status"]
            | null
          workspace_id: string
          workspace_member_id: string | null
        }
        Insert: {
          actor_id?: string | null
          affected_user_id?: string | null
          created_at?: string
          event_type: Database["public"]["Enums"]["membership_event_type"]
          id?: string
          invitation_id?: string | null
          message?: string | null
          metadata?: Json
          new_role?: Database["public"]["Enums"]["workspace_role"] | null
          new_status?: Database["public"]["Enums"]["membership_status"] | null
          previous_role?: Database["public"]["Enums"]["workspace_role"] | null
          previous_status?:
            | Database["public"]["Enums"]["membership_status"]
            | null
          workspace_id: string
          workspace_member_id?: string | null
        }
        Update: {
          actor_id?: string | null
          affected_user_id?: string | null
          created_at?: string
          event_type?: Database["public"]["Enums"]["membership_event_type"]
          id?: string
          invitation_id?: string | null
          message?: string | null
          metadata?: Json
          new_role?: Database["public"]["Enums"]["workspace_role"] | null
          new_status?: Database["public"]["Enums"]["membership_status"] | null
          previous_role?: Database["public"]["Enums"]["workspace_role"] | null
          previous_status?:
            | Database["public"]["Enums"]["membership_status"]
            | null
          workspace_id?: string
          workspace_member_id?: string | null
        }
        Relationships: [
          {
            foreignKeyName: "membership_events_invitation_id_fkey"
            columns: ["invitation_id"]
            isOneToOne: false
            referencedRelation: "workspace_invitations"
            referencedColumns: ["id"]
          },
          {
            foreignKeyName: "membership_events_workspace_id_fkey"
            columns: ["workspace_id"]
            isOneToOne: false
            referencedRelation: "workspaces"
            referencedColumns: ["id"]
          },
          {
            foreignKeyName: "membership_events_workspace_member_id_fkey"
            columns: ["workspace_member_id"]
            isOneToOne: false
            referencedRelation: "workspace_members"
            referencedColumns: ["id"]
          },
        ]
      }
      notification_preferences: {
        Row: {
          approvals: boolean
          created_at: string
          publishing: boolean
          social_connections: boolean
          team_changes: boolean
          updated_at: string
          user_id: string
          workspace_invitations: boolean
        }
        Insert: {
          approvals?: boolean
          created_at?: string
          publishing?: boolean
          social_connections?: boolean
          team_changes?: boolean
          updated_at?: string
          user_id: string
          workspace_invitations?: boolean
        }
        Update: {
          approvals?: boolean
          created_at?: string
          publishing?: boolean
          social_connections?: boolean
          team_changes?: boolean
          updated_at?: string
          user_id?: string
          workspace_invitations?: boolean
        }
        Relationships: []
      }
      notifications: {
        Row: {
          action_path: string | null
          archived_at: string | null
          body: string | null
          created_at: string
          dedupe_key: string | null
          entity_id: string | null
          entity_type: string | null
          id: string
          metadata: Json
          notification_type: Database["public"]["Enums"]["notification_type"]
          read_at: string | null
          title: string
          user_id: string
          workspace_id: string | null
        }
        Insert: {
          action_path?: string | null
          archived_at?: string | null
          body?: string | null
          created_at?: string
          dedupe_key?: string | null
          entity_id?: string | null
          entity_type?: string | null
          id?: string
          metadata?: Json
          notification_type: Database["public"]["Enums"]["notification_type"]
          read_at?: string | null
          title: string
          user_id: string
          workspace_id?: string | null
        }
        Update: {
          action_path?: string | null
          archived_at?: string | null
          body?: string | null
          created_at?: string
          dedupe_key?: string | null
          entity_id?: string | null
          entity_type?: string | null
          id?: string
          metadata?: Json
          notification_type?: Database["public"]["Enums"]["notification_type"]
          read_at?: string | null
          title?: string
          user_id?: string
          workspace_id?: string | null
        }
        Relationships: [
          {
            foreignKeyName: "notifications_workspace_id_fkey"
            columns: ["workspace_id"]
            isOneToOne: false
            referencedRelation: "workspaces"
            referencedColumns: ["id"]
          },
        ]
      }
      post_destinations: {
        Row: {
          created_at: string
          id: string
          post_id: string
          post_platform_id: string
          social_account_id: string
          workspace_id: string
        }
        Insert: {
          created_at?: string
          id?: string
          post_id: string
          post_platform_id: string
          social_account_id: string
          workspace_id: string
        }
        Update: {
          created_at?: string
          id?: string
          post_id?: string
          post_platform_id?: string
          social_account_id?: string
          workspace_id?: string
        }
        Relationships: [
          {
            foreignKeyName: "post_destinations_account_workspace_fkey"
            columns: ["social_account_id", "workspace_id"]
            isOneToOne: false
            referencedRelation: "social_accounts"
            referencedColumns: ["id", "workspace_id"]
          },
          {
            foreignKeyName: "post_destinations_post_platform_id_fkey"
            columns: ["post_platform_id"]
            isOneToOne: false
            referencedRelation: "post_platforms"
            referencedColumns: ["id"]
          },
          {
            foreignKeyName: "post_destinations_post_workspace_fkey"
            columns: ["post_id", "workspace_id"]
            isOneToOne: false
            referencedRelation: "posts"
            referencedColumns: ["id", "workspace_id"]
          },
        ]
      }
      post_media: {
        Row: {
          created_at: string
          id: string
          media_asset_id: string
          post_id: string
          sort_order: number
          workspace_id: string
        }
        Insert: {
          created_at?: string
          id?: string
          media_asset_id: string
          post_id: string
          sort_order?: number
          workspace_id: string
        }
        Update: {
          created_at?: string
          id?: string
          media_asset_id?: string
          post_id?: string
          sort_order?: number
          workspace_id?: string
        }
        Relationships: [
          {
            foreignKeyName: "post_media_asset_workspace_fkey"
            columns: ["media_asset_id", "workspace_id"]
            isOneToOne: false
            referencedRelation: "media_assets"
            referencedColumns: ["id", "workspace_id"]
          },
          {
            foreignKeyName: "post_media_post_workspace_fkey"
            columns: ["post_id", "workspace_id"]
            isOneToOne: false
            referencedRelation: "posts"
            referencedColumns: ["id", "workspace_id"]
          },
        ]
      }
      post_platforms: {
        Row: {
          created_at: string
          id: string
          platform: Database["public"]["Enums"]["social_platform"]
          platform_caption: string | null
          platform_settings: Json
          platform_title: string | null
          post_id: string
          updated_at: string
          workspace_id: string
        }
        Insert: {
          created_at?: string
          id?: string
          platform: Database["public"]["Enums"]["social_platform"]
          platform_caption?: string | null
          platform_settings?: Json
          platform_title?: string | null
          post_id: string
          updated_at?: string
          workspace_id: string
        }
        Update: {
          created_at?: string
          id?: string
          platform?: Database["public"]["Enums"]["social_platform"]
          platform_caption?: string | null
          platform_settings?: Json
          platform_title?: string | null
          post_id?: string
          updated_at?: string
          workspace_id?: string
        }
        Relationships: [
          {
            foreignKeyName: "post_platforms_post_workspace_fkey"
            columns: ["post_id", "workspace_id"]
            isOneToOne: false
            referencedRelation: "posts"
            referencedColumns: ["id", "workspace_id"]
          },
        ]
      }
      posts: {
        Row: {
          approval_required: boolean
          assigned_to: string | null
          caption: string
          created_at: string
          created_by: string
          failure_message: string | null
          id: string
          published_at: string | null
          revision: number
          scheduled_at: string | null
          status: Database["public"]["Enums"]["post_status"]
          timezone: string
          updated_at: string
          workspace_id: string
        }
        Insert: {
          approval_required?: boolean
          assigned_to?: string | null
          caption?: string
          created_at?: string
          created_by: string
          failure_message?: string | null
          id?: string
          published_at?: string | null
          revision?: number
          scheduled_at?: string | null
          status?: Database["public"]["Enums"]["post_status"]
          timezone?: string
          updated_at?: string
          workspace_id: string
        }
        Update: {
          approval_required?: boolean
          assigned_to?: string | null
          caption?: string
          created_at?: string
          created_by?: string
          failure_message?: string | null
          id?: string
          published_at?: string | null
          revision?: number
          scheduled_at?: string | null
          status?: Database["public"]["Enums"]["post_status"]
          timezone?: string
          updated_at?: string
          workspace_id?: string
        }
        Relationships: [
          {
            foreignKeyName: "posts_workspace_id_fkey"
            columns: ["workspace_id"]
            isOneToOne: false
            referencedRelation: "workspaces"
            referencedColumns: ["id"]
          },
        ]
      }
      profiles: {
        Row: {
          avatar_url: string | null
          business_name: string | null
          country: string | null
          created_at: string
          full_name: string | null
          id: string
          phone: string | null
          timezone: string
          updated_at: string
        }
        Insert: {
          avatar_url?: string | null
          business_name?: string | null
          country?: string | null
          created_at?: string
          full_name?: string | null
          id: string
          phone?: string | null
          timezone?: string
          updated_at?: string
        }
        Update: {
          avatar_url?: string | null
          business_name?: string | null
          country?: string | null
          created_at?: string
          full_name?: string | null
          id?: string
          phone?: string | null
          timezone?: string
          updated_at?: string
        }
        Relationships: []
      }
      publishing_attempts: {
        Row: {
          ambiguous: boolean
          attempt_number: number
          created_at: string
          finished_at: string | null
          http_status: number | null
          id: string
          outcome: Database["public"]["Enums"]["publishing_attempt_outcome"]
          phase: string
          provider_error_code: string | null
          provider_request_id: string | null
          publishing_job_id: string
          retryable: boolean | null
          safe_error_message: string | null
          started_at: string
          workspace_id: string
        }
        Insert: {
          ambiguous?: boolean
          attempt_number: number
          created_at?: string
          finished_at?: string | null
          http_status?: number | null
          id?: string
          outcome: Database["public"]["Enums"]["publishing_attempt_outcome"]
          phase: string
          provider_error_code?: string | null
          provider_request_id?: string | null
          publishing_job_id: string
          retryable?: boolean | null
          safe_error_message?: string | null
          started_at?: string
          workspace_id: string
        }
        Update: {
          ambiguous?: boolean
          attempt_number?: number
          created_at?: string
          finished_at?: string | null
          http_status?: number | null
          id?: string
          outcome?: Database["public"]["Enums"]["publishing_attempt_outcome"]
          phase?: string
          provider_error_code?: string | null
          provider_request_id?: string | null
          publishing_job_id?: string
          retryable?: boolean | null
          safe_error_message?: string | null
          started_at?: string
          workspace_id?: string
        }
        Relationships: [
          {
            foreignKeyName: "publishing_attempts_job_workspace_fkey"
            columns: ["publishing_job_id", "workspace_id"]
            isOneToOne: false
            referencedRelation: "publishing_jobs"
            referencedColumns: ["id", "workspace_id"]
          },
          {
            foreignKeyName: "publishing_attempts_workspace_id_fkey"
            columns: ["workspace_id"]
            isOneToOne: false
            referencedRelation: "workspaces"
            referencedColumns: ["id"]
          },
        ]
      }
      publishing_jobs: {
        Row: {
          ambiguous_result: boolean
          attempt_count: number
          failure_count: number
          available_at: string
          completed_at: string | null
          created_at: string
          id: string
          max_attempts: number
          next_attempt_at: string | null
          operation: Database["public"]["Enums"]["publishing_operation"]
          payload_snapshot: Json
          platform: Database["public"]["Enums"]["social_platform"]
          post_destination_id: string
          post_id: string
          post_revision: number
          provider_container_id: string | null
          provider_permalink: string | null
          provider_post_id: string | null
          retryable: boolean | null
          safe_error_code: string | null
          safe_error_message: string | null
          scheduled_for: string
          social_account_id: string
          started_at: string | null
          status: Database["public"]["Enums"]["publishing_job_status"]
          updated_at: string
          workspace_id: string
        }
        Insert: {
          ambiguous_result?: boolean
          attempt_count?: number
          failure_count?: number
          available_at?: string
          completed_at?: string | null
          created_at?: string
          id?: string
          max_attempts?: number
          next_attempt_at?: string | null
          operation: Database["public"]["Enums"]["publishing_operation"]
          payload_snapshot: Json
          platform: Database["public"]["Enums"]["social_platform"]
          post_destination_id: string
          post_id: string
          post_revision: number
          provider_container_id?: string | null
          provider_permalink?: string | null
          provider_post_id?: string | null
          retryable?: boolean | null
          safe_error_code?: string | null
          safe_error_message?: string | null
          scheduled_for: string
          social_account_id: string
          started_at?: string | null
          status?: Database["public"]["Enums"]["publishing_job_status"]
          updated_at?: string
          workspace_id: string
        }
        Update: {
          ambiguous_result?: boolean
          attempt_count?: number
          failure_count?: number
          available_at?: string
          completed_at?: string | null
          created_at?: string
          id?: string
          max_attempts?: number
          next_attempt_at?: string | null
          operation?: Database["public"]["Enums"]["publishing_operation"]
          payload_snapshot?: Json
          platform?: Database["public"]["Enums"]["social_platform"]
          post_destination_id?: string
          post_id?: string
          post_revision?: number
          provider_container_id?: string | null
          provider_permalink?: string | null
          provider_post_id?: string | null
          retryable?: boolean | null
          safe_error_code?: string | null
          safe_error_message?: string | null
          scheduled_for?: string
          social_account_id?: string
          started_at?: string | null
          status?: Database["public"]["Enums"]["publishing_job_status"]
          updated_at?: string
          workspace_id?: string
        }
        Relationships: [
          {
            foreignKeyName: "publishing_jobs_account_workspace_fkey"
            columns: ["social_account_id", "workspace_id"]
            isOneToOne: false
            referencedRelation: "social_accounts"
            referencedColumns: ["id", "workspace_id"]
          },
          {
            foreignKeyName: "publishing_jobs_destination_workspace_fkey"
            columns: ["post_destination_id", "workspace_id"]
            isOneToOne: false
            referencedRelation: "post_destinations"
            referencedColumns: ["id", "workspace_id"]
          },
          {
            foreignKeyName: "publishing_jobs_post_workspace_fkey"
            columns: ["post_id", "workspace_id"]
            isOneToOne: false
            referencedRelation: "posts"
            referencedColumns: ["id", "workspace_id"]
          },
          {
            foreignKeyName: "publishing_jobs_workspace_id_fkey"
            columns: ["workspace_id"]
            isOneToOne: false
            referencedRelation: "workspaces"
            referencedColumns: ["id"]
          },
        ]
      }
      social_accounts: {
        Row: {
          account_name: string
          account_type: Database["public"]["Enums"]["social_account_type"]
          connected_at: string | null
          connected_by: string
          connection_status: Database["public"]["Enums"]["social_connection_status"]
          created_at: string
          disconnected_at: string | null
          granted_scopes: string[]
          id: string
          last_error_code: string | null
          last_error_message: string | null
          last_refreshed_at: string | null
          metadata: Json
          parent_platform_account_id: string | null
          platform: Database["public"]["Enums"]["social_platform"]
          platform_account_id: string
          profile_image_url: string | null
          token_expires_at: string | null
          updated_at: string
          username: string | null
          workspace_id: string
        }
        Insert: {
          account_name: string
          account_type: Database["public"]["Enums"]["social_account_type"]
          connected_at?: string | null
          connected_by: string
          connection_status?: Database["public"]["Enums"]["social_connection_status"]
          created_at?: string
          disconnected_at?: string | null
          granted_scopes?: string[]
          id?: string
          last_error_code?: string | null
          last_error_message?: string | null
          last_refreshed_at?: string | null
          metadata?: Json
          parent_platform_account_id?: string | null
          platform: Database["public"]["Enums"]["social_platform"]
          platform_account_id: string
          profile_image_url?: string | null
          token_expires_at?: string | null
          updated_at?: string
          username?: string | null
          workspace_id: string
        }
        Update: {
          account_name?: string
          account_type?: Database["public"]["Enums"]["social_account_type"]
          connected_at?: string | null
          connected_by?: string
          connection_status?: Database["public"]["Enums"]["social_connection_status"]
          created_at?: string
          disconnected_at?: string | null
          granted_scopes?: string[]
          id?: string
          last_error_code?: string | null
          last_error_message?: string | null
          last_refreshed_at?: string | null
          metadata?: Json
          parent_platform_account_id?: string | null
          platform?: Database["public"]["Enums"]["social_platform"]
          platform_account_id?: string
          profile_image_url?: string | null
          token_expires_at?: string | null
          updated_at?: string
          username?: string | null
          workspace_id?: string
        }
        Relationships: [
          {
            foreignKeyName: "social_accounts_workspace_id_fkey"
            columns: ["workspace_id"]
            isOneToOne: false
            referencedRelation: "workspaces"
            referencedColumns: ["id"]
          },
        ]
      }
      workspace_invitations: {
        Row: {
          accepted_at: string | null
          accepted_by: string | null
          created_at: string
          declined_at: string | null
          email: string
          expires_at: string
          id: string
          invited_by: string
          invited_user_id: string | null
          last_sent_at: string | null
          message: string | null
          resend_count: number
          revoked_at: string | null
          role: Database["public"]["Enums"]["workspace_role"]
          sent_at: string | null
          status: Database["public"]["Enums"]["workspace_invitation_status"]
          token_hash: string
          updated_at: string
          workspace_id: string
        }
        Insert: {
          accepted_at?: string | null
          accepted_by?: string | null
          created_at?: string
          declined_at?: string | null
          email: string
          expires_at: string
          id?: string
          invited_by: string
          invited_user_id?: string | null
          last_sent_at?: string | null
          message?: string | null
          resend_count?: number
          revoked_at?: string | null
          role: Database["public"]["Enums"]["workspace_role"]
          sent_at?: string | null
          status?: Database["public"]["Enums"]["workspace_invitation_status"]
          token_hash: string
          updated_at?: string
          workspace_id: string
        }
        Update: {
          accepted_at?: string | null
          accepted_by?: string | null
          created_at?: string
          declined_at?: string | null
          email?: string
          expires_at?: string
          id?: string
          invited_by?: string
          invited_user_id?: string | null
          last_sent_at?: string | null
          message?: string | null
          resend_count?: number
          revoked_at?: string | null
          role?: Database["public"]["Enums"]["workspace_role"]
          sent_at?: string | null
          status?: Database["public"]["Enums"]["workspace_invitation_status"]
          token_hash?: string
          updated_at?: string
          workspace_id?: string
        }
        Relationships: [
          {
            foreignKeyName: "workspace_invitations_workspace_id_fkey"
            columns: ["workspace_id"]
            isOneToOne: false
            referencedRelation: "workspaces"
            referencedColumns: ["id"]
          },
        ]
      }
      workspace_members: {
        Row: {
          created_at: string
          id: string
          invited_by: string | null
          joined_at: string | null
          role: Database["public"]["Enums"]["workspace_role"]
          status: Database["public"]["Enums"]["membership_status"]
          updated_at: string
          user_id: string
          workspace_id: string
        }
        Insert: {
          created_at?: string
          id?: string
          invited_by?: string | null
          joined_at?: string | null
          role: Database["public"]["Enums"]["workspace_role"]
          status?: Database["public"]["Enums"]["membership_status"]
          updated_at?: string
          user_id: string
          workspace_id: string
        }
        Update: {
          created_at?: string
          id?: string
          invited_by?: string | null
          joined_at?: string | null
          role?: Database["public"]["Enums"]["workspace_role"]
          status?: Database["public"]["Enums"]["membership_status"]
          updated_at?: string
          user_id?: string
          workspace_id?: string
        }
        Relationships: [
          {
            foreignKeyName: "workspace_members_workspace_id_fkey"
            columns: ["workspace_id"]
            isOneToOne: false
            referencedRelation: "workspaces"
            referencedColumns: ["id"]
          },
        ]
      }
      workspaces: {
        Row: {
          country: string | null
          created_at: string
          created_by: string | null
          default_language: string
          id: string
          industry: string | null
          logo_url: string | null
          name: string
          slug: string
          timezone: string
          updated_at: string
        }
        Insert: {
          country?: string | null
          created_at?: string
          created_by?: string | null
          default_language?: string
          id?: string
          industry?: string | null
          logo_url?: string | null
          name: string
          slug: string
          timezone?: string
          updated_at?: string
        }
        Update: {
          country?: string | null
          created_at?: string
          created_by?: string | null
          default_language?: string
          id?: string
          industry?: string | null
          logo_url?: string | null
          name?: string
          slug?: string
          timezone?: string
          updated_at?: string
        }
        Relationships: []
      }
    }
    Views: {
      [_ in never]: never
    }
    Functions: {
      accept_workspace_invitation: {
        Args: { p_invitation_id: string; p_token?: string }
        Returns: Json
      }
      add_approval_comment: {
        Args: { p_approval_request_id: string; p_body: string }
        Returns: {
          approval_request_id: string
          author_id: string
          body: string
          comment_type: Database["public"]["Enums"]["approval_comment_type"]
          created_at: string
          id: string
          workspace_id: string
        }
        SetofOptions: {
          from: "*"
          to: "approval_comments"
          isOneToOne: true
          isSetofReturn: false
        }
      }
      approve_post: {
        Args: { p_approval_request_id: string; p_message?: string }
        Returns: Json
      }
      archive_notification: {
        Args: { p_notification_id: string }
        Returns: number
      }
      begin_meta_oauth: {
        Args: {
          p_initiated_by: string
          p_return_path: string
          p_state_hash: string
          p_workspace_id: string
        }
        Returns: Json
      }
      begin_youtube_oauth: {
        Args: {
          p_initiated_by: string
          p_return_path: string
          p_state_hash: string
          p_workspace_id: string
        }
        Returns: Json
      }
      cancel_post_publication: { Args: { p_post_id: string }; Returns: Json }
      change_approval_deadline: {
        Args: {
          p_approval_request_id: string
          p_due_at: string
          p_message?: string
        }
        Returns: Json
      }
      claim_publishing_queue_batch: {
        Args: { p_batch_size?: number; p_visibility_seconds?: number }
        Returns: Json
      }
      clear_tiktok_submission_start: {
        Args: { p_publishing_job_id: string }
        Returns: undefined
      }
      complete_meta_connections: {
        Args: {
          p_connections: Json
          p_initiated_by: string
          p_session_id: string
        }
        Returns: Json
      }
      complete_youtube_upload: {
        Args: { p_provider_video_id: string; p_publishing_job_id: string }
        Returns: undefined
      }
      consume_meta_oauth_state: {
        Args: { p_state_hash: string }
        Returns: Json
      }
      consume_youtube_oauth_state: {
        Args: { p_state_hash: string }
        Returns: Json
      }
      create_meta_connection_session: {
        Args: {
          p_discovered_accounts: Json
          p_encrypted_user_token: string
          p_granted_scopes: string[]
          p_initiated_by: string
          p_token_expires_at: string
          p_user_token_iv: string
          p_workspace_id: string
        }
        Returns: Json
      }
      create_post: {
        Args: {
          p_approval_required: boolean
          p_assigned_to: string
          p_caption: string
          p_destination_account_ids: string[]
          p_media_asset_ids: string[]
          p_platforms: Json
          p_scheduled_at: string
          p_status: Database["public"]["Enums"]["post_status"]
          p_timezone: string
          p_workspace_id: string
        }
        Returns: {
          approval_required: boolean
          assigned_to: string | null
          caption: string
          created_at: string
          created_by: string
          failure_message: string | null
          id: string
          published_at: string | null
          revision: number
          scheduled_at: string | null
          status: Database["public"]["Enums"]["post_status"]
          timezone: string
          updated_at: string
          workspace_id: string
        }
        SetofOptions: {
          from: "*"
          to: "posts"
          isOneToOne: true
          isSetofReturn: false
        }
      }
      create_workspace: { Args: { workspace_name: string }; Returns: string }
      create_workspace_invitation: {
        Args: {
          p_email: string
          p_expires_at?: string
          p_invited_by: string
          p_invited_user_id: string
          p_message?: string
          p_role: Database["public"]["Enums"]["workspace_role"]
          p_token_hash: string
          p_workspace_id: string
        }
        Returns: Json
      }
      decline_workspace_invitation: {
        Args: { p_invitation_id: string; p_token?: string }
        Returns: Json
      }
      delete_post: { Args: { p_post_id: string }; Returns: string }
      delete_posts: { Args: { p_post_ids: string[] }; Returns: string[] }
      disconnect_social_account: {
        Args: {
          p_actor_id: string
          p_social_account_id: string
          p_warning_code: string
        }
        Returns: Json
      }
      duplicate_post: { Args: { p_post_id: string }; Returns: string }
      finish_publishing_step: {
        Args: {
          p_attempt_number: number
          p_message_id: number
          p_publishing_job_id: string
          p_result: Json
        }
        Returns: Json
      }
      get_meta_connection_session: {
        Args: { p_initiated_by: string; p_session_id: string }
        Returns: Json
      }
      get_operational_analytics: {
        Args: {
          p_end_at: string
          p_platform?: Database["public"]["Enums"]["social_platform"]
          p_start_at: string
          p_timezone?: string
          p_workspace_id: string
        }
        Returns: Json
      }
      get_social_account_credential: {
        Args: { p_actor_id: string; p_social_account_id: string }
        Returns: Json
      }
      get_tiktok_creator_credential: {
        Args: {
          p_actor_id: string
          p_social_account_id: string
          p_workspace_id: string
        }
        Returns: Json
      }
      get_workspace_invitation_details: {
        Args: { p_invitation_id: string; p_token?: string }
        Returns: Json
      }
      leave_workspace: { Args: { p_workspace_id: string }; Returns: Json }
      list_eligible_workspace_roles: {
        Args: { p_workspace_id: string }
        Returns: Database["public"]["Enums"]["workspace_role"][]
      }
      list_workspace_invitations: {
        Args: { p_workspace_id: string }
        Returns: {
          created_at: string
          email: string
          expires_at: string
          id: string
          invited_by: string
          invited_user_id: string
          inviter_name: string
          last_sent_at: string
          message: string
          resend_count: number
          role: Database["public"]["Enums"]["workspace_role"]
          sent_at: string
          status: Database["public"]["Enums"]["workspace_invitation_status"]
          updated_at: string
          workspace_id: string
        }[]
      }
      mark_all_notifications_read: {
        Args: { p_workspace_id?: string }
        Returns: number
      }
      mark_notification_read: {
        Args: { p_notification_id: string }
        Returns: number
      }
      mark_notifications_read: {
        Args: { p_notification_ids: string[] }
        Returns: number
      }
      record_tiktok_publish_status: {
        Args: {
          p_fail_reason: string | null
          p_provider_status: string
          p_publishing_job_id: string
        }
        Returns: undefined
      }
      mark_publishing_account_unusable: {
        Args: {
          p_error_code: string
          p_social_account_id: string
          p_status: Database["public"]["Enums"]["social_connection_status"]
        }
        Returns: undefined
      }
      mark_workspace_invitation_sent: {
        Args: { p_actor_id: string; p_invitation_id: string }
        Returns: undefined
      }
      prepare_workspace_invitation_resend: {
        Args: {
          p_actor_id: string
          p_expires_at: string
          p_invitation_id: string
          p_invited_user_id: string
          p_token_hash: string
        }
        Returns: Json
      }
      reactivate_workspace_member: {
        Args: {
          p_member_id: string
          p_message?: string
          p_role?: Database["public"]["Enums"]["workspace_role"]
        }
        Returns: Json
      }
      reassign_approval_request: {
        Args: {
          p_approval_request_id: string
          p_message?: string
          p_new_approver_id: string
        }
        Returns: Json
      }
      reject_post: {
        Args: { p_approval_request_id: string; p_message: string }
        Returns: Json
      }
      remove_workspace_member: {
        Args: { p_member_id: string; p_message?: string }
        Returns: Json
      }
      request_post_changes: {
        Args: { p_approval_request_id: string; p_message: string }
        Returns: Json
      }
      request_publish_now: {
        Args: { p_expected_revision: number; p_post_id: string }
        Returns: Json
      }
      retry_publishing_job: {
        Args: { p_publishing_job_id: string }
        Returns: Json
      }
      revoke_workspace_invitation: {
        Args: { p_invitation_id: string; p_message?: string }
        Returns: Json
      }
      start_tiktok_publish_submission: {
        Args: { p_publishing_job_id: string }
        Returns: undefined
      }
      store_tiktok_publish_id: {
        Args: { p_publish_id: string; p_publishing_job_id: string }
        Returns: undefined
      }
      store_youtube_upload_session: {
        Args: { p_publishing_job_id: string; p_session_url: string }
        Returns: undefined
      }
      submit_post_for_approval: {
        Args: {
          p_assigned_approver_id: string
          p_due_at?: string
          p_expected_revision: number
          p_post_id: string
          p_submission_message?: string
        }
        Returns: Json
      }
      suspend_workspace_member: {
        Args: { p_member_id: string; p_message?: string }
        Returns: Json
      }
      transfer_workspace_ownership: {
        Args: {
          p_current_owner_new_role?: Database["public"]["Enums"]["workspace_role"]
          p_message?: string
          p_new_owner_member_id: string
          p_workspace_id: string
        }
        Returns: Json
      }
      unarchive_notification: {
        Args: { p_notification_id: string }
        Returns: number
      }
      update_post: {
        Args: {
          p_approval_required: boolean
          p_assigned_to: string
          p_caption: string
          p_destination_account_ids: string[]
          p_expected_revision: number
          p_media_asset_ids: string[]
          p_platforms: Json
          p_post_id: string
          p_scheduled_at: string
          p_status: Database["public"]["Enums"]["post_status"]
          p_timezone: string
        }
        Returns: {
          approval_required: boolean
          assigned_to: string | null
          caption: string
          created_at: string
          created_by: string
          failure_message: string | null
          id: string
          published_at: string | null
          revision: number
          scheduled_at: string | null
          status: Database["public"]["Enums"]["post_status"]
          timezone: string
          updated_at: string
          workspace_id: string
        }
        SetofOptions: {
          from: "*"
          to: "posts"
          isOneToOne: true
          isSetofReturn: false
        }
      }
      update_social_account_refresh: {
        Args: {
          p_account_name: string
          p_actor_id: string
          p_connection_status: Database["public"]["Enums"]["social_connection_status"]
          p_error_code: string
          p_error_message: string
          p_profile_image_url: string
          p_social_account_id: string
          p_token_expires_at: string
          p_username: string
        }
        Returns: Json
      }
      update_tiktok_publishing_credential: {
        Args: {
          p_access_token_iv: string
          p_encrypted_access_token: string
          p_encrypted_refresh_token: string
          p_granted_scopes: string[]
          p_refresh_token_expires_at: string
          p_refresh_token_iv: string
          p_social_account_id: string
          p_token_expires_at: string
          p_token_type: string
        }
        Returns: undefined
      }
      update_workspace_member_role: {
        Args: {
          p_member_id: string
          p_message?: string
          p_new_role: Database["public"]["Enums"]["workspace_role"]
        }
        Returns: Json
      }
      update_youtube_connection_refresh: {
        Args: {
          p_access_token_iv: string
          p_account_name: string
          p_actor_id: string
          p_encrypted_access_token: string
          p_encrypted_refresh_token: string
          p_granted_scopes: string[]
          p_profile_image_url: string
          p_refresh_token_iv: string
          p_social_account_id: string
          p_token_expires_at: string
          p_token_type: string
          p_username: string
        }
        Returns: Json
      }
      update_youtube_publishing_credential: {
        Args: {
          p_access_token_iv: string
          p_encrypted_access_token: string
          p_encrypted_refresh_token: string
          p_granted_scopes: string[]
          p_refresh_token_iv: string
          p_social_account_id: string
          p_token_expires_at: string
          p_token_type: string
        }
        Returns: undefined
      }
      upsert_linked_instagram_connection: {
        Args: {
          p_actor_id: string
          p_connection: Json
          p_parent_social_account_id: string
        }
        Returns: Json
      }
      upsert_youtube_connection: {
        Args: { p_actor_id: string; p_connection: Json; p_workspace_id: string }
        Returns: Json
      }
      withdraw_approval_request: {
        Args: { p_approval_request_id: string; p_message?: string }
        Returns: Json
      }
    }
    Enums: {
      approval_comment_type:
        | "comment"
        | "change_instruction"
        | "rejection_reason"
        | "system"
      approval_event_type:
        | "submitted"
        | "assigned"
        | "reassigned"
        | "approved"
        | "changes_requested"
        | "rejected"
        | "withdrawn"
        | "superseded"
        | "comment_added"
        | "deadline_changed"
      approval_request_status:
        | "pending"
        | "approved"
        | "changes_requested"
        | "rejected"
        | "withdrawn"
        | "superseded"
        | "cancelled"
      media_type: "image" | "video" | "graphic" | "logo" | "document"
      membership_event_type:
        | "invited"
        | "invitation_resent"
        | "invitation_accepted"
        | "invitation_declined"
        | "invitation_revoked"
        | "member_added"
        | "role_changed"
        | "member_suspended"
        | "member_reactivated"
        | "member_removed"
        | "member_left"
        | "ownership_transferred"
      membership_status: "invited" | "active" | "suspended"
      notification_type:
        | "workspace_invitation"
        | "invitation_accepted"
        | "invitation_declined"
        | "invitation_revoked"
        | "role_changed"
        | "member_suspended"
        | "member_reactivated"
        | "member_removed"
        | "ownership_transferred"
        | "approval_submitted"
        | "approval_assigned"
        | "approval_reassigned"
        | "approval_approved"
        | "approval_changes_requested"
        | "approval_rejected"
        | "approval_comment"
        | "publishing_succeeded"
        | "publishing_failed"
        | "publishing_reconciliation_required"
        | "social_account_reconnect_required"
        | "system"
      post_status:
        | "draft"
        | "pending_approval"
        | "approved"
        | "scheduled"
        | "publishing"
        | "published"
        | "failed"
        | "cancelled"
      publishing_attempt_outcome:
        | "started"
        | "succeeded"
        | "transient_failure"
        | "permanent_failure"
        | "ambiguous"
        | "cancelled"
      publishing_job_status:
        | "queued"
        | "processing"
        | "waiting_provider"
        | "retry_wait"
        | "succeeded"
        | "failed"
        | "cancelled"
        | "reconciliation_required"
      publishing_operation:
        | "facebook_text"
        | "facebook_image"
        | "facebook_reel"
        | "instagram_image"
        | "instagram_reel"
        | "youtube_video"
        | "tiktok_video"
      social_account_type:
        | "facebook_page"
        | "instagram_business"
        | "instagram_creator"
        | "youtube_channel"
        | "tiktok_user"
      social_connection_status:
        | "pending"
        | "connected"
        | "reconnect_required"
        | "expired"
        | "disconnected"
        | "error"
      social_platform:
        | "facebook"
        | "instagram"
        | "linkedin"
        | "tiktok"
        | "youtube"
        | "x"
      workspace_invitation_status:
        | "pending"
        | "accepted"
        | "declined"
        | "revoked"
        | "expired"
      workspace_role:
        | "owner"
        | "administrator"
        | "content_manager"
        | "designer"
        | "approver"
        | "viewer"
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
    Enums: {
      approval_comment_type: [
        "comment",
        "change_instruction",
        "rejection_reason",
        "system",
      ],
      approval_event_type: [
        "submitted",
        "assigned",
        "reassigned",
        "approved",
        "changes_requested",
        "rejected",
        "withdrawn",
        "superseded",
        "comment_added",
        "deadline_changed",
      ],
      approval_request_status: [
        "pending",
        "approved",
        "changes_requested",
        "rejected",
        "withdrawn",
        "superseded",
        "cancelled",
      ],
      media_type: ["image", "video", "graphic", "logo", "document"],
      membership_event_type: [
        "invited",
        "invitation_resent",
        "invitation_accepted",
        "invitation_declined",
        "invitation_revoked",
        "member_added",
        "role_changed",
        "member_suspended",
        "member_reactivated",
        "member_removed",
        "member_left",
        "ownership_transferred",
      ],
      membership_status: ["invited", "active", "suspended"],
      notification_type: [
        "workspace_invitation",
        "invitation_accepted",
        "invitation_declined",
        "invitation_revoked",
        "role_changed",
        "member_suspended",
        "member_reactivated",
        "member_removed",
        "ownership_transferred",
        "approval_submitted",
        "approval_assigned",
        "approval_reassigned",
        "approval_approved",
        "approval_changes_requested",
        "approval_rejected",
        "approval_comment",
        "publishing_succeeded",
        "publishing_failed",
        "publishing_reconciliation_required",
        "social_account_reconnect_required",
        "system",
      ],
      post_status: [
        "draft",
        "pending_approval",
        "approved",
        "scheduled",
        "publishing",
        "published",
        "failed",
        "cancelled",
      ],
      publishing_attempt_outcome: [
        "started",
        "succeeded",
        "transient_failure",
        "permanent_failure",
        "ambiguous",
        "cancelled",
      ],
      publishing_job_status: [
        "queued",
        "processing",
        "waiting_provider",
        "retry_wait",
        "succeeded",
        "failed",
        "cancelled",
        "reconciliation_required",
      ],
      publishing_operation: [
        "facebook_text",
        "facebook_image",
        "facebook_reel",
        "instagram_image",
        "instagram_reel",
        "youtube_video",
        "tiktok_video",
      ],
      social_account_type: [
        "facebook_page",
        "instagram_business",
        "instagram_creator",
        "youtube_channel",
        "tiktok_user",
      ],
      social_connection_status: [
        "pending",
        "connected",
        "reconnect_required",
        "expired",
        "disconnected",
        "error",
      ],
      social_platform: [
        "facebook",
        "instagram",
        "linkedin",
        "tiktok",
        "youtube",
        "x",
      ],
      workspace_invitation_status: [
        "pending",
        "accepted",
        "declined",
        "revoked",
        "expired",
      ],
      workspace_role: [
        "owner",
        "administrator",
        "content_manager",
        "designer",
        "approver",
        "viewer",
      ],
    },
  },
} as const
