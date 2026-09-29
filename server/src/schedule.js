// Official IIITDM Kurnool Bus Timetable & Route Intelligence

const STOPS = {
  campus: {
    id: "campus",
    name: "IIITDM Kurnool",
    shortName: "Campus",
    lat: 15.761093,
    lng: 78.038980,
    isCampus: true,
  },
  gpr: {
    id: "gpr",
    name: "GPREC",
    shortName: "GPREC",
    lat: 15.774741,
    lng: 78.058717,
    isCampus: false,
  },
  nandyal: {
    id: "nandyal",
    name: "Nandyal Check post",
    shortName: "Nandyal X-Roads",
    lat: 15.797984,
    lng: 78.052022,
    isCampus: false,
  },
  ccamp: {
    id: "ccamp",
    name: "C Camp Circle",
    shortName: "C-Camp",
    lat: 15.807002,
    lng: 78.042479,
    isCampus: false,
  },
  rajvihar: {
    id: "rajvihar",
    name: "Raj Vihar",
    shortName: "Raj Vihar",
    lat: 15.828735,
    lng: 78.038423,
    isCampus: false,
  },
};

// Helper to convert "06.30 AM" or "01:15 PM" to total minutes from midnight (0-1439)
function timeToMinutes(timeStr) {
  if (!timeStr) return 0;
  const clean = timeStr.trim().replace(".", ":").toUpperCase();
  const match = clean.match(/^(\d{1,2}):(\d{2})\s*(AM|PM)$/);
  if (!match) return 0;
  let hours = parseInt(match[1], 10);
  const minutes = parseInt(match[2], 10);
  const period = match[3];

  if (period === "PM" && hours < 12) hours += 12;
  if (period === "AM" && hours === 12) hours = 0;

  return hours * 60 + minutes;
}

const WEEKDAY_SCHEDULE = [
  { id: "wd-1", from: "IIITDM Kurnool", to: "C Camp Kurnool", pickup: "06:30 AM", drop: "07:00 AM", fromKey: "campus", toKey: "ccamp" },
  { id: "wd-2", from: "C Camp Circle", to: "IIITDM Kurnool", pickup: "07:15 AM", drop: "08:00 AM", fromKey: "ccamp", toKey: "campus" },
  { id: "wd-3", from: "IIITDM Kurnool", to: "C Camp Circle", pickup: "08:00 AM", drop: "08:30 AM", fromKey: "campus", toKey: "ccamp" },
  { id: "wd-4", from: "C Camp Circle", to: "IIITDM Kurnool", pickup: "08:30 AM", drop: "09:00 AM", fromKey: "ccamp", toKey: "campus" },
  { id: "wd-5", from: "IIITDM Kurnool", to: "GPREC", pickup: "12:30 PM", drop: "12:40 PM", fromKey: "campus", toKey: "gpr" },
  { id: "wd-6", from: "GPREC", to: "IIITDM Kurnool", pickup: "01:15 PM", drop: "01:30 PM", fromKey: "gpr", toKey: "campus" },
  { id: "wd-7", from: "IIITDM Kurnool", to: "Nandyal Check post", pickup: "04:30 PM", drop: "04:50 PM", fromKey: "campus", toKey: "nandyal" },
  { id: "wd-8", from: "Nandyal Check post", to: "IIITDM Kurnool", pickup: "05:00 PM", drop: "05:30 PM", fromKey: "nandyal", toKey: "campus" },
  { id: "wd-9", from: "IIITDM Kurnool", to: "Raj Vihar", pickup: "05:45 PM", drop: "06:30 PM", fromKey: "campus", toKey: "rajvihar" },
  { id: "wd-10", from: "Raj Vihar", to: "IIITDM Kurnool", pickup: "06:30 PM", drop: "07:15 PM", fromKey: "rajvihar", toKey: "campus" },
  { id: "wd-11", from: "IIITDM Kurnool", to: "Raj Vihar", pickup: "07:15 PM", drop: "08:15 PM", fromKey: "campus", toKey: "rajvihar" },
  { id: "wd-12", from: "Raj Vihar", to: "IIITDM Kurnool", pickup: "08:15 PM", drop: "09:15 PM", fromKey: "rajvihar", toKey: "campus" },
].map((t) => ({
  ...t,
  pickupMins: timeToMinutes(t.pickup),
  dropMins: timeToMinutes(t.drop),
  direction: t.fromKey === "campus" ? "from_campus" : "to_campus",
}));

const WEEKEND_SCHEDULE = [
  { id: "we-1", from: "IIITDM Kurnool", to: "C Camp Kurnool", pickup: "06:30 AM", drop: "07:00 AM", fromKey: "campus", toKey: "ccamp" },
  { id: "we-2", from: "C Camp Circle", to: "IIITDM Kurnool", pickup: "07:30 AM", drop: "08:00 AM", fromKey: "ccamp", toKey: "campus" },
  { id: "we-3", from: "IIITDM Kurnool", to: "Nandyal Check post", pickup: "08:00 AM", drop: "08:30 AM", fromKey: "campus", toKey: "nandyal" },
  { id: "we-4", from: "Nandyal Check post", to: "IIITDM Kurnool", pickup: "08:40 AM", drop: "09:10 AM", fromKey: "nandyal", toKey: "campus" },
  { id: "we-5", from: "IIITDM Kurnool", to: "Raj Vihar", pickup: "10:00 AM", drop: "11:00 AM", fromKey: "campus", toKey: "rajvihar" },
  { id: "we-6", from: "Raj Vihar", to: "IIITDM Kurnool", pickup: "11:00 AM", drop: "11:40 AM", fromKey: "rajvihar", toKey: "campus" },
  { id: "we-7", from: "IIITDM Kurnool", to: "Raj Vihar", pickup: "01:30 PM", drop: "02:10 PM", fromKey: "campus", toKey: "rajvihar" },
  { id: "we-8", from: "Raj Vihar", to: "IIITDM Kurnool", pickup: "02:30 PM", drop: "03:00 PM", fromKey: "rajvihar", toKey: "campus" },
  { id: "we-9", from: "IIITDM Kurnool", to: "Raj Vihar", pickup: "04:30 PM", drop: "05:30 PM", fromKey: "campus", toKey: "rajvihar" },
  { id: "we-10", from: "Raj Vihar", to: "IIITDM Kurnool", pickup: "06:00 PM", drop: "06:45 PM", fromKey: "rajvihar", toKey: "campus" },
  { id: "we-11", from: "IIITDM Kurnool", to: "Raj Vihar", pickup: "07:00 PM", drop: "07:45 PM", fromKey: "campus", toKey: "rajvihar" },
  { id: "we-12", from: "Raj Vihar", to: "IIITDM Kurnool", pickup: "10:00 PM", drop: "10:45 PM", fromKey: "rajvihar", toKey: "campus" },
].map((t) => ({
  ...t,
  pickupMins: timeToMinutes(t.pickup),
  dropMins: timeToMinutes(t.drop),
  direction: t.fromKey === "campus" ? "from_campus" : "to_campus",
}));

// Determine whether given date is weekend or weekday (IST timezone aware)
function isWeekendOrHoliday(date = new Date()) {
  // Convert to Indian Standard Time (UTC+5:30)
  const utc = date.getTime() + date.getTimezoneOffset() * 60000;
  const istDate = new Date(utc + 3600000 * 5.5);
  const day = istDate.getDay(); // 0 = Sunday, 6 = Saturday
  return day === 0 || day === 6;
}

function getScheduleForDay(isWeekend) {
  return isWeekend ? WEEKEND_SCHEDULE : WEEKDAY_SCHEDULE;
}

// Calculate current active trip and next upcoming bus
function getStatus(date = new Date()) {
  const utc = date.getTime() + date.getTimezoneOffset() * 60000;
  const istDate = new Date(utc + 3600000 * 5.5);
  const currentMins = istDate.getHours() * 60 + istDate.getMinutes();
  const currentSeconds = istDate.getSeconds();
  const isWeekend = isWeekendOrHoliday(date);
  const schedule = getScheduleForDay(isWeekend);

  let currentTrip = null;
  let nextTrip = null;
  let nextTripDiffMins = null;

  for (const trip of schedule) {
    if (currentMins >= trip.pickupMins && currentMins < trip.dropMins) {
      currentTrip = trip;
    }
    if (trip.pickupMins > currentMins && !nextTrip) {
      nextTrip = trip;
      nextTripDiffMins = trip.pickupMins - currentMins;
    }
  }

  // If no more trips today, next trip is the first trip tomorrow
  let nextDayTrip = false;
  if (!nextTrip && schedule.length > 0) {
    const tomorrowIsWeekend = (istDate.getDay() + 1) % 7 === 0 || (istDate.getDay() + 1) % 7 === 6;
    const tomorrowSchedule = getScheduleForDay(tomorrowIsWeekend);
    nextTrip = tomorrowSchedule[0];
    nextDayTrip = true;
    nextTripDiffMins = (1440 - currentMins) + nextTrip.pickupMins;
  }

  return {
    isWeekend,
    scheduleType: isWeekend ? "Saturday, Sunday & Holidays" : "Monday to Friday",
    currentTimeStr: istDate.toLocaleTimeString("en-IN", { timeZone: "Asia/Kolkata", hour: "2-digit", minute: "2-digit", hour12: true }),
    currentMins,
    currentTrip,
    nextTrip,
    nextTripDiffMins,
    nextDayTrip,
  };
}

module.exports = {
  STOPS,
  WEEKDAY_SCHEDULE,
  WEEKEND_SCHEDULE,
  isWeekendOrHoliday,
  getScheduleForDay,
  getStatus,
};
