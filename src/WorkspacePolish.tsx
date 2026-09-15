import { useEffect } from "react";

const ICONS: Record<string, { domain: string; fallback: string }> = {
  GitHub: { domain: "github.com", fallback: "GH" },
  Linear: { domain: "linear.app", fallback: "LI" },
  OpenAI: { domain: "platform.openai.com", fallback: "AI" },
  Cloudflare: { domain: "cloudflare.com", fallback: "CF" },
  Vercel: { domain: "vercel.com", fallback: "▲" },
  Infisical: { domain: "infisical.com", fallback: "IF" },
  Notion: { domain: "notion.so", fallback: "N" },
  "Google Drive": { domain: "drive.google.com", fallback: "GD" },
  Figma: { domain: "figma.com", fallback: "FG" },
  Shopify: { domain: "shopify.com", fallback: "SH" },
  Magnific: { domain: "magnific.ai", fallback: "MG" },
  Candy: { domain: "candybaked.ogenicchocolate.com", fallback: "♥" },
  Manus: { domain: "manus.im", fallback: "M" },
};

function decorateAppButton(button: HTMLButtonElement) {
  if (button.dataset.iconWired === "1") return;
  const label = button.querySelector<HTMLElement>("b")?.textContent?.trim() ?? "";
  const icon = ICONS[label];
  const holder = button.querySelector<HTMLElement>("i");
  if (!icon || !holder) return;
  button.dataset.iconWired = "1";
  holder.classList.add("appBrandIcon");
  holder.textContent = icon.fallback;
  const image = document.createElement("img");
  image.alt = "";
  image.loading = "lazy";
  image.referrerPolicy = "no-referrer";
  image.src = `https://www.google.com/s2/favicons?domain=${encodeURIComponent(icon.domain)}&sz=64`;
  image.onerror = () => image.remove();
  holder.append(image);
}

export default function WorkspacePolish() {
  useEffect(() => {
    const wire = () => {
      document.querySelectorAll<HTMLElement>(".cpRow b").forEach((title) => {
        const value = title.textContent ?? "";
        if (/^เชื่อต่อ\s+/i.test(value)) title.textContent = value.replace(/^เชื่อต่อ\s+/i, "เชื่อมต่อ ");
        if (/github/i.test(title.textContent ?? "")) title.textContent = (title.textContent ?? "").replace(/github/ig, "GitHub");
      });

      const appGrid = document.querySelector<HTMLElement>(".cpAppGrid");
      if (appGrid && !appGrid.querySelector(".manusAppButton")) {
        const button = document.createElement("button");
        button.type = "button";
        button.className = "manusAppButton";
        button.title = "Manus agent workspace · API integration remains disabled until MANUS_API_KEY is bound securely";
        button.innerHTML = "<i>M</i><span><b>Manus</b><small>Agent · Browser/Login</small></span><em>↗</em>";
        button.onclick = () => window.open("https://manus.im/app", "_blank", "noopener,noreferrer");
        appGrid.append(button);
      }

      document.querySelectorAll<HTMLButtonElement>(".cpAppGrid button,.cpQuickApps button").forEach(decorateAppButton);
    };

    const observer = new MutationObserver(wire);
    observer.observe(document.body, { childList: true, subtree: true });
    wire();
    return () => observer.disconnect();
  }, []);

  return null;
}
