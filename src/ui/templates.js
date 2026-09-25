/** Starter plans. Real-world shaped, English + Hinglish. */
export const DAY_TEMPLATES = [
  {
    id: 'v1',
    name: 'The original',
    desc: 'The kypzer-table v1 example — still works',
    text: '3:45pm : come to room\n3:50 to 5 pm : work\n5:00 to 7 pm : call to wife',
  },
  {
    id: 'student',
    name: 'Exam day (student)',
    desc: 'Mock test, revision blocks, breaks and sleep',
    text: '6:30am wake up\n7 to 8 revision : physics formulas\n8 breakfast\n9 to 12:30 mock test\nlunch at 1 for 45m\n2:30 to 4:30 padhai : maths\nevening walk 30m\n6 to 8 chemistry revision\n8:30 dinner\n9 to 10 light reading\n10:30pm to 6:30am sleep',
  },
  {
    id: 'hinglish',
    name: 'Hinglish din',
    desc: 'subah, shaam, sadhe, baje — sab chalega',
    text: 'subah 6 baje uthna\nsava 6 se 7 baje tak gym\n8 baje nashta\n9 se 1 baje tak kaam\ndopahar 1 baje khana\n2 se 5 baje tak office\nshaam 6 baje chai\n7 baje mummy ko call\nraat 9 baje dinner\nraat 11 baje so jaana',
  },
  {
    id: 'dev',
    name: 'Deep-work developer',
    desc: 'Fixed meetings + flexible tasks the engine places',
    text: '7:30 wake up\n8 to 8:30 plan the day\n8:30 to 11 deep work : feature build\nstandup at 11 for 15m\nlunch at 1 for 45m\ncode review 1h\nemails 30m\nreport 1h before 6pm !\ngym 6 to 7pm\ndinner 8pm\nside project 1h\n11pm to 7am sleep',
  },
  {
    id: 'weekend',
    name: 'Weekend reset',
    desc: 'Chores, family, fun — no alarms',
    text: '9am wake up slowly\nbreakfast with family 10 to 11\nlaundry 1h\ngroceries 45m\ncricket 4 to 6pm\nmovie night 8 to 10:30pm',
  },
];

export const WEEK_TEMPLATES = [
  {
    id: 'college',
    name: 'College timetable',
    desc: 'Classes, labs, clubs, tuition',
    text: 'mon-fri 9 to 10am : maths\nmon wed fri 10:15 to 11:15 : physics\ntue thu 10:15 to 12:15 : chemistry lab\nmon-fri 1 to 2pm : lunch\nmon wed 2 to 4pm : coding club\ntue thu 4 to 5:30pm : tuition\nsat 10am to 1pm : cricket\ndaily 6am : run 30m',
  },
  {
    id: 'work',
    name: 'Office week',
    desc: 'Standups, gym days, weekly review',
    text: 'weekdays 9:30 to 9:45am : standup\nmon wed fri 7 to 8am : gym\ntue thu 7 to 7:40am : yoga\nfri 4 to 5pm : weekly review\nsun 6 to 7pm : plan next week',
  },
];
