const express = require('express');
const router = express.Router();
const { isAuth, isAdmin } = require('../../middleware/authMiddleware');
const logger = require('../../middleware/logger');
const productClient = require('../../utils/serviceClients/productClient');

// GET /api/products
router.get('/', async (req, res, next) => {
    try {
        const category = req.query.category;
        const search = req.query.search;
        let query = {};

        if (category) query.category = category;
        if (search) query.name = { $regex: search, $options: 'i' };

        const response = await productClient.getProducts({ category, search }, req.requestId);
        const products = response.data || [];
        logger.info(`[API] Fetched ${products.length} products via Product Service`);

        res.status(200).json({
            success: true,
            count: products.length,
            data: products,
            service: 'product-service-gateway'
        });
    } catch (err) {
        next(err);
    }
});

// GET /api/products/:id
router.get('/:id', async (req, res, next) => {
    try {
        const response = await productClient.getProductById(req.params.id, req.requestId);
        const product = response.data;
        if (!product) {
            return res.status(404).json({
                success: false,
                error: 'Product not found',
                service: 'product-service-gateway'
            });
        }
        res.status(200).json({
            success: true,
            data: product,
            service: 'product-service-gateway'
        });
    } catch (err) {
        next(err);
    }
});

// POST /api/products (Admin)
router.post('/', isAuth, isAdmin, async (req, res, next) => {
    try {
        const response = await productClient.createProduct(req.body, req.requestId);
        const product = response.data;
        logger.info(`[API] Product created via Gateway: ${product.name}`);
        res.status(201).json({
            success: true,
            data: product,
            service: 'product-service-gateway'
        });
    } catch (err) {
        next(err);
    }
});

// PUT /api/products/:id (Admin)
router.put('/:id', isAuth, isAdmin, async (req, res, next) => {
    try {
        const response = await productClient.updateProduct(req.params.id, req.body, req.requestId);
        const product = response.data;
        if (!product) {
            return res.status(404).json({
                success: false,
                error: 'Product not found',
                service: 'product-service-gateway'
            });
        }
        logger.info(`[API] Product updated via Gateway: ${product.name}`);
        res.status(200).json({
            success: true,
            data: product,
            service: 'product-service-gateway'
        });
    } catch (err) {
        next(err);
    }
});

// DELETE /api/products/:id (Admin)
router.delete('/:id', isAuth, isAdmin, async (req, res, next) => {
    try {
        await productClient.deleteProduct(req.params.id, req.requestId);
        logger.info(`[API] Product deleted via Gateway: ${req.params.id}`);
        res.status(200).json({
            success: true,
            message: 'Product deleted successfully',
            service: 'product-service-gateway'
        });
    } catch (err) {
        next(err);
    }
});

module.exports = router;
