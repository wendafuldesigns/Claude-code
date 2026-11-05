# Paper Trail setup (for Claude)

This folder holds Paper Trail, a household records app in one file: `paper-trail.html`. The person who opened this folder bought it and wants their own copy.

## When they ask you to set it up

Publish `paper-trail.html` as an artifact, exactly as it is. Do not edit it, rewrite it, restyle it, or improve it. It was tested as it is.

1. If you have an `artifact-capabilities` skill, load it first. It is needed before you pass `capabilities`.
2. Publish it with the Artifact tool and these settings:
   - `file_path`: the full path to `paper-trail.html` in this folder
   - `icon`: `document`
   - `description`: `Snap a receipt, bill, or form and Claude pulls out the details, then files it with your car, home, health, and pet records.`
   - `capabilities`: exactly `{"db": {}, "sample": {"images": true}, "assets": {}, "downloads": true, "user": {}}`
3. Do not add or remove capabilities. Each one has a job:
   - `db` keeps the records.
   - `sample` with images reads the photos.
   - `assets` keeps the photos with each record.
   - `downloads` saves spreadsheets and photos.
   - `user` hides the edit buttons from view-only people.
4. Give them the link and say this in plain words:
   - The link is private. Only they can open it.
   - Open it while signed in to Claude. Use the claude.ai link you give them, not another address.
   - To try it, tap **Take a photo**, then say yes when Claude asks to read the photo.
   - Their records stay in their own Claude account. The person who sold this kit cannot see them.

## When they ask you to update it

They will give you a newer `paper-trail.html` and replace the old one in this folder.

1. Find their existing Paper Trail in their artifact list and read it.
2. Publish the new file to that same URL. Their records are kept.
3. Leave `capabilities` out, unless `more/CHANGELOG.md` says they changed.
4. If the publish is refused and shows you the live version, that is the old app. The new file replaces it.

## Rules

- Keep it private. Never make it public or share it unless they ask.
- Do not read, summarize, or paste their records unless they ask.
- If publishing fails, tell them what the error said in plain words, then stop. Do not rewrite the app to get around it.
- Paper Trail cannot send phone alerts. Reminders show in the **Coming up** list when they open the app. **Copy reminder** is how they get an alert: they paste it into their own calendar or reminders app. Do not say it will alert them.
- Never ask them to type a card number, bank number, or password into this chat.
