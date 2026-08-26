use rusqlite::{params, Connection};
use std::{
    path::Path,
    sync::{
        atomic::{AtomicBool, AtomicU64, Ordering},
        Mutex,
    },
    time::Duration,
};
use tauri::{
    menu::{CheckMenuItem, Menu, MenuItem},
    tray::TrayIconBuilder,
    Emitter, LogicalSize, Manager, PhysicalPosition, PhysicalSize, Position, Size, WebviewWindow,
    WindowEvent,
};
use tauri_plugin_autostart::MacosLauncher;
use tauri_plugin_window_state::{AppHandleExt, StateFlags};

const APP_BUNDLE_IDENTIFIER: &str = "com.todo.desktop";
const APP_GROUP_IDENTIFIER: &str = "group.com.todo.desktop";
const APP_URL_SCHEME: &str = "todo-widget";
const DATA_FILE_NAME: &str = "todo.db";
const WIDGET_RELOADER_NAME: &str = "WidgetReloader";

struct DatabaseState(Mutex<Connection>);
struct TrayState(Mutex<Option<CheckMenuItem<tauri::Wry>>>);

fn legacy_namespace() -> String {
    ["pin", "do"].concat()
}

fn migrate_legacy_database(data_dir: &Path) -> std::io::Result<()> {
    let destination = data_dir.join(DATA_FILE_NAME);
    if destination.exists() {
        return Ok(());
    }
    let Some(app_data_root) = data_dir.parent() else {
        return Ok(());
    };
    let namespace = legacy_namespace();
    let legacy_directory = app_data_root.join(format!("com.{namespace}.desktop"));
    let legacy_file_name = format!("{namespace}.db");
    if !legacy_directory.join(&legacy_file_name).is_file() {
        return Ok(());
    }

    std::fs::create_dir_all(data_dir)?;
    for suffix in ["", "-wal", "-shm"] {
        let source = legacy_directory.join(format!("{legacy_file_name}{suffix}"));
        if source.is_file() {
            std::fs::copy(source, data_dir.join(format!("{DATA_FILE_NAME}{suffix}")))?;
        }
    }
    Ok(())
}

#[derive(Default)]
struct WindowPreferences {
    locked: AtomicBool,
    edge_snap: AtomicBool,
    move_epoch: AtomicU64,
    widget_opacity: AtomicU64,
}

fn persisted_window_state_flags() -> StateFlags {
    // Tauri stores window dimensions in physical pixels. Restoring those values before macOS
    // has settled the monitor scale factor can turn a 360×620 logical window into 720×1240 on
    // Retina displays, while the web UI still starts in compact mode. Position is scale-safe;
    // the window size is intentionally reset from tauri.conf.json on every cold start.
    StateFlags::POSITION
}

fn migrate_database(connection: &Connection) -> rusqlite::Result<()> {
    connection.execute(
        "CREATE TABLE IF NOT EXISTS items (id TEXT PRIMARY KEY NOT NULL, payload TEXT NOT NULL CHECK(length(payload) <= 65535), updated_at TEXT NOT NULL, reminder_at TEXT, reminder_status TEXT NOT NULL DEFAULT 'none', snooze_count INTEGER NOT NULL DEFAULT 0)",
        [],
    )?;
    let version: i64 = connection.query_row("PRAGMA user_version", [], |row| row.get(0))?;
    if version < 2 {
        let columns = connection
            .prepare("PRAGMA table_info(items)")?
            .query_map([], |row| row.get::<_, String>(1))?
            .collect::<Result<Vec<_>, _>>()?;
        if !columns.iter().any(|column| column == "reminder_at") {
            connection.execute("ALTER TABLE items ADD COLUMN reminder_at TEXT", [])?;
        }
        if !columns.iter().any(|column| column == "reminder_status") {
            connection.execute(
                "ALTER TABLE items ADD COLUMN reminder_status TEXT NOT NULL DEFAULT 'none'",
                [],
            )?;
        }
        if !columns.iter().any(|column| column == "snooze_count") {
            connection.execute(
                "ALTER TABLE items ADD COLUMN snooze_count INTEGER NOT NULL DEFAULT 0",
                [],
            )?;
        }
        connection.execute("PRAGMA user_version = 2", [])?;
    }
    Ok(())
}

fn snap_coordinate(value: i32, target: i32) -> i32 {
    if (value - target).abs() <= 8 {
        target
    } else {
        value
    }
}

fn clamp_axis(value: i32, origin: i32, work_extent: u32, window_extent: u32) -> i32 {
    let origin = i64::from(origin);
    let far_edge = (origin + i64::from(work_extent) - i64::from(window_extent)).max(origin);
    i64::from(value).clamp(origin, far_edge) as i32
}

fn clamp_window_position(
    position: PhysicalPosition<i32>,
    size: PhysicalSize<u32>,
    work_position: PhysicalPosition<i32>,
    work_size: PhysicalSize<u32>,
) -> PhysicalPosition<i32> {
    PhysicalPosition::new(
        clamp_axis(position.x, work_position.x, work_size.width, size.width),
        clamp_axis(position.y, work_position.y, work_size.height, size.height),
    )
}

fn schedule_window_position_save(window: &tauri::Window) {
    let preferences = window.state::<WindowPreferences>();
    let epoch = preferences.move_epoch.fetch_add(1, Ordering::Relaxed) + 1;
    let app = window.app_handle().clone();
    std::thread::spawn(move || {
        std::thread::sleep(Duration::from_millis(500));
        let preferences = app.state::<WindowPreferences>();
        if preferences.move_epoch.load(Ordering::Relaxed) == epoch {
            let _ = app.save_window_state(persisted_window_state_flags());
        }
    });
}

fn write_widget_snapshot(
    app: &tauri::AppHandle,
    connection: &Connection,
    opacity: u64,
) -> Result<(), String> {
    #[cfg(target_os = "macos")]
    {
        let home = app.path().home_dir().map_err(|error| error.to_string())?;
        let directory = home.join(format!("Library/Group Containers/{APP_GROUP_IDENTIFIER}"));
        std::fs::create_dir_all(&directory).map_err(|error| error.to_string())?;
        let mut statement = connection
            .prepare("SELECT payload FROM items ORDER BY updated_at DESC")
            .map_err(|error| error.to_string())?;
        let payloads = statement
            .query_map([], |row| row.get::<_, String>(0))
            .map_err(|error| error.to_string())?;
        let items = payloads
            .filter_map(Result::ok)
            .filter_map(|payload| serde_json::from_str::<serde_json::Value>(&payload).ok())
            .collect::<Vec<_>>();
        let snapshot = serde_json::json!({
            "version": 2,
            "updatedAt": std::time::SystemTime::now().duration_since(std::time::UNIX_EPOCH).unwrap_or_default().as_secs(),
            "opacity": opacity.clamp(55, 100),
            "items": items,
        });
        let temporary = directory.join("todo-widget.json.tmp");
        std::fs::write(
            &temporary,
            serde_json::to_vec(&snapshot).map_err(|error| error.to_string())?,
        )
        .map_err(|error| error.to_string())?;
        std::fs::rename(temporary, directory.join("todo-widget.json"))
            .map_err(|error| error.to_string())?;
        if let Ok(executable) = std::env::current_exe() {
            if let Some(parent) = executable.parent() {
                let reloader = parent.join(WIDGET_RELOADER_NAME);
                if reloader.is_file() {
                    let _ = std::process::Command::new(reloader).spawn();
                }
            }
        }
    }
    #[cfg(not(target_os = "macos"))]
    let _ = (app, connection, opacity);
    Ok(())
}

#[tauri::command]
fn list_items(database: tauri::State<'_, DatabaseState>) -> Result<Vec<String>, String> {
    let connection = database.0.lock().map_err(|error| error.to_string())?;
    let mut statement = connection
        .prepare("SELECT payload FROM items ORDER BY updated_at DESC")
        .map_err(|error| error.to_string())?;
    let rows = statement
        .query_map([], |row| row.get::<_, String>(0))
        .map_err(|error| error.to_string())?;
    rows.collect::<Result<Vec<_>, _>>()
        .map_err(|error| error.to_string())
}

#[tauri::command]
fn upsert_item(
    app: tauri::AppHandle,
    database: tauri::State<'_, DatabaseState>,
    preferences: tauri::State<'_, WindowPreferences>,
    id: String,
    payload: String,
    updated_at: String,
) -> Result<(), String> {
    if payload.len() > 65_535 {
        return Err("item payload exceeds 65535 bytes".into());
    }
    let value: serde_json::Value =
        serde_json::from_str(&payload).map_err(|_| "item payload must be valid JSON")?;
    if value.get("id").and_then(|value| value.as_str()) != Some(id.as_str()) {
        return Err("item id does not match payload".into());
    }
    let reminder_at = value.get("reminderAt").and_then(|value| value.as_str());
    let reminder_status = value
        .get("reminderStatus")
        .and_then(|value| value.as_str())
        .unwrap_or("none");
    if !matches!(reminder_status, "none" | "pending" | "fired" | "snoozed") {
        return Err("invalid reminder status".into());
    }
    let snooze_count = value
        .get("snoozeCount")
        .and_then(|value| value.as_u64())
        .unwrap_or(0)
        .min(3) as i64;
    let connection = database.0.lock().map_err(|error| error.to_string())?;
    connection
        .execute(
            "INSERT INTO items (id, payload, updated_at, reminder_at, reminder_status, snooze_count) VALUES (?1, ?2, ?3, ?4, ?5, ?6) ON CONFLICT(id) DO UPDATE SET payload = excluded.payload, updated_at = excluded.updated_at, reminder_at = excluded.reminder_at, reminder_status = excluded.reminder_status, snooze_count = excluded.snooze_count",
            params![id, payload, updated_at, reminder_at, reminder_status, snooze_count],
        )
        .map_err(|error| error.to_string())?;
    write_widget_snapshot(
        &app,
        &connection,
        preferences.widget_opacity.load(Ordering::Relaxed),
    )?;
    Ok(())
}

#[tauri::command]
fn delete_item(
    app: tauri::AppHandle,
    database: tauri::State<'_, DatabaseState>,
    preferences: tauri::State<'_, WindowPreferences>,
    id: String,
) -> Result<(), String> {
    let connection = database.0.lock().map_err(|error| error.to_string())?;
    connection
        .execute("DELETE FROM items WHERE id = ?1", params![id])
        .map_err(|error| error.to_string())?;
    write_widget_snapshot(
        &app,
        &connection,
        preferences.widget_opacity.load(Ordering::Relaxed),
    )?;
    Ok(())
}

#[tauri::command]
fn send_task_notification(
    app: tauri::AppHandle,
    task_id: String,
    title: String,
    body: String,
) -> Result<(), String> {
    #[cfg(target_os = "macos")]
    let _ = notify_rust::set_application(APP_BUNDLE_IDENTIFIER);
    let handle = notify_rust::Notification::new()
        .summary(&format!("任务提醒 · {title}"))
        .body(&body)
        .action("30m", "30 分钟后")
        .action("1h", "1 小时后")
        .action("tomorrow9", "明天 9:00")
        .action("custom", "自定义…")
        .show()
        .map_err(|error| error.to_string())?;
    std::thread::spawn(move || {
        handle.wait_for_action(move |action_id| {
            let _ = app.emit(
                "task-reminder-action",
                serde_json::json!({ "taskId": task_id, "actionId": action_id }),
            );
        });
    });
    Ok(())
}

#[tauri::command]
fn show_main_window(app: tauri::AppHandle) {
    if let Some(window) = app.get_webview_window("main") {
        let _ = window.show();
        let _ = window.set_focus();
    }
}

#[tauri::command]
fn set_widget_opacity(
    app: tauri::AppHandle,
    database: tauri::State<'_, DatabaseState>,
    preferences: tauri::State<'_, WindowPreferences>,
    opacity: u64,
) -> Result<(), String> {
    let opacity = opacity.clamp(55, 100);
    preferences.widget_opacity.store(opacity, Ordering::Relaxed);
    let connection = database.0.lock().map_err(|error| error.to_string())?;
    write_widget_snapshot(&app, &connection, opacity)
}

#[tauri::command]
fn set_window_mode(window: WebviewWindow, expanded: bool) -> Result<(), String> {
    let size = if expanded {
        LogicalSize::new(900.0, 640.0)
    } else {
        LogicalSize::new(360.0, 620.0)
    };
    window
        .set_resizable(true)
        .map_err(|error| error.to_string())?;
    window
        .set_size(Size::Logical(size))
        .map_err(|error| error.to_string())?;
    Ok(())
}

#[tauri::command]
fn set_position_locked(
    app: tauri::AppHandle,
    preferences: tauri::State<'_, WindowPreferences>,
    tray: tauri::State<'_, TrayState>,
    locked: bool,
) -> Result<(), String> {
    preferences.locked.store(locked, Ordering::Relaxed);
    if let Ok(item) = tray.0.lock() {
        if let Some(item) = item.as_ref() {
            item.set_checked(locked)
                .map_err(|error| error.to_string())?;
        }
    }
    app.emit("position-lock-changed", locked)
        .map_err(|error| error.to_string())?;
    Ok(())
}

#[tauri::command]
fn set_edge_snap(preferences: tauri::State<'_, WindowPreferences>, enabled: bool) {
    preferences.edge_snap.store(enabled, Ordering::Relaxed);
}

#[tauri::command]
fn set_desktop_widget_mode(window: WebviewWindow, enabled: bool) -> Result<(), String> {
    window
        .set_always_on_top(false)
        .map_err(|error| error.to_string())?;
    window
        .set_always_on_bottom(enabled)
        .map_err(|error| error.to_string())?;
    window
        .set_skip_taskbar(enabled)
        .map_err(|error| error.to_string())?;
    Ok(())
}

pub fn run() {
    tauri::Builder::default()
        .manage(WindowPreferences {
            edge_snap: AtomicBool::new(true),
            widget_opacity: AtomicU64::new(95),
            ..Default::default()
        })
        .manage(TrayState(Mutex::new(None)))
        .plugin(tauri_plugin_single_instance::init(|app, args, _| {
            if let Some(window) = app.get_webview_window("main") {
                let _ = window.show();
                let _ = window.set_focus();
            }
            let scheme_prefix = format!("{APP_URL_SCHEME}://");
            if let Some(url) = args.iter().find(|arg| arg.starts_with(&scheme_prefix)) {
                let _ = app.emit("deep-link", url.clone());
            }
        }))
        .plugin(tauri_plugin_notification::init())
        .plugin(
            tauri_plugin_window_state::Builder::default()
                .with_state_flags(persisted_window_state_flags())
                .build(),
        )
        .plugin(tauri_plugin_autostart::init(
            MacosLauncher::LaunchAgent,
            Some(vec!["--silent"]),
        ))
        .invoke_handler(tauri::generate_handler![
            list_items,
            upsert_item,
            delete_item,
            send_task_notification,
            show_main_window,
            set_widget_opacity,
            set_window_mode,
            set_position_locked,
            set_edge_snap,
            set_desktop_widget_mode
        ])
        .setup(|app| {
            let data_dir = app.path().app_data_dir()?;
            std::fs::create_dir_all(&data_dir)?;
            migrate_legacy_database(&data_dir)?;
            let connection = Connection::open(data_dir.join(DATA_FILE_NAME))?;
            migrate_database(&connection)?;
            app.manage(DatabaseState(Mutex::new(connection)));
            if let Ok(connection) = app.state::<DatabaseState>().0.lock() {
                if let Err(error) = write_widget_snapshot(app.handle(), &connection, 95) {
                    eprintln!("failed to initialize widget snapshot: {error}");
                }
            }
            let show = MenuItem::with_id(app, "show", "显示 BluNote", true, None::<&str>)?;
            let lock = CheckMenuItem::with_id(app, "lock", "锁定位置", true, false, None::<&str>)?;
            if let Ok(mut item) = app.state::<TrayState>().0.lock() {
                *item = Some(lock.clone());
            }
            let quit = MenuItem::with_id(app, "quit", "退出 BluNote", true, None::<&str>)?;
            let menu = Menu::with_items(app, &[&show, &lock, &quit])?;
            let lock_menu = lock.clone();
            TrayIconBuilder::new()
                .icon(
                    app.default_window_icon()
                        .cloned()
                        .expect("application icon is required"),
                )
                .tooltip("BluNote")
                .menu(&menu)
                .show_menu_on_left_click(false)
                .on_menu_event(move |app, event| match event.id.as_ref() {
                    "show" => {
                        if let Some(window) = app.get_webview_window("main") {
                            let _ = window.show();
                            let _ = window.set_focus();
                        }
                    }
                    "lock" => {
                        let preferences = app.state::<WindowPreferences>();
                        let locked = !preferences.locked.load(Ordering::Relaxed);
                        preferences.locked.store(locked, Ordering::Relaxed);
                        let _ = lock_menu.set_checked(locked);
                        let _ = app.emit("position-lock-changed", locked);
                    }
                    "quit" => app.exit(0),
                    _ => {}
                })
                .build(app)?;
            Ok(())
        })
        .on_window_event(|window, event| match event {
            WindowEvent::CloseRequested { api, .. } => {
                api.prevent_close();
                let _ = window.hide();
            }
            WindowEvent::Moved(position) => {
                let preferences = window.state::<WindowPreferences>();
                let monitor = window
                    .current_monitor()
                    .ok()
                    .flatten()
                    .or_else(|| window.primary_monitor().ok().flatten());
                if let (Some(monitor), Ok(size)) = (monitor, window.outer_size()) {
                    let area = monitor.work_area();
                    let mut target = *position;
                    if !preferences.locked.load(Ordering::Relaxed)
                        && preferences.edge_snap.load(Ordering::Relaxed)
                    {
                        let right = area.position.x + area.size.width as i32 - size.width as i32;
                        let bottom = area.position.y + area.size.height as i32 - size.height as i32;
                        target.x = snap_coordinate(target.x, area.position.x);
                        target.y = snap_coordinate(target.y, area.position.y);
                        target.x = snap_coordinate(target.x, right);
                        target.y = snap_coordinate(target.y, bottom);
                    }
                    target = clamp_window_position(target, size, area.position, area.size);
                    if target != *position {
                        let _ = window.set_position(Position::Physical(target));
                    }
                }
                schedule_window_position_save(window);
            }
            WindowEvent::Resized(size) => {
                let monitor = window
                    .current_monitor()
                    .ok()
                    .flatten()
                    .or_else(|| window.primary_monitor().ok().flatten());
                if let Some(monitor) = monitor {
                    let area = monitor.work_area();
                    let bounded_size = PhysicalSize::new(
                        size.width.min(area.size.width),
                        size.height.min(area.size.height),
                    );
                    if bounded_size != *size {
                        let _ = window.set_size(Size::Physical(bounded_size));
                    }
                    if let Ok(position) = window.outer_position() {
                        let target =
                            clamp_window_position(position, bounded_size, area.position, area.size);
                        if target != position {
                            let _ = window.set_position(Position::Physical(target));
                        }
                    }
                }
            }
            _ => {}
        })
        .run(tauri::generate_context!())
        .expect("failed to run BluNote");
}

#[cfg(test)]
mod tests {
    use super::*;
    use std::time::{SystemTime, UNIX_EPOCH};

    #[test]
    fn legacy_database_is_copied_into_neutral_storage_location() {
        let unique = SystemTime::now()
            .duration_since(UNIX_EPOCH)
            .expect("clock")
            .as_nanos();
        let root = std::env::temp_dir().join(format!("todo-database-migration-{unique}"));
        let namespace = legacy_namespace();
        let legacy_directory = root.join(format!("com.{namespace}.desktop"));
        let destination = root.join(APP_BUNDLE_IDENTIFIER);
        std::fs::create_dir_all(&legacy_directory).expect("legacy directory");

        let legacy_database = legacy_directory.join(format!("{namespace}.db"));
        let connection = Connection::open(&legacy_database).expect("legacy database");
        connection
            .execute("CREATE TABLE sample (payload TEXT NOT NULL)", [])
            .expect("legacy table");
        connection
            .execute("INSERT INTO sample (payload) VALUES ('preserved')", [])
            .expect("legacy row");
        drop(connection);

        migrate_legacy_database(&destination).expect("database migration");
        let migrated = Connection::open(destination.join(DATA_FILE_NAME)).expect("new database");
        let payload: String = migrated
            .query_row("SELECT payload FROM sample", [], |row| row.get(0))
            .expect("migrated row");
        assert_eq!(payload, "preserved");
        drop(migrated);
        std::fs::remove_dir_all(root).expect("cleanup");
    }

    #[test]
    fn migration_v2_keeps_existing_payload_and_adds_reminder_columns() {
        let connection = Connection::open_in_memory().expect("database");
        connection.execute("CREATE TABLE items (id TEXT PRIMARY KEY NOT NULL, payload TEXT NOT NULL, updated_at TEXT NOT NULL)", []).expect("legacy table");
        let payload = r#"{"id":"legacy","title":"保留事项"}"#;
        connection
            .execute(
                "INSERT INTO items (id, payload, updated_at) VALUES (?1, ?2, ?3)",
                params!["legacy", payload, "2026-08-20T00:00:00Z"],
            )
            .expect("legacy row");
        migrate_database(&connection).expect("migration");
        let columns = connection
            .prepare("PRAGMA table_info(items)")
            .expect("columns")
            .query_map([], |row| row.get::<_, String>(1))
            .expect("rows")
            .collect::<Result<Vec<_>, _>>()
            .expect("column names");
        assert!(columns.iter().any(|column| column == "reminder_at"));
        assert!(columns.iter().any(|column| column == "reminder_status"));
        assert!(columns.iter().any(|column| column == "snooze_count"));
        assert_eq!(
            connection
                .query_row("SELECT payload FROM items WHERE id = 'legacy'", [], |row| {
                    row.get::<_, String>(0)
                })
                .expect("payload"),
            payload
        );
        assert_eq!(
            connection
                .query_row("PRAGMA user_version", [], |row| row.get::<_, i64>(0))
                .expect("version"),
            2
        );
    }

    #[test]
    fn edge_snap_uses_eight_pixel_threshold() {
        assert_eq!(snap_coordinate(108, 100), 100);
        assert_eq!(snap_coordinate(109, 100), 109);
        assert_eq!(snap_coordinate(92, 100), 100);
    }

    #[test]
    fn window_position_is_kept_inside_visible_work_area() {
        let work_position = PhysicalPosition::new(-1920, 24);
        let work_size = PhysicalSize::new(1920, 1056);
        let window_size = PhysicalSize::new(360, 620);
        assert_eq!(
            clamp_window_position(
                PhysicalPosition::new(-2200, -50),
                window_size,
                work_position,
                work_size,
            ),
            PhysicalPosition::new(-1920, 24)
        );
        assert_eq!(
            clamp_window_position(
                PhysicalPosition::new(0, 900),
                window_size,
                work_position,
                work_size,
            ),
            PhysicalPosition::new(-360, 460)
        );
    }

    #[test]
    fn oversized_window_is_anchored_to_work_area_origin() {
        assert_eq!(clamp_axis(500, 100, 800, 1200), 100);
    }

    #[test]
    fn startup_restores_position_without_retina_scaled_size() {
        let flags = persisted_window_state_flags();
        assert!(flags.contains(StateFlags::POSITION));
        assert!(!flags.contains(StateFlags::SIZE));
    }
}
