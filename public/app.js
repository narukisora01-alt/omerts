const API_URL = '/api';
let currentUser = null;

async function login() {
    const polyId = document.getElementById('polytoria-id').value;
    const turnstileToken = document.querySelector('[name="cf-turnstile-response"]').value;
    
    if (!polyId || !turnstileToken) {
        alert('Please complete verification');
        return;
    }
    
    const res = await fetch(`${API_URL}/auth`, {
        method: 'POST',
        headers: { 'Content-Type': 'application/json' },
        body: JSON.stringify({ polytoria_id: polyId, turnstile_token: turnstileToken })
    });
    
    const data = await res.json();
    
    if (data.success) {
        currentUser = data.user;
        document.getElementById('auth-screen').classList.add('hidden');
        document.getElementById('main-screen').classList.remove('hidden');
        document.getElementById('username').textContent = `Welcome ${data.user.username}!`;
        document.getElementById('balance').textContent = `$${data.user.cash}`;
        showValues();
    } else {
        alert(data.message || 'Login failed');
    }
}

async function showValues() {
    document.getElementById('values-section').classList.remove('hidden');
    document.getElementById('shop-section').classList.add('hidden');
    
    const res = await fetch(`${API_URL}/values`);
    const data = await res.json();
    
    const list = document.getElementById('values-list');
    list.innerHTML = '';
    
    data.forEach(item => {
        const change = item.value - item.base_value;
        const changePercent = ((change / item.base_value) * 100).toFixed(1);
        const color = change >= 0 ? 'text-green-400' : 'text-red-400';
        const arrow = change >= 0 ? '↑' : '↓';
        
        list.innerHTML += `
            <div class="bg-gray-800 p-4 rounded-lg">
                <h3 class="text-xl font-bold">${item.name}</h3>
                <p class="text-2xl ${color}">$${item.value}</p>
                <p class="${color}">${arrow} ${Math.abs(changePercent)}%</p>
            </div>
        `;
    });
}

async function showShop() {
    document.getElementById('values-section').classList.add('hidden');
    document.getElementById('shop-section').classList.remove('hidden');
    
    const res = await fetch(`${API_URL}/shop`);
    const data = await res.json();
    
    const list = document.getElementById('shop-list');
    list.innerHTML = '';
    
    data.forEach(item => {
        list.innerHTML += `
            <div class="bg-gray-800 p-4 rounded-lg">
                <h3 class="text-xl font-bold">${item.name}</h3>
                <p class="text-gray-400">Stock: ${item.stock}</p>
                <p class="text-2xl text-green-400">$${item.price}</p>
                <button onclick="buyItem('${item.name}', ${item.price})" class="mt-2 w-full bg-blue-600 hover:bg-blue-700 px-4 py-2 rounded">
                    Buy
                </button>
            </div>
        `;
    });
}

async function buyItem(itemName, price) {
    const res = await fetch(`${API_URL}/purchase`, {
        method: 'POST',
        headers: { 'Content-Type': 'application/json' },
        body: JSON.stringify({ 
            polytoria_id: currentUser.polytoria_id,
            item_name: itemName,
            price: price
        })
    });
    
    const data = await res.json();
    
    if (data.success) {
        alert('Successfully Purchased!');
        currentUser.cash = data.new_balance;
        document.getElementById('balance').textContent = `$${data.new_balance}`;
        showShop();
    } else {
        alert(data.message || 'Purchase failed');
    }
}
