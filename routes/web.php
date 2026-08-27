<?php

use Illuminate\Support\Facades\Route;

/*
|--------------------------------------------------------------------------
| Web Routes
|--------------------------------------------------------------------------
|
| Here is where you can register web routes for your application. These
| routes are loaded by the RouteServiceProvider and all of them will
| be assigned to the "web" middleware group. Make something great!
|
*/

Route::get('/', function () {
    return view('welcome');
});

Route::get('/downloads/{filename}', function ($filename) {
    $allowed = [
        'viri-cashier-setup.exe',
        'viri-cashier.dmg',
        'viri-cashier.apk',
        'viri-bridge.zip'
    ];

    if (!in_array($filename, $allowed)) {
        abort(404, 'Download file not found.');
    }

    $path = public_path('downloads/' . $filename);
    if (file_exists($path)) {
        return response()->download($path);
    }

    // If file is not yet uploaded/generated, return an informative fallback
    return response()->json([
        'message' => 'The standalone app installer for ' . $filename . ' is currently being compiled for version 1.4.0. Please check back shortly.',
        'version' => '1.4.0',
        'file' => $filename
    ], 200);
})->where('filename', '[a-zA-Z0-9\-_.]+');

