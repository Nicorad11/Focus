//! A tiny HTTP endpoint on 127.0.0.1 for the Leeward browser helper (the extension that blocks sites).
//!
//! The extension asks for the block list every few seconds and reports when it turned a page away.
//! Every request must carry `X-Leeward: 1`. A web page can't send that header without a CORS
//! preflight, which this server never approves, and it sends no CORS headers, so pages can neither
//! read the list nor unblock anything. If Leeward isn't running, the helper blocks nothing.

use crate::state::{now_ms, SharedState};
use crate::ui;
use serde::Deserialize;
use serde_json::json;
use std::io::Read;
use tauri::AppHandle;
use tiny_http::{Header, Method, Response, Server};

pub const PORTS: std::ops::RangeInclusive<u16> = 47613..=47616;

#[derive(Deserialize)]
struct Event {
    #[serde(rename = "type")]
    kind: String,
    site: String,
}

pub fn start(app: AppHandle, state: SharedState) {
    std::thread::spawn(move || {
        let Some(server) = PORTS.clone().find_map(|p| Server::http(("127.0.0.1", p)).ok()) else {
            eprintln!("leeward: no free port for the browser helper");
            return;
        };
        for req in server.incoming_requests() {
            handle(&app, &state, req);
        }
    });
}

fn json_response(body: serde_json::Value, status: u16) -> Response<std::io::Cursor<Vec<u8>>> {
    Response::from_data(body.to_string().into_bytes())
        .with_status_code(status)
        .with_header(Header::from_bytes("Content-Type", "application/json").unwrap())
        .with_header(Header::from_bytes("Cache-Control", "no-store").unwrap())
}

fn handle(app: &AppHandle, state: &SharedState, mut req: tiny_http::Request) {
    let ours = req.headers().iter().any(|h| h.field.equiv("X-Leeward") && h.value.as_str() == "1");
    if !ours || *req.method() == Method::Options {
        let _ = req.respond(json_response(json!({ "error": "forbidden" }), 403));
        return;
    }
    let url = req.url().to_string();
    let (path, query) = url.split_once('?').unwrap_or((&url, ""));
    let browser = query
        .split('&')
        .find_map(|kv| kv.strip_prefix("browser="))
        .map(|b| b.chars().filter(|c| c.is_ascii_alphanumeric()).take(16).collect::<String>())
        .unwrap_or_default();

    let response = match (req.method(), path) {
        (Method::Get, "/v1/state") => {
            let mut s = state.lock().unwrap();
            if !browser.is_empty() {
                s.helpers.insert(browser, now_ms());
            }
            let c = &s.config;
            json_response(
                json!({
                    "app": "leeward",
                    "version": env!("CARGO_PKG_VERSION"),
                    "active": c.active,
                    "firmness": c.firmness,
                    "sites": if c.active { c.sites.clone() } else { Vec::new() },
                    "allowed": s.allowed_sites.iter().cloned().collect::<Vec<_>>(),
                    "destination": c.destination,
                    "endsAt": c.ends_at,
                }),
                200,
            )
        }
        (Method::Post, "/v1/event") => {
            let mut body = String::new();
            let _ = req.as_reader().take(4096).read_to_string(&mut body);
            match serde_json::from_str::<Event>(&body) {
                Ok(ev) => {
                    let site = ev.site.to_lowercase();
                    let mut s = state.lock().unwrap();
                    let allowed = s.config.active && s.config.firmness == "steady" && s.config.sites.iter().any(|x| *x == site);
                    match ev.kind.as_str() {
                        "held-off" => {
                            drop(s);
                            ui::emit_blocker_event(app, "held-off", &site, "site");
                            json_response(json!({ "ok": true }), 200)
                        }
                        "opened-anyway" if allowed => {
                            s.allowed_sites.insert(site.clone());
                            drop(s);
                            ui::emit_blocker_event(app, "opened-anyway", &site, "site");
                            json_response(json!({ "ok": true }), 200)
                        }
                        _ => json_response(json!({ "ok": false }), 400),
                    }
                }
                Err(_) => json_response(json!({ "error": "bad request" }), 400),
            }
        }
        _ => json_response(json!({ "error": "not found" }), 404),
    };
    let _ = req.respond(response);
}
