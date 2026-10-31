import mqtt, { type MqttClient } from "mqtt";
import {
  brokerUrl,
  commandTopic,
  DEFAULT_BROKER,
  isValidBroker,
  isValidChannel,
  parseVoiceCommand,
  stateTopic,
  type BrokerSettings,
  type LedCommand,
} from "./text";
import { setupHomeLinks } from "./nav";
import { setupStats } from "./stats";
import { setupStylePicker } from "./theme";

const CHANNEL_KEY = "esp32-mp-voice-channel";
const BROKER_KEY = "esp32-mp-voice-broker";
const BOARD_REPLY_TIMEOUT = 4000;

const BOARD_STATES: Record<string, string> = {
  on: "開發板：LED 開啟",
  off: "開發板：LED 關閉",
  blink: "開發板：LED 閃爍",
};

interface SpeechResultEvent {
  results: { [index: number]: { [index: number]: { transcript: string } } };
}

interface SpeechRecognizer {
  lang: string;
  onresult: (event: SpeechResultEvent) => void;
  onerror: (event: { error: string }) => void;
  onend: () => void;
  start(): void;
}

function el<T extends HTMLElement>(id: string): T {
  return document.getElementById(id) as T;
}

const ui = {
  channelForm: el<HTMLFormElement>("channel-form"),
  channel: el<HTMLInputElement>("channel"),
  topicPreview: el("topic-preview"),
  brokerSettings: el<HTMLDetailsElement>("broker-settings"),
  brokerHost: el<HTMLInputElement>("broker-host"),
  brokerPort: el<HTMLInputElement>("broker-port"),
  brokerPath: el<HTMLInputElement>("broker-path"),
  brokerUser: el<HTMLInputElement>("broker-user"),
  brokerPassword: el<HTMLInputElement>("broker-password"),
  brokerReset: el<HTMLButtonElement>("broker-reset"),
  linkStatus: el("link-status"),
  boardStatus: el("board-status"),
  voice: el<HTMLButtonElement>("voice"),
  commands: [...document.querySelectorAll<HTMLButtonElement>("[data-command]")],
  textForm: el<HTMLFormElement>("text-form"),
  textCommand: el<HTMLInputElement>("text-command"),
  textSend: el<HTMLButtonElement>("text-send"),
  message: el("message"),
};

let client: MqttClient | null = null;
let channel = "";
let replyTimer: ReturnType<typeof setTimeout> | undefined;

function setStatus(node: HTMLElement, text: string, state: "idle" | "ready" | "busy" | "error"): void {
  node.textContent = text;
  node.dataset.state = state;
}

function setControlsEnabled(enabled: boolean): void {
  ui.voice.disabled = !enabled;
  ui.textCommand.disabled = !enabled;
  ui.textSend.disabled = !enabled;
  for (const button of ui.commands) button.disabled = !enabled;
}

function onBoardState(state: string): void {
  clearTimeout(replyTimer);
  if (state === "offline") {
    setStatus(ui.boardStatus, "開發板：離線，請確認程式正在執行", "error");
    return;
  }
  const text = BOARD_STATES[state];
  if (text) setStatus(ui.boardStatus, text, "ready");
}

function connect(name: string, broker: BrokerSettings, password: string): void {
  client?.end(true);
  clearTimeout(replyTimer);
  channel = name;
  setControlsEnabled(false);
  setStatus(ui.linkStatus, "正在連線", "busy");
  setStatus(ui.boardStatus, "開發板：尚未回報", "idle");

  const current = mqtt.connect(brokerUrl(broker), {
    connectTimeout: 10_000,
    reconnectPeriod: 3000,
    username: broker.username || undefined,
    password: password || undefined,
  });
  client = current;
  current.on("connect", () => {
    setStatus(ui.linkStatus, `已連線，主題：${name}`, "ready");
    setControlsEnabled(true);
    current.subscribe(stateTopic(name));
  });
  current.on("message", (_topic, payload) => onBoardState(payload.toString()));
  const onLost = () => {
    // A client replaced by a new connection must not overwrite the current status.
    if (client !== current) return;
    setStatus(ui.linkStatus, "連不上伺服器，正在重試。請確認這台裝置可以上網，以及伺服器設定正確", "error");
    setControlsEnabled(false);
  };
  current.on("offline", onLost);
  current.on("error", (error) => {
    if ("code" in error && (error.code === 4 || error.code === 5)) {
      // Retrying a rejected password only repeats the failure and may lock the account.
      client = null;
      current.end(true);
      setStatus(ui.linkStatus, "MQTT 帳號或密碼不正確，或這個帳號沒有使用權限", "error");
      setControlsEnabled(false);
      return;
    }
    onLost();
  });
}

function sendCommand(command: LedCommand): void {
  client?.publish(commandTopic(channel), command);
  clearTimeout(replyTimer);
  replyTimer = setTimeout(() => {
    setStatus(ui.boardStatus, "開發板：沒有回應，請確認主題名稱和程式是否正在執行", "error");
  }, BOARD_REPLY_TIMEOUT);
}

function runText(text: string): void {
  const command = parseVoiceCommand(text);
  if (command) {
    ui.message.textContent = `收到：${text}`;
    sendCommand(command);
  } else {
    ui.message.textContent = `聽不懂「${text}」，請說開燈、關燈或閃爍`;
  }
}

function speechErrorMessage(error: string): string {
  if (error === "not-allowed" || error === "service-not-allowed") return "麥克風沒有開放，請到瀏覽器的網站設定允許使用麥克風";
  if (error === "network") return "語音辨識需要連上網際網路，請確認這台裝置可以上網";
  if (error === "no-speech") return "沒有聽到聲音，請再試一次";
  return `語音辨識失敗，請再試一次（${error}）`;
}

function startVoice(): void {
  const scope = window as unknown as Record<string, (new () => SpeechRecognizer) | undefined>;
  const Recognizer = scope.SpeechRecognition ?? scope.webkitSpeechRecognition;
  if (!Recognizer) {
    ui.message.textContent = "這個瀏覽器不支援語音辨識，請改用文字指令或鍵盤的麥克風";
    return;
  }
  const recognizer = new Recognizer();
  recognizer.lang = "zh-TW";
  recognizer.onresult = (event) => runText(event.results[0][0].transcript);
  recognizer.onerror = (event) => {
    ui.message.textContent = speechErrorMessage(event.error);
  };
  ui.message.textContent = "聆聽中，請說話";
  recognizer.start();
}

function readSavedChannel(): string {
  try {
    return localStorage.getItem(CHANNEL_KEY) ?? "";
  } catch {
    return "";
  }
}

function saveChannel(name: string): void {
  try {
    localStorage.setItem(CHANNEL_KEY, name);
  } catch {
    // The page still works when the browser blocks storage.
  }
}

function readSavedBroker(): BrokerSettings {
  try {
    const saved = JSON.parse(localStorage.getItem(BROKER_KEY) ?? "null");
    if (saved && isValidBroker(saved)) return saved;
  } catch {
    // Fall through to the default when the value is damaged or storage is blocked.
  }
  return DEFAULT_BROKER;
}

function saveBroker(broker: BrokerSettings): void {
  try {
    localStorage.setItem(BROKER_KEY, JSON.stringify(broker));
  } catch {
    // The settings still apply until the page is closed.
  }
}

function showBroker(broker: BrokerSettings): void {
  ui.brokerHost.value = broker.host;
  ui.brokerPort.value = String(broker.port);
  ui.brokerPath.value = broker.path;
  ui.brokerUser.value = broker.username ?? "";
}

function showTopics(): void {
  const name = ui.channel.value.trim() || "主題名稱";
  ui.topicPreview.textContent = `實際使用的 Topic：${commandTopic(name)}（指令）、${stateTopic(name)}（回報）`;
}

function readBrokerFields(): BrokerSettings {
  return {
    host: ui.brokerHost.value.trim(),
    port: Number(ui.brokerPort.value),
    path: ui.brokerPath.value.trim(),
    username: ui.brokerUser.value.trim(),
  };
}

ui.channelForm.addEventListener("submit", (event) => {
  event.preventDefault();
  const name = ui.channel.value.trim();
  if (!isValidChannel(name)) {
    ui.message.textContent = "主題名稱只能使用英文、數字、底線和連字號，最多 32 個字";
    return;
  }
  const broker = readBrokerFields();
  if (!isValidBroker(broker)) {
    ui.brokerSettings.open = true;
    ui.message.textContent = "伺服器設定不正確：連接埠是 1–65535 的數字，路徑以 / 開頭";
    return;
  }
  const password = ui.brokerPassword.value;
  if (password && !broker.username) {
    ui.brokerSettings.open = true;
    ui.message.textContent = "有填密碼時也要填帳號";
    return;
  }
  ui.message.textContent = "";
  saveChannel(name);
  // The password is never saved, so it cannot be read by the next person on a shared computer.
  saveBroker(broker);
  connect(name, broker, password);
});
ui.channel.addEventListener("input", showTopics);
ui.brokerReset.addEventListener("click", () => {
  showBroker(DEFAULT_BROKER);
  ui.brokerPassword.value = "";
});

ui.voice.addEventListener("click", startVoice);
for (const button of ui.commands) {
  button.addEventListener("click", () => sendCommand(button.dataset.command as LedCommand));
}
ui.textForm.addEventListener("submit", (event) => {
  event.preventDefault();
  const text = ui.textCommand.value.trim();
  ui.textCommand.value = "";
  if (text) runText(text);
});

setupStylePicker(el<HTMLSelectElement>("style-picker"));
setupHomeLinks();
setupStats();

const initialChannel = new URLSearchParams(location.search).get("ch") ?? readSavedChannel();
const initialBroker = readSavedBroker();
ui.channel.value = initialChannel;
showBroker(initialBroker);
ui.brokerSettings.open = brokerUrl(initialBroker) !== brokerUrl(DEFAULT_BROKER) || Boolean(initialBroker.username);
showTopics();
if (isValidChannel(initialChannel)) {
  saveChannel(initialChannel);
  if (initialBroker.username) {
    ui.message.textContent = "請輸入 MQTT 密碼後按「連線」";
  } else {
    connect(initialChannel, initialBroker, "");
  }
}
