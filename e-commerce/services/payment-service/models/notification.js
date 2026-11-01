const mongoose = require('mongoose');
const Schema = mongoose.Schema;

const notificationSchema = new Schema({
    userId: { type: Schema.Types.ObjectId, required: true },
    orderId: { type: Schema.Types.ObjectId },
    message: { type: String, required: true },
    type: { type: String, enum: ['order', 'payment', 'system'], required: true },
    status: { type: String, enum: ['unread', 'read'], default: 'unread' }
}, { timestamps: true });

module.exports = mongoose.model('Notification', notificationSchema);
