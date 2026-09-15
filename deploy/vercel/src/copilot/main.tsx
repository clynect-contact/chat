import { createRoot } from "react-dom/client";
import CopilotApp from "./CopilotApp";
import "./copilot.css";
createRoot(document.getElementById("copilot-root")!).render(<CopilotApp embedded />);
