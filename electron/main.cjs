const { app, BrowserWindow, ipcMain, Menu, Notification, screen, shell, Tray } = require("electron");
const fs = require("node:fs");
const path = require("node:path");

const APP_IDENTIFIER = "com.todo.desktop";
const URL_SCHEME = "todo-widget";
const STATE_FILE_NAME = "todo-state.json";
const IPC_PREFIX = "desktop";

let mainWindow;
let tray;
let boundsTimer;
let resizeSession;
let state = { items: Object.create(null), positionLocked: false, edgeSnap: true, bounds: null };

const statePath = () => path.join(app.getPath("userData"), STATE_FILE_NAME);
const autostartPath = () => path.join(app.getPath("home"), ".config", "autostart", `${APP_IDENTIFIER}.desktop`);

function loadState() {
  try {
    const parsed = JSON.parse(fs.readFileSync(statePath(), "utf8"));
    if (parsed && typeof parsed === "object") {
      const items = parsed.items && typeof parsed.items === "object"
        ? Object.assign(Object.create(null), parsed.items)
        : Object.create(null);
      state = { ...state, ...parsed, items };
    }
  } catch (error) {
    if (error.code !== "ENOENT") console.error("Failed to load desktop state", error);
  }
}

function saveState() {
  const target = statePath();
  const temporary = `${target}.tmp`;
  fs.mkdirSync(path.dirname(target), { recursive: true });
  fs.writeFileSync(temporary, JSON.stringify(state), { mode: 0o600 });
  fs.renameSync(temporary, target);
}

function clampBounds(bounds) {
  const area = screen.getDisplayMatching(bounds).workArea;
  const width = Math.min(Math.max(bounds.width, 340), area.width);
  const height = Math.min(Math.max(bounds.height, 520), area.height);
  let x = Math.min(Math.max(bounds.x, area.x), area.x + area.width - width);
  let y = Math.min(Math.max(bounds.y, area.y), area.y + area.height - height);
  if (state.edgeSnap && !state.positionLocked) {
    const right = area.x + area.width - width;
    const bottom = area.y + area.height - height;
    if (Math.abs(x - area.x) <= 8) x = area.x;
    if (Math.abs(x - right) <= 8) x = right;
    if (Math.abs(y - area.y) <= 8) y = area.y;
    if (Math.abs(y - bottom) <= 8) y = bottom;
  }
  return { x, y, width, height };
}

function persistBounds() {
  if (!mainWindow || mainWindow.isDestroyed()) return;
  const current = mainWindow.getBounds();
  const bounded = clampBounds(current);
  if (JSON.stringify(bounded) !== JSON.stringify(current)) mainWindow.setBounds(bounded);
  state.bounds = bounded;
  saveState();
}

function scheduleBoundsSave() {
  clearTimeout(boundsTimer);
  boundsTimer = setTimeout(persistBounds, 150);
}

function resizeBounds(direction, point) {
  if (!resizeSession || !point || !Number.isFinite(point.x) || !Number.isFinite(point.y)) return null;
  const dx = point.x - resizeSession.point.x;
  const dy = point.y - resizeSession.point.y;
  const initial = resizeSession.bounds;
  let { x, y, width, height } = initial;
  if (direction.includes("East")) width = Math.max(340, initial.width + dx);
  if (direction.includes("South")) height = Math.max(520, initial.height + dy);
  if (direction.includes("West")) {
    width = Math.max(340, initial.width - dx);
    x = initial.x + initial.width - width;
  }
  if (direction.includes("North")) {
    height = Math.max(520, initial.height - dy);
    y = initial.y + initial.height - height;
  }
  return clampBounds({ x, y, width, height });
}

function emit(event, payload) {
  if (mainWindow && !mainWindow.isDestroyed()) mainWindow.webContents.send(`${IPC_PREFIX}:${event}`, payload);
}

function createWindow() {
  const initial = state.bounds ? clampBounds(state.bounds) : { width: 360, height: 620 };
  mainWindow = new BrowserWindow({
    ...initial,
    minWidth: 340,
    minHeight: 520,
    frame: false,
    transparent: true,
    backgroundColor: "#00000000",
    resizable: true,
    movable: !state.positionLocked,
    show: false,
    title: "BluNote",
    icon: path.join(__dirname, "../src-tauri/icons/icon.png"),
    webPreferences: {
      preload: path.join(__dirname, "preload.cjs"),
      contextIsolation: true,
      nodeIntegration: false,
      sandbox: true
    }
  });
  mainWindow.loadFile(path.join(__dirname, "../dist/index.html"));
  mainWindow.webContents.setWindowOpenHandler(({ url }) => {
    if (url.startsWith("https://") || url.startsWith("http://")) void shell.openExternal(url);
    return { action: "deny" };
  });
  mainWindow.webContents.on("will-navigate", (event, url) => {
    if (!url.startsWith("file://")) event.preventDefault();
  });
  mainWindow.webContents.session.setPermissionRequestHandler((_contents, _permission, callback) => callback(false));
  mainWindow.once("ready-to-show", () => { if (!process.argv.includes("--silent")) mainWindow.show(); });
  mainWindow.on("close", (event) => {
    if (!app.isQuitting) {
      event.preventDefault();
      mainWindow.hide();
    }
  });
  mainWindow.on("move", scheduleBoundsSave);
  mainWindow.on("resize", scheduleBoundsSave);
}

function createTray() {
  tray = new Tray(path.join(__dirname, "../src-tauri/icons/32x32.png"));
  tray.setToolTip("BluNote");
  const refresh = () => tray.setContextMenu(Menu.buildFromTemplate([
    { label: "显示 BluNote", click: () => { mainWindow.show(); mainWindow.focus(); } },
    {
      label: "锁定位置",
      type: "checkbox",
      checked: state.positionLocked,
      click: (item) => {
        state.positionLocked = item.checked;
        mainWindow.setMovable(!item.checked);
        saveState();
        emit("position-lock-changed", item.checked);
        refresh();
      }
    },
    { type: "separator" },
    { label: "退出 BluNote", click: () => { app.isQuitting = true; app.quit(); } }
  ]));
  refresh();
  tray.on("double-click", () => { mainWindow.show(); mainWindow.focus(); });
}

function setAutostart(enabled) {
  const target = autostartPath();
  if (!enabled) {
    try { fs.unlinkSync(target); } catch (error) { if (error.code !== "ENOENT") throw error; }
    return;
  }
  const executable = app.getPath("exe").replaceAll('"', '\\"');
  const entry = `[Desktop Entry]\nType=Application\nName=BluNote\nExec="${executable}" --silent\nX-GNOME-Autostart-enabled=true\n`;
  fs.mkdirSync(path.dirname(target), { recursive: true });
  fs.writeFileSync(target, entry, { mode: 0o600 });
}

const singleInstance = app.requestSingleInstanceLock();
if (!singleInstance) {
  app.quit();
} else {
  app.setAsDefaultProtocolClient(URL_SCHEME);
  app.on("second-instance", (_event, argv) => {
    mainWindow?.show();
    mainWindow?.focus();
    const url = argv.find((entry) => entry.startsWith(`${URL_SCHEME}://`));
    if (url) emit("deep-link", url);
  });
  app.whenReady().then(() => { loadState(); createWindow(); createTray(); });
}
app.on("window-all-closed", () => {});

ipcMain.handle(`${IPC_PREFIX}:list_items`, () => Object.values(state.items)
  .sort((left, right) => String(right.updatedAt).localeCompare(String(left.updatedAt)))
  .map((item) => item.payload));
ipcMain.handle(`${IPC_PREFIX}:upsert_item`, (_event, args) => {
  if (typeof args.id !== "string" || typeof args.payload !== "string" || args.payload.length > 65535) throw new Error("Invalid item payload");
  if (["__proto__", "constructor", "prototype"].includes(args.id)) throw new Error("Invalid item id");
  const parsed = JSON.parse(args.payload);
  if (parsed.id !== args.id) throw new Error("Item id does not match payload");
  state.items[args.id] = { payload: args.payload, updatedAt: String(args.updatedAt || "") };
  saveState();
});
ipcMain.handle(`${IPC_PREFIX}:delete_item`, (_event, { id }) => {
  if (typeof id === "string") { delete state.items[id]; saveState(); }
});
ipcMain.handle(`${IPC_PREFIX}:show_main_window`, () => { mainWindow.show(); mainWindow.focus(); });
ipcMain.handle(`${IPC_PREFIX}:set_window_mode`, (_event, { expanded }) => mainWindow.setSize(expanded ? 900 : 360, expanded ? 640 : 620, true));
ipcMain.handle(`${IPC_PREFIX}:set_position_locked`, (_event, { locked }) => {
  state.positionLocked = Boolean(locked);
  mainWindow.setMovable(!state.positionLocked);
  saveState();
  emit("position-lock-changed", state.positionLocked);
});
ipcMain.handle(`${IPC_PREFIX}:set_edge_snap`, (_event, { enabled }) => { state.edgeSnap = Boolean(enabled); saveState(); });
ipcMain.handle(`${IPC_PREFIX}:set_desktop_widget_mode`, (_event, { enabled }) => { mainWindow.setSkipTaskbar(Boolean(enabled)); mainWindow.setAlwaysOnTop(false); });
ipcMain.handle(`${IPC_PREFIX}:set_widget_opacity`, () => undefined);
ipcMain.handle(`${IPC_PREFIX}:start_window_resize`, (_event, { direction, point }) => {
  if (typeof direction !== "string" || !point || !Number.isFinite(point.x) || !Number.isFinite(point.y)) return;
  resizeSession = { direction, point, bounds: mainWindow.getBounds() };
});
ipcMain.handle(`${IPC_PREFIX}:update_window_resize`, (_event, { point }) => {
  if (!resizeSession) return;
  const bounds = resizeBounds(resizeSession.direction, point);
  if (bounds) mainWindow.setBounds(bounds);
});
ipcMain.handle(`${IPC_PREFIX}:end_window_resize`, () => { resizeSession = undefined; persistBounds(); });
ipcMain.handle(`${IPC_PREFIX}:send_task_notification`, (_event, { taskId, title, body }) => {
  const notification = new Notification({
    title: `任务提醒 · ${String(title)}`,
    body: String(body),
    actions: [{ type: "button", text: "30 分钟后" }, { type: "button", text: "1 小时后" }]
  });
  notification.on("click", () => emit("task-reminder-action", { taskId, actionId: "default" }));
  notification.on("action", (_actionEvent, index) => emit("task-reminder-action", { taskId, actionId: index === 0 ? "30m" : "1h" }));
  notification.show();
});
ipcMain.handle(`${IPC_PREFIX}:meeting-notification`, (_event, options) => {
  new Notification({ title: String(options.title), body: String(options.body) }).show();
});
ipcMain.handle(`${IPC_PREFIX}:autostart:get`, () => fs.existsSync(autostartPath()));
ipcMain.handle(`${IPC_PREFIX}:autostart:set`, (_event, enabled) => setAutostart(Boolean(enabled)));
