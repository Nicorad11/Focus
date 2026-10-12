//! Leeward's desktop core. The UI is the same web app as the browser build; this side owns everything
//! that touches Windows: the tray, taskbar, extra windows, notifications, start-up, the app blocker,
//! and the endpoint the browser helper talks to.

mod blocker;
mod helper;
mod state;
mod ui;

use serde::Serialize;
use state::{BlockerConfig, SharedState};
use tauri::menu::{Menu, MenuItem, PredefinedMenuItem};
use tauri::tray::{MouseButton, MouseButtonState, TrayIconBuilder, TrayIconEvent};
use tauri::{AppHandle, Manager, RunEvent, State, WindowEvent};
use tauri_plugin_dialog::DialogExt;
use tauri_plugin_global_shortcut::{Code, GlobalShortcutExt, Modifiers, Shortcut, ShortcutState};
use tauri_plugin_opener::OpenerExt;

#[tauri::command]
fn set_blocker(state: State<'_, SharedState>, app: AppHandle, config: BlockerConfig) {
    let mut s = state.lock().unwrap();
    if s.config.watch_id != config.watch_id {
        s.allowed_apps.clear();
        s.allowed_sites.clear();
    }
    let starting = config.active && !s.config.active;
    s.config = config;
    let lift_shield = !s.config.active && s.shield_for.take().is_some();
    drop(s);
    if lift_shield {
        ui::hide_shield(&app);
    }
    if starting {
        blocker::check_now();
    }
}

#[tauri::command]
fn set_prefs(state: State<'_, SharedState>, close_to_tray: bool) {
    state.lock().unwrap().close_to_tray = close_to_tray;
}

#[tauri::command]
fn focus_main(app: AppHandle, route: Option<String>) {
    ui::focus_main(&app, route.as_deref());
}

#[tauri::command]
fn show_mini(app: AppHandle, show: bool) {
    ui::show_mini(&app, show);
}

#[tauri::command]
fn hide_tray_flyout(app: AppHandle) {
    ui::hide_flyout(&app);
}

/// The shield's two buttons: "back" (to the chart) and "open" (hold to open anyway, steady only).
#[tauri::command]
fn shield_action(state: State<'_, SharedState>, app: AppHandle, action: String, exe: String) {
    shield_choice(&state, &app, &action, exe);
}

/// Ctrl+Alt+L: bring Leeward forward. With the shield up this is its "Back to the chart", so the
/// keyboard always gets you out from under the shield, whatever it shows.
fn bring_forward(app: &AppHandle) {
    let state = app.state::<SharedState>();
    let shielded = state.lock().unwrap().shield_for.is_some();
    if shielded {
        shield_choice(&state, app, "back", String::new());
    } else {
        ui::hide_shield(app);
        ui::focus_main(app, None);
    }
}

fn shield_choice(state: &SharedState, app: &AppHandle, action: &str, exe: String) {
    let mut s = state.lock().unwrap();
    let covered = s.shield_for.take();
    let steady = s.config.firmness == "steady";
    let exe = covered.as_ref().map(|(e, _)| e.clone()).unwrap_or(exe);
    let name = s.config.apps.iter().find(|a| a.exe.eq_ignore_ascii_case(&exe)).map(|a| a.name.clone()).unwrap_or_else(|| exe.clone());
    if action == "open" && steady {
        s.allowed_apps.insert(exe.clone());
        drop(s);
        ui::hide_shield(app);
        ui::emit_blocker_event(app, "opened-anyway", &name, "app");
        if let Some((_, hwnd)) = covered {
            blocker::bring_forward(hwnd);
        }
    } else {
        drop(s);
        ui::hide_shield(app);
        if let Some((_, hwnd)) = covered {
            blocker::minimize(hwnd);
        }
        ui::emit_blocker_event(app, "held-off", &name, "app");
        ui::focus_main(app, Some("chart"));
    }
}

#[tauri::command]
fn running_apps() -> Vec<blocker::RunningApp> {
    blocker::running_apps()
}

#[derive(Serialize)]
#[serde(rename_all = "camelCase")]
struct HelperStatus {
    browser: String,
    last_seen: Option<u64>,
}

#[tauri::command]
fn helper_status(state: State<'_, SharedState>) -> Vec<HelperStatus> {
    state
        .lock()
        .unwrap()
        .helpers
        .iter()
        .map(|(b, t)| HelperStatus { browser: b.clone(), last_seen: Some(*t) })
        .collect()
}

#[tauri::command]
fn idle_seconds() -> Option<u64> {
    blocker::idle_seconds()
}

/// Show the bundled browser helper in Explorer, ready for "Load unpacked".
#[tauri::command]
fn open_extension_folder(app: AppHandle) -> Result<(), String> {
    let dir = app.path().resource_dir().map_err(|e| e.to_string())?.join("extension");
    app.opener().open_path(dir.to_string_lossy(), None::<&str>).map_err(|e| e.to_string())
}

/// Ask where to save, then write the file (CSV exports, backups).
#[tauri::command]
async fn save_file(app: AppHandle, name: String, contents: String) -> Result<bool, String> {
    tauri::async_runtime::spawn_blocking(move || {
        let ext = name.rsplit('.').next().unwrap_or("").to_string();
        let mut dialog = app.dialog().file().set_file_name(&name);
        if !ext.is_empty() {
            dialog = dialog.add_filter(ext.to_uppercase(), &[ext.as_str()]);
        }
        match dialog.blocking_save_file() {
            Some(path) => {
                let path = path.into_path().map_err(|e| e.to_string())?;
                std::fs::write(&path, contents).map_err(|e| e.to_string())?;
                Ok(true)
            }
            None => Ok(false),
        }
    })
    .await
    .map_err(|e| e.to_string())?
}

#[tauri::command]
fn quit_app(app: AppHandle) {
    app.exit(0);
}

fn build_tray(app: &AppHandle) -> tauri::Result<()> {
    let show = MenuItem::with_id(app, "show", "Show Leeward", true, None::<&str>)?;
    let mini = MenuItem::with_id(app, "mini", "Mini window", true, None::<&str>)?;
    let quit = MenuItem::with_id(app, "quit", "Quit Leeward", true, None::<&str>)?;
    let menu = Menu::with_items(app, &[&show, &mini, &PredefinedMenuItem::separator(app)?, &quit])?;
    let mut builder = TrayIconBuilder::with_id("main")
        .tooltip("Leeward")
        .menu(&menu)
        .show_menu_on_left_click(false)
        .on_menu_event(|app, event| match event.id.as_ref() {
            "show" => ui::focus_main(app, None),
            "mini" => ui::show_mini(app, true),
            "quit" => app.exit(0),
            _ => {}
        })
        .on_tray_icon_event(|tray, event| {
            if let TrayIconEvent::Click { button: MouseButton::Left, button_state: MouseButtonState::Up, position, .. } = event {
                ui::toggle_flyout(tray.app_handle(), position);
            }
        });
    if let Some(icon) = app.default_window_icon() {
        builder = builder.icon(icon.clone());
    }
    builder.build(app)?;
    Ok(())
}

pub fn run() {
    let shared = state::new_state();
    let app = tauri::Builder::default()
        .plugin(tauri_plugin_single_instance::init(|app, _args, _cwd| ui::focus_main(app, None)))
        .plugin(tauri_plugin_notification::init())
        .plugin(tauri_plugin_opener::init())
        .plugin(tauri_plugin_dialog::init())
        .plugin(tauri_plugin_autostart::init(tauri_plugin_autostart::MacosLauncher::LaunchAgent, Some(vec!["--minimized"])))
        .plugin(
            tauri_plugin_global_shortcut::Builder::new()
                .with_handler(|app, shortcut, event| {
                    if event.state() == ShortcutState::Pressed && shortcut.matches(Modifiers::CONTROL | Modifiers::ALT, Code::KeyL) {
                        bring_forward(app);
                    }
                })
                .build(),
        )
        .manage(shared.clone())
        .invoke_handler(tauri::generate_handler![
            set_blocker,
            set_prefs,
            focus_main,
            show_mini,
            hide_tray_flyout,
            shield_action,
            running_apps,
            helper_status,
            idle_seconds,
            open_extension_folder,
            save_file,
            quit_app
        ])
        .setup(move |app| {
            let handle = app.handle().clone();
            build_tray(&handle)?;
            ui::create_aux_windows(&handle)?;
            // Ctrl+Alt+L brings Leeward forward; skip quietly if another app owns it
            let _ = app.global_shortcut().register(Shortcut::new(Some(Modifiers::CONTROL | Modifiers::ALT), Code::KeyL));
            blocker::start(handle.clone(), shared.clone());
            helper::start(handle.clone(), shared.clone());
            // started with Windows: wait in the tray
            if std::env::args().any(|a| a == "--minimized") {
                if let Some(main) = app.get_webview_window("main") {
                    let _ = main.hide();
                }
            }
            Ok(())
        })
        .on_window_event(|window, event| {
            if let WindowEvent::CloseRequested { api, .. } = event {
                let app = window.app_handle();
                if window.label() == "main" {
                    let to_tray = app.state::<SharedState>().lock().unwrap().close_to_tray;
                    if to_tray {
                        api.prevent_close();
                        let _ = window.hide();
                    } else {
                        app.exit(0);
                    }
                } else {
                    // the small windows are hidden, never destroyed
                    api.prevent_close();
                    let _ = window.hide();
                }
            }
        })
        .build(tauri::generate_context!())
        .expect("error while building Leeward");

    app.run(|_app, event| {
        if let RunEvent::ExitRequested { code: None, api, .. } = event {
            // keep running in the tray when the last window is hidden; exit only on request
            api.prevent_exit();
        }
    });
}
