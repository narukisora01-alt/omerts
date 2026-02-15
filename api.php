<?php
header('Content-Type: application/json');
header('Access-Control-Allow-Origin: *');

$SUPABASE_URL = "https://eoifhqfqjuzlvasiwunb.supabase.co";
$SUPABASE_KEY = "eyJhbGciOiJIUzI1NiIsInR5cCI6IkpXVCJ9.eyJpc3MiOiJzdXBhYmFzZSIsInJlZiI6ImVvaWZocWZxanV6bHZhc2l3dW5iIiwicm9sZSI6InNlcnZpY2Vfcm9sZSIsImlhdCI6MTc3MDMxNjE1MSwiZXhwIjoyMDg1ODkyMTUxfQ.gofumVnZhW1076LQ2nJgp__Moshn46J-F-1r8Ypc7NE";
$TURNSTILE_SECRET = "0x4AAAAAACcvzXWdrOFFXSH6i_0yC1oH3Bc";

$action = $_GET['action'] ?? '';

if ($action === 'auth') {
    $data = json_decode(file_get_contents('php://input'), true);
    $polytoria_id = $data['polytoria_id'];
    $turnstile_token = $data['turnstile_token'];

    $cf_verify = file_get_contents('https://challenges.cloudflare.com/turnstile/v0/siteverify', false, stream_context_create([
        'http' => ['method' => 'POST', 'header' => 'Content-Type: application/json', 'content' => json_encode(['secret' => $TURNSTILE_SECRET, 'response' => $turnstile_token])]
    ]));

    if (!json_decode($cf_verify, true)['success']) {
        die(json_encode(['success' => false, 'message' => 'Verification failed']));
    }

    $poly_user = json_decode(file_get_contents("https://api.polytoria.com/v1/users/$polytoria_id"), true);
    if (!isset($poly_user['username'])) {
        die(json_encode(['success' => false, 'message' => 'Invalid Polytoria ID']));
    }

    $user_data = json_decode(file_get_contents("$SUPABASE_URL/rest/v1/player_data?user_id=eq.$polytoria_id&select=*", false, stream_context_create([
        'http' => ['header' => "apikey: $SUPABASE_KEY\r\nAuthorization: Bearer $SUPABASE_KEY"]
    ])), true);

    if (empty($user_data)) {
        file_get_contents("$SUPABASE_URL/rest/v1/player_data", false, stream_context_create([
            'http' => ['method' => 'POST', 'header' => "apikey: $SUPABASE_KEY\r\nAuthorization: Bearer $SUPABASE_KEY\r\nContent-Type: application/json\r\nPrefer: return=representation", 'content' => json_encode(['user_id' => (int)$polytoria_id, 'username' => $poly_user['username'], 'cash' => 1000, 'bank' => 0, 'trust' => 50, 'heat' => 0, 'fear' => 0, 'inventory' => ''])]
        ]));
        $user_data = [['user_id' => (int)$polytoria_id, 'username' => $poly_user['username'], 'cash' => 1000]];
    }

    echo json_encode(['success' => true, 'user' => $user_data[0]]);
}

elseif ($action === 'values') {
    echo file_get_contents("$SUPABASE_URL/rest/v1/item_values?select=*", false, stream_context_create([
        'http' => ['header' => "apikey: $SUPABASE_KEY\r\nAuthorization: Bearer $SUPABASE_KEY"]
    ]));
}

elseif ($action === 'shop') {
    $values = json_decode(file_get_contents("$SUPABASE_URL/rest/v1/item_values?select=*", false, stream_context_create([
        'http' => ['header' => "apikey: $SUPABASE_KEY\r\nAuthorization: Bearer $SUPABASE_KEY"]
    ])), true);

    $shop = json_decode(file_get_contents("$SUPABASE_URL/rest/v1/shop_items?select=*", false, stream_context_create([
        'http' => ['header' => "apikey: $SUPABASE_KEY\r\nAuthorization: Bearer $SUPABASE_KEY"]
    ])), true);

    $result = array_map(function($item) use ($values) {
        $value = array_filter($values, fn($v) => $v['name'] === $item['name']);
        $value = reset($value);
        return ['name' => $item['name'], 'stock' => $item['stock'], 'price' => $value ? $value['value'] : 0];
    }, $shop);

    echo json_encode($result);
}

elseif ($action === 'purchase') {
    $data = json_decode(file_get_contents('php://input'), true);
    $polytoria_id = $data['polytoria_id'];
    $item_name = $data['item_name'];
    $price = $data['price'];

    $user_data = json_decode(file_get_contents("$SUPABASE_URL/rest/v1/player_data?user_id=eq.$polytoria_id&select=*", false, stream_context_create([
        'http' => ['header' => "apikey: $SUPABASE_KEY\r\nAuthorization: Bearer $SUPABASE_KEY"]
    ])), true)[0];

    if ($user_data['cash'] < $price) {
        die(json_encode(['success' => false, 'message' => 'Insufficient funds']));
    }

    $shop_data = json_decode(file_get_contents("$SUPABASE_URL/rest/v1/shop_items?name=eq.$item_name&select=*", false, stream_context_create([
        'http' => ['header' => "apikey: $SUPABASE_KEY\r\nAuthorization: Bearer $SUPABASE_KEY"]
    ])), true)[0];

    if ($shop_data['stock'] <= 0) {
        die(json_encode(['success' => false, 'message' => 'Out of stock']));
    }

    $new_cash = $user_data['cash'] - $price;
    $inventory = $user_data['inventory'] ? explode(',', $user_data['inventory']) : [];
    $found = false;

    foreach ($inventory as $key => $item) {
        if (strpos($item, $item_name) !== false) {
            preg_match('/x(\d+)/', $item, $matches);
            $count = isset($matches[1]) ? (int)$matches[1] + 1 : 2;
            $inventory[$key] = "$item_name x$count";
            $found = true;
            break;
        }
    }

    if (!$found) $inventory[] = "$item_name x1";

    file_get_contents("$SUPABASE_URL/rest/v1/player_data?user_id=eq.$polytoria_id", false, stream_context_create([
        'http' => ['method' => 'PATCH', 'header' => "apikey: $SUPABASE_KEY\r\nAuthorization: Bearer $SUPABASE_KEY\r\nContent-Type: application/json", 'content' => json_encode(['cash' => $new_cash, 'inventory' => implode(',', $inventory)])]
    ]));

    file_get_contents("$SUPABASE_URL/rest/v1/shop_items?name=eq.$item_name", false, stream_context_create([
        'http' => ['method' => 'PATCH', 'header' => "apikey: $SUPABASE_KEY\r\nAuthorization: Bearer $SUPABASE_KEY\r\nContent-Type: application/json", 'content' => json_encode(['stock' => $shop_data['stock'] - 1])]
    ]));

    echo json_encode(['success' => true, 'new_balance' => $new_cash]);
}
?>
