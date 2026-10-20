# Paper Trail

Scan a receipt, bill, or form. Claude reads it, you check the details, and it gets filed with your other household records.

Example: a photo of an oil change receipt becomes a record with the date, shop, total, mileage, vehicle, work done, VIN, and when the next change is due.

## How it works

`paper-trail.html` is a single file that runs as a Claude artifact. It uses four artifact capabilities, so it needs the Claude viewer and will not do much if you open the file in a plain browser.

| Capability | What it does here |
| --- | --- |
| `sample` (with images) | Sends the photo to Claude and gets back the fields as JSON. No API key needed. |
| `db` | Stores the records in a `records` collection. |
| `assets` | Keeps the photo with its record. Only people who can edit the artifact can store photos. |
| `downloads` | Saves all records as a CSV spreadsheet. |
| `user` | Hides the add and edit controls from view-only people. |

Nothing is saved until you check the details and tap Save. Fields Claude was unsure about are highlighted.

## Record types

Car, Home, Health, Pet, School, Bills and insurance, Purchases and warranties, Other. Each type relabels the form. Car records also get a mileage field.

## Updating

Publish the same file to the same artifact URL to keep the saved records. The records live in the artifact's database, not in this file, so republishing does not touch them.

## Known limits

- Photos and screenshots only. PDFs are not read yet.
- Up to 4 photos per paper, read together as pages of one paper.
- Photos are downsized before they are read, so hold the camera close to the paper.
- The prompt tells Claude to leave out full card, bank, and Social Security numbers. Still, check each record before saving.
