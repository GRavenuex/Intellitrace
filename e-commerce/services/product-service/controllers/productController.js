const Product = require('../models/product');
const logger = require('../utils/logger');
const metrics = require('../utils/metrics');

exports.getProducts = async (req, res, next) => {
    try {
        const { search, category, minPrice, maxPrice, sort } = req.query;
        let query = {};

        if (search) query.name = { $regex: search, $options: 'i' };
        if (category) query.category = category;
        if (minPrice > 0 || maxPrice < Infinity) {
            query.price = {};
            if (minPrice) query.price.$gte = parseFloat(minPrice);
            if (maxPrice) query.price.$lte = parseFloat(maxPrice);
        }

        let sortOption = { createdAt: -1 };
        if (sort === 'price-asc') sortOption = { price: 1 };
        if (sort === 'price-desc') sortOption = { price: -1 };
        if (sort === 'rating') sortOption = { rating: -1 };

        const products = await Product.find(query).sort(sortOption);
        
        logger.info("Products fetched", { requestId: req.headers['x-request-id'], count: products.length });
        metrics.productRequestsTotal.inc({ operation: 'list' });
        
        res.json({ success: true, data: products });
    } catch (err) {
        next(err);
    }
};

exports.getProductById = async (req, res, next) => {
    try {
        const product = await Product.findById(req.params.id);
        if (!product) return res.status(404).json({ success: false, message: 'Product not found' });
        
        logger.info("Product fetched", { requestId: req.headers['x-request-id'], productId: req.params.id });
        metrics.productRequestsTotal.inc({ operation: 'get' });
        
        res.json({ success: true, data: product });
    } catch (err) {
        next(err);
    }
};

exports.getRelatedProducts = async (req, res, next) => {
    try {
        const product = await Product.findById(req.params.id);
        if (!product) return res.status(404).json({ success: false, message: 'Product not found' });
        
        const related = await Product.find({
            category: product.category,
            _id: { $ne: product._id }
        }).limit(4);
        
        res.json({ success: true, data: related });
    } catch (err) {
        next(err);
    }
};

exports.createProduct = async (req, res, next) => {
    try {
        const product = new Product(req.body);
        await product.save();
        
        logger.info("Product created", { requestId: req.headers['x-request-id'], productId: product._id });
        metrics.productRequestsTotal.inc({ operation: 'create' });
        
        res.status(201).json({ success: true, data: product });
    } catch (err) {
        next(err);
    }
};

exports.updateProduct = async (req, res, next) => {
    try {
        const product = await Product.findByIdAndUpdate(req.params.id, req.body, { new: true, runValidators: true });
        if (!product) return res.status(404).json({ success: false, message: 'Product not found' });
        
        logger.info("Product updated", { requestId: req.headers['x-request-id'], productId: product._id });
        metrics.productRequestsTotal.inc({ operation: 'update' });
        
        res.json({ success: true, data: product });
    } catch (err) {
        next(err);
    }
};

exports.deleteProduct = async (req, res, next) => {
    try {
        const product = await Product.findByIdAndDelete(req.params.id);
        if (!product) return res.status(404).json({ success: false, message: 'Product not found' });
        
        logger.info("Product deleted", { requestId: req.headers['x-request-id'], productId: req.params.id });
        metrics.productRequestsTotal.inc({ operation: 'delete' });
        
        res.json({ success: true, message: 'Product deleted' });
    } catch (err) {
        next(err);
    }
};

exports.getFeaturedProducts = async (req, res, next) => {
    try {
        const limit = parseInt(req.query.limit) || 8;
        const products = await Product.find().sort({ rating: -1 }).limit(limit);
        res.json({ success: true, data: products });
    } catch (err) {
        next(err);
    }
};
