import { createRoot } from "react-dom/client";
import { useEffect, useState, type FormEvent } from "react";
import CopilotApp from "./CopilotApp";
import "./copilot.css";
function App() {
  const [ready, setReady] = useState(false);
  const [checking, setChecking] = useState(true);
  const [code, setCode] = useState("");
  const [error, setError] = useState("");
  const [busy, setBusy] = useState(false);
  useEffect(() => { fetch('/api/copilot?action=session').then(r => setReady(r.ok)).catch(() => {}).finally(() => setChecking(false)); }, []);
  async function unlock(e: FormEvent) {
    e.preventDefault(); setBusy(true); setError("");
    try {
      const r = await fetch('/api/verify-access', { method:'POST', headers:{'Content-Type':'application/json'}, body:JSON.stringify({code}) });
      if (!r.ok) throw new Error(r.status === 401 ? "Code incorrect. Réessayez." : "L’accès est momentanément indisponible.");
      setCode(""); setReady(true);
    } catch(e) { setError(e instanceof Error ? e.message : "Connexion impossible."); }
    finally { setBusy(false); }
  }
  if (checking) return <main className="access-page">Chargement…</main>;
  if (ready) return <CopilotApp embedded />;
  return <main className="access-page"><form className="access-card" onSubmit={unlock}>
    <div className="access-logo">Cly</div><h1>Votre Copilot Clynect</h1>
    <p>Préparez vos missions et vos profils avec votre assistant IA.</p>
    <label htmlFor="access-code">Code d’accès privé</label>
    <input id="access-code" type="password" autoComplete="current-password" value={code} onChange={e=>setCode(e.target.value)} required />
    {error && <p role="alert">{error}</p>}
    <button type="submit" disabled={busy}>{busy ? 'Connexion…' : 'Ouvrir le Copilot'}</button>
    <small>Vos conversations sont liées à ce navigateur. Ne partagez pas votre code d’accès.</small>
  </form></main>;
}
createRoot(document.getElementById("copilot-root")!).render(<App />);
