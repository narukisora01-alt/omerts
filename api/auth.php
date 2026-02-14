<?php
header('Content-Type: application/json');
header('Access-Control-Allow-Origin: *');

$data = json_decode(file_get_contents('php://input'), true);
$polytoria_id = $data['polytoria_id'];
$turnstile_token = $data['turnstile_token'];

$cf_verify = file_get_contents('https://challenges.cloudflare.com/turnstile/v0/siteverify', false, stream_context_create([
    'http' => [
        'method' => 'POST',
        'header' => 'Content-Type: application/json',
        'content' => json_encode([
            'secret' => 'YOUR_TURNSTILE_SECRET',
            'response' => $turnstile_token
        ])
    ]
]));

$cf_result = json_decode($cf_verify, true);
if (!$cf_result['success']) {
    echo json_encode(['success' => false, 'message' => 'Verification failed']);
    exit;
}

$poly_data = file_get_contents("https://api.polytoria.com/v1/users/$polytoria_id");
$poly_user = json_decode($poly_data, true);

if (!isset($poly_user['username'])) {
    echo json_encode(['success' => false, 'message' => 'Invalid Polytoria ID']);
    exit;
}

$supabase_url = 'YOUR_SUPABASE_URL';
$supabase_key = 'YOUR_SUPABASE_KEY';

$existing = file_get_contents("$supabase_url/rest/v1/player_data?user_id=eq.$polytoria_id&select=*", false, stream_context_create([
    'http' => [
        'header' => "apikey: $supabase_key\r\nAuthorization: Bearer $supabase_key"
    ]
]));

$user_data = json_decode($existing, true);

if (empty($user_data)) {
    file_get_contents("$supabase_url/rest/v1/player_data", false, stream_context_create([
        'http' => [
            'method' => 'POST',
            'header' => "apikey: $supabase_key\r\nAuthorization: Bearer $supabase_key\r\nContent-Type: application/json\r\nPrefer: return=representation",
            'content' => json_encode([
                'user_id' => (int)$polytoria_id,
                'username' => $poly_user['username'],
                'cash' => 1000,
                'bank' => 0,
                'trust' => 50,
                'heat' => 0,
                'fear' => 0,
                'inventory' => ''
            ])
        ]
    ]));
    
    $user_data = [[
        'user_id' => (int)$polytoria_id,
        'username' => $poly_user['username'],
        'cash' => 1000
    ]];
}

echo json_encode(['success' => true, 'user' => $user_data[0]]);
?>
