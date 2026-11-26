#[cfg(target_os = "windows")]
use std::fs;
use std::net::IpAddr;
use std::path::PathBuf;
use std::time::Duration;

use stiksound_audio_engine::{probe_audio, AudioProbeInfo};
use stiksound_image_engine::{probe_image, ImageProbeInfo};
use stiksound_project_store::atomic_publish_file;
use url::Url;

const MAX_REMOTE_BYTES: usize = 25 * 1024 * 1024;
const MAX_REMOTE_REDIRECTS: usize = 2;

fn is_disallowed_ip(ip: IpAddr) -> bool {
    match ip {
        IpAddr::V4(v4) => {
            let [a, b, _, _] = v4.octets();
            v4.is_loopback()
                || v4.is_private()
                || v4.is_link_local()
                || v4.is_broadcast()
                || v4.is_unspecified()
                || v4.is_multicast()
                || (a == 100 && (64..=127).contains(&b))
                || a >= 224
        }
        IpAddr::V6(v6) => {
            v6.is_loopback()
                || v6.is_unspecified()
                || v6.is_multicast()
                || ((v6.segments()[0] & 0xfe00) == 0xfc00) // ULA fc00::/7
                || ((v6.segments()[0] & 0xffc0) == 0xfe80) // link-local fe80::/10
        }
    }
}

const BLOCKED_HOST_SUFFIXES: [&str; 7] = [".localhost", ".local", ".internal", ".lan", ".home", ".arpa", ".onion"];

fn validate_public_url(raw: &str) -> Result<Url, String> {
    let parsed = Url::parse(raw.trim()).map_err(|_| "url-rejected: malformed URL".to_string())?;
    if parsed.scheme() != "https" {
        return Err("url-rejected: only https allowed".to_string());
    }
    if !parsed.username().is_empty() || parsed.password().is_some() {
        return Err("url-rejected: userinfo forbidden".to_string());
    }
    if let Some(port) = parsed.port() {
        if port != 443 {
            return Err("url-rejected: non-443 port forbidden".to_string());
        }
    }
    match parsed.host() {
        Some(url::Host::Domain(_)) => {}
        Some(_) => return Err("url-rejected: raw IP addresses are forbidden".to_string()),
        None => return Err("url-rejected: missing host".to_string()),
    }
    let host = parsed
        .host_str()
        .ok_or_else(|| "url-rejected: missing host".to_string())?
        .trim_end_matches('.')
        .to_ascii_lowercase();
    if host == "localhost"
        || !host.contains('.')
        || BLOCKED_HOST_SUFFIXES.iter().any(|suffix| host.ends_with(suffix))
    {
        return Err(format!("url-rejected: non-public host ({host})"));
    }
    Ok(parsed)
}

fn validate_myinstants_url(raw: &str) -> Result<Url, String> {
    let parsed = validate_public_url(raw)?;
    let host = parsed
        .host_str()
        .ok_or_else(|| "url-rejected: missing host".to_string())?
        .to_ascii_lowercase();
    if host != "www.myinstants.com" && host != "myinstants.com" {
        return Err(format!("url-rejected: host not allowed ({host})"));
    }
    Ok(parsed)
}

async fn fetch_limited(url: &str, validate: fn(&str) -> Result<Url, String>) -> Result<Vec<u8>, String> {
    let client = reqwest::Client::builder()
        .redirect(reqwest::redirect::Policy::none())
        .timeout(Duration::from_secs(20))
        .user_agent("Mozilla/5.0 (Windows NT 10.0; Win64; x64) StikSound/1.0")
        .build()
        .map_err(|e| format!("remote-unavailable: {e}"))?;

    let mut current = validate(url)?;

    for hop in 0..=MAX_REMOTE_REDIRECTS {
        let host = current
            .host_str()
            .ok_or_else(|| "url-rejected: missing host".to_string())?;
        let addrs = tokio::net::lookup_host((host, 443))
            .await
            .map_err(|e| format!("remote-unavailable: DNS failed ({e})"))?;
        let mut saw_addr = false;
        for addr in addrs {
            saw_addr = true;
            if is_disallowed_ip(addr.ip()) {
                return Err("url-rejected: private or reserved IP address".to_string());
            }
        }
        if !saw_addr {
            return Err("remote-unavailable: DNS returned no addresses".to_string());
        }

        let resp = client
            .get(current.as_str())
            .send()
            .await
            .map_err(|e| format!("remote-unavailable: {e}"))?;

        let status = resp.status();
        if status.is_redirection() {
            if hop == MAX_REMOTE_REDIRECTS {
                return Err("url-rejected: too many redirects".to_string());
            }
            let loc = resp
                .headers()
                .get(reqwest::header::LOCATION)
                .and_then(|v| v.to_str().ok())
                .ok_or_else(|| "url-rejected: missing redirect location".to_string())?;
            let next_url = current
                .join(loc)
                .map_err(|_| "url-rejected: invalid redirect location".to_string())?;
            current = validate(next_url.as_str())?;
            continue;
        }

        if !status.is_success() {
            return Err(format!("remote-unavailable: HTTP {}", status.as_u16()));
        }

        if let Some(len) = resp.content_length() {
            if len as usize > MAX_REMOTE_BYTES {
                return Err("file-too-large: remote response exceeds 25 MB".to_string());
            }
        }

        let mut resp = resp;
        let mut body: Vec<u8> = Vec::new();
        while let Some(chunk) = resp
            .chunk()
            .await
            .map_err(|e| format!("remote-unavailable: {e}"))?
        {
            if body.len() + chunk.len() > MAX_REMOTE_BYTES {
                return Err("file-too-large: remote body exceeds 25 MB".to_string());
            }
            body.extend_from_slice(&chunk);
        }
        return Ok(body);
    }

    Err("url-rejected: redirect limit exceeded".to_string())
}

#[tauri::command]
async fn cmd_fetch_myinstants(url: String) -> Result<Vec<u8>, String> {
    fetch_limited(&url, validate_myinstants_url).await
}

#[tauri::command]
async fn cmd_fetch_url(url: String) -> Result<Vec<u8>, String> {
    fetch_limited(&url, validate_public_url).await
}

#[tauri::command]
fn cmd_probe_image(bytes: Vec<u8>) -> Result<ImageProbeInfo, String> {
    probe_image(&bytes).map_err(|e| e.to_string())
}

#[tauri::command]
fn cmd_probe_audio(bytes: Vec<u8>) -> Result<AudioProbeInfo, String> {
    probe_audio(&bytes).map_err(|e| e.to_string())
}

#[tauri::command]
fn cmd_save_export_to_downloads(
    app: tauri::AppHandle,
    file_name: String,
    bytes: Vec<u8>,
) -> Result<String, String> {
    use tauri::Manager;
    let safe_name = PathBuf::from(&file_name)
        .file_name()
        .and_then(|n| n.to_str())
        .ok_or_else(|| "Invalid file name".to_string())?
        .to_string();

    let downloads_dir = app
        .path()
        .download_dir()
        .map_err(|e| e.to_string())?
        .join("StikSound");
    let dest = downloads_dir.join(&safe_name);
    atomic_publish_file(&dest, &bytes).map_err(|e| e.to_string())?;
    Ok(dest.to_string_lossy().into_owned())
}

fn sanitize_file_name(file_name: &str) -> Result<String, String> {
    let raw_name = PathBuf::from(file_name)
        .file_name()
        .and_then(|n| n.to_str())
        .ok_or_else(|| "Invalid file name".to_string())?
        .to_string();
    let safe_name: String = raw_name
        .chars()
        .map(|c| {
            if c.is_ascii_alphanumeric() || c == '.' || c == '-' || c == '_' {
                c
            } else {
                '_'
            }
        })
        .collect();
    if safe_name.is_empty() || safe_name.chars().all(|c| c == '.') {
        return Err("Empty sanitized file name".to_string());
    }
    Ok(safe_name)
}

#[tauri::command]
fn cmd_copy_artifact_to_clipboard(file_name: String, bytes: Vec<u8>) -> Result<String, String> {
    let safe_name = sanitize_file_name(&file_name)?;

    let clipboard_dir = std::env::temp_dir().join("StikSoundClipboard");
    let dest = clipboard_dir.join(&safe_name);
    atomic_publish_file(&dest, &bytes).map_err(|e| e.to_string())?;
    let dest_str = dest.to_string_lossy().into_owned();

    #[cfg(target_os = "windows")]
    {
        let escaped = dest_str.replace('\'', "''");
        let ps_script = format!("Set-Clipboard -LiteralPath '{escaped}'");
        let status = std::process::Command::new("powershell")
            .args(["-NoProfile", "-NonInteractive", "-Command", &ps_script])
            .status()
            .map_err(|e| format!("Clipboard command failed: {e}"))?;
        if !status.success() {
            return Err("Failed to copy file to Windows clipboard".to_string());
        }
    }

    #[cfg(target_os = "macos")]
    {
        let escaped = dest_str.replace('\\', "\\\\").replace('"', "\\\"");
        let osa_script = format!("set the clipboard to (POSIX file \"{escaped}\")");
        let status = std::process::Command::new("osascript")
            .args(["-e", &osa_script])
            .status()
            .map_err(|e| format!("Clipboard command failed: {e}"))?;
        if !status.success() {
            return Err("Failed to copy file to macOS clipboard".to_string());
        }
    }

    Ok(dest_str)
}

#[cfg(target_os = "windows")]
fn ensure_isolated_webview2_data_dir() {
    if std::env::var_os("WEBVIEW2_USER_DATA_FOLDER").is_some() {
        return;
    }
    if let Ok(local_app_data) = std::env::var("LOCALAPPDATA") {
        let base = PathBuf::from(local_app_data).join("StikSound").join("wv2");
        let _ = fs::create_dir_all(&base);
        // Best-effort cleanup of old unlocked session folders
        if let Ok(entries) = fs::read_dir(&base) {
            for entry in entries.flatten() {
                let _ = fs::remove_dir_all(entry.path());
            }
        }
        let session_dir = base.join(format!("s_{}", std::process::id()));
        let _ = fs::create_dir_all(&session_dir);
        std::env::set_var("WEBVIEW2_USER_DATA_FOLDER", &session_dir);
    }
}

#[cfg(target_os = "android")]
mod android_bridge {
    use tauri::plugin::{Builder, PluginHandle, TauriPlugin};
    use tauri::{Manager, Wry};

    pub struct Bridge(pub PluginHandle<Wry>);

    #[derive(serde::Serialize)]
    #[serde(rename_all = "camelCase")]
    pub struct FilePayload {
        pub path: String,
        pub file_name: String,
        pub mime_type: String,
    }

    #[derive(serde::Deserialize)]
    pub struct FileResult {
        pub location: String,
    }

    pub fn init() -> TauriPlugin<Wry> {
        Builder::<Wry>::new("stiksound-android")
            .setup(|app, api| {
                let handle = api.register_android_plugin("app.stiksound.android", "StikSoundPlugin")?;
                app.manage(Bridge(handle));
                Ok(())
            })
            .build()
    }
}

#[cfg(target_os = "android")]
async fn run_android_file_command(
    app: &tauri::AppHandle,
    command: &str,
    file_name: String,
    mime_type: String,
    bytes: Vec<u8>,
) -> Result<String, String> {
    use tauri::Manager;
    let safe_name = sanitize_file_name(&file_name)?;
    let dest = app
        .path()
        .app_cache_dir()
        .map_err(|e| e.to_string())?
        .join("share")
        .join(&safe_name);
    atomic_publish_file(&dest, &bytes).map_err(|e| e.to_string())?;
    let bridge = app.state::<android_bridge::Bridge>();
    let result: android_bridge::FileResult = bridge
        .0
        .run_mobile_plugin_async(
            command,
            android_bridge::FilePayload {
                path: dest.to_string_lossy().into_owned(),
                file_name: safe_name,
                mime_type,
            },
        )
        .await
        .map_err(|e| e.to_string())?;
    Ok(result.location)
}

#[cfg(not(target_os = "android"))]
async fn run_android_file_command(
    _app: &tauri::AppHandle,
    _command: &str,
    _file_name: String,
    _mime_type: String,
    _bytes: Vec<u8>,
) -> Result<String, String> {
    Err("export-unsupported: Android only".to_string())
}

#[tauri::command]
async fn cmd_android_save(
    app: tauri::AppHandle,
    file_name: String,
    mime_type: String,
    bytes: Vec<u8>,
) -> Result<String, String> {
    run_android_file_command(&app, "saveFile", file_name, mime_type, bytes).await
}

#[tauri::command]
async fn cmd_android_share(
    app: tauri::AppHandle,
    file_name: String,
    mime_type: String,
    bytes: Vec<u8>,
) -> Result<String, String> {
    run_android_file_command(&app, "shareFile", file_name, mime_type, bytes).await
}

#[cfg_attr(mobile, tauri::mobile_entry_point)]
pub fn run() {
    #[cfg(target_os = "windows")]
    ensure_isolated_webview2_data_dir();

    let builder = tauri::Builder::default();
    #[cfg(target_os = "android")]
    let builder = builder.plugin(android_bridge::init());

    builder
        .invoke_handler(tauri::generate_handler![
            cmd_probe_image,
            cmd_probe_audio,
            cmd_save_export_to_downloads,
            cmd_copy_artifact_to_clipboard,
            cmd_fetch_myinstants,
            cmd_fetch_url,
            cmd_android_save,
            cmd_android_share
        ])
        .run(tauri::generate_context!())
        .expect("error while running StikSound desktop application");
}
