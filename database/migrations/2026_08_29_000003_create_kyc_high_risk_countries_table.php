<?php

use Illuminate\Database\Migrations\Migration;
use Illuminate\Database\Schema\Blueprint;
use Illuminate\Support\Facades\DB;
use Illuminate\Support\Facades\Schema;

return new class extends Migration
{
    public function up(): void
    {
        Schema::create('kyc_high_risk_countries', function (Blueprint $table) {
            $table->id();
            $table->char('country_code', 2)->unique();
            $table->string('country_name');
            $table->enum('risk_level', ['high', 'sanctioned'])->default('high');
            $table->text('notes')->nullable();
            $table->boolean('added_by_fiu')->default(false);
            $table->timestamps();
        });

        // Seed with current FATF grey list + black list + UN-sanctioned countries
        // Source: FATF October 2023 / UN Security Council lists
        $countries = [
            // FATF Black List (High Risk / Call for Action)
            ['country_code' => 'KP', 'country_name' => 'North Korea',          'risk_level' => 'sanctioned'],
            ['country_code' => 'IR', 'country_name' => 'Iran',                 'risk_level' => 'sanctioned'],
            ['country_code' => 'MM', 'country_name' => 'Myanmar',              'risk_level' => 'sanctioned'],

            // FATF Grey List (Increased Monitoring)
            ['country_code' => 'AF', 'country_name' => 'Afghanistan',          'risk_level' => 'high'],
            ['country_code' => 'AL', 'country_name' => 'Albania',              'risk_level' => 'high'],
            ['country_code' => 'BB', 'country_name' => 'Barbados',             'risk_level' => 'high'],
            ['country_code' => 'BF', 'country_name' => 'Burkina Faso',         'risk_level' => 'high'],
            ['country_code' => 'CM', 'country_name' => 'Cameroon',             'risk_level' => 'high'],
            ['country_code' => 'CD', 'country_name' => 'Congo (DR)',           'risk_level' => 'high'],
            ['country_code' => 'GH', 'country_name' => 'Ghana',               'risk_level' => 'high'],
            ['country_code' => 'GI', 'country_name' => 'Gibraltar',            'risk_level' => 'high'],
            ['country_code' => 'HT', 'country_name' => 'Haiti',               'risk_level' => 'high'],
            ['country_code' => 'JM', 'country_name' => 'Jamaica',             'risk_level' => 'high'],
            ['country_code' => 'JO', 'country_name' => 'Jordan',              'risk_level' => 'high'],
            ['country_code' => 'ML', 'country_name' => 'Mali',                'risk_level' => 'high'],
            ['country_code' => 'MZ', 'country_name' => 'Mozambique',          'risk_level' => 'high'],
            ['country_code' => 'NA', 'country_name' => 'Namibia',             'risk_level' => 'high'],
            ['country_code' => 'NI', 'country_name' => 'Nicaragua',           'risk_level' => 'high'],
            ['country_code' => 'NG', 'country_name' => 'Nigeria',             'risk_level' => 'high'],
            ['country_code' => 'PK', 'country_name' => 'Pakistan',            'risk_level' => 'high'],
            ['country_code' => 'PA', 'country_name' => 'Panama',              'risk_level' => 'high'],
            ['country_code' => 'PH', 'country_name' => 'Philippines',         'risk_level' => 'high'],
            ['country_code' => 'SN', 'country_name' => 'Senegal',             'risk_level' => 'high'],
            ['country_code' => 'SS', 'country_name' => 'South Sudan',         'risk_level' => 'high'],
            ['country_code' => 'SY', 'country_name' => 'Syria',               'risk_level' => 'sanctioned'],
            ['country_code' => 'TZ', 'country_name' => 'Tanzania',            'risk_level' => 'high'],
            ['country_code' => 'TR', 'country_name' => 'Turkey',              'risk_level' => 'high'],
            ['country_code' => 'UG', 'country_name' => 'Uganda',              'risk_level' => 'high'],
            ['country_code' => 'AE', 'country_name' => 'United Arab Emirates','risk_level' => 'high'],
            ['country_code' => 'VU', 'country_name' => 'Vanuatu',             'risk_level' => 'high'],
            ['country_code' => 'VE', 'country_name' => 'Venezuela',           'risk_level' => 'high'],
            ['country_code' => 'YE', 'country_name' => 'Yemen',               'risk_level' => 'high'],
        ];

        $now = now();
        foreach ($countries as &$c) {
            $c['notes'] = null;
            $c['added_by_fiu'] = false;
            $c['created_at'] = $now;
            $c['updated_at'] = $now;
        }

        DB::table('kyc_high_risk_countries')->insert($countries);
    }

    public function down(): void
    {
        Schema::dropIfExists('kyc_high_risk_countries');
    }
};
