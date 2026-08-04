const mongoose = require('mongoose');

const userSchema = new mongoose.Schema({
  name: {
    type: String,
    required: true
  },
  email: {
    type: String,
    required: true,
    unique: true
  },
  picture: {
    type: String,
    default: ''
  },
  role: {
    type: String,
    enum: ['free', 'premium', 'admin', 'restrict'],
    default: 'free' // First user logic will be handled in the route
  },
  videoLimit: {
    type: Number,
    default: 0
  },
  freeVideosUsed: {
    type: Number,
    default: 0
  },
  lastFreeVideoDate: {
    type: Date,
    default: null
  }
}, {
  timestamps: true
});

const User = mongoose.model('User', userSchema);
module.exports = User;
