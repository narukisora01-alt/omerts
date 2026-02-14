import { createClient } from '@supabase/supabase-js';

const supabase = createClient(
    process.env.SUPABASE_URL,
    process.env.SUPABASE_KEY
);

export default async function handler(req, res) {
    res.setHeader('Access-Control-Allow-Origin', '*');
    res.setHeader('Access-Control-Allow-Methods', 'GET, POST');
    res.setHeader('Access-Control-Allow-Headers', 'Content-Type');

    if (req.method === 'OPTIONS') {
        return res.status(200).end();
    }

    const path = req.url.split('?')[0];

    if (path === '/api/auth' && req.method === 'POST') {
        const { polytoria_id, turnstile_token } = req.body;

        const cfRes = await fetch('https://challenges.cloudflare.com/turnstile/v0/siteverify', {
            method: 'POST',
            headers: { 'Content-Type': 'application/json' },
            body: JSON.stringify({
                secret: process.env.TURNSTILE_SECRET,
                response: turnstile_token
            })
        });

        const cfData = await cfRes.json();
        if (!cfData.success) {
            return res.json({ success: false, message: 'Verification failed' });
        }

        const polyRes = await fetch(`https://api.polytoria.com/v1/users/${polytoria_id}`);
        const polyData = await polyRes.json();

        if (!polyData.username) {
            return res.json({ success: false, message: 'Invalid Polytoria ID' });
        }

        const { data: existing } = await supabase
            .from('player_data')
            .select('*')
            .eq('user_id', polytoria_id)
            .single();

        if (!existing) {
            await supabase.from('player_data').insert({
                user_id: polytoria_id,
                username: polyData.username,
                cash: 1000,
                bank: 0,
                trust: 50,
                heat: 0,
                fear: 0,
                inventory: ''
            });
        }

        const { data: user } = await supabase
            .from('player_data')
            .select('*')
            .eq('user_id', polytoria_id)
            .single();

        return res.json({ success: true, user: { ...user, polytoria_id } });
    }

    if (path === '/api/values' && req.method === 'GET') {
        const { data } = await supabase.from('item_values').select('*');
        return res.json(data || []);
    }

    if (path === '/api/shop' && req.method === 'GET') {
        const { data: values } = await supabase.from('item_values').select('*');
        const { data: shop } = await supabase.from('shop_items').select('*');

        const items = shop.map(item => {
            const value = values.find(v => v.name === item.name);
            return {
                ...item,
                price: value ? value.value : item.price
            };
        });

        return res.json(items || []);
    }

    if (path === '/api/purchase' && req.method === 'POST') {
        const { polytoria_id, item_name, price } = req.body;

        const { data: user } = await supabase
            .from('player_data')
            .select('*')
            .eq('user_id', polytoria_id)
            .single();

        if (!user || user.cash < price) {
            return res.json({ success: false, message: 'Insufficient funds' });
        }

        const { data: shopItem } = await supabase
            .from('shop_items')
            .select('*')
            .eq('name', item_name)
            .single();

        if (!shopItem || shopItem.stock <= 0) {
            return res.json({ success: false, message: 'Out of stock' });
        }

        const newCash = user.cash - price;
        const currentInv = user.inventory ? user.inventory.split(',') : [];
        const itemEntry = currentInv.find(i => i.includes(item_name));

        let newInv;
        if (itemEntry) {
            const [name, count] = itemEntry.split(' x');
            const newCount = parseInt(count) + 1;
            newInv = currentInv.map(i => i.includes(item_name) ? `${name} x${newCount}` : i).join(',');
        } else {
            currentInv.push(`${item_name} x1`);
            newInv = currentInv.join(',');
        }

        await supabase
            .from('player_data')
            .update({ cash: newCash, inventory: newInv })
            .eq('user_id', polytoria_id);

        await supabase
            .from('shop_items')
            .update({ stock: shopItem.stock - 1 })
            .eq('name', item_name);

        return res.json({ success: true, new_balance: newCash });
    }

    return res.status(404).json({ error: 'Not found' });
}
