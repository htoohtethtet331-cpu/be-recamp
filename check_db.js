const mongoose = require('mongoose');
const Settings = require('./server/models/Settings');

async function check() {
  await mongoose.connect('mongodb+srv://tiktokjaxon709_db_user:vedioRecamp@cluster0.pbowrk9.mongodb.net/?appName=Cluster0');
  const settings = await Settings.findOne();
  console.log("Settings in DB:", settings);
  process.exit(0);
}
check();
