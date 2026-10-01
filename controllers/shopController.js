const Product = require('../models/product');
const Cart = require('../models/cart');
const Order = require('../models/order');
const Payment = require('../models/payment');
const Notification = require('../models/notification');
const logger = require('../middleware/logger');
const product = require('../models/product');
const metrics = require('../utils/metrics');


exports.getHome = async (req, res, next) => {
    try {
        const featuredProducts = await Product.find().sort({ rating: -1 }).limit(8);
        const categories = ['Laptops', 'Smartphones', 'Headphones', 'Keyboards', 'Mice', 'Monitors', 'Accessories'];
        
        res.render('store/index', {
            pageTitle: 'IntelliShop - Modern Tech Store',
            currentPage: 'home',
            featuredProducts,
            categories,
            isLoggedIn: req.isLoggedIn,
            user: req.session.user
        });
    } catch (err) {
        logger.error("Error fetching home page products", { error: err.message });
        next(err);
    }
};



// Product Catalog (with Search, Filter & Sort)
exports.getProducts = async (req, res, next) => {
    try {
        const search = req.query.search || '';
        const category = req.query.category || '';
        const minPrice = parseFloat(req.query.minPrice) || 0;
        const maxPrice = parseFloat(req.query.maxPrice) || Infinity;
        const sort = req.query.sort || 'newest';

        let query = {};

        if (search) {
            query.name = { $regex: search, $options: 'i' };
        }
        if (category) {
            query.category = category;
        }
        if (minPrice > 0 || maxPrice < Infinity) {
            query.price = { $gte: minPrice, $lte: maxPrice };
        }

        let sortOption = { createdAt: -1 };
        if (sort === 'price-asc') sortOption = { price: 1 };
        if (sort === 'price-desc') sortOption = { price: -1 };
        if (sort === 'rating') sortOption = { rating: -1 };

        const products = await Product.find(query).sort(sortOption);
        const categories = ['Laptops', 'Smartphones', 'Headphones', 'Keyboards', 'Mice', 'Monitors', 'Accessories'];

        logger.info("Products fetched", { 
            requestId: req.requestId, 
            count: products.length 
        });

        res.render('store/products', {
            pageTitle: 'Browse Products - IntelliShop',
            currentPage: 'products',
            products,
            categories,
            selectedCategory: category,
            searchQuery: search,
            selectedSort: sort,
            minPrice: req.query.minPrice || '',
            maxPrice: req.query.maxPrice || '',
            isLoggedIn: req.isLoggedIn,
            user: req.session.user
        });
    } catch (err) {
        logger.error("Product query failure", { 
            requestId: req.requestId, 
            error: err.message, 
            stack: err.stack 
        });
        next(err);
    }
};

// Product Details
exports.getProductDetails = async(req , res ,  next)=>{
    try{
        const productId = req.params.id;
        const product  = await Product.findById(productId);
        if(!product){
            logger.warn("Product not found", {
                requestId: req.requestId,
                productId
            });
            return res.redirect('/products');
        }
        const relatedProducts = await Product.find({
            category:product.category,
            _id:{$ne:product._id}

        }).limit(4);

        logger.info("Product fetched", { 
            requestId: req.requestId, 
            productId 
        });
        res.render('store/product-detail',{
            pageTitle: `${product.name} - intellishop`,
            currentPage  :'products',
            product,
            relatedProducts,
            isLoggedIn:res.isLoggedIn,
            user: req.session.user
        });

    }catch(err){
        logger.error("Product query failure", {
            requestId: req.requestId,
            productId: req.params.id,
            error: err.message,
            stack: err.stack
        });
        next(err);

    }
};


// Cart View
exports.getCart = async(req ,res , next )=> {
    try{
        const userId = req.session.user.id;
        let cart =  await Cart.findOne({userId}).populate('items.productId');

        if(!cart){
            cart  = new Cart({userId , items :[], totalAmount:0});
            await cart.save();
        }
        
        logger.info("Cart retrieved", {
            requestId: req.requestId,
            userId
        });
        res.render('store/cart' , {
            pageTitle: 'Your shopping Cart - intellishop',
            currentPage:'cart',
            cart,
            isLoggedIn:req.isLoggedIn,
            user:req.session.user
        })


    }catch(err){
        logger.error("Cart operation failure", {
            requestId: req.requestId,
            userId: req.session?.user?.id,
            operation: "getCart",
            error: err.message,
            stack: err.stack
        });
        next(err);
    }

};

// Add to Cart
exports.postAddToCart = async (req, res , next)=>{
    try{
        const userId = req.session.user.id;
        const productId = req.body.productId;
        const quantity = parseInt(req.body.quantity) || 1;
        const product= await Product.findById(productId);
        if(!product){
            logger.warn("Attempting to add non-existing product to the cart",{productId});
            return res.redirect('/products');
        }
        let cart = await Cart.findOne({userId});
        if(!cart){
            cart = new Cart({userId , items:[], totalAmount:0});
        }
        const itemIndex = cart.items.findIndex(item => item.productId.toString() === productId);
        if(itemIndex > -1){
            cart.items[itemIndex].quantity += quantity;
        }
        else{
            cart.items.push({
                productId : product._id,
                quantity : quantity,
                price : product.price

            });
            cart.calculateTotal();
            await cart.save();
            metrics.cartOperationsTotal.inc({ operation: 'add' });

            logger.info("Product added to cart", {
                requestId: req.requestId,
                userId, 
                productId,  
                quantity 
            });
            res.redirect('/cart');
        }

    }catch(err){
        logger.error("Cart operation failure", {
            requestId: req.requestId,
            userId: req.session?.user?.id,
            operation: "postAddToCart",
            error: err.message,
            stack: err.stack
        });
        next(err);

    }
};

// Update Cart Quantity
exports.postUpdateCart = async(req , res , next)=>{
    try{
        const userId = req.session.user.id;
        const productId = req.params.productId || req.body.productId;
        const quantity = parseInt(req.body.quantity);
        let cart = await Cart.findOne({userId});
        if(!cart){
            return res.redirect('/cart');
        }
        const itemIndex = cart.items.findIndex(item =>item.productId.toString() === productId );
        if(itemIndex >-1 ){
            if(quantity<=0){
                cart.items.splice(itemIndex , 1);
            }
            else{
                cart.items[itemIndex].quantity = quantity;

            }
            cart.calculateTotal();
            await cart.save();
            metrics.cartOperationsTotal.inc({ operation: 'update' });
        }
        logger.info("Cart updated", { 
            requestId: req.requestId,
            userId,
            productId, 
            quantity
        });
        res.redirect('/cart');
    }catch(err){
        logger.error("Cart operation failure", {
            requestId: req.requestId,
            userId: req.session?.user?.id,
            operation: "postUpdateCart",
            error: err.message,
            stack: err.stack
        });
        next(err);
    }
};

// Remove from Cart
exports.postRemoveFromCart = async (req, res, next) => {
    try {
        const userId = req.session.user.id;
        const productId = req.params.productId || req.body.productId;

        let cart = await Cart.findOne({ userId });
        if (cart) {
            cart.items = cart.items.filter(item => item.productId.toString() !== productId);
            cart.calculateTotal();
            await cart.save();
            metrics.cartOperationsTotal.inc({ operation: 'remove' });
            logger.info("Product removed from cart", { 
                requestId: req.requestId,
                userId, 
                productId 
            });
        }

        res.redirect('/cart');
    } catch (err) {
        logger.error("Cart operation failure", { 
            requestId: req.requestId,
            userId: req.session?.user?.id,
            operation: "postRemoveFromCart",
            error: err.message,
            stack: err.stack 
        });
        next(err);
    }
};

// Checkout Page
exports.getCheckout = async (req, res, next) => {
    try {
        const userId = req.session.user.id;
        const cart = await Cart.findOne({ userId }).populate('items.productId');

        if (!cart || cart.items.length === 0) {
            return res.redirect('/cart');
        }

        res.render('store/checkout', {
            pageTitle: 'Checkout - IntelliShop',
            currentPage: 'checkout',
            cart,
            isLoggedIn: req.isLoggedIn,
            user: req.session.user
        });
    } catch (err) {
        logger.error("Error loading checkout page", { error: err.message });
        next(err);
    }
};

  
// Create Order & Proceed to Mock Payment
exports.postCreateOrder = async (req, res, next) => {
    try {
        const userId = req.session.user.id;
        const { fullName, address, city, state, pincode, phone } = req.body;

        logger.info("Order creation started", {
            requestId: req.requestId,
            userId
        });

        const cart = await Cart.findOne({ userId }).populate('items.productId');
        if (!cart || cart.items.length === 0) {
            return res.redirect('/cart');
        }

        const orderItems = cart.items.map(item => ({
            productId: item.productId._id,
            name: item.productId.name,
            image: item.productId.image,
            quantity: item.quantity,
            price: item.price
        }));

        const order = new Order({
            userId,
            items: orderItems,
            totalAmount: cart.totalAmount,
            shippingAddress: { fullName, address, city, state, pincode, phone },
            paymentStatus: 'pending',
            orderStatus: 'pending'
        });

        await order.save();
        metrics.ordersCreatedTotal.inc();
        logger.info("Order created", { 
            requestId: req.requestId,
            userId,
            orderId: order._id
        });

        res.redirect(`/payment/${order._id}`);
    } catch (err) {
        logger.error("Order creation failed", { 
            requestId: req.requestId,
            userId: req.session?.user?.id,
            error: err.message,
            stack: err.stack 
        });
        next(err);
    }
};

// Mock Payment Page
exports.getPayment = async (req, res, next) => {
    try {
        const orderId = req.params.orderId;
        const order = await Order.findById(orderId);

        if (!order) {
            logger.warn("Order not found for payment", { orderId });
            return res.redirect('/orders');
        }

        res.render('store/payment', {
            pageTitle: 'Mock Payment - IntelliShop',
            currentPage: 'payment',
            order,
            isLoggedIn: req.isLoggedIn,
            user: req.session.user
        });
    } catch (err) {
        logger.error("Error rendering payment page", { error: err.message });
        next(err);
    }
};

// Process Mock Payment (Handles both SUCCESS and FAILURE simulations)
exports.postProcessPayment = async (req, res, next) => {
    try {
        const orderId = req.body.orderId;
        const paymentResult = req.body.paymentResult || 'SUCCESS'; // 'SUCCESS' or 'FAILURE'
        const paymentMethod = req.body.paymentMethod || 'Mock Card';

        const order = await Order.findById(orderId);
        if (!order) {
            return res.redirect('/orders');
        }

        logger.info("Payment started", { 
            requestId: req.requestId,
            orderId 
        });
        metrics.paymentsStartedTotal.inc();

        const transactionId = 'TXN-' + Date.now() + '-' + Math.floor(Math.random() * 1000);

        if (paymentResult === 'FAILURE') {
            logger.error("Payment failed", { 
                requestId: req.requestId,
                orderId, 
                error: "Simulated payment transaction failure" 
            });

            const payment = new Payment({
                orderId: order._id,
                userId: order.userId,
                amount: order.totalAmount,
                status: 'failed',
                transactionId,
                paymentMethod
            });
            await payment.save();
            metrics.paymentsFailedTotal.inc();

            order.paymentStatus = 'failed';
            await order.save();

            return res.render('store/payment', {
                pageTitle: 'Mock Payment - IntelliShop',
                currentPage: 'payment',
                order,
                errorMessage: 'Payment transaction was declined or failed. You can retry with Simulate Success.',
                isLoggedIn: req.isLoggedIn,
                user: req.session.user
            });
        }

        // Payment Success Flow
        const payment = new Payment({
            orderId: order._id,
            userId: order.userId,
            amount: order.totalAmount,
            status: 'success',
            transactionId,
            paymentMethod
        });
        await payment.save();
        metrics.paymentsSuccessTotal.inc();

        order.paymentStatus = 'success';
        order.orderStatus = 'confirmed';
        await order.save();

        // Clear Cart
        await Cart.findOneAndUpdate({ userId: order.userId }, { items: [], totalAmount: 0 });

        // Create Notification
        const notification = new Notification({
            userId: order.userId,
            orderId: order._id,
            message: `Your order #${order._id.toString().slice(-6)} has been placed successfully!`,
            type: 'order',
            status: 'unread'
        });
        await notification.save();

        logger.info("Payment successful", { 
            requestId: req.requestId,
            orderId 
        });

        res.redirect(`/order-confirmation/${order._id}`);
    } catch (err) {
        logger.error("Payment processing error", { 
            requestId: req.requestId,
            orderId: req.body?.orderId,
            error: err.message,
            stack: err.stack 
        });
        next(err);
    }
};

// Order Confirmation
exports.getOrderConfirmation = async (req, res, next) => {
    try {
        const orderId = req.params.orderId;
        const order = await Order.findById(orderId);

        if (!order) {
            return res.redirect('/orders');
        }

        res.render('store/order-confirmation', {
            pageTitle: 'Order Confirmed - IntelliShop',
            currentPage: 'orders',
            order,
            isLoggedIn: req.isLoggedIn,
            user: req.session.user
        });
    } catch (err) {
        logger.error("Error fetching order confirmation", { error: err.message });
        next(err);
    }
};

// My Orders History
exports.getMyOrders = async (req, res, next) => {
    try {
        const userId = req.session.user.id;
        const orders = await Order.find({ userId }).sort({ createdAt: -1 });

        res.render('store/orders', {
            pageTitle: 'My Orders - IntelliShop',
            currentPage: 'orders',
            orders,
            isLoggedIn: req.isLoggedIn,
            user: req.session.user
        });
    } catch (err) {
        logger.error("Error fetching order history", { error: err.message });
        next(err);
    }
};

// Single Order Detail View
exports.getOrderDetail = async (req, res, next) => {
    try {
        const orderId = req.params.id;
        const order = await Order.findById(orderId);

        if (!order) {
            return res.redirect('/orders');
        }

        res.render('store/order-detail', {
            pageTitle: `Order #${order._id.toString().slice(-6)} - IntelliShop`,
            currentPage: 'orders',
            order,
            isLoggedIn: req.isLoggedIn,
            user: req.session.user
        });
    } catch (err) {
        logger.error("Error fetching order detail", { error: err.message });
        next(err);
    }
};
