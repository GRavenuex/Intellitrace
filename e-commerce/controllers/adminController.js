const User = require('../models/user');
const logger = require('../middleware/logger');
const fs = require('fs');
const productClient = require('../utils/serviceClients/productClient');
const orderClient = require('../utils/serviceClients/orderClient');

// Admin Dashboard Overview
exports.getDashboard = async (req , res , next)=>{
    try{
        const productsRes = await productClient.getProducts({}, req.requestId);
        const totalProducts = productsRes.data ? productsRes.data.length : 0;
        
        const totalOrdersRes = await orderClient.countOrders(req.requestId);
        const totalOrders = totalOrdersRes.data || 0;
        
        const totalUsers = await User.countDocuments();
        
        const recentOrdersRes = await orderClient.getRecentOrders(5, req.requestId);
        const recentOrders = recentOrdersRes.data || [];

        logger.info("Admin dashboard accessed", {
            requestId: req.requestId,
            userId: req.session?.user?.id
        });

        res.render('admin/dashboard' , {
            pageTitle:'Admin Dashboard - Intellishop',
            currentPage:'admin',
            stats:{totalProducts , totalOrders , totalUsers},
            recentOrders,
            isLoggedIn :req.isLoggedIn,
            user:req.session.user
        });

    }catch(err){
        logger.error("error  while fetching admin dashboard  data",{error:err.message});
        next(err);
    }
}

// Admin Product Inventory View
exports.getProducts = async(req, res , next)=>{
    try{
        const response = await productClient.getProducts({}, req.requestId);
        const products = response.data || [];
        
        res.render('admin/products' ,{
            pageTitle: 'Manage products-Intellishop Admin',
            currentPage:'admin-products',products,
            isLoggedIn:req.isLoggedIn,
            user:req.session.user
        });

    }catch(err){
        logger.error("Error while fetching admin dashboard  data" , {error:err.message});
        next(err);
    }
}

// Add Product Page
exports.getAddProduct = (req, res, next) => {
    res.render('admin/product-form', {
        pageTitle: 'Add Product - IntelliShop Admin',
        currentPage: 'admin-products',
        editing: false,
        product: {},
        isLoggedIn: req.isLoggedIn,
        user: req.session.user
    });
};

// Post Add Product
exports.postAddProduct = async (req, res, next) => {
    try {
        const { name, price, category, brand, stock, description } = req.body;
        let image = req.body.imageUrl || '';

        if (req.file) {
            image = '/' + req.file.path.replace(/\\/g, '/');
        }

        if (!image) {
            image = 'https://images.unsplash.com/photo-1526738549149-8e07eca6c147?w=800&auto=format&fit=crop&q=80';
        }

        const productData = {
            name,
            price: parseFloat(price),
            category,
            brand,
            stock: parseInt(stock),
            description,
            image,
            rating: 4.5
        };

        const response = await productClient.createProduct(productData, req.requestId);
        const product = response.data;
        
        logger.info("Product created", { 
            requestId: req.requestId,
            userId: req.session?.user?.id,
            productId: product._id 
        });
        res.redirect('/admin/products');
    } catch (err) {
        logger.error("Error adding new product", { error: err.message });
        next(err);
    }
};




// Edit Product Page
exports.getEditProduct = async (req, res, next) => {
    try {
        const productId = req.params.id;
        const response = await productClient.getProductById(productId, req.requestId);
        const product = response.data;

        if (!product) {
            return res.redirect('/admin/products');
        }

        res.render('admin/product-form', {
            pageTitle: `Edit ${product.name} - IntelliShop Admin`,
            currentPage: 'admin-products',
            editing: true,
            product,
            isLoggedIn: req.isLoggedIn,
            user: req.session.user
        });
    } catch (err) {
        logger.error("Error loading edit product page", { error: err.message });
        next(err);
    }
};

// Post Edit Product
exports.postEditProduct = async (req, res, next) => {
    try {
        const { id, name, price, category, brand, stock, description } = req.body;
        
        const updateData = {
            name,
            price: parseFloat(price),
            category,
            brand,
            stock: parseInt(stock),
            description
        };

        if (req.file) {
            updateData.image = '/' + req.file.path.replace(/\\/g, '/');
        } else if (req.body.imageUrl) {
            updateData.image = req.body.imageUrl;
        }

        await productClient.updateProduct(id, updateData, req.requestId);
        
        logger.info("Product updated", { 
            requestId: req.requestId,
            userId: req.session?.user?.id,
            productId: id 
        });
        res.redirect('/admin/products');
    } catch (err) {
        logger.error("Error updating product", { error: err.message });
        next(err);
    }
};

// Delete Product
exports.postDeleteProduct = async (req, res, next) => {
    try {
        const productId = req.params.id || req.body.id;
        await productClient.deleteProduct(productId, req.requestId);
        
        logger.info("Product deleted", { 
            requestId: req.requestId,
            userId: req.session?.user?.id,
            productId 
        });
        res.redirect('/admin/products');
    } catch (err) {
        logger.error("Error deleting product", { error: err.message });
        next(err);
    }
};

// Admin Orders List
exports.getOrders = async (req, res, next) => {
    try {
        const response = await orderClient.getOrders(null, req.requestId);
        const orders = response.data || [];

        res.render('admin/orders', {
            pageTitle: 'Manage Orders - IntelliShop Admin',
            currentPage: 'admin-orders',
            orders,
            isLoggedIn: req.isLoggedIn,
            user: req.session.user
        });
    } catch (err) {
        logger.error("Error fetching admin orders", { error: err.message });
        next(err);
    }
};

// Update Order Status
exports.postUpdateOrderStatus = async (req, res, next) => {
    try {
        const { orderId, orderStatus } = req.body;
        
        await orderClient.updateOrder(orderId, { orderStatus }, req.requestId);
        logger.info("Order status updated by admin", { orderId, orderStatus });

        res.redirect('/admin/orders');
    } catch (err) {
        logger.error("Error updating order status", { error: err.message });
        next(err);
    }
};

// View Users List
exports.getUsers = async (req, res, next) => {
    try {
        const users = await User.find().select('-password').sort({ createdAt: -1 });

        res.render('admin/users', {
            pageTitle: 'Manage Users - IntelliShop Admin',
            currentPage: 'admin-users',
            users,
            isLoggedIn: req.isLoggedIn,
            user: req.session.user
        });
    } catch (err) {
        logger.error("Error fetching admin users list", { error: err.message });
        next(err);
    }
};
