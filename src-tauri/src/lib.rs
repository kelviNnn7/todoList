use rusqlite::{params, Connection};
use std::sync::Mutex;
use tauri::{
    menu::{Menu, MenuItem},
    tray::TrayIconBuilder,
    LogicalSize, Manager, Size, WebviewWindow, WindowEvent,
};
use tauri_plugin_autostart::MacosLauncher;

struct DatabaseState(Mutex<Connection>);

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
    database: tauri::State<'_, DatabaseState>,
    id: String,
    payload: String,
    updated_at: String,
) -> Result<(), String> {
    if payload.len() > 65_535 {
        return Err("item payload exceeds 65535 bytes".into());
    }
    let connection = database.0.lock().map_err(|error| error.to_string())?;
    connection
        .execute(
            "INSERT INTO items (id, payload, updated_at) VALUES (?1, ?2, ?3) ON CONFLICT(id) DO UPDATE SET payload = excluded.payload, updated_at = excluded.updated_at",
            params![id, payload, updated_at],
        )
        .map_err(|error| error.to_string())?;
    Ok(())
}

#[tauri::command]
fn delete_item(database: tauri::State<'_, DatabaseState>, id: String) -> Result<(), String> {
    let connection = database.0.lock().map_err(|error| error.to_string())?;
    connection
        .execute("DELETE FROM items WHERE id = ?1", params![id])
        .map_err(|error| error.to_string())?;
    Ok(())
}

#[tauri::command]
fn set_window_mode(window: WebviewWindow, expanded: bool) -> Result<(), String> {
    let size = if expanded {
        LogicalSize::new(900.0, 640.0)
    } else {
        LogicalSize::new(360.0, 620.0)
    };
    window
        .set_size(Size::Logical(size))
        .map_err(|error| error.to_string())?;
    window
        .set_resizable(expanded)
        .map_err(|error| error.to_string())?;
    Ok(())
}

#[tauri::command]
fn set_position_locked(_window: WebviewWindow, _locked: bool) -> Result<(), String> {
    Ok(())
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
        .plugin(tauri_plugin_single_instance::init(|app, _, _| {
            if let Some(window) = app.get_webview_window("main") {
                let _ = window.show();
                let _ = window.set_focus();
            }
        }))
        .plugin(tauri_plugin_notification::init())
        .plugin(tauri_plugin_window_state::Builder::default().build())
        .plugin(tauri_plugin_autostart::init(
            MacosLauncher::LaunchAgent,
            Some(vec!["--silent"]),
        ))
        .invoke_handler(tauri::generate_handler![list_items, upsert_item, delete_item, set_window_mode, set_position_locked, set_desktop_widget_mode])
        .setup(|app| {
            let data_dir = app.path().app_data_dir()?;
            std::fs::create_dir_all(&data_dir)?;
            let connection = Connection::open(data_dir.join("pindo.db"))?;
            connection.execute(
                "CREATE TABLE IF NOT EXISTS items (id TEXT PRIMARY KEY NOT NULL, payload TEXT NOT NULL CHECK(length(payload) <= 65535), updated_at TEXT NOT NULL)",
                [],
            )?;
            app.manage(DatabaseState(Mutex::new(connection)));
            let show = MenuItem::with_id(app, "show", "显示钉事", true, None::<&str>)?;
            let quit = MenuItem::with_id(app, "quit", "退出钉事", true, None::<&str>)?;
            let menu = Menu::with_items(app, &[&show, &quit])?;
            TrayIconBuilder::new()
                .icon(
                    app.default_window_icon()
                        .cloned()
                        .expect("application icon is required"),
                )
                .tooltip("钉事 PinDo")
                .menu(&menu)
                .show_menu_on_left_click(false)
                .on_menu_event(|app, event| match event.id.as_ref() {
                    "show" => {
                        if let Some(window) = app.get_webview_window("main") {
                            let _ = window.show();
                            let _ = window.set_focus();
                        }
                    }
                    "quit" => app.exit(0),
                    _ => {}
                })
                .build(app)?;
            Ok(())
        })
        .on_window_event(|window, event| {
            if let WindowEvent::CloseRequested { api, .. } = event {
                api.prevent_close();
                let _ = window.hide();
            }
        })
        .run(tauri::generate_context!())
        .expect("failed to run PinDo");
}
