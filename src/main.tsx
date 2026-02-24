import { createRoot } from "react-dom/client";
import { Web3AuthProvider } from "@web3auth/modal/react";
import { web3AuthConfig } from "./lib/web3auth";
import App from "./App.tsx";
import "./index.css";

createRoot(document.getElementById("root")!).render(
  <Web3AuthProvider config={web3AuthConfig}>
    <App />
  </Web3AuthProvider>
);
