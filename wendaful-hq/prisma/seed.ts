import { db } from "../src/lib/db";

function daysFromToday(offset: number) {
  const d = new Date();
  d.setHours(9, 0, 0, 0);
  d.setDate(d.getDate() + offset);
  return d;
}

function atTime(offset: number, hour: number, minute: number) {
  const d = new Date();
  d.setHours(hour, minute, 0, 0);
  d.setDate(d.getDate() + offset);
  return d;
}

function dayOffset(offset: number) {
  const d = new Date();
  d.setHours(0, 0, 0, 0);
  d.setDate(d.getDate() + offset);
  return d;
}

async function main() {
  console.log("Clearing existing data...");
  await db.habitCheckin.deleteMany();
  await db.habit.deleteMany();
  await db.priority.deleteMany();
  await db.calendarEvent.deleteMany();
  await db.contentPost.deleteMany();
  await db.revenueEntry.deleteMany();
  await db.clientTask.deleteMany();
  await db.goal.deleteMany();
  await db.creativeProject.deleteMany();

  console.log("Seeding priorities...");
  await db.priority.createMany({
    data: [
      { date: daysFromToday(0), text: "Film the fall content batch", order: 0 },
      { date: daysFromToday(0), text: "Reply to SCMC about the September calendar", order: 1 },
      { date: daysFromToday(0), text: "Send Planning Lab welcome emails", order: 2 },
      { date: daysFromToday(-1), text: "Edit the ClickUp workspace tour video", order: 0, done: true },
      { date: daysFromToday(-1), text: "Pay quarterly taxes", order: 1, done: true },
      { date: daysFromToday(-1), text: "Grocery run", order: 2, done: true },
      { date: daysFromToday(-2), text: "Record voiceover for the TikTok series", order: 0, done: true },
      { date: daysFromToday(-2), text: "Client check-in call with SCMC", order: 1, done: true },
      { date: daysFromToday(-2), text: "Water the plants (lol)", order: 2, done: true },
    ],
  });

  console.log("Seeding calendar events...");
  await db.calendarEvent.createMany({
    data: [
      { title: "Film fall content batch", date: atTime(0, 9, 0), startTime: "9:00 AM", endTime: "11:00 AM" },
      { title: "SCMC check-in call", date: atTime(0, 13, 0), startTime: "1:00 PM", endTime: "1:30 PM" },
      { title: "Yoga", date: atTime(0, 18, 0), startTime: "6:00 PM", endTime: "6:45 PM" },
      { title: "Edit ClickUp tour video", date: atTime(-1, 10, 0), startTime: "10:00 AM", endTime: "12:00 PM" },
      { title: "SCMC client call", date: atTime(-2, 11, 0), startTime: "11:00 AM", endTime: "11:30 AM" },
      { title: "Farmers market", date: atTime(1, 9, 0), startTime: "9:00 AM", endTime: "10:00 AM" },
      { title: "Batch cook for the week", date: atTime(1, 14, 0), startTime: "2:00 PM", endTime: "3:30 PM" },
      { title: "Plan next week's content", date: atTime(2, 16, 0), startTime: "4:00 PM", endTime: "5:00 PM" },
      { title: "Planning Lab team call", date: atTime(3, 10, 0), startTime: "10:00 AM", endTime: "10:30 AM" },
      { title: "Dentist", date: atTime(3, 15, 0), startTime: "3:00 PM", endTime: "4:00 PM" },
      { title: "Film TikTok batch 2", date: atTime(4, 9, 0), startTime: "9:00 AM", endTime: "10:30 AM" },
    ],
  });

  console.log("Seeding content pipeline...");
  await db.contentPost.createMany({
    data: [
      { title: "5 ClickUp templates that save me hours", platform: "youtube", stage: "editing", dueDate: daysFromToday(3) },
      { title: "Fall content batch: hook ideas", platform: "tiktok", stage: "idea", dueDate: daysFromToday(0) },
      { title: "Planning Lab behind the scenes", platform: "instagram", stage: "scripting", dueDate: daysFromToday(2) },
      { title: "How I plan my week in ClickUp", platform: "youtube", stage: "posted", postedDate: daysFromToday(-5) },
      { title: "Quick tip: color code your calendar", platform: "tiktok", stage: "posted", postedDate: daysFromToday(-3) },
      { title: "Fall planner flip through", platform: "instagram", stage: "scheduled", dueDate: daysFromToday(1) },
      { title: "Client work Q&A", platform: "youtube", stage: "idea" },
      { title: "Morning routine reset", platform: "tiktok", stage: "filming", dueDate: daysFromToday(1) },
      { title: "Planning Lab September theme reveal", platform: "instagram", stage: "idea" },
      { title: "ClickUp affiliate haul: fall templates", platform: "youtube", stage: "scripting", dueDate: daysFromToday(5) },
      { title: "3 habits that actually stuck", platform: "tiktok", stage: "posted", postedDate: daysFromToday(-8) },
      { title: "SCMC case study teaser", platform: "instagram", stage: "editing", dueDate: daysFromToday(2) },
    ],
  });

  console.log("Seeding habits...");
  const HABIT_HISTORY_DAYS = 29;
  const habitDefs = [
    // recent 3-day miss (plus today, still open) so the flag has something to show
    { name: "Workout", icon: "💪", order: 0, misses: [0, -1, -2, -3] },
    { name: "Read 20 mins", icon: "📖", order: 1, misses: [0, -18, -25] },
    {
      name: "No phone before 9am or after 9pm",
      icon: "📵",
      order: 2,
      misses: [-29, -27, -24, -22, -19, -17, -14, -12, -9, -7],
    },
    { name: "Drink 2L water", icon: "💧", order: 3, misses: [-20] },
    { name: "Journal", icon: "📝", order: 4, misses: [0, -6, -13, -15, -21, -28] },
    { name: "No alcohol", icon: "🚫", order: 5, misses: [-23] },
  ];

  for (const h of habitDefs) {
    const habit = await db.habit.create({
      data: { name: h.name, icon: h.icon, order: h.order, createdAt: daysFromToday(-45) },
    });
    const checkins = [];
    for (let offset = -HABIT_HISTORY_DAYS; offset <= 0; offset++) {
      if (!h.misses.includes(offset)) {
        checkins.push({ habitId: habit.id, date: dayOffset(offset), done: true });
      }
    }
    await db.habitCheckin.createMany({ data: checkins });
  }

  console.log("Seeding revenue...");
  await db.revenueEntry.createMany({
    data: [
      { source: "planning_lab", description: "38 members renewed", amount: 1247, date: daysFromToday(-13) },
      { source: "clickup_affiliate", description: "August commission payout", amount: 312.4, date: daysFromToday(-11) },
      { source: "youtube_ads", description: "July AdSense payout", amount: 186.22, date: daysFromToday(-9) },
      { source: "sponsorship", description: "Notion partnership post", amount: 800, date: daysFromToday(-7), status: "pending" },
      { source: "planning_lab", description: "6 new members", amount: 174, date: daysFromToday(-4) },
      { source: "clickup_affiliate", description: "mid-month bump", amount: 89.1, date: daysFromToday(-2) },
      { source: "youtube_ads", description: "early August estimate", amount: 42, date: daysFromToday(0), status: "pending" },
      { source: "planning_lab", description: "monthly renewals", amount: 1180, date: daysFromToday(-44) },
      { source: "sponsorship", description: "Skillshare class promo", amount: 650, date: daysFromToday(-36) },
      { source: "clickup_affiliate", description: "July commission payout", amount: 265, date: daysFromToday(-30) },
      { source: "youtube_ads", description: "June AdSense payout", amount: 203, date: daysFromToday(-17) },
    ],
  });

  console.log("Seeding client work...");
  await db.clientTask.createMany({
    data: [
      { title: "Write September content calendar", status: "in_progress", hours: 3, dueDate: daysFromToday(3) },
      { title: "Design carousel templates for IG", status: "todo", dueDate: daysFromToday(5) },
      { title: "Record client update Loom", status: "done", hours: 1, dueDate: daysFromToday(-1) },
      { title: "Review Q3 analytics report", status: "todo", dueDate: daysFromToday(-1) },
      { title: "Onboard new social intern to ClickUp", status: "todo", dueDate: daysFromToday(10) },
      { title: "August invoicing", status: "done", hours: 2, dueDate: daysFromToday(-2) },
    ],
  });

  console.log("Seeding goals...");
  await db.goal.createMany({
    data: [
      { title: "Hit 1,000 email subscribers", timeframe: "monthly", progress: 68, targetDate: daysFromToday(17) },
      { title: "Post consistently, 4x a week everywhere", timeframe: "monthly", progress: 80, targetDate: daysFromToday(17) },
      { title: "Launch the Fall Planner Bundle", timeframe: "quarterly", progress: 40, targetDate: daysFromToday(47) },
      { title: "Grow Planning Lab to 500 members", timeframe: "yearly", progress: 55, targetDate: daysFromToday(139) },
      { title: "Pay off the studio equipment", timeframe: "yearly", progress: 30, targetDate: daysFromToday(139) },
    ],
  });

  console.log("Seeding creative projects...");
  await db.creativeProject.createMany({
    data: [
      { title: "Fall Planner Bundle launch", category: "product_launch", status: "in_progress", deadline: daysFromToday(32), description: "New physical + digital bundle for fall planning season." },
      { title: "31 Days of Planning Tips series", category: "content_series", status: "planning", deadline: daysFromToday(18), description: "Daily tip videos across TikTok and Instagram for September." },
      { title: "Planning Lab September refresh", category: "other", status: "review", deadline: daysFromToday(11), description: "New monthly theme, templates, and challenge for members." },
      { title: "2027 Planner design", category: "product_launch", status: "planning", deadline: daysFromToday(79), description: "First round of layout concepts for next year's paper planner." },
    ],
  });

  console.log("Done seeding.");
}

main()
  .then(async () => {
    await db.$disconnect();
  })
  .catch(async (e) => {
    console.error(e);
    await db.$disconnect();
    process.exit(1);
  });
