use serde::{Deserialize, Serialize};
use std::collections::{HashMap, HashSet};
use std::sync::{Arc, Mutex};

#[derive(Clone, Debug, Default, Deserialize, Serialize)]
pub struct BlockedApp {
    pub name: String,
    pub exe: String,
}

/// What the UI asks the blocker to enforce. Sent whenever a watch starts, ends or the lists change.
#[derive(Clone, Debug, Default, Deserialize, Serialize)]
#[serde(rename_all = "camelCase")]
pub struct BlockerConfig {
    pub active: bool,
    /// "steady" (hold to open anyway) or "storm" (no way through)
    pub firmness: String,
    pub apps: Vec<BlockedApp>,
    pub sites: Vec<String>,
    pub destination: String,
    pub ends_at: Option<f64>,
    pub watch_id: Option<String>,
}

#[derive(Default)]
pub struct Shared {
    pub config: BlockerConfig,
    /// executables the user held to open anyway during this watch
    pub allowed_apps: HashSet<String>,
    /// sites the user held to open anyway during this watch
    pub allowed_sites: HashSet<String>,
    /// browser helper → last time it checked in (ms since the epoch)
    pub helpers: HashMap<String, u64>,
    /// the app the shield is covering: (exe, window handle)
    pub shield_for: Option<(String, isize)>,
    pub close_to_tray: bool,
}

pub type SharedState = Arc<Mutex<Shared>>;

pub fn new_state() -> SharedState {
    Arc::new(Mutex::new(Shared { close_to_tray: true, ..Default::default() }))
}

pub fn now_ms() -> u64 {
    std::time::SystemTime::now()
        .duration_since(std::time::UNIX_EPOCH)
        .map(|d| d.as_millis() as u64)
        .unwrap_or(0)
}
