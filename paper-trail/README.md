# Paper Trail

Scan a receipt, bill, or form. Claude reads it, you check the details, and it gets filed with your other household records.

Example: a photo of an oil change receipt becomes a record with the date, shop, total, mileage, vehicle, work done, VIN, and when the next change is due.

## The home screen

- **App bar:** the Paper Trail mark, today's date, and two round buttons: search (jumps to the search box) and ideas.
- **Scan hero:** a scan illustration, a big **Take a photo** button, **Pick photos** (up to 4 pages of one paper), and **Add by hand**. A floating **Scan** button appears once you scroll past it.
- **Coming up:** anything due in the next 90 days, plus anything overdue, with an **Add reminder** link.
- **Your files:** a tile for each of the 15 types, with an icon, its color, and how many papers it holds. Tap a tile with papers to filter the list below (tap again to clear). Tap an empty tile to see ideas for that type. Once you have records, the six biggest types show first and **Show all** reveals the rest. View-only people see only the types that have papers.
- **Quick add ideas** and **Your papers** (search, type chips, the list) follow.

The scan illustration, the logo, and every icon are inline SVG in the file, so nothing loads from outside. The icons are one table (`ICONS`) near the home screen code.

## Reminders and appointments

A paper you filed and an appointment you already booked are different things, so the add form has a switch at the top: **I did this** or **Coming up**.

- **Coming up** drops the fields that only make sense for a paper (date, total, mileage, work done) and asks for **What is it**, **When** (a date and an optional time), **Where**, and **Who it was for**. The record has no paper date, and it appears under **Coming up** on the home screen. Saving needs a date.
- The switch shows on every new record you start by hand, on every idea (so "Dental cleaning" can be a booked visit instead of a past one), and on a scanned appointment card. Flipping an idea to Coming up clears the guessed date and the usual work; flipping back restores them.
- **Add a reminder** is in the scan card and in the Coming up header. It starts a blank reminder.
- A reminder's summary leads with **When**, with the time and a countdown, then **Where** and **Who**. **Mark done** clears it. **It happened: add details** opens the paper form with the date filled in, so the same record can become a normal one after the visit.
- **Copy reminder** copies text you can paste into your own calendar or reminders app, for example "Dentist appointment (Maya)", the day and time, and the place.
- Times show in 12-hour form (2:30 PM). Same-day items sort by time. A time that is not a real time is ignored.
- A scanned appointment card or confirmation fills in the date and time, and does not become a past service.

Paper Trail does not send alerts. Reminders show up under Coming up when you open the app (anything in the next 90 days, plus anything overdue), and the form says so. For an alert on your phone, use Copy reminder and paste it into your calendar.

## Quick add ideas

Not sure what is worth filing? The home screen has a **Quick add ideas** row: Oil change, HVAC filter change, Vet checkup, Dental cleaning, Annual physical, Passport, Appliance warranty, Permission slip, Electric bill. **See all ideas** opens 66 ideas in 14 groups (Car, Home, Pet, School, Health, Dental, Bills, Insurance, Banking, Taxes, Legal and ID, Travel, Purchases, Business), with filter chips and a color for each type.

Tapping an idea opens the add form already filled in with the basics:

- the type and title
- today's date
- the work that usually goes with it ("Replace air filter")
- a blank row for each detail worth keeping ("Filter size", "Model number")
- a suggested reminder when the thing repeats (3 months for an HVAC filter, a year for a vet checkup), which then shows up under Coming up
- a short tip when one helps ("The size is printed on the edge of your old filter")

Nothing is saved until you check it and tap **Save record**. Detail rows you leave blank are not saved. If you have exactly one car or one pet on file, the name is filled in and the form says so. Discard from an idea takes you back to where you started. The list is collapsed once you have six or more records, and it stays open or closed the way you leave it. View-only people do not see it.

The ideas live in one table near the top of the file (`IDEAS`). Each row is a type, a title, a reminder in months (0 for none), the reminder note, the work lines, the detail labels, and an optional tip, so adding an idea is one line.

## Opening a record

Tapping a record opens a **summary**: the photo, the total, who and what it was for, the work done, other details, what is due next, and notes. Nothing on it can be changed by accident.

- **Edit** opens the form, filled in. Change anything, add a detail, clear a field, or delete a detail row, then **Save record**. Saving brings you back to the summary with the new info.
- Anything that is missing says **Not filled in** with an **Add** link. Tapping Add opens the form with the cursor already in that field.
- **Cancel** or **Back** from the form asks first if you changed something, and goes straight back if you did not.
- **Mark done** clears a next-due reminder. **Copy** next to a detail (a VIN, a policy number) copies just that value. **Copy summary** copies the whole record.
- **Back** from the summary returns to the same spot in the list.
- People with view-only access see the same summary without Edit, Add, or Mark done.
- If someone else changes or deletes the record while you are looking at it, the summary updates.
- **Delete** lives in the edit form, behind a confirmation.

## Finding and grabbing things

- **Search** matches the title, shop, name, work done, VIN and other details, notes, and dates. Type more than one word to narrow it down ("highlander brake").
- **Type chips** (Car, Home, Health, Pet, and so on) filter the list. Pick a type and a row of names appears under it: one car, one person, one pet. Tap a name for a history card with the latest mileage, VIN, plate, total spent, and what is due next.
- **Copy history** puts a car's (or person's, or pet's) full history on the clipboard as plain text, newest first. If the view blocks the clipboard, the text opens in a box, already selected.
- **Copy summary** (on a record's summary) copies that one record.
- **Photos** show as a small thumbnail on each card. Open a record to see them, tap one to view it full screen, or tap **Save photo** on the summary to download it.
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
