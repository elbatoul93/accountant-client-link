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
    PostgrestVersion: "14.5"
  }
  public: {
    Tables: {
      acc_declarations: {
        Row: {
          accountant_id: string
          amount: number
          client_name: string
          client_ref: string
          created_at: string
          decl_type: string
          due_date: string | null
          id: string
          status: string
          updated_at: string
        }
        Insert: {
          accountant_id: string
          amount?: number
          client_name: string
          client_ref: string
          created_at?: string
          decl_type: string
          due_date?: string | null
          id?: string
          status?: string
          updated_at?: string
        }
        Update: {
          accountant_id?: string
          amount?: number
          client_name?: string
          client_ref?: string
          created_at?: string
          decl_type?: string
          due_date?: string | null
          id?: string
          status?: string
          updated_at?: string
        }
        Relationships: []
      }
      acc_financial_statements: {
        Row: {
          accountant_id: string
          assets: number
          client_name: string
          client_ref: string
          created_at: string
          equity: number
          fiscal_year: string
          id: string
          liabilities: number
          net_result: number
          revenue: number
          updated_at: string
        }
        Insert: {
          accountant_id: string
          assets?: number
          client_name: string
          client_ref: string
          created_at?: string
          equity?: number
          fiscal_year: string
          id?: string
          liabilities?: number
          net_result?: number
          revenue?: number
          updated_at?: string
        }
        Update: {
          accountant_id?: string
          assets?: number
          client_name?: string
          client_ref?: string
          created_at?: string
          equity?: number
          fiscal_year?: string
          id?: string
          liabilities?: number
          net_result?: number
          revenue?: number
          updated_at?: string
        }
        Relationships: []
      }
      acc_invoices: {
        Row: {
          accountant_id: string
          amount: number
          client_name: string
          client_ref: string
          created_at: string
          id: string
          invoice_date: string
          status: string
          updated_at: string
        }
        Insert: {
          accountant_id: string
          amount?: number
          client_name: string
          client_ref: string
          created_at?: string
          id?: string
          invoice_date?: string
          status?: string
          updated_at?: string
        }
        Update: {
          accountant_id?: string
          amount?: number
          client_name?: string
          client_ref?: string
          created_at?: string
          id?: string
          invoice_date?: string
          status?: string
          updated_at?: string
        }
        Relationships: []
      }
      acc_legal_documents: {
        Row: {
          accountant_id: string
          client_ref: string
          created_at: string
          doc_date: string | null
          file_name: string | null
          file_path: string | null
          id: string
          kind: string
          label: string
          mime_type: string | null
          updated_at: string
        }
        Insert: {
          accountant_id: string
          client_ref: string
          created_at?: string
          doc_date?: string | null
          file_name?: string | null
          file_path?: string | null
          id?: string
          kind: string
          label: string
          mime_type?: string | null
          updated_at?: string
        }
        Update: {
          accountant_id?: string
          client_ref?: string
          created_at?: string
          doc_date?: string | null
          file_name?: string | null
          file_path?: string | null
          id?: string
          kind?: string
          label?: string
          mime_type?: string | null
          updated_at?: string
        }
        Relationships: []
      }
      acc_shared_documents: {
        Row: {
          accountant_id: string
          client_email: string | null
          client_name: string
          client_ref: string
          client_user_id: string | null
          created_at: string
          doc_date: string | null
          doc_type: string
          file_name: string | null
          file_path: string | null
          id: string
          label: string
          mime_type: string | null
          payload: string | null
          signature_data_url: string | null
          signed_at: string | null
          signed_by: string | null
          updated_at: string
          workflow: Json | null
        }
        Insert: {
          accountant_id: string
          client_email?: string | null
          client_name: string
          client_ref: string
          client_user_id?: string | null
          created_at?: string
          doc_date?: string | null
          doc_type: string
          file_name?: string | null
          file_path?: string | null
          id?: string
          label: string
          mime_type?: string | null
          payload?: string | null
          signature_data_url?: string | null
          signed_at?: string | null
          signed_by?: string | null
          updated_at?: string
          workflow?: Json | null
        }
        Update: {
          accountant_id?: string
          client_email?: string | null
          client_name?: string
          client_ref?: string
          client_user_id?: string | null
          created_at?: string
          doc_date?: string | null
          doc_type?: string
          file_name?: string | null
          file_path?: string | null
          id?: string
          label?: string
          mime_type?: string | null
          payload?: string | null
          signature_data_url?: string | null
          signed_at?: string | null
          signed_by?: string | null
          updated_at?: string
          workflow?: Json | null
        }
        Relationships: []
      }
      documents: {
        Row: {
          created_at: string
          description: string | null
          file_name: string
          file_path: string
          id: string
          mime_type: string | null
          size: number | null
          title: string
          updated_at: string
          user_id: string
        }
        Insert: {
          created_at?: string
          description?: string | null
          file_name: string
          file_path: string
          id?: string
          mime_type?: string | null
          size?: number | null
          title?: string
          updated_at?: string
          user_id: string
        }
        Update: {
          created_at?: string
          description?: string | null
          file_name?: string
          file_path?: string
          id?: string
          mime_type?: string | null
          size?: number | null
          title?: string
          updated_at?: string
          user_id?: string
        }
        Relationships: []
      }
      invitations: {
        Row: {
          accountant_id: string
          created_at: string
          email: string | null
          expires_at: string
          id: string
          is_used: boolean
          prefill_bp: string | null
          prefill_commune: string | null
          prefill_company: string | null
          prefill_direction: string | null
          prefill_name: string | null
          token: string
          used: boolean
          used_at: string | null
          used_by: string | null
        }
        Insert: {
          accountant_id: string
          created_at?: string
          email?: string | null
          expires_at?: string
          id?: string
          is_used?: boolean
          prefill_bp?: string | null
          prefill_commune?: string | null
          prefill_company?: string | null
          prefill_direction?: string | null
          prefill_name?: string | null
          token: string
          used?: boolean
          used_at?: string | null
          used_by?: string | null
        }
        Update: {
          accountant_id?: string
          created_at?: string
          email?: string | null
          expires_at?: string
          id?: string
          is_used?: boolean
          prefill_bp?: string | null
          prefill_commune?: string | null
          prefill_company?: string | null
          prefill_direction?: string | null
          prefill_name?: string | null
          token?: string
          used?: boolean
          used_at?: string | null
          used_by?: string | null
        }
        Relationships: []
      }
      messages: {
        Row: {
          content: string
          created_at: string
          id: string
          is_read: boolean
          receiver_id: string
          sender_id: string
        }
        Insert: {
          content: string
          created_at?: string
          id?: string
          is_read?: boolean
          receiver_id: string
          sender_id: string
        }
        Update: {
          content?: string
          created_at?: string
          id?: string
          is_read?: boolean
          receiver_id?: string
          sender_id?: string
        }
        Relationships: []
      }
      profiles: {
        Row: {
          activity: string | null
          address: string | null
          bp: string | null
          casnos_no: string | null
          cnas_no: string | null
          commune: string | null
          company: string | null
          created_at: string
          direction: string | null
          email: string
          has_cacobatph: boolean
          id: string
          legal_form: string | null
          linked_accountant_id: string | null
          name: string
          nis: string | null
          phone: string | null
          rc: string | null
          tax_id: string | null
          tax_regime: string | null
          updated_at: string
          user_id: string
          user_type: Database["public"]["Enums"]["app_role"]
        }
        Insert: {
          activity?: string | null
          address?: string | null
          bp?: string | null
          casnos_no?: string | null
          cnas_no?: string | null
          commune?: string | null
          company?: string | null
          created_at?: string
          direction?: string | null
          email?: string
          has_cacobatph?: boolean
          id?: string
          legal_form?: string | null
          linked_accountant_id?: string | null
          name?: string
          nis?: string | null
          phone?: string | null
          rc?: string | null
          tax_id?: string | null
          tax_regime?: string | null
          updated_at?: string
          user_id: string
          user_type?: Database["public"]["Enums"]["app_role"]
        }
        Update: {
          activity?: string | null
          address?: string | null
          bp?: string | null
          casnos_no?: string | null
          cnas_no?: string | null
          commune?: string | null
          company?: string | null
          created_at?: string
          direction?: string | null
          email?: string
          has_cacobatph?: boolean
          id?: string
          legal_form?: string | null
          linked_accountant_id?: string | null
          name?: string
          nis?: string | null
          phone?: string | null
          rc?: string | null
          tax_id?: string | null
          tax_regime?: string | null
          updated_at?: string
          user_id?: string
          user_type?: Database["public"]["Enums"]["app_role"]
        }
        Relationships: []
      }
      user_roles: {
        Row: {
          created_at: string
          id: string
          role: Database["public"]["Enums"]["app_role"]
          user_id: string
        }
        Insert: {
          created_at?: string
          id?: string
          role: Database["public"]["Enums"]["app_role"]
          user_id: string
        }
        Update: {
          created_at?: string
          id?: string
          role?: Database["public"]["Enums"]["app_role"]
          user_id?: string
        }
        Relationships: []
      }
    }
    Views: {
      [_ in never]: never
    }
    Functions: {
      get_linked_client_names: {
        Args: never
        Returns: {
          activity: string
          address: string
          bp: string
          casnos_no: string
          cnas_no: string
          commune: string
          company: string
          direction: string
          email: string
          full_name: string
          has_cacobatph: boolean
          id: string
          legal_form: string
          nis: string
          phone: string
          rc: string
          tax_id: string
          tax_regime: string
        }[]
      }
      get_user_type: { Args: { user_id: string }; Returns: string }
      has_role: {
        Args: {
          _role: Database["public"]["Enums"]["app_role"]
          _user_id: string
        }
        Returns: boolean
      }
      is_linked_accountant: {
        Args: { client_user_id: string }
        Returns: boolean
      }
      is_linked_accountant_by_folder: {
        Args: { folder_user_id: string }
        Returns: boolean
      }
    }
    Enums: {
      app_role: "accountant" | "client"
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
      app_role: ["accountant", "client"],
    },
  },
} as const
