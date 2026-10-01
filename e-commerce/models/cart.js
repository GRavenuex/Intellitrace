const mongoose = require("mongoose");

const cartItemSchema = new mongoose.Schema({
    productId: {
        type: mongoose.Schema.Types.ObjectId,
        ref: 'Product',
        required: true
    },
    quantity: {
        type: Number,
        required: true,
        min: 1,
        default: 1
    },
    price: {
        type: Number,
        required: true
    }
});

const cartSchema = new mongoose.Schema({
    userId: {
        type: mongoose.Schema.Types.ObjectId,
        ref: 'User',
        required: true,
        unique: true
    },
    items: [cartItemSchema],
    totalAmount: {
        type: Number,
        default: 0
    }
}, {
    timestamps: true
});

cartSchema.methods.calculateTotal = function() {
    this.totalAmount = this.items.reduce((total, item) => total + (item.price * item.quantity), 0);
    return this.totalAmount;
};

module.exports = mongoose.model('Cart', cartSchema);


// const { Timestamp } = require('mongodb');
// const mongoose = require('mongoose');
// const cartIntemSchema = new mongoose.Schema({
//     productId:{
//         type : mongoose.Schema.Types.ObjectId,
//         ref:'product',
//         required: true
//     },

//     quantity:{
//         type: Number,
//         required:true,
//         min : 1,
//         defalut:1
//     },
//     price :{
//         type:Number,
//         required : true
//     },
// });

// const cartSchema = new mongoose.Schema({
//     userId :{
//         type:mongoose.Schema.Types.ObjectId,
//         ref : 'User',
//         required:true,
//         unique : true
//     },
//     items:[cartIntemSchema],
//     totalAmount :{
//         type :Number,
//         default :0
//     }
// },{ timestamps: true });
// cartSchema.methods.calculateTotal = function(){
// this.totalAmount = this.items.reduce((total, item) => total + (item.price * item.quantity), 0);
//     return this.totalAmount;

// },

// module.exports = mongoose.model('Cart',cartSchema);