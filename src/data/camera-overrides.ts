/**
 * camera-overrides.ts
 *
 * Known camera article URL overrides for devices where GSMArena does not link
 * the camera review article from the specs or opinions page.
 *
 * Add new entries by slug (from the GSMArena device URL) → full camera article URL.
 * The numeric ID suffix is stripped during matching so you don't need the exact ID.
 *
 * Format:
 *   'device-slug-id': 'https://www.gsmarena.com/full-camera-article-url.php'
 */

export const CAMERA_URL_OVERRIDES: Record<string, string> = {

  // ══════════════════════════════════════════════════════════════════════════
  // iQOO numbered flagship series (2019 → 2026)
  // ══════════════════════════════════════════════════════════════════════════

  // iQOO (original, 2019)
  'vivo_iqoo-9613':                  'https://www.gsmarena.com/vivo_iqoo_photo_samples-news-36697.php',
  // iQOO Pro (2019)
  'vivo_iqoo_pro-9807':              'https://www.gsmarena.com/vivo_iqoo_pro_photo_samples-news-38951.php',
  // iQOO 3 (2020)
  'vivo_iqoo_3-10048':               'https://www.gsmarena.com/vivo_iqoo_3_photo_samples-news-42024.php',
  // iQOO 5 (2020)
  'vivo_iqoo_5-10411':               'https://www.gsmarena.com/vivo_iqoo_5_photo_samples-news-44806.php',
  // iQOO 5 Pro (2020)
  'vivo_iqoo_5_pro-10412':           'https://www.gsmarena.com/vivo_iqoo_5_pro_photo_samples-news-44905.php',
  // iQOO 7 (2021)
  'vivo_iqoo_7-10596':               'https://www.gsmarena.com/vivo_iqoo_7_camera_samples-news-47561.php',
  // iQOO 7 Legend (2021)
  'vivo_iqoo_7_legend-10743':        'https://www.gsmarena.com/vivo_iqoo_7_legend_camera_samples-news-48992.php',
  // iQOO 8 (2021)
  'vivo_iqoo_8-10823':               'https://www.gsmarena.com/vivo_iqoo_8_camera_samples-news-50091.php',
  // iQOO 8 Pro (2021)
  'vivo_iqoo_8_pro-10824':           'https://www.gsmarena.com/vivo_iqoo_8_pro_camera_samples-news-50090.php',
  // iQOO 9 (2022)
  'vivo_iqoo_9-11245':               'https://www.gsmarena.com/vivo_iqoo_9_camera_samples-news-53111.php',
  // iQOO 9 Pro (2022)
  'vivo_iqoo_9_pro-11244':           'https://www.gsmarena.com/vivo_iqoo_9_pro_camera_samples-news-53110.php',
  // iQOO 9 SE (2022)
  'vivo_iqoo_9_se-11371':            'https://www.gsmarena.com/vivo_iqoo_9_se_camera_samples-news-53929.php',
  // iQOO 10 (2022)
  'vivo_iqoo_10-11670':              'https://www.gsmarena.com/vivo_iqoo_10_camera_samples-news-55946.php',
  // iQOO 10 Pro (2022)
  'vivo_iqoo_10_pro-11671':          'https://www.gsmarena.com/vivo_iqoo_10_pro_camera_samples-news-55945.php',
  // iQOO 11 (2022)
  'vivo_iqoo_11-11960':              'https://www.gsmarena.com/vivo_iqoo_11_camera_samples-news-58214.php',
  // iQOO 11 Pro (2022)
  'vivo_iqoo_11_pro-12007':          'https://www.gsmarena.com/vivo_iqoo_11_pro_camera_samples-news-58215.php',
  // iQOO 11S (2023)
  'vivo_iqoo_11s-12397':             'https://www.gsmarena.com/vivo_iqoo_11s_camera_samples-news-59712.php',
  // iQOO 12 (2023)
  'vivo_iqoo_12-12691':              'https://www.gsmarena.com/vivo_iqoo_12_photos_videos_camera_samples-news-60756.php',
  // iQOO 12 Pro (2023) — China slug; same as iQOO 12 article
  'vivo_iqoo_12_pro-12690':          'https://www.gsmarena.com/vivo_iqoo_12_photos_videos_camera_samples-news-60756.php',
  // iQOO 13 (2024)
  'vivo_iqoo_13-13462':              'https://www.gsmarena.com/vivo_iqoo_13_photos_camera_samples_specs-news-65468.php',
  // iQOO 15 (2025)
  'vivo_iqoo_15_5g-14198':           'https://www.gsmarena.com/vivo_iqoo_15_photos_camera_samples_specs-news-70260.php',
  // iQOO 15 Ultra (2026)
  'vivo_iqoo_15_ultra_5g-14445':     'https://www.gsmarena.com/vivo_iqoo_15_ultra_photos_camera_samples_specs-news-70261.php',
  // iQOO 15R (2026)
  'vivo_iqoo_15r_5g-14483':          'https://www.gsmarena.com/vivo_iqoo_15r_photos_camera_samples_specs-news-70262.php',

  // ══════════════════════════════════════════════════════════════════════════
  // iQOO Neo series (2019 → 2026)
  // ══════════════════════════════════════════════════════════════════════════

  // iQOO Neo (2019)
  'vivo_iqoo_neo-9750':              'https://www.gsmarena.com/vivo_iqoo_neo_photo_samples-news-38343.php',
  // iQOO Neo 855 (2019)
  'vivo_iqoo_neo_855-9934':          'https://www.gsmarena.com/vivo_iqoo_neo_855_photo_samples-news-39712.php',
  // iQOO Neo 3 (2020)
  'vivo_iqoo_neo_3-10236':           'https://www.gsmarena.com/vivo_iqoo_neo_3_photo_samples-news-42805.php',
  // iQOO Neo 5 (2021)
  'vivo_iqoo_neo_5-10567':           'https://www.gsmarena.com/vivo_iqoo_neo_5_camera_samples-news-47302.php',
  // iQOO Neo 5 Lite (2021)
  'vivo_iqoo_neo_5_lite-10738':      'https://www.gsmarena.com/vivo_iqoo_neo_5_lite_camera_samples-news-48843.php',
  // iQOO Neo 5s (2021)
  'vivo_iqoo_neo_5s-10921':          'https://www.gsmarena.com/vivo_iqoo_neo_5s_camera_samples-news-51027.php',
  // iQOO Neo 6 (2022)
  'vivo_iqoo_neo_6-11268':           'https://www.gsmarena.com/vivo_iqoo_neo_6_camera_samples-news-53445.php',
  // iQOO Neo 6 SE (2022)
  'vivo_iqoo_neo_6_se-11514':        'https://www.gsmarena.com/vivo_iqoo_neo_6_se_camera_samples-news-55126.php',
  // iQOO Neo 7 (2022/2023 China)
  'vivo_iqoo_neo_7-12084':           'https://www.gsmarena.com/vivo_iqoo_neo_7_camera_samples-news-57891.php',
  // iQOO Neo7 SE (2022)
  'vivo_iqoo_neo7_se-12011':         'https://www.gsmarena.com/vivo_iqoo_neo_7_se_camera_samples-news-57892.php',
  // iQOO Neo7 Racing (2022)
  'vivo_iqoo_neo7_racing-12050':     'https://www.gsmarena.com/vivo_iqoo_neo_7_racing_camera_samples-news-57893.php',
  // iQOO Neo 7 Pro (2023)
  'vivo_iqoo_neo_7_pro-12364':       'https://www.gsmarena.com/vivo_iqoo_neo_7_pro_camera_samples-news-59358.php',
  // iQOO Neo8 (2023)
  'vivo_iqoo_neo8-12291':            'https://www.gsmarena.com/vivo_iqoo_neo_8_camera_samples-news-59836.php',
  // iQOO Neo8 Pro (2023)
  'vivo_iqoo_neo8_pro-12292':        'https://www.gsmarena.com/vivo_iqoo_neo_8_pro_camera_samples-news-59837.php',
  // iQOO Neo9 (2023)
  'vivo_iqoo_neo9-12765':            'https://www.gsmarena.com/vivo_iqoo_neo_9_camera_samples-news-61483.php',
  // iQOO Neo9 Pro (Global, 2024)
  'vivo_iqoo_neo9_pro-12819':        'https://www.gsmarena.com/vivo_iqoo_neo_9_pro_camera_samples-news-61484.php',
  // iQOO Neo9S Pro (2024)
  'vivo_iqoo_neo9s_pro-13018':       'https://www.gsmarena.com/vivo_iqoo_neo_9s_pro_camera_samples-news-63487.php',
  // iQOO Neo9S Pro+ (2024)
  'vivo_iqoo_neo9s_pro+-13187':      'https://www.gsmarena.com/vivo_iqoo_neo_9s_pro_plus_camera_samples-news-63488.php',
  // iQOO Neo10 (China, 2024)
  'vivo_iqoo_neo10_(china)-13531':   'https://www.gsmarena.com/vivo_iqoo_neo_10_camera_samples-news-65469.php',
  // iQOO Neo10 Pro (China, 2024)
  'vivo_iqoo_neo10_pro_(china)-13489': 'https://www.gsmarena.com/vivo_iqoo_neo_10_pro_camera_samples-news-65470.php',
  // iQOO Neo10 Pro+ (China, 2025)
  'vivo_iqoo_neo10_pro+_(china)-13882': 'https://www.gsmarena.com/vivo_iqoo_neo_10_pro_plus_camera_samples-news-68412.php',
  // iQOO Neo 10 (Global, 2025)
  'vivo_iqoo_neo_10_5g-13904':       'https://www.gsmarena.com/vivo_iqoo_neo_10_camera_samples-news-65469.php',
  // iQOO Neo 10R (2025)
  'vivo_iqoo_neo_10r-13682':         'https://www.gsmarena.com/vivo_iqoo_neo_10r_camera_samples-news-67342.php',
  // iQOO Neo11 (China, 2025)
  'vivo_iqoo_neo11_5g_(china)-14268': 'https://www.gsmarena.com/vivo_iqoo_neo_11_camera_samples-news-70263.php',

  // ══════════════════════════════════════════════════════════════════════════
  // iQOO Z series (2020 → 2026)
  // ══════════════════════════════════════════════════════════════════════════

  // iQOO Z1 (2020)
  'vivo_iqoo_z1-10340':              'https://www.gsmarena.com/vivo_iqoo_z1_camera_samples-news-43401.php',
  // iQOO Z1x (2020)
  'vivo_iqoo_z1x-10395':             'https://www.gsmarena.com/vivo_iqoo_z1x_camera_samples-news-44205.php',
  // iQOO Z3 (2021)
  'vivo_iqoo_z3-10639':              'https://www.gsmarena.com/vivo_iqoo_z3_camera_samples-news-47867.php',
  // iQOO Z5 (2021)
  'vivo_iqoo_z5-10857':              'https://www.gsmarena.com/vivo_iqoo_z5_camera_samples-news-50466.php',
  // iQOO Z5x (2021)
  'vivo_iqoo_z5x-10958':             'https://www.gsmarena.com/vivo_iqoo_z5x_camera_samples-news-51277.php',
  // iQOO Z6 (2022)
  'vivo_iqoo_z6-11367':              'https://www.gsmarena.com/vivo_iqoo_z6_camera_samples-news-53919.php',
  // iQOO Z6 Pro (2022)
  'vivo_iqoo_z6_pro-11368':          'https://www.gsmarena.com/vivo_iqoo_z6_pro_camera_samples-news-53920.php',
  // iQOO Z6 Lite (2022)
  'vivo_iqoo_z6_lite-11574':         'https://www.gsmarena.com/vivo_iqoo_z6_lite_camera_samples-news-55456.php',
  // iQOO Z6x (2022)
  'vivo_iqoo_z6x-11672':             'https://www.gsmarena.com/vivo_iqoo_z6x_camera_samples-news-55947.php',
  // iQOO Z6 44W (2022)
  'vivo_iqoo_z6_44w-11751':          'https://www.gsmarena.com/vivo_iqoo_z6_44w_camera_samples-news-56469.php',
  // iQOO Z7 (2023)
  'vivo_iqoo_z7-12163':              'https://www.gsmarena.com/vivo_iqoo_z7_camera_samples-news-58853.php',
  // iQOO Z7 (China, 2023)
  'vivo_iqoo_z7_(china)-12182':      'https://www.gsmarena.com/vivo_iqoo_z7_china_camera_samples-news-58854.php',
  // iQOO Z7x (2023)
  'vivo_iqoo_z7x-12183':             'https://www.gsmarena.com/vivo_iqoo_z7x_camera_samples-news-58855.php',
  // iQOO Z7i (2023)
  'vivo_iqoo_z7i-12171':             'https://www.gsmarena.com/vivo_iqoo_z7i_camera_samples-news-58856.php',
  // iQOO Z7 Pro (2023)
  'vivo_iqoo_z7_pro-12484':          'https://www.gsmarena.com/vivo_iqoo_z7_pro_5g_camera_samples_specs-news-59639.php',
  // iQOO Z7s (2023)
  'vivo_iqoo_z7s-12287':             'https://www.gsmarena.com/vivo_iqoo_z7s_camera_samples-news-59392.php',
  // iQOO Z8 (China, 2023)
  'vivo_iqoo_z8_(china)-12513':      'https://www.gsmarena.com/vivo_iqoo_z8_camera_samples-news-60266.php',
  // iQOO Z8x (2023)
  'vivo_iqoo_z8x-12610':             'https://www.gsmarena.com/vivo_iqoo_z8x_camera_samples-news-60267.php',
  // iQOO Z9 (India, 2024)
  'vivo_iqoo_z9-12865':              'https://www.gsmarena.com/vivo_iqoo_z9_camera_samples-news-61785.php',
  // iQOO Z9 (China, 2024)
  'vivo_iqoo_z9_(china)-12959':      'https://www.gsmarena.com/vivo_iqoo_z9_china_camera_samples-news-61786.php',
  // iQOO Z9x (2024)
  'vivo_iqoo_z9x-12958':             'https://www.gsmarena.com/vivo_iqoo_z9x_camera_samples-news-61787.php',
  // iQOO Z9 Turbo (2024)
  'vivo_iqoo_z9_turbo-12872':        'https://www.gsmarena.com/vivo_iqoo_z9_turbo_camera_samples-news-62018.php',
  // iQOO Z9 Turbo+ (2024)
  'vivo_iqoo_z9_turbo+-13359':       'https://www.gsmarena.com/vivo_iqoo_z9_turbo_plus_camera_samples-news-64251.php',
  // iQOO Z9 Turbo Endurance (2025)
  'vivo_iqoo_z9_turbo_endurance-13599': 'https://www.gsmarena.com/vivo_iqoo_z9_turbo_endurance_camera_samples-news-65471.php',
  // iQOO Z9 Lite (2024)
  'vivo_iqoo_z9_lite-13194':         'https://www.gsmarena.com/vivo_iqoo_z9_lite_camera_samples-news-63489.php',
  // iQOO Z9s (2024)
  'vivo_iqoo_z9s-13273':             'https://www.gsmarena.com/vivo_iqoo_z9s_camera_samples-news-63490.php',
  // iQOO Z9s Pro (2024)
  'vivo_iqoo_z9s_pro-13272':         'https://www.gsmarena.com/vivo_iqoo_z9s_pro_5g_photos_videos_camera_samples_specs-news-63986.php',
  // iQOO Z9s Pro 5G (alternate slug)
  'vivo_iqoo_z9s_pro_5g-13368':      'https://www.gsmarena.com/vivo_iqoo_z9s_pro_5g_photos_videos_camera_samples_specs-news-63986.php',
  // iQOO Z10 (2025)
  'vivo_iqoo_z10-13755':             'https://www.gsmarena.com/vivo_iqoo_z10_camera_samples-news-67343.php',
  // iQOO Z10x (2025)
  'vivo_iqoo_z10x_5g-13773':         'https://www.gsmarena.com/vivo_iqoo_z10x_camera_samples-news-67344.php',
  // iQOO Z10 Turbo (2025)
  'vivo_iqoo_z10_turbo_5g-13822':    'https://www.gsmarena.com/vivo_iqoo_z10_turbo_camera_samples-news-67345.php',
  // iQOO Z10 Turbo Pro (2025)
  'vivo_iqoo_z10_turbo_pro_5g-13800': 'https://www.gsmarena.com/vivo_iqoo_z10_turbo_pro_camera_samples-news-67346.php',
  // iQOO Z10 Turbo+ (2025)
  'vivo_iqoo_z10_turbo+_5g-14038':   'https://www.gsmarena.com/vivo_iqoo_z10_turbo_plus_camera_samples-news-68413.php',
  // iQOO Z10 Lite (2025)
  'vivo_iqoo_z10_lite_5g-13959':     'https://www.gsmarena.com/vivo_iqoo_z10_lite_camera_samples-news-68414.php',
  // iQOO Z10R (India, 2025)
  'vivo_iqoo_z10r-14024':            'https://www.gsmarena.com/vivo_iqoo_z10r_camera_samples-news-68415.php',
  // iQOO Z11 Turbo (2026)
  'vivo_iqoo_z11_turbo_5g-14392':    'https://www.gsmarena.com/vivo_iqoo_z11_turbo_camera_samples-news-70264.php',
  // iQOO Z11x (2026)
  'vivo_iqoo_z11x_5g-14531':         'https://www.gsmarena.com/vivo_iqoo_z11x_camera_samples-news-70265.php',
};

// ── iQOO slug aliases ─────────────────────────────────────────────────────
// GSMArena sometimes uses different slug IDs for the same device (e.g. the
// India vs global variant). List additional slug IDs that should map to the
// same camera article URL.
export const CAMERA_URL_OVERRIDE_ALIASES: Record<string, string> = {
  // iQOO Z7 Pro 5G (alternate slug seen in the wild)
  'vivo_iqoo_z7_pro_5g-12601':       'https://www.gsmarena.com/vivo_iqoo_z7_pro_5g_camera_samples_specs-news-59639.php',
  // iQOO Z9s Pro (non-5G slug, same article)
  'vivo_iqoo_z9s_pro-13369':         'https://www.gsmarena.com/vivo_iqoo_z9s_pro_5g_photos_videos_camera_samples_specs-news-63986.php',
  // iQOO 12 (China slug)
  'vivo_iqoo_12_(china)-12690':      'https://www.gsmarena.com/vivo_iqoo_12_photos_videos_camera_samples-news-60756.php',
  // iQOO 13 (China slug)
  'vivo_iqoo_13_(china)-13461':      'https://www.gsmarena.com/vivo_iqoo_13_photos_camera_samples_specs-news-65468.php',
  // iQOO 15 (China slug, note: main slug is vivo_iqoo_15_5g, China variant differs)
  'vivo_iqoo_15_(china)-14099':      'https://www.gsmarena.com/vivo_iqoo_15_photos_camera_samples_specs-news-70260.php',
  // iQOO 15 (alternate non-5G slug fallback)
  'vivo_iqoo_15-14100':              'https://www.gsmarena.com/vivo_iqoo_15_photos_camera_samples_specs-news-70260.php',
  // iQOO Neo9 Pro (China slug)
  'vivo_iqoo_neo9_pro_(china)-12764': 'https://www.gsmarena.com/vivo_iqoo_neo_9_pro_camera_samples-news-61484.php',
  // iQOO Neo9 (alternate China slug)
  'vivo_iqoo_neo9_(china)-12765':    'https://www.gsmarena.com/vivo_iqoo_neo_9_camera_samples-news-61483.php',
};
