import { createRoot } from "react-dom/client";
import App from "./App";
import { decideBoot } from "./boot";
import "./styles.css";

// The query string is read before anything renders. No StrictMode: its double-invoked effects
// would send the single-use authorization code to Epic twice.
const boot = decideBoot();
createRoot(document.getElementById("root")!).render(<App boot={boot} />);
