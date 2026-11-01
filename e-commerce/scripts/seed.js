require('dotenv').config();
const mongoose = require('mongoose');
const bcrypt = require('bcryptjs');
const Product = require('../models/product');
const User = require('../models/user');

const DB_URI = process.env.MONGO_URI || 'mongodb://127.0.0.1:27017/ecommerce';

const products = [
    {
        name: 'MacBook Pro 16" M3 Max',
        description: 'Apple M3 Max chip with 16-core CPU and 40-core GPU, 48GB unified memory, 1TB SSD storage.',
        price: 199999,
        category: 'Laptops',
        brand: 'Apple',
        image: 'https://images.unsplash.com/photo-1517336714731-489689fd1ca8?auto=format&fit=crop&w=600&q=80',
        stock: 15,
        rating: 4.9
    },
    {
        name: 'Dell XPS 15 OLED',
        description: '13th Gen Intel Core i9, 32GB DDR5, 1TB NVMe SSD, NVIDIA GeForce RTX 4070, 3.5K OLED touch.',
        price: 149999,
        category: 'Laptops',
        brand: 'Dell',
        image: 'https://images.unsplash.com/photo-1593642632823-8f785ba67e45?auto=format&fit=crop&w=600&q=80',
        stock: 20,
        rating: 4.8
    },
    {
        name: 'iPhone 15 Pro Titanium',
        description: 'A17 Pro chip, Aerospace-grade titanium design, 48MP main camera, USB-C with USB 3 speeds.',
        price: 129999,
        category: 'Smartphones',
        brand: 'Apple',
        image: 'https://images.unsplash.com/photo-1510557880182-3d4d3cba35a5?auto=format&fit=crop&w=600&q=80',
        stock: 35,
        rating: 4.7
    },
    {
        name: 'Sony WH-1000XM5 Wireless Headphones',
        description: 'Industry-leading noise canceling with two processors and 8 microphones, up to 30-hour battery life.',
        price: 29999,
        category: 'Headphones',
        brand: 'Sony',
        image: 'https://images.unsplash.com/photo-1505740420928-5e560c06d30e?auto=format&fit=crop&w=600&q=80',
        stock: 50,
        rating: 4.9
    },
    {
        name: 'Keychron Q1 Pro Wireless Custom Mechanical Keyboard',
        description: 'Full aluminum CNC machined body, 75% layout, hot-swappable switches, wireless Bluetooth 5.1.',
        price: 16999,
        category: 'Keyboards',
        brand: 'Keychron',
        image: 'https://images.unsplash.com/photo-1587829741301-dc798b83add3?auto=format&fit=crop&w=600&q=80',
        stock: 25,
        rating: 4.8
    },
    {
        name: 'Logitech MX Master 3S Wireless Mouse',
        description: 'Quiet clicks, 8K DPI any-surface tracking, MagSpeed electromagnetic scrolling, ergonomic grip.',
        price: 8999,
        category: 'Mice',
        brand: 'Logitech',
        image: 'https://images.unsplash.com/photo-1527864550417-7fd91fc51a46?auto=format&fit=crop&w=600&q=80',
        stock: 40,
        rating: 4.9
    },
    {
        name: 'LG UltraFine 27" 4K UHD Monitor',
        description: 'IPS panel with 99% sRGB color gamut, HDR10, USB Type-C connectivity with 60W power delivery.',
        price: 39999,
        category: 'Monitors',
        brand: 'LG',
        image: 'https://images.unsplash.com/photo-1527443224154-c4a3942d3acf?auto=format&fit=crop&w=600&q=80',
        stock: 18,
        rating: 4.7
    },
    {
        name: 'Anker Prime 100W GaN Wall Charger',
        description: 'Ultra-compact 3-port charger (2 USB-C, 1 USB-A) with ActiveShield 2.0 temperature monitoring.',
        price: 4999,
        category: 'Accessories',
        brand: 'Anker',
        image: 'https://images.unsplash.com/photo-1583863788434-e58a36330cf0?auto=format&fit=crop&w=600&q=80',
        stock: 60,
        rating: 4.8
    }
];

async function seed() {
    try {
        console.log('Connecting to MongoDB...');
        try {
            await mongoose.connect(DB_URI, { serverSelectionTimeoutMS: 3000 });
        } catch (e) {
            console.warn('Atlas failed, trying local MongoDB at mongodb://127.0.0.1:27017/ecommerce...');
            await mongoose.connect('mongodb://127.0.0.1:27017/ecommerce', { serverSelectionTimeoutMS: 3000 });
        }
        console.log('MongoDB Connected successfully');

        // Seed products
        await Product.deleteMany({});
        console.log('Cleared existing products');
        await Product.insertMany(products);
        console.log(`Successfully seeded ${products.length} products`);

        // Seed test user
        const hashedPassword = await bcrypt.hash('password123', 12);
        let user = await User.findOne({ email: 'gaurav@example.com' });
        if (!user) {
            user = new User({
                firstName: 'Gaurav',
                lastName: 'Sutar',
                email: 'gaurav@example.com',
                password: hashedPassword,
                userType: 'customer'
            });
            await user.save();
            console.log('Created customer user: gaurav@example.com (password: password123)');
        } else {
            user.password = hashedPassword;
            await user.save();
            console.log('Updated customer user: gaurav@example.com (password: password123)');
        }

        // Seed admin user
        let admin = await User.findOne({ email: 'admin@intellishop.com' });
        if (!admin) {
            admin = new User({
                firstName: 'Admin',
                lastName: 'IntelliShop',
                email: 'admin@intellishop.com',
                password: hashedPassword,
                userType: 'admin'
            });
            await admin.save();
            console.log('Created admin user: admin@intellishop.com (password: password123)');
        }

        console.log('Seeding completed successfully!');
        process.exit(0);
    } catch (err) {
        console.error('Seeding failed:', err);
        process.exit(1);
    }
}

seed();
