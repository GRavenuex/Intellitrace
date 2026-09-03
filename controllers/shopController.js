const Product = require('../models/product');
const Cart = require('../models/cart');
const Order = require('../models/order');
const Payment = require('../models/payment');
const Notification = require('../models/notification');
const logger = require('../middleware/logger');
const product = require('../models/product');


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

        logger.info("Products fetched", { count: products.length, query: req.query });

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
        logger.error("Error fetching product catalog", { error: err.message });
        next(err);
    }
};

// Product Details
exports.getProductDetails = async(req , res ,  next)=>{
    try{
        const productId = req.params.id;
        const product  = await Product.findById(productId);
        if(!product){
            logger.warn("product not found",{productId});
            return res.redirect('/products');
        }
        const relatedProducts = await Product.find({
            category:product.category,
            _id:{$ne:product._id}

        }).limit(4);

        logger.info(`product fatched:${product.name}` , {productId});
        res.render('store/product-detail',{
            pageTitle: `${product.name} - intellishop`,
            currentPage  :'products',
            product,
            relatedProducts,
            isLoggedIn:res.isLoggedIn,
            user: req.session.user
        });

    }catch(err){
        logger.error("Error fetching prduct details",{error:err.message});
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
        res.render('store/cart' , {
            pageTitle: 'Your shopping Cart - intellishop',
            currentPage:'cart',
            cart,
            isLoggedIn:req.isLoggedIn,
            user:req.session.user
        })


    }catch(err){
        logger.error("erorr fetching cart" ,({error : err.message}));
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

            logger.info("product added to cart",{userId , productId  ,quantity });
            res.redirect('/cart');
        }

    }catch(err){
        logger.error("Error Adding product to cart", {error: err.message});
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
        }
        logger.info("cart Updated" , { userId,productId , quantity});
        res.redirect('/cart');
    }catch{
        logger.error("error while updating cart" , {error:err.message});
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
            logger.info("Product removed from cart", { userId, productId });
        }

        res.redirect('/cart');
    } catch (err) {
        logger.error("Error removing item from cart", { error: err.message });
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
        logger.info("Order created successfully", { orderId: order._id, userId, amount: order.totalAmount });

        res.redirect(`/payment/${order._id}`);
    } catch (err) {
        logger.error("Error creating order", { error: err.message });
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

        logger.info("Payment started", { orderId, amount: order.totalAmount, simulatedResult: paymentResult });

        const transactionId = 'TXN-' + Date.now() + '-' + Math.floor(Math.random() * 1000);

        if (paymentResult === 'FAILURE') {
            logger.error("Payment failed", { orderId, reason: "Simulated payment transaction failure" });

            const payment = new Payment({
                orderId: order._id,
                userId: order.userId,
                amount: order.totalAmount,
                status: 'failed',
                transactionId,
                paymentMethod
            });
            await payment.save();

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

        logger.info("Payment successful", { orderId, transactionId });

        res.redirect(`/order-confirmation/${order._id}`);
    } catch (err) {
        logger.error("Error processing payment", { error: err.message });
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
