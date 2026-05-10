use tauri::{AppHandle, Manager};
use tauri_plugin_global_shortcut::{GlobalShortcutExt, Shortcut};

use crate::commands;
use crate::state::AppState;

/// Register global keyboard shortcuts
pub fn register_shortcuts(app: &AppHandle) -> Result<(), Box<dyn std::error::Error>> {
    // Check if shortcuts are enabled in settings
    let state = app.state::<AppState>();
    if !state.get_setting_bool("shortcuts_enabled") {
        println!("⌨️  Keyboard shortcuts disabled in settings");
        return Ok(());
    }
    
    let shortcuts_to_register = [
        ("CommandOrControl+Shift+B", "Take break"),
        ("CommandOrControl+Shift+P", "Pause/Resume"),
        ("CommandOrControl+Shift+S", "Skip break"),
        ("CommandOrControl+Shift+N", "Start session"),
    ];
    
    for (shortcut_str, name) in shortcuts_to_register {
        match shortcut_str.parse::<Shortcut>() {
            Ok(shortcut) => {
                match app.global_shortcut().register(shortcut.clone()) {
                    Ok(_) => println!("✓ Registered shortcut: {} ({})", shortcut_str, name),
                    Err(e) => eprintln!("✗ Failed to register {}: {:?}", shortcut_str, e),
                }
            }
            Err(e) => eprintln!("✗ Failed to parse shortcut {}: {:?}", shortcut_str, e),
        }
    }
    
    Ok(())
}

/// Handle a triggered shortcut (called from main.rs)
/// macOS format: "shift+super+KeyX" where X is the letter
/// All shortcuts work as toggles
pub async fn handle_shortcut<R: tauri::Runtime>(app: &tauri::AppHandle<R>, shortcut: &str) {
    // Check if shortcuts are enabled
    let state = app.state::<AppState>();
    if !state.get_setting_bool("shortcuts_enabled") {
        return;
    }
    
    println!("Shortcut triggered: {}", shortcut);
    
    // Extract the key from format like "shift+super+KeyB" or "Shift+Command+B"
    let s = shortcut.to_uppercase();
    
    // Match based on the key letter at the end
    let action = if s.ends_with("KEYB") || s.ends_with("+B") {
        Some("break")
    } else if s.ends_with("KEYP") || s.ends_with("+P") {
        Some("pause")
    } else if s.ends_with("KEYS") || s.ends_with("+S") {
        Some("skip")
    } else if s.ends_with("KEYN") || s.ends_with("+N") {
        Some("start")
    } else {
        None
    };
    
    match action {
        Some("break") => {
            // Toggle: if on break → end break, else → take break
            if state.is_on_break() {
                println!("→ End break (toggle)");
                let _ = commands::end_break(app.clone()).await;
            } else if state.is_session_active() {
                println!("→ Take break now");
                let _ = commands::take_break_now(app.clone()).await;
            } else {
                println!("  (no active session)");
            }
        }
        Some("pause") => {
            // Toggle: pause ↔ resume
            let session = state.get_session();
            if session.paused {
                println!("→ Resume session");
                let _ = commands::resume_session(app.clone()).await;
            } else if session.end_time.is_some() {
                println!("→ Pause session");
                let _ = commands::pause_session(app.clone()).await;
            } else {
                println!("  (no active session)");
            }
        }
        Some("skip") => {
            // Skip current break
            if state.is_on_break() {
                println!("→ Skip break");
                let _ = commands::skip_break(app.clone()).await;
            } else {
                println!("  (not on break)");
            }
        }
        Some("start") => {
            // Toggle: start ↔ end session
            if state.is_on_break() {
                println!("→ End break & start session");
                let _ = commands::end_break(app.clone()).await;
            } else if state.is_session_active() {
                println!("→ End session (toggle)");
                let _ = commands::end_session(app.clone()).await;
            } else {
                println!("→ Start session");
                let _ = commands::start_session(app.clone()).await;
            }
        }
        _ => {
            println!("Unknown shortcut: {}", shortcut);
        }
    }
}

