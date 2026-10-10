//! "Batten down" for apps: watch which window comes to the foreground and, when it belongs to a blocked
//! program during a watch, cover it with Leeward's shield. Nothing is ever closed or killed (people lose
//! unsaved work that way), and no admin rights are needed.

use crate::state::SharedState;
use serde::Serialize;
use tauri::AppHandle;

#[derive(Clone, Debug, Serialize)]
pub struct RunningApp {
    pub name: String,
    pub exe: String,
    pub path: String,
}

#[cfg(windows)]
mod imp {
    use super::RunningApp;
    use crate::state::SharedState;
    use crate::ui;
    use std::sync::OnceLock;
    use std::time::Duration;
    use tauri::AppHandle;
    use windows::core::{BOOL, PWSTR};
    use windows::Win32::Foundation::{CloseHandle, HWND, LPARAM, RECT};
    use windows::Win32::Graphics::Gdi::{GetMonitorInfoW, MonitorFromWindow, MONITORINFO, MONITOR_DEFAULTTONEAREST};
    use windows::Win32::System::SystemInformation::GetTickCount;
    use windows::Win32::System::Threading::{OpenProcess, QueryFullProcessImageNameW, PROCESS_NAME_WIN32, PROCESS_QUERY_LIMITED_INFORMATION};
    use windows::Win32::UI::Accessibility::{SetWinEventHook, UnhookWinEvent, HWINEVENTHOOK};
    use windows::Win32::UI::Input::KeyboardAndMouse::{GetLastInputInfo, LASTINPUTINFO};
    use windows::Win32::UI::WindowsAndMessaging::{
        DispatchMessageW, EnumChildWindows, EnumWindows, GetForegroundWindow, GetMessageW, GetWindow, GetWindowLongW, GetWindowTextLengthW,
        GetWindowThreadProcessId, IsWindowVisible, SetForegroundWindow, ShowWindow, TranslateMessage, EVENT_SYSTEM_FOREGROUND, GWL_EXSTYLE,
        GW_OWNER, MSG, SW_MINIMIZE, SW_RESTORE, WINEVENT_OUTOFCONTEXT, WINEVENT_SKIPOWNPROCESS, WS_EX_TOOLWINDOW,
    };

    static APP: OnceLock<AppHandle> = OnceLock::new();
    static STATE: OnceLock<SharedState> = OnceLock::new();

    pub fn start(app: AppHandle, state: SharedState) {
        let _ = APP.set(app);
        let _ = STATE.set(state);
        std::thread::spawn(|| unsafe {
            let hook = SetWinEventHook(
                EVENT_SYSTEM_FOREGROUND,
                EVENT_SYSTEM_FOREGROUND,
                None,
                Some(on_foreground),
                0,
                0,
                WINEVENT_OUTOFCONTEXT | WINEVENT_SKIPOWNPROCESS,
            );
            let mut msg = MSG::default();
            while GetMessageW(&mut msg, None, 0, 0).as_bool() {
                let _ = TranslateMessage(&msg);
                DispatchMessageW(&msg);
            }
            let _ = UnhookWinEvent(hook);
        });
        // safety net: the hook only reports changes, so also look every so often
        std::thread::spawn(|| loop {
            std::thread::sleep(Duration::from_millis(1500));
            check_now();
        });
    }

    unsafe extern "system" fn on_foreground(_: HWINEVENTHOOK, _: u32, hwnd: HWND, id_object: i32, _: i32, _: u32, _: u32) {
        if id_object == 0 {
            handle(hwnd);
        }
    }

    pub fn check_now() {
        let hwnd = unsafe { GetForegroundWindow() };
        if !hwnd.is_invalid() {
            handle(hwnd);
        }
    }

    fn handle(hwnd: HWND) {
        let (Some(app), Some(state)) = (APP.get(), STATE.get()) else { return };
        let Some((exe, _)) = exe_of(hwnd) else { return };
        let mut s = state.lock().unwrap();
        if !s.config.active {
            return;
        }
        let blocked = s.config.apps.iter().find(|a| a.exe.eq_ignore_ascii_case(&exe)).cloned();
        match blocked {
            Some(b) if !s.allowed_apps.contains(&exe) => {
                let already = matches!(&s.shield_for, Some((e, _)) if *e == exe);
                s.shield_for = Some((exe.clone(), hwnd.0 as isize));
                let work = monitor_work_area(hwnd);
                drop(s);
                ui::show_shield(app, &b.name, &exe, work, already);
            }
            _ => {
                // another program took the foreground while the shield was up: the user let it go
                if s.shield_for.take().is_some() {
                    drop(s);
                    ui::hide_shield(app);
                    ui::emit_blocker_event(app, "held-off", &exe, "app");
                }
            }
        }
    }

    fn process_exe(pid: u32) -> Option<(String, String)> {
        if pid == 0 || pid == std::process::id() {
            return None;
        }
        unsafe {
            let h = OpenProcess(PROCESS_QUERY_LIMITED_INFORMATION, false, pid).ok()?;
            let mut buf = [0u16; 1024];
            let mut len = buf.len() as u32;
            let ok = QueryFullProcessImageNameW(h, PROCESS_NAME_WIN32, PWSTR(buf.as_mut_ptr()), &mut len);
            let _ = CloseHandle(h);
            ok.ok()?;
            let path = String::from_utf16_lossy(&buf[..len as usize]);
            let exe = path.rsplit(['\\', '/']).next().unwrap_or(&path).to_lowercase();
            Some((exe, path))
        }
    }

    /// The program behind a window. Store apps are hosted by ApplicationFrameHost; look at the child.
    fn exe_of(hwnd: HWND) -> Option<(String, String)> {
        let mut pid = 0u32;
        unsafe { GetWindowThreadProcessId(hwnd, Some(&mut pid)) };
        let (exe, path) = process_exe(pid)?;
        if exe != "applicationframehost.exe" {
            return Some((exe, path));
        }
        struct Find {
            host: u32,
            found: Option<(String, String)>,
        }
        unsafe extern "system" fn child(h: HWND, l: LPARAM) -> BOOL {
            let f = &mut *(l.0 as *mut Find);
            let mut pid = 0u32;
            GetWindowThreadProcessId(h, Some(&mut pid));
            if pid != f.host {
                if let Some(r) = process_exe(pid) {
                    f.found = Some(r);
                    return BOOL(0);
                }
            }
            BOOL(1)
        }
        let mut f = Find { host: pid, found: None };
        unsafe {
            let _ = EnumChildWindows(Some(hwnd), Some(child), LPARAM(&mut f as *mut Find as isize));
        }
        f.found.or(Some((exe, path)))
    }

    /// The monitor work area (physical pixels) of the window, for placing the shield.
    fn monitor_work_area(hwnd: HWND) -> Option<(i32, i32, i32, i32)> {
        unsafe {
            let mon = MonitorFromWindow(hwnd, MONITOR_DEFAULTTONEAREST);
            let mut mi = MONITORINFO { cbSize: std::mem::size_of::<MONITORINFO>() as u32, ..Default::default() };
            if !GetMonitorInfoW(mon, &mut mi).as_bool() {
                return None;
            }
            let RECT { left, top, right, bottom } = mi.rcWork;
            Some((left, top, right - left, bottom - top))
        }
    }

    pub fn minimize(hwnd: isize) {
        unsafe {
            let _ = ShowWindow(HWND(hwnd as *mut _), SW_MINIMIZE);
        }
    }

    pub fn bring_forward(hwnd: isize) {
        unsafe {
            let h = HWND(hwnd as *mut _);
            let _ = ShowWindow(h, SW_RESTORE);
            let _ = SetForegroundWindow(h);
        }
    }

    pub fn idle_seconds() -> Option<u64> {
        unsafe {
            let mut lii = LASTINPUTINFO { cbSize: std::mem::size_of::<LASTINPUTINFO>() as u32, dwTime: 0 };
            if !GetLastInputInfo(&mut lii).as_bool() {
                return None;
            }
            Some(GetTickCount().wrapping_sub(lii.dwTime) as u64 / 1000)
        }
    }

    const SYSTEM: &[&str] = &[
        "explorer.exe",
        "applicationframehost.exe",
        "textinputhost.exe",
        "shellexperiencehost.exe",
        "startmenuexperiencehost.exe",
        "searchhost.exe",
        "searchapp.exe",
        "systemsettings.exe",
        "lockapp.exe",
        "leeward.exe",
    ];

    pub fn running_apps() -> Vec<RunningApp> {
        unsafe extern "system" fn each(h: HWND, l: LPARAM) -> BOOL {
            let out = &mut *(l.0 as *mut Vec<RunningApp>);
            if !IsWindowVisible(h).as_bool() || GetWindowTextLengthW(h) == 0 {
                return BOOL(1);
            }
            if GetWindow(h, GW_OWNER).map(|o| !o.is_invalid()).unwrap_or(false) {
                return BOOL(1);
            }
            if (GetWindowLongW(h, GWL_EXSTYLE) as u32) & WS_EX_TOOLWINDOW.0 != 0 {
                return BOOL(1);
            }
            if let Some((exe, path)) = exe_of(h) {
                if !SYSTEM.contains(&exe.as_str()) && !out.iter().any(|a| a.exe == exe) {
                    let stem = exe.trim_end_matches(".exe");
                    let mut name: String = stem.chars().take(1).flat_map(|c| c.to_uppercase()).collect();
                    name.push_str(&stem.chars().skip(1).collect::<String>());
                    out.push(RunningApp { name, exe, path });
                }
            }
            BOOL(1)
        }
        let mut out: Vec<RunningApp> = Vec::new();
        unsafe {
            let _ = EnumWindows(Some(each), LPARAM(&mut out as *mut Vec<RunningApp> as isize));
        }
        out.sort_by(|a, b| a.name.to_lowercase().cmp(&b.name.to_lowercase()));
        out
    }
}

#[cfg(not(windows))]
mod imp {
    //! Other systems: the desktop shell runs, but app blocking is Windows-only for now.
    use super::RunningApp;
    use crate::state::SharedState;
    use tauri::AppHandle;
    pub fn start(_app: AppHandle, _state: SharedState) {}
    pub fn check_now() {}
    pub fn minimize(_hwnd: isize) {}
    pub fn bring_forward(_hwnd: isize) {}
    pub fn idle_seconds() -> Option<u64> {
        None
    }
    pub fn running_apps() -> Vec<RunningApp> {
        Vec::new()
    }
}

pub fn start(app: AppHandle, state: SharedState) {
    imp::start(app, state)
}
pub fn check_now() {
    imp::check_now()
}
pub fn minimize(hwnd: isize) {
    imp::minimize(hwnd)
}
pub fn bring_forward(hwnd: isize) {
    imp::bring_forward(hwnd)
}
pub fn idle_seconds() -> Option<u64> {
    imp::idle_seconds()
}
pub fn running_apps() -> Vec<RunningApp> {
    imp::running_apps()
}
