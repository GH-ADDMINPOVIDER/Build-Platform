import { useEffect } from "react";

type ChatConfig = {
  model: "gpt-5.6-terra" | "gpt-5.6-luna" | "gpt-5.6-sol" | "gpt-4.1-mini" | "gpt-6-astra";
  effort: "low" | "medium" | "high" | "xhigh" | "max";
  boost: 1 | 10 | 20;
};

const STORAGE_KEY = "ogenic.chat.model-config.v1";
const DEFAULT_CONFIG: ChatConfig = { model: "gpt-5.6-sol", effort: "medium", boost: 1 };
const MODELS: Array<{ id: ChatConfig["model"]; label: string }> = [
  { id: "gpt-5.6-terra", label: "Terra" },
  { id: "gpt-5.6-luna", label: "Luna" },
  { id: "gpt-5.6-sol", label: "Sol" },
  { id: "gpt-4.1-mini", label: "4.1 mini" },
  { id: "gpt-6-astra", label: "Astra" },
];
const EFFORTS: Array<{ id: ChatConfig["effort"]; label: string }> = [
  { id: "low", label: "Light" },
  { id: "medium", label: "Medium" },
  { id: "high", label: "High" },
  { id: "xhigh", label: "Max High" },
  { id: "max", label: "Max" },
];

function readConfig(): ChatConfig {
  try {
    const raw = JSON.parse(localStorage.getItem(STORAGE_KEY) || "null") as Partial<ChatConfig> | null;
    const model = MODELS.some((item) => item.id === raw?.model) ? raw!.model! : DEFAULT_CONFIG.model;
    const effort = EFFORTS.some((item) => item.id === raw?.effort) ? raw!.effort! : DEFAULT_CONFIG.effort;
    const boost = raw?.boost === 10 || raw?.boost === 20 ? raw.boost : 1;
    return { model, effort, boost };
  } catch {
    return DEFAULT_CONFIG;
  }
}

function saveConfig(config: ChatConfig) {
  localStorage.setItem(STORAGE_KEY, JSON.stringify(config));
  window.dispatchEvent(new CustomEvent("ogenic:chat-model-config", { detail: config }));
}

function requestUrl(input: RequestInfo | URL) {
  if (typeof input === "string") return input;
  if (input instanceof URL) return input.href;
  return input.url;
}

export default function ChatModelRouter() {
  useEffect(() => {
    let config = readConfig();
    const originalFetch = window.fetch.bind(window);

    const onConfig = (event: Event) => {
      const detail = (event as CustomEvent<ChatConfig>).detail;
      if (detail) config = detail;
    };
    window.addEventListener("ogenic:chat-model-config", onConfig);

    const wrappedFetch: typeof window.fetch = async (input, init) => {
      const url = requestUrl(input);
      const method = (init?.method ?? (input instanceof Request ? input.method : "GET")).toUpperCase();
      let pathname = "";
      try { pathname = new URL(url, window.location.origin).pathname; } catch { pathname = url; }
      if (method !== "POST" || pathname !== "/api/chat" || typeof init?.body !== "string") {
        return originalFetch(input, init);
      }
      try {
        const body = JSON.parse(init.body) as Record<string, unknown>;
        body.model = config.model;
        body.reasoning_effort = config.effort;
        body.token_boost = config.boost;
        return originalFetch("/api/chat/model", { ...init, body: JSON.stringify(body) });
      } catch {
        return originalFetch(input, init);
      }
    };
    window.fetch = wrappedFetch;

    const wire = () => {
      const head = document.querySelector<HTMLElement>(".chatPanelHead");
      if (!head || head.querySelector(".chatModelControls")) return;
      const controls = document.createElement("div");
      controls.className = "chatModelControls";

      const modelWrap = document.createElement("label");
      modelWrap.innerHTML = "<span>MODEL</span>";
      const modelSelect = document.createElement("select");
      modelSelect.setAttribute("aria-label", "Chat model");
      for (const item of MODELS) {
        const option = document.createElement("option");
        option.value = item.id;
        option.textContent = item.label;
        modelSelect.append(option);
      }
      modelSelect.value = config.model;
      modelWrap.append(modelSelect);

      const effortWrap = document.createElement("label");
      effortWrap.innerHTML = "<span>REASONING</span>";
      const effortSelect = document.createElement("select");
      effortSelect.setAttribute("aria-label", "Reasoning effort");
      for (const item of EFFORTS) {
        const option = document.createElement("option");
        option.value = item.id;
        option.textContent = item.label;
        effortSelect.append(option);
      }
      effortSelect.value = config.effort;
      effortWrap.append(effortSelect);

      const boostWrap = document.createElement("label");
      boostWrap.innerHTML = "<span>OUTPUT</span>";
      const boostSelect = document.createElement("select");
      boostSelect.setAttribute("aria-label", "Output token multiplier");
      for (const value of [1, 10, 20] as const) {
        const option = document.createElement("option");
        option.value = String(value);
        option.textContent = `×${value}`;
        boostSelect.append(option);
      }
      boostSelect.value = String(config.boost);
      boostWrap.append(boostSelect);

      const billing = document.createElement("span");
      billing.className = "chatBillingBadge";
      billing.textContent = "API billed";
      billing.title = "Model selection uses the bound OpenAI Platform API key. ×10/×20 raise the output ceiling; actual billing follows API usage.";

      const syncDisabled = () => {
        const noReasoning = modelSelect.value === "gpt-4.1-mini";
        effortSelect.disabled = noReasoning;
        effortWrap.classList.toggle("disabled", noReasoning);
        effortWrap.title = noReasoning ? "GPT-4.1 mini is a non-reasoning model" : "";
      };
      const commit = () => {
        config = {
          model: modelSelect.value as ChatConfig["model"],
          effort: effortSelect.value as ChatConfig["effort"],
          boost: Number(boostSelect.value) as ChatConfig["boost"],
        };
        saveConfig(config);
        syncDisabled();
      };
      modelSelect.onchange = commit;
      effortSelect.onchange = commit;
      boostSelect.onchange = commit;
      syncDisabled();

      controls.append(modelWrap, effortWrap, boostWrap, billing);
      head.append(controls);
    };

    const observer = new MutationObserver(wire);
    observer.observe(document.body, { childList: true, subtree: true });
    wire();

    return () => {
      observer.disconnect();
      window.removeEventListener("ogenic:chat-model-config", onConfig);
      if (window.fetch === wrappedFetch) window.fetch = originalFetch;
    };
  }, []);

  return null;
}
