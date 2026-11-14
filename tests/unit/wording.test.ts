import { readdirSync, readFileSync } from "node:fs";
import { describe, expect, it } from "vitest";

// The Chinese text is for schools in Taiwan, so it follows Taiwan usage, and place names are written with 臺
// (臺灣, 臺南). Other words keep 台, as in 這台電腦 or 基地台.
const chineseFiles = [
  ...readdirSync(".").filter((name) => name.endsWith(".html") && !name.includes(".en.")),
  ...readdirSync("src").filter((name) => name.endsWith(".ts")).map((name) => `src/${name}`),
  ...readdirSync("src/examples").filter((name) => name.endsWith(".py")).map((name) => `src/examples/${name}`),
  "src/lib/dash.py",
  "README.md",
];

// Words used on the mainland, and what Taiwan says instead.
const MAINLAND_WORDS: Record<string, string> = {
  報錯: "發現錯誤",
  在線: "已連線",
  快捷鍵: "快速鍵",
  點擊: "按一下",
  電平: "準位",
  卡頓: "卡住",
  默認: "預設",
  信息: "訊息",
  網絡: "網路",
  數據線: "傳輸線",
  軟件: "軟體",
  硬件: "硬體",
  傳感器: "感測器",
  芯片: "晶片",
  模塊: "模組",
  程序: "程式",
  視頻: "影片",
  屏幕: "螢幕",
  內存: "記憶體",
  串口: "序列埠",
  端口: "連接埠",
  固件: "韌體",
  舵機: "伺服馬達",
  超聲波: "超音波",
  二維碼: "QR code",
};

const text = (file: string) => {
  const content = readFileSync(file, "utf8");
  // 「還在線上」 is Taiwan's 線上, not the mainland's 在線, and 「回報錯誤」 is 回報 + 錯誤.
  return content.replaceAll("在線上", "").replaceAll("回報錯誤", "");
};

describe("Chinese wording", () => {
  it("writes place names with 臺, such as 臺灣 and 臺南", () => {
    for (const file of chineseFiles) {
      expect(text(file).match(/台(?:灣|北|中|南|東)/g), file).toBeNull();
    }
  });

  it("uses Taiwan's words, not the mainland's", () => {
    for (const file of chineseFiles) {
      const content = text(file);
      const found = Object.keys(MAINLAND_WORDS).filter((word) => content.includes(word)).map((word) => `${word} → ${MAINLAND_WORDS[word]}`);
      expect(found, file).toEqual([]);
    }
  });
});
