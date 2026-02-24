import { createRoot } from "react-dom/client";
import { Web3AuthProvider } from "@web3auth/modal/react";
import { web3AuthContextConfig } from "@/lib/web3auth";
import App from "./App.tsx";
import "./index.css";

createRoot(document.getElementById("root")!).render(
  <Web3AuthProvider config={web3AuthContextConfig}>
    <App />
  </Web3AuthProvider>
);
