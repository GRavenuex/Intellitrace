const mongoose = require('mongoose');
const Schema = mongoose.Schema;

const paymentSchema = new Schema({
    orderId: { type: Schema.Types.ObjectId, required: true },
    userId: { type: Schema.Types.ObjectId, required: true },
    amount: { type: Number, required: true },
    status: { type: String, enum: ['success', 'failed', 'pending'], required: true },
    transactionId: { type: String, required: true },
    paymentMethod: { type: String, required: true }
}, { timestamps: true });

module.exports = mongoose.model('Payment', paymentSchema);
