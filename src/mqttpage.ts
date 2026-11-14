import mqtt, { type MqttClient } from "mqtt";
import { brokerUrl, DEFAULT_BROKER, isValidBroker, isValidChannel, type BrokerSettings } from "./text";
import { t } from "./i18n";

// Both phone pages share the broker, because a class normally uses one broker for everything.
const BROKER_KEY = "esp32-mp-voice-broker";

export type StatusState = "idle" | "ready" | "busy" | "error";

export function el<T extends HTMLElement>(id: string): T {
  return document.getElementById(id) as T;
}

export function setStatus(node: HTMLElement, text: string, state: StatusState): void {
  node.textContent = text;
  node.dataset.state = state;
}

export interface MqttPageOptions {
  /** Where this page remembers its topic name; each page keeps its own. */
  channelKey: string;
  /** The topics this page uses, shown under the topic name so students can match them with the board's code. */
  describeTopics(name: string): string;
  /** A new connection starts: forget the old board's state. */
  onConnecting(name: string): void;
  onConnected(client: MqttClient, name: string): void;
  /** The broker is out of reach or refused the login. */
  onLost(): void;
  /** `retained` is true for a message the broker kept from before, rather than one sent just now. */
  onMessage(topic: string, payload: Uint8Array, retained: boolean): void;
}

export interface MqttPage {
  /** The password is not saved, so a page that reloads by itself would lose it. */
  hasPassword(): boolean;
  publish(topic: string, payload: string, retain?: boolean): void;
  showMessage(text: string): void;
}

/**
 * The topic form, broker settings and connection shared by the voice and dashboard pages.
 * Both pages use the same element ids for these parts.
 */
export function setupMqttPage(options: MqttPageOptions): MqttPage {
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
    message: el("message"),
  };

  let client: MqttClient | null = null;

  function connect(name: string, broker: BrokerSettings, password: string): void {
    client?.end(true);
    options.onConnecting(name);
    setStatus(ui.linkStatus, t("正在連線"), "busy");

    const current = mqtt.connect(brokerUrl(broker), {
      connectTimeout: 10_000,
      reconnectPeriod: 3000,
      username: broker.username || undefined,
      password: password || undefined,
    });
    client = current;
    current.on("connect", () => {
      setStatus(ui.linkStatus, t("已連線，主題：{name}", { name }), "ready");
      options.onConnected(current, name);
    });
    current.on("message", (topic, payload, packet) => {
      if (client === current) options.onMessage(topic, payload, packet.retain);
    });
    const onLost = () => {
      // A client replaced by a new connection must not overwrite the current status.
      if (client !== current) return;
      setStatus(ui.linkStatus, t("連不上伺服器，正在重試。請確認這台裝置可以上網，以及伺服器設定正確"), "error");
      options.onLost();
    };
    current.on("offline", onLost);
    current.on("error", (error) => {
      if ("code" in error && (error.code === 4 || error.code === 5)) {
        // Retrying a rejected password only repeats the failure and may lock the account.
        client = null;
        current.end(true);
        setStatus(ui.linkStatus, t("MQTT 帳號或密碼不正確，或這個帳號沒有使用權限"), "error");
        options.onLost();
        return;
      }
      onLost();
    });
  }

  function readSavedChannel(): string {
    try {
      return localStorage.getItem(options.channelKey) ?? "";
    } catch {
      return "";
    }
  }

  function saveChannel(name: string): void {
    try {
      localStorage.setItem(options.channelKey, name);
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
    ui.topicPreview.textContent = options.describeTopics(ui.channel.value.trim() || t("主題名稱"));
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
      ui.message.textContent = t("主題名稱只能使用英文、數字、底線和連字號，最多 32 個字");
      return;
    }
    const broker = readBrokerFields();
    if (!isValidBroker(broker)) {
      ui.brokerSettings.open = true;
      ui.message.textContent = t("伺服器設定不正確：連接埠是 1–65535 的數字，路徑以 / 開頭");
      return;
    }
    const password = ui.brokerPassword.value;
    if (password && !broker.username) {
      ui.brokerSettings.open = true;
      ui.message.textContent = t("有填密碼時也要填帳號");
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

  const initialChannel = new URLSearchParams(location.search).get("ch") ?? readSavedChannel();
  const initialBroker = readSavedBroker();
  ui.channel.value = initialChannel;
  showBroker(initialBroker);
  ui.brokerSettings.open = brokerUrl(initialBroker) !== brokerUrl(DEFAULT_BROKER) || Boolean(initialBroker.username);
  showTopics();
  // Connecting waits for the page's own setup, which runs after this function returns.
  queueMicrotask(() => {
    if (!isValidChannel(initialChannel)) return;
    saveChannel(initialChannel);
    if (initialBroker.username) {
      ui.message.textContent = t("請輸入 MQTT 密碼後按「連線」");
    } else {
      connect(initialChannel, initialBroker, "");
    }
  });

  return {
    hasPassword: () => Boolean(ui.brokerPassword.value),
    publish: (topic, payload, retain = false) => {
      client?.publish(topic, payload, { retain });
    },
    showMessage: (text) => {
      ui.message.textContent = text;
    },
  };
}
