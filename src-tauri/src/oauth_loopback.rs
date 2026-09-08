use std::{
    io::{Read, Write},
    net::{TcpListener, TcpStream},
    sync::{mpsc, Mutex},
    thread,
    time::{Duration, Instant},
};

use tauri::{
    AppHandle, Emitter, LogicalPosition, Manager, State, TitleBarStyle, Url, WebviewUrl,
    WebviewWindowBuilder,
};

const CALLBACK_PATH: &str = "/oauth/callback";
const CALLBACK_EVENT: &str = "oauth-loopback-callback";
const LISTENER_TIMEOUT: Duration = Duration::from_secs(300);
const OAUTH_WINDOW_LABEL: &str = "oauth-login";

#[derive(Default)]
pub struct OAuthLoopbackState(Mutex<Option<(String, mpsc::Sender<()>)>>);

#[tauri::command(rename_all = "camelCase")]
pub fn start_oauth_loopback(
    app: AppHandle,
    state: State<'_, OAuthLoopbackState>,
    expected_state: String,
) -> Result<String, String> {
    let listener = TcpListener::bind(("127.0.0.1", 0))
        .map_err(|error| format!("Unable to open OAuth callback listener: {error}"))?;
    listener
        .set_nonblocking(true)
        .map_err(|error| format!("Unable to configure OAuth callback listener: {error}"))?;

    let port = listener
        .local_addr()
        .map_err(|error| format!("Unable to read OAuth callback address: {error}"))?
        .port();
    let redirect_uri = format!("http://127.0.0.1:{port}{CALLBACK_PATH}");
    let (cancel_tx, cancel_rx) = mpsc::channel();

    {
        let mut active = state
            .0
            .lock()
            .map_err(|_| "OAuth callback listener state is unavailable".to_string())?;
        if let Some((_, previous)) = active.take() {
            let _ = previous.send(());
        }
        *active = Some((expected_state.clone(), cancel_tx));
    }

    thread::spawn(move || {
        let deadline = Instant::now() + LISTENER_TIMEOUT;

        while Instant::now() < deadline {
            if cancel_rx.try_recv().is_ok() {
                return;
            }

            match listener.accept() {
                Ok((mut stream, _)) => {
                    if let Some(callback_url) = read_callback(&mut stream, port, &expected_state) {
                        write_response(&mut stream, 200, "Authentication complete. You can close this window and return to RHermes.");
                        let _ = app.emit(CALLBACK_EVENT, callback_url);
                        return;
                    }

                    write_response(&mut stream, 400, "Invalid OAuth callback.");
                }
                Err(error) if error.kind() == std::io::ErrorKind::WouldBlock => {
                    thread::sleep(Duration::from_millis(50));
                }
                Err(_) => return,
            }
        }
    });

    Ok(redirect_uri)
}

#[tauri::command(rename_all = "camelCase")]
pub async fn open_oauth_webview(
    app: AppHandle,
    authorize_url: String,
    redirect_uri: String,
) -> Result<(), String> {
    let authorize_url = authorize_url
        .parse::<Url>()
        .map_err(|error| format!("Invalid OAuth authorize URL: {error}"))?;
    if authorize_url.scheme() != "https" && authorize_url.scheme() != "http" {
        return Err("OAuth authorize URL must use http or https".to_string());
    }

    let redirect_url = redirect_uri
        .parse::<Url>()
        .map_err(|error| format!("Invalid OAuth redirect URL: {error}"))?;
    if redirect_url.scheme() != "http" || redirect_url.host_str() != Some("127.0.0.1") {
        return Err("OAuth redirect URL must use the 127.0.0.1 loopback interface".to_string());
    }

    if let Some(window) = app.get_webview_window(OAUTH_WINDOW_LABEL) {
        window
            .close()
            .map_err(|error| format!("Unable to close the previous OAuth window: {error}"))?;
    }

    let callback_app = app.clone();
    let expected_redirect = redirect_url.clone();
    let oauth_window = WebviewWindowBuilder::new(
        &app,
        OAUTH_WINDOW_LABEL,
        WebviewUrl::External(authorize_url),
    )
    .title("Sign in to RHermes")
    .inner_size(560.0, 760.0)
    .min_inner_size(420.0, 560.0)
    .center();

    #[cfg(target_os = "macos")]
    let oauth_window = oauth_window
        .hidden_title(true)
        .title_bar_style(TitleBarStyle::Overlay)
        .traffic_light_position(LogicalPosition::new(16.0, 16.0));

    oauth_window
        .on_navigation(move |url| {
            if !is_expected_callback(url, &expected_redirect) {
                return true;
            }

            // The frontend owns the PKCE transaction and validates `state` before
            // exchanging the code. Forward every callback for the exact redirect
            // URI so a mismatch is reported immediately instead of timing out.
            let _ = callback_app.emit(CALLBACK_EVENT, url.as_str());
            if let Some(window) = callback_app.get_webview_window(OAUTH_WINDOW_LABEL) {
                let _ = window.close();
            }

            // Never let the embedded webview perform a real request to the loopback
            // callback. The local listener remains active as a fallback for providers
            // that force the authorization step into an external browser.
            false
        })
        .build()
        .map_err(|error| format!("Unable to open the OAuth window: {error}"))?;

    Ok(())
}

#[tauri::command(rename_all = "camelCase")]
pub fn cancel_oauth_loopback(
    app: AppHandle,
    state: State<'_, OAuthLoopbackState>,
    expected_state: String,
) -> Result<(), String> {
    let mut active = state
        .0
        .lock()
        .map_err(|_| "OAuth callback listener state is unavailable".to_string())?;

    if active
        .as_ref()
        .is_some_and(|(value, _)| value == &expected_state)
    {
        if let Some((_, cancel)) = active.take() {
            let _ = cancel.send(());
        }
        if let Some(window) = app.get_webview_window(OAUTH_WINDOW_LABEL) {
            let _ = window.close();
        }
    }

    Ok(())
}

fn is_expected_callback(url: &Url, expected: &Url) -> bool {
    url.scheme() == expected.scheme()
        && url.host_str() == expected.host_str()
        && url.port_or_known_default() == expected.port_or_known_default()
        && url.path() == expected.path()
}

fn read_callback(stream: &mut TcpStream, port: u16, expected_state: &str) -> Option<String> {
    stream.set_read_timeout(Some(Duration::from_secs(2))).ok()?;

    let mut buffer = [0_u8; 8192];
    let size = stream.read(&mut buffer).ok()?;
    let request = std::str::from_utf8(&buffer[..size]).ok()?;
    let mut lines = request.lines();
    let request_line = lines.next()?;
    let mut parts = request_line.split_whitespace();

    if parts.next()? != "GET" {
        return None;
    }

    let target = parts.next()?;
    if !target.starts_with(CALLBACK_PATH) {
        return None;
    }

    let expected_host = format!("127.0.0.1:{port}");
    let host_matches = lines.any(|line| {
        line.split_once(':').is_some_and(|(name, value)| {
            name.eq_ignore_ascii_case("host") && value.trim() == expected_host
        })
    });
    if !host_matches {
        return None;
    }

    let query = target.split_once('?')?.1;
    let expected_pair = format!("state={expected_state}");
    if !query.split('&').any(|part| part == expected_pair) {
        return None;
    }

    Some(format!("http://{expected_host}{target}"))
}

fn write_response(stream: &mut TcpStream, status: u16, message: &str) {
    let reason = if status == 200 { "OK" } else { "Bad Request" };
    let body = format!(
        "<!doctype html><html><head><meta charset=\"utf-8\"><title>RHermes</title><style>body{{font:16px system-ui;margin:0;display:grid;min-height:100vh;place-items:center;background:#f6f7f9;color:#17171a}}main{{max-width:32rem;padding:2rem;text-align:center}}</style></head><body><main><h1>RHermes</h1><p>{message}</p></main></body></html>"
    );
    let response = format!(
        "HTTP/1.1 {status} {reason}\r\nContent-Type: text/html; charset=utf-8\r\nContent-Length: {}\r\nConnection: close\r\nCache-Control: no-store\r\n\r\n{body}",
        body.len()
    );
    let _ = stream.write_all(response.as_bytes());
    let _ = stream.flush();
}
