const express = require('express');
const cors = require('cors');
const { Server } = require('socket.io');
const http = require('http');
const path = require('path');

const app = express();
const server = http.createServer(app);
const io = new Server(server, {
    cors: {
        origin: "*",
        methods: ["GET", "POST"]
    }
});

// Middleware
app.use(cors());
app.use(express.json());
app.use(express.static('public'));

// In-memory database (replace with MongoDB/PostgreSQL in production)
const database = {
    users: [
        { id: 1, phone: '+919876543210', name: 'Manufacturer 1', role: 'manufacturer', location: { lat: 28.6139, lng: 77.2090 } },
        { id: 2, phone: '+919876543211', name: 'Transporter 1', role: 'transporter', location: { lat: 19.0760, lng: 72.8777 } },
        { id: 3, phone: '+919876543212', name: 'Shopkeeper 1', role: 'shopkeeper', location: { lat: 22.5726, lng: 88.3639 } },
        { id: 4, phone: '+919876543213', name: 'Admin', role: 'admin', location: { lat: 23.0225, lng: 72.5714 } }
    ],
    products: [
        { id: 1, name: 'Rice 5kg', price: 350, description: 'Premium Basmati Rice', image: '' },
        { id: 2, name: 'Wheat Flour 10kg', price: 450, description: 'Aashirvaad Atta', image: '' },
        { id: 3, name: 'Cooking Oil 5L', price: 650, description: 'Fortune Sunflower Oil', image: '' }
    ],
    orders: []
};

// Authentication middleware (simple phone+role based)
const authenticate = (req, res, next) => {
    const authHeader = req.headers.authorization;
    if (!authHeader) return res.status(401).json({ error: 'No auth header' });
    
    const [phone, role] = authHeader.split(':');
    const user = database.users.find(u => u.phone === phone && u.role === role);
    
    if (!user) return res.status(401).json({ error: 'Invalid credentials' });
    
    req.user = user;
    next();
};

// Routes
app.get('/api/user', authenticate, (req, res) => {
    res.json(req.user);
});

app.post('/api/login', (req, res) => {
    const { phone, role } = req.body;
    
    console.log('Login attempt:', { phone, role }); // Debug log
    
    // Find existing user
    let user = database.users.find(u => u.phone === phone && u.role === role);
    
    if (!user) {
        // Auto-register new user
        user = {
            id: Date.now(),
            phone: phone,
            name: phone.replace(/^\+91/, ''), // Clean name from phone
            role: role,
            location: { 
                lat: 20.5937 + (Math.random() - 0.5) * 5, 
                lng: 78.9629 + (Math.random() - 0.5) * 5 
            }
        };
        database.users.push(user);
        console.log('New user registered:', user);
    }
    
    res.json(user);
});
    
    if (user) {
        res.json(user);
    } else {
        // Auto-register new users
        const newUser = {
            id: Date.now(),
            phone,
            name: phone,
            role,
            location: { lat: 20.5937 + (Math.random() - 0.5) * 10, lng: 78.9629 + (Math.random() - 0.5) * 10 }
        };
        database.users.push(newUser);
        res.json(newUser);
    }
});

app.get('/api/users', authenticate, (req, res) => {
    const { role } = req.query;
    const filteredUsers = role 
        ? database.users.filter(u => u.role === role && u.id !== req.user.id)
        : database.users.filter(u => u.id !== req.user.id);
    res.json(filteredUsers);
});

app.get('/api/users/locations', authenticate, (req, res) => {
    res.json(database.users.filter(u => u.location));
});

app.post('/api/user/location', authenticate, (req, res) => {
    const userIndex = database.users.findIndex(u => u.id === req.user.id);
    if (userIndex !== -1) {
        database.users[userIndex].location = req.body;
    }
    io.emit('locationUpdate', req.user);
    res.json({ success: true });
});

// Products routes
app.get('/api/products', authenticate, (req, res) => {
    res.json(database.products);
});

app.post('/api/products', authenticate, (req, res) => {
    if (req.user.role !== 'admin' && req.user.role !== 'manufacturer') {
        return res.status(403).json({ error: 'Unauthorized' });
    }
    
    const newProduct = {
        id: Date.now(),
        ...req.body
    };
    database.products.push(newProduct);
    res.json(newProduct);
});

app.put('/api/products/:id', authenticate, (req, res) => {
    if (req.user.role !== 'admin') {
        return res.status(403).json({ error: 'Unauthorized' });
    }
    
    const index = database.products.findIndex(p => p.id == req.params.id);
    if (index !== -1) {
        database.products[index] = { ...database.products[index], ...req.body };
        res.json(database.products[index]);
    } else {
        res.status(404).json({ error: 'Product not found' });
    }
});

app.delete('/api/products/:id', authenticate, (req, res) => {
    if (req.user.role !== 'admin') {
        return res.status(403).json({ error: 'Unauthorized' });
    }
    
    database.products = database.products.filter(p => p.id != req.params.id);
    res.json({ success: true });
});

// Orders routes
app.get('/api/:role/orders', authenticate, (req, res) => {
    const { role } = req.params;
    let filteredOrders = [];

    if (role === 'manufacturer') {
        filteredOrders = database.orders.filter(o => !o.manufacturerId || o.manufacturerId === req.user.id);
    } else if (role === 'shopkeeper') {
        filteredOrders = database.orders.filter(o => o.shopkeeperId === req.user.id);
    } else if (role === 'transporter') {
        filteredOrders = database.orders.filter(o => o.status === 'accepted');
    } else {
        filteredOrders = database.orders;
    }

    // Populate related data
    const ordersWithDetails = filteredOrders.map(order => ({
        ...order,
        product: database.products.find(p => p.id === order.productId),
        shopkeeper: database.users.find(u => u.id === order.shopkeeperId),
        manufacturer: database.users.find(u => u.id === order.manufacturerId)
    }));

    res.json(ordersWithDetails);
});

app.get('/api/:role/dashboard', authenticate, (req, res) => {
    const orders = database.orders.filter(o => 
        o.manufacturerId === req.user.id || 
        o.shopkeeperId === req.user.id ||
        req.user.role === 'admin'
    );

    const stats = {
        totalOrders: orders.length,
        pendingOrders: orders.filter(o => o.status === 'pending').length,
        completedOrders: orders.filter(o => o.status === 'delivered').length
    };

    res.json({
        stats,
        recentOrders: orders.slice(0, 5)
    });
});

app.post('/api/orders', authenticate, (req, res) => {
    if (req.user.role !== 'manufacturer' && req.user.role !== 'shopkeeper') {
        return res.status(403).json({ error: 'Only manufacturers and shopkeepers can create orders' });
    }

    const order = {
        id: Date.now(),
        productId: parseInt(req.body.productId),
        quantity: parseInt(req.body.quantity),
        shopkeeperId: parseInt(req.body.shopkeeperId),
        manufacturerId: req.user.role === 'manufacturer' ? req.user.id : null,
        address: req.body.address,
        instructions: req.body.instructions,
        total: 0,
        status: 'pending',
        createdAt: new Date().toISOString()
    };

    const product = database.products.find(p => p.id === order.productId);
    if (product) {
        order.total = product.price * order.quantity;
    }

    database.orders.push(order);
    io.emit('newOrder', order);
    res.json(order);
});

app.post('/api/orders/:id/accept', authenticate, (req, res) => {
    if (req.user.role !== 'manufacturer') {
        return res.status(403).json({ error: 'Only manufacturers can accept orders' });
    }

    const order = database.orders.find(o => o.id == req.params.id);
    if (order && order.status === 'pending') {
        order.manufacturerId = req.user.id;
        order.status = 'accepted';
        io.emit('orderUpdate', order);
        res.json(order);
    } else {
        res.status(400).json({ error: 'Cannot accept this order' });
    }
});

app.post('/api/orders/:id/reject', authenticate, (req, res) => {
    const order = database.orders.find(o => o.id == req.params.id);
    if (order && order.status === 'pending') {
        order.status = 'rejected';
        io.emit('orderUpdate', order);
        res.json(order);
    } else {
        res.status(400).json({ error: 'Cannot reject this order' });
    }
});

app.post('/api/orders/:id/deliver', authenticate, (req, res) => {
    if (req.user.role !== 'transporter') {
        return res.status(403).json({ error: 'Only transporters can mark deliveries' });
    }

    const order = database.orders.find(o => o.id == req.params.id);
    if (order && order.status === 'accepted') {
        order.status = 'delivered';
        order.deliveredAt = new Date().toISOString();
        io.emit('orderUpdate', order);
        res.json(order);
    } else {
        res.status(400).json({ error: 'Cannot mark this order as delivered' });
    }
});

// Socket.IO for live updates
io.on('connection', (socket) => {
    console.log('User connected:', socket.id);

    socket.on('disconnect', () => {
        console.log('User disconnected:', socket.id);
    });
});

// Serve frontend
app.get('/', (req, res) => {
    res.sendFile(path.join(__dirname, 'public', 'index.html'));
});

const PORT = process.env.PORT || 3000;
server.listen(PORT, () => {
    console.log(`Server running on port ${PORT}`);
});
