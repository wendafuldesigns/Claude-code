# Test it with a friend before you sell it

I built and tested Paper Trail in your Claude account, with a stand-in for Claude's features in a test browser. I could not try it from a fresh account, and I could not try it on a real phone. Those are the parts a buyer will hit first, so this is the test that matters.

## Pick your tester

- Someone who has a Claude account and has never seen the app.
- Not very techy, if you can. They're closest to your buyer.
- Two people is better. One on the desktop app, one on a phone.

Give them the draft zip: `dist/Paper-Trail-Kit-v1.0.0-DRAFT.zip`. Don't help unless they're stuck for more than a few minutes. Write down where they got stuck.

## The checklist

Mark each one pass, fail, or not sure. Write down the exact words on any error.

### 1. Can they publish at all?

- [ ] They ask Claude Code: *Can you publish an artifact?* What did it say?
- [ ] What Claude plan are they on? Which app (desktop, terminal, web)?
- [ ] They unzip, open the folder, type **Set up Paper Trail**. Does Claude get all the way to a link?
- [ ] How many minutes from unzip to link?
- [ ] Did Claude use the exact settings in `CLAUDE.md`? (`db`, `sample` with images, `assets`, `downloads`, `user`)

If this fails, nothing else matters yet. Find out whether it's the plan, the app version, or the instructions.

### 2. Does the page come up working?

- [ ] The link opens and shows the Paper Trail home screen.
- [ ] The **Take a photo** and **Pick photos** buttons are there. If they're replaced by a message about opening from Claude, write it down.
- [ ] The first scan asks them to let Claude read the photo. They say yes.

### 3. The phone (the biggest unknown)

- [ ] They open the link on a phone. In the Claude app, or in a browser? Write which.
- [ ] Does **Take a photo** open the camera? On iPhone? On Android?
- [ ] Does **Pick photos** open the photo library?
- [ ] Does a real receipt get read? How long did it take?
- [ ] Is the text readable and are the buttons easy to tap?

If the camera doesn't open from inside Claude's viewer, tell me. The sales page can't say "take a photo" until we know, and I'd change the home screen.

### 4. Saving and finding

- [ ] Save a record. Close the page. Open it again. Is the record still there?
- [ ] Open it on a second device. Same records?
- [ ] Does the photo show on the record?
- [ ] Search, filter by type, open a record, tap Edit, change something, save.
- [ ] Add a reminder for a booked appointment. Does it show under Coming up?
- [ ] Save as a spreadsheet. Does the file arrive?

### 5. Family

- [ ] In Claude's Share menu, what choices does their plan show?
- [ ] Can they invite someone by email as an Editor?
- [ ] Can the invited person see the records, add a record, and save a photo?

START-HERE.html says "your plan decides what the menu offers." If you find out more, make it specific.

### 6. Updating

- [ ] Change one word in the app file. Replace it in the folder. Type **Update Paper Trail with the new file**.
- [ ] Same link? Records still there?

### 7. Cost

- [ ] Do ten scans. How much of their Claude usage did that take? (Look at the usage meter before and after.)
- [ ] Did they hit any limit?

This tells you what to say on the sales page about "uses your own Claude usage."

### 8. You

- [ ] Read Anthropic's current terms for anything you sell that people build on Claude. Anything that stops you selling it, or needs a line on the sales page?
- [ ] Check Claude's site for which plans include Claude Code and artifacts. Put the answer in START-HERE.html under "What you need."

## After the test

1. Fix START-HERE.html wherever your friend got stuck.
2. Add real screenshots of Claude's own screens (the publish prompt, the link, the permission prompt). I can't see those, so the guide doesn't have them yet.
3. Replace the staged scan screenshots with a real scan from your own Paper Trail. Mine used sample data and a made-up receipt.
4. Tell me what failed and I'll fix the app or the instructions.
