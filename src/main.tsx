import { StrictMode } from "react";
import { createRoot } from "react-dom/client";
import App from "./App";
import { applyWidgetOpacity, readStoredWidgetOpacity } from "./lib/appearance";
import "./styles.css";

applyWidgetOpacity(readStoredWidgetOpacity());

createRoot(document.getElementById("root")!).render(<StrictMode><App/></StrictMode>);
