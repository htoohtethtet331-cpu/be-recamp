const mongoose = require('mongoose');

const settingsSchema = new mongoose.Schema({
  geminiKey: {
    type: String,
    default: ''
  },
  groqKey: {
    type: String,
    default: ''
  },
  assemblyAiKey: {
    type: String,
    default: ''
  }
}, {
  timestamps: true // Automatically manage createdAt and updatedAt
});

const Settings = mongoose.model('Settings', settingsSchema);

module.exports = Settings;
