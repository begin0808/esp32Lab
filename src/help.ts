import { setupLanguagePicker, translatePage } from "./i18n";
import { setupHomeLinks } from "./nav";
import { setupStats } from "./stats";
import { setupStylePicker } from "./theme";

translatePage();
setupStylePicker(document.getElementById("style-picker") as HTMLSelectElement);
setupLanguagePicker(document.getElementById("language-picker") as HTMLSelectElement);
setupHomeLinks();
setupStats();
