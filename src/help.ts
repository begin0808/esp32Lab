import { setupHomeLinks } from "./nav";
import { setupStylePicker } from "./theme";

setupStylePicker(document.getElementById("style-picker") as HTMLSelectElement);
setupHomeLinks();
