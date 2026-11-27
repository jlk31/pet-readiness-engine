-- UK seed data, late-2026 typical prices (rescue/adoption route). Amounts in pence.

insert into species (id, kind, name, lifespan_years, senior_age_years, housing, max_hours_alone,
                     daily_exercise_mins, noise_level, allergen_level, microchip_required, legal_notes, traits) values
('indoor-adult-cat', 'cat', 'Indoor Adult Cat', 15, 11, 'flat_ok', 10, 20, 2, 5, true,
 'Microchipping compulsory in England for cats over 20 weeks (since June 2024). Check tenancy pet clause.',
 '{"litter_trained": true}'),
('medium-dog', 'dog', 'Medium Dog (e.g. Spaniel cross)', 13, 8, 'house_with_garden', 4, 90, 4, 4, true,
 'Microchip compulsory (Microchipping of Dogs (England) Regulations 2015). Collar ID tag with owner name/address required (Control of Dogs Order 1992). Dangerous Dogs Act applies.',
 '{"coat": "medium", "needs_training": true}'),
('leopard-gecko', 'reptile', 'Leopard Gecko', 18, 12, 'flat_ok', 48, 0, 1, 1, false,
 'No licence required to keep. Needs an exotics-capable vet; not all practices treat reptiles.',
 '{"vivarium_cm": "90x45x45", "hot_end_c": [30, 33], "cool_end_c": [22, 26], "diet": "insectivore"}');

insert into cost_items (species_id, name, frequency, amount_pence, service, trigger, senior_multiplier, is_essential) values
-- Indoor Adult Cat
('indoor-adult-cat', 'Rescue adoption fee (chipped, vaccinated, neutered)', 'one_off',   9500, null,        null, 1.00, true),
('indoor-adult-cat', 'Litter tray, scoop & mat',                            'one_off',   2500, null,        null, 1.00, true),
('indoor-adult-cat', 'Scratching post / cat tree',                          'one_off',   4500, null,        null, 1.00, true),
('indoor-adult-cat', 'Carrier',                                             'one_off',   3000, null,        null, 1.00, true),
('indoor-adult-cat', 'Bed, bowls & toys',                                   'one_off',   4000, null,        null, 1.00, false),
('indoor-adult-cat', 'Initial vet health check',                            'one_off',   6000, 'vet',       null, 1.00, true),
('indoor-adult-cat', 'Food (wet + dry)',                                    'monthly',   3500, null,        null, 1.00, true),
('indoor-adult-cat', 'Cat litter',                                          'monthly',   1200, null,        null, 1.00, true),
('indoor-adult-cat', 'Flea & worm treatment',                               'monthly',   1200, 'vet',       null, 1.00, true),
('indoor-adult-cat', 'Lifetime pet insurance',                              'monthly',   1800, 'insurance', null, 2.20, true),
('indoor-adult-cat', 'Annual booster & health check',                       'annual',    6500, 'vet',       null, 1.50, true),
('indoor-adult-cat', 'Cattery boarding',                                    'per_night', 1600, 'sitter',    null, 1.00, true),
('indoor-adult-cat', 'Emergency vet treatment (e.g. urinary blockage)',     'emergency',150000, 'vet',      null, 1.00, true),
-- Medium Dog
('medium-dog', 'Rescue adoption fee (chipped, vaccinated, neutered)', 'one_off',  25000, null,        null, 1.00, true),
('medium-dog', 'Crate & bed',                                         'one_off',  10000, null,        null, 1.00, true),
('medium-dog', 'Collar, ID tag, harness & lead',                      'one_off',   4500, null,        null, 1.00, true),
('medium-dog', 'Bowls & toys',                                        'one_off',   4500, null,        null, 1.00, false),
('medium-dog', 'Initial vet health check',                            'one_off',   6000, 'vet',       null, 1.00, true),
('medium-dog', 'Training classes (6-week course)',                    'one_off',  12000, null,        null, 1.00, false),
('medium-dog', 'Food',                                                'monthly',   5000, null,        null, 1.00, true),
('medium-dog', 'Flea, tick & worm treatment',                         'monthly',   1800, 'vet',       null, 1.00, true),
('medium-dog', 'Poo bags & treats',                                   'monthly',   1500, null,        null, 1.00, true),
('medium-dog', 'Lifetime pet insurance',                              'monthly',   4500, 'insurance', null, 2.50, true),
('medium-dog', 'Dog walker (1 walk per workday)',                     'monthly',  30000, 'sitter',    'left_alone_too_long', 1.00, true),
('medium-dog', 'Annual booster & health check',                       'annual',    7500, 'vet',       null, 1.50, true),
('medium-dog', 'Grooming (4 visits)',                                 'annual',   18000, null,        null, 1.00, false),
('medium-dog', 'Kennel boarding',                                     'per_night', 3000, 'sitter',    null, 1.00, true),
('medium-dog', 'Emergency surgery (e.g. foreign body removal)',       'emergency',250000, 'vet',      null, 1.00, true),
-- Leopard Gecko
('leopard-gecko', 'Gecko purchase (captive-bred)',            'one_off',   7000, null,  null, 1.00, true),
('leopard-gecko', 'Vivarium 90x45x45cm',                      'one_off',  18000, null,  null, 1.00, true),
('leopard-gecko', 'Heat mat + thermostat',                    'one_off',   4500, null,  null, 1.00, true),
('leopard-gecko', 'UVB lighting kit',                         'one_off',   5000, null,  null, 1.00, true),
('leopard-gecko', 'Hides, substrate & decor',                 'one_off',   6000, null,  null, 1.00, true),
('leopard-gecko', 'Digital thermometer/hygrometer',           'one_off',   1500, null,  null, 1.00, true),
('leopard-gecko', 'Initial exotics vet check',                'one_off',   6000, 'vet', null, 1.00, false),
('leopard-gecko', 'Live insects',                             'monthly',   2000, null,  null, 1.00, true),
('leopard-gecko', 'Calcium & vitamin supplements',            'monthly',    400, null,  null, 1.00, true),
('leopard-gecko', 'Electricity (heating & lighting)',         'monthly',    800, null,  null, 1.00, true),
('leopard-gecko', 'Exotic pet insurance',                     'monthly',   1000, 'insurance', null, 1.50, false),
('leopard-gecko', 'UVB bulb replacement',                     'annual',    2500, null,  null, 1.00, true),
('leopard-gecko', 'Annual exotics vet check',                 'annual',    6000, 'vet', null, 1.30, false),
('leopard-gecko', 'Reptile sitter / boarding',                'per_night',  800, 'sitter', null, 1.00, true),
('leopard-gecko', 'Emergency exotics vet (e.g. impaction)',   'emergency', 40000, 'vet', null, 1.00, true);

-- Rest of UK defaults to 1.00 (no row needed).
insert into regional_multipliers (region, service, multiplier) values
('London',          'vet',       1.30), ('London',          'insurance', 1.35), ('London',          'sitter', 1.40),
('South East',      'vet',       1.15), ('South East',      'insurance', 1.15), ('South East',      'sitter', 1.20),
('East of England', 'vet',       1.08), ('East of England', 'insurance', 1.08), ('East of England', 'sitter', 1.10),
('North East',      'vet',       0.92), ('North East',      'insurance', 0.95), ('North East',      'sitter', 0.90),
('Northern Ireland','vet',       0.90), ('Northern Ireland','insurance', 0.95), ('Northern Ireland','sitter', 0.85);
