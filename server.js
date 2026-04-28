const express = require('express');
const mongoose = require('mongoose');
const cors = require('cors');
const bcrypt = require('bcryptjs');
const jwt = require('jsonwebtoken');
const path = require('path');
const app = express();

app.use(cors({ origin: '*' }));
app.use(express.json({ limit: '50mb' }));
app.use(express.static('public'));

mongoose.connect(process.env.MONGODB_URI || 'mongodb://localhost:27017/logisticsdb', {
  useNewUrlParser: true,
  useUnifiedTopology: true
});

// Enhanced Schemas
const UserSchema = new mongoose.Schema({
  name: { type: String, required: true },
  email: { type: String, unique: true },
  phone: { type: String, unique: true, required: true },
  role: { type: String, enum: ['manufacturer', 'transporter', 'shopkeeper', 'admin'], required: true },
  password: { type: String, required: true },
  avatar: String,
  location: {
    type: { type: String, enum: ['Point'], default: 'Point' },
    coordinates: [Number] // [lng, lat]
  },
  address: String,
  rating: { type: Number, default: 0 },
  isVerified: { type: Boolean, default: false },
  lastActive: { type: Date, default: Date.now }
}, { timestamps: true });

UserSchema.index({ location: '2dsphere' });

const ProductSchema = new mongoose.Schema({
  name: { type: String, required: true },
  description: String,
  price: { type: Number, required: true },
  category: String,
  images: [String],
  manufacturer: { type: mongoose.Schema.Types.ObjectId, ref: 'User', required: true },
  stock: { type: Number, default: 0 },
  status: { type: String, enum: ['active', 'inactive'], default: 'active' }
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
    name: String
  }],
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
    location: {
      type: { type: String, default: 'Point' },
      coordinates: [Number]
    },
    timestamp: { type: Date, default: Date.now },
    note: String
  }]
}, { timestamps: true });

const User = mongoose.model('User', UserSchema);
const Product = mongoose.model('Product', ProductSchema);
const Order = mongoose.model('Order', OrderSchema);

// Auth Middleware
const auth = (roles = []) => async (req, res, next) => {
  try {
    const token = req.header('Authorization')?.replace('Bearer ', '') || req.cookies.token;
    if (!token) return res.status(401).json({ success: false, message: 'No token' });
    
    const decoded = jwt.verify(token, process.env.JWT_SECRET || 'logitrack_secret_2024');
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

// Routes
app.post('/api/auth/register', async (req, res) => {
  try {
    const { name, email, phone, password, role } = req.body;
    const existingUser = await User.findOne({ $or: [{ email }, { phone }] });
    if (existingUser) {
      return res.json({ success: false, message: 'User already exists' });
    }
    
    const hashedPassword = await bcrypt.hash(password, 12);
    const user = new User({ name, email, phone, role, password: hashedPassword });
    await user.save();
    
    const token = jwt.sign({ id: user._id }, process.env.JWT_SECRET || 'logitrack_secret_2024', { expiresIn: '7d' });
    
    res.json({
      success: true,
      token,
      user: { id: user._id, name: user.name, role: user.role, phone: user.phone }
    });
  } catch (error) {
    res.status(500).json({ success: false, message: error.message });
  }
});

app.post('/api/auth/login', async (req, res) => {
  try {
    const { phone, password } = req.body;
    const user = await User.findOne({ phone });
    
    if (!user || !await bcrypt.compare(password, user.password)) {
      return res.json({ success: false, message: 'Invalid credentials' });
    }
    
    const token = jwt.sign({ id: user._id }, process.env.JWT_SECRET || 'logitrack_secret_2024', { expiresIn: '7d' });
    await User.findByIdAndUpdate(user._id, { lastActive: new Date() });
    
    res.json({
      success: true,
      token,
      user: {
        id: user._id,
        name: user.name,
        role: user.role,
        phone: user.phone,
        location: user.location
      }
    });
  } catch (error) {
    res.status(500).json({ success: false, message: error.message });
  }
});

app.get('/api/products', auth(), async (req, res) => {
  const products = await Product.find({ status: 'active' })
    .populate('manufacturer', 'name phone location')
    .sort({ createdAt: -1 });
  res.json({ success: true, products });
});

app.post('/api/products', auth(['manufacturer', 'admin']), async (req, res) => {
  const product = new Product({ ...req.body, manufacturer: req.user._id });
  await product.save();
  res.json({ success: true, product });
});

app.get('/api/orders', auth(), async (req, res) => {
  const { status } = req.query;
  let query = {};
  
  if (req.user.role === 'shopkeeper') query.shopkeeper = req.user._id;
  if (req.user.role === 'manufacturer') query.manufacturer = req.user._id;
  if (req.user.role === 'transporter') query.transporter = req.user._id;
  
  if (status) query.status = status;
  
  const orders = await Order.find(query)
    .populate('shopkeeper', 'name phone location')
    .populate('manufacturer', 'name phone location')
    .populate('transporter', 'name phone location')
    .sort({ createdAt: -1 });
    
  res.json({ success: true, orders });
});

app.post('/api/orders', auth(['shopkeeper']), async (req, res) => {
  const { items, totalAmount } = req.body;
  const orderId = 'ORD' + Date.now().toString().slice(-6);
  
  const order = new Order({
    orderId,
    shopkeeper: req.user._id,
    items,
    totalAmount,
    pickupLocation: req.user.location,
    deliveryLocation: req.user.location
  });
  
  await order.save();
  res.json({ success: true, order });
});

app.put('/api/orders/:id/accept', auth(['manufacturer']), async (req, res) => {
  const order = await Order.findById(req.params.id);
  if (!order || order.manufacturer) {
    return res.status(400).json({ success: false, message: 'Invalid operation' });
  }
  
  order.manufacturer = req.user._id;
  order.status = 'accepted';
  order.trackingUpdates.push({
    status: 'accepted',
    note: `${req.user.name} accepted the order`
  });
  
  await order.save();
  res.json({ success: true, order });
});

app.put('/api/orders/:id/pickup', auth(['transporter']), async (req, res) => {
  const { location } = req.body;
  const order = await Order.findById(req.params.id);
  
  if (order.status !== 'accepted') {
    return res.status(400).json({ success: false, message: 'Order not ready for pickup' });
  }
  
  order.transporter = req.user._id;
  order.status = 'picked-up';
  order.currentLocation = location;
  order.trackingUpdates.push({
    status: 'picked-up',
    location,
    note: `${req.user.name} picked up the order`
  });
  
  await order.save();
  res.json({ success: true, order });
});

app.put('/api/location/update', auth(['transporter', 'shopkeeper']), async (req, res) => {
  const { lng, lat } = req.body;
  
  await User.findByIdAndUpdate(req.user._id, {
    location: { type: 'Point', coordinates: [lng, lat] },
    lastActive: new Date()
  });
  
  res.json({ success: true });
});

app.listen(3000, () => {
  console.log('🚀 LogiTrack Server running on port 3000');
});
