require('./tracer');
require('dotenv').config();
const path = require('path');
const express = require('express');
const mongoose = require('mongoose');
const session = require('express-session');
const MongoDBStore = require('connect-mongodb-session')(session);
const multer = require('multer');

const rootDir = require("./utils/pathutil");
const logger = require("./middleware/logger");
const errorHandler = require("./middleware/errorHandler");
const requestContext = require("./middleware/requestContext");
const requestLogger = require("./middleware/requestLogger");

// Prometheus Metrics
const metrics = require("./utils/metrics");

// Routers
const userRouter = require("./routes/userRouter");
const authRouter = require("./routes/authRouter");
const hostRouter = require("./routes/hostRouter");

// REST API Routers
const userApiRouter = require("./routes/api/userApiRouter");
const productApiRouter = require("./routes/api/productApiRouter");
const cartApiRouter = require("./routes/api/cartApiRouter");
const orderApiRouter = require("./routes/api/orderApiRouter");
const paymentApiRouter = require("./routes/api/paymentApiRouter");
const notificationApiRouter = require("./routes/api/notificationApiRouter");
const failureApiRouter = require("./routes/api/failureApiRouter");
const { isContext } = require('vm');
const { Timestamp } = require('mongodb');

const app = express();

const DB_Path = process.env.MONGO_URI || "mongodb+srv://root:root@cluster1.mwwv0wt.mongodb.net/ecommerce?appName=Cluster1";
const PORT = process.env.PORT || 3000;

app.set('view engine', 'ejs');
app.set('views', 'views');

// Session MongoDB Store
const sessionUri = process.env.SESSION_MONGO_URI || DB_Path;
const store = new MongoDBStore({
    uri: sessionUri,
    collection: 'sessions',
    connectionOptions: {
        serverSelectionTimeoutMS: 5000
    }
}, function (error) {
    if (error) {
        logger.error("Session Store initialization error", { error: error.message });
    }
});

store.on('error', function (error) {
    logger.error("Session Store Error", { error: error ? (error.message || error) : 'Unknown error' });
});

// Middleware
app.use(session({
    secret: process.env.SESSION_SECRET || "Gaurav",
    resave: false,
    saveUninitialized: false,
    store: store
}));

// Expose session variables to all views & requests
app.use((req, res, next) => {
    req.isLoggedIn = req.session ? req.session.isLoggedIn : false;
    req.user = req.session ? req.session.user : null;
    res.locals.isLoggedIn = req.isLoggedIn;
    res.locals.user = req.user;
    next();
});

// Request Context
app.use(requestContext);

// Request Logger
app.use(requestLogger);

// Body Parsing
app.use(express.json());
app.use(express.urlencoded({ extended: true }));

// File Upload (Multer) Configuration
const randomString = (length) => {
    const characters = 'abcdefghijklmnopqrstuvwxyz';
    let result = '';
    for (let i = 0; i < length; i++) {
        result += characters.charAt(Math.floor(Math.random() * characters.length));
    }
    return result;
};

const storage = multer.diskStorage({
    destination: (req, file, cb) => {
        cb(null, "uploads/");
    },
    filename: (req, file, cb) => {
        cb(null, randomString(10) + '-' + file.originalname);
    }
});

const fileFilter = (req, file, cb) => {
    if (file.mimetype === 'image/png' || file.mimetype === 'image/jpg' || file.mimetype === 'image/jpeg' || file.mimetype === 'image/webp') {
        cb(null, true);
    } else {
        cb(null, false);
    }
};

app.use(multer({ storage, fileFilter }).single('photo'));

// Static Files
app.use(express.static(path.join(__dirname, 'public')));
app.use("/uploads", express.static(path.join(rootDir, 'uploads')));

// Failure Injection Middleware
const createFailureInjector = require('./middleware/failureInjector');
app.use(createFailureInjector({ serviceName: 'intellishop-gateway', metrics, logger }));

// REST API Routes
app.use('/api/users', userApiRouter);
app.use('/api/products', productApiRouter);
app.use('/api/cart', cartApiRouter);
app.use('/api/orders', orderApiRouter);
app.use('/api/payments', paymentApiRouter);
app.use('/api/notifications', notificationApiRouter);
app.use('/api', failureApiRouter); // Chaos & Failure Simulation Endpoints

// Developer Failure Injection Controls & Traffic Simulation
const developerRouter = require('./routes/developerRouter');
app.use('/developer/failure-injections', developerRouter);

// View Routes
app.use(authRouter);
app.use(userRouter);
app.use("/host", hostRouter);
app.use("/admin", hostRouter);

//Health Check Endpoint
app.get('/health', (req, res) => {
    const isDbConnected = mongoose.connection.readyState === 1;
    if (isDbConnected) {
        res.status(200).json({
            status: "healthy",
            service: "intellishop",
            timestamp: new Date().toISOString(),
            uptime: process.uptime(),
            database: "connected"
        });
    } else {
        res.status(503).json({
            status: "unhealthy",
            service: "intellishop",
            database: "disconnected"
        });
    }
});

// Metrics Endpoint
app.get('/metrics', async (req, res) => {
    try {
        const isDbConnected = mongoose.connection.readyState === 1;
        metrics.healthStatus.set(isDbConnected ? 1 : 0);

        res.set('Content-Type', metrics.register.contentType);
        res.end(await metrics.register.metrics());
    } catch (err) {
        res.status(500).end(err);
    }
});

// Development Failure Simulation Endpoints
if (process.env.NODE_ENV !== 'production') {
    const debugRouter = require('./routes/debugRouter');
    app.use('/debug', debugRouter);
}

// Dashboard alias redirect
app.get('/dashboard', (req, res) => res.redirect('/host/dashboard'));

// 404 Page Not Found Handler
app.use((req, res, next) => {
    res.status(404).render('404', {
        pageTitle: 'Page Not Found - IntelliShop',
        isLoggedIn: req.isLoggedIn,
        user: req.session ? req.session.user : null,
        message: 'The page you requested does not exist.'
    });
});

// Centralized Error Handler
app.use(errorHandler);

// Database Connection & Server Listener
const connectDB = async () => {
    try {
        await mongoose.connect(DB_Path, { serverSelectionTimeoutMS: 3000 });
        logger.info("MongoDB connected");
    } catch (err) {
        logger.warn("Atlas connection failed. Falling back to local MongoDB at mongodb://127.0.0.1:27017/ecommerce...");
        try {
            await mongoose.connect('mongodb://127.0.0.1:27017/ecommerce', { serverSelectionTimeoutMS: 3000 });
            logger.info("IntelliShop connected to local MongoDB");
        } catch (localErr) {
            logger.error("MongoDB connection failed", { error: localErr.message });
        }
    }
    app.listen(PORT, () => {
        logger.info(`IntelliShop Server running on http://localhost:${PORT}`);
    });
};
connectDB();

// trigger restart

// triggered restart

// another restart
