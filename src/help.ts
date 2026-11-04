import { setupLanguagePicker, t, translatePage } from "./i18n";
import { setupExampleLinks, setupHomeLinks } from "./nav";
import { setupStats } from "./stats";
import { setupStylePicker } from "./theme";

translatePage();
setupStylePicker(document.getElementById("style-picker") as HTMLSelectElement);
setupLanguagePicker(document.getElementById("language-picker") as HTMLSelectElement);
setupHomeLinks();
setupExampleLinks((name) => confirm(t("要用「{name}」取代目前的程式嗎？", { name })));
setupStats();
