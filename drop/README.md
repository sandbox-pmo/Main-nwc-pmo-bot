# Drop box for the PMO Bot data

**Drop the two Excel files here** - the app updates itself.

1. Open the upload page: <https://github.com/sandbox-pmo/Main-nwc-pmo-bot/upload/main/drop>
2. Drag in **both** files:
   - the **weekly progress file** (the one with the sheet "Portfolio Status"), and
   - the **gates schedule file** (the NorthWest Cluster life-cycle schedule, with "Updated SN" and Gates 1-8).
   Any file names work - the files are recognised by what is inside them.
3. Click **Commit changes**.

## When does the app update?
* Automatically **every hour, 08:00 - 19:00 (Riyadh time), Sunday to Thursday**.
* Or immediately: **Actions** tab -> **Update PMO Bot data** -> **Run workflow**.

## Good to know
* If both a new and an old copy of a file are in this folder, the **newest** one of each kind is used. Older ones can stay or be deleted.
* If a file cannot be read (a column was renamed, an unknown project status appeared ...), the run **fails with a clear message** (Actions tab -> open the red run) and the **app keeps showing the previous data**. Nothing is half-updated.
* The **Data updates** tab in the app shows which files are loaded, when the data was last updated and the data-quality notes.
* Files in this folder are readable by anyone who has the repository address (the repository is public).
* **About the password:** in the app, the **Data updates** tab hides the upload and run buttons behind a password. That keeps the buttons away from people who only use the app. The real protection is GitHub itself: only accounts with **write access** to this repository can add files, so keep the list under Settings -> Collaborators short and turn on two-factor sign-in for those accounts.
* GitHub pauses scheduled runs after 60 days with no activity in the repository; dropping a new file counts as activity. If the Actions tab shows "scheduled workflows disabled", click **Enable**.
