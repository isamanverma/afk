use parking_lot::Mutex;
use serde::{Deserialize, Serialize};
use std::collections::HashMap;
use std::fs;
use std::path::PathBuf;
use std::sync::Arc;
use tauri::async_runtime::JoinHandle;

/// Session state matching the original electron-store schema
#[derive(Debug, Clone, Serialize, Deserialize, Default)]
pub struct Session {
    #[serde(skip_serializing_if = "Option::is_none")]
    pub end_time: Option<String>,
    #[serde(skip_serializing_if = "Option::is_none")]
    pub start_time: Option<String>,
    #[serde(skip_serializing_if = "Option::is_none")]
    pub remaining_time: Option<String>,
    #[serde(default)]
    pub paused: bool,
    #[serde(skip_serializing_if = "Option::is_none")]
    pub paused_at: Option<String>,
}

/// Default configuration values matching the original constants.js
pub mod defaults {
    pub const DEFAULT_INTERVAL_DURATION: u64 = 1500; // 25 minutes in seconds
    pub const DEFAULT_BREAK_DURATION: u64 = 30; // 30 seconds
    pub const BREAK_NOTIFICATION_AT: u64 = 60; // 1 minute before break
    pub const DEFAULT_LONG_BREAK_DURATION: u64 = 120; // 2 minutes
    pub const DEFAULT_LONG_BREAK_AFTER: u64 = 2; // After 2 short breaks
}

/// Get default settings as a HashMap
pub fn get_default_settings() -> HashMap<String, serde_json::Value> {
    let mut settings = HashMap::new();
    
    settings.insert("launch_at_login".to_string(), serde_json::json!(true));
    settings.insert("start_timer".to_string(), serde_json::json!(false));
    settings.insert("session_duration".to_string(), serde_json::json!(defaults::DEFAULT_INTERVAL_DURATION));
    settings.insert("break_duration".to_string(), serde_json::json!(defaults::DEFAULT_BREAK_DURATION));
    settings.insert("pre_break_reminder_enabled".to_string(), serde_json::json!(true));
    settings.insert("pre_break_reminder_at".to_string(), serde_json::json!(defaults::BREAK_NOTIFICATION_AT));
    settings.insert("reset_timer_enabled".to_string(), serde_json::json!(true));
    settings.insert("toolbar_timer_style".to_string(), serde_json::json!("remaining"));
    settings.insert("long_break_enabled".to_string(), serde_json::json!(true));
    settings.insert("long_break_duration".to_string(), serde_json::json!(defaults::DEFAULT_LONG_BREAK_DURATION));
    settings.insert("long_break_after".to_string(), serde_json::json!(defaults::DEFAULT_LONG_BREAK_AFTER));
    settings.insert("short_break_count".to_string(), serde_json::json!(0u64));
    
    // Chime settings (OFF by default - non-intrusive)
    settings.insert("chime_enabled".to_string(), serde_json::json!(false));
    settings.insert("chime_on_session_start".to_string(), serde_json::json!(true));
    settings.insert("chime_on_break_start".to_string(), serde_json::json!(true));
    settings.insert("chime_on_break_end".to_string(), serde_json::json!(true));
    settings.insert("chime_on_reminder".to_string(), serde_json::json!(false));
    
    // Keyboard shortcuts setting
    settings.insert("shortcuts_enabled".to_string(), serde_json::json!(true));
    
    settings
}

/// Application state managed by Tauri
pub struct AppState {
    /// Current session data
    pub session: Mutex<Session>,
    /// Handle to the running session timer task
    pub session_timer_handle: Mutex<Option<JoinHandle<()>>>,
    /// Handle to the running break timer task
    pub break_timer_handle: Mutex<Option<JoinHandle<()>>>,
    /// Flag to signal timer cancellation
    pub timer_cancelled: Arc<Mutex<bool>>,
    /// Flag to signal break timer cancellation
    pub break_cancelled: Arc<Mutex<bool>>,
    /// Settings (persisted to disk)
    pub settings: Mutex<HashMap<String, serde_json::Value>>,
    /// Path to settings file
    pub settings_path: Mutex<Option<PathBuf>>,
    /// Short break count for long break calculation
    pub short_break_count: Mutex<u64>,
    /// Flag to track if user is currently on a break
    pub on_break: Mutex<bool>,
    /// Flag to prevent recursive break window close handling
    pub break_closing: Mutex<bool>,
}

impl AppState {
    pub fn new() -> Self {
        Self {
            session: Mutex::new(Session::default()),
            session_timer_handle: Mutex::new(None),
            break_timer_handle: Mutex::new(None),
            timer_cancelled: Arc::new(Mutex::new(false)),
            break_cancelled: Arc::new(Mutex::new(false)),
            settings: Mutex::new(get_default_settings()),
            settings_path: Mutex::new(None),
            short_break_count: Mutex::new(0),
            on_break: Mutex::new(false),
            break_closing: Mutex::new(false),
        }
    }
    
    /// Initialize settings path and load from disk
    pub fn init_persistence(&self, app_data_dir: PathBuf) {
        // Ensure directory exists
        if let Err(e) = fs::create_dir_all(&app_data_dir) {
            eprintln!("Failed to create app data directory: {}", e);
            return;
        }
        
        let settings_file = app_data_dir.join("settings.json");
        *self.settings_path.lock() = Some(settings_file.clone());
        
        // Load from disk
        self.load_settings();
    }
    
    /// Load settings from disk, merging with defaults
    pub fn load_settings(&self) {
        let path = self.settings_path.lock().clone();
        let Some(path) = path else { return };
        
        if !path.exists() {
            // No settings file - save defaults
            self.save_settings();
            return;
        }
        
        match fs::read_to_string(&path) {
            Ok(contents) => {
                match serde_json::from_str::<HashMap<String, serde_json::Value>>(&contents) {
                    Ok(loaded) => {
                        // Merge loaded settings with defaults (defaults fill in missing keys)
                        let defaults = get_default_settings();
                        let mut settings = self.settings.lock();
                        
                        // Start with defaults
                        *settings = defaults;
                        
                        // Override with loaded values
                        for (key, value) in loaded {
                            settings.insert(key, value);
                        }
                        
                        println!("Settings loaded from: {}", path.display());
                    }
                    Err(e) => {
                        eprintln!("Failed to parse settings file: {}", e);
                        // Keep defaults
                    }
                }
            }
            Err(e) => {
                eprintln!("Failed to read settings file: {}", e);
                // Keep defaults
            }
        }
    }
    
    /// Save current settings to disk
    pub fn save_settings(&self) {
        let path = self.settings_path.lock().clone();
        let Some(path) = path else { return };
        
        let settings = self.settings.lock();
        
        match serde_json::to_string_pretty(&*settings) {
            Ok(json) => {
                if let Err(e) = fs::write(&path, json) {
                    eprintln!("Failed to write settings file: {}", e);
                }
            }
            Err(e) => {
                eprintln!("Failed to serialize settings: {}", e);
            }
        }
    }
    
    /// Reset all settings to defaults and save
    pub fn reset_to_defaults(&self) {
        *self.settings.lock() = get_default_settings();
        self.save_settings();
    }
    
    /// Get the settings file path
    pub fn get_settings_path(&self) -> Option<String> {
        self.settings_path.lock().as_ref().map(|p| p.display().to_string())
    }
    
    /// Get a setting value
    pub fn get_setting(&self, key: &str) -> Option<serde_json::Value> {
        self.settings.lock().get(key).cloned()
    }
    
    /// Set a setting value
    pub fn set_setting(&self, key: &str, value: serde_json::Value) {
        self.settings.lock().insert(key.to_string(), value);
    }
    
    /// Get a setting as boolean
    pub fn get_setting_bool(&self, key: &str) -> bool {
        self.settings
            .lock()
            .get(key)
            .and_then(|v| v.as_bool())
            .unwrap_or(false)
    }
    
    /// Get a setting as u64
    pub fn get_setting_u64(&self, key: &str) -> u64 {
        self.settings
            .lock()
            .get(key)
            .and_then(|v| v.as_u64())
            .unwrap_or(0)
    }
    
    /// Get a setting as string
    pub fn get_setting_string(&self, key: &str) -> String {
        self.settings
            .lock()
            .get(key)
            .and_then(|v| v.as_str())
            .unwrap_or("")
            .to_string()
    }
    
    /// Get current session
    pub fn get_session(&self) -> Session {
        self.session.lock().clone()
    }
    
    /// Update session
    pub fn update_session<F>(&self, f: F)
    where
        F: FnOnce(&mut Session),
    {
        let mut session = self.session.lock();
        f(&mut session);
    }
    
    /// Reset session
    pub fn reset_session(&self) {
        let mut session = self.session.lock();
        *session = Session::default();
    }
    
    /// Check if session is active (has end_time and not paused)
    pub fn is_session_active(&self) -> bool {
        let session = self.session.lock();
        session.end_time.is_some() && !session.paused
    }
    
    /// Get short break count
    pub fn get_short_break_count(&self) -> u64 {
        *self.short_break_count.lock()
    }
    
    /// Increment short break count
    pub fn increment_short_break_count(&self) {
        let mut count = self.short_break_count.lock();
        *count += 1;
    }
    
    /// Reset short break count
    pub fn reset_short_break_count(&self) {
        *self.short_break_count.lock() = 0;
    }
    
    /// Cancel the current timer
    pub fn cancel_timer(&self) {
        *self.timer_cancelled.lock() = true;
        if let Some(handle) = self.session_timer_handle.lock().take() {
            handle.abort();
        }
    }
    
    /// Reset timer cancellation flag
    pub fn reset_timer_cancelled(&self) {
        *self.timer_cancelled.lock() = false;
    }
    
    /// Check if user is currently on a break
    pub fn is_on_break(&self) -> bool {
        *self.on_break.lock()
    }
    
    /// Set the on-break state
    pub fn set_on_break(&self, value: bool) {
        *self.on_break.lock() = value;
    }
    
    /// Cancel the break timer
    pub fn cancel_break_timer(&self) {
        *self.break_cancelled.lock() = true;
        if let Some(handle) = self.break_timer_handle.lock().take() {
            handle.abort();
        }
    }
    
    /// Reset break timer cancellation flag
    pub fn reset_break_cancelled(&self) {
        *self.break_cancelled.lock() = false;
    }
    
    /// Check if break windows are being closed programmatically
    pub fn is_break_closing(&self) -> bool {
        *self.break_closing.lock()
    }
    
    /// Set the break-closing flag
    pub fn set_break_closing(&self, value: bool) {
        *self.break_closing.lock() = value;
    }
}

impl Default for AppState {
    fn default() -> Self {
        Self::new()
    }
}
