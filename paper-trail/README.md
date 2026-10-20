# Paper Trail

Scan a receipt, bill, or form. Claude reads it, you check the details, and it gets filed with your other household records.

Example: a photo of an oil change receipt becomes a record with the date, shop, total, mileage, vehicle, work done, VIN, and when the next change is due.

## Finding and grabbing things

- **Search** matches the title, shop, name, work done, VIN and other details, notes, and dates. Type more than one word to narrow it down ("highlander brake").
- **Type chips** (Car, Home, Health, Pet, and so on) filter the list. Pick a type and a row of names appears under it: one car, one person, one pet. Tap a name for a history card with the latest mileage, VIN, plate, total spent, and what is due next.
- **Copy history** puts a car's (or person's, or pet's) full history on the clipboard as plain text, newest first. If the view blocks the clipboard, the text opens in a box, already selected.
- **Copy summary** (inside any record) copies that one record.
- **Photos** show as a small thumbnail on each card. Open a record to see them, tap one to view it full screen, or tap **Save photo** to download it.
- **Save as a spreadsheet** exports whatever you are looking at as a CSV: everything, one type, one search, or one car.
- **Coming up** lists anything with a next-due date in the next 90 days, plus anything overdue. Tap **Done** when it is handled.
- **Remind me in 3 months, 6 months, or 1 year** (in the Next due section) sets the date from the paper's date. It is meant for vet, dentist, and doctor visits that do not print a next date.

## How it works

`paper-trail.html` is a single file that runs as a Claude artifact. It uses artifact capabilities, so it needs the Claude viewer and will not do much if you open the file in a plain browser.

| Capability | What it does here |
| --- | --- |
| `sample` (with images) | Sends the photo to Claude and gets back the fields as JSON. No API key needed. |
| `db` | Stores the records in a `records` collection. |
| `assets` | Keeps the photo with its record. Only people who can edit the artifact can store photos. |
| `downloads` | Saves spreadsheets and photos. |
| `user` | Hides the add and edit controls from view-only people. |

Nothing is saved until you check the details and tap Save. Fields Claude was unsure about are highlighted.

Names stay consistent: the names you already use are sent along with each scan so Claude writes "2019 Toyota Highlander" the same way every time. Names are also matched ignoring capital letters and extra spaces, so close variants group together.

## Record types

Fifteen types, each with its own color:

| Group | Types |
| --- | --- |
| Car and travel | Car, Travel |
| Home and family | Home, Pet, School and activities |
| Health | Health, Dental and vision |
| Money and papers | Bills and utilities, Insurance, Banking and loans, Taxes, Legal and ID |
| Shopping and work | Purchases and warranties, Business |
| Other | Other |

Each type relabels the form (a car asks for the vehicle and mileage, a pet for the pet's name, and so on). The list lives in one place in the file (`CATS`), and the prompt that tells Claude how to sort a paper is built from it, so adding a type means adding one line there plus one color line in the CSS.

## Colors

Each type has one hue. Chips, a stripe on each card, tags, the history card, and the top of the edit screen all use it. The lightness comes from a few theme tokens, so light and dark mode each get readable text. Every type's chip, selected chip, and tag was measured at 4.5 to 1 contrast or better in both themes, and no two types share a color. Color is never the only cue. Every chip, tag, and card also says the type in words.

Existing records keep their type. Anything saved under the old "Bills and insurance" type now shows as Bills and utilities. Open a record and change its type to move it to Insurance.

## Updating

Publish the same file to the same artifact URL to keep the saved records. The records live in the artifact's database, not in this file, so republishing does not touch them.

## Known limits

- Photos and screenshots only. PDFs are not read yet.
- Up to 4 photos per paper, read together as pages of one paper.
- Photos are downsized before they are read, so hold the camera close to the paper.
- The prompt tells Claude to leave out full card, bank, and Social Security numbers. Still, check each record before saving.
- Renaming a car (or person or pet) across all its records is not built yet. Fix a name inside a record, and the other records keep theirs.
