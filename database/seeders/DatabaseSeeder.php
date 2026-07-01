<?php

namespace Database\Seeders;

// use Illuminate\Database\Console\Seeds\WithoutModelEvents;
use Illuminate\Database\Seeder;

class DatabaseSeeder extends Seeder
{
    /**
     * Seed the application's database.
     */
    public function run(): void
    {
        // \App\Models\User::factory(10)->create();

        // Seed default superadmin if not exists
        if (!\App\Models\User::where('role', 'superadmin')->exists()) {
            \App\Models\User::create([
                'name' => 'Super Admin',
                'email' => 'admin@viri.com',
                'password' => \Illuminate\Support\Facades\Hash::make('password'),
                'role' => 'superadmin',
                'status' => 'approved',
            ]);
        }
    }
}
