export interface Settings {
  reduce_motion: boolean;
  muted: boolean;
  high_contrast: boolean;
  roaming_enabled: boolean;
  break_reminders_enabled: boolean;
  break_interval_minutes: number;
  detect_active_app: boolean;
  ai_enabled: boolean;
  ai_api_key_set: boolean;
}

// All optional — only send the fields the user actually changed.
export interface SettingsUpdate {
  reduce_motion?: boolean;
  muted?: boolean;
  high_contrast?: boolean;
  roaming_enabled?: boolean;
  break_reminders_enabled?: boolean;
  break_interval_minutes?: number;
  detect_active_app?: boolean;
  ai_enabled?: boolean;
  ai_api_key?: string;
}

export const DEFAULT_SETTINGS: Settings = {
  reduce_motion: false,
  muted: false,
  high_contrast: false,
  roaming_enabled: true,
  break_reminders_enabled: true,
  break_interval_minutes: 30,
  detect_active_app: false,
  ai_enabled: false,
  ai_api_key_set: false,
};
