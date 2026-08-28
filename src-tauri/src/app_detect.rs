/// Section 28's application-aware behavior. This is the single least-
/// verified file in the project — see the README's "Rust verification
/// notes" before assuming it compiles as-is. Everything here is wrapped
/// so a failure at any step degrades to "unknown" rather than panicking;
/// nothing in this file should ever be able to crash the app.
///
/// Only ever called when `Settings.detect_active_app` is true (off by
/// default — see db.rs's doc comment on that field for the privacy
/// reasoning), and only returns a coarse *category* ("coding", "gaming",
/// "browsing", "other"), never a window title or any other window content —
/// per Section 29's "do not read window titles" default posture.
#[cfg(windows)]
mod windows_impl {
    use windows::Win32::Foundation::{CloseHandle, HWND};
    use windows::Win32::System::ProcessStatus::K32GetModuleBaseNameW;
    use windows::Win32::System::Threading::{OpenProcess, PROCESS_QUERY_LIMITED_INFORMATION};
    use windows::Win32::UI::WindowsAndMessaging::{GetForegroundWindow, GetWindowThreadProcessId};

    /// Returns the lowercase executable file name of the foreground
    /// window's owning process (e.g. "code.exe"), or None on any failure.
    fn foreground_process_name() -> Option<String> {
        unsafe {
            let hwnd: HWND = GetForegroundWindow();
            if hwnd.0.is_null() {
                return None;
            }

            let mut pid: u32 = 0;
            let thread_id = GetWindowThreadProcessId(hwnd, Some(&mut pid));
            if thread_id == 0 || pid == 0 {
                return None;
            }

            let handle = OpenProcess(PROCESS_QUERY_LIMITED_INFORMATION, false, pid).ok()?;
            let mut buf = [0u16; 260];
            let len = K32GetModuleBaseNameW(handle, None, &mut buf);
            let _ = CloseHandle(handle);

            if len == 0 {
                return None;
            }
            Some(String::from_utf16_lossy(&buf[..len as usize]).to_lowercase())
        }
    }

    pub fn active_process_name() -> Option<String> {
        // catch_unwind as a last-resort belt-and-suspenders around unsafe
        // FFI this codebase has no way to test — a bug here should degrade
        // to "unknown", never take the whole app down.
        std::panic::catch_unwind(foreground_process_name).unwrap_or(None)
    }
}

#[cfg(not(windows))]
mod windows_impl {
    pub fn active_process_name() -> Option<String> {
        None
    }
}

const CODING: &[&str] = &["code.exe", "devenv.exe", "idea64.exe", "pycharm64.exe", "sublime_text.exe", "notepad++.exe", "cursor.exe", "rustrover64.exe"];
const GAMING: &[&str] = &["steam.exe", "epicgameslauncher.exe", "riotclientservices.exe", "battle.net.exe", "galaxyclient.exe"];
const BROWSING_OR_VIDEO: &[&str] = &["chrome.exe", "msedge.exe", "firefox.exe", "vlc.exe", "spotify.exe"];

fn categorize(process_name: &str) -> &'static str {
    if CODING.iter().any(|n| process_name == *n) {
        "coding"
    } else if GAMING.iter().any(|n| process_name == *n) {
        "gaming"
    } else if BROWSING_OR_VIDEO.iter().any(|n| process_name == *n) {
        "browsing"
    } else {
        "other"
    }
}

/// Coarse category only — see module doc comment. Returns "unknown" on any
/// platform this isn't implemented for, or if detection fails for any
/// reason.
pub fn active_app_category() -> String {
    match windows_impl::active_process_name() {
        Some(name) => categorize(&name).to_string(),
        None => "unknown".to_string(),
    }
}
