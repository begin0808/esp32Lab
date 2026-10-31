import { setupHomeLinks } from "./nav";
import { setupStats } from "./stats";
import { setupStylePicker } from "./theme";

setupStylePicker(document.getElementById("style-picker") as HTMLSelectElement);
setupHomeLinks();
setupStats();
