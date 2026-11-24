import { createRoot } from "react-dom/client";
import { App } from "./App.tsx";
import "./theme.css";
import "./styles.css";
import { iniciarPrefs } from "./prefs.ts";

iniciarPrefs();
createRoot(document.getElementById("root")!).render(<App />);
