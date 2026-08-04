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
  },
  packages: {
    type: [{
      title: String,
      videos: Number,
      mmk: Number,
      bath: Number,
      isPopular: Boolean,
      discount: Number
    }],
    default: [
      { title: 'Package 1', videos: 10, mmk: 7000, bath: 52, isPopular: false, discount: 0 },
      { title: 'Package 2', videos: 30, mmk: 15000, bath: 120, isPopular: true, discount: 0 },
      { title: 'Package 3', videos: 50, mmk: 25000, bath: 190, isPopular: false, discount: 0 }
    ]
  }
}, {
  timestamps: true // Automatically manage createdAt and updatedAt
});

const Settings = mongoose.model('Settings', settingsSchema);

module.exports = Settings;
