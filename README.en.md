# ESP32 Lab MicroPython Edition (Beta)

[繁體中文](README.md) | English

Live site: <https://begin0808.github.io/esp32Lab/>

An ESP32 teaching site with nothing to install. Paste MicroPython code in Chrome or Edge on a computer, or Chrome on a Chromebook, and upload it straight to the board over USB. Everything runs in the browser, with no backend server.

The site shows English or Traditional Chinese depending on your browser. You can change the language under "Settings and help".

## Classroom workflow

1. Connect the board with a USB cable, open the site and press "Connect board".
2. On first use, press "Install firmware". After that you only need it again if you have flashed an Arduino program.
3. Press "Gemini prompts" → "Write a new program", fill in what you want the program to do, paste it into Gemini, and paste the generated program back into the editor.
4. Press "Upload and run". The monitor shows the output, and any IP address the program prints becomes a link.

If no serial port appears, check that the USB cable carries data, and install the driver for the board's USB chip (CP2102 or CH340).

## REPL

Press "Stop", then type MicroPython commands in the box below the monitor to see the results straight away. The arrow keys bring back earlier commands, Tab completes names, and a block ending in a colon can span several lines and runs when you press Enter on a blank line. Earlier commands stay only in memory and are never saved in the browser, because they may contain passwords. See the REPL section of the help page for a tutorial.

## Charts and CSV

The monitor can switch to "Chart", which draws output such as `print("temp:", t)` (name and number) or lines of plain numbers as a line chart, showing the last 10 seconds, 30 seconds, 1 minute, 5 minutes or 10 minutes. The recorded data can be exported as CSV, which Excel opens with Chinese names intact. The chart is drawn with the browser's own Canvas and needs no extra package; the code is in `src/plot.ts` (reading and storing values) and `src/plotter.ts` (drawing).

## Gemini prompts

All prompts are in `src/text.ts`: `geminiPrompt` (write a new program), `explainPrompt` (explain the program), `fixErrorPrompt` (fix an error) and `arduinoConvertPrompt` (rewrite Arduino code). Each one hides passwords with `hideWifiSettings` first. The explain prompt numbers the lines; when lines are selected in the editor, `selectedLineRange` works out which, and the prompt asks Gemini to explain only those while still sending the whole program.

## Run (no save)

"Run (no save)" works like mpremote's `run`: it enters raw REPL, soft resets (which skips `main.py`), sends the code and hands the output to the serial monitor, without writing to flash. When the program ends the board sends Ctrl-D and `>`; the site then leaves raw REPL, so the variables stay available in the REPL. F5 also runs the code while a board is connected. The code is in `src/rawrun.ts` (noticing when the program ends) and `src/main.ts`.

## Board files

"Board files" above the editor lists the board's files and free space, moves between folders, opens text files in the editor, downloads and deletes files, uploads files from the computer (they can be dragged into the window), and saves the editor's code under another name, such as your own `mylib.py`. The site holds raw REPL for as long as the window is open, so the program on the board stops. Downloads are checked with SHA-256 too. The code is in `src/files.ts` (paths and parsing) and `src/filemanager.ts` (the window).

## Voice control

Phone and computer browsers only allow the microphone on HTTPS pages, so voice commands do not go directly to the board's `http://` page. Instead, `voice.html` relays them through an MQTT broker:

1. Choose the example "Voice-controlled LED (MQTT)", fill in your Wi-Fi details and upload it. The board's Wi-Fi must reach the internet.
2. Open the voice control page, enter the MQTT topic name shown in the monitor, and press "Connect".
3. Press the voice button, allow the microphone, and say "on", "off" or "blink".

The default broker is the public `broker.emqx.io`. Its messages have no encryption or access control, so it only suits low-risk experiments such as LEDs, and you should not send personal details through it. To use your own broker, fill in its address and login under "Advanced" on the voice control page, and change the matching settings in the program. The voice control page does not save the password.

## Help pages

`help.en.html` (English) and `help.html` (Chinese) list the supported boards and parts, along with safety notes, and follow the chosen style. After testing new hardware, update the status labels and the date on both pages.

## Learning path

The help page's "Learning path" arranges the 26 examples in beginner, intermediate and advanced levels. Each step names what it teaches and has a "Try changing it" task, and each level has a suggested time and a parts list. Example names link to `index.html?example=<file name>`. A help page opened from the editor asks first, then sends the example back to that editor tab, so the board connection is kept. A help page opened on its own opens the editor, which asks instead. The list of examples and their numbers is in `src/catalog.ts`. A new example must also go in the learning path on both help pages, and `npm test` fails if it is missing.

## English and Chinese

- Interface text: pages and code are written in Chinese, and the English is in the dictionary in [src/i18n.ts](src/i18n.ts), keyed by the Chinese text. Text in code uses `t("中文")`, and `npm run build` fails if the dictionary lacks that key. Text in HTML is replaced automatically, and `npm run test:e2e` fails if any is missed.
- Examples: `src/examples/` holds the Chinese versions and `src/examples/en/` the English ones. A change to an example's logic must go in both, and `npm test` fails if they differ.
- READMEs: update `README.md` and `README.en.md` together.
- Help pages: there is one file per language because they are long. `npm run test:e2e` fails if their sections or table rows differ.

## Development

```
npm install
npm run dev        # development server
npm test           # unit tests
npm run test:e2e   # browser tests, using a simulated board
npm run build      # outputs to dist/
```

Uploads use raw REPL's raw-paste mode, as mpremote does, so the board sets the pace. Files go in 2 KB pieces as base64 into a temporary file, which replaces `main.py` only after its SHA-256 matches. Firmware without raw-paste mode falls back to plain raw REPL. The code is in [src/repl.ts](src/repl.ts).

## Deployment

Pushing to the `main` branch on GitHub deploys the site through `.github/workflows/deploy.yml`. The first time, go to Settings → Pages in the repository and set Source to GitHub Actions.

## Changing the firmware version

Put the new `.bin` in `public/firmware/`, then update the URL and SHA-256 of each chip in [src/chips.ts](src/chips.ts).

## Visit statistics

[src/stats.ts](src/stats.ts) records page views on the live site with GoatCounter and shows the editor page's total in the footer. The pages store code that may contain a Wi-Fi password, so they load no third-party JavaScript and send no URL parameters. Local development and tests are not counted.

## Licenses

`public/firmware/` holds unmodified official [MicroPython](https://micropython.org/) firmware, released under the MIT license. See the LICENSE file in that folder.

The Huninn font used by the "Toy blocks" style is licensed under the SIL Open Font License 1.1. See `public/fonts/`.

---

© 2026 [Studio0808](https://begin0808.github.io/studio0808/). All rights reserved.

Suggestions and bug reports are welcome: [email me](https://mail.google.com/mail/?view=cm&fs=1&to=begin0808@gmail.com).
