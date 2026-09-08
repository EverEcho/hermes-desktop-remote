// Prevents an additional console window on Windows in release.
#![cfg_attr(not(debug_assertions), windows_subsystem = "windows")]

mod generated;
mod oauth_loopback;

fn main() {
    capacitor_tauri::builder(generated::register_plugins)
        .plugin(tauri_plugin_opener::init())
        .plugin(tauri_plugin_http::init())
        .manage(oauth_loopback::OAuthLoopbackState::default())
        .invoke_handler(tauri::generate_handler![
            oauth_loopback::start_oauth_loopback,
            oauth_loopback::open_oauth_webview,
            oauth_loopback::cancel_oauth_loopback
        ])
        .run(tauri::generate_context!())
        .expect("error while running RHermes");
}
