const mongoose = require('mongoose');
const Schema = mongoose.Schema;

const orderItemSchema = new Schema({
    productId: { type: Schema.Types.ObjectId, required: true },
    name: { type: String, required: true },
    image: { type: String },
    quantity: { type: Number, required: true },
    price: { type: Number, required: true }
});

const orderSchema = new Schema({
    userId: { type: Schema.Types.ObjectId, required: true, ref: 'User' },
    items: [orderItemSchema],
    totalAmount: { type: Number, required: true },
    shippingAddress: {
        fullName: { type: String, required: true },
        address: { type: String, required: true },
        city: { type: String, required: true },
        state: { type: String, required: true },
        pincode: { type: String, required: true },
        phone: { type: String, required: true }
    },
    paymentStatus: { type: String, enum: ['pending', 'success', 'failed'], default: 'pending' },
    orderStatus: { type: String, enum: ['pending', 'confirmed', 'shipped', 'delivered', 'cancelled'], default: 'pending' }
}, { timestamps: true });

module.exports = mongoose.model('Order', orderSchema);
