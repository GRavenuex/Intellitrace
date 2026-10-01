const { check, validationResult } = require("express-validator");
const bcrypt = require("bcryptjs");
const User = require("../models/user");
const logger = require("../middleware/logger");
const metrics = require("../utils/metrics");

exports.getLogin = (req, res, next) => {
    res.render('auth/login', {
        pageTitle: 'Login - IntelliShop',
        currentPage: 'login',
        isLoggedIn: false,
        errors: [],
        oldInput: { email: "" },
        user: {}
    });
};

exports.getSignup = (req, res, next) => {
    res.render('auth/signup', {
        pageTitle: 'Sign Up - IntelliShop',
        currentPage: 'signup',
        isLoggedIn: false,
        errors: [],
        oldInput: { firstName: "", lastName: "", email: "", userType: "customer" },
        user: {}
    });
};

exports.postSignup = [
    check("firstName")
        .trim()
        .isLength({ min: 2 })
        .withMessage("First name must be at least 2 characters long")
        .matches(/^[A-Za-z\s]+$/)
        .withMessage("First name must contain only alphabets"),

    check("lastName")
        .trim()
        .optional({ checkFalsy: true })
        .matches(/^[A-Za-z\s]*$/)
        .withMessage("Last name must contain only alphabets"),

    check("email")
        .isEmail()
        .withMessage("Please enter a valid email address")
        .normalizeEmail(),

    check("password")
        .isLength({ min: 6 })
        .withMessage("Password should be at least 6 characters long")
        .trim(),

    check("userType")
        .notEmpty()
        .isIn(['customer', 'admin', 'guest', 'host'])
        .withMessage("Invalid user type"),

    async (req, res, next) => {
        const { firstName, lastName, email, password, userType } = req.body;
        const errors = validationResult(req);

        if (!errors.isEmpty()) {
            return res.status(422).render("auth/signup", {
                pageTitle: "Sign Up - IntelliShop",
                currentPage: "signup",
                isLoggedIn: false,
                errors: errors.array().map(err => err.msg),
                oldInput: { firstName, lastName, email, userType },
                user: {}
            });
        }

        try {
            const existingUser = await User.findOne({ email });
            if (existingUser) {
                metrics.authFailureTotal.inc({ operation: 'register' });
                return res.status(422).render("auth/signup", {
                    pageTitle: "Sign Up - IntelliShop",
                    currentPage: "signup",
                    isLoggedIn: false,
                    errors: ["User with this email already exists"],
                    oldInput: { firstName, lastName, email, userType },
                    user: {}
                });
            }

            const hashedPassword = await bcrypt.hash(password, 12);
            const user = new User({
                firstName,
                lastName: lastName || '',
                email,
                password: hashedPassword,
                userType: userType === 'host' ? 'admin' : (userType === 'guest' ? 'customer' : userType)
            });

            await user.save();
            metrics.authSuccessTotal.inc({ operation: 'register' });
            logger.info(`User registered successfully: ${email}`, { role: user.userType });
            res.redirect("/login");
        } catch (err) {
            metrics.authFailureTotal.inc({ operation: 'register' });
            logger.error("Signup error", { error: err.message });
            return res.status(422).render("auth/signup", {
                pageTitle: "Sign Up - IntelliShop",
                currentPage: "signup",
                isLoggedIn: false,
                errors: ["Registration failed. Please try again."],
                oldInput: { firstName, lastName, email, userType },
                user: {}
            });
        }
    }
];

exports.postLogin = async (req, res, next) => {
    const { email, password } = req.body;

    try {
        const user = await User.findOne({ email });
        if (!user) {
            logger.warn("Login failed - user not found", {
                requestId: req.requestId,
                email: email
            });
            metrics.authFailureTotal.inc({ operation: 'login' });
            return res.status(422).render("auth/login", {
                pageTitle: "Login - IntelliShop",
                currentPage: "login",
                isLoggedIn: false,
                errors: ["User does not exist with this email"],
                oldInput: { email },
                user: {}
            });
        }

        const isMatch = await bcrypt.compare(password, user.password);
        if (!isMatch) {
            logger.warn("Login failed - invalid password", {
                requestId: req.requestId,
                userId: user._id.toString()
            });
            metrics.authFailureTotal.inc({ operation: 'login' });
            return res.status(422).render("auth/login", {
                pageTitle: "Login - IntelliShop",
                currentPage: "login",
                isLoggedIn: false,
                errors: ["Invalid email or password"],
                oldInput: { email },
                user: {}
            });
        }

        req.session.isLoggedIn = true;
        req.session.user = {
            id: user._id.toString(),
            name: `${user.firstName} ${user.lastName}`.trim(),
            email: user.email,
            userType: user.userType
        };

        logger.info("Login successful", {
            requestId: req.requestId,
            userId: user._id.toString()
        });
        metrics.authSuccessTotal.inc({ operation: 'login' });
        res.redirect("/");
    } catch (err) {
        metrics.authFailureTotal.inc({ operation: 'login' });
        logger.error("Login server error", { error: err.message });
        next(err);
    }
};

exports.postLogout = (req, res, next) => {
    const userId = req.session.user ? req.session.user.id : undefined;
    req.session.destroy((err) => {
        if (err) {
            logger.error("Logout error", { 
                requestId: req.requestId,
                userId: userId,
                error: err.message 
            });
        } else {
            logger.info("Logout successful", {
                requestId: req.requestId,
                userId: userId
            });
            metrics.authSuccessTotal.inc({ operation: 'logout' });
        }
        res.redirect("/login");
    });
};
