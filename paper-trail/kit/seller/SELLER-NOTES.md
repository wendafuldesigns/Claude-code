# Selling Paper Trail as a kit

## The idea

Each buyer makes their own copy of the app inside their own Claude account. They own it, so they can save records and photos, and they use their own Claude usage for scans.

For you, that means:
- No hosting, no sign-in system, no payment setup beyond your shop.
- You never hold anyone's receipts or tax papers.
- No per-scan cost. Each buyer pays for their own.
- One file to maintain.

## What's in this folder

| Path | What it is |
| --- | --- |
| `../paper-trail.html` | The app. The only copy. Everything else points here. |
| `buyer/` | The files buyers get: `START-HERE.html`, `CLAUDE.md`, `PASTE-THIS-PROMPT.txt`, `TERMS.txt`, `CHANGELOG.md`. |
| `seller/` | You only: these notes, the sales copy, the test checklist, and the Household Hub page (`WHERE-DOES-EACH-PAPER-GO.md`). |
| `screens/` | App screenshots with sample data. |
| `mockups/` | The same screenshots as 3:4 shop images, evergreen with a phone frame. |
| `VERSION` | The version number. |
| `make-kit.sh` | Builds `dist/Paper-Trail-Kit-vX.Y.Z.zip`. |

## Build the zip

```
cd paper-trail/kit
./make-kit.sh --draft     # for testing; the zip name ends in -DRAFT
./make-kit.sh             # the real one
```

You can also just ask Claude Code: "Build the Paper Trail kit." It runs the same script.

The real build refuses to run until every `REVIEW-BEFORE-SELLING` line is gone. There is one now, in `buyer/TERMS.txt`. The script also stops if it finds an em dash, a model name, or an unfilled placeholder in anything a buyer reads.

## Before you sell

1. Run the friend test in `TEST-WITH-A-FRIEND.md`. This is the big one.
2. Paste a few rows into your own Hub Sheet and Doc (section 9 of the friend test).
3. Have someone qualified read `buyer/TERMS.txt`. It's a plain-words draft, not legal advice. Then delete the `REVIEW-BEFORE-SELLING` line.
4. Read Anthropic's current terms for selling things people build on Claude.
5. Check which Claude plans include Claude Code and artifacts. Put it in `START-HERE.html` under "What you need."
6. Replace the staged scan screenshots with a real scan from your own copy.
7. Decide on your price and whether updates are free. `START-HERE.html` says "I'll send you a new file" when there's an update, so only keep that line if you will.
8. Pick where buyers contact you. The guides say wendaful.com.

## Send an update

1. Change `../paper-trail.html`.
2. Raise the number in `VERSION`.
3. Add a new section at the top of `buyer/CHANGELOG.md`. Write the version number out, like `## Version 1.1.0`. Say whether the capabilities changed. If they did, `CLAUDE.md` and `PASTE-THIS-PROMPT.txt` need the new list too.
4. Run `./make-kit.sh`, upload the new zip to your shop, and email your buyers.

An update never touches a buyer's records. Their records live in their own artifact, and publishing to the same link keeps them.

## What's tested and what isn't

**Tested:**
- The app works as a Claude artifact in your account. It's live and has gone through seven versions.
- 264 checks pass in a test browser: scanning, saving, editing, reminders, search, the history cards, exports, dark mode, and view-only mode. Those checks used a stand-in for Claude's features, so they prove the app's logic, not Claude's behavior.
- The publish settings in `CLAUDE.md` are the ones I used for your copy.
- The build script produces the zip and its guards trip when they should.
- **Add to Household Hub:** every column list matches a table in your real Hub Sheet or Doc, in the same order (checked against both files). Another 32 checks cover every paper type, both versions, the copy buttons, and the formula guard.

**Not tested:**
- Setup from a fresh Claude account.
- Which Claude plans a buyer needs.
- The camera and photo picker on a real phone, inside Claude's viewer.
- Sharing with family, and what the Share menu offers on other plans.
- How much Claude usage a scan really uses.
- Anthropic's terms on selling this.
- Pasting a Hub row into the real Sheet and Doc. The Sheet should spread it across the columns. The Doc may put it all in one cell, which is why every box has its own Copy button.

The screenshots show sample data with a made-up receipt, and the scan result came from a stand-in reader.

## Support replies

Short versions you can paste and make your own.

**Claude says it can't publish artifacts**
> Thanks for telling me. Ask Claude: "Can you publish an artifact?" If it says no, your plan or app version may not include it yet. Tell me which Claude plan and app you're using and I'll help you figure out the next step.

**The scan button says Claude wasn't allowed**
> Open the page again. When it asks if Claude can read the photo, say yes. It only asks once per visit.

**My photos won't save**
> Only the person who published Paper Trail, and anyone invited as an Editor, can save photos. Open it from the Claude account that set it up.

**I lost my link**
> In Claude Code, type /artifacts and you'll see your list. You can also look at claude.ai/code/artifacts.

**Can it send me alerts?**
> Not yet. Reminders show under Coming up when you open the app. If you want a buzz on your phone, tap Copy reminder and paste it into your calendar or reminders app.

## If you want to grow it later

The app plan I started (your own sign-in system, cloud storage, subscriptions, and scans you pay for) is parked. Nothing in the kit gets in its way. If the kit sells and people ask for it, we can pick it back up.
