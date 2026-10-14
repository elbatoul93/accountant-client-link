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
      acc_assets: {
        Row: {
          accountant_id: string
          acquired_at: string
          category: string
          client_ref: string | null
          cost: number
          created_at: string
          id: string
          label: string
          rate_override: number | null
          updated_at: string
        }
        Insert: {
          accountant_id: string
          acquired_at: string
          category: string
          client_ref?: string | null
          cost: number
          created_at?: string
          id?: string
          label: string
          rate_override?: number | null
          updated_at?: string
        }
        Update: {
          accountant_id?: string
          acquired_at?: string
          category?: string
          client_ref?: string | null
          cost?: number
          created_at?: string
          id?: string
          label?: string
          rate_override?: number | null
          updated_at?: string
        }
        Relationships: []
      }
      acc_bills: {
        Row: {
          account: string | null
          accountant_id: string
          bill_date: string
          client_ref: string | null
          created_at: string
          ht: number
          id: string
          kind: string
          number: string
          party: string
          party_tax_id: string | null
          posted_batch: string | null
          ttc: number
          tva: number
          tva_rate: number
          updated_at: string
        }
        Insert: {
          account?: string | null
          accountant_id: string
          bill_date: string
          client_ref?: string | null
          created_at?: string
          ht?: number
          id?: string
          kind: string
          number: string
          party: string
          party_tax_id?: string | null
          posted_batch?: string | null
          ttc?: number
          tva?: number
          tva_rate?: number
          updated_at?: string
        }
        Update: {
          account?: string | null
          accountant_id?: string
          bill_date?: string
          client_ref?: string | null
          created_at?: string
          ht?: number
          id?: string
          kind?: string
          number?: string
          party?: string
          party_tax_id?: string | null
          posted_batch?: string | null
          ttc?: number
          tva?: number
          tva_rate?: number
          updated_at?: string
        }
        Relationships: []
      }
      acc_checklist: {
        Row: {
          accountant_id: string
          client_ref: string
          created_at: string
          id: string
          kind: string
          month_key: string
          note: string | null
          received_at: string | null
          ref_document_id: string | null
          status: string
          updated_at: string
        }
        Insert: {
          accountant_id: string
          client_ref: string
          created_at?: string
          id?: string
          kind: string
          month_key: string
          note?: string | null
          received_at?: string | null
          ref_document_id?: string | null
          status?: string
          updated_at?: string
        }
        Update: {
          accountant_id?: string
          client_ref?: string
          created_at?: string
          id?: string
          kind?: string
          month_key?: string
          note?: string | null
          received_at?: string | null
          ref_document_id?: string | null
          status?: string
          updated_at?: string
        }
        Relationships: []
      }
      acc_clients: {
        Row: {
          accountant_id: string
          client_ref: string
          company: string | null
          created_at: string
          data: Json
          email: string | null
          id: string
          linked_user_id: string | null
          name: string
          status: string
          tax_id: string | null
          tax_regime: string | null
          updated_at: string
        }
        Insert: {
          accountant_id: string
          client_ref?: string
          company?: string | null
          created_at?: string
          data?: Json
          email?: string | null
          id?: string
          linked_user_id?: string | null
          name: string
          status?: string
          tax_id?: string | null
          tax_regime?: string | null
          updated_at?: string
        }
        Update: {
          accountant_id?: string
          client_ref?: string
          company?: string | null
          created_at?: string
          data?: Json
          email?: string | null
          id?: string
          linked_user_id?: string | null
          name?: string
          status?: string
          tax_id?: string | null
          tax_regime?: string | null
          updated_at?: string
        }
        Relationships: []
      }
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
      acc_employees: {
        Row: {
          accountant_id: string
          basic: number
          client_ref: string | null
          created_at: string
          dependents: number
          end_date: string | null
          hire_date: string | null
          id: string
          iew: number
          name: string
          nss: string | null
          other: number
          position: string | null
          prc: number
          updated_at: string
        }
        Insert: {
          accountant_id: string
          basic?: number
          client_ref?: string | null
          created_at?: string
          dependents?: number
          end_date?: string | null
          hire_date?: string | null
          id?: string
          iew?: number
          name: string
          nss?: string | null
          other?: number
          position?: string | null
          prc?: number
          updated_at?: string
        }
        Update: {
          accountant_id?: string
          basic?: number
          client_ref?: string | null
          created_at?: string
          dependents?: number
          end_date?: string | null
          hire_date?: string | null
          id?: string
          iew?: number
          name?: string
          nss?: string | null
          other?: number
          position?: string | null
          prc?: number
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
      acc_journal_lines: {
        Row: {
          account: string
          accountant_id: string
          batch_id: string
          client_ref: string | null
          created_at: string
          credit: number
          debit: number
          entry_date: string
          id: string
          label: string
          period: string
          source: string
          source_ref: string | null
          updated_at: string
        }
        Insert: {
          account: string
          accountant_id: string
          batch_id: string
          client_ref?: string | null
          created_at?: string
          credit?: number
          debit?: number
          entry_date: string
          id?: string
          label?: string
          period: string
          source: string
          source_ref?: string | null
          updated_at?: string
        }
        Update: {
          account?: string
          accountant_id?: string
          batch_id?: string
          client_ref?: string | null
          created_at?: string
          credit?: number
          debit?: number
          entry_date?: string
          id?: string
          label?: string
          period?: string
          source?: string
          source_ref?: string | null
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
      acc_payroll_runs: {
        Row: {
          accountant_id: string
          client_ref: string | null
          created_at: string
          finalized_at: string | null
          id: string
          journal_batch_id: string | null
          period: string
          status: string
          updated_at: string
        }
        Insert: {
          accountant_id: string
          client_ref?: string | null
          created_at?: string
          finalized_at?: string | null
          id?: string
          journal_batch_id?: string | null
          period: string
          status?: string
          updated_at?: string
        }
        Update: {
          accountant_id?: string
          client_ref?: string | null
          created_at?: string
          finalized_at?: string | null
          id?: string
          journal_batch_id?: string | null
          period?: string
          status?: string
          updated_at?: string
        }
        Relationships: []
      }
      acc_payslips: {
        Row: {
          accountant_id: string
          basic: number
          client_ref: string | null
          created_at: string
          employee_id: string | null
          employee_name: string
          employer_cost: number
          gross: number
          id: string
          iew: number
          irg: number
          net: number
          nss: string | null
          other: number
          prc: number
          run_id: string
          ss_base: number
          ss_employee: number
          ss_employer: number
          taxable: number
        }
        Insert: {
          accountant_id: string
          basic?: number
          client_ref?: string | null
          created_at?: string
          employee_id?: string | null
          employee_name: string
          employer_cost?: number
          gross?: number
          id?: string
          iew?: number
          irg?: number
          net?: number
          nss?: string | null
          other?: number
          prc?: number
          run_id: string
          ss_base?: number
          ss_employee?: number
          ss_employer?: number
          taxable?: number
        }
        Update: {
          accountant_id?: string
          basic?: number
          client_ref?: string | null
          created_at?: string
          employee_id?: string | null
          employee_name?: string
          employer_cost?: number
          gross?: number
          id?: string
          iew?: number
          irg?: number
          net?: number
          nss?: string | null
          other?: number
          prc?: number
          run_id?: string
          ss_base?: number
          ss_employee?: number
          ss_employer?: number
          taxable?: number
        }
        Relationships: []
      }
      acc_period_locks: {
        Row: {
          accountant_id: string
          client_ref: string | null
          id: string
          period: string
          reference: string | null
          validated_at: string
        }
        Insert: {
          accountant_id: string
          client_ref?: string | null
          id?: string
          period: string
          reference?: string | null
          validated_at?: string
        }
        Update: {
          accountant_id?: string
          client_ref?: string | null
          id?: string
          period?: string
          reference?: string | null
          validated_at?: string
        }
        Relationships: []
      }
      acc_reminders_sent: {
        Row: {
          accountant_id: string
          client_ref: string
          month_key: string
          sent_at: string
        }
        Insert: {
          accountant_id: string
          client_ref: string
          month_key: string
          sent_at?: string
        }
        Update: {
          accountant_id?: string
          client_ref?: string
          month_key?: string
          sent_at?: string
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
      acc_tva_precompte: {
        Row: {
          accountant_id: string
          amount: number
          client_ref: string
          period: string
          updated_at: string
        }
        Insert: {
          accountant_id: string
          amount?: number
          client_ref?: string
          period: string
          updated_at?: string
        }
        Update: {
          accountant_id?: string
          amount?: number
          client_ref?: string
          period?: string
          updated_at?: string
        }
        Relationships: []
      }
      admins: {
        Row: {
          created_at: string
          user_id: string
        }
        Insert: {
          created_at?: string
          user_id: string
        }
        Update: {
          created_at?: string
          user_id?: string
        }
        Relationships: []
      }
      billing_settings: {
        Row: { id: boolean; issuer: Json; updated_at: string }
        Insert: { id?: boolean; issuer?: Json; updated_at?: string }
        Update: { id?: boolean; issuer?: Json; updated_at?: string }
        Relationships: []
      }
      payment_receipts: {
        Row: {
          accountant_id: string | null
          amount: number
          created_at: string
          currency: string
          id: string
          issued_by: string | null
          issuer: Json
          method: string
          note: string | null
          paid_at: string
          payer: Json
          period_end: string
          period_months: number
          period_start: string
          plan: string
          receipt_no: string
          seq: number
          void_reason: string | null
          voided_at: string | null
          year: number
        }
        Insert: never
        Update: never
        Relationships: []
      }
      subscriptions: {
        Row: {
          accountant_id: string
          grace_days: number
          notes: string | null
          paid_until: string | null
          plan: string
          trial_ends_at: string | null
          updated_at: string
          updated_by: string | null
        }
        Insert: never
        Update: never
        Relationships: []
      }
      audit_log: {
        Row: {
          accountant_id: string | null
          action: string
          actor_id: string | null
          at: string
          detail: Json | null
          entity: string
          entity_id: string | null
          id: number
        }
        Insert: {
          accountant_id?: string | null
          action: string
          actor_id?: string | null
          at?: string
          detail?: Json | null
          entity: string
          entity_id?: string | null
          id?: number
        }
        Update: {
          accountant_id?: string | null
          action?: string
          actor_id?: string | null
          at?: string
          detail?: Json | null
          entity?: string
          entity_id?: string | null
          id?: number
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
          kind: string
          mime_type: string | null
          note: string | null
          size: number | null
          status: string
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
          kind?: string
          mime_type?: string | null
          note?: string | null
          size?: number | null
          status?: string
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
          kind?: string
          mime_type?: string | null
          note?: string | null
          size?: number | null
          status?: string
          title?: string
          updated_at?: string
          user_id?: string
        }
        Relationships: []
      }
      g50_declarations: {
        Row: {
          accountant_id: string
          client_id: string
          created_at: string
          form_data: Json
          generated_at: string
          id: string
          month: number
          sent: boolean
          sent_at: string | null
          year: number
        }
        Insert: {
          accountant_id: string
          client_id: string
          created_at?: string
          form_data: Json
          generated_at?: string
          id?: string
          month: number
          sent?: boolean
          sent_at?: string | null
          year: number
        }
        Update: {
          accountant_id?: string
          client_id?: string
          created_at?: string
          form_data?: Json
          generated_at?: string
          id?: string
          month?: number
          sent?: boolean
          sent_at?: string | null
          year?: number
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
          ref_doc_id: string | null
          sender_id: string
        }
        Insert: {
          content: string
          created_at?: string
          id?: string
          is_read?: boolean
          receiver_id: string
          ref_doc_id?: string | null
          sender_id: string
        }
        Update: {
          content?: string
          created_at?: string
          id?: string
          is_read?: boolean
          receiver_id?: string
          ref_doc_id?: string | null
          sender_id?: string
        }
        Relationships: []
      }
      notifications: {
        Row: {
          created_at: string
          id: string
          link: string | null
          message: string
          read: boolean
          recipient_id: string
          ref_id: string | null
          sender_id: string | null
          title: string
          type: string
        }
        Insert: {
          created_at?: string
          id?: string
          link?: string | null
          message?: string
          read?: boolean
          recipient_id: string
          ref_id?: string | null
          sender_id?: string | null
          title: string
          type?: string
        }
        Update: {
          created_at?: string
          id?: string
          link?: string | null
          message?: string
          read?: boolean
          recipient_id?: string
          ref_id?: string | null
          sender_id?: string | null
          title?: string
          type?: string
        }
        Relationships: []
      }
      profiles: {
        Row: {
          account_status: string
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
          account_status?: string
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
          account_status?: string
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
      shared_documents: {
        Row: {
          accountant_id: string
          client_id: string
          created_at: string
          file_path: string
          g50_declaration_id: string | null
          id: string
          title: string
        }
        Insert: {
          accountant_id: string
          client_id: string
          created_at?: string
          file_path: string
          g50_declaration_id?: string | null
          id?: string
          title: string
        }
        Update: {
          accountant_id?: string
          client_id?: string
          created_at?: string
          file_path?: string
          g50_declaration_id?: string | null
          id?: string
          title?: string
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
      admin_get_billing_settings: { Args: never; Returns: Json }
      admin_list_receipts: {
        Args: { _accountant_id?: string }
        Returns: Database["public"]["Tables"]["payment_receipts"]["Row"][]
      }
      admin_list_subscriptions: {
        Args: never
        Returns: {
          account_status: string
          company: string | null
          email: string
          grace_days: number
          name: string
          paid_until: string | null
          plan: string
          state: string
          trial_ends_at: string | null
          user_id: string
        }[]
      }
      admin_record_payment: {
        Args: {
          _accountant_id: string
          _amount: number
          _method?: string
          _note?: string
          _paid_at?: string
          _period_months: number
          _plan?: string
        }
        Returns: Database["public"]["Tables"]["payment_receipts"]["Row"]
      }
      admin_set_billing_settings: { Args: { _issuer: Json }; Returns: undefined }
      admin_set_subscription: {
        Args: {
          _accountant_id: string
          _grace_days?: number
          _paid_until: string | null
          _plan: string
          _trial_ends_at: string | null
        }
        Returns: undefined
      }
      admin_void_receipt: { Args: { _reason: string; _receipt_id: string }; Returns: undefined }
      export_my_data: { Args: never; Returns: Json }
      my_deletion_blockers: { Args: never; Returns: { kind: string; n: number }[] }
      my_subscription: {
        Args: never
        Returns: {
          ends_at: string | null
          grace_days: number
          paid_until: string | null
          plan: string
          state: string
          trial_ends_at: string | null
        }[]
      }
      subscription_read_only: { Args: never; Returns: boolean }
      admin_list_accountants: {
        Args: never
        Returns: {
          account_status: string
          company: string | null
          created_at: string
          email: string
          name: string
          user_id: string
        }[]
      }
      admin_set_accountant_status: {
        Args: { _status: string; _user_id: string }
        Returns: undefined
      }
      can_address_email: { Args: { _email: string }; Returns: boolean }
      get_invitation_by_token: {
        Args: { _token: string }
        Returns: {
          is_valid: boolean
          email: string | null
          prefill_name: string | null
          prefill_company: string | null
          accountant_name: string | null
        }[]
      }
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
      get_my_linked_accountant_id: { Args: never; Returns: string }
      has_role: {
        Args: {
          _role: Database["public"]["Enums"]["app_role"]
          _user_id: string
        }
        Returns: boolean
      }
      is_active_accountant: { Args: never; Returns: boolean }
      is_admin: { Args: never; Returns: boolean }
      is_linked_accountant: {
        Args: { client_user_id: string }
        Returns: boolean
      }
      is_my_client_ref: {
        Args: { _accountant_id: string; _client_ref: string }
        Returns: boolean
      }
      unlink_client: { Args: { _client_id: string }; Returns: undefined }
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
