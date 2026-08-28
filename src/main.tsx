import React from "react";
import ReactDOM from "react-dom/client";
import App from "./App";
import PetHouse from "./PetHouse";
import "./styles.css";
import { isTauri } from "./lib/platform";

async function getWindowLabel(): Promise<string> {
  if (!isTauri) return "overlay";
  const { getCurrentWindow } = await import("@tauri-apps/api/window");
  return getCurrentWindow().label;
}

async function bootstrap() {
  const label = await getWindowLabel();
  const Root = label === "pethouse" ? PetHouse : App;

  ReactDOM.createRoot(document.getElementById("root") as HTMLElement).render(
    <React.StrictMode>
      <Root />
    </React.StrictMode>
  );
}

bootstrap();
