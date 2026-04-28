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
        // ALWAYS show login first - no auto-auth check
        this.showLoginScreen();
    }

    bindEvents() {
        // ... existing event bindings ...

        // Login form
        const loginForm = document.getElementById('loginForm');
        if (loginForm) {
            loginForm.addEventListener('submit', (e) => this.handleLogin(e));
        }

        // ... rest of existing bindings ...
    }

    /** Show login screen FIRST - no auth check */
    showLoginScreen() {
        // Hide all pages
        document.querySelectorAll('.page').forEach(page => {
            page.style.display = 'none';
        });
        
        // Show login modal prominently
        const loginModal = document.getElementById('loginModal');
        loginModal.classList.add('active');
        loginModal.style.display = 'flex';
        
        // Hide navbar initially
        document.querySelector('.navbar').style.display = 'none';
        
        // Clear any user data
        this.currentUser = null;
    }

    /** Hide login and show app */
    showApp() {
        // Hide login modal
        const loginModal = document.getElementById('loginModal');
        loginModal.classList.remove('active');
        loginModal.style.display = 'none';
        
        // Show navbar
        document.querySelector('.navbar').style.display = 'block';
        
        // Show dashboard by default
        this.showPage('dashboard');
        
        document.body.classList.add('authenticated');
    }

    async handleLogin(e) {
        e.preventDefault();
        
        const phone = document.getElementById('phone').value.trim();
        const role = document.getElementById('role').value;

        if (!phone || !role) {
            this.showNotification('Please enter phone and select role', 'error');
            return;
        }

        // Show loading
        const submitBtn = e.target.querySelector('button[type="submit"]');
        const originalText = submitBtn.innerHTML;
        submitBtn.innerHTML = '<i class="fas fa-spinner fa-spin"></i> Logging in...';
        submitBtn.disabled = true;

        try {
            const response = await fetch('/api/login', {
                method: 'POST',
                headers: { 
                    'Content-Type': 'application/json',
                    'Authorization': `${phone}:${role}` // Send auth in header
                },
                body: JSON.stringify({ phone, role })
            });

            if (response.ok) {
                this.currentUser = await response.json();
                this.showApp();
                await this.loadUserData();
                this.showNotification(`Welcome ${this.currentUser.name || this.currentUser.phone}!`, 'success');
                
                // Update user info in navbar
                document.getElementById('userName').textContent = 
                    this.currentUser.name || this.currentUser.phone;
                    
            } else {
                const error = await response.json();
                this.showNotification(error.error || 'Login failed. Try again.', 'error');
            }
        } catch (error) {
            console.error('Login error:', error);
            this.showNotification('Network error. Please check connection.', 'error');
        } finally {
            // Reset button
            submitBtn.innerHTML = originalText;
            submitBtn.disabled = false;
        }
    }

    // Add logout functionality
    logout() {
        this.currentUser = null;
        document.body.classList.remove('authenticated');
        document.querySelector('.navbar').style.display = 'none';
        this.showLoginScreen();
        this.showNotification('Logged out successfully', 'success');
    }
}
