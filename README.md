# PMO Bot - NWC Northwestern Cluster

Weekly project control cards, portfolio dashboards, Stage Gate Review (SGR) flags, Expected Trouble, T&C and Handover views.

* **App:** open the GitHub Pages address of this repository (installable on Windows / phones - see "Install" in the app).
* **New data:** drop the two Excel files in `drop/` (see `drop/README.md`). `.github/workflows/update.yml` rebuilds the app from them every hour, 08:00-19:00 Riyadh time, Sunday-Thursday.
* **Files:** `index.html`, `sw.js`, `manifest.webmanifest` and the icons are the published app (rebuilt automatically). `tools/` holds the code that reads the Excel files and builds the app.
