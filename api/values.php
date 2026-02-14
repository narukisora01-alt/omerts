<?php
header('Content-Type: application/json');
header('Access-Control-Allow-Origin: *');

$supabase_url = 'YOUR_SUPABASE_URL';
$supabase_key = 'YOUR_SUPABASE_KEY';

$response = file_get_contents("$supabase_url/rest/v1/item_values?select=*", false, stream_context_create([
    'http' => [
        'header' => "apikey: $supabase_key\r\nAuthorization: Bearer $supabase_key"
    ]
]));

echo $response;
?>
