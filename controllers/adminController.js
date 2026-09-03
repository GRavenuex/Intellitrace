const Product = require('../models/product');
const Order = require('../models/order');
const User = require('../models/user');
const logger = require('../middleware/logger');
const fs = require('fs');
const product = require('../models/product');

// Admin Dashboard Overview
exports.getDashboard = async (req , res , next)=>{
    try{
        const totalProducts = await Product.countDocuments();
        const totalOrders = await Order.countDocuments();
        const totalUsers = await User.countDocuments();
        const recentOrders = await Order.find().sort({createdAt:-1}).limit(5).populate('userId','email firstName lastName');
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
        const products  = await Product.find().sort({createdAt:-1});
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

        const product = new Product({
            name,
            price: parseFloat(price),
            category,
            brand,
            stock: parseInt(stock),
            description,
            image,
            rating: 4.5
        });

        await product.save();
        logger.info(`Product created: ${name}`, { productId: product._id });
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
        const product = await Product.findById(productId);

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
        const product = await Product.findById(id);

        if (!product) {
            return res.redirect('/admin/products');
        }

        product.name = name;
        product.price = parseFloat(price);
        product.category = category;
        product.brand = brand;
        product.stock = parseInt(stock);
        product.description = description;

        if (req.file) {
            product.image = '/' + req.file.path.replace(/\\/g, '/');
        } else if (req.body.imageUrl) {
            product.image = req.body.imageUrl;
        }

        await product.save();
        logger.info(`Product updated: ${name}`, { productId: id });
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
        await Product.findByIdAndDelete(productId);
        logger.info(`Product deleted`, { productId });
        res.redirect('/admin/products');
    } catch (err) {
        logger.error("Error deleting product", { error: err.message });
        next(err);
    }
};

// Admin Orders List
exports.getOrders = async (req, res, next) => {
    try {
        const orders = await Order.find().sort({ createdAt: -1 }).populate('userId', 'email firstName lastName');

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
        const order = await Order.findById(orderId);

        if (order) {
            order.orderStatus = orderStatus;
            await order.save();
            logger.info("Order status updated by admin", { orderId, orderStatus });
        }

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
