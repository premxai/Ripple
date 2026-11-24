import { createRoot } from "react-dom/client";
import App from "./App";
import "./index.css";

// No StrictMode: drei's <Html> creates its own React roots and StrictMode's double
// mount makes React 19 log "synchronously unmount a root" errors for every resident.
createRoot(document.getElementById("root")!).render(<App />);
