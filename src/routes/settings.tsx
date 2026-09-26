import { createFileRoute, Link } from "@tanstack/react-router";
import { useEffect, useState } from "react";
import { toast } from "sonner";
import { Button } from "@/components/ui/button";
import { Input } from "@/components/ui/input";
import { Field, RowSwitch } from "@/components/ui/label";
import { NativeSelect } from "@/components/ui/select";
import { Slider } from "@/components/ui/slider";
import { desktop, isDesktop } from "@/lib/desktop";
import { sessionFields } from "@/lib/lock-client";
import { UserButton } from "@/lib/auth/gates";
import { useCurrentUser } from "@/lib/auth/use-current-user";
import { changeAccountPassword, getAccountProfile, listPasswordResets } from "@/lib/server/account";
import { displayShortcut, shortcutFromEvent } from "@/lib/phrases";
import { listMics, micPermission, speechAvailable } from "@/lib/speech";
import { playSignal, unlockAudio } from "@/lib/sounds";
import { THEME_PRESETS, themeIdFor } from "@/lib/themes";
import {
  getProviderCredentialStatuses,
  listProviderModels,
  prepareWhisperModel,
  testProvider,
  whisperModelStatus,
} from "@/lib/server/ai";
import { discoverLocalTools } from "@/lib/server/local-tools";
import { isRemoteProvider, modelsForProvider, PROVIDERS } from "@/lib/providers";
import {
  AUTO_DELETE_OPTIONS,
  DEFAULT_THEME,
  LOCAL_TOOLS,
  SOUND_PRESETS,
  THEME_FIELDS,
  WHISPER_MODELS,
  type MicInfo,
  type ThemeColors,
  type WhisperModelId,
} from "@/lib/types";
import { cn } from "@/lib/utils";
import { useApp } from "@/stores/app";
import { authClient } from "@/lib/auth/client";
import {
  clearLocalTrustToken,
  localTrustAvailable,
  localTrustEnabled,
  saveLocalTrustToken,
} from "@/lib/auth/local-trust";
import { issueLocalTrustToken } from "@/lib/server/local-trust";

export const Route = createFileRoute("/settings")({ ssr: false, component: SettingsPage });

const TABS = [
  { id: "appearance", label: "Appearance", admin: false },
  { id: "voice", label: "Voice", admin: false },
  { id: "transcription", label: "Transcription", admin: true },
  { id: "ai", label: "AI", admin: true },
  { id: "security", label: "Account", admin: false },
  { id: "desktop", label: "Desktop", admin: true },
  { id: "sounds", label: "Sounds", admin: false },
  { id: "completion", label: "Completion", admin: false },
  { id: "permissions", label: "Permissions", admin: false },
] as const;

type TabId = (typeof TABS)[number]["id"];

function SettingsPage() {
  const user = useCurrentUser();
  const admin = Boolean(user?.isAdmin);
  const tabs = TABS.filter((t) => admin || !t.admin);
  const [tab, setTab] = useState<TabId>("appearance");
  const [savedFlash, setSavedFlash] = useState(false);
  const [seen, setSeen] = useState<Set<TabId>>(() => new Set(["appearance"]));

  useEffect(() => {
    if (!tabs.some((t) => t.id === tab)) setTab("appearance");
  }, [admin, tab, tabs]);

  const go = (id: TabId) => {
    setTab(id);
    setSeen((prev) => {
      if (prev.has(id)) return prev;
      const next = new Set(prev);
      next.add(id);
      return next;
    });
  };

  return (
    <div
      id="talkai-settings-page"
      className="talkai-page talkai-settings-page mx-auto flex w-full max-w-4xl flex-col gap-6 pb-8"
    >
      <header className="talkai-page-header flex items-end justify-between gap-3">
        <div>
          <h1 className="font-display text-3xl tracking-tight">Settings</h1>
          <p className="mt-1 text-sm text-muted-foreground">Changes save as you make them.</p>
        </div>
        <Button
          variant="secondary"
          size="sm"
          onClick={() => {
            setSavedFlash(true);
            window.setTimeout(() => setSavedFlash(false), 1500);
          }}
        >
          {savedFlash ? "Saved" : "Save"}
        </Button>
      </header>

      <div className="talkai-settings-layout flex flex-col gap-6 md:flex-row md:items-start">
        <nav
          id="talkai-settings-tabs"
          className="talkai-settings-tabs flex gap-1 overflow-x-auto pb-1 md:w-48 md:shrink-0 md:flex-col md:overflow-visible"
        >
          {tabs.map((t) => (
            <button
              id={`talkai-settings-tab-${t.id}`}
              key={t.id}
              type="button"
              data-settings-tab={t.id}
              onClick={() => go(t.id)}
              className={cn(
                "h-11 shrink-0 rounded-md px-3 text-left text-sm font-medium transition-colors duration-150",
                "talkai-settings-tab",
                tab === t.id
                  ? "is-active bg-secondary text-foreground"
                  : "text-muted-foreground hover:bg-secondary/70 hover:text-foreground",
              )}
            >
              {t.label}
            </button>
          ))}
        </nav>
        <div id="talkai-settings-panels" className="talkai-settings-panels min-w-0 flex-1">
          {seen.has("appearance") ? (
            <div
              id="talkai-settings-panel-appearance"
              className="talkai-settings-panel"
              data-settings-panel="appearance"
              hidden={tab !== "appearance"}
            >
              <AppearancePanel />
            </div>
          ) : null}
          {seen.has("voice") ? (
            <div
              id="talkai-settings-panel-voice"
              className="talkai-settings-panel"
              data-settings-panel="voice"
              hidden={tab !== "voice"}
            >
              <VoicePanel />
            </div>
          ) : null}
          {seen.has("transcription") && admin ? (
            <div
              id="talkai-settings-panel-transcription"
              className="talkai-settings-panel"
              data-settings-panel="transcription"
              hidden={tab !== "transcription"}
            >
              <TranscriptionPanel />
            </div>
          ) : null}
          {seen.has("ai") && admin ? (
            <div
              id="talkai-settings-panel-ai"
              className="talkai-settings-panel"
              data-settings-panel="ai"
              hidden={tab !== "ai"}
            >
              <AiPanel />
            </div>
          ) : null}
          {seen.has("security") ? (
            <div
              id="talkai-settings-panel-security"
              className="talkai-settings-panel"
              data-settings-panel="security"
              hidden={tab !== "security"}
            >
              <SecurityPanel />
            </div>
          ) : null}
          {seen.has("desktop") && admin ? (
            <div
              id="talkai-settings-panel-desktop"
              className="talkai-settings-panel"
              data-settings-panel="desktop"
              hidden={tab !== "desktop"}
            >
              <DesktopPanel />
            </div>
          ) : null}
          {seen.has("sounds") ? (
            <div
              id="talkai-settings-panel-sounds"
              className="talkai-settings-panel"
              data-settings-panel="sounds"
              hidden={tab !== "sounds"}
            >
              <SoundsPanel />
            </div>
          ) : null}
          {seen.has("completion") ? (
            <div
              id="talkai-settings-panel-completion"
              className="talkai-settings-panel"
              data-settings-panel="completion"
              hidden={tab !== "completion"}
            >
              <CompletionPanel />
            </div>
          ) : null}
          {seen.has("permissions") ? (
            <div
              id="talkai-settings-panel-permissions"
              className="talkai-settings-panel"
              data-settings-panel="permissions"
              hidden={tab !== "permissions"}
            >
              <PermissionsPanel />
            </div>
          ) : null}
        </div>
      </div>
    </div>
  );
}

function Section({ title, children }: { title: string; children: React.ReactNode }) {
  return (
    <section
      className="talkai-settings-section space-y-4 rounded-xl bg-card p-4 shadow-border sm:p-5"
      data-settings-section={title.toLowerCase().replace(/[^a-z0-9]+/g, "-")}
    >
      <h2 className="text-[11px] font-medium uppercase tracking-[0.16em] text-muted-foreground">
        {title}
      </h2>
      {children}
    </section>
  );
}

function AppearancePanel() {
  const settings = useApp((s) => s.settings);
  const patch = useApp((s) => s.patchSettings);
  const theme = settings.theme;
  const activeId = settings.themeId || themeIdFor(theme);

  const setColor = (key: keyof ThemeColors, value: string) => {
    patch({ theme: { ...theme, [key]: value }, themeId: "custom" });
  };

  return (
    <div className="flex flex-col gap-4">
      <Section title="Looks">
        <p className="text-sm text-muted-foreground">
          Pick a finished look. You can still tweak individual colors underneath.
        </p>
        <div className="grid grid-cols-1 gap-3 sm:grid-cols-2">
          {THEME_PRESETS.map((preset) => {
            const on = activeId === preset.id;
            return (
              <button
                key={preset.id}
                type="button"
                onClick={() => patch({ theme: preset.theme, themeId: preset.id })}
                className={cn(
                  "rounded-xl p-3 text-left shadow-border transition-[box-shadow,transform] duration-150",
                  on ? "shadow-border-hover ring-2 ring-ring" : "hover:shadow-border-hover",
                )}
                style={{ background: preset.theme.surface, color: preset.theme.foreground }}
              >
                <span className="flex items-center justify-between gap-2">
                  <span className="text-sm font-medium">{preset.name}</span>
                  <span className="flex gap-1">
                    {[preset.theme.primary, preset.theme.accent, preset.theme.success].map(
                      (c, i) => (
                        <span
                          key={`${preset.id}-${i}`}
                          className="size-3 rounded-full"
                          style={{ background: c }}
                        />
                      ),
                    )}
                  </span>
                </span>
                <span
                  className="mt-2 block h-8 overflow-hidden rounded-md"
                  style={{ background: preset.theme.background }}
                >
                  <span
                    className="mt-3 ml-3 inline-block h-4 w-16 rounded-full"
                    style={{ background: preset.theme.primary }}
                  />
                </span>
                <span className="mt-2 block text-xs opacity-70">{preset.hint}</span>
              </button>
            );
          })}
        </div>
      </Section>
      <Section title="Recorder">
        <Field
          label="Overlay"
          hint="Compact widget keeps recording controls focused in a small floating surface in the browser."
        >
          <NativeSelect
            value={settings.overlayMode}
            onChange={(e) => patch({ overlayMode: e.target.value as typeof settings.overlayMode })}
          >
            <option value="modal">Centered modal</option>
            <option value="float">Compact widget</option>
          </NativeSelect>
        </Field>
      </Section>
      <Section title="Custom colors">
        <p className="text-sm text-muted-foreground">
          Fine-tune after picking a preset, or start from scratch.
        </p>
        <div className="grid grid-cols-1 gap-3 sm:grid-cols-2">
          {THEME_FIELDS.map((f) => (
            <label
              key={f.key}
              className="flex items-center justify-between gap-3 rounded-md bg-secondary px-3 py-2"
            >
              <span className="text-sm">{f.label}</span>
              <span className="flex items-center gap-2">
                <span className="font-mono text-[11px] text-muted-foreground">{theme[f.key]}</span>
                <input
                  type="color"
                  value={theme[f.key]}
                  onChange={(e) => setColor(f.key, e.target.value)}
                  className="size-8 cursor-pointer rounded border-0 bg-transparent"
                  aria-label={f.label}
                />
              </span>
            </label>
          ))}
        </div>
        <Button
          variant="secondary"
          onClick={() => patch({ theme: DEFAULT_THEME, themeId: "signal" })}
        >
          Reset colors
        </Button>
      </Section>
    </div>
  );
}

function VoicePanel() {
  const settings = useApp((s) => s.settings);
  const patch = useApp((s) => s.patchSettings);
  const [mics, setMics] = useState<MicInfo[]>([]);
  const [capturing, setCapturing] = useState(false);
  const [mac, setMac] = useState(true);

  useEffect(() => {
    setMac(/Mac|iPhone|iPad/.test(navigator.platform));
    void listMics().then(setMics);
  }, []);

  const onCaptureKey = (e: React.KeyboardEvent) => {
    if (!capturing) return;
    e.preventDefault();
    const s = shortcutFromEvent(e.nativeEvent);
    if (!s) return;
    patch({ shortcut: s });
    setCapturing(false);
  };

  return (
    <div className="flex flex-col gap-4" onKeyDown={onCaptureKey}>
      <Section title="Microphone">
        <Field label="Input" hint="Missing devices fall back to the system default.">
          <div className="flex gap-2">
            <NativeSelect
              className="flex-1"
              value={settings.microphoneId}
              onChange={(e) => patch({ microphoneId: e.target.value })}
            >
              <option value="">System default</option>
              {mics.map((m) => (
                <option key={m.deviceId} value={m.deviceId}>
                  {m.label}
                </option>
              ))}
            </NativeSelect>
            <Button variant="secondary" onClick={() => void listMics().then(setMics)}>
              Refresh
            </Button>
          </div>
        </Field>
        <RowSwitch
          label="Keep microphone connected while idle"
          hint="Required for the spoken wake phrase."
          checked={settings.keepMicIdle}
          onCheckedChange={(v) => patch({ keepMicIdle: v })}
        />
      </Section>
      <Section title="Phrases">
        <RowSwitch
          label="Wake phrase"
          hint={`Default “Ok Voice”. ${speechAvailable() ? "Uses on-device recognition." : "Not available in this browser."}`}
          checked={settings.wakeEnabled}
          onCheckedChange={(v) => {
            patch({ wakeEnabled: v, keepMicIdle: v ? true : settings.keepMicIdle });
            if (v) {
              void navigator.mediaDevices
                ?.getUserMedia({ audio: true })
                .then((s) => {
                  s.getTracks().forEach((t) => t.stop());
                })
                .catch(() => {
                  toast.error("Microphone permission is required for the wake phrase");
                });
            }
          }}
        />
        <Field label="Wake phrase text">
          <Input
            value={settings.wakePhrase}
            onChange={(e) => patch({ wakePhrase: e.target.value })}
          />
        </Field>
        <RowSwitch
          label="Send phrase"
          hint="Ends recording after you speak, pause, then say the phrase."
          checked={settings.sendEnabled}
          onCheckedChange={(v) => patch({ sendEnabled: v })}
        />
        <Field label="Send phrase text">
          <Input
            value={settings.sendPhrase}
            onChange={(e) => patch({ sendPhrase: e.target.value })}
          />
        </Field>
        <Field label={`Required silence · ${settings.requiredSilence.toFixed(1)}s`}>
          <Slider
            min={0.5}
            max={5}
            step={0.5}
            value={[settings.requiredSilence]}
            onValueChange={([v]) => patch({ requiredSilence: v ?? 2 })}
          />
        </Field>
        <RowSwitch
          label="Insert phrase"
          hint="After a transcript is ready, say Insert to drop it in the pad."
          checked={settings.insertEnabled}
          onCheckedChange={(v) => patch({ insertEnabled: v })}
        />
        <Field label="Insert phrase text">
          <Input
            value={settings.insertPhrase}
            onChange={(e) => patch({ insertPhrase: e.target.value })}
          />
        </Field>
        <RowSwitch
          label="Auto-insert"
          hint="Inserts immediately after transcription and skips the insert phrase."
          checked={settings.autoInsert}
          onCheckedChange={(v) => patch({ autoInsert: v })}
        />
      </Section>
      <div id="talkai-settings-recording-shortcut" className="talkai-settings-anchor">
        <Section title="Shortcut">
          <Field
            label="Start recording shortcut"
            hint="Must include Command, Control, Option, or Shift."
          >
            <Button
              variant={capturing ? "default" : "secondary"}
              onClick={() => setCapturing(true)}
            >
              {capturing ? "Press a combination…" : displayShortcut(settings.shortcut, mac)}
            </Button>
          </Field>
        </Section>
      </div>
    </div>
  );
}

function TranscriptionPanel() {
  const settings = useApp((s) => s.settings);
  const patch = useApp((s) => s.patchSettings);
  const model = WHISPER_MODELS.find((m) => m.id === settings.whisperModel);
  const [whisperStatus, setWhisperStatus] = useState<{
    phase: "idle" | "downloading" | "loading" | "ready" | "error";
    progress: number;
    message: string;
    cached: boolean;
    error: string;
  } | null>(null);
  const [whisperPollGeneration, setWhisperPollGeneration] = useState(0);

  useEffect(() => {
    if (settings.transcribeEngine !== "whisper") return;
    let cancelled = false;
    let timer: number | null = null;
    const refresh = async () => {
      try {
        const result = await whisperModelStatus({
          data: { whisperModel: settings.whisperModel },
        });
        if (!cancelled) {
          setWhisperStatus(result);
          if (["downloading", "loading"].includes(result.phase)) {
            timer = window.setTimeout(() => void refresh(), 1000);
          }
        }
      } catch (error) {
        if (!cancelled) {
          setWhisperStatus({
            phase: "error",
            progress: 0,
            message: "",
            cached: false,
            error: error instanceof Error ? error.message : "Could not check the model.",
          });
        }
      }
    };
    void refresh();
    return () => {
      cancelled = true;
      if (timer !== null) window.clearTimeout(timer);
    };
  }, [settings.transcribeEngine, settings.whisperModel, whisperPollGeneration]);

  const prepareModel = async () => {
    setWhisperStatus((current) => ({
      phase: "downloading",
      progress: current?.progress ?? 0,
      message: `Starting ${model?.label ?? "Whisper"}…`,
      cached: current?.cached ?? false,
      error: "",
    }));
    try {
      const result = await prepareWhisperModel({
        data: { whisperModel: settings.whisperModel },
      });
      setWhisperStatus(result);
      if (["downloading", "loading"].includes(result.phase)) {
        setWhisperPollGeneration((value) => value + 1);
      }
    } catch (error) {
      toast.error(error instanceof Error ? error.message : "Could not prepare Whisper");
    }
  };

  return (
    <div className="flex flex-col gap-4">
      <Section title="Engine">
        <Field
          label="Dictation engine"
          hint={
            isDesktop()
              ? "Whisper runs locally in Talk AI. The selected model is kept in the desktop cache."
              : "Everyone on this site uses the engine you pick here. Whisper runs on this server."
          }
        >
          <NativeSelect
            value={settings.transcribeEngine}
            onChange={(e) =>
              patch({ transcribeEngine: e.target.value as typeof settings.transcribeEngine })
            }
          >
            <option value="grok">Grok STT</option>
            <option value="whisper">Whisper (this server)</option>
            <option value="browser">Browser speech only</option>
          </NativeSelect>
        </Field>
      </Section>
      {settings.transcribeEngine === "whisper" ? (
        <Section title="Whisper model">
          <Field label="Version" hint={model ? `${model.note} · download ~${model.sizeMB} MB` : ""}>
            <NativeSelect
              value={settings.whisperModel}
              onChange={(e) => {
                setWhisperStatus(null);
                patch({ whisperModel: e.target.value as WhisperModelId });
              }}
            >
              {WHISPER_MODELS.map((m) => (
                <option key={m.id} value={m.id}>
                  {m.label}
                </option>
              ))}
            </NativeSelect>
          </Field>
          <div className="space-y-3 rounded-lg bg-secondary px-3 py-3 shadow-border">
            <div className="flex items-start justify-between gap-3">
              <div>
                <p className="text-sm font-medium">
                  {whisperStatus?.phase === "ready"
                    ? "Downloaded and ready"
                    : whisperStatus?.phase === "error"
                      ? "Model needs attention"
                      : whisperStatus?.message || "Checking model…"}
                </p>
                <p className="mt-1 text-xs leading-relaxed text-muted-foreground">
                  {whisperStatus?.phase === "ready"
                    ? "Saved in Talk AI’s persistent desktop cache. It will be reused after restarts."
                    : whisperStatus?.error ||
                      "Download and loading continue in the background. You can keep using the app."}
                </p>
              </div>
              <span className="shrink-0 font-mono text-xs text-muted-foreground">
                {whisperStatus?.phase === "ready"
                  ? "100%"
                  : whisperStatus && whisperStatus.progress > 0
                    ? `${whisperStatus.progress}%`
                    : ""}
              </span>
            </div>
            {whisperStatus && ["downloading", "loading"].includes(whisperStatus.phase) ? (
              <div className="h-1.5 overflow-hidden rounded-full bg-background" aria-hidden="true">
                <div
                  className="h-full rounded-full bg-primary transition-[width] duration-200"
                  style={{ width: `${Math.max(2, whisperStatus.progress)}%` }}
                />
              </div>
            ) : null}
            {whisperStatus?.phase === "idle" || whisperStatus?.phase === "error" ? (
              <Button size="sm" variant="secondary" onClick={() => void prepareModel()}>
                {whisperStatus.phase === "error" ? "Retry download" : "Download model"}
              </Button>
            ) : null}
          </div>
          <p className="text-sm text-muted-foreground">
            Talk AI prepares the selected model before you record. Large models can take several
            minutes to download once; Base is the usual fast choice.
          </p>
        </Section>
      ) : null}
    </div>
  );
}

function AiPanel() {
  const settings = useApp((s) => s.settings);
  const patch = useApp((s) => s.patchSettings);
  const [models, setModels] = useState(() => modelsForProvider(settings.provider));
  const [tools, setTools] = useState(
    LOCAL_TOOLS.map((t) => ({ ...t, found: false, path: null as string | null })),
  );
  const [credentials, setCredentials] = useState<
    Record<string, { configured: boolean; source: string; lastFour: string; unreadable?: boolean }>
  >({});
  const [testMsg, setTestMsg] = useState("");
  const [testing, setTesting] = useState(false);
  const [loadingModels, setLoadingModels] = useState(false);
  const [keyDraft, setKeyDraft] = useState("");
  const [customModel, setCustomModel] = useState(false);

  useEffect(() => {
    void getProviderCredentialStatuses({ data: sessionFields() })
      .then((r) => {
        if (!r.ok) return;
        setCredentials(Object.fromEntries(r.statuses.map((status) => [status.provider, status])));
      })
      .catch(() => {
        /* status remains unknown */
      });
    void discoverLocalTools({ data: sessionFields() })
      .then((r) => {
        if (r.ok) setTools(r.tools);
      })
      .catch(() => {
        /* browser-only */
      });
  }, []);

  useEffect(() => {
    setModels(modelsForProvider(settings.provider));
    setCustomModel(false);
    setKeyDraft("");
    setTestMsg("");
  }, [settings.provider]);

  const loadModels = async () => {
    setLoadingModels(true);
    setTestMsg("Loading available models…");
    const result = await listProviderModels({
      data: {
        provider: settings.provider,
        customEndpoint: settings.customEndpoint,
        ...sessionFields(),
      },
    });
    setLoadingModels(false);
    setModels(result.models);
    setTestMsg(result.ok ? `Loaded ${result.models.length} models` : result.error);
  };

  const runTest = async (save: boolean) => {
    setTesting(true);
    setTestMsg("Testing…");
    const result = await testProvider({
      data: {
        provider: settings.provider,
        customEndpoint: settings.customEndpoint,
        apiKey: keyDraft,
        save,
        localToolId: settings.localToolId,
        ...sessionFields(),
      },
    });
    setTesting(false);
    if (result.ok) {
      setTestMsg(result.message);
      if (result.models.length) setModels(result.models);
      if (result.saved) {
        setCredentials((current) => ({
          ...current,
          [settings.provider]: {
            configured: true,
            source: "vault",
            lastFour: result.lastFour,
          },
        }));
        setKeyDraft("");
        toast.success(
          `${PROVIDERS.find((provider) => provider.id === settings.provider)?.label ?? "Provider"} key saved`,
        );
      }
    } else {
      setTestMsg(result.error);
    }
  };

  const credential = credentials[settings.provider];
  const masked = credential?.unreadable
    ? `Saved key ending ${credential.lastFour} must be entered again`
    : credential?.configured
      ? `${"•".repeat(8)}${credential.lastFour}${credential.source === "environment" ? " · environment" : ""}`
      : "No saved key";
  const knownIds = new Set(models.map((m) => m.id));
  const remote = isRemoteProvider(settings.provider);

  return (
    <div className="flex flex-col gap-4">
      <Section title="Cleanup">
        <RowSwitch
          label="Enable AI cleanup"
          hint="Cleanup always runs after dictation, using the default prompt. Audio never leaves for this step — only the raw text."
          checked={settings.cleanupEnabled}
          onCheckedChange={(v) => patch({ cleanupEnabled: v })}
        />
        <Field label="Provider">
          <NativeSelect
            value={settings.provider}
            onChange={(e) => {
              const id = e.target.value as typeof settings.provider;
              const p = PROVIDERS.find((x) => x.id === id);
              patch({ provider: id, model: p?.defaultModel || settings.model });
            }}
          >
            {PROVIDERS.map((p) => (
              <option key={p.id} value={p.id}>
                {p.label}
              </option>
            ))}
          </NativeSelect>
        </Field>
        {settings.provider === "local" ? (
          <Field
            label="Local CLI"
            hint="Detected on this machine when Talk AI is running locally or as a desktop app."
          >
            <NativeSelect
              value={settings.localToolId}
              onChange={(e) => patch({ localToolId: e.target.value, model: e.target.value })}
            >
              <option value="">Select a tool</option>
              {tools.map((tool) => (
                <option key={tool.id} value={tool.id}>
                  {tool.label}
                  {tool.found ? "" : " · not found"}
                </option>
              ))}
            </NativeSelect>
          </Field>
        ) : (
          <Field
            label="Model"
            hint="Load the provider catalog or enter any model ID your account can use."
          >
            <NativeSelect
              value={knownIds.has(settings.model) && !customModel ? settings.model : "__custom"}
              onChange={(event) => {
                if (event.target.value === "__custom") {
                  setCustomModel(true);
                  return;
                }
                setCustomModel(false);
                patch({ model: event.target.value });
              }}
            >
              {models.map((model) => (
                <option key={model.id} value={model.id}>
                  {model.label}
                </option>
              ))}
              <option value="__custom">Custom model ID…</option>
            </NativeSelect>
            {customModel || !knownIds.has(settings.model) ? (
              <Input
                className="mt-2"
                value={settings.model}
                onChange={(event) => patch({ model: event.target.value })}
                placeholder="provider/model-id"
              />
            ) : null}
          </Field>
        )}
        {settings.provider === "custom" ? (
          <>
            <Field label="Custom endpoint">
              <Input
                value={settings.customEndpoint}
                onChange={(e) => patch({ customEndpoint: e.target.value })}
                placeholder="https://api.example.com/v1"
              />
            </Field>
          </>
        ) : null}
        {remote ? (
          <Field label="API key" hint={masked}>
            <Input
              type="password"
              autoComplete="off"
              value={keyDraft}
              onChange={(event) => setKeyDraft(event.target.value)}
              placeholder={
                credential?.configured ? "Paste a key to replace" : "Paste provider API key"
              }
            />
          </Field>
        ) : null}
        <div className="flex flex-wrap gap-2">
          <Button variant="secondary" disabled={testing} onClick={() => void runTest(false)}>
            Test connection
          </Button>
          {remote && keyDraft ? (
            <Button disabled={testing} onClick={() => void runTest(true)}>
              Save and test
            </Button>
          ) : null}
          {remote ? (
            <Button
              variant="secondary"
              disabled={testing || loadingModels}
              onClick={() => void loadModels()}
            >
              {loadingModels ? "Loading…" : "Load available models"}
            </Button>
          ) : null}
        </div>
        {testMsg ? <p className="text-xs text-muted-foreground">{testMsg}</p> : null}
      </Section>
    </div>
  );
}

function DesktopPanel() {
  const [tools, setTools] = useState(
    LOCAL_TOOLS.map((t) => ({ ...t, found: false as boolean, path: null as string | null })),
  );

  useEffect(() => {
    const scan = async () => {
      const bridge = desktop();
      if (bridge) {
        const next = await Promise.all(
          LOCAL_TOOLS.map(async (t) => {
            const path = await bridge.which(t.bin);
            return { ...t, found: Boolean(path), path };
          }),
        );
        setTools(next);
        return;
      }
      try {
        const r = await discoverLocalTools({ data: sessionFields() });
        if (r.ok) setTools(r.tools);
      } catch {
        /* */
      }
    };
    void scan();
  }, []);

  return (
    <div className="flex flex-col gap-4">
      <Section title="Application">
        <p className="text-sm leading-relaxed text-muted-foreground">
          Talk AI is a website. Open it in your browser at the local or hosted URL. Local CLIs on this machine can still be detected when the server is running here.
        </p>
      </Section>
      <Section title="Local tools">
        <p className="text-xs text-muted-foreground">
          Scanned on this machine. Use a found CLI as the AI cleanup provider under the AI tab.
        </p>
        <ul className="divide-y divide-border">
          {tools.map((t) => (
            <li key={t.id} className="flex items-center justify-between gap-3 py-2.5">
              <div>
                <p className="text-sm font-medium">{t.label}</p>
                <p className="text-xs text-muted-foreground">{t.hint}</p>
              </div>
              <span className={cn("text-xs", t.found ? "text-ready" : "text-subtle")}>
                {t.found ? (t.path ?? "Found") : "Not found"}
              </span>
            </li>
          ))}
        </ul>
      </Section>
    </div>
  );
}

function SoundsPanel() {
  const settings = useApp((s) => s.settings);
  const patch = useApp((s) => s.patchSettings);
  return (
    <Section title="Signals">
      <RowSwitch
        label="Enable sounds"
        checked={settings.soundsEnabled}
        onCheckedChange={(v) => patch({ soundsEnabled: v })}
      />
      <Field label="Preset">
        <NativeSelect
          value={settings.soundPreset}
          onChange={(e) => patch({ soundPreset: e.target.value as typeof settings.soundPreset })}
        >
          {SOUND_PRESETS.map((p) => (
            <option key={p.id} value={p.id}>
              {p.label}
            </option>
          ))}
        </NativeSelect>
      </Field>
      <Field label={`Volume · ${Math.round(settings.soundVolume * 100)}%`}>
        <Slider
          min={0}
          max={1}
          step={0.05}
          value={[settings.soundVolume]}
          onValueChange={([v]) => patch({ soundVolume: v ?? 0.7 })}
        />
      </Field>
      <Button
        variant="secondary"
        onClick={() => {
          unlockAudio();
          playSignal(settings.soundPreset, settings.soundVolume, "one");
        }}
      >
        Preview
      </Button>
    </Section>
  );
}

function CompletionPanel() {
  const settings = useApp((s) => s.settings);
  const patch = useApp((s) => s.patchSettings);
  return (
    <div className="flex flex-col gap-4">
      <Section title="After recording">
        <RowSwitch
          label="Keep recorder open after Copy or Insert"
          hint="When off, the in-browser recorder overlay closes after Copy or Insert."
          checked={settings.keepOverlayOpen}
          onCheckedChange={(v) => patch({ keepOverlayOpen: v })}
        />
        <Field label="Auto-delete recordings">
          <NativeSelect
            value={settings.autoDelete}
            onChange={(e) => patch({ autoDelete: e.target.value as typeof settings.autoDelete })}
          >
            {AUTO_DELETE_OPTIONS.map((o) => (
              <option key={o.id} value={o.id}>
                {o.label}
              </option>
            ))}
          </NativeSelect>
        </Field>
      </Section>
      <Section title="Home screen">
        <Field
          label="When opening the app"
          hint="Add Walkie to your iPhone home screen. ‘Start recording’ only runs from that icon, not from a regular browser tab."
        >
          <NativeSelect
            value={settings.launchAction}
            onChange={(e) =>
              patch({ launchAction: e.target.value as typeof settings.launchAction })
            }
          >
            <option value="idle">Open the library</option>
            <option value="record">Start recording immediately</option>
          </NativeSelect>
        </Field>
      </Section>
    </div>
  );
}

function SecurityPanel() {
  const user = useCurrentUser();
  const [profile, setProfile] = useState<{
    email: string;
    name: string;
    hasPassword: boolean;
    providers: string[];
    isAdmin: boolean;
  } | null>(null);
  const [current, setCurrent] = useState("");
  const [next, setNext] = useState("");
  const [confirm, setConfirm] = useState("");
  const [busy, setBusy] = useState(false);
  const [trustedStatus, setTrustedStatus] = useState<{
    available: boolean;
    enabled: boolean;
  } | null>(null);
  const [trustedPassword, setTrustedPassword] = useState("");
  const [trustedBusy, setTrustedBusy] = useState(false);
  const [resets, setResets] = useState<
    { id: string; email: string; url: string; createdAt: string }[]
  >([]);

  const load = async () => {
    const result = await getAccountProfile();
    if (result.ok) {
      setProfile({
        email: result.email,
        name: result.name,
        hasPassword: result.hasPassword,
        providers: result.providers,
        isAdmin: result.isAdmin,
      });
    }
    if (user?.isAdmin) {
      const box = await listPasswordResets();
      if (box.ok) setResets(box.items);
    }
  };

  useEffect(() => {
    void load();
  }, [user?.id]);

  useEffect(() => {
    const bridge = desktop();
    if (!bridge) {
      setTrustedStatus({ available: localTrustAvailable(), enabled: localTrustEnabled() });
      return;
    }
    void bridge
      .savedLoginStatus()
      .then(setTrustedStatus)
      .catch(() => {
        setTrustedStatus({ available: false, enabled: false });
      });
  }, []);

  const google = (profile?.providers ?? []).some((p) => p.includes("google"));
  const savePassword = async () => {
    if (next !== confirm) {
      toast.error("Passwords do not match");
      return;
    }
    setBusy(true);
    const result = await changeAccountPassword({ data: { current, next } });
    setBusy(false);
    if (!result.ok) toast.error(result.error || "Could not change password");
    else {
      if (trustedStatus?.enabled && profile?.email) {
        try {
          await desktop()?.saveLogin(profile.email, next);
        } catch {
          toast.error("Password changed, but the trusted desktop login could not be updated");
        }
      }
      toast.success("Password updated");
      setCurrent("");
      setNext("");
      setConfirm("");
    }
  };

  const enableTrustedLogin = async () => {
    const bridge = desktop();
    const accountEmail = profile?.email || user?.primaryEmail;
    if (!accountEmail) return;
    setTrustedBusy(true);
    try {
      if (!bridge) {
        const result = await issueLocalTrustToken();
        if (!result.ok) throw new Error(result.error);
        saveLocalTrustToken(result.token);
        setTrustedStatus({ available: true, enabled: true });
        toast.success("Login is now skipped on this Mac");
        return;
      }
      const result = await authClient.signIn.email({
        email: accountEmail,
        password: trustedPassword,
      });
      if (result.error) throw new Error(result.error.message || "That password was not accepted");
      await bridge.saveLogin(accountEmail, trustedPassword);
      setTrustedStatus({ available: true, enabled: true });
      setTrustedPassword("");
      toast.success("This desktop is now trusted");
    } catch (error) {
      toast.error(error instanceof Error ? error.message : "Could not trust this desktop");
    } finally {
      setTrustedBusy(false);
    }
  };

  const forgetTrustedLogin = async () => {
    const bridge = desktop();
    setTrustedBusy(true);
    try {
      if (!bridge) {
        clearLocalTrustToken();
        setTrustedStatus({ available: localTrustAvailable(), enabled: false });
        toast.success("Automatic local login is off");
        return;
      }
      await bridge.clearSavedLogin();
      setTrustedStatus((current) => ({ available: current?.available ?? true, enabled: false }));
      setTrustedPassword("");
      toast.success("This desktop was forgotten");
    } catch {
      toast.error("Could not forget this desktop");
    } finally {
      setTrustedBusy(false);
    }
  };

  return (
    <div className="flex flex-col gap-4">
      <Section title="Signed in">
        <div className="flex flex-col gap-3">
          <UserButton />
          <dl className="grid gap-2 text-sm">
            <div>
              <dt className="text-[11px] font-medium uppercase tracking-[0.16em] text-muted-foreground">
                Email
              </dt>
              <dd className="mt-0.5">{profile?.email || user?.primaryEmail || "—"}</dd>
            </div>
            <div>
              <dt className="text-[11px] font-medium uppercase tracking-[0.16em] text-muted-foreground">
                Sign-in
              </dt>
              <dd className="mt-0.5 text-muted-foreground">
                {google && profile?.hasPassword
                  ? "Google and password"
                  : google
                    ? "Google"
                    : profile?.hasPassword
                      ? "Email and password"
                      : "Account"}
              </dd>
            </div>
          </dl>
          <p className="text-sm leading-relaxed text-muted-foreground">
            Your library, prompts, pad, and appearance are encrypted to this account. Everyone must
            sign in — there is no guest mode.
          </p>
        </div>
      </Section>

      {isDesktop() || localTrustAvailable() ? (
        <Section title="Trusted desktop">
          <div className="flex items-start justify-between gap-4">
            <div>
              <p className="text-sm font-medium">
                {trustedStatus?.enabled ? "Automatic sign-in is on" : "Automatic sign-in is off"}
              </p>
              <p className="mt-1 text-xs leading-relaxed text-muted-foreground">
                {trustedStatus?.available === false
                  ? "Secure macOS credential storage is unavailable. Your password will not be stored."
                  : isDesktop()
                    ? "Your email and password are encrypted by macOS and stay on this Mac. Signing out or choosing Forget this desktop removes them."
                    : "Skip the login screen on this local Mac while keeping your email account, library, and encrypted settings. Your password is never stored."}
              </p>
            </div>
            <span
              className={cn(
                "mt-0.5 size-2.5 shrink-0 rounded-full",
                trustedStatus?.enabled ? "bg-ready" : "bg-border",
              )}
            />
          </div>
          {trustedStatus?.enabled ? (
            <Button
              variant="secondary"
              disabled={trustedBusy}
              onClick={() => void forgetTrustedLogin()}
            >
              {trustedBusy ? "Disabling…" : "Require login on this Mac"}
            </Button>
          ) : !isDesktop() && trustedStatus?.available !== false ? (
            <Button disabled={trustedBusy} onClick={() => void enableTrustedLogin()}>
              {trustedBusy ? "Enabling…" : "Skip login on this Mac"}
            </Button>
          ) : profile?.hasPassword && trustedStatus?.available !== false ? (
            <div className="space-y-3">
              <Field
                label="Confirm your password"
                hint="Required once to enable automatic sign-in."
              >
                <Input
                  type="password"
                  autoComplete="current-password"
                  value={trustedPassword}
                  onChange={(event) => setTrustedPassword(event.target.value)}
                  onKeyDown={(event) => {
                    if (event.key === "Enter" && trustedPassword.length >= 8)
                      void enableTrustedLogin();
                  }}
                />
              </Field>
              <Button
                disabled={trustedBusy || trustedPassword.length < 8}
                onClick={() => void enableTrustedLogin()}
              >
                {trustedBusy ? "Enabling…" : "Trust this desktop"}
              </Button>
            </div>
          ) : profile && !profile.hasPassword ? (
            <p className="text-xs leading-relaxed text-muted-foreground">
              Automatic sign-in requires an email-and-password account.
            </p>
          ) : null}
        </Section>
      ) : null}

      {profile?.hasPassword ? (
        <Section title="Password">
          <Field label="Current password">
            <Input
              type="password"
              autoComplete="current-password"
              value={current}
              onChange={(e) => setCurrent(e.target.value)}
            />
          </Field>
          <Field label="New password">
            <Input
              type="password"
              autoComplete="new-password"
              value={next}
              onChange={(e) => setNext(e.target.value)}
              placeholder="At least 8 characters"
            />
          </Field>
          <Field label="Confirm new password">
            <Input
              type="password"
              autoComplete="new-password"
              value={confirm}
              onChange={(e) => setConfirm(e.target.value)}
            />
          </Field>
          <Button disabled={busy || next.length < 8} onClick={() => void savePassword()}>
            {busy ? "Saving…" : "Update password"}
          </Button>
        </Section>
      ) : (
        <Section title="Password">
          <p className="text-sm leading-relaxed text-muted-foreground">
            You sign in with Google. There is no password on this account, and it cannot be added
            from here.
          </p>
        </Section>
      )}

      {user?.isAdmin && resets.length > 0 ? (
        <Section title="Password reset requests">
          <p className="text-sm leading-relaxed text-muted-foreground">
            Copy a link and send it to the person who asked. Links expire after they are used.
          </p>
          <ul className="space-y-2">
            {resets.map((item) => (
              <li key={item.id} className="rounded-lg bg-secondary px-3 py-2 text-sm">
                <p className="font-medium">{item.email}</p>
                <button
                  type="button"
                  className="mt-1 text-xs text-primary hover:underline"
                  onClick={() => {
                    void navigator.clipboard.writeText(item.url);
                    toast.success("Reset link copied");
                  }}
                >
                  Copy reset link
                </button>
              </li>
            ))}
          </ul>
        </Section>
      ) : null}
    </div>
  );
}

function PermissionsPanel() {
  const [perm, setPerm] = useState("unknown");
  const refresh = async () => setPerm(await micPermission());
  useEffect(() => {
    void refresh();
  }, []);

  const requestMic = async () => {
    try {
      const stream = await navigator.mediaDevices.getUserMedia({ audio: true });
      stream.getTracks().forEach((t) => t.stop());
      toast.success("Microphone allowed");
      await refresh();
    } catch {
      toast.error("Microphone permission was not granted");
    }
  };

  return (
    <div className="flex flex-col gap-4">
      <Section title="Access">
        <PermRow
          name="Microphone"
          state={perm}
          hint="Recording and spoken phrases."
          action="Request"
          onAction={() => void requestMic()}
        />
        <PermRow
          name="Speech recognition"
          state={speechAvailable() ? "available" : "unavailable"}
          hint="Wake, send, and insert phrases. Grok STT and Whisper do not need this."
        />
        <PermRow
          name="Clipboard"
          state="granted"
          hint="Copy and Insert use the clipboard. Insert also writes the pad."
        />
        <Button variant="secondary" onClick={() => void refresh()}>
          Refresh status
        </Button>
      </Section>
      <Link
        to="/diagnostics"
        className="text-sm text-muted-foreground underline-offset-4 hover:underline"
      >
        Diagnostics
      </Link>
    </div>
  );
}

function PermRow({
  name,
  state,
  hint,
  action,
  onAction,
}: {
  name: string;
  state: string;
  hint: string;
  action?: string;
  onAction?: () => void;
}) {
  return (
    <div className="flex items-start justify-between gap-3">
      <div>
        <p className="text-sm font-medium">{name}</p>
        <p className="mt-1 text-xs text-muted-foreground">{hint}</p>
      </div>
      <div className="flex items-center gap-2">
        <span className="text-xs capitalize text-muted-foreground">{state.replace("-", " ")}</span>
        {action && onAction ? (
          <Button size="sm" variant="secondary" onClick={onAction}>
            {action}
          </Button>
        ) : null}
      </div>
    </div>
  );
}
