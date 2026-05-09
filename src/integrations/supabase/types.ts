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
      _backup_20260503_billing: {
        Row: {
          billing_completed_at: string | null
          billing_completed_by: string | null
          catl_invoice_number: string | null
          created_at: string | null
          detection_type: string | null
          id: string | null
          inventory_finalized_at: string | null
          inventory_finalized_by: string | null
          mass_breed_head: number | null
          notes: string | null
          organization_id: string | null
          project_id: string | null
          qbo_invoice_id: string | null
          qbo_synced_at: string | null
          select_sires_invoice_number: string | null
          status: string | null
          updated_at: string | null
          zoho_project_id: string | null
        }
        Insert: {
          billing_completed_at?: string | null
          billing_completed_by?: string | null
          catl_invoice_number?: string | null
          created_at?: string | null
          detection_type?: string | null
          id?: string | null
          inventory_finalized_at?: string | null
          inventory_finalized_by?: string | null
          mass_breed_head?: number | null
          notes?: string | null
          organization_id?: string | null
          project_id?: string | null
          qbo_invoice_id?: string | null
          qbo_synced_at?: string | null
          select_sires_invoice_number?: string | null
          status?: string | null
          updated_at?: string | null
          zoho_project_id?: string | null
        }
        Update: {
          billing_completed_at?: string | null
          billing_completed_by?: string | null
          catl_invoice_number?: string | null
          created_at?: string | null
          detection_type?: string | null
          id?: string | null
          inventory_finalized_at?: string | null
          inventory_finalized_by?: string | null
          mass_breed_head?: number | null
          notes?: string | null
          organization_id?: string | null
          project_id?: string | null
          qbo_invoice_id?: string | null
          qbo_synced_at?: string | null
          select_sires_invoice_number?: string | null
          status?: string | null
          updated_at?: string | null
          zoho_project_id?: string | null
        }
        Relationships: []
      }
      _backup_20260503_billing_labor: {
        Row: {
          amount: number | null
          billing_id: string | null
          created_at: string | null
          description: string | null
          id: string | null
          invoiced: boolean | null
          invoiced_at: string | null
          labor_dates: string | null
          sort_order: number | null
        }
        Insert: {
          amount?: number | null
          billing_id?: string | null
          created_at?: string | null
          description?: string | null
          id?: string | null
          invoiced?: boolean | null
          invoiced_at?: string | null
          labor_dates?: string | null
          sort_order?: number | null
        }
        Update: {
          amount?: number | null
          billing_id?: string | null
          created_at?: string | null
          description?: string | null
          id?: string | null
          invoiced?: boolean | null
          invoiced_at?: string | null
          labor_dates?: string | null
          sort_order?: number | null
        }
        Relationships: []
      }
      _backup_20260503_billing_products: {
        Row: {
          billing_id: string | null
          billing_product_id: string | null
          created_at: string | null
          delivery_method: string | null
          doses: number | null
          doses_per_unit: number | null
          event_date: string | null
          id: string | null
          invoiced: boolean | null
          invoiced_at: string | null
          line_total: number | null
          product_category: string | null
          product_name: string | null
          protocol_event_label: string | null
          session_id: string | null
          sort_order: number | null
          unit_label: string | null
          unit_price: number | null
          units_billed: number | null
          units_calculated: number | null
          units_returned: number | null
        }
        Insert: {
          billing_id?: string | null
          billing_product_id?: string | null
          created_at?: string | null
          delivery_method?: string | null
          doses?: number | null
          doses_per_unit?: number | null
          event_date?: string | null
          id?: string | null
          invoiced?: boolean | null
          invoiced_at?: string | null
          line_total?: number | null
          product_category?: string | null
          product_name?: string | null
          protocol_event_label?: string | null
          session_id?: string | null
          sort_order?: number | null
          unit_label?: string | null
          unit_price?: number | null
          units_billed?: number | null
          units_calculated?: number | null
          units_returned?: number | null
        }
        Update: {
          billing_id?: string | null
          billing_product_id?: string | null
          created_at?: string | null
          delivery_method?: string | null
          doses?: number | null
          doses_per_unit?: number | null
          event_date?: string | null
          id?: string | null
          invoiced?: boolean | null
          invoiced_at?: string | null
          line_total?: number | null
          product_category?: string | null
          product_name?: string | null
          protocol_event_label?: string | null
          session_id?: string | null
          sort_order?: number | null
          unit_label?: string | null
          unit_price?: number | null
          units_billed?: number | null
          units_calculated?: number | null
          units_returned?: number | null
        }
        Relationships: []
      }
      _backup_20260503_billing_semen: {
        Row: {
          billing_id: string | null
          bull_catalog_id: string | null
          bull_code: string | null
          bull_name: string | null
          created_at: string | null
          id: string | null
          invoiced: boolean | null
          invoiced_at: string | null
          line_total: number | null
          sort_order: number | null
          unit_price: number | null
          units_billable: number | null
          units_blown: number | null
          units_packed: number | null
          units_returned: number | null
        }
        Insert: {
          billing_id?: string | null
          bull_catalog_id?: string | null
          bull_code?: string | null
          bull_name?: string | null
          created_at?: string | null
          id?: string | null
          invoiced?: boolean | null
          invoiced_at?: string | null
          line_total?: number | null
          sort_order?: number | null
          unit_price?: number | null
          units_billable?: number | null
          units_blown?: number | null
          units_packed?: number | null
          units_returned?: number | null
        }
        Update: {
          billing_id?: string | null
          bull_catalog_id?: string | null
          bull_code?: string | null
          bull_name?: string | null
          created_at?: string | null
          id?: string | null
          invoiced?: boolean | null
          invoiced_at?: string | null
          line_total?: number | null
          sort_order?: number | null
          unit_price?: number | null
          units_billable?: number | null
          units_blown?: number | null
          units_packed?: number | null
          units_returned?: number | null
        }
        Relationships: []
      }
      _backup_20260503_billing_session_inv: {
        Row: {
          billing_id: string | null
          blown_units: number | null
          bull_catalog_id: string | null
          bull_code: string | null
          bull_name: string | null
          canister: string | null
          created_at: string | null
          end_units: number | null
          id: string | null
          returned_units: number | null
          session_id: string | null
          sort_order: number | null
          start_units: number | null
          updated_at: string | null
        }
        Insert: {
          billing_id?: string | null
          blown_units?: number | null
          bull_catalog_id?: string | null
          bull_code?: string | null
          bull_name?: string | null
          canister?: string | null
          created_at?: string | null
          end_units?: number | null
          id?: string | null
          returned_units?: number | null
          session_id?: string | null
          sort_order?: number | null
          start_units?: number | null
          updated_at?: string | null
        }
        Update: {
          billing_id?: string | null
          blown_units?: number | null
          bull_catalog_id?: string | null
          bull_code?: string | null
          bull_name?: string | null
          canister?: string | null
          created_at?: string | null
          end_units?: number | null
          id?: string | null
          returned_units?: number | null
          session_id?: string | null
          sort_order?: number | null
          start_units?: number | null
          updated_at?: string | null
        }
        Relationships: []
      }
      _backup_20260503_billing_sessions: {
        Row: {
          billing_id: string | null
          created_at: string | null
          crew: string | null
          head_count: number | null
          id: string | null
          invoiced: boolean | null
          invoiced_at: string | null
          notes: string | null
          session_date: string | null
          session_label: string | null
          session_type: string | null
          sort_order: number | null
          time_of_day: string | null
        }
        Insert: {
          billing_id?: string | null
          created_at?: string | null
          crew?: string | null
          head_count?: number | null
          id?: string | null
          invoiced?: boolean | null
          invoiced_at?: string | null
          notes?: string | null
          session_date?: string | null
          session_label?: string | null
          session_type?: string | null
          sort_order?: number | null
          time_of_day?: string | null
        }
        Update: {
          billing_id?: string | null
          created_at?: string | null
          crew?: string | null
          head_count?: number | null
          id?: string | null
          invoiced?: boolean | null
          invoiced_at?: string | null
          notes?: string | null
          session_date?: string | null
          session_label?: string | null
          session_type?: string | null
          sort_order?: number | null
          time_of_day?: string | null
        }
        Relationships: []
      }
      billing_products: {
        Row: {
          active: boolean | null
          created_at: string | null
          default_price: number | null
          doses_per_unit: number | null
          drug_name: string | null
          id: string
          is_default: boolean | null
          organization_id: string
          product_category: string
          product_name: string
          qbo_item_name: string | null
          sort_order: number | null
          unit_label: string | null
        }
        Insert: {
          active?: boolean | null
          created_at?: string | null
          default_price?: number | null
          doses_per_unit?: number | null
          drug_name?: string | null
          id?: string
          is_default?: boolean | null
          organization_id: string
          product_category: string
          product_name: string
          qbo_item_name?: string | null
          sort_order?: number | null
          unit_label?: string | null
        }
        Update: {
          active?: boolean | null
          created_at?: string | null
          default_price?: number | null
          doses_per_unit?: number | null
          drug_name?: string | null
          id?: string
          is_default?: boolean | null
          organization_id?: string
          product_category?: string
          product_name?: string
          qbo_item_name?: string | null
          sort_order?: number | null
          unit_label?: string | null
        }
        Relationships: [
          {
            foreignKeyName: "billing_products_organization_id_fkey"
            columns: ["organization_id"]
            isOneToOne: false
            referencedRelation: "organizations"
            referencedColumns: ["id"]
          },
        ]
      }
      breeds: {
        Row: {
          created_at: string | null
          id: string
          is_active: boolean
          name: string
          sort_order: number
        }
        Insert: {
          created_at?: string | null
          id?: string
          is_active?: boolean
          name: string
          sort_order?: number
        }
        Update: {
          created_at?: string | null
          id?: string
          is_active?: boolean
          name?: string
          sort_order?: number
        }
        Relationships: []
      }
      bull_company_offerings: {
        Row: {
          active: boolean
          bull_id: string
          company_id: string
          company_naab_code: string | null
          created_at: string
          created_by: string | null
          id: string
          is_primary: boolean
          list_price: number | null
          notes: string | null
          organization_id: string
        }
        Insert: {
          active?: boolean
          bull_id: string
          company_id: string
          company_naab_code?: string | null
          created_at?: string
          created_by?: string | null
          id?: string
          is_primary?: boolean
          list_price?: number | null
          notes?: string | null
          organization_id: string
        }
        Update: {
          active?: boolean
          bull_id?: string
          company_id?: string
          company_naab_code?: string | null
          created_at?: string
          created_by?: string | null
          id?: string
          is_primary?: boolean
          list_price?: number | null
          notes?: string | null
          organization_id?: string
        }
        Relationships: [
          {
            foreignKeyName: "bull_company_offerings_bull_id_fkey"
            columns: ["bull_id"]
            isOneToOne: false
            referencedRelation: "bulls_catalog"
            referencedColumns: ["id"]
          },
          {
            foreignKeyName: "bull_company_offerings_bull_id_fkey"
            columns: ["bull_id"]
            isOneToOne: false
            referencedRelation: "view_bull_planning"
            referencedColumns: ["bull_catalog_id"]
          },
          {
            foreignKeyName: "bull_company_offerings_company_id_fkey"
            columns: ["company_id"]
            isOneToOne: false
            referencedRelation: "semen_companies"
            referencedColumns: ["id"]
          },
        ]
      }
      bull_favorites: {
        Row: {
          bull_catalog_id: string | null
          created_at: string | null
          id: string
          user_id: string | null
        }
        Insert: {
          bull_catalog_id?: string | null
          created_at?: string | null
          id?: string
          user_id?: string | null
        }
        Update: {
          bull_catalog_id?: string | null
          created_at?: string | null
          id?: string
          user_id?: string | null
        }
        Relationships: [
          {
            foreignKeyName: "bull_favorites_bull_catalog_id_fkey"
            columns: ["bull_catalog_id"]
            isOneToOne: false
            referencedRelation: "bulls_catalog"
            referencedColumns: ["id"]
          },
          {
            foreignKeyName: "bull_favorites_bull_catalog_id_fkey"
            columns: ["bull_catalog_id"]
            isOneToOne: false
            referencedRelation: "view_bull_planning"
            referencedColumns: ["bull_catalog_id"]
          },
        ]
      }
      bull_naab_codes: {
        Row: {
          bull_catalog_id: string
          created_at: string
          created_by: string | null
          id: string
          is_primary: boolean
          naab_code: string
          semen_company_id: string
        }
        Insert: {
          bull_catalog_id: string
          created_at?: string
          created_by?: string | null
          id?: string
          is_primary?: boolean
          naab_code: string
          semen_company_id: string
        }
        Update: {
          bull_catalog_id?: string
          created_at?: string
          created_by?: string | null
          id?: string
          is_primary?: boolean
          naab_code?: string
          semen_company_id?: string
        }
        Relationships: [
          {
            foreignKeyName: "bull_naab_codes_bull_catalog_id_fkey"
            columns: ["bull_catalog_id"]
            isOneToOne: false
            referencedRelation: "bulls_catalog"
            referencedColumns: ["id"]
          },
          {
            foreignKeyName: "bull_naab_codes_bull_catalog_id_fkey"
            columns: ["bull_catalog_id"]
            isOneToOne: false
            referencedRelation: "view_bull_planning"
            referencedColumns: ["bull_catalog_id"]
          },
          {
            foreignKeyName: "bull_naab_codes_semen_company_id_fkey"
            columns: ["semen_company_id"]
            isOneToOne: false
            referencedRelation: "semen_companies"
            referencedColumns: ["id"]
          },
        ]
      }
      bulls_catalog: {
        Row: {
          active: boolean
          breed: string | null
          bull_name: string
          company: string | null
          created_at: string
          created_by: string | null
          id: string
          is_company_product: boolean
          is_custom: boolean
          naab_code: string | null
          naab_normalized: string | null
          notes: string | null
          organization_id: string | null
          registration_number: string | null
        }
        Insert: {
          active?: boolean
          breed?: string | null
          bull_name: string
          company?: string | null
          created_at?: string
          created_by?: string | null
          id?: string
          is_company_product?: boolean
          is_custom?: boolean
          naab_code?: string | null
          naab_normalized?: string | null
          notes?: string | null
          organization_id?: string | null
          registration_number?: string | null
        }
        Update: {
          active?: boolean
          breed?: string | null
          bull_name?: string
          company?: string | null
          created_at?: string
          created_by?: string | null
          id?: string
          is_company_product?: boolean
          is_custom?: boolean
          naab_code?: string | null
          naab_normalized?: string | null
          notes?: string | null
          organization_id?: string | null
          registration_number?: string | null
        }
        Relationships: [
          {
            foreignKeyName: "bulls_catalog_organization_id_fkey"
            columns: ["organization_id"]
            isOneToOne: false
            referencedRelation: "organizations"
            referencedColumns: ["id"]
          },
        ]
      }
      customers: {
        Row: {
          address: string | null
          address_line1: string | null
          address_line2: string | null
          city: string | null
          company_name: string | null
          created_at: string
          email: string | null
          id: string
          name: string
          notes: string | null
          organization_id: string
          phone: string | null
          qbo_customer_id: string | null
          qbo_synced_at: string | null
          state: string | null
          zip: string | null
        }
        Insert: {
          address?: string | null
          address_line1?: string | null
          address_line2?: string | null
          city?: string | null
          company_name?: string | null
          created_at?: string
          email?: string | null
          id?: string
          name: string
          notes?: string | null
          organization_id: string
          phone?: string | null
          qbo_customer_id?: string | null
          qbo_synced_at?: string | null
          state?: string | null
          zip?: string | null
        }
        Update: {
          address?: string | null
          address_line1?: string | null
          address_line2?: string | null
          city?: string | null
          company_name?: string | null
          created_at?: string
          email?: string | null
          id?: string
          name?: string
          notes?: string | null
          organization_id?: string
          phone?: string | null
          qbo_customer_id?: string | null
          qbo_synced_at?: string | null
          state?: string | null
          zip?: string | null
        }
        Relationships: [
          {
            foreignKeyName: "customers_organization_id_fkey"
            columns: ["organization_id"]
            isOneToOne: false
            referencedRelation: "organizations"
            referencedColumns: ["id"]
          },
        ]
      }
      edge_function_health_log: {
        Row: {
          checked_at: string
          function_name: string
          id: number
          notes: string | null
          ok: boolean
          response_ms: number | null
          status_code: number | null
        }
        Insert: {
          checked_at?: string
          function_name: string
          id?: number
          notes?: string | null
          ok: boolean
          response_ms?: number | null
          status_code?: number | null
        }
        Update: {
          checked_at?: string
          function_name?: string
          id?: number
          notes?: string | null
          ok?: boolean
          response_ms?: number | null
          status_code?: number | null
        }
        Relationships: []
      }
      google_calendar_events: {
        Row: {
          google_calendar_id: string
          google_event_id: string
          id: string
          project_id: string
          protocol_event_id: string
          synced_at: string
          user_id: string
        }
        Insert: {
          google_calendar_id?: string
          google_event_id: string
          id?: string
          project_id: string
          protocol_event_id: string
          synced_at?: string
          user_id: string
        }
        Update: {
          google_calendar_id?: string
          google_event_id?: string
          id?: string
          project_id?: string
          protocol_event_id?: string
          synced_at?: string
          user_id?: string
        }
        Relationships: [
          {
            foreignKeyName: "google_calendar_events_project_id_fkey"
            columns: ["project_id"]
            isOneToOne: false
            referencedRelation: "projects"
            referencedColumns: ["id"]
          },
          {
            foreignKeyName: "google_calendar_events_protocol_event_id_fkey"
            columns: ["protocol_event_id"]
            isOneToOne: false
            referencedRelation: "protocol_events"
            referencedColumns: ["id"]
          },
        ]
      }
      inventory_order_earmarks: {
        Row: {
          bull_catalog_id: string | null
          created_at: string
          customer_order_id: string
          id: string
          inventory_order_id: string
          notes: string | null
          organization_id: string
          units: number
        }
        Insert: {
          bull_catalog_id?: string | null
          created_at?: string
          customer_order_id: string
          id?: string
          inventory_order_id: string
          notes?: string | null
          organization_id: string
          units: number
        }
        Update: {
          bull_catalog_id?: string | null
          created_at?: string
          customer_order_id?: string
          id?: string
          inventory_order_id?: string
          notes?: string | null
          organization_id?: string
          units?: number
        }
        Relationships: [
          {
            foreignKeyName: "inventory_order_earmarks_bull_catalog_id_fkey"
            columns: ["bull_catalog_id"]
            isOneToOne: false
            referencedRelation: "bulls_catalog"
            referencedColumns: ["id"]
          },
          {
            foreignKeyName: "inventory_order_earmarks_bull_catalog_id_fkey"
            columns: ["bull_catalog_id"]
            isOneToOne: false
            referencedRelation: "view_bull_planning"
            referencedColumns: ["bull_catalog_id"]
          },
          {
            foreignKeyName: "inventory_order_earmarks_customer_order_id_fkey"
            columns: ["customer_order_id"]
            isOneToOne: false
            referencedRelation: "semen_orders"
            referencedColumns: ["id"]
          },
          {
            foreignKeyName: "inventory_order_earmarks_inventory_order_id_fkey"
            columns: ["inventory_order_id"]
            isOneToOne: false
            referencedRelation: "semen_orders"
            referencedColumns: ["id"]
          },
        ]
      }
      inventory_transactions: {
        Row: {
          bull_catalog_id: string | null
          bull_code: string | null
          created_at: string
          custom_bull_name: string | null
          customer_id: string | null
          id: string
          inventory_item_id: string | null
          is_billable: boolean
          notes: string | null
          order_id: string | null
          organization_id: string
          performed_by: string | null
          project_id: string | null
          reason: string | null
          shipment_id: string | null
          tank_id: string
          tank_pack_id: string | null
          transaction_type: string
          units_change: number
        }
        Insert: {
          bull_catalog_id?: string | null
          bull_code?: string | null
          created_at?: string
          custom_bull_name?: string | null
          customer_id?: string | null
          id?: string
          inventory_item_id?: string | null
          is_billable?: boolean
          notes?: string | null
          order_id?: string | null
          organization_id: string
          performed_by?: string | null
          project_id?: string | null
          reason?: string | null
          shipment_id?: string | null
          tank_id: string
          tank_pack_id?: string | null
          transaction_type: string
          units_change: number
        }
        Update: {
          bull_catalog_id?: string | null
          bull_code?: string | null
          created_at?: string
          custom_bull_name?: string | null
          customer_id?: string | null
          id?: string
          inventory_item_id?: string | null
          is_billable?: boolean
          notes?: string | null
          order_id?: string | null
          organization_id?: string
          performed_by?: string | null
          project_id?: string | null
          reason?: string | null
          shipment_id?: string | null
          tank_id?: string
          tank_pack_id?: string | null
          transaction_type?: string
          units_change?: number
        }
        Relationships: [
          {
            foreignKeyName: "inventory_transactions_bull_catalog_id_fkey"
            columns: ["bull_catalog_id"]
            isOneToOne: false
            referencedRelation: "bulls_catalog"
            referencedColumns: ["id"]
          },
          {
            foreignKeyName: "inventory_transactions_bull_catalog_id_fkey"
            columns: ["bull_catalog_id"]
            isOneToOne: false
            referencedRelation: "view_bull_planning"
            referencedColumns: ["bull_catalog_id"]
          },
          {
            foreignKeyName: "inventory_transactions_customer_id_fkey"
            columns: ["customer_id"]
            isOneToOne: false
            referencedRelation: "customers"
            referencedColumns: ["id"]
          },
          {
            foreignKeyName: "inventory_transactions_inventory_item_id_fkey"
            columns: ["inventory_item_id"]
            isOneToOne: false
            referencedRelation: "tank_inventory"
            referencedColumns: ["id"]
          },
          {
            foreignKeyName: "inventory_transactions_order_id_fkey"
            columns: ["order_id"]
            isOneToOne: false
            referencedRelation: "semen_orders"
            referencedColumns: ["id"]
          },
          {
            foreignKeyName: "inventory_transactions_organization_id_fkey"
            columns: ["organization_id"]
            isOneToOne: false
            referencedRelation: "organizations"
            referencedColumns: ["id"]
          },
          {
            foreignKeyName: "inventory_transactions_project_id_fkey"
            columns: ["project_id"]
            isOneToOne: false
            referencedRelation: "projects"
            referencedColumns: ["id"]
          },
          {
            foreignKeyName: "inventory_transactions_shipment_id_fkey"
            columns: ["shipment_id"]
            isOneToOne: false
            referencedRelation: "shipments"
            referencedColumns: ["id"]
          },
          {
            foreignKeyName: "inventory_transactions_tank_id_fkey"
            columns: ["tank_id"]
            isOneToOne: false
            referencedRelation: "tanks"
            referencedColumns: ["id"]
          },
          {
            foreignKeyName: "inventory_transactions_tank_pack_id_fkey"
            columns: ["tank_pack_id"]
            isOneToOne: false
            referencedRelation: "tank_packs"
            referencedColumns: ["id"]
          },
        ]
      }
      naab_controllers: {
        Row: {
          business_status: string
          company_name: string
          controller_code: string
          created_at: string
          is_active_naab: boolean
          location: string | null
          notes: string | null
          semen_company_id: string | null
        }
        Insert: {
          business_status?: string
          company_name: string
          controller_code: string
          created_at?: string
          is_active_naab?: boolean
          location?: string | null
          notes?: string | null
          semen_company_id?: string | null
        }
        Update: {
          business_status?: string
          company_name?: string
          controller_code?: string
          created_at?: string
          is_active_naab?: boolean
          location?: string | null
          notes?: string | null
          semen_company_id?: string | null
        }
        Relationships: [
          {
            foreignKeyName: "naab_controllers_semen_company_id_fkey"
            columns: ["semen_company_id"]
            isOneToOne: false
            referencedRelation: "semen_companies"
            referencedColumns: ["id"]
          },
        ]
      }
      order_supply_items: {
        Row: {
          billing_product_id: string | null
          created_at: string
          id: string
          item_code: string | null
          line_total: number | null
          notes: string | null
          product_name: string
          quantity: number
          semen_order_id: string
          unit_label: string | null
          unit_price: number | null
        }
        Insert: {
          billing_product_id?: string | null
          created_at?: string
          id?: string
          item_code?: string | null
          line_total?: number | null
          notes?: string | null
          product_name: string
          quantity?: number
          semen_order_id: string
          unit_label?: string | null
          unit_price?: number | null
        }
        Update: {
          billing_product_id?: string | null
          created_at?: string
          id?: string
          item_code?: string | null
          line_total?: number | null
          notes?: string | null
          product_name?: string
          quantity?: number
          semen_order_id?: string
          unit_label?: string | null
          unit_price?: number | null
        }
        Relationships: [
          {
            foreignKeyName: "order_supply_items_billing_product_id_fkey"
            columns: ["billing_product_id"]
            isOneToOne: false
            referencedRelation: "billing_products"
            referencedColumns: ["id"]
          },
          {
            foreignKeyName: "order_supply_items_semen_order_id_fkey"
            columns: ["semen_order_id"]
            isOneToOne: false
            referencedRelation: "semen_orders"
            referencedColumns: ["id"]
          },
        ]
      }
      organization_members: {
        Row: {
          accepted: boolean | null
          created_at: string | null
          display_name: string | null
          id: string
          invited_by: string | null
          invited_email: string | null
          organization_id: string
          role: string
          user_id: string | null
        }
        Insert: {
          accepted?: boolean | null
          created_at?: string | null
          display_name?: string | null
          id?: string
          invited_by?: string | null
          invited_email?: string | null
          organization_id: string
          role?: string
          user_id?: string | null
        }
        Update: {
          accepted?: boolean | null
          created_at?: string | null
          display_name?: string | null
          id?: string
          invited_by?: string | null
          invited_email?: string | null
          organization_id?: string
          role?: string
          user_id?: string | null
        }
        Relationships: [
          {
            foreignKeyName: "organization_members_organization_id_fkey"
            columns: ["organization_id"]
            isOneToOne: false
            referencedRelation: "organizations"
            referencedColumns: ["id"]
          },
        ]
      }
      organizations: {
        Row: {
          created_at: string | null
          created_by: string | null
          google_calendar_id: string | null
          id: string
          invite_code: string | null
          name: string
        }
        Insert: {
          created_at?: string | null
          created_by?: string | null
          google_calendar_id?: string | null
          id?: string
          invite_code?: string | null
          name: string
        }
        Update: {
          created_at?: string | null
          created_by?: string | null
          google_calendar_id?: string | null
          id?: string
          invite_code?: string | null
          name?: string
        }
        Relationships: []
      }
      pending_invites: {
        Row: {
          accepted: boolean | null
          created_at: string | null
          expires_at: string | null
          id: string
          invited_email: string
          organization_id: string
          token: string
        }
        Insert: {
          accepted?: boolean | null
          created_at?: string | null
          expires_at?: string | null
          id?: string
          invited_email: string
          organization_id: string
          token?: string
        }
        Update: {
          accepted?: boolean | null
          created_at?: string | null
          expires_at?: string | null
          id?: string
          invited_email?: string
          organization_id?: string
          token?: string
        }
        Relationships: [
          {
            foreignKeyName: "pending_invites_organization_id_fkey"
            columns: ["organization_id"]
            isOneToOne: false
            referencedRelation: "organizations"
            referencedColumns: ["id"]
          },
        ]
      }
      profiles: {
        Row: {
          created_at: string
          has_completed_onboarding: boolean
          id: string
          user_id: string
        }
        Insert: {
          created_at?: string
          has_completed_onboarding?: boolean
          id?: string
          user_id: string
        }
        Update: {
          created_at?: string
          has_completed_onboarding?: boolean
          id?: string
          user_id?: string
        }
        Relationships: []
      }
      project_billing: {
        Row: {
          billing_completed_at: string | null
          billing_completed_by: string | null
          catl_invoice_number: string | null
          created_at: string | null
          detection_type: string | null
          id: string
          inventory_finalized_at: string | null
          inventory_finalized_by: string | null
          mass_breed_head: number | null
          notes: string | null
          organization_id: string
          project_id: string
          qbo_invoice_id: string | null
          qbo_synced_at: string | null
          select_sires_invoice_number: string | null
          status: string
          updated_at: string | null
          zoho_project_id: string | null
        }
        Insert: {
          billing_completed_at?: string | null
          billing_completed_by?: string | null
          catl_invoice_number?: string | null
          created_at?: string | null
          detection_type?: string | null
          id?: string
          inventory_finalized_at?: string | null
          inventory_finalized_by?: string | null
          mass_breed_head?: number | null
          notes?: string | null
          organization_id: string
          project_id: string
          qbo_invoice_id?: string | null
          qbo_synced_at?: string | null
          select_sires_invoice_number?: string | null
          status?: string
          updated_at?: string | null
          zoho_project_id?: string | null
        }
        Update: {
          billing_completed_at?: string | null
          billing_completed_by?: string | null
          catl_invoice_number?: string | null
          created_at?: string | null
          detection_type?: string | null
          id?: string
          inventory_finalized_at?: string | null
          inventory_finalized_by?: string | null
          mass_breed_head?: number | null
          notes?: string | null
          organization_id?: string
          project_id?: string
          qbo_invoice_id?: string | null
          qbo_synced_at?: string | null
          select_sires_invoice_number?: string | null
          status?: string
          updated_at?: string | null
          zoho_project_id?: string | null
        }
        Relationships: [
          {
            foreignKeyName: "project_billing_organization_id_fkey"
            columns: ["organization_id"]
            isOneToOne: false
            referencedRelation: "organizations"
            referencedColumns: ["id"]
          },
          {
            foreignKeyName: "project_billing_project_id_fkey"
            columns: ["project_id"]
            isOneToOne: true
            referencedRelation: "projects"
            referencedColumns: ["id"]
          },
        ]
      }
      project_billing_labor: {
        Row: {
          amount: number | null
          billing_id: string
          created_at: string | null
          description: string
          id: string
          invoiced: boolean
          invoiced_at: string | null
          labor_dates: string | null
          sort_order: number | null
        }
        Insert: {
          amount?: number | null
          billing_id: string
          created_at?: string | null
          description: string
          id?: string
          invoiced?: boolean
          invoiced_at?: string | null
          labor_dates?: string | null
          sort_order?: number | null
        }
        Update: {
          amount?: number | null
          billing_id?: string
          created_at?: string | null
          description?: string
          id?: string
          invoiced?: boolean
          invoiced_at?: string | null
          labor_dates?: string | null
          sort_order?: number | null
        }
        Relationships: [
          {
            foreignKeyName: "project_billing_labor_billing_id_fkey"
            columns: ["billing_id"]
            isOneToOne: false
            referencedRelation: "project_billing"
            referencedColumns: ["id"]
          },
        ]
      }
      project_billing_products: {
        Row: {
          billing_id: string
          billing_product_id: string | null
          created_at: string | null
          delivery_method: string | null
          doses: number
          doses_per_unit: number | null
          event_date: string | null
          id: string
          invoiced: boolean
          invoiced_at: string | null
          line_total: number | null
          product_category: string | null
          product_name: string
          protocol_event_label: string | null
          session_id: string | null
          sort_order: number | null
          unit_label: string | null
          unit_price: number | null
          units_billed: number | null
          units_calculated: number | null
          units_returned: number | null
        }
        Insert: {
          billing_id: string
          billing_product_id?: string | null
          created_at?: string | null
          delivery_method?: string | null
          doses?: number
          doses_per_unit?: number | null
          event_date?: string | null
          id?: string
          invoiced?: boolean
          invoiced_at?: string | null
          line_total?: number | null
          product_category?: string | null
          product_name: string
          protocol_event_label?: string | null
          session_id?: string | null
          sort_order?: number | null
          unit_label?: string | null
          unit_price?: number | null
          units_billed?: number | null
          units_calculated?: number | null
          units_returned?: number | null
        }
        Update: {
          billing_id?: string
          billing_product_id?: string | null
          created_at?: string | null
          delivery_method?: string | null
          doses?: number
          doses_per_unit?: number | null
          event_date?: string | null
          id?: string
          invoiced?: boolean
          invoiced_at?: string | null
          line_total?: number | null
          product_category?: string | null
          product_name?: string
          protocol_event_label?: string | null
          session_id?: string | null
          sort_order?: number | null
          unit_label?: string | null
          unit_price?: number | null
          units_billed?: number | null
          units_calculated?: number | null
          units_returned?: number | null
        }
        Relationships: [
          {
            foreignKeyName: "project_billing_products_billing_id_fkey"
            columns: ["billing_id"]
            isOneToOne: false
            referencedRelation: "project_billing"
            referencedColumns: ["id"]
          },
          {
            foreignKeyName: "project_billing_products_billing_product_id_fkey"
            columns: ["billing_product_id"]
            isOneToOne: false
            referencedRelation: "billing_products"
            referencedColumns: ["id"]
          },
          {
            foreignKeyName: "project_billing_products_session_id_fkey"
            columns: ["session_id"]
            isOneToOne: false
            referencedRelation: "project_billing_sessions"
            referencedColumns: ["id"]
          },
        ]
      }
      project_billing_semen: {
        Row: {
          billing_id: string
          bull_catalog_id: string | null
          bull_code: string | null
          bull_name: string
          created_at: string | null
          id: string
          invoiced: boolean
          invoiced_at: string | null
          line_total: number | null
          sort_order: number | null
          unit_price: number | null
          units_billable: number | null
          units_blown: number | null
          units_packed: number | null
          units_returned: number | null
        }
        Insert: {
          billing_id: string
          bull_catalog_id?: string | null
          bull_code?: string | null
          bull_name: string
          created_at?: string | null
          id?: string
          invoiced?: boolean
          invoiced_at?: string | null
          line_total?: number | null
          sort_order?: number | null
          unit_price?: number | null
          units_billable?: number | null
          units_blown?: number | null
          units_packed?: number | null
          units_returned?: number | null
        }
        Update: {
          billing_id?: string
          bull_catalog_id?: string | null
          bull_code?: string | null
          bull_name?: string
          created_at?: string | null
          id?: string
          invoiced?: boolean
          invoiced_at?: string | null
          line_total?: number | null
          sort_order?: number | null
          unit_price?: number | null
          units_billable?: number | null
          units_blown?: number | null
          units_packed?: number | null
          units_returned?: number | null
        }
        Relationships: [
          {
            foreignKeyName: "project_billing_semen_billing_id_fkey"
            columns: ["billing_id"]
            isOneToOne: false
            referencedRelation: "project_billing"
            referencedColumns: ["id"]
          },
          {
            foreignKeyName: "project_billing_semen_bull_catalog_id_fkey"
            columns: ["bull_catalog_id"]
            isOneToOne: false
            referencedRelation: "bulls_catalog"
            referencedColumns: ["id"]
          },
          {
            foreignKeyName: "project_billing_semen_bull_catalog_id_fkey"
            columns: ["bull_catalog_id"]
            isOneToOne: false
            referencedRelation: "view_bull_planning"
            referencedColumns: ["bull_catalog_id"]
          },
        ]
      }
      project_billing_session_inventory: {
        Row: {
          billing_id: string
          blown_units: number | null
          bull_catalog_id: string | null
          bull_code: string | null
          bull_name: string
          canister: string
          created_at: string
          end_units: number | null
          id: string
          returned_units: number | null
          session_id: string
          sort_order: number | null
          start_units: number | null
          updated_at: string
        }
        Insert: {
          billing_id: string
          blown_units?: number | null
          bull_catalog_id?: string | null
          bull_code?: string | null
          bull_name: string
          canister: string
          created_at?: string
          end_units?: number | null
          id?: string
          returned_units?: number | null
          session_id: string
          sort_order?: number | null
          start_units?: number | null
          updated_at?: string
        }
        Update: {
          billing_id?: string
          blown_units?: number | null
          bull_catalog_id?: string | null
          bull_code?: string | null
          bull_name?: string
          canister?: string
          created_at?: string
          end_units?: number | null
          id?: string
          returned_units?: number | null
          session_id?: string
          sort_order?: number | null
          start_units?: number | null
          updated_at?: string
        }
        Relationships: [
          {
            foreignKeyName: "project_billing_session_inventory_billing_id_fkey"
            columns: ["billing_id"]
            isOneToOne: false
            referencedRelation: "project_billing"
            referencedColumns: ["id"]
          },
          {
            foreignKeyName: "project_billing_session_inventory_bull_catalog_id_fkey"
            columns: ["bull_catalog_id"]
            isOneToOne: false
            referencedRelation: "bulls_catalog"
            referencedColumns: ["id"]
          },
          {
            foreignKeyName: "project_billing_session_inventory_bull_catalog_id_fkey"
            columns: ["bull_catalog_id"]
            isOneToOne: false
            referencedRelation: "view_bull_planning"
            referencedColumns: ["bull_catalog_id"]
          },
          {
            foreignKeyName: "project_billing_session_inventory_session_id_fkey"
            columns: ["session_id"]
            isOneToOne: false
            referencedRelation: "project_billing_sessions"
            referencedColumns: ["id"]
          },
        ]
      }
      project_billing_sessions: {
        Row: {
          billing_id: string
          created_at: string | null
          crew: string | null
          head_count: number | null
          id: string
          invoiced: boolean
          invoiced_at: string | null
          notes: string | null
          session_date: string
          session_label: string | null
          session_type: string
          sort_order: number | null
          time_of_day: string | null
        }
        Insert: {
          billing_id: string
          created_at?: string | null
          crew?: string | null
          head_count?: number | null
          id?: string
          invoiced?: boolean
          invoiced_at?: string | null
          notes?: string | null
          session_date: string
          session_label?: string | null
          session_type?: string
          sort_order?: number | null
          time_of_day?: string | null
        }
        Update: {
          billing_id?: string
          created_at?: string | null
          crew?: string | null
          head_count?: number | null
          id?: string
          invoiced?: boolean
          invoiced_at?: string | null
          notes?: string | null
          session_date?: string
          session_label?: string | null
          session_type?: string
          sort_order?: number | null
          time_of_day?: string | null
        }
        Relationships: [
          {
            foreignKeyName: "project_billing_sessions_billing_id_fkey"
            columns: ["billing_id"]
            isOneToOne: false
            referencedRelation: "project_billing"
            referencedColumns: ["id"]
          },
        ]
      }
      project_bulls: {
        Row: {
          bull_catalog_id: string | null
          custom_bull_name: string | null
          id: string
          project_id: string
          semen_source: string
          units: number
        }
        Insert: {
          bull_catalog_id?: string | null
          custom_bull_name?: string | null
          id?: string
          project_id: string
          semen_source?: string
          units?: number
        }
        Update: {
          bull_catalog_id?: string | null
          custom_bull_name?: string | null
          id?: string
          project_id?: string
          semen_source?: string
          units?: number
        }
        Relationships: [
          {
            foreignKeyName: "project_bulls_bull_catalog_id_fkey"
            columns: ["bull_catalog_id"]
            isOneToOne: false
            referencedRelation: "bulls_catalog"
            referencedColumns: ["id"]
          },
          {
            foreignKeyName: "project_bulls_bull_catalog_id_fkey"
            columns: ["bull_catalog_id"]
            isOneToOne: false
            referencedRelation: "view_bull_planning"
            referencedColumns: ["bull_catalog_id"]
          },
          {
            foreignKeyName: "project_bulls_project_id_fkey"
            columns: ["project_id"]
            isOneToOne: false
            referencedRelation: "projects"
            referencedColumns: ["id"]
          },
        ]
      }
      project_contacts: {
        Row: {
          contact_date: string
          contacted_by: string | null
          created_at: string
          id: string
          notes: string | null
          organization_id: string
          project_id: string
        }
        Insert: {
          contact_date?: string
          contacted_by?: string | null
          created_at?: string
          id?: string
          notes?: string | null
          organization_id: string
          project_id: string
        }
        Update: {
          contact_date?: string
          contacted_by?: string | null
          created_at?: string
          id?: string
          notes?: string | null
          organization_id?: string
          project_id?: string
        }
        Relationships: [
          {
            foreignKeyName: "project_contacts_organization_id_fkey"
            columns: ["organization_id"]
            isOneToOne: false
            referencedRelation: "organizations"
            referencedColumns: ["id"]
          },
          {
            foreignKeyName: "project_contacts_project_id_fkey"
            columns: ["project_id"]
            isOneToOne: false
            referencedRelation: "projects"
            referencedColumns: ["id"]
          },
        ]
      }
      projects: {
        Row: {
          breeding_date: string
          breeding_time: string | null
          cattle_type: string
          completed_at: string | null
          created_at: string
          customer_id: string
          head_count: number
          id: string
          last_contacted_by: string | null
          last_contacted_date: string | null
          name: string
          notes: string | null
          organization_id: string
          protocol: string
          status: string
          user_id: string | null
        }
        Insert: {
          breeding_date: string
          breeding_time?: string | null
          cattle_type: string
          completed_at?: string | null
          created_at?: string
          customer_id: string
          head_count?: number
          id?: string
          last_contacted_by?: string | null
          last_contacted_date?: string | null
          name: string
          notes?: string | null
          organization_id: string
          protocol: string
          status?: string
          user_id?: string | null
        }
        Update: {
          breeding_date?: string
          breeding_time?: string | null
          cattle_type?: string
          completed_at?: string | null
          created_at?: string
          customer_id?: string
          head_count?: number
          id?: string
          last_contacted_by?: string | null
          last_contacted_date?: string | null
          name?: string
          notes?: string | null
          organization_id?: string
          protocol?: string
          status?: string
          user_id?: string | null
        }
        Relationships: [
          {
            foreignKeyName: "projects_customer_id_fkey"
            columns: ["customer_id"]
            isOneToOne: false
            referencedRelation: "customers"
            referencedColumns: ["id"]
          },
          {
            foreignKeyName: "projects_organization_id_fkey"
            columns: ["organization_id"]
            isOneToOne: false
            referencedRelation: "organizations"
            referencedColumns: ["id"]
          },
        ]
      }
      protocol_events: {
        Row: {
          event_date: string
          event_name: string
          event_time: string | null
          id: string
          project_id: string
        }
        Insert: {
          event_date: string
          event_name: string
          event_time?: string | null
          id?: string
          project_id: string
        }
        Update: {
          event_date?: string
          event_name?: string
          event_time?: string | null
          id?: string
          project_id?: string
        }
        Relationships: [
          {
            foreignKeyName: "protocol_events_project_id_fkey"
            columns: ["project_id"]
            isOneToOne: false
            referencedRelation: "projects"
            referencedColumns: ["id"]
          },
        ]
      }
      receiving_report_audit_log: {
        Row: {
          edited_at: string
          edited_by: string
          field_name: string
          id: string
          new_value: string | null
          old_value: string | null
          organization_id: string
          reason: string | null
          shipment_id: string
        }
        Insert: {
          edited_at?: string
          edited_by: string
          field_name: string
          id?: string
          new_value?: string | null
          old_value?: string | null
          organization_id: string
          reason?: string | null
          shipment_id: string
        }
        Update: {
          edited_at?: string
          edited_by?: string
          field_name?: string
          id?: string
          new_value?: string | null
          old_value?: string | null
          organization_id?: string
          reason?: string | null
          shipment_id?: string
        }
        Relationships: [
          {
            foreignKeyName: "receiving_report_audit_log_shipment_id_fkey"
            columns: ["shipment_id"]
            isOneToOne: false
            referencedRelation: "shipments"
            referencedColumns: ["id"]
          },
        ]
      }
      semen_companies: {
        Row: {
          active: boolean
          can_own_inventory: boolean
          created_at: string
          id: string
          is_internal: boolean
          is_placeholder: boolean
          name: string
          organization_id: string
        }
        Insert: {
          active?: boolean
          can_own_inventory?: boolean
          created_at?: string
          id?: string
          is_internal?: boolean
          is_placeholder?: boolean
          name: string
          organization_id: string
        }
        Update: {
          active?: boolean
          can_own_inventory?: boolean
          created_at?: string
          id?: string
          is_internal?: boolean
          is_placeholder?: boolean
          name?: string
          organization_id?: string
        }
        Relationships: [
          {
            foreignKeyName: "semen_companies_organization_id_fkey"
            columns: ["organization_id"]
            isOneToOne: false
            referencedRelation: "organizations"
            referencedColumns: ["id"]
          },
        ]
      }
      semen_order_items: {
        Row: {
          bull_catalog_id: string
          custom_bull_name: string | null
          id: string
          invoicing_company_id: string | null
          item_status: string
          semen_order_id: string
          units: number
          units_received: number
        }
        Insert: {
          bull_catalog_id: string
          custom_bull_name?: string | null
          id?: string
          invoicing_company_id?: string | null
          item_status?: string
          semen_order_id: string
          units?: number
          units_received?: number
        }
        Update: {
          bull_catalog_id?: string
          custom_bull_name?: string | null
          id?: string
          invoicing_company_id?: string | null
          item_status?: string
          semen_order_id?: string
          units?: number
          units_received?: number
        }
        Relationships: [
          {
            foreignKeyName: "semen_order_items_bull_catalog_id_fkey"
            columns: ["bull_catalog_id"]
            isOneToOne: false
            referencedRelation: "bulls_catalog"
            referencedColumns: ["id"]
          },
          {
            foreignKeyName: "semen_order_items_bull_catalog_id_fkey"
            columns: ["bull_catalog_id"]
            isOneToOne: false
            referencedRelation: "view_bull_planning"
            referencedColumns: ["bull_catalog_id"]
          },
          {
            foreignKeyName: "semen_order_items_invoicing_company_id_fkey"
            columns: ["invoicing_company_id"]
            isOneToOne: false
            referencedRelation: "semen_companies"
            referencedColumns: ["id"]
          },
          {
            foreignKeyName: "semen_order_items_semen_order_id_fkey"
            columns: ["semen_order_id"]
            isOneToOne: false
            referencedRelation: "semen_orders"
            referencedColumns: ["id"]
          },
        ]
      }
      semen_orders: {
        Row: {
          billing_status: string
          created_at: string
          created_by: string | null
          customer_id: string | null
          document_path: string | null
          expected_arrival_date: string | null
          expected_ship_date: string | null
          fulfilled_at: string | null
          fulfilled_by_user_id: string | null
          fulfillment_notes: string | null
          fulfillment_resolution: string | null
          fulfillment_status: string
          id: string
          inventory_owner: string | null
          invoice_document_path: string | null
          invoice_number: string | null
          invoiced_at: string | null
          invoicing_company_id: string | null
          manually_closed_at: string | null
          manually_closed_by: string | null
          manually_closed_reason: string | null
          needed_by: string | null
          notes: string | null
          order_date: string | null
          order_status: string
          order_type: string
          organization_id: string
          placed_by: string | null
          placed_by_external: string | null
          placed_by_user_id: string | null
          project_id: string | null
          semen_company_id: string | null
          supplier_invoice_number: string | null
        }
        Insert: {
          billing_status?: string
          created_at?: string
          created_by?: string | null
          customer_id?: string | null
          document_path?: string | null
          expected_arrival_date?: string | null
          expected_ship_date?: string | null
          fulfilled_at?: string | null
          fulfilled_by_user_id?: string | null
          fulfillment_notes?: string | null
          fulfillment_resolution?: string | null
          fulfillment_status?: string
          id?: string
          inventory_owner?: string | null
          invoice_document_path?: string | null
          invoice_number?: string | null
          invoiced_at?: string | null
          invoicing_company_id?: string | null
          manually_closed_at?: string | null
          manually_closed_by?: string | null
          manually_closed_reason?: string | null
          needed_by?: string | null
          notes?: string | null
          order_date?: string | null
          order_status?: string
          order_type?: string
          organization_id: string
          placed_by?: string | null
          placed_by_external?: string | null
          placed_by_user_id?: string | null
          project_id?: string | null
          semen_company_id?: string | null
          supplier_invoice_number?: string | null
        }
        Update: {
          billing_status?: string
          created_at?: string
          created_by?: string | null
          customer_id?: string | null
          document_path?: string | null
          expected_arrival_date?: string | null
          expected_ship_date?: string | null
          fulfilled_at?: string | null
          fulfilled_by_user_id?: string | null
          fulfillment_notes?: string | null
          fulfillment_resolution?: string | null
          fulfillment_status?: string
          id?: string
          inventory_owner?: string | null
          invoice_document_path?: string | null
          invoice_number?: string | null
          invoiced_at?: string | null
          invoicing_company_id?: string | null
          manually_closed_at?: string | null
          manually_closed_by?: string | null
          manually_closed_reason?: string | null
          needed_by?: string | null
          notes?: string | null
          order_date?: string | null
          order_status?: string
          order_type?: string
          organization_id?: string
          placed_by?: string | null
          placed_by_external?: string | null
          placed_by_user_id?: string | null
          project_id?: string | null
          semen_company_id?: string | null
          supplier_invoice_number?: string | null
        }
        Relationships: [
          {
            foreignKeyName: "semen_orders_customer_id_fkey"
            columns: ["customer_id"]
            isOneToOne: false
            referencedRelation: "customers"
            referencedColumns: ["id"]
          },
          {
            foreignKeyName: "semen_orders_invoicing_company_id_fkey"
            columns: ["invoicing_company_id"]
            isOneToOne: false
            referencedRelation: "semen_companies"
            referencedColumns: ["id"]
          },
          {
            foreignKeyName: "semen_orders_organization_id_fkey"
            columns: ["organization_id"]
            isOneToOne: false
            referencedRelation: "organizations"
            referencedColumns: ["id"]
          },
          {
            foreignKeyName: "semen_orders_project_id_fkey"
            columns: ["project_id"]
            isOneToOne: false
            referencedRelation: "projects"
            referencedColumns: ["id"]
          },
          {
            foreignKeyName: "semen_orders_semen_company_id_fkey"
            columns: ["semen_company_id"]
            isOneToOne: false
            referencedRelation: "semen_companies"
            referencedColumns: ["id"]
          },
        ]
      }
      shipment_lines: {
        Row: {
          bull_catalog_id: string
          bull_code: string | null
          created_at: string
          custom_bull_name: string | null
          destination_canister: string
          destination_tank_id: string
          fulfills_customer_order_id: string | null
          id: string
          organization_id: string
          owner_company_id: string | null
          owner_customer_id: string | null
          shipment_id: string
          units: number
          units_applied_to_order: number | null
        }
        Insert: {
          bull_catalog_id: string
          bull_code?: string | null
          created_at?: string
          custom_bull_name?: string | null
          destination_canister: string
          destination_tank_id: string
          fulfills_customer_order_id?: string | null
          id?: string
          organization_id: string
          owner_company_id?: string | null
          owner_customer_id?: string | null
          shipment_id: string
          units: number
          units_applied_to_order?: number | null
        }
        Update: {
          bull_catalog_id?: string
          bull_code?: string | null
          created_at?: string
          custom_bull_name?: string | null
          destination_canister?: string
          destination_tank_id?: string
          fulfills_customer_order_id?: string | null
          id?: string
          organization_id?: string
          owner_company_id?: string | null
          owner_customer_id?: string | null
          shipment_id?: string
          units?: number
          units_applied_to_order?: number | null
        }
        Relationships: [
          {
            foreignKeyName: "shipment_lines_bull_catalog_id_fkey"
            columns: ["bull_catalog_id"]
            isOneToOne: false
            referencedRelation: "bulls_catalog"
            referencedColumns: ["id"]
          },
          {
            foreignKeyName: "shipment_lines_bull_catalog_id_fkey"
            columns: ["bull_catalog_id"]
            isOneToOne: false
            referencedRelation: "view_bull_planning"
            referencedColumns: ["bull_catalog_id"]
          },
          {
            foreignKeyName: "shipment_lines_destination_tank_id_fkey"
            columns: ["destination_tank_id"]
            isOneToOne: false
            referencedRelation: "tanks"
            referencedColumns: ["id"]
          },
          {
            foreignKeyName: "shipment_lines_fulfills_customer_order_id_fkey"
            columns: ["fulfills_customer_order_id"]
            isOneToOne: false
            referencedRelation: "semen_orders"
            referencedColumns: ["id"]
          },
          {
            foreignKeyName: "shipment_lines_owner_company_id_fkey"
            columns: ["owner_company_id"]
            isOneToOne: false
            referencedRelation: "semen_companies"
            referencedColumns: ["id"]
          },
          {
            foreignKeyName: "shipment_lines_owner_customer_id_fkey"
            columns: ["owner_customer_id"]
            isOneToOne: false
            referencedRelation: "customers"
            referencedColumns: ["id"]
          },
          {
            foreignKeyName: "shipment_lines_shipment_id_fkey"
            columns: ["shipment_id"]
            isOneToOne: false
            referencedRelation: "shipments"
            referencedColumns: ["id"]
          },
        ]
      }
      shipment_po_links: {
        Row: {
          created_at: string
          inventory_order_id: string
          organization_id: string
          shipment_id: string
        }
        Insert: {
          created_at?: string
          inventory_order_id: string
          organization_id: string
          shipment_id: string
        }
        Update: {
          created_at?: string
          inventory_order_id?: string
          organization_id?: string
          shipment_id?: string
        }
        Relationships: [
          {
            foreignKeyName: "shipment_po_links_inventory_order_id_fkey"
            columns: ["inventory_order_id"]
            isOneToOne: false
            referencedRelation: "semen_orders"
            referencedColumns: ["id"]
          },
          {
            foreignKeyName: "shipment_po_links_shipment_id_fkey"
            columns: ["shipment_id"]
            isOneToOne: false
            referencedRelation: "shipments"
            referencedColumns: ["id"]
          },
        ]
      }
      shipments: {
        Row: {
          confirmed_at: string | null
          confirmed_by: string | null
          created_at: string
          created_by: string | null
          customer_id: string | null
          document_path: string | null
          id: string
          notes: string | null
          organization_id: string
          received_by: string
          received_date: string
          reconciliation_snapshot: Json | null
          semen_company_id: string | null
          semen_order_id: string | null
          shipment_type: string
          status: string
          supplier_invoice_number: string | null
          tracking_number: string | null
          updated_at: string
        }
        Insert: {
          confirmed_at?: string | null
          confirmed_by?: string | null
          created_at?: string
          created_by?: string | null
          customer_id?: string | null
          document_path?: string | null
          id?: string
          notes?: string | null
          organization_id: string
          received_by: string
          received_date?: string
          reconciliation_snapshot?: Json | null
          semen_company_id?: string | null
          semen_order_id?: string | null
          shipment_type?: string
          status?: string
          supplier_invoice_number?: string | null
          tracking_number?: string | null
          updated_at?: string
        }
        Update: {
          confirmed_at?: string | null
          confirmed_by?: string | null
          created_at?: string
          created_by?: string | null
          customer_id?: string | null
          document_path?: string | null
          id?: string
          notes?: string | null
          organization_id?: string
          received_by?: string
          received_date?: string
          reconciliation_snapshot?: Json | null
          semen_company_id?: string | null
          semen_order_id?: string | null
          shipment_type?: string
          status?: string
          supplier_invoice_number?: string | null
          tracking_number?: string | null
          updated_at?: string
        }
        Relationships: [
          {
            foreignKeyName: "shipments_customer_id_fkey"
            columns: ["customer_id"]
            isOneToOne: false
            referencedRelation: "customers"
            referencedColumns: ["id"]
          },
          {
            foreignKeyName: "shipments_organization_id_fkey"
            columns: ["organization_id"]
            isOneToOne: false
            referencedRelation: "organizations"
            referencedColumns: ["id"]
          },
          {
            foreignKeyName: "shipments_received_by_fkey"
            columns: ["received_by"]
            isOneToOne: false
            referencedRelation: "organization_members"
            referencedColumns: ["id"]
          },
          {
            foreignKeyName: "shipments_semen_company_id_fkey"
            columns: ["semen_company_id"]
            isOneToOne: false
            referencedRelation: "semen_companies"
            referencedColumns: ["id"]
          },
          {
            foreignKeyName: "shipments_semen_order_id_fkey"
            columns: ["semen_order_id"]
            isOneToOne: false
            referencedRelation: "semen_orders"
            referencedColumns: ["id"]
          },
        ]
      }
      stud_code_registry: {
        Row: {
          company: string
          created_at: string
          notes: string | null
          stud_code: string
          updated_at: string
        }
        Insert: {
          company: string
          created_at?: string
          notes?: string | null
          stud_code: string
          updated_at?: string
        }
        Update: {
          company?: string
          created_at?: string
          notes?: string | null
          stud_code?: string
          updated_at?: string
        }
        Relationships: []
      }
      tank_fills: {
        Row: {
          created_at: string
          fill_date: string
          fill_type: string | null
          filled_by: string | null
          id: string
          notes: string | null
          organization_id: string
          tank_id: string
        }
        Insert: {
          created_at?: string
          fill_date: string
          fill_type?: string | null
          filled_by?: string | null
          id?: string
          notes?: string | null
          organization_id: string
          tank_id: string
        }
        Update: {
          created_at?: string
          fill_date?: string
          fill_type?: string | null
          filled_by?: string | null
          id?: string
          notes?: string | null
          organization_id?: string
          tank_id?: string
        }
        Relationships: [
          {
            foreignKeyName: "tank_fills_organization_id_fkey"
            columns: ["organization_id"]
            isOneToOne: false
            referencedRelation: "organizations"
            referencedColumns: ["id"]
          },
          {
            foreignKeyName: "tank_fills_tank_id_fkey"
            columns: ["tank_id"]
            isOneToOne: false
            referencedRelation: "tanks"
            referencedColumns: ["id"]
          },
        ]
      }
      tank_inventory: {
        Row: {
          bull_catalog_id: string
          bull_code: string
          canister: string
          created_at: string
          custom_bull_name: string | null
          customer_id: string | null
          id: string
          inventoried_at: string | null
          inventoried_by: string | null
          item_type: string
          notes: string | null
          organization_id: string
          owner: string | null
          owner_company_id: string | null
          owner_customer_id: string | null
          owner_type: string | null
          source_type: string
          storage_type: string | null
          sub_canister: string | null
          tank_id: string
          units: number
        }
        Insert: {
          bull_catalog_id: string
          bull_code: string
          canister: string
          created_at?: string
          custom_bull_name?: string | null
          customer_id?: string | null
          id?: string
          inventoried_at?: string | null
          inventoried_by?: string | null
          item_type?: string
          notes?: string | null
          organization_id: string
          owner?: string | null
          owner_company_id?: string | null
          owner_customer_id?: string | null
          owner_type?: string | null
          source_type?: string
          storage_type?: string | null
          sub_canister?: string | null
          tank_id: string
          units?: number
        }
        Update: {
          bull_catalog_id?: string
          bull_code?: string
          canister?: string
          created_at?: string
          custom_bull_name?: string | null
          customer_id?: string | null
          id?: string
          inventoried_at?: string | null
          inventoried_by?: string | null
          item_type?: string
          notes?: string | null
          organization_id?: string
          owner?: string | null
          owner_company_id?: string | null
          owner_customer_id?: string | null
          owner_type?: string | null
          source_type?: string
          storage_type?: string | null
          sub_canister?: string | null
          tank_id?: string
          units?: number
        }
        Relationships: [
          {
            foreignKeyName: "tank_inventory_bull_catalog_id_fkey"
            columns: ["bull_catalog_id"]
            isOneToOne: false
            referencedRelation: "bulls_catalog"
            referencedColumns: ["id"]
          },
          {
            foreignKeyName: "tank_inventory_bull_catalog_id_fkey"
            columns: ["bull_catalog_id"]
            isOneToOne: false
            referencedRelation: "view_bull_planning"
            referencedColumns: ["bull_catalog_id"]
          },
          {
            foreignKeyName: "tank_inventory_customer_id_fkey"
            columns: ["customer_id"]
            isOneToOne: false
            referencedRelation: "customers"
            referencedColumns: ["id"]
          },
          {
            foreignKeyName: "tank_inventory_organization_id_fkey"
            columns: ["organization_id"]
            isOneToOne: false
            referencedRelation: "organizations"
            referencedColumns: ["id"]
          },
          {
            foreignKeyName: "tank_inventory_owner_company_id_fkey"
            columns: ["owner_company_id"]
            isOneToOne: false
            referencedRelation: "semen_companies"
            referencedColumns: ["id"]
          },
          {
            foreignKeyName: "tank_inventory_owner_customer_id_fkey"
            columns: ["owner_customer_id"]
            isOneToOne: false
            referencedRelation: "customers"
            referencedColumns: ["id"]
          },
          {
            foreignKeyName: "tank_inventory_tank_id_fkey"
            columns: ["tank_id"]
            isOneToOne: false
            referencedRelation: "tanks"
            referencedColumns: ["id"]
          },
        ]
      }
      tank_movements: {
        Row: {
          created_at: string
          customer_id: string | null
          id: string
          location_status_after: string
          movement_date: string
          movement_type: string
          notes: string | null
          organization_id: string
          performed_by: string | null
          project_id: string | null
          tank_id: string
        }
        Insert: {
          created_at?: string
          customer_id?: string | null
          id?: string
          location_status_after?: string
          movement_date: string
          movement_type: string
          notes?: string | null
          organization_id: string
          performed_by?: string | null
          project_id?: string | null
          tank_id: string
        }
        Update: {
          created_at?: string
          customer_id?: string | null
          id?: string
          location_status_after?: string
          movement_date?: string
          movement_type?: string
          notes?: string | null
          organization_id?: string
          performed_by?: string | null
          project_id?: string | null
          tank_id?: string
        }
        Relationships: [
          {
            foreignKeyName: "tank_movements_customer_id_fkey"
            columns: ["customer_id"]
            isOneToOne: false
            referencedRelation: "customers"
            referencedColumns: ["id"]
          },
          {
            foreignKeyName: "tank_movements_organization_id_fkey"
            columns: ["organization_id"]
            isOneToOne: false
            referencedRelation: "organizations"
            referencedColumns: ["id"]
          },
          {
            foreignKeyName: "tank_movements_project_id_fkey"
            columns: ["project_id"]
            isOneToOne: false
            referencedRelation: "projects"
            referencedColumns: ["id"]
          },
          {
            foreignKeyName: "tank_movements_tank_id_fkey"
            columns: ["tank_id"]
            isOneToOne: false
            referencedRelation: "tanks"
            referencedColumns: ["id"]
          },
        ]
      }
      tank_pack_lines: {
        Row: {
          bull_catalog_id: string | null
          bull_code: string | null
          bull_name: string
          created_at: string
          field_canister: string | null
          id: string
          is_billable: boolean
          source_canister: string | null
          source_tank_id: string
          tank_pack_id: string
          units: number
        }
        Insert: {
          bull_catalog_id?: string | null
          bull_code?: string | null
          bull_name: string
          created_at?: string
          field_canister?: string | null
          id?: string
          is_billable?: boolean
          source_canister?: string | null
          source_tank_id: string
          tank_pack_id: string
          units: number
        }
        Update: {
          bull_catalog_id?: string | null
          bull_code?: string | null
          bull_name?: string
          created_at?: string
          field_canister?: string | null
          id?: string
          is_billable?: boolean
          source_canister?: string | null
          source_tank_id?: string
          tank_pack_id?: string
          units?: number
        }
        Relationships: [
          {
            foreignKeyName: "tank_pack_lines_bull_catalog_id_fkey"
            columns: ["bull_catalog_id"]
            isOneToOne: false
            referencedRelation: "bulls_catalog"
            referencedColumns: ["id"]
          },
          {
            foreignKeyName: "tank_pack_lines_bull_catalog_id_fkey"
            columns: ["bull_catalog_id"]
            isOneToOne: false
            referencedRelation: "view_bull_planning"
            referencedColumns: ["bull_catalog_id"]
          },
          {
            foreignKeyName: "tank_pack_lines_source_tank_id_fkey"
            columns: ["source_tank_id"]
            isOneToOne: false
            referencedRelation: "tanks"
            referencedColumns: ["id"]
          },
          {
            foreignKeyName: "tank_pack_lines_tank_pack_id_fkey"
            columns: ["tank_pack_id"]
            isOneToOne: false
            referencedRelation: "tank_packs"
            referencedColumns: ["id"]
          },
        ]
      }
      tank_pack_orders: {
        Row: {
          allocated_units: number | null
          created_at: string
          id: string
          semen_order_id: string
          tank_pack_id: string
        }
        Insert: {
          allocated_units?: number | null
          created_at?: string
          id?: string
          semen_order_id: string
          tank_pack_id: string
        }
        Update: {
          allocated_units?: number | null
          created_at?: string
          id?: string
          semen_order_id?: string
          tank_pack_id?: string
        }
        Relationships: [
          {
            foreignKeyName: "tank_pack_orders_semen_order_id_fkey"
            columns: ["semen_order_id"]
            isOneToOne: false
            referencedRelation: "semen_orders"
            referencedColumns: ["id"]
          },
          {
            foreignKeyName: "tank_pack_orders_tank_pack_id_fkey"
            columns: ["tank_pack_id"]
            isOneToOne: false
            referencedRelation: "tank_packs"
            referencedColumns: ["id"]
          },
        ]
      }
      tank_pack_projects: {
        Row: {
          created_at: string
          id: string
          project_id: string
          tank_pack_id: string
        }
        Insert: {
          created_at?: string
          id?: string
          project_id: string
          tank_pack_id: string
        }
        Update: {
          created_at?: string
          id?: string
          project_id?: string
          tank_pack_id?: string
        }
        Relationships: [
          {
            foreignKeyName: "tank_pack_projects_project_id_fkey"
            columns: ["project_id"]
            isOneToOne: false
            referencedRelation: "projects"
            referencedColumns: ["id"]
          },
          {
            foreignKeyName: "tank_pack_projects_tank_pack_id_fkey"
            columns: ["tank_pack_id"]
            isOneToOne: false
            referencedRelation: "tank_packs"
            referencedColumns: ["id"]
          },
        ]
      }
      tank_packs: {
        Row: {
          closed_at: string | null
          closed_by: string | null
          closed_by_external: string | null
          closed_by_user_id: string | null
          created_at: string
          customer_id: string | null
          delivered_at: string | null
          destination_address: string | null
          destination_name: string | null
          document_path: string | null
          field_tank_id: string
          id: string
          notes: string | null
          organization_id: string
          pack_type: string
          packed_at: string
          packed_by: string | null
          packed_by_external: string | null
          packed_by_user_id: string | null
          picked_up_at: string | null
          pickup_by: string | null
          pickup_by_external: string | null
          pickup_by_user_id: string | null
          return_carrier: string | null
          return_tracking_number: string | null
          shipped_at: string | null
          shipping_carrier: string | null
          status: string
          tank_return_expected: boolean
          tank_returned_at: string | null
          tracking_number: string | null
          unpacked_at: string | null
          unpacked_by: string | null
          unpacked_by_external: string | null
          unpacked_by_user_id: string | null
          updated_at: string
        }
        Insert: {
          closed_at?: string | null
          closed_by?: string | null
          closed_by_external?: string | null
          closed_by_user_id?: string | null
          created_at?: string
          customer_id?: string | null
          delivered_at?: string | null
          destination_address?: string | null
          destination_name?: string | null
          document_path?: string | null
          field_tank_id: string
          id?: string
          notes?: string | null
          organization_id: string
          pack_type?: string
          packed_at?: string
          packed_by?: string | null
          packed_by_external?: string | null
          packed_by_user_id?: string | null
          picked_up_at?: string | null
          pickup_by?: string | null
          pickup_by_external?: string | null
          pickup_by_user_id?: string | null
          return_carrier?: string | null
          return_tracking_number?: string | null
          shipped_at?: string | null
          shipping_carrier?: string | null
          status?: string
          tank_return_expected?: boolean
          tank_returned_at?: string | null
          tracking_number?: string | null
          unpacked_at?: string | null
          unpacked_by?: string | null
          unpacked_by_external?: string | null
          unpacked_by_user_id?: string | null
          updated_at?: string
        }
        Update: {
          closed_at?: string | null
          closed_by?: string | null
          closed_by_external?: string | null
          closed_by_user_id?: string | null
          created_at?: string
          customer_id?: string | null
          delivered_at?: string | null
          destination_address?: string | null
          destination_name?: string | null
          document_path?: string | null
          field_tank_id?: string
          id?: string
          notes?: string | null
          organization_id?: string
          pack_type?: string
          packed_at?: string
          packed_by?: string | null
          packed_by_external?: string | null
          packed_by_user_id?: string | null
          picked_up_at?: string | null
          pickup_by?: string | null
          pickup_by_external?: string | null
          pickup_by_user_id?: string | null
          return_carrier?: string | null
          return_tracking_number?: string | null
          shipped_at?: string | null
          shipping_carrier?: string | null
          status?: string
          tank_return_expected?: boolean
          tank_returned_at?: string | null
          tracking_number?: string | null
          unpacked_at?: string | null
          unpacked_by?: string | null
          unpacked_by_external?: string | null
          unpacked_by_user_id?: string | null
          updated_at?: string
        }
        Relationships: [
          {
            foreignKeyName: "tank_packs_customer_id_fkey"
            columns: ["customer_id"]
            isOneToOne: false
            referencedRelation: "customers"
            referencedColumns: ["id"]
          },
          {
            foreignKeyName: "tank_packs_field_tank_id_fkey"
            columns: ["field_tank_id"]
            isOneToOne: false
            referencedRelation: "tanks"
            referencedColumns: ["id"]
          },
          {
            foreignKeyName: "tank_packs_organization_id_fkey"
            columns: ["organization_id"]
            isOneToOne: false
            referencedRelation: "organizations"
            referencedColumns: ["id"]
          },
        ]
      }
      tank_unpack_lines: {
        Row: {
          bull_catalog_id: string | null
          bull_code: string | null
          bull_name: string
          created_at: string
          destination_canister: string | null
          destination_tank_id: string
          id: string
          tank_pack_id: string
          units_returned: number
        }
        Insert: {
          bull_catalog_id?: string | null
          bull_code?: string | null
          bull_name: string
          created_at?: string
          destination_canister?: string | null
          destination_tank_id: string
          id?: string
          tank_pack_id: string
          units_returned: number
        }
        Update: {
          bull_catalog_id?: string | null
          bull_code?: string | null
          bull_name?: string
          created_at?: string
          destination_canister?: string | null
          destination_tank_id?: string
          id?: string
          tank_pack_id?: string
          units_returned?: number
        }
        Relationships: [
          {
            foreignKeyName: "tank_unpack_lines_bull_catalog_id_fkey"
            columns: ["bull_catalog_id"]
            isOneToOne: false
            referencedRelation: "bulls_catalog"
            referencedColumns: ["id"]
          },
          {
            foreignKeyName: "tank_unpack_lines_bull_catalog_id_fkey"
            columns: ["bull_catalog_id"]
            isOneToOne: false
            referencedRelation: "view_bull_planning"
            referencedColumns: ["bull_catalog_id"]
          },
          {
            foreignKeyName: "tank_unpack_lines_destination_tank_id_fkey"
            columns: ["destination_tank_id"]
            isOneToOne: false
            referencedRelation: "tanks"
            referencedColumns: ["id"]
          },
          {
            foreignKeyName: "tank_unpack_lines_tank_pack_id_fkey"
            columns: ["tank_pack_id"]
            isOneToOne: false
            referencedRelation: "tank_packs"
            referencedColumns: ["id"]
          },
        ]
      }
      tanks: {
        Row: {
          canister_capacity: number | null
          created_at: string
          customer_id: string | null
          description: string | null
          eid: string | null
          id: string
          location_status: string
          model: string | null
          nitrogen_status: string
          organization_id: string
          owner_company_id: string | null
          owner_customer_id: string | null
          owner_type: string | null
          serial_number: string | null
          tank_name: string | null
          tank_number: string
          tank_type: string
          total_canisters: number | null
          tracking_level: string
        }
        Insert: {
          canister_capacity?: number | null
          created_at?: string
          customer_id?: string | null
          description?: string | null
          eid?: string | null
          id?: string
          location_status?: string
          model?: string | null
          nitrogen_status?: string
          organization_id: string
          owner_company_id?: string | null
          owner_customer_id?: string | null
          owner_type?: string | null
          serial_number?: string | null
          tank_name?: string | null
          tank_number: string
          tank_type?: string
          total_canisters?: number | null
          tracking_level?: string
        }
        Update: {
          canister_capacity?: number | null
          created_at?: string
          customer_id?: string | null
          description?: string | null
          eid?: string | null
          id?: string
          location_status?: string
          model?: string | null
          nitrogen_status?: string
          organization_id?: string
          owner_company_id?: string | null
          owner_customer_id?: string | null
          owner_type?: string | null
          serial_number?: string | null
          tank_name?: string | null
          tank_number?: string
          tank_type?: string
          total_canisters?: number | null
          tracking_level?: string
        }
        Relationships: [
          {
            foreignKeyName: "tanks_customer_id_fkey"
            columns: ["customer_id"]
            isOneToOne: false
            referencedRelation: "customers"
            referencedColumns: ["id"]
          },
          {
            foreignKeyName: "tanks_organization_id_fkey"
            columns: ["organization_id"]
            isOneToOne: false
            referencedRelation: "organizations"
            referencedColumns: ["id"]
          },
          {
            foreignKeyName: "tanks_owner_company_id_fkey"
            columns: ["owner_company_id"]
            isOneToOne: false
            referencedRelation: "semen_companies"
            referencedColumns: ["id"]
          },
          {
            foreignKeyName: "tanks_owner_customer_id_fkey"
            columns: ["owner_customer_id"]
            isOneToOne: false
            referencedRelation: "customers"
            referencedColumns: ["id"]
          },
        ]
      }
    }
    Views: {
      order_items_summary: {
        Row: {
          bulls_summary: string | null
          items_detail: Json | null
          line_count: number | null
          semen_order_id: string | null
          total_units: number | null
        }
        Relationships: [
          {
            foreignKeyName: "semen_order_items_semen_order_id_fkey"
            columns: ["semen_order_id"]
            isOneToOne: false
            referencedRelation: "semen_orders"
            referencedColumns: ["id"]
          },
        ]
      }
      view_bull_planning: {
        Row: {
          active_projects: number | null
          bull_catalog_id: string | null
          bull_name: string | null
          company: string | null
          customer_order_count: number | null
          customer_orders: number | null
          customer_project_needs: number | null
          customer_supply: number | null
          incoming: number | null
          naab_code: string | null
          needed_by: string | null
          net_position: number | null
          on_hand: number | null
          project_needs: number | null
          status: string | null
        }
        Relationships: []
      }
    }
    Functions: {
      _check_receive_line_access: {
        Args: { _txn_id: string }
        Returns: {
          v_is_confirmed: boolean
          v_org_id: string
          v_role: string
          v_shipment_id: string
          v_shipment_status: string
          v_user_id: string
        }[]
      }
      accept_org_invite: {
        Args: { _token: string; _user_email: string; _user_id: string }
        Returns: Json
      }
      add_pack_line: { Args: { _input: Json }; Returns: Json }
      bulk_delete_projects: { Args: { _project_ids: string[] }; Returns: Json }
      cleanup_anonymous_projects: { Args: never; Returns: undefined }
      clear_transaction_context: { Args: never; Returns: undefined }
      close_customer_order_as_fulfilled: {
        Args: { _input: Json }
        Returns: Json
      }
      close_out_tank_pack: {
        Args: {
          _close_notes?: string
          _closed_at: string
          _closed_by: string
          _pack_id: string
        }
        Returns: Json
      }
      confirm_shipment: { Args: { _input: Json }; Returns: Json }
      create_organization_with_owner: {
        Args: { _name: string }
        Returns: string
      }
      customer_pickup: {
        Args: {
          _customer_id?: string
          _notes?: string
          _performed_by?: string
          _source_inventory_id: string
          _units?: number
        }
        Returns: Json
      }
      delete_pack_line: { Args: { _input: Json }; Returns: Json }
      delete_received_line: { Args: { _input: Json }; Returns: Json }
      delete_tank_pack: { Args: { _pack_id: string }; Returns: Json }
      edit_received_line: { Args: { _input: Json }; Returns: Json }
      edit_tank_pack: { Args: { _input: Json }; Returns: Json }
      export_auth_identities: { Args: never; Returns: Json[] }
      export_auth_users: { Args: never; Returns: Json[] }
      finalize_billing_inventory: { Args: { _input: Json }; Returns: Json }
      fulfill_order_lines: {
        Args: {
          _dest_tank_id?: string
          _is_pickup?: boolean
          _lines: Json
          _order_id: string
        }
        Returns: Json
      }
      get_billable_units_for_order: {
        Args: { _order_id: string }
        Returns: {
          bull_catalog_id: string
          bull_name: string
          naab_code: string
          units: number
        }[]
      }
      get_org_members: {
        Args: { _organization_id: string }
        Returns: {
          accepted: boolean
          email: string
          id: string
          invited_email: string
          role: string
          user_id: string
        }[]
      }
      get_org_role: {
        Args: { _organization_id: string; _user_id: string }
        Returns: string
      }
      list_storage_objects: {
        Args: { p_bucket_id: string }
        Returns: {
          created_at: string
          mimetype: string
          path: string
          size_bytes: number
          updated_at: string
        }[]
      }
      lookup_invite_by_token: {
        Args: { _token: string }
        Returns: {
          accepted: boolean
          expires_at: string
          invited_email: string
          org_name: string
          organization_id: string
          token: string
        }[]
      }
      lookup_org_by_invite_code: {
        Args: { _code: string }
        Returns: {
          id: string
          invite_code: string
          name: string
        }[]
      }
      mark_order_fulfilled: { Args: { _input: Json }; Returns: Json }
      mark_order_invoiced: { Args: { _input: Json }; Returns: Json }
      merge_bull_catalog: {
        Args: { _keeper_id: string; _loser_id: string }
        Returns: Json
      }
      move_received_units: { Args: { _input: Json }; Returns: Json }
      normalize_naab: { Args: { code: string }; Returns: string }
      pack_tank: { Args: { _input: Json }; Returns: Json }
      recalc_order_fulfillment: {
        Args: { _order_id: string }
        Returns: undefined
      }
      receive_shipment_items: {
        Args: { _lines: Json; _order_id: string }
        Returns: Json
      }
      receive_shipment_v2: { Args: { _input: Json }; Returns: Json }
      record_direct_sale: { Args: { _input: Json }; Returns: Json }
      run_all_beefsynch_tests: {
        Args: never
        Returns: {
          details: string
          status: string
          test_name: string
        }[]
      }
      run_consistency_checks: {
        Args: never
        Returns: {
          details: string
          status: string
          test_name: string
        }[]
      }
      run_health_checks: {
        Args: never
        Returns: {
          check_name: string
          fail_count: number
          sample_ids: string
          sort_order: number
          status: string
        }[]
      }
      run_workflow_tests: {
        Args: never
        Returns: {
          details: string
          status: string
          test_name: string
        }[]
      }
      save_reinventory: { Args: { _input: Json }; Returns: Json }
      set_transaction_context: {
        Args: {
          _customer_id?: string
          _is_billable_override?: boolean
          _notes?: string
          _project_id?: string
          _semen_order_id?: string
          _shipment_id?: string
          _tank_pack_id?: string
          _transaction_type?: string
          _user_id?: string
        }
        Returns: undefined
      }
      transfer_inventory: {
        Args: {
          _dest_canister: string
          _dest_sub_canister?: string
          _dest_tank_id: string
          _is_billable?: boolean
          _new_customer_id?: string
          _notes?: string
          _order_id?: string
          _performed_by?: string
          _source_inventory_id: string
          _units?: number
        }
        Returns: Json
      }
      unpack_tank: { Args: { _input: Json }; Returns: Json }
      update_pack_line: { Args: { _input: Json }; Returns: Json }
      user_org_ids: { Args: { _user_id: string }; Returns: string[] }
      withdraw_inventory: {
        Args: {
          _customer_id?: string
          _is_billable?: boolean
          _order_id?: string
          _performed_by?: string
          _reason: string
          _source_inventory_id: string
          _units: number
        }
        Returns: Json
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

