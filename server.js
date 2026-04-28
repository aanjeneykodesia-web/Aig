const express = require('express');
const mongoose = require('mongoose');
const cors = require('cors');
const bcrypt = require('bcryptjs');
const jwt = require('jsonwebtoken');
const multer = require('multer');
const path = require('path');
const app = express();

app.use(cors({ origin: '*' }));
app.use(express.json({ limit: '50mb' }));
app.use(express.static('public'));

// Multer for file uploads
const storage = multer.diskStorage({
  destination: (req, file, cb) => cb(null, 'public/uploads/'),
  filename: (req, file, cb) => cb(null, Date.now() + '-' + file.originalname)
});
const upload = multer({ storage });

mongoose.connect('mongodb://localhost:27017/logitrack', {
  useNewUrlParser: true,
  useUnifiedTopology: true
});

// Enhanced Schemas (Previous + New fields)
const UserSchema = new mongoose.Schema({
  name: { type: String, required: true },
  email: { type: String, unique: true },
  phone: { type: String, unique: true, required: true },
  role: { type: String, enum: ['manufacturer', 'transporter', 'shopkeeper', 'admin'], required: true },
  password: { type: String, required: true },
  avatar: String,
  companyName: String,
  gstin: String,
  address: String,
  location: {
    type: { type: String, enum: ['Point'], default: 'Point' },
    coordinates: [Number]
  },
  documents: [String],
  rating: { type: Number, default: 0 },
  totalOrders: { type: Number, default: 0 },
  completedOrders: { type: Number, default: 0 },
  earnings: { type: Number, default: 0 },
  isVerified: { type: Boolean, default: false },
  isOnline: { type: Boolean, default: false },
  lastActive: { type: Date, default: Date.now }
}, { timestamps: true });

const ProductSchema = new mongoose.Schema({
  name: { type: String, required: true },
  description: String,
  price: { type: Number, required: true },
  mrp: Number,
  category: String,
  images: [String],
  specifications: mongoose.Schema.Types.Mixed,
  manufacturer: { type: mongoose.Schema.Types.ObjectId, ref: 'User', required: true },
  stock: { type: Number, default: 0 },
  status: { type: String, enum: ['active', 'inactive', 'out-of-stock'], default: 'active' },
  weight: Number,
  dimensions: String
}, { timestamps: true });

const OrderSchema = new mongoose.Schema({
  orderId: { type: String, unique: true },
  shopkeeper: { type: mongoose.Schema.Types.ObjectId, ref: 'User', required: true },
  manufacturer: { type: mongoose.Schema.Types.ObjectId, ref: 'User' },
  transporter: { type: mongoose.Schema.Types.ObjectId, ref: 'User' },
  items: [{
    product: { type: mongoose.Schema.Types.ObjectId, ref: 'Product' },
    quantity: Number,
    price: Number,
    name: String,
    image: String
  }],
  subtotal: Number,
  tax: Number,
  totalAmount: { type: Number, required: true },
  status: { 
    type: String, 
    enum: ['pending', 'accepted', 'picked-up', 'in-transit', 'delivered', 'cancelled'], 
    default: 'pending' 
  },
  pickupLocation: {
    type: { type: String, default: 'Point' },
    coordinates: [Number],
    address: String
  },
  deliveryLocation: {
    type: { type: String, default: 'Point' },
    coordinates: [Number],
    address: String
  },
  currentLocation: {
    type: { type: String, default: 'Point' },
    coordinates: [Number]
  },
  trackingUpdates: [{
    status: String,
    location: { type: { type: String, default: 'Point' }, coordinates: [Number] },
    timestamp: { type: Date, default: Date.now },
    note: String,
    user: { type: mongoose.Schema.Types.ObjectId, ref: 'User' }
  }],
  paymentStatus: { type: String, enum: ['pending', 'paid', 'failed'], default: 'pending' }
}, { timestamps: true });

// Models
const User = mongoose.model('User', UserSchema);
const Product = mongoose.model('Product', ProductSchema);
const Order = mongoose.model('Order', OrderSchema);

// Auth Middleware
const auth = (roles = []) => async (req, res, next) => {
  try {
    const token = req.header('Authorization')?.replace('Bearer ', '');
    if (!token) return res.status(401).json({ success: false, message: 'No token provided' });
    
    const decoded = jwt.verify(token, process.env.JWT_SECRET || 'logitrack_super_secret_2024');
    const user = await User.findById(decoded.id).select('-password');
    
    if (!user || (roles.length && !roles.includes(user.role))) {
      return res.status(403).json({ success: false, message: 'Access denied' });
    }
    
    req.user = user;
    next();
  } catch (error) {
    res.status(401).json({ success: false, message: 'Invalid token' });
  }
};

// Role-specific Routes
app.get('/api/dashboard/:role', auth(), async (req, res) => {
  const { role } = req.params;
  const userId = req.user._id;
  
  let dashboardData = {};
  
  if (role === 'manufacturer') {
    dashboardData = await getManufacturerDashboard(userId);
  } else if (role === 'transporter') {
    dashboardData = await getTransporterDashboard(userId);
  } else if (role === 'shopkeeper') {
    dashboardData = await getShopkeeperDashboard(userId);
  } else if (role === 'admin') {
    dashboardData = await getAdminDashboard();
  }
  
  res.json({ success: true, data: dashboardData });
});

async function getManufacturerDashboard(userId) {
  const orders = await Order.find({ manufacturer: userId })
    .populate('shopkeeper transporter', 'name phone companyName');
  const products = await Product.find({ manufacturer: userId });
  
  return {
    stats: {
      totalOrders: orders.length,
      pendingOrders: orders.filter(o => o.status === 'pending').length,
      activeOrders: orders.filter(o => ['accepted', 'picked-up', 'in-transit'].includes(o.status)).length,
      completedOrders: orders.filter(o => o.status === 'delivered').length,
      totalRevenue: orders.reduce((sum, o) => sum + o.totalAmount, 0)
    },
    recentOrders: orders.slice(0, 5),
    productsCount: products.length,
    lowStockProducts: products.filter(p => p.stock < 10)
  };
}

async function getTransporterDashboard(userId) {
  const orders = await Order.find({ transporter: userId })
    .populate('shopkeeper manufacturer', 'name phone companyName');
  
  return {
    stats: {
      totalOrders: orders.length,
      activeDeliveries: orders.filter(o => ['picked-up', 'in-transit'].includes(o.status)).length,
      completed: orders.filter(o => o.status === 'delivered').length,
      earnings: orders.reduce((sum, o) => sum + (o.totalAmount * 0.1), 0), // 10% commission
      rating: 4.8
    },
    activeOrders: orders.filter(o => o.status !== 'delivered').slice(0, 5)
  };
}

async function getShopkeeperDashboard(userId) {
  const orders = await Order.find({ shopkeeper: userId })
    .populate('manufacturer transporter', 'name phone companyName');
  const products = await Product.find({}).limit(10);
  
  return {
    stats: {
      totalOrders: orders.length,
      pendingOrders: orders.filter(o => o.status === 'pending').length,
      deliveredOrders: orders.filter(o => o.status === 'delivered').length,
      totalSpent: orders.reduce((sum, o) => sum + o.totalAmount, 0)
    },
    recentOrders: orders.slice(0, 5),
    recommendedProducts: products.slice(0, 4)
  };
}

async function getAdminDashboard() {
  const totalUsers = await User.countDocuments();
  const totalOrders = await Order.countDocuments();
  const totalRevenue = await Order.aggregate([{ $group: { _total: { $sum: '$totalAmount' } } }]);
  
  return {
    stats: {
      totalUsers,
      totalOrders,
      totalRevenue: totalRevenue[0]?._total || 0,
      activeTransporters: await User.countDocuments({ role: 'transporter', isOnline: true }),
      verifiedManufacturers: await User.countDocuments({ role: 'manufacturer', isVerified: true })
    }
  };
}

// All existing routes + new ones...
app.post('/api/auth/register', async (req, res) => {
  // Previous register logic + companyName, gstin
});

app.post('/api/auth/login', async (req, res) => {
  // Previous login logic
});

app.get('/api/products', auth());
app.post('/api/products', auth(['manufacturer', 'admin']), upload.array('images', 5));
app.get('/api/orders', auth());
app.post('/api/orders', auth(['shopkeeper']));
app.put('/api/orders/:id/accept', auth(['manufacturer']));
app.put('/api/orders/:id/pickup', auth(['transporter']));
app.put('/api/orders/:id/delivered', auth(['transporter']));
app.put('/api/location/update', auth(['transporter', 'shopkeeper', 'manufacturer']));

app.listen(3000, () => console.log('🚀 LogiTrack Multi-Role Platform Ready!'));
