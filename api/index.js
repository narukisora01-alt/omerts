const SUPABASE_URL = "https://eoifhqfqjuzlvasiwunb.supabase.co";
const SUPABASE_KEY = "eyJhbGciOiJIUzI1NiIsInR5cCI6IkpXVCJ9.eyJpc3MiOiJzdXBhYmFzZSIsInJlZiI6ImVvaWZocWZxanV6bHZhc2l3dW5iIiwicm9sZSI6InNlcnZpY2Vfcm9sZSIsImlhdCI6MTc3MDMxNjE1MSwiZXhwIjoyMDg1ODkyMTUxfQ.gofumVnZhW1076LQ2nJgp__Moshn46J-F-1r8Ypc7NE";
const TURNSTILE_SECRET = "0x4AAAAAACcvzXWdrOFFXSH6i_0yC1oH3Bc";

export const config = {
    api: {
        bodyParser: true,
    },
};

export default async function handler(req, res) {
    res.setHeader('Access-Control-Allow-Origin', '*');
    res.setHeader('Content-Type', 'application/json');

    try {
        const { action } = req.query;

        if (action === 'auth' && req.method === 'POST') {
            const { polytoria_id, turnstile_token } = req.body;

            if (!polytoria_id || !turnstile_token) {
                return res.json({ success: false, message: `Missing data: polytoria_id=${polytoria_id}, turnstile=${!!turnstile_token}` });
            }

            const cfRes = await fetch('https://challenges.cloudflare.com/turnstile/v0/siteverify', {
                method: 'POST',
                headers: { 'Content-Type': 'application/json' },
                body: JSON.stringify({ secret: TURNSTILE_SECRET, response: turnstile_token })
            });
            const cfData = await cfRes.json();

            if (!cfData.success) {
                return res.json({ success: false, message: 'Turnstile failed', cf_errors: cfData['error-codes'] });
            }

            const userRes = await fetch(`${SUPABASE_URL}/rest/v1/player_data?user_id=eq.${polytoria_id}&select=*`, {
                headers: { apikey: SUPABASE_KEY, Authorization: `Bearer ${SUPABASE_KEY}` }
            });
            let userData = await userRes.json();

            if (!userData || userData.length === 0) {
                return res.json({ success: false, message: 'User ID not found in game database. Play the game first!' });
            }

            return res.json({ success: true, user: userData[0] });
        }

        if (action === 'values' && req.method === 'GET') {
            const valuesRes = await fetch(`${SUPABASE_URL}/rest/v1/item_values?select=*`, {
                headers: { apikey: SUPABASE_KEY, Authorization: `Bearer ${SUPABASE_KEY}` }
            });
            const data = await valuesRes.json();
            return res.json(data);
        }

        if (action === 'shop' && req.method === 'GET') {
            const valuesRes = await fetch(`${SUPABASE_URL}/rest/v1/item_values?select=*`, {
                headers: { apikey: SUPABASE_KEY, Authorization: `Bearer ${SUPABASE_KEY}` }
            });
            const values = await valuesRes.json();

            const shopRes = await fetch(`${SUPABASE_URL}/rest/v1/shop_items?select=*`, {
                headers: { apikey: SUPABASE_KEY, Authorization: `Bearer ${SUPABASE_KEY}` }
            });
            const shop = await shopRes.json();

            const result = shop.map(item => {
                const value = values.find(v => v.name === item.name);
                return {
                    name: item.name,
                    stock: item.stock,
                    price: value ? value.value : 0
                };
            });

            return res.json(result);
        }

        if (action === 'purchase' && req.method === 'POST') {
            const { polytoria_id, item_name, price } = req.body;

            const userRes = await fetch(`${SUPABASE_URL}/rest/v1/player_data?user_id=eq.${polytoria_id}&select=*`, {
                headers: { apikey: SUPABASE_KEY, Authorization: `Bearer ${SUPABASE_KEY}` }
            });
            const userData = (await userRes.json())[0];

            if (userData.cash < price) {
                return res.json({ success: false, message: 'Insufficient funds' });
            }

            const shopRes = await fetch(`${SUPABASE_URL}/rest/v1/shop_items?name=eq.${item_name}&select=*`, {
                headers: { apikey: SUPABASE_KEY, Authorization: `Bearer ${SUPABASE_KEY}` }
            });
            const shopData = (await shopRes.json())[0];

            if (shopData.stock <= 0) {
                return res.json({ success: false, message: 'Out of stock' });
            }

            const newCash = userData.cash - price;
            const inventory = userData.inventory ? userData.inventory.split(',').filter(i => i.trim()) : [];
            let found = false;

            for (let i = 0; i < inventory.length; i++) {
                if (inventory[i].includes(item_name)) {
                    const match = inventory[i].match(/x(\d+)/);
                    const count = match ? parseInt(match[1]) + 1 : 2;
                    inventory[i] = `${item_name} x${count}`;
                    found = true;
                    break;
                }
            }

            if (!found) inventory.push(`${item_name} x1`);

            await fetch(`${SUPABASE_URL}/rest/v1/player_data?user_id=eq.${polytoria_id}`, {
                method: 'PATCH',
                headers: { 
                    apikey: SUPABASE_KEY, 
                    Authorization: `Bearer ${SUPABASE_KEY}`,
                    'Content-Type': 'application/json'
                },
                body: JSON.stringify({ cash: newCash, inventory: inventory.join(',') })
            });

            await fetch(`${SUPABASE_URL}/rest/v1/shop_items?name=eq.${item_name}`, {
                method: 'PATCH',
                headers: { 
                    apikey: SUPABASE_KEY, 
                    Authorization: `Bearer ${SUPABASE_KEY}`,
                    'Content-Type': 'application/json'
                },
                body: JSON.stringify({ stock: shopData.stock - 1 })
            });

            return res.json({ success: true, new_balance: newCash });
        }

        return res.status(404).json({ error: 'Not found' });
    } catch (error) {
        console.error('API Error:', error);
        return res.status(500).json({ success: false, error: error.message, stack: error.stack });
    }
}
