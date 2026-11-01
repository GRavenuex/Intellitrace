const mongoose = require('mongoose');

const Schema = mongoose.Schema;

const cartItemSchema = new Schema({
    productId: {
        type: Schema.Types.ObjectId,
        required: true
    },
    quantity: {
        type: Number,
        required: true,
        min: 1
    },
    price: {
        type: Number,
        required: true
    },
    // We can denormalize product details here to avoid constantly populating from product service
    productName: { type: String },
    productImage: { type: String }
});

const cartSchema = new Schema({
    userId: {
        type: Schema.Types.ObjectId,
        required: true,
        unique: true
    },
    items: [cartItemSchema],
    totalAmount: {
        type: Number,
        required: true,
        default: 0
    }
}, { timestamps: true });

cartSchema.methods.calculateTotal = function() {
    this.totalAmount = this.items.reduce((total, item) => total + (item.price * item.quantity), 0);
};

module.exports = mongoose.model('Cart', cartSchema);
