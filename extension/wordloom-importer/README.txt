Wordloom NYT Importer — pilot 0.2.0

INSTALL / UPDATE (Windows Chrome)
1. Extract this ZIP to a permanent folder.
2. Open chrome://extensions in your normal Chrome browser. Enable Developer mode.
3. New install: Load unpacked and choose the folder containing manifest.json.
   Update: replace files in your existing extension folder, then click its Reload button.
4. Pin Wordloom NYT Importer from Chrome's Extensions menu.

DAILY IMPORT
1. Sign in to NYT and Wordloom in this same Chrome profile.
2. Open the extension and click Enable daily import. Allow access to the listed websites.
3. Schedule: 8 am Australia/Sydney, including daylight saving. Enabling after 8 am starts today's import if it has not run.
4. Import now starts a test run without enabling the daily schedule. Allow several minutes for five categories.
5. Chrome must be running on an awake laptop. Missed runs catch up for the current day after Chrome resumes; no historical backfill. Chrome alarms can be delayed.
6. The popup shows the latest result. Pause daily import stops the job and future runs.
7. Open Wordloom on iPhone/iPad using the same account. Refresh the shelf after importing.

Each run tries one new standard article per category: technology, business, world, science and culture. NYT RSS feeds supply links only. Article text is read from ordinary NYT tabs using your existing subscription session. Already saved URLs are skipped. Imported articles save automatically to your private Wordloom shelf. Created tabs close after success; a failed NYT page stays open to inspect. A login, verification, feed or network failure stops the run; use Import now after fixing it. No repeated automatic retries that day.

MANUAL PREVIEW
Open an NYT article, scroll to the end, click Preview in Wordloom. Compare the preview with the original and choose Save & read.

LIMITS
Automatic import is experimental and needs a real run on your laptop. It does not defeat access restrictions or guarantee full-text completeness. Check article endings. Live blogs, interactive pages, unavailable feeds and changed NYT layouts may not work. Reads rendered article paragraphs only, never hidden application data.

PRIVACY
No API keys, passwords, cookie access, analytics or third-party extraction service. Scheduled imports use your existing Wordloom sign-in. Local storage holds schedule, last result and temporary job URLs/tab IDs, not passwords. Manual previews temporarily store article text in Chrome session storage until acknowledged, expired or Chrome closes. Optional website permissions support daily feed discovery, NYT article reading and saving to this exact Wordloom site. The alarms permission schedules local work. Removing the extension stops scheduling.
