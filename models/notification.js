const mongoose = require("mongoose");

const notificationSchema = new mongoose.Schema({
    userId: {
        type: mongoose.Schema.Types.ObjectId,
        ref: 'User',
        required: true
    },
    orderId: {
        type: mongoose.Schema.Types.ObjectId,
        ref: 'Order'
    },
    message: {
        type: String,
        required: true
    },
    type: {
        type: String,
        enum: ['order', 'payment', 'system'],
        default: 'order'
    },
    status: {
        type: String,
        enum: ['unread', 'read'],
        default: 'unread'
    }
}, {
    timestamps: true
});

module.exports = mongoose.model('Notification', notificationSchema);
