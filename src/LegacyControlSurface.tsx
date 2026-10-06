import ControlPlaneV2 from "./ControlPlaneV2";
import ChatModelRouter from "./ChatModelRouter";
import AppEnhancements from "./AppEnhancements";
import WorkspacePolish from "./WorkspacePolish";
import ConnectorPanel from "./ConnectorPanel";
import ProviderConnectWizard from "./ProviderConnectWizard";
import GagVault from "./GagVault";
import LiveAssist from "./LiveAssist";

import "./control-plane-v2.css";
import "./wave-control-v3.css";
import "./usage-panel.css";
import "./connector-panel.css";
import "./provider-connect.css";
import "./live-assist.css";
import "./openai-platform-theme.css";
import "./gag-vault.css";
import "./dense-mobile.css";
import "./mobile-app.css";
import "./wave-chat-v3.css";
import "./mobile-fixes.css";

export default function LegacyControlSurface() {
  return <>
    <ControlPlaneV2 />
    <ChatModelRouter />
    <AppEnhancements />
    <WorkspacePolish />
    <ConnectorPanel />
    <ProviderConnectWizard />
    <GagVault />
    <LiveAssist />
  </>;
}
