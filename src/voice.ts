import { commandTopic, parseVoiceCommand, stateTopic, type LedCommand } from "./text";
import { lang, setupLanguagePicker, t, translatePage } from "./i18n";
import { el, setStatus, setupMqttPage } from "./mqttpage";
import { setupHomeLinks } from "./nav";
import { setupStats } from "./stats";
import { setupStylePicker } from "./theme";

translatePage();

const BOARD_REPLY_TIMEOUT = 4000;

const BOARD_STATES: Record<string, string> = {
  on: t("開發板：LED 開啟"),
  off: t("開發板：LED 關閉"),
  blink: t("開發板：LED 閃爍"),
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

const ui = {
  boardStatus: el("board-status"),
  voice: el<HTMLButtonElement>("voice"),
  commands: [...document.querySelectorAll<HTMLButtonElement>("[data-command]")],
  textForm: el<HTMLFormElement>("text-form"),
  textCommand: el<HTMLInputElement>("text-command"),
  textSend: el<HTMLButtonElement>("text-send"),
  message: el("message"),
};

let channel = "";
let replyTimer: ReturnType<typeof setTimeout> | undefined;

function setControlsEnabled(enabled: boolean): void {
  ui.voice.disabled = !enabled;
  ui.textCommand.disabled = !enabled;
  ui.textSend.disabled = !enabled;
  for (const button of ui.commands) button.disabled = !enabled;
}

function onBoardState(state: string): void {
  clearTimeout(replyTimer);
  if (state === "offline") {
    setStatus(ui.boardStatus, t("開發板：離線，請確認程式正在執行"), "error");
    return;
  }
  const text = BOARD_STATES[state];
  if (text) setStatus(ui.boardStatus, text, "ready");
}

const page = setupMqttPage({
  channelKey: "esp32-mp-voice-channel",
  describeTopics: (name) => t("實際使用的 Topic：{command}（指令）、{state}（回報）", { command: commandTopic(name), state: stateTopic(name) }),
  onConnecting(name) {
    clearTimeout(replyTimer);
    channel = name;
    setControlsEnabled(false);
    setStatus(ui.boardStatus, t("開發板：尚未回報"), "idle");
  },
  onConnected(client, name) {
    setControlsEnabled(true);
    client.subscribe(stateTopic(name));
  },
  onLost: () => setControlsEnabled(false),
  onMessage: (_topic, payload) => onBoardState(new TextDecoder().decode(payload)),
});

function sendCommand(command: LedCommand): void {
  page.publish(commandTopic(channel), command);
  clearTimeout(replyTimer);
  replyTimer = setTimeout(() => {
    setStatus(ui.boardStatus, t("開發板：沒有回應，請確認主題名稱和程式是否正在執行"), "error");
  }, BOARD_REPLY_TIMEOUT);
}

function runText(text: string): void {
  const command = parseVoiceCommand(text);
  if (command) {
    ui.message.textContent = t("收到：{text}", { text });
    sendCommand(command);
  } else {
    ui.message.textContent = t("聽不懂「{text}」，請說開燈、關燈或閃爍", { text });
  }
}

function speechErrorMessage(error: string): string {
  if (error === "not-allowed" || error === "service-not-allowed") return t("麥克風沒有開放，請到瀏覽器的網站設定允許使用麥克風");
  if (error === "network") return t("語音辨識需要連上網際網路，請確認這臺裝置可以上網");
  if (error === "no-speech") return t("沒有聽到聲音，請再試一次");
  return t("語音辨識失敗，請再試一次（{error}）", { error });
}

function startVoice(): void {
  const scope = window as unknown as Record<string, (new () => SpeechRecognizer) | undefined>;
  const Recognizer = scope.SpeechRecognition ?? scope.webkitSpeechRecognition;
  if (!Recognizer) {
    ui.message.textContent = t("這個瀏覽器不支援語音辨識，請改用文字指令或鍵盤的麥克風");
    return;
  }
  const recognizer = new Recognizer();
  recognizer.lang = lang === "en" ? "en-US" : "zh-TW";
  recognizer.onresult = (event) => runText(event.results[0][0].transcript);
  recognizer.onerror = (event) => {
    ui.message.textContent = speechErrorMessage(event.error);
  };
  ui.message.textContent = t("聆聽中，請說話");
  recognizer.start();
}

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
// Reloading reconnects by itself unless the broker needs a password, which is not saved.
setupLanguagePicker(el<HTMLSelectElement>("language-picker"), { canFollow: () => !page.hasPassword() });
setupHomeLinks();
setupStats();
