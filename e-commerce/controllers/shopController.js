const logger = require('../middleware/logger');
const metrics = require('../utils/metrics');
const productClient = require('../utils/serviceClients/productClient');
const cartClient = require('../utils/serviceClients/cartClient');
const orderClient = require('../utils/serviceClients/orderClient');
const paymentClient = require('../utils/serviceClients/paymentClient');

exports.getHome = async (req, res, next) => {
    try {
        const response = await productClient.getFeaturedProducts(8, req.requestId);
        const featuredProducts = response.data || [];
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

        const response = await productClient.getProducts({
            search, category, minPrice, maxPrice, sort
        }, req.requestId);
        
        const products = response.data || [];
        const categories = ['Laptops', 'Smartphones', 'Headphones', 'Keyboards', 'Mice', 'Monitors', 'Accessories'];

        logger.info("Products fetched from Product Service", { 
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
        
        const response = await productClient.getProductById(productId, req.requestId);
        const product = response.data;
        
        if(!product){
            logger.warn("Product not found via service", {
                requestId: req.requestId,
                productId
            });
            return res.redirect('/products');
        }
        
        const relatedResponse = await productClient.getRelatedProducts(productId, req.requestId);
        const relatedProducts = relatedResponse.data || [];

        logger.info("Product fetched", { 
            requestId: req.requestId, 
            productId 
        });
        res.render('store/product-detail',{
            pageTitle: `${product.name} - intellishop`,
            currentPage  :'products',
            product,
            relatedProducts,
            isLoggedIn:req.isLoggedIn,
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
        const response = await cartClient.getCart(userId, req.requestId);
        const cart = response.data;
        
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
        
        await cartClient.addToCart(userId, productId, quantity, req.requestId);

        logger.info("Product added to cart", {
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
        
        await cartClient.updateCartItem(userId, productId, quantity, req.requestId);
        
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

        await cartClient.removeCartItem(userId, productId, req.requestId);
        logger.info("Product removed from cart", { 
            requestId: req.requestId,
            userId, 
            productId 
        });

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
        const response = await cartClient.getCart(userId, req.requestId);
        const cart = response.data;

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

        const response = await cartClient.getCart(userId, req.requestId);
        const cart = response.data;
        
        if (!cart || cart.items.length === 0) {
            return res.redirect('/cart');
        }

        const orderItems = cart.items.map(item => ({
            productId: item.productId,
            name: item.productName || 'Unknown Product',
            image: item.productImage || '',
            quantity: item.quantity,
            price: item.price
        }));

        const orderData = {
            userId,
            items: orderItems,
            totalAmount: cart.totalAmount,
            shippingAddress: { fullName, address, city, state, pincode, phone },
            paymentStatus: 'pending',
            orderStatus: 'pending'
        };

        const responseOrder = await orderClient.createOrder(orderData, req.requestId);
        const order = responseOrder.data;

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
        try {
            const cartRes = await cartClient.getCart(req.session.user.id, req.requestId);
            return res.render('store/checkout', {
                pageTitle: 'Checkout - IntelliShop',
                currentPage: 'checkout',
                cart: cartRes.data || { items: [], totalAmount: 0 },
                errorMessage: `Order could not be placed: ${err.message || 'Service failure encountered'}. You can retry or check Developer Controls.`,
                isLoggedIn: req.isLoggedIn,
                user: req.session.user
            });
        } catch (_) {
            next(err);
        }
    }
};

// Mock Payment Page
exports.getPayment = async (req, res, next) => {
    try {
        const orderId = req.params.orderId;
        const response = await orderClient.getOrderById(orderId, req.requestId);
        const order = response.data;

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
        const userId = req.session.user.id;

        const responseOrder = await orderClient.getOrderById(orderId, req.requestId);
        const order = responseOrder.data;
        
        if (!order) {
            return res.redirect('/orders');
        }

        logger.info("Payment started", { 
            requestId: req.requestId,
            orderId 
        });
        
        try {
            await paymentClient.processPayment({ orderId, simulateResult: paymentResult, paymentMethod, userId }, req.requestId);
        } catch (paymentErr) {
            return res.render('store/payment', {
                pageTitle: 'Mock Payment - IntelliShop',
                currentPage: 'payment',
                order,
                errorMessage: 'Payment transaction was declined or failed. You can retry with Simulate Success.',
                isLoggedIn: req.isLoggedIn,
                user: req.session.user
            });
        }
        
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
        const response = await orderClient.getOrderById(orderId, req.requestId);
        const order = response.data;

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
        const response = await orderClient.getOrders(userId, req.requestId);
        const orders = response.data || [];

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
        const response = await orderClient.getOrderById(orderId, req.requestId);
        const order = response.data;

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
