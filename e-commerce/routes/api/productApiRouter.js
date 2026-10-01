const express = require('express');
const router = express.Router();
const Product = require('../../models/product');
const { isAuth, isAdmin } = require('../../middleware/authMiddleware');
const logger = require('../../middleware/logger');

// GET /api/products
router.get('/', async (req, res, next) => {
    try {
        const category = req.query.category;
        const search = req.query.search;
        let query = {};

        if (category) query.category = category;
        if (search) query.name = { $regex: search, $options: 'i' };

        const products = await Product.find(query).sort({ createdAt: -1 });
        logger.info(`[API] Fetched ${products.length} products`);

        res.status(200).json({
            success: true,
            count: products.length,
            data: products,
            service: 'product-service'
        });
    } catch (err) {
        next(err);
    }
});

// GET /api/products/:id
router.get('/:id', async (req, res, next) => {
    try {
        const product = await Product.findById(req.params.id);
        if (!product) {
            return res.status(404).json({
                success: false,
                error: 'Product not found',
                service: 'product-service'
            });
        }
        res.status(200).json({
            success: true,
            data: product,
            service: 'product-service'
        });
    } catch (err) {
        next(err);
    }
});

// POST /api/products (Admin)
router.post('/', isAuth, isAdmin, async (req, res, next) => {
    try {
        const product = new Product(req.body);
        await product.save();
        logger.info(`[API] Product created: ${product.name}`);
        res.status(201).json({
            success: true,
            data: product,
            service: 'product-service'
        });
    } catch (err) {
        next(err);
    }
});

// PUT /api/products/:id (Admin)
router.put('/:id', isAuth, isAdmin, async (req, res, next) => {
    try {
        const product = await Product.findByIdAndUpdate(req.params.id, req.body, { new: true, runValidators: true });
        if (!product) {
            return res.status(404).json({
                success: false,
                error: 'Product not found',
                service: 'product-service'
            });
        }
        logger.info(`[API] Product updated: ${product.name}`);
        res.status(200).json({
            success: true,
            data: product,
            service: 'product-service'
        });
    } catch (err) {
        next(err);
    }
});

// DELETE /api/products/:id (Admin)
router.delete('/:id', isAuth, isAdmin, async (req, res, next) => {
    try {
        const product = await Product.findByIdAndDelete(req.params.id);
        if (!product) {
            return res.status(404).json({
                success: false,
                error: 'Product not found',
                service: 'product-service'
            });
        }
        logger.info(`[API] Product deleted: ${req.params.id}`);
        res.status(200).json({
            success: true,
            message: 'Product deleted successfully',
            service: 'product-service'
        });
    } catch (err) {
        next(err);
    }
});

module.exports = router;
