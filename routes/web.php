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
    if (file_exists($path) && filesize($path) > 100000) {
        return response()->download($path);
    }

    // Redirect to GitHub release CDN if not stored directly on production web server
    return redirect('https://github.com/mustharshid/Viri/releases/download/v1.4.0/' . $filename);
})->where('filename', '[a-zA-Z0-9\-_.]+');

