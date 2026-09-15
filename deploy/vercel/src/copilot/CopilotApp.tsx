"use client";
import { useEffect, useRef, useState } from "react";

import {
  ArrowUp,
  ArrowUpRight,
  BriefcaseBusiness,
  FileUser,
  Sparkles,
  ShieldCheck,
  MessageSquare,
  Plus,
  Paperclip,
  X,
  Square,
  Check,
  RotateCcw,
  ThumbsUp,
  ThumbsDown,
  PanelRightOpen,
  ChevronLeft,
  LifeBuoy,
  LockKeyhole,
  FolderOpen,
} from "lucide-react";
import {
  Dialog,
  DialogContent,
  DialogTitle,
  DialogDescription,
} from "./ui/dialog";
import { Sheet, SheetContent, SheetTitle, SheetDescription } from "./ui/sheet";
import { Checkbox } from "./ui/checkbox";
import { ReviewCard } from "./ReviewCard";
import { copy, errorText } from "./i18n";

import type {
  Conversation,
  Role,
  Locale,
  Session,
  Field,
  Action,
} from "./contracts";
async function api<T>(path: string, body?: unknown): Promise<T> {
  const r = await fetch(
    `/api/copilot?action=${path}`,
    body === undefined
      ? { cache: "no-store" }
      : {
          method: "POST",
          headers: { "content-type": "application/json" },
          body: JSON.stringify(body),
        },
  );
  const value = (await r.json()) as T & { error?: string };
  if (!r.ok) throw new Error(value.error ?? "SERVER_ERROR");
  return value;
}
type Attachment = { id: string; name: string };
export default function CopilotApp({
  embedded = false,
}: {
  embedded?: boolean;
}) {
  const [locale, setLocale] = useState<Locale>("fr"),
    [session, setSession] = useState<Session | null>(null),
    [conversations, setConversations] = useState<Conversation[]>([]),
    [current, setCurrent] = useState<Conversation | null>(null),
    [view, setView] = useState<"chat" | "drafts">("chat"),
    [input, setInput] = useState(""),
    [busy, setBusy] = useState(false),
    [live, setLive] = useState(""),
    [status, setStatus] = useState(""),
    [error, setError] = useState(""),
    [notice, setNotice] = useState(""),
    [canRetry, setCanRetry] = useState(false),
    [attachments, setAttachments] = useState<Attachment[]>([]),
    [modal, setModal] = useState<"upload" | "signin" | "handoff" | null>(null),
    [consent, setConsent] = useState(false),
    [reviewOpen, setReviewOpen] = useState(false),
    [savedDrafts, setSavedDrafts] = useState<
      { id: string; kind: string; body: string; updated_at: string }[]
    >([]);
  const controller = useRef<AbortController | null>(null),
    bottom = useRef<HTMLDivElement>(null),
    fileInput = useRef<HTMLInputElement>(null),
    textInput = useRef<HTMLTextAreaElement>(null),
    pendingSave = useRef(false),
    retryRequest = useRef<{
      message: string;
      requestId: string;
      attachmentIds: string[];
      conversationId: string;
    } | null>(null),
    actionKey = useRef<{ signature: string; id: string } | null>(null);
  const name = session?.copilotName ?? "Cly";
  const t = {
    ...copy[locale],
    intro: copy[locale].intro.replace("Cly,", `${name},`),
    copilotName: copy[locale].copilotName.replace("Cly", name),
  };

  useEffect(() => {
    let mounted = true;
    void (async () => {
      try {
        const s = await api<Session>("session");
        if (!mounted) return;
        setSession(s);
        const preferred = localStorage.getItem("cly-locale");
        const lang =
          preferred === "en" || preferred === "fr"
            ? preferred
            : navigator.language.startsWith("fr")
              ? "fr"
              : "en";
        setLocale(lang);
        const all = await api<Conversation[]>("conversations");
        if (!mounted) return;
        setConversations(all);
        const draftId = new URLSearchParams(location.search).get("draft");
        const selected = draftId
          ? all.find((c) => c.draft?.id === draftId)
          : all[0];
        if (selected) {
          const detail = await api<Conversation>(
            `conversation&id=${selected.id}`,
          );
          if (mounted) setCurrent(detail);
        }
      } catch (e) {
        if (mounted) setError((e as Error).message);
      }
    })();
    return () => {
      mounted = false;
      controller.current?.abort();
    };
  }, []);
  useEffect(() => {
    document.documentElement.lang = locale;
    localStorage.setItem("cly-locale", locale);
  }, [locale]);
  useEffect(() => {
    bottom.current?.scrollIntoView({ behavior: "auto", block: "nearest" });
  }, [current?.messages.length, live, status]);
  const remember = (c: Conversation) => {
    setCurrent(c);
    setConversations((prev) => [c, ...prev.filter((x) => x.id !== c.id)]);
  };
  async function refresh() {
    const all = await api<Conversation[]>("conversations");
    setConversations(all);
    if (current)
      setCurrent(await api<Conversation>(`conversation&id=${current.id}`));
  }
  function report(e: unknown) {
    const code = (e as Error).message || "SERVER_ERROR";
    setError(code);
    if (code === "CONFLICT") void refresh();
  }
  async function setRole(role: Role) {
    if (session?.mode === "staging") {
      await api("session", { role, locale });
      setSession(await api<Session>("session"));
    } else if (session && session.role !== role && session.authenticated)
      throw new Error("ROLE_CHANGED");
  }
  async function start(role: Role) {
    setError("");
    setNotice("");
    setBusy(true);
    try {
      await setRole(role);
      const c = await api<Conversation>("conversations", { role, locale });
      remember(c);
      setView("chat");
      setAttachments([]);
      setInput("");
      setLive("");
      retryRequest.current = null;
      setCanRetry(false);
    } catch (e) {
      report(e);
    } finally {
      setBusy(false);
      textInput.current?.focus();
    }
  }
  async function openConversation(c: Conversation) {
    if (busy) return;
    try {
      await setRole(c.role);
      remember(await api<Conversation>(`conversation&id=${c.id}`));
      setView("chat");
      setAttachments([]);
      setInput("");
      setError("");
      setLive("");
      retryRequest.current = null;
      setCanRetry(false);
    } catch (e) {
      report(e);
    }
  }
  async function send(text = input, retry = false, override?: Conversation) {
    if (busy || !text.trim()) return;
    setBusy(true);
    setError("");
    setNotice("");
    setLive("");
    setStatus(t.progress);
    let c = override ?? current;
    try {
      if (!c) {
        await setRole("anonymous");
        c = await api<Conversation>("conversations", {
          role: "anonymous",
          locale,
        });
        remember(c);
      }
      const req =
        retry && retryRequest.current
          ? retryRequest.current
          : {
              message: text.trim(),
              requestId: crypto.randomUUID(),
              attachmentIds: attachments.map((a) => a.id),
              conversationId: c.id,
            };
      retryRequest.current = req;
      setCanRetry(true);
      setCurrent({
        ...c,
        messages: c.messages.some((m) => m.id === req.requestId)
          ? c.messages
          : [
              ...c.messages,
              {
                id: req.requestId,
                role: "user",
                text: req.message,
                createdAt: new Date().toISOString(),
              },
            ],
      });
      setInput("");
      controller.current = new AbortController();
      const response = await fetch("/api/copilot?action=respond", {
        method: "POST",
        headers: { "content-type": "application/json" },
        body: JSON.stringify({ ...req, locale }),
        signal: controller.current.signal,
      });
      if (!response.ok) {
        const x = (await response.json()) as { error: string };
        throw new Error(x.error);
      }
      if (response.headers.get("content-type")?.includes("application/json")) {
        const x = (await response.json()) as { conversation: Conversation };
        remember(x.conversation);
        setAttachments([]);
        return;
      }
      const reader = response.body!.getReader(),
        decoder = new TextDecoder();
      let buffer = "",
        completed = false;
      while (true) {
        const part = await reader.read();
        if (part.done) break;
        buffer += decoder.decode(part.value, { stream: true });
        let split: number;
        while ((split = buffer.indexOf("\n\n")) >= 0) {
          const frame = buffer.slice(0, split);
          buffer = buffer.slice(split + 2);
          const event = frame.match(/^event: (.*)$/m)?.[1];
          const raw = frame.match(/^data: (.*)$/m)?.[1];
          if (!raw) continue;
          const data = JSON.parse(raw);
          if (event === "message.delta") {
            setStatus("");
            setLive((x) => x + data.text);
          }
          if (event === "tool.pending")
            setStatus(
              data.tool === "extract"
                ? t.extract
                : data.tool === "search_clynect_knowledge"
                  ? t.knowledge
                  : t.progress,
            );
          if (event === "draft.updated")
            setCurrent((x) => (x ? { ...x, draft: data } : x));
          if (event === "error") throw new Error(data.error);
          if (event === "done") {
            remember(data.conversation);
            setAttachments([]);
            setLive("");
            completed = true;
          }
        }
      }
      if (!completed) throw new Error("PROVIDER_FAILURE");
    } catch (e) {
      if ((e as Error).name !== "AbortError") report(e);
      setInput(text);
      if (c) {
        try {
          const all = await api<Conversation[]>("conversations");
          const latest = all.find((x) => x.id === c!.id);
          if (latest)
            remember(await api<Conversation>(`conversation&id=${latest.id}`));
        } catch {}
      }
    } finally {
      setBusy(false);
      setStatus("");
      controller.current = null;
    }
  }
  async function edit(field: Field, value: string) {
    if (!current?.draft) return;
    setBusy(true);
    setError("");
    try {
      const c = await api<Conversation>("edit", {
        conversationId: current.id,
        revision: current.draft.revision,
        field,
        value,
      });
      remember(c);
    } catch (e) {
      report(e);
      throw e;
    } finally {
      setBusy(false);
    }
  }
  async function action(tool: Action["tool"], confirmed = false) {
    if (!current) return;
    if (!session?.authenticated) {
      pendingSave.current = tool.startsWith("save_");
      setModal("signin");
      return;
    }
    setBusy(true);
    setError("");
    const base = {
      tool,
      conversationId: current.id,
      revision: current.draft?.revision ?? 0,
      confirmed,
      transcriptConsent: confirmed,
    };
    const signature = JSON.stringify(base);
    if (actionKey.current?.signature !== signature)
      actionKey.current = { signature, id: crypto.randomUUID() };
    try {
      const result = await api<{
        conversation?: Conversation;
        status?: string;
        message?: string;
      }>("actions", { ...base, actionId: actionKey.current.id });
      if (result.conversation) remember(result.conversation);
      setNotice(
        tool === "create_support_handoff"
          ? t.handoffDone
          : tool.startsWith("save_")
            ? t.saved
            : (result.message ?? ""),
      );
      setModal(null);
      pendingSave.current = false;
    } catch (e) {
      report(e);
    } finally {
      setBusy(false);
    }
  }
  async function signIn() {
    if (!current) return;
    setBusy(true);
    try {
      await api("session", { role: current.role, locale, signIn: true });
      const s = await api<Session>("session");
      setSession(s);
      setModal(null);
      if (pendingSave.current && current.draft) {
        const tool =
          current.draft.kind === "mission"
            ? "save_mission_draft"
            : "save_profile_draft";
        const result = await api<{ conversation: Conversation }>("actions", {
          actionId: crypto.randomUUID(),
          tool,
          conversationId: current.id,
          revision: current.draft.revision,
          confirmed: false,
          transcriptConsent: false,
        });
        remember(result.conversation);
        setNotice(t.saved);
      }
      pendingSave.current = false;
    } catch (e) {
      report(e);
    } finally {
      setBusy(false);
    }
  }
  async function upload(file: File) {
    if (!consent) return;
    setBusy(true);
    setError("");
    setStatus(t.uploading);
    try {
      const form = new FormData();
      form.set("file", file);
      form.set("consent", "true");
      form.set("purpose", current?.role === "talent" ? "profile" : "mission");
      const r = await fetch("/api/copilot-upload", {
        method: "POST",
        body: form,
      });
      const value = (await r.json()) as Attachment & { error?: string };
      if (!r.ok) throw new Error(value.error);
      setAttachments((prev) => [...prev, value].slice(-3));
      setModal(null);
      if (!input)
        setInput(
          locale === "fr"
            ? "Préparez mon brouillon à partir de ce document."
            : "Prepare my draft from this document.",
        );
    } catch (e) {
      report(e);
    } finally {
      setBusy(false);
      setStatus("");
      if (fileInput.current) fileInput.current.value = "";
    }
  }
  async function showDrafts() {
    setView("drafts");
    setError("");
    try {
      if (session?.authenticated) setSavedDrafts(await api("drafts"));
    } catch (e) {
      report(e);
    }
  }
  async function feedback(messageId: string, helpful: boolean) {
    if (!current) return;
    try {
      await api("feedback", { conversationId: current.id, messageId, helpful });
      setNotice(t.thanks);
    } catch (e) {
      report(e);
    }
  }
  const review = (
    <ReviewCard
      draft={current?.draft ?? null}
      locale={locale}
      busy={busy}
      onEdit={edit}
      onSave={() =>
        void action(
          current?.draft?.kind === "profile"
            ? "save_profile_draft"
            : "save_mission_draft",
        )
      }
    />
  );
  const composer = (
    <div className="composer-wrap">
      <form
        className="starting-composer"
        onSubmit={(e) => {
          e.preventDefault();
          void send();
        }}
      >
        {attachments.length > 0 && (
          <div className="attachment-list">
            {attachments.map((a) => (
              <span key={a.id}>
                <Paperclip size={13} />
                {a.name}
                <button
                  type="button"
                  aria-label={t.close}
                  disabled={busy}
                  onClick={() =>
                    setAttachments((x) => x.filter((v) => v.id !== a.id))
                  }
                >
                  <X size={14} />
                </button>
              </span>
            ))}
          </div>
        )}
        <textarea
          ref={textInput}
          aria-label={t.message}
          placeholder={t.placeholder}
          value={input}
          rows={2}
          maxLength={12000}
          onChange={(e) => {
            setInput(e.target.value);
            e.currentTarget.style.height = "auto";
            e.currentTarget.style.height = `${Math.min(e.currentTarget.scrollHeight, 170)}px`;
          }}
          onKeyDown={(e) => {
            if (
              e.key === "Enter" &&
              !e.shiftKey &&
              !e.nativeEvent.isComposing
            ) {
              e.preventDefault();
              void send();
            }
          }}
        />
        <div>
          <button
            type="button"
            aria-label={t.attach}
            disabled={busy || !session || attachments.length >= 3}
            onClick={() => {
              setConsent(false);
              setModal("upload");
            }}
          >
            <Plus size={21} />
          </button>
          <span>{t.formats}</span>
          {busy ? (
            <button
              type="button"
              className="send-button"
              aria-label={t.stop}
              onClick={() => controller.current?.abort()}
            >
              <Square size={16} />
            </button>
          ) : (
            <button
              type="submit"
              className="send-button"
              aria-label={t.send}
              disabled={!input.trim() || !session}
            >
              <ArrowUp size={20} />
            </button>
          )}
        </div>
      </form>
      <div className="trust-note">
        <ShieldCheck size={14} />
        {t.trust}
      </div>
    </div>
  );
  return (
    <div className={`app-shell ${embedded ? "embedded" : ""}`}>
      {!embedded && (
        <aside className="rail">
          <a className="brand" href="/">
            clynect<span>•</span>
          </a>
          <div className="workspace-label">{t.space}</div>
          <button
            className={`nav-item ${view === "chat" ? "selected" : ""}`}
            disabled={busy}
            onClick={() => setView("chat")}
          >
            <Sparkles size={19} />
            {t.copilot}
          </button>
          <button
            className={`nav-item ${view === "drafts" ? "selected" : ""}`}
            disabled={busy}
            onClick={() => void showDrafts()}
          >
            <FileUser size={19} />
            {t.drafts}
          </button>
          <button
            className="new-chat"
            disabled={busy}
            onClick={() => {
              setCurrent(null);
              setView("chat");
              setInput("");
              setAttachments([]);
              setError("");
            }}
          >
            <Plus size={16} />
            {t.newChat}
          </button>
          {conversations.length > 0 && (
            <>
              <div className="workspace-label recent-label">{t.recent}</div>
              <nav className="history">
                {conversations.slice(0, 8).map((c) => (
                  <button
                    key={c.id}
                    disabled={busy}
                    className={c.id === current?.id ? "active" : ""}
                    onClick={() => void openConversation(c)}
                  >
                    <MessageSquare size={14} />
                    <span>
                      {c.title ||
                        (c.role === "talent" ? t.newProfile : t.newMission)}
                    </span>
                  </button>
                ))}
              </nav>
            </>
          )}
          <div className="rail-bottom">
            <ShieldCheck size={18} />
            <span>
              {t.privateSpace}
              <br />
              <small>{t.control}</small>
            </span>
          </div>
        </aside>
      )}
      <main className="main">
        <header className="topbar">
          <span className="breadcrumb">
            <span className="mobile-brand">clynect</span>
            <span className="desktop-breadcrumb">
              {t.workspace}
              <span className="slash">/</span>
            </span>
            <strong>{view === "drafts" ? t.drafts : t.copilot}</strong>
          </span>
          <div className="header-actions">
            <span className="badge">
              <i />
              {session?.provider === "openai"
                ? t.live
                : session?.provider === "unconfigured"
                  ? t.unconfigured
                  : t.demo}
            </span>
            <button
              className="locale-switch"
              aria-label={t.language}
              onClick={() => setLocale(locale === "fr" ? "en" : "fr")}
            >
              {locale.toUpperCase()}
              <span>⌄</span>
            </button>
          </div>
        </header>
        {embedded && (
          <nav className="embedded-nav" aria-label={t.workspace}>
            <button
              disabled={busy || !session}
              onClick={() => {
                setCurrent(null);
                setView("chat");
                setInput("");
                setAttachments([]);
                setError("");
                setNotice("");
                setCanRetry(false);
              }}
            >
              <Plus size={14} />
              {t.newChat}
            </button>
            <button
              disabled={busy || !session}
              onClick={() => void showDrafts()}
            >
              <FolderOpen size={14} />
              {t.drafts}
            </button>
            {conversations.length > 0 && (
              <select
                aria-label={t.recent}
                disabled={busy}
                value={current?.id ?? ""}
                onChange={(e) => {
                  const c = conversations.find((c) => c.id === e.target.value);
                  if (c) void openConversation(c);
                }}
              >
                <option value="">{t.recent}</option>
                {conversations.map((c) => (
                  <option key={c.id} value={c.id}>
                    {c.title}
                  </option>
                ))}
              </select>
            )}
          </nav>
        )}
        <div className="notices" aria-live="polite">
          {error && (
            <div className="error-banner" role="alert">
              <span>{errorText(error, locale)}</span>
              {canRetry && (
                <button
                  disabled={busy}
                  onClick={() => void send(retryRequest.current!.message, true)}
                >
                  <RotateCcw size={14} />
                  {t.retry}
                </button>
              )}
              <button aria-label={t.close} onClick={() => setError("")}>
                <X size={16} />
              </button>
            </div>
          )}
          {notice && (
            <div className="success-banner">
              <Check size={16} />
              {notice}
              <button aria-label={t.close} onClick={() => setNotice("")}>
                <X size={16} />
              </button>
            </div>
          )}
        </div>
        {view === "drafts" ? (
          <section className="workspace drafts-view">
            <span className="eyebrow">{t.privateSpace}</span>
            <h1>{t.drafts}</h1>
            <p className="intro">{t.savedHint}</p>
            {savedDrafts.length ? (
              <div className="saved-grid">
                {savedDrafts.map((d) => {
                  const data = JSON.parse(d.body);
                  return (
                    <button
                      className="saved-card"
                      key={d.id}
                      onClick={() => {
                        const c = conversations.find(
                          (x) => x.draft?.id === d.id,
                        );
                        if (c) void openConversation(c);
                      }}
                    >
                      <FileUser size={24} />
                      <h2>
                        {data.title ??
                          data.headline ??
                          (d.kind === "mission" ? t.newMission : t.newProfile)}
                      </h2>
                      <span>
                        <LockKeyhole size={13} />
                        {t.privateDraft}
                      </span>
                      <small>
                        {new Intl.DateTimeFormat(locale, {
                          dateStyle: "medium",
                        }).format(new Date(d.updated_at))}
                      </small>
                    </button>
                  );
                })}
              </div>
            ) : (
              <div className="saved-empty">
                <FolderOpen size={36} />
                <p>{t.empty}</p>
                <button
                  className="primary-button"
                  onClick={() => {
                    setView("chat");
                    setCurrent(null);
                  }}
                >
                  {t.start}
                </button>
              </div>
            )}
          </section>
        ) : !current ? (
          <section className="workspace">
            <div className="workspace-heading">
              <div>
                <span className="eyebrow">{t.eyebrow}</span>
                <h1>
                  {t.heading}
                  <br />
                  <span>{t.heading2}</span>
                </h1>
              </div>
              <span className="cly-orb">
                <Sparkles size={34} />
              </span>
            </div>
            <p className="intro">{t.intro}</p>
            <div className="intent-grid">
              <button
                className="intent-card"
                disabled={busy || !session}
                onClick={() => void start("business")}
              >
                <BriefcaseBusiness />
                <h2>{t.recruit}</h2>
                <p>{t.recruitSub}</p>
                <ArrowUpRight className="card-arrow" />
              </button>
              <button
                className="intent-card"
                disabled={busy || !session}
                onClick={() => void start("talent")}
              >
                <FileUser />
                <h2>{t.talent}</h2>
                <p>{t.talentSub}</p>
                <ArrowUpRight className="card-arrow" />
              </button>
            </div>
            <div className="secondary-intents">
              <button
                disabled={busy || !session}
                onClick={() => void start("project")}
              >
                {t.project}
                <ArrowUpRight size={15} />
              </button>
              <button
                disabled={busy || !session}
                onClick={() =>
                  void send(
                    locale === "fr"
                      ? "Comment fonctionne Clynect ?"
                      : "How does Clynect work?",
                  )
                }
              >
                {t.ask}
                <ArrowUpRight size={15} />
              </button>
            </div>
            {composer}
            <div className="suggestions">
              <span>{t.quick}</span>
              <button
                disabled={busy || !session}
                onClick={() => void send(t.pricing)}
              >
                {t.pricing}
              </button>
              <button
                disabled={busy || !session}
                onClick={() => void send(t.privacy)}
              >
                {t.privacy}
              </button>
            </div>
          </section>
        ) : (
          <div className="conversation-layout">
            <section className="chat-column">
              <div className="chat-top">
                <button
                  className="back-button"
                  disabled={busy}
                  aria-label={t.newChat}
                  onClick={() => setCurrent(null)}
                >
                  <ChevronLeft size={18} />
                </button>
                <div>
                  <strong>
                    {current.role === "talent"
                      ? t.newProfile
                      : current.role === "anonymous"
                        ? t.conversation
                        : t.newMission}
                  </strong>
                  <span>
                    {current.role === "talent"
                      ? t.freelance
                      : current.role === "project"
                        ? t.projectRole
                        : current.role === "anonymous"
                          ? t.anonymous
                          : t.business}
                  </span>
                </div>
                <button
                  className="review-toggle"
                  onClick={() => setReviewOpen(true)}
                  aria-label={t.review}
                >
                  <PanelRightOpen size={19} />
                  <span>{t.review}</span>
                </button>
              </div>
              <div className="messages" role="log" aria-label={t.conversation}>
                <div className="assistant-message opening">
                  <span className="avatar">
                    <Sparkles size={19} />
                  </span>
                  <div>
                    <span className="message-author">{t.copilotName}</span>
                    <p>
                      {current.role === "talent"
                        ? locale === "fr"
                          ? "Ajoutez votre CV ou décrivez votre expérience. Je relève les informations utiles et les points à compléter."
                          : "Upload your CV or describe your experience. I’ll identify useful information and missing details."
                        : current.role === "anonymous"
                          ? t.intro
                          : locale === "fr"
                            ? "Décrivez votre besoin en une phrase. Je le structure et je repère ce qui manque, une question à la fois."
                            : "Describe your need in one sentence. I’ll structure it and identify what’s missing, one question at a time."}
                    </p>
                    {current.messages.length === 0 && (
                      <button
                        className="example-button"
                        disabled={busy}
                        onClick={() =>
                          void send(
                            current.role === "talent"
                              ? t.sampleCV
                              : t.sampleMission,
                          )
                        }
                      >
                        {t.tryExample}
                        <ArrowUpRight size={15} />
                      </button>
                    )}
                  </div>
                </div>
                {current.messages.map((m) => (
                  <div
                    key={m.id}
                    className={
                      m.role === "user" ? "user-message" : "assistant-message"
                    }
                  >
                    {m.role === "assistant" && (
                      <span className="avatar">
                        <Sparkles size={18} />
                      </span>
                    )}
                    <div>
                      {m.role === "assistant" && (
                        <span className="message-author">{t.copilotName}</span>
                      )}
                      <p>{m.text}</p>
                      {m.sources?.map((s) => (
                        <details className="source-chip" key={s.id}>
                          <summary>
                            <FileUser size={13} />
                            {s.title}
                          </summary>
                          <small>
                            {s.version} ·{" "}
                            {s.approved ? t.source : t.stagingSource}
                          </small>
                          <p>{s.content}</p>
                        </details>
                      ))}
                      {m.role === "assistant" && (
                        <div className="feedback">
                          <button
                            aria-label={t.helpful}
                            onClick={() => void feedback(m.id, true)}
                          >
                            <ThumbsUp size={14} />
                          </button>
                          <button
                            aria-label={t.notHelpful}
                            onClick={() => void feedback(m.id, false)}
                          >
                            <ThumbsDown size={14} />
                          </button>
                        </div>
                      )}
                    </div>
                  </div>
                ))}
                {(status || live) && (
                  <div className="assistant-message">
                    <span className="avatar">
                      <Sparkles size={18} />
                    </span>
                    <div>
                      <span className="message-author">{t.copilotName}</span>
                      <p
                        aria-live="polite"
                        className={status ? "tool-progress" : ""}
                      >
                        {live || status}
                      </p>
                    </div>
                  </div>
                )}
                {current.role === "anonymous" && (
                  <div className="quick-replies">
                    {(["business", "talent", "project"] as Role[]).map(
                      (role) => (
                        <button
                          key={role}
                          disabled={busy}
                          onClick={() => void start(role)}
                        >
                          {role === "talent"
                            ? t.freelance
                            : role === "project"
                              ? t.projectRole
                              : t.business}
                        </button>
                      ),
                    )}
                  </div>
                )}
                {current.draft?.missing_fields[0] === "work_mode" && (
                  <div className="quick-replies">
                    {[t.remote, t.hybrid, t.onsite].map((x) => (
                      <button
                        disabled={busy}
                        key={x}
                        onClick={() => void send(x)}
                      >
                        {x}
                      </button>
                    ))}
                  </div>
                )}
                <div ref={bottom} />
              </div>
              {composer}
              <div className="chat-footer">
                <button
                  disabled={
                    busy ||
                    !session?.capabilities.includes("create_support_handoff")
                  }
                  title={
                    locale === "fr"
                      ? "Le support n’est pas encore connecté."
                      : "Support is not connected yet."
                  }
                  onClick={() => {
                    setConsent(false);
                    setModal(session?.authenticated ? "handoff" : "signin");
                  }}
                >
                  <LifeBuoy size={14} />
                  {t.support}
                </button>
                {canRetry && (
                  <button
                    disabled={busy}
                    onClick={() => void send(retryRequest.current!.message)}
                  >
                    <RotateCcw size={13} />
                    {t.regenerate}
                  </button>
                )}
                <span>{session?.provider === "fixture" ? t.fixture : ""}</span>
              </div>
            </section>
            <aside className="review-column">{review}</aside>
          </div>
        )}
      </main>
      <Sheet open={reviewOpen} onOpenChange={setReviewOpen}>
        <SheetContent className="mobile-review-sheet" showCloseButton={false}>
          <div className="sheet-heading">
            <SheetTitle>{t.privateDraft}</SheetTitle>
            <button aria-label={t.close} onClick={() => setReviewOpen(false)}>
              <X size={20} />
            </button>
          </div>
          <SheetDescription className="sr-only">{t.draftHint}</SheetDescription>
          {review}
        </SheetContent>
      </Sheet>
      <Dialog
        open={modal !== null}
        onOpenChange={(open) => {
          if (!open && !busy) setModal(null);
        }}
      >
        <DialogContent className="copilot-dialog" showCloseButton={false}>
          <button
            className="modal-close"
            aria-label={t.close}
            disabled={busy}
            onClick={() => setModal(null)}
          >
            <X size={20} />
          </button>
          <div className="modal-icon">
            {modal === "upload" ? (
              <Paperclip />
            ) : modal === "signin" ? (
              <LockKeyhole />
            ) : (
              <LifeBuoy />
            )}
          </div>
          <DialogTitle>
            {modal === "upload"
              ? t.uploadTitle
              : modal === "signin"
                ? t.signinTitle
                : t.handoffTitle}
          </DialogTitle>
          <DialogDescription>
            {modal === "upload"
              ? t.uploadInfo
              : modal === "signin"
                ? t.signinInfo
                : t.handoffInfo}
          </DialogDescription>
          {modal === "signin" ? (
            <button
              className="primary-button"
              disabled={busy || session?.mode !== "staging"}
              onClick={() => void signIn()}
            >
              {t.signin}
            </button>
          ) : (
            <>
              <label className="consent-row">
                <Checkbox
                  checked={consent}
                  onCheckedChange={(checked) => setConsent(checked === true)}
                />
                <span>{modal === "upload" ? t.consent : t.handoffConsent}</span>
              </label>
              {modal === "upload" ? (
                <>
                  <input
                    ref={fileInput}
                    type="file"
                    accept=".pdf,.docx"
                    className="sr-only"
                    tabIndex={-1}
                    onChange={(e) => {
                      const file = e.target.files?.[0];
                      if (file) void upload(file);
                    }}
                  />
                  <button
                    className="primary-button"
                    disabled={!consent || busy}
                    onClick={() => fileInput.current?.click()}
                  >
                    {busy ? t.uploading : t.selectFile}
                  </button>
                </>
              ) : (
                <>
                  <div className="handoff-preview">
                    {current?.messages.slice(-5).map((m) => (
                      <p key={m.id}>{m.text}</p>
                    ))}
                  </div>
                  <button
                    className="primary-button"
                    disabled={!consent || busy}
                    onClick={() => void action("create_support_handoff", true)}
                  >
                    {t.confirmHandoff}
                  </button>
                </>
              )}
            </>
          )}
          {error && (
            <p className="warning" role="alert">
              {errorText(error, locale)}
            </p>
          )}
        </DialogContent>
      </Dialog>
    </div>
  );
}
