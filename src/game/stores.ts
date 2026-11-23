// 320+ GTA-6 / Leonida / Vice-City-inspired unique stores, clubs, eateries, boutiques, and businesses.
// Pure data & lookup module (zero Three.js dependencies) so tests & textures share one source of truth.

export type StoreStyle = 'deco' | 'neon' | 'bodega' | 'luxury' | 'retail' | 'diner';
export type StoreDoorKind = 'shop' | 'diner' | 'office' | 'apartment' | 'gun' | 'garage' | 'bank';

export interface StoreDef {
  readonly id: number;
  readonly name: string;
  readonly category: string;
  readonly district: 'ocean' | 'havana' | 'wynwood' | 'downtown' | 'marina' | 'strip' | 'industrial' | 'airport';
  readonly style: StoreStyle;
  readonly bg: string;
  readonly fg: string;
  readonly accent: string;
  readonly doorKind: StoreDoorKind;
}

type RawEntry = [string, string, StoreDef['district'], StoreStyle, StoreDoorKind];

// Special core civic / landmark signs sit at indices 0..15 for backwards compatibility & landmark lookups,
// followed by 312+ unique GTA-6 / Vice / Leonida commercial brands = 328 total unique stores!
const RAW_STORES: readonly RawEntry[] = [
  // --- Core Landmark & Essential City Signs (0..15)
  ['BANK', 'Finance', 'downtown', 'luxury', 'bank'],
  ['POLICE', 'Civic', 'downtown', 'retail', 'office'],
  ['HOSPITAL', 'Medical', 'downtown', 'retail', 'office'],
  ['AMMO', 'Tactical', 'strip', 'neon', 'gun'],
  ['PAY N SPRAY', 'Auto', 'industrial', 'neon', 'garage'],
  ['GAS', 'Fuel', 'strip', 'retail', 'shop'],
  ['CLUB NOVA', 'Nightlife', 'ocean', 'neon', 'diner'],
  ['SAN NOVA', 'Landmark', 'downtown', 'deco', 'office'],
  ['OCEAN VIEW HOTEL', 'Hotel', 'ocean', 'deco', 'apartment'],
  ['VICE PAWN & LOAN', 'Pawn', 'strip', 'neon', 'shop'],
  ['UNCLE JACK LIQUOR', 'Liquor', 'strip', 'neon', 'shop'],
  ['CLUCKIN BELL', 'Fast Food', 'strip', 'diner', 'diner'],
  ['BURGER SHOT', 'Fast Food', 'strip', 'diner', 'diner'],
  ['WELL STACKED PIZZA', 'Pizza', 'havana', 'diner', 'diner'],
  ['BEAN MACHINE', 'Coffee', 'downtown', 'retail', 'diner'],
  ['PONSONBYS', 'Luxury', 'downtown', 'luxury', 'shop'],

  // --- Ocean Beach & Art Deco Strip (Hotels, Clubs, Lounges, Surf, Resort Boutiques)
  ['MALIBU PALMS CLUB', 'Nightlife', 'ocean', 'neon', 'diner'],
  ['NEON FLAMINGO LOUNGE', 'Nightlife', 'ocean', 'deco', 'diner'],
  ['SOLARIS ART DECO', 'Hotel', 'ocean', 'deco', 'apartment'],
  ['PASTEL PALACE', 'Hotel', 'ocean', 'deco', 'apartment'],
  ['SUNSET BOULEVARD INN', 'Hotel', 'ocean', 'deco', 'apartment'],
  ['CORAL REEF RESORT', 'Hotel', 'ocean', 'deco', 'apartment'],
  ['TROPICANA CABANA', 'Bar', 'ocean', 'neon', 'diner'],
  ['OCEAN DRIVE GELATO', 'Dessert', 'ocean', 'deco', 'diner'],
  ['WAVE RUNNER SURF', 'Surf', 'ocean', 'deco', 'shop'],
  ['LEONIDA SURF CO', 'Surf', 'ocean', 'deco', 'shop'],
  ['BOARDWALK SHADES', 'Eyewear', 'ocean', 'deco', 'shop'],
  ['MIAMI HEAT TANNING', 'Salon', 'ocean', 'neon', 'shop'],
  ['PINK CADILLAC DINER', 'Diner', 'ocean', 'diner', 'diner'],
  ['VELVET ROPE VIP', 'Nightlife', 'ocean', 'neon', 'diner'],
  ['PALM ROYALE SPA', 'Spa', 'ocean', 'deco', 'shop'],
  ['BLUE LAGOON HOOKAH', 'Lounge', 'ocean', 'neon', 'diner'],
  ['STARLIGHT ROOFTOP', 'Bar', 'ocean', 'neon', 'diner'],
  ['ART DECO ESPRESSO', 'Coffee', 'ocean', 'deco', 'diner'],
  ['BIKINI BAY BOUTIQUE', 'Apparel', 'ocean', 'deco', 'shop'],
  ['COCONUT GROVE JUICE', 'Juice', 'ocean', 'deco', 'diner'],
  ['PELICAN PIER TACKLE', 'Marine', 'ocean', 'retail', 'shop'],
  ['SAND DOLLAR GIFTS', 'Souvenirs', 'ocean', 'deco', 'shop'],
  ['ELECTRIC PALM BAR', 'Nightlife', 'ocean', 'neon', 'diner'],
  ['SOUTH BEACH ROLLERS', 'Skate', 'ocean', 'neon', 'shop'],
  ['CASABLANCA MOTEL', 'Hotel', 'ocean', 'deco', 'apartment'],
  ['TURQUOISE TIDE CAFE', 'Cafe', 'ocean', 'deco', 'diner'],
  ['SUNBURN BEACHWEAR', 'Apparel', 'ocean', 'deco', 'shop'],
  ['DOLPHIN COVE SEAFOOD', 'Seafood', 'ocean', 'diner', 'diner'],
  ['VICE NIGHTS DISCO', 'Nightlife', 'ocean', 'neon', 'diner'],
  ['GOLDEN SANDS HOTEL', 'Hotel', 'ocean', 'deco', 'apartment'],
  ['PARADISE PALM RENTALS', 'Rentals', 'ocean', 'deco', 'shop'],
  ['KEY LIME PIE HOUSE', 'Bakery', 'ocean', 'diner', 'diner'],
  ['ATLANTIC BREEZE BAR', 'Bar', 'ocean', 'neon', 'diner'],
  ['CORAL GABLES CIGARS', 'Tobacco', 'ocean', 'luxury', 'shop'],
  ['SURF SIDE TATTOO', 'Tattoo', 'ocean', 'neon', 'shop'],
  ['AQUA VELVET LOUNGE', 'Nightlife', 'ocean', 'neon', 'diner'],
  ['FLIP FLOP EMPORIUM', 'Footwear', 'ocean', 'deco', 'shop'],
  ['SUNRISE SMOOTHIES', 'Juice', 'ocean', 'deco', 'diner'],
  ['MARLIN CLUB GRILL', 'Seafood', 'ocean', 'diner', 'diner'],
  ['BEACHFRONT VINYL', 'Music', 'ocean', 'neon', 'shop'],
  ['MIRAGE NIGHTCLUB', 'Nightlife', 'ocean', 'neon', 'diner'],
  ['HIBISCUS DAY SPA', 'Spa', 'ocean', 'deco', 'shop'],
  ['JET SKI KINGS', 'Marine', 'ocean', 'neon', 'shop'],
  ['ROYAL PALM BAKERY', 'Bakery', 'ocean', 'deco', 'diner'],

  // --- Little Havana / Calle Nova (Bodegas, Cafecitos, Bakeries, Barbers, Botánicas, Cigar Shops)
  ['CAFECITO EXPRESS', 'Coffee', 'havana', 'bodega', 'diner'],
  ['LA CUBANA BAKERY', 'Bakery', 'havana', 'bodega', 'diner'],
  ['EL REY DEL TACO', 'Taqueria', 'havana', 'bodega', 'diner'],
  ['BODEGA LA ESTRELLA', 'Grocery', 'havana', 'bodega', 'shop'],
  ['CALLE NOVA BARBERS', 'Barber', 'havana', 'bodega', 'shop'],
  ['HAVANA SMOKE HOUSE', 'Cigars', 'havana', 'bodega', 'shop'],
  ['MAMA ROSA EMPANADAS', 'Food', 'havana', 'bodega', 'diner'],
  ['BOTANICA SAN LAZARO', 'Herbal', 'havana', 'bodega', 'shop'],
  ['EL TROPICO MARKET', 'Grocery', 'havana', 'bodega', 'shop'],
  ['SALSA BRAVA CLUB', 'Nightlife', 'havana', 'neon', 'diner'],
  ['PANADERIA DEL SOL', 'Bakery', 'havana', 'bodega', 'diner'],
  ['DON PEDRO CARNICERIA', 'Butcher', 'havana', 'bodega', 'shop'],
  ['POLLOS HERMANOS NOVA', 'Food', 'havana', 'diner', 'diner'],
  ['LA VENTANITA CAFE', 'Coffee', 'havana', 'bodega', 'diner'],
  ['DOMINO PARK LOUNGE', 'Bar', 'havana', 'bodega', 'diner'],
  ['TROPICAL FRUTERIA', 'Produce', 'havana', 'bodega', 'shop'],
  ['CHURRO LOCO STAND', 'Dessert', 'havana', 'bodega', 'diner'],
  ['EL CAMPEON BOXING', 'Gym', 'havana', 'retail', 'shop'],
  ['DISCOS LATINO', 'Music', 'havana', 'bodega', 'shop'],
  ['MIAMI GUAYABERA CO', 'Apparel', 'havana', 'bodega', 'shop'],
  ['CEVICHE PALACE', 'Seafood', 'havana', 'bodega', 'diner'],
  ['CASA DE AREPAS', 'Food', 'havana', 'bodega', 'diner'],
  ['BARBERIA EL JEFE', 'Barber', 'havana', 'bodega', 'shop'],
  ['FARMACIA LA SALUD', 'Pharmacy', 'havana', 'bodega', 'shop'],
  ['JOYERIA ORO PURO', 'Jewelry', 'havana', 'luxury', 'shop'],
  ['MOJITO NIGHTS BAR', 'Bar', 'havana', 'neon', 'diner'],
  ['SUPERMERCADO SOL', 'Grocery', 'havana', 'bodega', 'shop'],
  ['LAVANDERIA EXPRESS', 'Laundry', 'havana', 'bodega', 'shop'],
  ['TACO FIESTA 24H', 'Taqueria', 'havana', 'diner', 'diner'],
  ['CAFE CORTADITO', 'Coffee', 'havana', 'bodega', 'diner'],
  ['EL PARADISO FLORIST', 'Florist', 'havana', 'bodega', 'shop'],
  ['CUBAN SANDWICH KING', 'Deli', 'havana', 'bodega', 'diner'],
  ['LA BODEGUITA 305', 'Grocery', 'havana', 'bodega', 'shop'],
  ['RUMBA ROOM LOUNGE', 'Nightlife', 'havana', 'neon', 'diner'],
  ['PESCADERIA DEL MAR', 'Seafood', 'havana', 'bodega', 'shop'],
  ['ZAPATERIA REAL', 'Footwear', 'havana', 'bodega', 'shop'],
  ['TIENDA DE TELEFONOS', 'Electronics', 'havana', 'bodega', 'shop'],
  ['PAPI CHULO WINGS', 'Food', 'havana', 'diner', 'diner'],
  ['SOL Y SOMBRA CANTINA', 'Bar', 'havana', 'bodega', 'diner'],
  ['DULCERIA HABANA', 'Bakery', 'havana', 'bodega', 'diner'],

  // --- Wynwood Arts, Streetwear, Skate, Vinyl, Craft Breweries, Galleries & Tattoo
  ['WYNWOOD WALLS GALLERY', 'Art', 'wynwood', 'neon', 'shop'],
  ['GRAFFITI LAB STUDIO', 'Art', 'wynwood', 'neon', 'shop'],
  ['HYPEKICKS SNEAKERS', 'Footwear', 'wynwood', 'neon', 'shop'],
  ['VICE STREETWEAR', 'Apparel', 'wynwood', 'neon', 'shop'],
  ['NEON INK TATTOO', 'Tattoo', 'wynwood', 'neon', 'shop'],
  ['CHROME SKATE SHOP', 'Skate', 'wynwood', 'retail', 'shop'],
  ['VINYL GROOVE RECORDS', 'Music', 'wynwood', 'neon', 'shop'],
  ['CYBER ARCADE 1986', 'Arcade', 'wynwood', 'neon', 'shop'],
  ['VAPORWAVE LOUNGE', 'Bar', 'wynwood', 'neon', 'diner'],
  ['BREW HAUS TAPROOM', 'Brewery', 'wynwood', 'retail', 'diner'],
  ['RAMEN REBELLION', 'Ramen', 'wynwood', 'neon', 'diner'],
  ['MATCHA & MOCHI BAR', 'Cafe', 'wynwood', 'deco', 'diner'],
  ['ELECTRIC PIXEL COMICS', 'Comics', 'wynwood', 'neon', 'shop'],
  ['RETRO THREADS VINTAGE', 'Apparel', 'wynwood', 'retail', 'shop'],
  ['SPRAY CAN SUPPLY', 'Art', 'wynwood', 'neon', 'shop'],
  ['BOBA FUSION LAB', 'Tea', 'wynwood', 'deco', 'diner'],
  ['MIDNIGHT BARBERSHOP', 'Barber', 'wynwood', 'neon', 'shop'],
  ['GLITCH VR ARENA', 'Gaming', 'wynwood', 'neon', 'shop'],
  ['SYNTHWAVE SYNTHS', 'Music', 'wynwood', 'neon', 'shop'],
  ['UNDERGROUND DENIM', 'Apparel', 'wynwood', 'retail', 'shop'],
  ['NEON NOODLE HOUSE', 'Noodles', 'wynwood', 'neon', 'diner'],
  ['ARTISAN DONUT VAULT', 'Bakery', 'wynwood', 'diner', 'diner'],
  ['COSMIC BOOKS & ZINES', 'Books', 'wynwood', 'retail', 'shop'],
  ['THE LOFT ROASTERS', 'Coffee', 'wynwood', 'retail', 'diner'],
  ['DRIP CULTURE STUDIO', 'Apparel', 'wynwood', 'neon', 'shop'],
  ['BLACK CAT PIERCING', 'Tattoo', 'wynwood', 'neon', 'shop'],
  ['OUTRUN AUDIO GEAR', 'Electronics', 'wynwood', 'neon', 'shop'],
  ['COLD BREW CARTEL', 'Coffee', 'wynwood', 'retail', 'diner'],
  ['KOREAN BBQ DISTRICT', 'Food', 'wynwood', 'neon', 'diner'],
  ['PHOENIX ART HOUSE', 'Cinema', 'wynwood', 'deco', 'shop'],
  ['PIXEL PUNCH GAMING', 'Gaming', 'wynwood', 'neon', 'shop'],
  ['MURAL DISTRICT TACOS', 'Taqueria', 'wynwood', 'bodega', 'diner'],
  ['LASER TAG NEXUS', 'Arcade', 'wynwood', 'neon', 'shop'],
  ['URBAN JUNGLE PLANTS', 'Florist', 'wynwood', 'deco', 'shop'],
  ['SOLAR PUNK CYCLES', 'Bikes', 'wynwood', 'retail', 'shop'],
  ['ACID JAZZ CLUB', 'Nightlife', 'wynwood', 'neon', 'diner'],
  ['CONCRETE ROSE STUDIO', 'Art', 'wynwood', 'deco', 'shop'],
  ['HIGH VOLTAGE COFFEE', 'Coffee', 'wynwood', 'neon', 'diner'],
  ['CHICKEN & WAFFLES CO', 'Diner', 'wynwood', 'diner', 'diner'],
  ['SKULL & CROWN BARBER', 'Barber', 'wynwood', 'neon', 'shop'],

  // --- Downtown Financial Core & Luxury District (Banks, Watches, Tailors, Tech, Steakhouses, Towers)
  ['MAZE BANK SAN NOVA', 'Finance', 'downtown', 'luxury', 'bank'],
  ['FLEECA PRIVATE BANK', 'Finance', 'downtown', 'luxury', 'bank'],
  ['PACIFIC STANDARD', 'Finance', 'downtown', 'luxury', 'bank'],
  ['VANGELICO JEWELERS', 'Jewelry', 'downtown', 'luxury', 'shop'],
  ['DIDIER SACHS', 'Luxury', 'downtown', 'luxury', 'shop'],
  ['PERSEUS MENSWEAR', 'Luxury', 'downtown', 'luxury', 'shop'],
  ['SESSANTA NOVE', 'Luxury', 'downtown', 'luxury', 'shop'],
  ['ENEMA BOUTIQUE', 'Luxury', 'downtown', 'luxury', 'shop'],
  ['LE CHIEN COUTURE', 'Luxury', 'downtown', 'luxury', 'shop'],
  ['CROWEX WATCHES', 'Watches', 'downtown', 'luxury', 'shop'],
  ['KRONOS SWISS TIME', 'Watches', 'downtown', 'luxury', 'shop'],
  ['IFRUIT FLAGSHIP', 'Tech', 'downtown', 'luxury', 'shop'],
  ['LIFEINVADER HUB', 'Tech', 'downtown', 'retail', 'office'],
  ['BLEETER STUDIOS', 'Media', 'downtown', 'retail', 'office'],
  ['WEAZEL NEWS PLAZA', 'Media', 'downtown', 'retail', 'office'],
  ['DYNASTY 8 REALTY', 'Real Estate', 'downtown', 'luxury', 'office'],
  ['LENNY AVERY HOMES', 'Real Estate', 'downtown', 'luxury', 'office'],
  ['SCHYSTER LAW GROUP', 'Legal', 'downtown', 'luxury', 'office'],
  ['APEX CRYPTO EXCHANGE', 'Finance', 'downtown', 'neon', 'office'],
  ['BRICKELL PRIME STEAK', 'Steakhouse', 'downtown', 'luxury', 'diner'],
  ['SKYLINE SUSHI OMAKASE', 'Sushi', 'downtown', 'luxury', 'diner'],
  ['THE PENTHOUSE CLUB', 'Nightlife', 'downtown', 'luxury', 'diner'],
  ['VELVET CIGAR VAULT', 'Cigars', 'downtown', 'luxury', 'shop'],
  ['ROYAL MARBLE CAFE', 'Coffee', 'downtown', 'luxury', 'diner'],
  ['METROPOLITAN TAILOR', 'Tailor', 'downtown', 'luxury', 'shop'],
  ['GOLD COAST DIAMONDS', 'Jewelry', 'downtown', 'luxury', 'shop'],
  ['EMERALD TOWER SUITES', 'Hotel', 'downtown', 'luxury', 'apartment'],
  ['AURELIA FINE WINES', 'Wine', 'downtown', 'luxury', 'shop'],
  ['PLATINUM FITNESS VIP', 'Gym', 'downtown', 'luxury', 'shop'],
  ['OMNI TECH SOLUTIONS', 'Tech', 'downtown', 'retail', 'office'],
  ['NOBLE OAK BISTRO', 'Bistro', 'downtown', 'luxury', 'diner'],
  ['MONARCH ART AUCTIONS', 'Art', 'downtown', 'luxury', 'shop'],
  ['ZENITH EYEWEAR', 'Eyewear', 'downtown', 'luxury', 'shop'],
  ['CRESTVIEW CAPITAL', 'Finance', 'downtown', 'luxury', 'bank'],
  ['EXECUTIVE DRY CLEAN', 'Laundry', 'downtown', 'retail', 'shop'],
  ['LUMIERE PERFUMERY', 'Cosmetics', 'downtown', 'luxury', 'shop'],
  ['SILVER SPOON BRUNCH', 'Diner', 'downtown', 'deco', 'diner'],
  ['THE VAULT SPEAKEASY', 'Bar', 'downtown', 'luxury', 'diner'],
  ['VERITAS WATCH REPAIR', 'Watches', 'downtown', 'luxury', 'shop'],
  ['CENTRAL PLAZA DELI', 'Deli', 'downtown', 'retail', 'diner'],
  ['NOVA SYMPHONY TICKETS', 'Entertainment', 'downtown', 'deco', 'office'],
  ['APEX EXECUTIVE LOUNGE', 'Lounge', 'downtown', 'luxury', 'diner'],
  ['BISCAYNE TOWER BANK', 'Finance', 'downtown', 'luxury', 'bank'],
  ['GILDED LILY FLORAL', 'Florist', 'downtown', 'luxury', 'shop'],
  ['PRESTIGE CAR CONCIERGE', 'Auto', 'downtown', 'luxury', 'garage'],
  ['SOHO ESPRESSO BAR', 'Coffee', 'downtown', 'luxury', 'diner'],
  ['CORNERSTONE INSURANCE', 'Finance', 'downtown', 'retail', 'office'],
  ['TITANIUM BARBER CLUB', 'Barber', 'downtown', 'luxury', 'shop'],

  // --- Leonida Strip Malls, 24/7 Plazas, Pawn Shops, Fast Food, Pharmacies, Laundromats, Dispensaries
  ['24/7 SUPERMARKET', 'Grocery', 'strip', 'retail', 'shop'],
  ['LTD GASOLINE', 'Fuel', 'strip', 'retail', 'shop'],
  ['RON OIL MART', 'Fuel', 'strip', 'retail', 'shop'],
  ['GLOBE OIL EXPRESS', 'Fuel', 'strip', 'retail', 'shop'],
  ['ROBS LIQUOR', 'Liquor', 'strip', 'neon', 'shop'],
  ['BINCO CLOTHING', 'Apparel', 'strip', 'retail', 'shop'],
  ['SUBURBAN OUTFITTERS', 'Apparel', 'strip', 'retail', 'shop'],
  ['DISCOUNT STORE', 'Apparel', 'strip', 'retail', 'shop'],
  ['PROLAPS SPORTS', 'Sports', 'strip', 'retail', 'shop'],
  ['UP-N-ATOM BURGER', 'Fast Food', 'strip', 'diner', 'diner'],
  ['TACO BOMB', 'Fast Food', 'strip', 'diner', 'diner'],
  ['HORNYS BURGERS', 'Fast Food', 'strip', 'diner', 'diner'],
  ['PIZZA THIS', 'Pizza', 'strip', 'diner', 'diner'],
  ['WIGWAM BURGERS', 'Fast Food', 'strip', 'diner', 'diner'],
  ['BITE! FAST FOOD', 'Fast Food', 'strip', 'diner', 'diner'],
  ['LUCKY PLUCKER', 'Fast Food', 'strip', 'diner', 'diner'],
  ['SMOKE ON THE WATER', 'Dispensary', 'strip', 'neon', 'shop'],
  ['GREEN WAVE WELLNESS', 'Dispensary', 'strip', 'neon', 'shop'],
  ['SUNSHINE PHARMACY', 'Pharmacy', 'strip', 'retail', 'shop'],
  ['QUICK CASH CHECKS', 'Finance', 'strip', 'neon', 'bank'],
  ['LEONIDA BAIL BONDS', 'Legal', 'strip', 'neon', 'office'],
  ['GOLD RUSH PAWN', 'Pawn', 'strip', 'neon', 'shop'],
  ['CASH 4 GOLD PALACE', 'Pawn', 'strip', 'neon', 'shop'],
  ['DOLLAR KING MART', 'Discount', 'strip', 'retail', 'shop'],
  ['MEGA THRIFT DEPOT', 'Thrift', 'strip', 'retail', 'shop'],
  ['COIN DROP LAUNDRY', 'Laundry', 'strip', 'retail', 'shop'],
  ['BUBBLE WASH 24H', 'Laundry', 'strip', 'retail', 'shop'],
  ['PHONEDOCTORS REPAIR', 'Tech', 'strip', 'retail', 'shop'],
  ['CRACKED SCREEN FIX', 'Tech', 'strip', 'retail', 'shop'],
  ['NAIL PARADISE SPA', 'Salon', 'strip', 'deco', 'shop'],
  ['GLAMOUR CUTS SALON', 'Salon', 'strip', 'deco', 'shop'],
  ['VICE VAPES & SMOKE', 'Tobacco', 'strip', 'neon', 'shop'],
  ['CLOUD 9 SMOKE SHOP', 'Tobacco', 'strip', 'neon', 'shop'],
  ['DRAGON WOK EXPRESS', 'Chinese', 'strip', 'diner', 'diner'],
  ['GOLDEN LOTUS BUFFET', 'Chinese', 'strip', 'diner', 'diner'],
  ['TERIYAKI BOWL KING', 'Food', 'strip', 'diner', 'diner'],
  ['THAI SPICE KITCHEN', 'Food', 'strip', 'diner', 'diner'],
  ['BOMBAY CURRY HOUSE', 'Food', 'strip', 'bodega', 'diner'],
  ['GYRO & FALAFEL HUT', 'Food', 'strip', 'diner', 'diner'],
  ['BIG DADDYS BBQ', 'BBQ', 'strip', 'diner', 'diner'],
  ['WAFFLE PALACE 24H', 'Diner', 'strip', 'diner', 'diner'],
  ['DONUT DYNASTY', 'Bakery', 'strip', 'diner', 'diner'],
  ['FROYO FIESTA', 'Dessert', 'strip', 'deco', 'diner'],
  ['SHAVED ICE SHACK', 'Dessert', 'strip', 'deco', 'diner'],
  ['SPORTS CARDS & COMICS', 'Hobby', 'strip', 'retail', 'shop'],
  ['PAWS & CLAWS PETS', 'Pets', 'strip', 'retail', 'shop'],
  ['EXOTIC REPTILE WORLD', 'Pets', 'strip', 'neon', 'shop'],
  ['IRON PUMP GYM', 'Gym', 'strip', 'retail', 'shop'],
  ['FLEX ZONE FITNESS', 'Gym', 'strip', 'neon', 'shop'],
  ['STRIKE ZONE BOWLING', 'Arcade', 'strip', 'neon', 'shop'],
  ['NEON BILLIARDS HALL', 'Bar', 'strip', 'neon', 'diner'],
  ['LUCKY 7 LOTTO MART', 'Convenience', 'strip', 'neon', 'shop'],
  ['MIDNIGHT CORNER MART', 'Convenience', 'strip', 'neon', 'shop'],
  ['PALM PLAZA LIQUORS', 'Liquor', 'strip', 'neon', 'shop'],
  ['PARTY CITY ICE & KEG', 'Liquor', 'strip', 'retail', 'shop'],
  ['MATTRESS BARN OUTLET', 'Furniture', 'strip', 'retail', 'shop'],
  ['FURNITURE LIQUIDATORS', 'Furniture', 'strip', 'retail', 'shop'],
  ['KARATE DRAGON DOJO', 'Gym', 'strip', 'retail', 'shop'],
  ['TAX PRO EXPRESS', 'Finance', 'strip', 'retail', 'office'],
  ['METRO INSURANCE HUB', 'Finance', 'strip', 'retail', 'office'],
  ['BOOST WIRELESS ZONE', 'Tech', 'strip', 'neon', 'shop'],
  ['KEY MASTERS LOCKSMITH', 'Services', 'strip', 'retail', 'shop'],
  ['FLASH PRINT & COPY', 'Services', 'strip', 'retail', 'shop'],
  ['FAST TRACK COURIERS', 'Shipping', 'strip', 'retail', 'office'],
  ['VALUE OPTICAL CENTER', 'Eyewear', 'strip', 'retail', 'shop'],
  ['BRIGHT SMILE DENTAL', 'Medical', 'strip', 'retail', 'office'],
  ['URGENT CARE CLINIC', 'Medical', 'strip', 'retail', 'office'],
  ['HERR KUTZ BARBER', 'Barber', 'strip', 'retail', 'shop'],
  ['BOB MULET HAIR', 'Salon', 'strip', 'deco', 'shop'],
  ['BEACH COMBER MOTEL', 'Motel', 'strip', 'neon', 'apartment'],
  ['STARDUST INN', 'Motel', 'strip', 'neon', 'apartment'],
  ['FLAMINGO MOTOR LODGE', 'Motel', 'strip', 'deco', 'apartment'],
  ['TROPIC WIND MOTEL', 'Motel', 'strip', 'deco', 'apartment'],
  ['JACKPOT SLOTS ARCADE', 'Arcade', 'strip', 'neon', 'shop'],
  ['ALLIGATOR ALLEY BAR', 'Bar', 'strip', 'neon', 'diner'],
  ['GATOR BAIT & TACKLE', 'Outdoors', 'strip', 'bodega', 'shop'],
  ['SWAMP KING OUTFITTERS', 'Outdoors', 'strip', 'retail', 'shop'],
  ['SUNCOAST GUN & PAWN', 'Tactical', 'strip', 'neon', 'gun'],
  ['LEONIDA TACTICAL', 'Tactical', 'strip', 'retail', 'gun'],
  ['PATRIOT SURPLUS', 'Tactical', 'strip', 'retail', 'gun'],
  ['SECOND CHANCE THRIFT', 'Thrift', 'strip', 'retail', 'shop'],
  ['BUDGET RENTAL CARS', 'Auto', 'strip', 'retail', 'garage'],

  // --- Marina, Pier & Waterfront (Seafood, Yachts, Dive Shops, Tiki Bars, Charters)
  ['CAPTAINS CRAB SHACK', 'Seafood', 'marina', 'diner', 'diner'],
  ['VICE MARINA YACHTS', 'Marine', 'marina', 'luxury', 'office'],
  ['STARFISH OYSTER BAR', 'Seafood', 'marina', 'deco', 'diner'],
  ['TIKI TORCH CANTINA', 'Bar', 'marina', 'neon', 'diner'],
  ['DEEP BLUE DIVE SHOP', 'Marine', 'marina', 'deco', 'shop'],
  ['PELICAN BAY CHARTERS', 'Marine', 'marina', 'retail', 'office'],
  ['HARBOR LIGHTS GRILL', 'Seafood', 'marina', 'deco', 'diner'],
  ['ANCHOR DOWN PUB', 'Bar', 'marina', 'diner', 'diner'],
  ['SAILFISH MARINE PRO', 'Marine', 'marina', 'retail', 'shop'],
  ['PIER 66 ICE CREAM', 'Dessert', 'marina', 'deco', 'diner'],
  ['SUNSET CRUISE TICKETS', 'Tourism', 'marina', 'deco', 'office'],
  ['BARRACUDA BOAT WORKS', 'Marine', 'marina', 'retail', 'garage'],
  ['KEYS LOBSTER ROLLS', 'Seafood', 'marina', 'diner', 'diner'],
  ['CORAL WATER SPORTS', 'Marine', 'marina', 'deco', 'shop'],
  ['BOARDWALK FUNNEL CAKE', 'Dessert', 'marina', 'diner', 'diner'],
  ['NEPTUNE BAIT & ICE', 'Marine', 'marina', 'retail', 'shop'],
  ['THE SALTY DOG TAVERN', 'Bar', 'marina', 'bodega', 'diner'],
  ['YACHT CLUB PROVISION', 'Luxury', 'marina', 'luxury', 'shop'],
  ['PARASAIL PARADISE', 'Tourism', 'marina', 'deco', 'office'],
  ['OCEANIC SHELL MARKET', 'Souvenirs', 'marina', 'deco', 'shop'],
  ['BAYSIDE RUM BAR', 'Bar', 'marina', 'neon', 'diner'],
  ['MARINA DEL REY CAFE', 'Cafe', 'marina', 'deco', 'diner'],
  ['LIGHTHOUSE CLAM BAR', 'Seafood', 'marina', 'diner', 'diner'],
  ['DOLPHIN WATCH TOURS', 'Tourism', 'marina', 'deco', 'office'],

  // --- Auto Customs, Industrial Port & Garages
  ['LOS SANTOS CUSTOMS SN', 'Auto', 'industrial', 'neon', 'garage'],
  ['BENNYS ORIGINAL MOTOR', 'Auto', 'industrial', 'neon', 'garage'],
  ['SUNSHINE AUTOS', 'Auto', 'industrial', 'deco', 'garage'],
  ['PREMIUM DELUXE MOTOR', 'Auto', 'industrial', 'luxury', 'garage'],
  ['TURBO TUNERS GARAGE', 'Auto', 'industrial', 'neon', 'garage'],
  ['NITROUS IMPORTS', 'Auto', 'industrial', 'neon', 'garage'],
  ['CHROME RIMS & TIRES', 'Auto', 'industrial', 'retail', 'garage'],
  ['DONK & LIFT CUSTOMS', 'Auto', 'industrial', 'neon', 'garage'],
  ['LOWRIDER HYDRAULICS', 'Auto', 'industrial', 'neon', 'garage'],
  ['APEX BODY & PAINT', 'Auto', 'industrial', 'retail', 'garage'],
  ['MUFFLER KING EXHAUST', 'Auto', 'industrial', 'retail', 'garage'],
  ['VICE MOTORCYCLES', 'Moto', 'industrial', 'neon', 'garage'],
  ['STEEL HORSE CHOPPERS', 'Moto', 'industrial', 'neon', 'garage'],
  ['REDLINE AUTO PARTS', 'Auto', 'industrial', 'retail', 'shop'],
  ['TORQUE WRENCH SUPPLY', 'Tools', 'industrial', 'retail', 'shop'],
  ['PORT CARGO LOGISTICS', 'Shipping', 'industrial', 'retail', 'office'],
  ['ATLANTIC FREIGHT CO', 'Shipping', 'industrial', 'retail', 'office'],
  ['MEGA HARDWARE DEPOT', 'Hardware', 'industrial', 'retail', 'shop'],
  ['STEELWORKS FOUNDRY', 'Industrial', 'industrial', 'retail', 'garage'],
  ['HARBOR SCRAP & SALVAGE', 'Auto', 'industrial', 'retail', 'garage'],
  ['BLUE COLLAR DINER', 'Diner', 'industrial', 'diner', 'diner'],
  ['NIGHT SHIFT COFFEE', 'Coffee', 'industrial', 'diner', 'diner'],
  ['DOCKSIDE DIESEL', 'Fuel', 'industrial', 'retail', 'shop'],
  ['CUSTOM WRAPS & TINT', 'Auto', 'industrial', 'neon', 'garage'],
  ['SPEED SHOP DYNO', 'Auto', 'industrial', 'neon', 'garage'],
  ['CAR WASH EXPRESS', 'Auto', 'industrial', 'deco', 'garage'],
  ['TIRE BARN WHOLESALE', 'Auto', 'industrial', 'retail', 'garage'],
  ['ELECTRIC EV CHARGERS', 'Auto', 'industrial', 'deco', 'garage'],
  ['HEAVY RIGS REPAIR', 'Auto', 'industrial', 'retail', 'garage'],
  ['FORKLIFT RENTALS SN', 'Industrial', 'industrial', 'retail', 'garage'],
  ['CONTAINERS DIRECT', 'Shipping', 'industrial', 'retail', 'office'],
  ['WELDING & FABRICATION', 'Industrial', 'industrial', 'retail', 'garage'],

  // --- San Nova International Airport, Aviation & Outer Highway Oasis
  ['SAN NOVA INTL TERMINAL', 'Airport', 'airport', 'deco', 'office'],
  ['FLYUS TICKET COUNTER', 'Aviation', 'airport', 'retail', 'office'],
  ['AIR EMU CARGO', 'Aviation', 'airport', 'retail', 'office'],
  ['ELITAS TRAVEL JETS', 'Aviation', 'airport', 'luxury', 'office'],
  ['SKYLINE FLIGHT SCHOOL', 'Aviation', 'airport', 'deco', 'office'],
  ['HANGAR 7 AVIONICS', 'Aviation', 'airport', 'retail', 'garage'],
  ['DUTY FREE LUXURY', 'Luxury', 'airport', 'luxury', 'shop'],
  ['RUNWAY VIEW LOUNGE', 'Bar', 'airport', 'deco', 'diner'],
  ['JETSTREAM CAFE', 'Coffee', 'airport', 'retail', 'diner'],
  ['JET FUEL & CHARTER', 'Aviation', 'airport', 'retail', 'garage'],
  ['AERO CLUB RENTALS', 'Aviation', 'airport', 'neon', 'office'],
  ['DUNES OASIS MOTEL', 'Motel', 'airport', 'neon', 'apartment'],
  ['CACTUS JACKS SALOON', 'Bar', 'airport', 'diner', 'diner'],
  ['ROUTE 66 TRUCK STOP', 'Fuel', 'airport', 'diner', 'shop'],
  ['DESERT MIRAGE DINER', 'Diner', 'airport', 'diner', 'diner'],
  ['SUNSET SKYDIVING', 'Aviation', 'airport', 'neon', 'office'],
];

const PALETTE: Record<StoreStyle, { bg: string[]; fg: string[]; accent: string[] }> = {
  deco: {
    bg: ['#18293a', '#1d363e', '#2d1c34', '#162b30', '#382230'],
    fg: ['#ff88c2', '#52f0e8', '#ffe380', '#ffab76', '#a8ffda'],
    accent: ['#3ef2e8', '#ff62b0', '#ffd859', '#ffffff'],
  },
  neon: {
    bg: ['#0d0a1a', '#140b1f', '#0a1420', '#1c0b16', '#0d1917'],
    fg: ['#ff3b9a', '#29e8ff', '#ffe03d', '#6bff6e', '#ff7b29', '#c770ff'],
    accent: ['#29e8ff', '#ff3b9a', '#ffd23d', '#6bff6e'],
  },
  bodega: {
    bg: ['#26140c', '#142a1c', '#2c1518', '#152236', '#2e200d'],
    fg: ['#ffd23d', '#ff7a3b', '#fff4d6', '#56f09e', '#ff6464'],
    accent: ['#ff4b4b', '#ffd23d', '#2ec4b6', '#ff9f1c'],
  },
  luxury: {
    bg: ['#0d0d10', '#14131a', '#0c1614', '#17120e'],
    fg: ['#f5d77a', '#ffffff', '#e8c468', '#d4e2e8'],
    accent: ['#d4af37', '#f7e7a8', '#b8963e'],
  },
  retail: {
    bg: ['#122238', '#1f1e24', '#142b22', '#2b1616', '#1c2432'],
    fg: ['#ffffff', '#ffdd57', '#66d9ff', '#ff8052', '#82f59a'],
    accent: ['#38bdf8', '#facc15', '#ef4444', '#22c55e'],
  },
  diner: {
    bg: ['#2b0d12', '#172638', '#2a1a0a', '#1d1026'],
    fg: ['#ffdf5a', '#ff5978', '#52f0ff', '#fff7e0'],
    accent: ['#ff4b5c', '#52f0ff', '#ffd23d', '#ffffff'],
  },
};

export const STORES: readonly StoreDef[] = RAW_STORES.map((entry, idx) => {
  const [name, category, district, style, doorKind] = entry;
  const p = PALETTE[style];
  let fg = p.fg[idx % p.fg.length];
  let accent = p.accent[(idx * 3 + 1) % p.accent.length];
  if (name === 'POLICE') { fg = '#5aa0ff'; accent = '#ffffff'; }
  else if (name === 'HOSPITAL') { fg = '#ff5a5a'; accent = '#ffffff'; }
  else if (name === 'BANK') { fg = '#ffe066'; accent = '#d4af37'; }
  else if (name === 'AMMO') { fg = '#ff4848'; accent = '#ffd23d'; }
  return {
    id: idx,
    name,
    category,
    district,
    style,
    bg: p.bg[idx % p.bg.length],
    fg,
    accent,
    doorKind,
  };
});

export const STORE_COUNT = STORES.length;

const NAME_TO_INDEX = new Map<string, number>();
STORES.forEach((s, i) => NAME_TO_INDEX.set(s.name, i));

export function getStoreIndexByName(name: string): number {
  const exact = NAME_TO_INDEX.get(name);
  if (exact !== undefined) return exact;
  const upper = name.toUpperCase();
  const exactU = NAME_TO_INDEX.get(upper);
  if (exactU !== undefined) return exactU;
  // fallback legacy aliases
  if (upper.includes('PIZZA')) return NAME_TO_INDEX.get('WELL STACKED PIZZA') ?? 13;
  if (upper.includes('DINER')) return NAME_TO_INDEX.get('PINK CADILLAC DINER') ?? 28;
  if (upper.includes('CAFE') || upper.includes('COFFEE')) return NAME_TO_INDEX.get('BEAN MACHINE') ?? 14;
  if (upper.includes('HOTEL') || upper.includes('MOTEL')) return NAME_TO_INDEX.get('OCEAN VIEW HOTEL') ?? 8;
  if (upper.includes('BARBER')) return NAME_TO_INDEX.get('CALLE NOVA BARBERS') ?? 64;
  if (upper.includes('BURGER')) return NAME_TO_INDEX.get('BURGER SHOT') ?? 12;
  if (upper.includes('TACO')) return NAME_TO_INDEX.get('EL REY DEL TACO') ?? 62;
  if (upper.includes('LIQUOR')) return NAME_TO_INDEX.get('UNCLE JACK LIQUOR') ?? 10;
  return 0;
}

export function getStoreByIndex(idx: number): StoreDef {
  return STORES[((idx % STORES.length) + STORES.length) % STORES.length];
}

export function getStoresByDistrict(district: StoreDef['district']): StoreDef[] {
  return STORES.filter((s) => s.district === district);
}
