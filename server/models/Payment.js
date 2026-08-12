const mongoose = require('mongoose');

const paymentSchema = new mongoose.Schema({
  userId: { type: mongoose.Schema.Types.ObjectId, ref: 'User', required: true },
  name: { type: String, required: true },
  email: { type: String, required: true },
  phone: { type: String, required: true },
  packageTitle: { type: String, required: true },
  packageMmk: { type: Number, required: true },
  packageVideos: { type: Number, required: true },
  paymentMethod: { type: String, enum: ['kpay', 'wave', 'promptpay'], required: true },
  receiptUrl: { type: String, required: true }, // Path to the uploaded image
  status: { type: String, enum: ['pending', 'approved', 'rejected'], default: 'pending' },
  createdAt: { type: Date, default: Date.now }
});

module.exports = mongoose.model('Payment', paymentSchema);
