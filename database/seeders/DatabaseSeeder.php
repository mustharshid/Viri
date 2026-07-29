<?php

namespace Database\Seeders;

// use Illuminate\Database\Console\Seeds\WithoutModelEvents;
use App\Models\User;
use Illuminate\Database\Seeder;
use Illuminate\Support\Facades\Hash;

class DatabaseSeeder extends Seeder
{
    /**
     * Seed the application's database.
     */
    public function run(): void
    {
        // \App\Models\User::factory(10)->create();

        // Seed default superadmin if not exists
        if (! User::where('role', 'superadmin')->exists()) {
            User::create([
                'name' => 'Super Admin',
                'email' => 'admin@viri.com',
                'password' => Hash::make('password'),
                'role' => 'superadmin',
                'status' => 'approved',
            ]);
        }
    }
}
