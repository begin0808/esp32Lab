import { describe, expect, it } from "vitest";
import { isConnectFailure, retryConnect } from "../../src/flasher";

const noAnswer = () => new Error("Failed to connect with the device");

describe("isConnectFailure", () => {
  it("recognises only a chip that never answered", () => {
    expect(isConnectFailure(noAnswer())).toBe(true);
    expect(isConnectFailure(new Error("這塊板子是 ESP32-C6，目前只支援 ESP32、ESP32-S2、S3 和 C3"))).toBe(false);
    expect(isConnectFailure("Failed to connect")).toBe(false);
  });
});

describe("retryConnect", () => {
  it("tries again until the chip answers", async () => {
    const seen: number[] = [];
    const result = await retryConnect(
      async (count) => {
        seen.push(count);
        if (count < 3) throw noAnswer();
        return "connected";
      },
      6,
      0,
    );
    expect(result).toBe("connected");
    expect(seen).toEqual([1, 2, 3]);
  });

  it("gives up after the last try with the chip's own error", async () => {
    let calls = 0;
    const attempt = async () => {
      calls++;
      throw noAnswer();
    };
    await expect(retryConnect(attempt, 2, 0)).rejects.toThrow("Failed to connect");
    expect(calls).toBe(2);
  });

  it("stops at once when the chip answered with something unsuitable", async () => {
    let calls = 0;
    const attempt = async () => {
      calls++;
      throw new Error("這塊板子是 ESP32-C6");
    };
    await expect(retryConnect(attempt, 6, 0)).rejects.toThrow("ESP32-C6");
    expect(calls).toBe(1);
  });
});
