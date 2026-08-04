const fs = require('fs');

let content = fs.readFileSync('server/index.js', 'utf8');

// 1. Change sequelize import to connectDB import
content = content.replace(
  "const sequelize = require('./config/db');",
  "const connectDB = require('./config/db');"
);

// 2. Change Database Sync to Database Connect
content = content.replace(
  "sequelize.sync().then(() => {",
  "connectDB().then(() => {"
);

// 3. Update /api/admin/keys GET endpoint
content = content.replace(
  `app.get('/api/admin/keys', async (req, res) => {
  try {
    let settings = await Settings.findOne();
    if (!settings) {
      settings = await Settings.create({});
    }
    res.json(settings);
  } catch (error) {
    res.status(500).json({ error: 'Failed to fetch settings' });
  }
});`,
  `app.get('/api/admin/keys', async (req, res) => {
  try {
    let settings = await Settings.findOne();
    if (!settings) {
      settings = await Settings.create({});
    }
    res.json(settings);
  } catch (error) {
    res.status(500).json({ error: 'Failed to fetch settings' });
  }
});`
);
// (Actually GET endpoint logic is compatible between Sequelize and Mongoose since both use findOne and create)

// 4. Update /api/admin/keys POST endpoint
content = content.replace(
  `app.post('/api/admin/keys', async (req, res) => {
  try {
    const { geminiKey, groqKey, assemblyAiKey } = req.body;
    let settings = await Settings.findOne();
    if (!settings) {
      settings = await Settings.create({ geminiKey, groqKey, assemblyAiKey });
    } else {
      await settings.update({ geminiKey, groqKey, assemblyAiKey });
    }
    res.json(settings);
  } catch (error) {
    res.status(500).json({ error: 'Failed to update settings' });
  }
});`,
  `app.post('/api/admin/keys', async (req, res) => {
  try {
    const { geminiKey, groqKey, assemblyAiKey } = req.body;
    let settings = await Settings.findOne();
    if (!settings) {
      settings = await Settings.create({ geminiKey, groqKey, assemblyAiKey });
    } else {
      settings.geminiKey = geminiKey;
      settings.groqKey = groqKey;
      settings.assemblyAiKey = assemblyAiKey;
      await settings.save();
    }
    res.json(settings);
  } catch (error) {
    console.error('Save error:', error);
    res.status(500).json({ error: 'Failed to update settings' });
  }
});`
);

fs.writeFileSync('server/index.js', content);
console.log('server/index.js updated for Mongoose!');
