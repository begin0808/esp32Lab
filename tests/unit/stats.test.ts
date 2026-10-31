import { describe, expect, it } from "vitest";
import { hitUrl } from "../../src/stats";

const VOICE = new URL("https://begin0808.github.io/esp32Lab/voice.html?ch=secret-topic#top");

describe("hitUrl", () => {
  it("sends the path without the query", () => {
    const url = hitUrl(VOICE, "語音控制", "");
    expect(url).not.toContain("secret-topic");
    expect(url).not.toContain("ch=");
    expect(new URL(url).origin).toBe("https://esp32lab.goatcounter.com");
    expect(new URL(url).pathname).toBe("/count");
    expect(new URL(url).searchParams.get("p")).toBe("/esp32Lab/voice.html");
  });

  it("counts both addresses of the editor as one page", () => {
    for (const address of ["https://begin0808.github.io/esp32Lab/", "https://begin0808.github.io/esp32Lab/index.html"]) {
      expect(new URL(hitUrl(new URL(address), "", "")).searchParams.get("p")).toBe("/esp32Lab/");
    }
  });

  it("keeps only the origin of another site", () => {
    const url = new URL(hitUrl(VOICE, "", "https://www.facebook.com/some/post?id=123"));
    expect(url.searchParams.get("r")).toBe("https://www.facebook.com");
  });

  it("does not report moves within this site, or a missing referrer", () => {
    expect(new URL(hitUrl(VOICE, "", "https://begin0808.github.io/esp32Lab/")).searchParams.has("r")).toBe(false);
    expect(new URL(hitUrl(VOICE, "", "")).searchParams.has("r")).toBe(false);
  });
});
