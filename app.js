/**
 * Smart Surplus Food Intelligence System - App Core
 */

// --- Application State ---
const State = {
    currentRole: null, // 'provider', 'shelter', 'volunteer'
    foodItems: [
        {
            id: '1',
            provider: 'Global Events Center',
            type: 'Vegetable Biryani',
            quantity: '30 plates',
            prepTime: '2026-02-25T18:00',
            storage: 'Hot Container',
            rank: 'Immediate Use',
            status: 'available', // available, accepted, picked_up, delivered
            location: 'Downtown, Sector 5',
            shelter: null
        },
        {
            id: '2',
            provider: 'Corporate Mess',
            type: 'Sandwiches & Salads',
            quantity: '15 packs',
            prepTime: '2026-02-25T14:00',
            storage: 'Refrigerated',
            rank: 'Safe for Later Use',
            status: 'available',
            location: 'IT Park, East Wing',
            shelter: null
        },
        {
            id: '3',
            provider: 'Corporate Mess',
            type: 'Sambar',
            quantity: '15 litres',
            prepTime: '2026-02-25T14:00',
            storage: 'Refrigerated',
            rank: 'Safe for Later Use',
            status: 'available',
            location: 'Vec,chennai',
            shelter: null
        }
    ],
    notifications: []
};

// --- Intelligence Logic ---

function calculateFreshness(prepTimeStr, storageType) {
    const prepTime = new Date(prepTimeStr);
    const now = new Date();
    const hoursElapsed = (now - prepTime) / (1000 * 60 * 60);

    let rank = 'Not Suitable';
    
    if (storageType === 'Hot Container') {
        if (hoursElapsed < 2) rank = 'Immediate Use';
        else if (hoursElapsed < 4) rank = 'Safe for Later Use';
    } else if (storageType === 'Refrigerated') {
        if (hoursElapsed < 12) rank = 'Safe for Later Use';
        else if (hoursElapsed < 24) rank = 'Immediate Use';
    } else {
        // Room Temperature
        if (hoursElapsed < 3) rank = 'Immediate Use';
    }

    return rank;
}

// --- View Rendering ---

const UI = {
    renderLogin: () => {
        document.getElementById('role-switcher').classList.add('hidden');
        document.getElementById('content-area').innerHTML = `
            <div class="fade-in" style="text-align: center; padding-top: 40px;">
                <div style="font-size: 3rem; margin-bottom: 20px;">🥗</div>
                <h2 style="margin-bottom: 24px;">Welcome to Smart Surplus</h2>
                <p style="color: var(--text-muted); margin-bottom: 32px;">Please select your role to continue</p>
                
                <div style="display: grid; gap: 16px;">
                    <button class="btn btn-secondary" onclick="App.setRole('provider')">🏢 Food Provider</button>
                    <button class="btn btn-secondary" onclick="App.setRole('shelter')">🏠 Shelter / Home</button>
                    <button class="btn btn-secondary" onclick="App.setRole('volunteer')">🚴 Volunteer</button>
                </div>
            </div>
        `;
    },

    renderProviderDashboard: () => {
        const myItems = State.foodItems.filter(f => f.status !== 'delivered');
        
        document.getElementById('content-area').innerHTML = `
            <div class="fade-in">
                <div style="display: flex; justify-content: space-between; align-items: center; margin-bottom: 20px;">
                    <h3>Provider Dashboard</h3>
                </div>

                <div class="card" style="border-left: 4px solid var(--primary);">
                    <h4 style="margin-bottom: 12px;">Add Surplus Food</h4>
                    <form id="food-form" onsubmit="App.addFood(event)">
                        <div class="form-group">
                            <label>Food Type</label>
                            <input type="text" id="foodType" placeholder="e.g. Pasta, Meals" required>
                        </div>
                        <div class="form-group">
                            <label>Quantity</label>
                            <input type="text" id="quantity" placeholder="e.g. 10 kg, 20 plates" required>
                        </div>
                        <div class="form-group">
                            <label>Preparation Time</label>
                            <input type="datetime-local" id="prepTime" required>
                        </div>
                        <div class="form-group">
                            <label>Storage Condition</label>
                            <select id="storage">
                                <option>Room Temperature</option>
                                <option>Refrigerated</option>
                                <option>Hot Container</option>
                            </select>
                        </div>
                        <button type="submit" class="btn btn-primary">Post Food Request</button>
                    </form>
                </div>

                <h4 style="margin: 24px 0 12px;">Active Requests</h4>
                ${myItems.map(item => `
                    <div class="card">
                        <div style="display: flex; justify-content: space-between;">
                            <strong>${item.type}</strong>
                            <span class="badge ${item.rank === 'Immediate Use' ? 'badge-danger' : 'badge-success'}">${item.rank}</span>
                        </div>
                        <p style="font-size: 0.85rem; color: var(--text-muted); margin-top: 4px;">Qty: ${item.quantity} | Status: ${item.status}</p>
                    </div>
                `).join('')}
            </div>
        `;
    },

    renderShelterDashboard: () => {
        const available = State.foodItems.filter(f => f.status === 'available');
        const myOrders = State.foodItems.filter(f => f.shelter === 'My Shelter');

        document.getElementById('content-area').innerHTML = `
            <div class="fade-in">
                <h3>Nearby Available Food</h3>
                <p style="font-size: 0.85rem; color: var(--text-muted); margin-bottom: 20px;">Finding requests near your location...</p>

                ${available.length === 0 ? '<p>No food available nearby right now.</p>' : available.map(item => `
                    <div class="card">
                        <div style="display: flex; justify-content: space-between; margin-bottom: 8px;">
                            <strong>${item.type}</strong>
                            <span class="badge ${item.rank === 'Immediate Use' ? 'badge-danger' : 'badge-success'}">${item.rank}</span>
                        </div>
                        <p style="font-size: 0.85rem; color: var(--text-muted);">From: ${item.provider}</p>
                        <p style="font-size: 0.85rem; color: var(--text-muted); margin-bottom: 12px;">Quantity: ${item.quantity}</p>
                        
                        <div style="display: grid; grid-template-columns: 1fr 1fr; gap: 10px;">
                            <button class="btn btn-secondary" onclick="App.acceptFood('${item.id}', 'now')">Use Now</button>
                            <button class="btn btn-secondary" onclick="App.acceptFood('${item.id}', 'later')">Use Later</button>
                        </div>
                    </div>
                `).join('')}

                ${myOrders.length > 0 ? `
                    <h4 style="margin: 24px 0 12px;">Delivery Status</h4>
                    ${myOrders.map(item => `
                        <div class="card">
                            <div style="display: flex; justify-content: space-between;">
                                <strong>${item.type}</strong>
                                <span class="badge" style="background: #e0f2fe; color: #0369a1;">${item.status.replace('_', ' ')}</span>
                            </div>
                        </div>
                    `).join('')}
                ` : ''}
            </div>
        `;
    },

    renderVolunteerDashboard: () => {
        const requests = State.foodItems.filter(f => f.status === 'accepted' || f.status === 'picked_up');

        document.getElementById('content-area').innerHTML = `
            <div class="fade-in">
                <h3>Pickup Requests</h3>
                <p style="font-size: 0.85rem; color: var(--text-muted); margin-bottom: 20px;">Available deliveries in your area</p>

                ${requests.length === 0 ? '<p>No delivery tasks currently assigned.</p>' : requests.map(item => `
                    <div class="card">
                        <div style="margin-bottom: 12px;">
                            <span class="badge badge-warning">Task: Delivery</span>
                            <strong style="display: block; margin-top: 8px;">${item.type} (${item.quantity})</strong>
                        </div>
                        
                        <div style="font-size: 0.85rem; background: var(--bg-gray); padding: 10px; border-radius: 8px; margin-bottom: 12px;">
                            <p><strong>📍 Pickup:</strong> ${item.location}</p>
                            <p><strong>📍 Drop:</strong> ${item.shelter || 'Shelter Center'}</p>
                        </div>

                        ${item.status === 'accepted' ? 
                            `<button class="btn btn-primary" onclick="App.updateStatus('${item.id}', 'picked_up')">Confirm Pickup</button>` :
                            `<button class="btn btn-success" onclick="App.updateStatus('${item.id}', 'delivered')">Confirm Delivery</button>`
                        }
                    </div>
                `).join('')}
            </div>
        `;
    }
};

// --- App Control Logic ---

window.App = {
    init: () => {
        UI.renderLogin();
    },

    setRole: (role) => {
        State.currentRole = role;
        document.getElementById('role-switcher').classList.remove('hidden');
        if (role === 'provider') UI.renderProviderDashboard();
        if (role === 'shelter') UI.renderShelterDashboard();
        if (role === 'volunteer') UI.renderVolunteerDashboard();
    },

    addFood: (e) => {
        e.preventDefault();
        const food = {
            id: Date.now().toString(),
            provider: 'Global Events Center',
            type: document.getElementById('foodType').value,
            quantity: document.getElementById('quantity').value,
            prepTime: document.getElementById('prepTime').value,
            storage: document.getElementById('storage').value,
            status: 'available',
            location: 'Downtown, Sector 5',
            shelter: null
        };
        
        food.rank = calculateFreshness(food.prepTime, food.storage);
        State.foodItems.unshift(food);
        UI.renderProviderDashboard();
        App.showToast('Food request added successfully!');
    },

    acceptFood: (id, usage) => {
        const item = State.foodItems.find(f => f.id === id);
        item.status = 'accepted';
        item.shelter = 'Old age home';
        item.plannedUsage = usage;
        UI.renderShelterDashboard();
        App.showToast('Food request accepted. Volunteer notified!');
    },

    updateStatus: (id, status) => {
        const item = State.foodItems.find(f => f.id === id);
        item.status = status;
        UI.renderVolunteerDashboard();
        App.showToast(status === 'delivered' ? 'Delivery confirmed!' : 'Pickup confirmed!');
    },

    showToast: (msg) => {
        const toast = document.getElementById('notification-toast');
        toast.textContent = msg;
        toast.classList.remove('hidden');
        toast.classList.add('fade-in');
        setTimeout(() => toast.classList.add('hidden'), 3000);
    }
};

document.getElementById('role-switcher').onclick = () => {
    State.currentRole = null;
    UI.renderLogin();
};

App.init();
