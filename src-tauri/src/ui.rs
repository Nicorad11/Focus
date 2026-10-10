//! Leeward's windows: the main chart, the always-on-top mini window, the tray flyout and the shield.
//! The small windows load the same web bundle; an initialization script tells each one what it is.

use serde_json::json;
use std::sync::atomic::{AtomicU64, Ordering};
use tauri::{AppHandle, Emitter, Manager, PhysicalPosition, PhysicalSize, WebviewUrl, WebviewWindow, WebviewWindowBuilder};

pub const MINI: &str = "mini";
pub const TRAY: &str = "tray";
pub const SHIELD: &str = "shield";

/// When the flyout last hid itself. Clicking the tray icon while the flyout is open first blurs (and
/// hides) it, then delivers the click; without this the click would open it again straight away.
static FLYOUT_HIDDEN_AT: AtomicU64 = AtomicU64::new(0);

fn aux(app: &AppHandle, label: &str, w: f64, h: f64, focused: bool) -> tauri::Result<WebviewWindow> {
    WebviewWindowBuilder::new(app, label, WebviewUrl::App("index.html".into()))
        .initialization_script(format!("window.__LEEWARD_WINDOW__ = '{label}';"))
        .title("Leeward")
        .inner_size(w, h)
        .resizable(false)
        .maximizable(false)
        .minimizable(false)
        .decorations(false)
        .always_on_top(true)
        .skip_taskbar(true)
        .visible(false)
        .focused(focused)
        .shadow(true)
        .build()
}

/// Create the hidden helper windows up front so they appear instantly.
pub fn create_aux_windows(app: &AppHandle) -> tauri::Result<()> {
    let mini = aux(app, MINI, 420.0, 150.0, false)?;
    place_bottom_right(&mini, 24, 24);
    aux(app, TRAY, 380.0, 340.0, true)?;
    aux(app, SHIELD, 900.0, 600.0, true)?;
    Ok(())
}

fn place_bottom_right(win: &WebviewWindow, margin_x: i32, margin_y: i32) {
    let (Ok(Some(mon)), Ok(size)) = (win.primary_monitor(), win.outer_size()) else { return };
    let area = mon.work_area();
    let x = area.position.x + area.size.width as i32 - size.width as i32 - margin_x;
    let y = area.position.y + area.size.height as i32 - size.height as i32 - margin_y;
    let _ = win.set_position(PhysicalPosition::new(x, y));
}

pub fn focus_main(app: &AppHandle, route: Option<&str>) {
    if let Some(w) = app.get_webview_window("main") {
        let _ = w.show();
        let _ = w.unminimize();
        let _ = w.set_focus();
        if let Some(route) = route {
            let _ = w.emit("leeward", json!({ "type": "navigate", "route": route }));
        }
    }
    if let Some(t) = app.get_webview_window(TRAY) {
        let _ = t.hide();
    }
}

pub fn show_mini(app: &AppHandle, show: bool) {
    if let Some(w) = app.get_webview_window(MINI) {
        if show {
            let _ = w.show();
            let _ = w.set_always_on_top(true);
        } else {
            let _ = w.hide();
        }
    }
}

/// Toggle the tray flyout, placed above the click like a Windows 11 flyout.
pub fn toggle_flyout(app: &AppHandle, click: PhysicalPosition<f64>) {
    let Some(w) = app.get_webview_window(TRAY) else { return };
    if w.is_visible().unwrap_or(false) {
        hide_flyout(app);
        return;
    }
    if crate::state::now_ms().saturating_sub(FLYOUT_HIDDEN_AT.load(Ordering::Relaxed)) < 300 {
        return;
    }
    if let (Ok(size), Ok(monitors)) = (w.outer_size(), w.available_monitors()) {
        let cx = click.x as i32;
        let cy = click.y as i32;
        let area = monitors
            .iter()
            .map(|m| *m.work_area())
            .find(|a| cx >= a.position.x && cx < a.position.x + a.size.width as i32 && cy >= a.position.y - 80 && cy < a.position.y + a.size.height as i32 + 80);
        let mut x = cx - size.width as i32 / 2;
        let mut y = cy - size.height as i32 - 16;
        if let Some(a) = area {
            let right = a.position.x + a.size.width as i32;
            let bottom = a.position.y + a.size.height as i32;
            x = x.clamp(a.position.x + 8, right - size.width as i32 - 8);
            // taskbar at the top: open below the click instead
            if y < a.position.y {
                y = cy + 16;
            }
            y = y.clamp(a.position.y + 8, bottom - size.height as i32 - 8);
        }
        let _ = w.set_position(PhysicalPosition::new(x, y));
    }
    let _ = w.show();
    let _ = w.set_focus();
}

pub fn hide_flyout(app: &AppHandle) {
    if let Some(w) = app.get_webview_window(TRAY) {
        if w.is_visible().unwrap_or(false) {
            FLYOUT_HIDDEN_AT.store(crate::state::now_ms(), Ordering::Relaxed);
        }
        let _ = w.hide();
    }
}

/// Cover the monitor the blocked app is on.
pub fn show_shield(app: &AppHandle, name: &str, exe: &str, work_area: Option<(i32, i32, i32, i32)>, already: bool) {
    let Some(w) = app.get_webview_window(SHIELD) else { return };
    if let Some((x, y, width, height)) = work_area {
        let _ = w.set_position(PhysicalPosition::new(x, y));
        let _ = w.set_size(PhysicalSize::new(width.max(400) as u32, height.max(300) as u32));
    }
    let _ = w.emit("leeward", json!({ "type": "shield", "name": name, "exe": exe }));
    if !already || !w.is_visible().unwrap_or(false) {
        let _ = w.show();
    }
    let _ = w.set_always_on_top(true);
    let _ = w.set_focus();
}

pub fn hide_shield(app: &AppHandle) {
    if let Some(w) = app.get_webview_window(SHIELD) {
        let _ = w.hide();
    }
}

/// Tell the UI that a blocked app or site was turned away ("held-off") or opened anyway.
pub fn emit_blocker_event(app: &AppHandle, kind: &str, name: &str, what: &str) {
    let _ = app.emit_to("main", "leeward", json!({ "type": kind, "name": name, "kind": what }));
}
