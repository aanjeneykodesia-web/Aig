class SupplyChainApp {
    constructor() {
        this.currentUser = null;
        this.map = null;
        this.markers = {};
        this.userLocation = null;
        this.init();
    }

    init() {
        this.bindEvents();
        this.checkAuth();
        this.loadGoogleMaps();
    }

    bindEvents() {
        // Navigation
        document.querySelectorAll('.nav-link').forEach(link => {
            link.addEventListener('click', (e) => {
                e.preventDefault();
                this.showPage(link.dataset.page);
            });
        });

        // Forms
        document.getElementById('loginForm').addEventListener('submit', (e) => this.handleLogin(e));
        document.getElementById('orderForm').addEventListener('submit', (e) => this.handleOrderSubmit(e));
        document.getElementById('productForm').addEventListener('submit', (e) => this.handleProductSubmit(e));

        // Buttons
        document.getElementById('newOrderBtn').addEventListener('click', () => this.showModal('orderModal'));
        document.getElementById('addProductBtn').addEventListener('click', () => this.showModal('productModal'));

        // Modal close
        document.querySelectorAll('.close-modal').forEach(btn => {
            btn.addEventListener('click', () => this.hideModal());
        });

        // Close modal on overlay click
        document.querySelectorAll('.modal-overlay').forEach(modal => {
            modal.addEventListener('click', (e) => {
                if (e.target === modal) this.hideModal();
            });
        });

        // Mobile menu toggle
        document.getElementById('navToggle').addEventListener('click', () => {
            document.getElementById('navMenu').classList.toggle('active');
        });
    }

    async checkAuth() {
        try {
            const response = await fetch('/api/user');
            if (response.ok) {
                this.currentUser = await response.json();
                this.showApp();
                this.loadUserData();
            } else {
                this.showLogin();
            }
        } catch (error) {
            console.error('Auth check failed:', error);
            this.showLogin();
        }
    }

    showLogin() {
        document.getElementById('loginModal').classList.add('active');
    }

    showApp() {
        document.getElementById('loginModal').classList.remove('active');
        document.body.classList.add('authenticated');
    }

    async handleLogin(e) {
        e.preventDefault();
        const phone = document.getElementById('phone').value;
        const role = document.getElementById('role').value;

        try {
            const response = await fetch('/api/login', {
                method: 'POST',
                headers: { 'Content-Type': 'application/json' },
                body: JSON.stringify({ phone, role })
            });

            if (response.ok) {
                this.currentUser = await response.json();
                this.showApp();
                this.loadUserData();
                this.showNotification('Login successful!', 'success');
            } else {
                this.showNotification('Login failed. Please try again.', 'error');
            }
        } catch (error) {
            this.showNotification('Network error. Please check your connection.', 'error');
        }
    }

    async loadUserData() {
        await this.loadDashboard();
        await this.loadOrders();
        await this.loadProducts();
        await this.updateProfile();
        this.updateStats();
        this.startLiveTracking();
    }

    async loadDashboard() {
        try {
            const response = await fetch(`/api/${this.currentUser.role}/dashboard`);
            const data = await response.json();
            this.renderRecentOrders(data.recentOrders);
            this.updateStats(data.stats);
            document.getElementById('dashboardTitle').textContent = 
                `Welcome back, ${this.currentUser.name || 'User'}!`;
        } catch (error) {
            console.error('Dashboard load failed:', error);
        }
    }

    showPage(pageId) {
        document.querySelectorAll('.page').forEach(page => page.classList.remove('active'));
        document.querySelectorAll('.nav-link').forEach(link => link.classList.remove('active'));
        document.getElementById(pageId).classList.add('active');
        document.querySelector(`[data-page="${pageId}"]`).classList.add('active');

        if (pageId === 'track') {
            this.initMap();
        }
    }

    showModal(modalId) {
        document.getElementById(modalId).classList.add('active');
        if (modalId === 'orderModal') {
            this.loadOrderForm();
        }
    }

    hideModal() {
        document.querySelectorAll('.modal-overlay').forEach(modal => {
            modal.classList.remove('active');
        });
    }

    async loadOrderForm() {
        try {
            // Load products
            const productsRes = await fetch('/api/products');
            const products = await productsRes.json();
            const productSelect = document.getElementById('orderProduct');
            productSelect.innerHTML = '<option value="">Select Product</option>';
            products.forEach(product => {
                productSelect.innerHTML += `<option value="${product.id}" data-price="${product.price}">${product.name} - ₹${product.price}</option>`;
            });

            // Load shopkeepers (for manufacturers)
            if (this.currentUser.role === 'manufacturer') {
                const shopkeepersRes = await fetch('/api/users?role=shopkeeper');
                const shopkeepers = await shopkeepersRes.json();
                const shopkeeperSelect = document.getElementById('orderShopkeeper');
                shopkeeperSelect.innerHTML = '<option value="">Select Shopkeeper</option>';
                shopkeepers.forEach(shopkeeper => {
                    shopkeeperSelect.innerHTML += `<option value="${shopkeeper.id}">${shopkeeper.name} (${shopkeeper.phone})</option>`;
                });
            }
        } catch (error) {
            console.error('Load order form failed:', error);
        }
    }

    async handleOrderSubmit(e) {
        e.preventDefault();
        const formData = {
            productId: document.getElementById('orderProduct').value,
            quantity: document.getElementById('orderQuantity').value,
            shopkeeperId: document.getElementById('orderShopkeeper').value,
            address: document.getElementById('orderAddress').value,
            instructions: document.getElementById('orderInstructions').value
        };

        try {
            const response = await fetch('/api/orders', {
                method: 'POST',
                headers: { 'Content-Type': 'application/json' },
                body: JSON.stringify(formData)
            });

            if (response.ok) {
                this.hideModal();
                this.showNotification('Order created successfully!', 'success');
                this.loadOrders();
                this.loadDashboard();
            }
        } catch (error) {
            this.showNotification('Failed to create order.', 'error');
        }
    }

    async loadOrders() {
        try {
            const response = await fetch(`/api/${this.currentUser.role}/orders`);
            const orders = await response.json();
            this.renderOrders(orders);
        } catch (error) {
            console.error('Orders load failed:', error);
        }
    }

    renderOrders(orders) {
        const container = document.getElementById('ordersList');
        container.innerHTML = '';

        orders.forEach(order => {
            const orderEl = document.createElement('div');
            orderEl.className = 'order-item';
            orderEl.innerHTML = `
                <div class="order-header">
                    <h4>Order #${order.id}</h4>
                    <span class="order-status status-${order.status}">${order.status.toUpperCase()}</span>
                </div>
                <div class="order-details">
                    <p><strong>Product:</strong> ${order.product.name}</p>
                    <p><strong>Quantity:</strong> ${order.quantity}</p>
                    <p><strong>Total:</strong> ₹${order.total}</p>
                    ${order.shopkeeper ? `<p><strong>Shopkeeper:</strong> ${order.shopkeeper.name}</p>` : ''}
                    ${order.manufacturer ? `<p><strong>Manufacturer:</strong> ${order.manufacturer.name}</p>` : ''}
                    <p><strong>Address:</strong> ${order.address}</p>
                    ${order.status === 'pending' && this.currentUser.role === 'manufacturer' ? 
                        `<div style="margin-top: 1rem;">
                            <button class="btn-success btn-sm" onclick="app.acceptOrder(${order.id})">Accept</button>
                            <button class="btn-danger btn-sm" onclick="app.rejectOrder(${order.id})">Reject</button>
                        </div>` : ''}
                    ${order.status === 'accepted' && this.currentUser.role === 'transporter' ? 
                        `<div style="margin-top: 1rem;">
                            <button class="btn-success btn-sm" onclick="app.markDelivered(${order.id})">Mark Delivered</button>
                        </div>` : ''}
                </div>
            `;
            container.appendChild(orderEl);
        });
    }

    async acceptOrder(orderId) {
        try {
            await fetch(`/api/orders/${orderId}/accept`, { method: 'POST' });
            this.showNotification('Order accepted!', 'success');
            this.loadOrders();
        } catch (error) {
            this.showNotification('Failed to accept order.', 'error');
        }
    }

    async rejectOrder(orderId) {
        try {
            await fetch(`/api/orders/${orderId}/reject`, { method: 'POST' });
            this.showNotification('Order rejected.', 'success');
            this.loadOrders();
        } catch (error) {
            this.showNotification('Failed to reject order.', 'error');
        }
    }

    async markDelivered(orderId) {
        try {
            await fetch(`/api/orders/${orderId}/deliver`, { method: 'POST' });
            this.showNotification('Order marked as delivered!', 'success');
            this.loadOrders();
        } catch (error) {
            this.showNotification('Failed to update delivery status.', 'error');
        }
    }

    renderRecentOrders(orders) {
        const container = document.getElementById('recentOrders');
        container.innerHTML = orders.slice(0, 5).map(order => `
            <div class="order-item">
                <div style="display: flex; justify-content: space-between; align-items: center;">
                    <span>${order.product?.name || 'N/A'}</span>
                    <span class="order-status status-${order.status}">${order.status}</span>
                </div>
            </div>
        `).join('');
    }

    updateStats(stats) {
        document.getElementById('totalOrders').textContent = stats.totalOrders || 0;
        document.getElementById('pendingOrders').textContent = stats.pendingOrders || 0;
        document.getElementById('completedOrders').textContent = stats.completedOrders || 0;
    }

    async loadProducts() {
        try {
            const response = await fetch('/api/products');
            const products = await response.json();
            this.renderProducts(products);
        } catch (error) {
            console.error('Products load failed:', error);
        }
    }

    renderProducts(products) {
        const container = document.getElementById('productsGrid');
        container.innerHTML = products.map(product => `
            <div class="product-card">
                <img src="${product.image || 'https://via.placeholder.com/300x200?text=Product'}" 
                     alt="${product.name}" class="product-image">
                <div class="product-info">
                    <h4>${product.name}</h4>
                    <p class="price">₹${product.price}</p>
                    <p>${product.description || 'No description'}</p>
                    ${this.currentUser.role === 'admin' ? `
                        <div class="product-actions">
                            <button class="btn-primary btn-sm" onclick="app.editProduct(${product.id})">
                                <i class="fas fa-edit"></i>
                            </button>
                            <button class="btn-danger btn-sm" onclick="app.deleteProduct(${product.id})">
                                <i class="fas fa-trash"></i>
                            </button>
                        </div>
                    ` : ''}
                </div>
            </div>
        `).join('');
    }

    editProduct(productId) {
        // Fetch product details and populate form
        this.showModal('productModal');
        document.getElementById('productModalTitle').textContent = 'Edit Product';
    }

    async deleteProduct(productId) {
        if (confirm('Are you sure you want to delete this product?')) {
            try {
                await fetch(`/api/products/${productId}`, { method: 'DELETE' });
                this.showNotification('Product deleted!', 'success');
                this.loadProducts();
            } catch (error) {
                this.showNotification('Failed to delete product.', 'error');
            }
        }
    }

    async handleProductSubmit(e) {
        e.preventDefault();
        const productId = document.getElementById('productId').value;
        const formData = {
            name: document.getElementById('productName').value,
            price: document.getElementById('productPrice').value,
            description: document.getElementById('productDescription').value,
            image: document.getElementById('productImage').value
        };

        try {
            const url = productId ? `/api/products/${productId}` : '/api/products';
            const method = productId ? 'PUT' : 'POST';
            
            await fetch(url, {
                method,
                headers: { 'Content-Type': 'application/json' },
                body: JSON.stringify(formData)
            });

            this.hideModal();
            this.showNotification('Product saved!', 'success');
            this.loadProducts();
        } catch (error) {
            this.showNotification('Failed to save product.', 'error');
        }
    }

    updateProfile() {
        document.getElementById('userName').textContent = this.currentUser.name || this.currentUser.phone;
        document.getElementById('profileName').textContent = this.currentUser.name || 'User';
        document.getElementById('profilePhone').textContent = this.currentUser.phone;
        document.getElementById('profileRole').textContent = this.currentUser.role.toUpperCase();
        document.getElementById('profileLocation').textContent = 
            this.currentUser.location ? `${this.currentUser.location.lat.toFixed(4)}, ${this.currentUser.location.lng.toFixed(4)}` : 'Not set';
    }

    loadGoogleMaps() {
        if (typeof google === 'undefined') {
            setTimeout(() => this.loadGoogleMaps(), 1000);
            return;
        }
        this.initMap();
    }

    initMap() {
        if (!this.map) {
            this.map = new google.maps.Map(document.getElementById('map'), {
                center: { lat: 20.5937, lng: 78.9629 }, // India center
                zoom: 5
            });
        }
        this.updateMapMarkers();
    }

    async startLiveTracking() {
        if (this.currentUser.role !== 'transporter' && this.currentUser.role !== 'shopkeeper') return;

        // Simulate live location updates
        setInterval(async () => {
            if (this.currentUser.role === 'transporter') {
                await this.updateTransporterLocation();
            }
            this.updateMapMarkers();
        }, 5000);
    }

    async updateTransporterLocation() {
        // Simulate GPS location
        this.userLocation = {
            lat: 20.5937 + (Math.random() - 0.5) * 0.1,
            lng: 78.9629 + (Math.random() - 0.5) * 0.1
        };

        await fetch('/api/user/location', {
            method: 'POST',
            headers: { 'Content-Type': 'application/json' },
            body: JSON.stringify(this.userLocation)
        });
    }

    async updateMapMarkers() {
        if (!this.map) return;

        // Clear existing markers
        Object.values(this.markers).forEach(marker => marker.setMap(null));
        this.markers = {};

        try {
            const response = await fetch('/api/users/locations');
            const locations = await response.json();

            locations.forEach(user => {
                const marker = new google.maps.Marker({
                    position: user.location,
                    map: this.map,
                    title: `${user.name} (${user.role})`,
                    icon: {
                        url: `https://maps.google.com/mapfiles/ms/icons/${this.getMarkerColor(user.role)}-dot.png`,
                        scaledSize: new google.maps.Size(40, 40)
                    }
                });

                const infoWindow = new google.maps.InfoWindow({
                    content: `
                        <div style="padding: 10px;">
                            <strong>${user.name}</strong><br>
                            ${user.phone}<br>
                            <em>${user.role}</em>
                        </div>
                    `
                });

                marker.addListener('click', () => {
                    infoWindow.open(this.map, marker);
                });

                this.markers[user.id] = marker;
            });

            if (this.userLocation) {
                this.map.setCenter(this.userLocation);
            }
        } catch (error) {
            console.error('Map update failed:', error);
        }
    }

    getMarkerColor(role) {
        const colors = {
            manufacturer: 'red',
            transporter: 'blue',
            shopkeeper: 'green',
            admin: 'yellow'
        };
        return colors[role] || 'gray';
    }

    showNotification(message, type = 'info') {
        const container = document.getElementById('notificationContainer');
        const notification = document.createElement('div');
        notification.className = `notification notification-${type}`;
        notification.innerHTML = `
            <i class="fas ${type === 'success' ? 'fa-check-circle' : 'fa-exclamation-circle'}"></i>
            ${message}
        `;
        
        container.appendChild(notification);
        
        setTimeout(() => {
            notification.remove();
        }, 5000);
    }
}

// Global app instance
const app = new SupplyChainApp();
