/**
 * San Nova 192+ Handcrafted Random World Events Catalog & Runtime Spawner
 *
 * 12 distinct urban/suburban/coastal categories × 16 unique, cool, funny, grounded
 * events each = 192 hand-authored events (zero generic template spam).
 */

export type RandomEventCategory =
  | 'street_comedy'
  | 'heist_opportunity'
  | 'road_chaos'
  | 'civic_hero'
  | 'bizarre_encounter'
  | 'neighborhood_drama'
  | 'nightlife_incident'
  | 'coastal_shenanigans'
  | 'tech_mishap'
  | 'delivery_fiasco'
  | 'art_and_music'
  | 'suburban_mayhem';

export interface RandomEventDef {
  id: string;
  category: RandomEventCategory;
  title: string;
  headline: string;
  dialogue: string;
  resolutionText: string;
  rewardCash: number;
  spawnKind: 'cash_drop' | 'npc_scene' | 'vehicle_scene' | 'chase_scene' | 'performer_scene';
  timeWindow: 'any' | 'day' | 'night';
}

interface RawEventSpec {
  cat: RandomEventCategory;
  title: string;
  headline: string;
  dialogue: string;
  resolution: string;
  reward: number;
  spawn: RandomEventDef['spawnKind'];
  time?: 'any' | 'day' | 'night';
}

const RAW_EVENTS: RawEventSpec[] = [
  // 1. STREET COMEDY (16)
  { cat: 'street_comedy', title: 'Runaway Espresso Cart', headline: 'Barista chasing a rolling espresso cart downhill', dialogue: 'STOP THAT LATTE MACHINE! IT HAS TWO HUNDRED DOLLARS OF OAT MILK!', resolution: 'Helped brake the espresso cart — barista tipped you generously.', reward: 140, spawn: 'npc_scene' },
  { cat: 'street_comedy', title: 'Mime Turf War', headline: 'Two rival street mimes arguing in aggressive silence', dialogue: '...*furious invisible wall slapping*...', resolution: 'Clapped for the underdog mime — crowd tossed tips your way.', reward: 95, spawn: 'performer_scene' },
  { cat: 'street_comedy', title: 'Pigeon Mafia Toll', headline: 'Man surrounded by overly confident boardwalk pigeons', dialogue: 'They took my whole bagel AND my sunglasses!', resolution: 'Scattered the feathered syndicate — guy gave you a thank-you bill.', reward: 85, spawn: 'npc_scene' },
  { cat: 'street_comedy', title: 'Wrong Twin Date', headline: 'Awkward double-date mixup outside a bistro', dialogue: 'Wait—you are NOT Diego?! You have the exact same haircut!', resolution: 'Defused the twin disaster with comedic timing.', reward: 110, spawn: 'npc_scene' },
  { cat: 'street_comedy', title: 'Overdressed Jogger', headline: 'Guy jogging in a full tuxedo and loafers', dialogue: 'Late to my own brother’s wedding—traffic is dead!', resolution: 'Pointed out a shortcut through the alley — he tossed a crisp bill.', reward: 160, spawn: 'npc_scene' },
  { cat: 'street_comedy', title: 'Lost Costume Mascot', headline: 'Giant foam flamingo mascot asking for directions', dialogue: 'I can barely see out of this beak, is this Ocean Drive?!', resolution: 'Guided the flamingo back to the grand opening.', reward: 125, spawn: 'performer_scene' },
  { cat: 'street_comedy', title: 'Grocery Bag Avalanche', headline: 'Oranges rolling down an entire city block', dialogue: 'Not the organic tangerines! Catch the big one!', resolution: 'Corralling the citrus avalanche earned a fresh cash tip.', reward: 90, spawn: 'npc_scene' },
  { cat: 'street_comedy', title: 'Accidental Parade Leader', headline: 'Tourist accidentally marching ahead of a drumline', dialogue: 'I just crossed the street and now twelve drummers follow me!', resolution: 'Steered the impromptu parade cleanly down the avenue.', reward: 130, spawn: 'performer_scene' },
  { cat: 'street_comedy', title: 'Overly Honest Street Magician', headline: 'Magician accidentally explaining every single trick', dialogue: 'And now watch me shove the quarter right into my left sleeve—oops.', resolution: 'Bought his last deck and hyped up the crowd.', reward: 105, spawn: 'performer_scene' },
  { cat: 'street_comedy', title: 'Gym Bro Moving a Couch', headline: 'Two bodybuilders stuck trying to pivot a sofa on a curb', dialogue: 'PIVOT! Bro you are rotating the WRONG axis!', resolution: 'Called the angle and helped clear the curb.', reward: 150, spawn: 'npc_scene' },
  { cat: 'street_comedy', title: 'Hot Sauce Regret', headline: 'Influencer regretting a Reaper Wing street challenge', dialogue: 'Tell my followers... I need milk... SO MUCH MILK!', resolution: 'Handed over a cold drink from the kiosk — sponsor paid out.', reward: 175, spawn: 'npc_scene' },
  { cat: 'street_comedy', title: 'GPS Into a Fountain', headline: 'Pedestrian faithfully staring at phone while walking toward water', dialogue: 'Recalculating... turn left in two feet? Wait—SPLASH!', resolution: 'Pulled them back before the plunge — grateful reward!', reward: 120, spawn: 'npc_scene' },
  { cat: 'street_comedy', title: 'Karaoke Megaphone Duel', headline: 'Two strangers duetting 80s power ballads across the street', dialogue: 'HOLD ON TO THAT FEELING—YEAH YOU OVER THERE!', resolution: 'Joined the chorus and collected street applause cash.', reward: 115, spawn: 'performer_scene' },
  { cat: 'street_comedy', title: 'Dog Walked by Ten Chihuahuas', headline: 'Dog walker dragged rapidly down the sidewalk', dialogue: 'THEY SAW A SQUIRREL! SEND HELP!', resolution: 'Calmed the tiny stampede with a snack wrapper.', reward: 135, spawn: 'npc_scene' },
  { cat: 'street_comedy', title: 'Inflatable Tube Man Escape', headline: 'Car lot tube-man broke loose and bounced across traffic', dialogue: 'Wacky Walter is loose again! Grab the blower cord!', resolution: 'Tamed the runaway tube man for the grateful dealership.', reward: 185, spawn: 'npc_scene' },
  { cat: 'street_comedy', title: 'Salsa-Dancing Traffic Flagger', headline: 'Construction worker directing cars with elite footwork', dialogue: 'Left turn, cha-cha-cha, merge smooth baby!', resolution: 'Tipped the legend — he tossed back a VIP concert pass worth cash.', reward: 145, spawn: 'performer_scene' },

  // 2. HEIST OPPORTUNITY (16)
  { cat: 'heist_opportunity', title: 'Open Armored Van Rear Latch', headline: 'Cash bundle tumbled off an armored courier bump', dialogue: 'Driver didn’t even notice the back latch bounced open!', resolution: 'Scooped the loose unmarked cash bundle before anyone noticed!', reward: 950, spawn: 'cash_drop' },
  { cat: 'heist_opportunity', title: 'Abandoned Smuggler Briefcase', headline: 'Silver briefcase left behind in a hurried alley handoff', dialogue: 'Leave the case! Sirens two blocks up—scatter!', resolution: 'Popped the latch and pocketed the crisp street bills.', reward: 1150, spawn: 'cash_drop' },
  { cat: 'heist_opportunity', title: 'High-Roller Poker Drop', headline: 'Penthouse gambler dropped an envelope sprinting to a cab', dialogue: 'Keep the engine running! Wait—my buy-in!', resolution: 'Claimed the unclaimed high-roller stake off the curb.', reward: 820, spawn: 'cash_drop' },
  { cat: 'heist_opportunity', title: 'Botched ATM Refill', headline: 'Courier dropped a spare cassette tray while chasing his hat', dialogue: 'Great, wind took my clipboard AND my hat!', resolution: 'Snatched the stray bills fluttering down the gutter.', reward: 780, spawn: 'cash_drop' },
  { cat: 'heist_opportunity', title: 'Rooftop Parachute Stash', headline: 'Duffle bag drifted down onto the boulevard from a cessna', dialogue: 'Did a bag just fall out of the sky?!', resolution: 'Secured the mystery air-drop stash.', reward: 1400, spawn: 'cash_drop' },
  { cat: 'heist_opportunity', title: 'Busted Syndicate Dead-Drop', headline: 'Two rival crew scouts spotted each other and bolted', dialogue: 'It’s a setup! Abort the drop!', resolution: 'Collected the abandoned dead-drop envelope.', reward: 980, spawn: 'cash_drop' },
  { cat: 'heist_opportunity', title: 'Crypto Bro Hardware Ledger', headline: 'Flashy trader accidentally tossed his backup seed pouch', dialogue: 'Wait, that was the WRONG jacket pocket!', resolution: 'Returned the recovery code for a massive finder’s bounty.', reward: 1250, spawn: 'npc_scene' },
  { cat: 'heist_opportunity', title: 'Illegal Street Bookie Payout', headline: 'Sidewalk betting pot left unguarded when patrol car passed', dialogue: 'Cops! Split up, meet at the pier!', resolution: 'Swept up the unclaimed race bets.', reward: 890, spawn: 'cash_drop' },
  { cat: 'heist_opportunity', title: 'Museum Crate Spill', headline: 'Replica gold bullion bars slid off a movie prop truck', dialogue: 'Those are solid plated props—worth a grand to collectors!', resolution: 'Salvaged a loose gilded bar from the curb.', reward: 1100, spawn: 'cash_drop' },
  { cat: 'heist_opportunity', title: 'VIP Bottle Service Tip Jar', headline: 'Nightclub promoter dropped his cash float outside the velvet rope', dialogue: 'Yo grab the float before the crowd sees it!', resolution: 'Helped recover the club float and took a hefty cut.', reward: 640, spawn: 'npc_scene', time: 'night' },
  { cat: 'heist_opportunity', title: 'Unattended Valet Supercar', headline: 'Valet ran inside leaving an exotic sports car idling', dialogue: 'I’ll be right back, left the ticket stub at the desk!', resolution: 'Moved the supercar out of a tow zone — owner tipped huge.', reward: 720, spawn: 'vehicle_scene' },
  { cat: 'heist_opportunity', title: 'Dockside Container Leak', headline: 'Import pallet split open revealing luxury watches', dialogue: 'Manifest says damaged goods—write it off!', resolution: 'Rescued a pristine boxed timepiece from the pavement.', reward: 1050, spawn: 'cash_drop' },
  { cat: 'heist_opportunity', title: 'Runaway Lottery Scratch Stack', headline: 'Convenience clerk chasing wind-blown winning tickets', dialogue: 'Catch those—one of them already hit five hundred!', resolution: 'Handed back the bundle and got a sweet split.', reward: 560, spawn: 'npc_scene' },
  { cat: 'heist_opportunity', title: 'Rival Cartel Cash Stash', headline: 'Hidden duffle tucked behind a neon billboard base', dialogue: 'Nobody touches the northside drop until midnight.', resolution: 'Beat the midnight pickup and emptied the duffle.', reward: 1550, spawn: 'cash_drop', time: 'night' },
  { cat: 'heist_opportunity', title: 'Gold-Plated Pawn Run', headline: 'Pawn broker locked himself out of his armored hatchback', dialogue: 'Keys are on the dash and I’ve got buyers waiting!', resolution: 'Popped the door latch clean — earned a generous pawn bonus.', reward: 680, spawn: 'vehicle_scene' },
  { cat: 'heist_opportunity', title: 'Subway Token Vault Surplus', headline: 'Transit contractor clearing vintage commemorative coins', dialogue: 'Collector coins are worth way more than face value!', resolution: 'Bought low and flipped a rare mint set on the spot.', reward: 740, spawn: 'npc_scene' },

  // 3. ROAD CHAOS (16)
  { cat: 'road_chaos', title: 'Double-Parked Delivery Standoff', headline: 'Two box trucks refusing to back up on a narrow lane', dialogue: 'I was here first! YOU reverse!', resolution: 'Spotted the clearance gap and got traffic flowing again.', reward: 165, spawn: 'vehicle_scene' },
  { cat: 'road_chaos', title: 'Hypercar Exhaust Backfire', headline: 'Supercar revving so loud it set off six car alarms', dialogue: 'BRO LISTEN TO THAT TWIN-TURBO POP!', resolution: 'Snapped a viral clip of the flames — owner paid for the footage.', reward: 220, spawn: 'vehicle_scene' },
  { cat: 'road_chaos', title: 'Tire-Blowout Pit Crew', headline: 'Commuter stranded with a shredded front tire', dialogue: 'My spare is flat too, today is cursed!', resolution: 'Helped flag a tow and patch the rim — earned road karma cash.', reward: 190, spawn: 'vehicle_scene' },
  { cat: 'road_chaos', title: 'Lowrider Hydraulic Showoff', headline: 'Custom cruiser bouncing three feet off the asphalt at a red light', dialogue: 'Check the three-wheel motion, San Nova style!', resolution: 'Cheered the drop and won a sidewalk crowd wager.', reward: 240, spawn: 'vehicle_scene' },
  { cat: 'road_chaos', title: 'Runaway Shopping Cart Derby', headline: 'Line of six grocery carts cruising down an avenue', dialogue: 'Watch the paint! Watch the paint!!', resolution: 'Intercepted the steel train before it hit a coupe.', reward: 155, spawn: 'npc_scene' },
  { cat: 'road_chaos', title: 'Tour Bus Wrong Turn', headline: 'Double-decker sightseeing bus wedged near a tight corner', dialogue: 'And on your left, folks, a very narrow lamppost!', resolution: 'Guided the driver’s blindspot cleanly around the bend.', reward: 210, spawn: 'vehicle_scene' },
  { cat: 'road_chaos', title: 'Street Racer Warmup', headline: 'Two tuned coupes staging an impromptu midnight sprint', dialogue: 'First one to the boardwalk bridge takes five hundred!', resolution: 'Flagged the clean launch and pocketed the starter fee.', reward: 380, spawn: 'vehicle_scene', time: 'night' },
  { cat: 'road_chaos', title: 'Overheated Radiator Geyser', headline: 'Classic sedan steaming like a locomotive at the intersection', dialogue: 'Don’t open the cap yet—I TOLD you not to open it!', resolution: 'Helped push the classic onto the shoulder safely.', reward: 175, spawn: 'vehicle_scene' },
  { cat: 'road_chaos', title: 'Scooter Fleet Pileup', headline: 'Domino effect of twelve rental scooters tipping in sync', dialogue: 'One bumped the rack and ALL of them went down!', resolution: 'Stood the fleet back up — app company auto-credited a bounty.', reward: 145, spawn: 'npc_scene' },
  { cat: 'road_chaos', title: 'Pizza Van Drift Turn', headline: 'Delivery driver taking a hairpin corner at maximum commitment', dialogue: 'Thirty minutes or it’s free—HOLD THE GARLIC KNOTS!', resolution: 'Caught a sliding pizza box intact — driver tipped you big.', reward: 160, spawn: 'vehicle_scene' },
  { cat: 'road_chaos', title: 'Honking Symphony', headline: 'Gridlock drivers unintentionally harmonizing their car horns', dialogue: 'Wait—do that C-sharp honk again, we got a groove!', resolution: 'Conducted the intersection until the light cycled green.', reward: 130, spawn: 'vehicle_scene' },
  { cat: 'road_chaos', title: 'Unsecured Mattress Airborne', headline: 'Memory foam mattress slid off a sedan roof onto the lane', dialogue: 'I swore that bungee cord was tight!', resolution: 'Hauled the rogue mattress off the road for a grateful driver.', reward: 180, spawn: 'vehicle_scene' },
  { cat: 'road_chaos', title: 'Parking Meter Inspector Chase', headline: 'Driver sprinting barefoot to feed a blinking red meter', dialogue: 'DON’T PRINT THE TICKET! I HAVE QUARTERS!', resolution: 'Dropped a coin in just in time — driver paid you 100x back.', reward: 150, spawn: 'npc_scene' },
  { cat: 'road_chaos', title: 'Limo Bachelorette Traffic Jam', headline: 'Stretch limo waving neon glowsticks out the sunroof', dialogue: 'WOOO! SAN NOVA BABY! HONK IF YOU LOVE FRIDAYS!', resolution: 'Hyped up the convoy and caught a tossed VIP gift card.', reward: 215, spawn: 'vehicle_scene', time: 'night' },
  { cat: 'road_chaos', title: 'Bumper Sticker Debate', headline: 'Two motorists pulled over debating a sports rivalry sticker', dialogue: 'We won TWO rings since then, check the scoreboard!', resolution: 'Settled the trivia stat and won the side bet.', reward: 140, spawn: 'vehicle_scene' },
  { cat: 'road_chaos', title: 'Rogue Construction Cone Maze', headline: 'Pranksters rearranged traffic cones into a spiral', dialogue: 'Who turned 5th Avenue into a Mario track?!', resolution: 'Cleared the spiral path for commuters.', reward: 165, spawn: 'npc_scene' },

  // 4. CIVIC HERO (16)
  { cat: 'civic_hero', title: 'Purse Snatcher Sprint', headline: 'Pickpocket bolting down the sidewalk with a stolen handbag', dialogue: 'Stop him! My passport and rent money are in there!', resolution: 'Intercepted the thief and returned the bag — huge gratitude reward!', reward: 420, spawn: 'chase_scene' },
  { cat: 'civic_hero', title: 'Bike Thief Caught Red-Handed', headline: 'Shady guy sawing a bike lock outside the coffee shop', dialogue: 'Hey! That’s my commuter bike, back off!', resolution: 'Scared off the thief — cyclist paid you a solid reward.', reward: 310, spawn: 'chase_scene' },
  { cat: 'civic_hero', title: 'Lost Senior Finding Home', headline: 'Disoriented grandfather squinting at street signs', dialogue: 'Used to be a bakery on this corner back in eighty-four...', resolution: 'Walked him to the right bus shelter — family thanked you warmly.', reward: 220, spawn: 'npc_scene' },
  { cat: 'civic_hero', title: 'Stolen Laptop Backpack', headline: 'Student chasing a snatch-and-run runner with her thesis inside', dialogue: 'MY THESIS IS NOT BACKED UP! STOP HIM!', resolution: 'Recovered the backpack intact — student insisted on a reward.', reward: 360, spawn: 'chase_scene' },
  { cat: 'civic_hero', title: 'Paramedic Stretcher Clear', headline: 'Ambulance crew blocked by double-parked sightseers', dialogue: 'Clear the lane folks, we have an urgent transfer!', resolution: 'Cleared the crowd fast — EMT crew tossed a commendation voucher.', reward: 250, spawn: 'vehicle_scene' },
  { cat: 'civic_hero', title: 'Hydrant Geyser Splash', headline: 'Cracked fire hydrant drenching an open bookstore display', dialogue: 'My first editions! Somebody grab a wrench!', resolution: 'Cranked the auxiliary shutoff valve — bookseller rewarded you.', reward: 290, spawn: 'npc_scene' },
  { cat: 'civic_hero', title: 'Shoplifter Alley Dash', headline: 'Corner store owner chasing a jacket-stuffing bandit', dialogue: 'He took six cartons of fancy jerky! Get him!', resolution: 'Cut off the alley escape — grocer paid a generous bounty.', reward: 340, spawn: 'chase_scene' },
  { cat: 'civic_hero', title: 'Stranded Nurse Late Shift', headline: 'Hospital nurse waiting on a canceled rideshare in the rain', dialogue: 'My ride canceled twice and my ER shift starts in five!', resolution: 'Helped arrange a fast lift — hospital appreciation bonus.', reward: 270, spawn: 'npc_scene', time: 'night' },
  { cat: 'civic_hero', title: 'Runaway Stroller Catch', headline: 'Empty delivery cart rolling fast toward a crosswalk', dialogue: 'Watch out! The brake latch snapped!', resolution: 'Stepped in and stopped the cart inches from the curb.', reward: 240, spawn: 'npc_scene' },
  { cat: 'civic_hero', title: 'Lost Tourist Wallet', headline: 'Family frantically retracing steps looking for a brown wallet', dialogue: 'All our hotel keys and cards were right there!', resolution: 'Spotted the wallet by a bench and returned every dollar.', reward: 320, spawn: 'npc_scene' },
  { cat: 'civic_hero', title: 'Vandal Tagging Mural', headline: 'Tagging crew about to spray over a beloved local tribute mural', dialogue: 'Yo that mural took six months, don’t ruin it!', resolution: 'Talked them down — neighborhood association rewarded you.', reward: 280, spawn: 'npc_scene' },
  { cat: 'civic_hero', title: 'Locked Out Baker', headline: 'Bakery oven timer beeping inside while owner is locked out', dialogue: 'Forty trays of croissants are about to incinerate!', resolution: 'Boosted open the transoms — baker paid you in cash & pastries.', reward: 260, spawn: 'npc_scene', time: 'day' },
  { cat: 'civic_hero', title: 'Fake Parking Attendant Scam', headline: 'Con artist charging $40 in a free public lot', dialogue: 'Cash only pal, city mandate—totally official!', resolution: 'Exposed the scam — grateful drivers pooled a thank-you tip.', reward: 350, spawn: 'npc_scene' },
  { cat: 'civic_hero', title: 'Dropped Wedding Ring Grate', headline: 'Panicked fiancé peering down a sidewalk utility grate', dialogue: 'I literally just picked it up from the jeweler!', resolution: 'Fished the ring out with a bent wire — massive gratitude payout!', reward: 500, spawn: 'npc_scene' },
  { cat: 'civic_hero', title: 'Stray Puppy on Boulevard', headline: 'Tiny golden puppy trotting fearlessly into oncoming lanes', dialogue: 'Somebody stop traffic—little guy slipped his collar!', resolution: 'Scooped the pup safely back to its crying owner.', reward: 300, spawn: 'npc_scene' },
  { cat: 'civic_hero', title: 'Food Truck Propane Shutoff', headline: 'Taco truck grill flaring dangerously near the curb', dialogue: 'Valve is jammed! Back up everybody!', resolution: 'Snapped the exterior safety shutoff — chef gave you the day’s tips.', reward: 390, spawn: 'vehicle_scene' },

  // 5. BIZARRE ENCOUNTER (16)
  { cat: 'bizarre_encounter', title: 'Time Traveler Asking the Year', headline: 'Guy in chrome goggles frantically checking a newspaper', dialogue: 'WAIT—2026?! I overshot the stock split by twelve years!', resolution: 'Gave him today’s date — he handed you a pristine vintage silver bill.', reward: 310, spawn: 'npc_scene' },
  { cat: 'bizarre_encounter', title: 'Man Walking an Invisible Dog', headline: 'Stiff leash hovering in mid-air as owner chats to it', dialogue: 'Good boy Barnaby! Don’t bark at the sports car!', resolution: 'Petted Barnaby respectfully — eccentric millionaire tipped you.', reward: 400, spawn: 'npc_scene' },
  { cat: 'bizarre_encounter', title: 'Conspiracy Theorist Map Drop', headline: 'Red-string corkboard spilled across a park bench', dialogue: 'THE TRAFFIC LIGHTS ARE SYNCED TO THE MOON PHASES, WAKE UP!', resolution: 'Listened for thirty seconds — he paid you to "stay alert."', reward: 145, spawn: 'npc_scene' },
  { cat: 'bizarre_encounter', title: 'Medieval Knight Buying Coffee', headline: 'Full plate-armor cosplayer struggling with a contactless card', dialogue: 'Mine gauntlets refuse to trigger thine NFC terminal!', resolution: 'Tapped his card for him — knight bestowed a coin pouch.', reward: 195, spawn: 'npc_scene' },
  { cat: 'bizarre_encounter', title: 'Pigeon Whisperer Sermon', headline: 'Trenchcoat philosopher lecturing twenty attentive birds', dialogue: 'And THAT is why bread crusts represent late-stage abundance.', resolution: 'Dropped a respectful nod — received a mysterious envelope.', reward: 165, spawn: 'npc_scene' },
  { cat: 'bizarre_encounter', title: 'Guy Measuring Puddles', headline: 'Clipboard scientist dipping a brass ruler into gutter water', dialogue: 'Fascinating—three millimeters deeper than Tuesday’s baseline.', resolution: 'Logged an observation — university grant stipend paid out.', reward: 180, spawn: 'npc_scene' },
  { cat: 'bizarre_encounter', title: 'Duplicate Twins in Sync', headline: 'Triplets wearing identical neon tracksuits moving in mirror unison', dialogue: 'Excuse us—excuse us—excuse us!', resolution: 'Matched their stride for five seconds — they cheered and tipped.', reward: 175, spawn: 'performer_scene' },
  { cat: 'bizarre_encounter', title: 'Reverse-Walking Athlete', headline: 'Marathoner sprinting backwards down the avenue at full speed', dialogue: 'It works the hamstrings AND confuses my rivals!', resolution: 'Called out a curb ahead so he didn’t eat pavement.', reward: 155, spawn: 'npc_scene' },
  { cat: 'bizarre_encounter', title: 'Man Trading Paperclip Upward', headline: 'Optimistic hustler holding a red paperclip and a toaster', dialogue: 'Started with a paperclip at noon—by dinner I want a yacht!', resolution: 'Made a fair trade and pocketed a surprise profit.', reward: 260, spawn: 'npc_scene' },
  { cat: 'bizarre_encounter', title: 'Fortune Teller Actually Right', headline: 'Mystic predicting exact car colors passing the corner', dialogue: 'Red coupe... white SUV... AND you are about to find $250.', resolution: 'Looked down and literally found $250 tucked under a newspaper.', reward: 250, spawn: 'cash_drop' },
  { cat: 'bizarre_encounter', title: 'Silent Disco Flash Mob', headline: 'Six people grooving intensely to complete dead silence', dialogue: '*synchronized snapping and dramatic air-guitar*', resolution: 'Joined the invisible groove — event organizer handed out promos.', reward: 190, spawn: 'performer_scene', time: 'night' },
  { cat: 'bizarre_encounter', title: 'Suitcase Full of Rubber Ducks', headline: 'Businessman’s briefcase popped open spilling 80 yellow ducks', dialogue: 'Don’t ask! Corporate retreat logistics—help me scoop them!', resolution: 'Gathered the duck armada for a crisp corporate reimbursement.', reward: 230, spawn: 'npc_scene' },
  { cat: 'bizarre_encounter', title: 'Pirate Captain Seeking Wi-Fi', headline: 'Tricorne-hatted sailor holding a laptop up to the sky', dialogue: 'Arrgh, not a single bar of five-G on this forsaken boulevard!', resolution: 'Shared the plaza café hotspot name — pirate tossed doubloons.', reward: 215, spawn: 'npc_scene' },
  { cat: 'bizarre_encounter', title: 'Competitive Chess Hustler', headline: 'Lightning-fast blitz match drawing a cheering sidewalk ring', dialogue: 'Two minutes on the clock, fifty bucks says you miss mate in three!', resolution: 'Spotted the knight fork and collected the blitz pot!', reward: 340, spawn: 'performer_scene' },
  { cat: 'bizarre_encounter', title: 'Man Arguing With Parking Bollard', headline: 'Stubborn pedestrian demanding a steel post apologize', dialogue: 'You stepped RIGHT in front of my shin—say sorry!', resolution: 'Convinced him the bollard apologized — he tipped for mediation.', reward: 120, spawn: 'npc_scene' },
  { cat: 'bizarre_encounter', title: 'UFO Skywatcher Telescope', headline: 'Rooftop-geared astronomer pointing a brass tube straight up', dialogue: 'Look at that green strobe—no commercial jet turns like that!', resolution: 'Spotted it was a delivery drone — he paid you for the sanity check.', reward: 195, spawn: 'npc_scene', time: 'night' },

  // 6. NEIGHBORHOOD DRAMA (16)
  { cat: 'neighborhood_drama', title: 'Ex-Couple Furniture Split', headline: 'Two exes dividing a vinyl collection on the sidewalk', dialogue: 'I bought that jazz record! You can keep the blender!', resolution: 'Brokered a clean 50/50 split — both paid a peacekeeper fee.', reward: 170, spawn: 'npc_scene' },
  { cat: 'neighborhood_drama', title: 'Rival Food Truck Slander', headline: 'Taco chef and empanada chef arguing over whose salsa is hotter', dialogue: 'Your mild sauce tastes like ketchup, Mateo!', resolution: 'Blind-taste-tested both and declared a diplomatic tie.', reward: 185, spawn: 'npc_scene' },
  { cat: 'neighborhood_drama', title: 'Landlord vs Tenant Megaphone', headline: 'Heated sidewalk negotiation over a broken elevator', dialogue: 'Six flights of stairs for three weeks, fix the cable!', resolution: 'Backed the tenants — grateful neighbors pitched in a thank-you.', reward: 195, spawn: 'npc_scene' },
  { cat: 'neighborhood_drama', title: 'Borrowed Jacket Betrayal', headline: 'Best friends spotting a "lost" vintage bomber jacket in public', dialogue: 'You told me the dry cleaner lost it! You’re WEARING IT!', resolution: 'Turned the ambush into laughs — earned coffee money.', reward: 130, spawn: 'npc_scene' },
  { cat: 'neighborhood_drama', title: 'HOA Hedge Ruler Dispute', headline: 'Suburban neighbor measuring a shrub with a laser level', dialogue: 'Two inches over bylaw 4B—unacceptable!', resolution: 'Negotiated a compromise trim with zero casualties.', reward: 160, spawn: 'npc_scene' },
  { cat: 'neighborhood_drama', title: 'Secret Recipe Espionage', headline: 'Baker accusing a rival of sniffing his vent fan for spices', dialogue: 'Get away from my exhaust vent, it’s cardamom—WAIT NO!', resolution: 'Kept the secret safe — baker rewarded your discretion.', reward: 205, spawn: 'npc_scene' },
  { cat: 'neighborhood_drama', title: 'Parking Spot Chair Wars', headline: 'Neighbors feuding over a plastic lawn chair saving a curb spot', dialogue: 'I shoveled zero snow—it’s 82 degrees, move the chair!', resolution: 'Settled the curb diplomacy smoothly.', reward: 145, spawn: 'npc_scene' },
  { cat: 'neighborhood_drama', title: 'Group Chat Leak Fallout', headline: 'Four coworkers realizing someone screenshotted the wrong thread', dialogue: 'Wait—WHO added the regional manager to this chat?!', resolution: 'Helped craft a legendary cover story — team chipped in.', reward: 220, spawn: 'npc_scene' },
  { cat: 'neighborhood_drama', title: 'Garage Band Noise Complaint', headline: 'Drummer insisting 3pm is "culturally appropriate volume"', dialogue: 'We’re practicing for the battle of the bands, Mrs. Cruz!', resolution: 'Suggested acoustic towels — everyone walked away happy.', reward: 165, spawn: 'performer_scene' },
  { cat: 'neighborhood_drama', title: 'Surprise Party Spoiled', headline: 'Friend holding a giant "HAPPY 30TH" balloon right as birthday girl walks up', dialogue: 'Hide the cake! HIDE THE CAKE—oh hey Maya...', resolution: 'Improvised a street flash-cheer that saved the surprise!', reward: 210, spawn: 'npc_scene' },
  { cat: 'neighborhood_drama', title: 'Barbershop Loyalty Crisis', headline: 'Regular caught walking out of a rival barber with a crisp fade', dialogue: 'Six years of loyalty and you go across the street?!', resolution: 'Smoothed over the fade feud with humor.', reward: 155, spawn: 'npc_scene' },
  { cat: 'neighborhood_drama', title: 'Porch Package Mixup', headline: 'Two neighbors accidentally swapping a kettlebell and a lamp', dialogue: 'Why did my floor lamp weigh forty-five pounds?!', resolution: 'Helped haul the heavy swap across the block.', reward: 175, spawn: 'npc_scene' },
  { cat: 'neighborhood_drama', title: 'Fantasy Football Trade War', headline: 'Three friends shouting trade valuations outside a diner', dialogue: 'A backup kicker for my star wideout?! Are you insane?!', resolution: 'Called the fair trade value — commissioner tipped you.', reward: 150, spawn: 'npc_scene' },
  { cat: 'neighborhood_drama', title: 'Wedding DJ Bailout', headline: 'Frantic bridesmaid learning the DJ went to the wrong venue', dialogue: 'Reception starts in twenty minutes and we have zero speakers!', resolution: 'Pointed her to a local audio rental shop — huge thank-you gift.', reward: 290, spawn: 'npc_scene' },
  { cat: 'neighborhood_drama', title: 'Stoop Sale Bidding Frenzy', headline: 'Two vintage collectors bidding aggressively over a 1994 boombox', dialogue: 'Eighty! Ninety! One-twenty cash right now!', resolution: 'Ran the auction cleanly and earned a seller’s commission.', reward: 230, spawn: 'npc_scene' },
  { cat: 'neighborhood_drama', title: 'Cat Custody Negotiation', headline: 'Roommates debating which building Mr. Whiskers loves more', dialogue: 'He literally sleeps on MY laptop every morning!', resolution: 'Proposed shared weekend visitation — both chipped in a tip.', reward: 140, spawn: 'npc_scene' },

  // 7. NIGHTLIFE INCIDENT (16)
  { cat: 'nightlife_incident', title: 'Velvet Rope Password Crisis', headline: 'VIP guest forgot the secret speakeasy knock', dialogue: 'Was it two knocks and a whistle or three knocks?!', resolution: 'Gave them the right beat — they handed you a crisp bill.', reward: 240, spawn: 'npc_scene', time: 'night' },
  { cat: 'nightlife_incident', title: 'DJ Dropped His USB Stick', headline: 'Headlining DJ panicking outside the club entrance', dialogue: 'My entire 2AM setlist is on a glowing purple flash drive!', resolution: 'Spotted the drive near the curb — DJ paid a massive finder fee!', reward: 450, spawn: 'npc_scene', time: 'night' },
  { cat: 'nightlife_incident', title: 'Neon Sign Short Circuit', headline: 'Club marquee flickering into hilarious accidental words', dialogue: 'Look up—the N and E went out so now it says "HOT BARS"!', resolution: 'Snapped a viral promo shot for the club owner.', reward: 185, spawn: 'npc_scene', time: 'night' },
  { cat: 'nightlife_incident', title: 'Midnight Taco Line VIP', headline: 'Thirty hungry clubgoers waiting on the city’s best al pastor', dialogue: 'Worth every second—smell that grilled pineapple!', resolution: 'Covered a stranger’s extra taco — turned out to be a record exec!', reward: 360, spawn: 'npc_scene', time: 'night' },
  { cat: 'nightlife_incident', title: 'Bouncer Lost His Guestlist', headline: 'Massive club bouncer chasing pages blowing down the boulevard', dialogue: 'Catch page four—that’s the whole VIP table list!', resolution: 'Gathered the list intact — bouncer slid you VIP cash.', reward: 290, spawn: 'npc_scene', time: 'night' },
  { cat: 'nightlife_incident', title: 'Rooftop Confetti Fallout', headline: 'Gold confetti raining down onto unsuspecting pedestrians', dialogue: 'Someone just popped champagne forty floors up!', resolution: 'Caught a VIP golden ticket mixed inside the confetti!', reward: 380, spawn: 'cash_drop', time: 'night' },
  { cat: 'nightlife_incident', title: 'Limousine Wrong Pickup', headline: 'Chauffeur waiting for "Big Tony" while three Tonys argue', dialogue: 'Which one of you booked the neon Hummer stretch?!', resolution: 'Checked the confirmation code and got the right crew aboard.', reward: 210, spawn: 'vehicle_scene', time: 'night' },
  { cat: 'nightlife_incident', title: 'After-Hours Jazz Jam', headline: 'Saxophonist and upright bassist improvising under a streetlamp', dialogue: 'Take it from the bridge, baby—city’s wide awake!', resolution: 'Hype-clapped the solo — crowd passed the hat and shared.', reward: 195, spawn: 'performer_scene', time: 'night' },
  { cat: 'nightlife_incident', title: 'Lost Designer Heel', headline: 'Partygoer hopping on one foot searching near the valet stand', dialogue: 'Those heels cost more than my car insurance!', resolution: 'Found the missing stiletto by a planter — grateful payout.', reward: 275, spawn: 'npc_scene', time: 'night' },
  { cat: 'nightlife_incident', title: 'Paparazzi Decoy Sprint', headline: 'Lookalike running down the block distracting five photographers', dialogue: 'Keep running—gives the real actor five minutes to slip out!', resolution: 'Pointed the cameras the opposite way — bodyguard tipped huge!', reward: 490, spawn: 'chase_scene', time: 'night' },
  { cat: 'nightlife_incident', title: 'Underground Dance Cypher', headline: 'Breakdancers battling under pulsing storefront neon', dialogue: 'OHHH! DID YOU SEE THAT WINDMILL?!', resolution: 'Judged the tiebreaker round — winner split the prize pot.', reward: 310, spawn: 'performer_scene', time: 'night' },
  { cat: 'nightlife_incident', title: 'Late-Night Diner Milkshake Bet', headline: 'Daredevil trying to drink two jumbo malts before brain-freeze', dialogue: 'My forehead hurts—don’t stop the timer!', resolution: 'Cheered them over the finish line and split the bet.', reward: 180, spawn: 'npc_scene', time: 'night' },
  { cat: 'nightlife_incident', title: 'Glow-Bike Peloton Rollout', headline: 'LED-covered cruiser bikes lighting up the midnight avenue', dialogue: 'Roll with us! Neon ride to Ocean Pier!', resolution: 'Cleared the crosswalk for the parade — ride captain tipped.', reward: 205, spawn: 'npc_scene', time: 'night' },
  { cat: 'nightlife_incident', title: 'Coat Check Ticket Swap', headline: 'Two strangers accidentally wearing each other’s luxury coats', dialogue: 'Wait—these aren’t my car keys, why is this coat XXL?!', resolution: 'Reunited the coats outside the club for a handsome tip.', reward: 265, spawn: 'npc_scene', time: 'night' },
  { cat: 'nightlife_incident', title: 'Comedy Club Heckler Retreat', headline: 'Overconfident heckler walking out humbled by a savage roast', dialogue: 'Okay fine, the comedian got me good—I’m buying everyone fries.', resolution: 'Laughed it off with him — he handed over extra cash.', reward: 160, spawn: 'npc_scene', time: 'night' },
  { cat: 'nightlife_incident', title: 'Midnight Street Photoshoot', headline: 'Fashion crew lighting up a chrome coupe with handheld strobes', dialogue: 'Hold that stance—need one more passing silhouette!', resolution: 'Walked the background mark cleanly — director paid day rate.', reward: 320, spawn: 'vehicle_scene', time: 'night' },

  // 8. COASTAL SHENANIGANS (16)
  { cat: 'coastal_shenanigans', title: 'Runaway Beach Umbrella', headline: 'Giant striped parasol cartwheeling across the boardwalk', dialogue: 'DUCK! It’s got tailwind!', resolution: 'Tackled the airborne umbrella before it cracked a window.', reward: 155, spawn: 'npc_scene', time: 'day' },
  { cat: 'coastal_shenanigans', title: 'Seagull Fry Heist', headline: 'Audacious gull dive-bombing a boardwalk seafood basket', dialogue: 'MY CALAMARI! THAT BIRD JUST STOLE AN ENTIRE SHRIMP!', resolution: 'Shooed the gull brigade — vendor gave you a fresh bonus.', reward: 135, spawn: 'npc_scene', time: 'day' },
  { cat: 'coastal_shenanigans', title: 'Metal Detector Jackpot', headline: 'Beachcomber frantically digging as his wand screams high-pitch', dialogue: 'Wait—that’s not a bottle cap! Help me sift this!', resolution: 'Uncovered a vintage gold medallion — split the appraisal!', reward: 640, spawn: 'cash_drop', time: 'day' },
  { cat: 'coastal_shenanigans', title: 'Rollerblade Boombox Legend', headline: 'Retro skater weaving smoothly between palm trees', dialogue: 'Keep the rhythm rolling, Ocean Beach!', resolution: 'Caught his flying sunglasses mid-spin — earned an impressed tip.', reward: 170, spawn: 'performer_scene', time: 'day' },
  { cat: 'coastal_shenanigans', title: 'Sandcastle Engineering Crisis', headline: 'Master sculptor protecting a 6-foot castle from a rogue wave', dialogue: 'Build the outer moat! Reinforce the east turret!', resolution: 'Helped pack the levee — contest prize shared with you.', reward: 245, spawn: 'npc_scene', time: 'day' },
  { cat: 'coastal_shenanigans', title: 'Sunscreen Blindness', headline: 'Tourist accidentally sprayed SPF 50 straight into his shades', dialogue: 'Everything is coconut-scented fog!', resolution: 'Guided him to the beach rinse station — generous tip.', reward: 140, spawn: 'npc_scene', time: 'day' },
  { cat: 'coastal_shenanigans', title: 'Surfboard Wax Trade', headline: 'Surfer desperate for cold-water wax before a swell hits', dialogue: 'Set of the decade is rolling in and my deck is slick as glass!', resolution: 'Pointed him to the surf shack — he tossed you spare cash.', reward: 165, spawn: 'npc_scene', time: 'day' },
  { cat: 'coastal_shenanigans', title: 'Yacht Crew Provision Dash', headline: 'Deckhand sprinting with three ice chests before departure', dialogue: 'Captain leaves the slip in two minutes—grab a handle!', resolution: 'Helped haul the coolers to the pier — billionaire yacht tip!', reward: 520, spawn: 'npc_scene' },
  { cat: 'coastal_shenanigans', title: 'Boardwalk Caricature Roast', headline: 'Artist drew a tourist’s chin hilariously oversized', dialogue: 'Why do I look like a cartoon superhero?! Okay it’s kinda fire.', resolution: 'Hyped up the portrait — artist paid a commission.', reward: 150, spawn: 'performer_scene', time: 'day' },
  { cat: 'coastal_shenanigans', title: 'Volleyball Match Point Sub', headline: 'Beach squad one player short on a $300 sand match', dialogue: 'Our setter pulled a calf—step in for ONE serve!', resolution: 'Aced the match-point serve and collected your winner’s cut!', reward: 300, spawn: 'npc_scene', time: 'day' },
  { cat: 'coastal_shenanigans', title: 'Driftwood Treasure Bottle', headline: 'Corked green bottle washed up near the seawall steps', dialogue: 'There’s actually a folded map and folded cash inside!', resolution: 'Uncorked the bottle — turns out it was a local scavenger prize!', reward: 410, spawn: 'cash_drop' },
  { cat: 'coastal_shenanigans', title: 'Jet-Ski Trailer Misadventure', headline: 'Driver trying to reverse a jet-ski trailer for the first time', dialogue: 'Why does it turn LEFT when I steer RIGHT?!', resolution: 'Coached the trailer backing cleanly — driver tipped gladly.', reward: 215, spawn: 'vehicle_scene', time: 'day' },
  { cat: 'coastal_shenanigans', title: 'Coconut Cart Jam', headline: 'Fresh coconut stand swamped by forty thirsty tourists', dialogue: 'Need someone to hand out straws—I’m drowning in orders!', resolution: 'Helped clear the rush — vendor split the hour’s take.', reward: 230, spawn: 'npc_scene', time: 'day' },
  { cat: 'coastal_shenanigans', title: 'Sunset Proposal Photographer', headline: 'Nervous boyfriend hiding a ring box behind his back', dialogue: 'Act casual—when I kneel, hold traffic for five seconds!', resolution: 'She said YES! Couple insisted on tipping their wingman.', reward: 350, spawn: 'npc_scene' },
  { cat: 'coastal_shenanigans', title: 'Pelican Standoff on Pier', headline: 'Giant pelican refusing to let a fisherman pass with his bucket', dialogue: 'We had a deal, Greg—one mackerel, not the whole cooler!', resolution: 'Distracted Greg the Pelican — fisherman paid a thank-you.', reward: 160, spawn: 'npc_scene', time: 'day' },
  { cat: 'coastal_shenanigans', title: 'Flamingo Floatie Stampede', headline: 'Wind blew six giant pink pool floats onto Ocean Drive', dialogue: 'Catch the giant unicorn one, that’s the hotel’s favorite!', resolution: 'Corralled the vinyl flock for a resort cash reward.', reward: 200, spawn: 'npc_scene', time: 'day' },

  // 9. TECH MISHAP (16)
  { cat: 'tech_mishap', title: 'Confused Delivery Robot', headline: 'Six-wheeled sidewalk bot spinning endlessly in a chalk circle', dialogue: '*sad beeping* Obstacle detected... recalculating...', resolution: 'Nudged it past the curb lip — tech startup auto-wired a bounty.', reward: 210, spawn: 'npc_scene' },
  { cat: 'tech_mishap', title: 'Runaway Camera Drone', headline: 'Filmmaker jogging beneath a low-battery hovering drone', dialogue: 'THREE PERCENT BATTERY! Catch it if it drops!', resolution: 'Snagged the landing skids clean — filmmaker paid a lifesaver bonus!', reward: 380, spawn: 'npc_scene' },
  { cat: 'tech_mishap', title: 'VR Headset Sidewalk Walk', headline: 'Tech tester wearing mixed-reality goggles dodging imaginary lasers', dialogue: 'Whoa—graphics are SO crisp! Wait why did that mailbox move?!', resolution: 'Steered him clear of a signpost — startup paid a testing fee.', reward: 225, spawn: 'npc_scene' },
  { cat: 'tech_mishap', title: 'Smart Car Parallel Loop', headline: 'Auto-park sedan doing its seventh tiny correction maneuver', dialogue: 'Trust the sensors... okay maybe DON’T trust the sensors.', resolution: 'Guided the driver to take manual control — relieved tip!', reward: 185, spawn: 'vehicle_scene' },
  { cat: 'tech_mishap', title: 'Digital Billboard Glitched', headline: 'Giant LED sign accidentally displaying someone’s grocery list', dialogue: 'Wait why does downtown say "BUY BANANAS & CAT LITTER"?!', resolution: 'Alerted the building technician — got a quick reward.', reward: 240, spawn: 'npc_scene' },
  { cat: 'tech_mishap', title: 'E-Bike Turbo Malfunction', headline: 'Commuter stuck in maximum assist mode zooming around a plaza', dialogue: 'IT ONLY HAS ONE SPEED AND IT’S LUDICROUS!', resolution: 'Helped flip the battery kill-switch — grateful rider tipped.', reward: 210, spawn: 'npc_scene' },
  { cat: 'tech_mishap', title: 'Podcast Mic Drop', headline: 'Street interviewer’s wireless receiver fell into a bush', dialogue: 'We just interviewed a celebrity and the audio is gone?!', resolution: 'Found the blinking clip-on mic — host paid a studio bounty.', reward: 295, spawn: 'npc_scene' },
  { cat: 'tech_mishap', title: 'Smart Lockout Panic', headline: 'App-only loft door crashed right as resident stepped out in slippers', dialogue: 'My front door needs a firmware update?! I’m in pajamas!', resolution: 'Lent a hotspot connection so the door rebooted — big tip!', reward: 230, spawn: 'npc_scene' },
  { cat: 'tech_mishap', title: 'Bluetooth Speaker Hijack', headline: 'Street café patio accidentally blasting someone’s workout playlist', dialogue: 'Why is the jazz bistro playing 180-BPM techno?!', resolution: 'Found the rogue phone paired across the street — café thanked you.', reward: 175, spawn: 'npc_scene' },
  { cat: 'tech_mishap', title: 'QR Menu Meltdown', headline: 'Diner customers staring blankly at a broken link sticker', dialogue: 'I just want to know how much the pancakes cost!', resolution: 'Read out the paper window menu — manager tipped you.', reward: 140, spawn: 'npc_scene' },
  { cat: 'tech_mishap', title: 'AI-Hype Pitch Gone Wrong', headline: 'Founder’s smart suitcase drove itself briskly down the block', dialogue: 'Follow-me mode inverted! It’s running AWAY from me!', resolution: 'Cornered the rebellious carry-on — founder paid in cash.', reward: 270, spawn: 'chase_scene' },
  { cat: 'tech_mishap', title: 'Neon Charging Kiosk Jackpot', headline: 'Glitched street rebate kiosk spitting out promo vouchers', dialogue: 'Hey—it says loyalty bonus approved!', resolution: 'Redeemed the legit promo voucher before reboot.', reward: 310, spawn: 'cash_drop' },
  { cat: 'tech_mishap', title: 'Livestream Gimbal Fail', headline: 'Travel vlogger filming his own shoes for twenty minutes', dialogue: 'Wait—the camera was flipped the ENTIRE tour?!', resolution: 'Reset his gimbal lock — vlogger shouted you out with cash.', reward: 190, spawn: 'npc_scene' },
  { cat: 'tech_mishap', title: 'Parking Gate Bar Tango', headline: 'Garage barrier arm bouncing up and down rhythmically', dialogue: 'Go! No stop! Go! Wait—it’s mocking me!', resolution: 'Reset the sensor reflector — garage attendant rewarded you.', reward: 205, spawn: 'vehicle_scene' },
  { cat: 'tech_mishap', title: 'Solar Bench Overheat', headline: 'USB-charging park bench playing loud diagnostic chimes', dialogue: 'Why is the bench speaking Morse code?!', resolution: 'Tapped the maintenance reset — city tech credited a reward.', reward: 165, spawn: 'npc_scene' },
  { cat: 'tech_mishap', title: 'Hologram Ad Reflection', headline: 'Laser projector bouncing onto a passing delivery van', dialogue: 'That truck looks like it’s selling luxury perfume!', resolution: 'Aligned the sidewalk tripod — ad agency paid a quick fee.', reward: 255, spawn: 'npc_scene', time: 'night' },

  // 10. DELIVERY FIASCO (16)
  { cat: 'delivery_fiasco', title: 'Five-Tier Wedding Cake Sprint', headline: 'Pastry van stopped flat-tired two blocks from the hotel', dialogue: 'If this buttercream leans two degrees we are doomed!', resolution: 'Helped steady the cake crate to the lobby — massive baker tip!', reward: 430, spawn: 'vehicle_scene' },
  { cat: 'delivery_fiasco', title: 'Wrong-Address Sushi Feast', headline: 'Courier holding $200 of omakase at an empty warehouse', dialogue: 'Customer put North instead of South—they said keep or share!', resolution: 'Helped redirect it to the right tower — earned a hefty tip.', reward: 245, spawn: 'npc_scene' },
  { cat: 'delivery_fiasco', title: 'Flower Van Rose Spill', headline: 'Hundreds of red roses tumbled across the crosswalk', dialogue: 'Valentine’s rehearsal is in ten minutes—grab the stems!', resolution: 'Gathered the bouquets intact — florist paid generously.', reward: 220, spawn: 'vehicle_scene' },
  { cat: 'delivery_fiasco', title: 'Ice Sculpture Melt Race', headline: 'Carved swan melting rapidly on a hand truck in midday heat', dialogue: 'Move! Move! It’s turning into a puddle duck!', resolution: 'Cleared the sidewalk route to the banquet freezer.', reward: 280, spawn: 'npc_scene', time: 'day' },
  { cat: 'delivery_fiasco', title: 'Balloon Bouquet Liftoff', headline: 'Party courier barely clinging to 60 helium balloons', dialogue: 'My feet are literally leaving the concrete—anchor me!', resolution: 'Helped tie the ribbon bundle to the van bumper.', reward: 175, spawn: 'npc_scene' },
  { cat: 'delivery_fiasco', title: 'Guitar Amp Stair Struggle', headline: 'Roadie trying to solo-haul a vintage tube stack', dialogue: 'This amp weighs as much as a compact car!', resolution: 'Grabbed the other handle — band put you on the cash list.', reward: 235, spawn: 'npc_scene' },
  { cat: 'delivery_fiasco', title: 'Giant Pizza Box Doorway', headline: 'Courier carrying a 36-inch novelty pie sideways', dialogue: 'Don’t tilt it! The cheese will slide into one mega-lump!', resolution: 'Held the double doors wide — restaurant owner tipped big.', reward: 165, spawn: 'npc_scene' },
  { cat: 'delivery_fiasco', title: 'Mystery Express Parcel', headline: 'Bike messenger dropped a padded tube while dodging a cab', dialogue: 'Blueprint tube! Architects need that before noon!', resolution: 'Chased down the messenger and returned the blueprints.', reward: 340, spawn: 'npc_scene', time: 'day' },
  { cat: 'delivery_fiasco', title: 'Cold-Brew Keg Rollaway', headline: 'Stainless coffee keg rolling briskly down the avenue', dialogue: 'That’s forty gallons of triple-shot nitro—STOP IT!', resolution: 'Wedged a curb block cleanly — café rewarded your reflexes.', reward: 260, spawn: 'npc_scene' },
  { cat: 'delivery_fiasco', title: 'Live Lobster Crate Escape', headline: 'Seafood truck door left cracked — one feisty crustacean walking free', dialogue: 'Hey! Claw-dius is making a break for the ocean!', resolution: 'Safely boxed the runaway lobster — chef paid a bounty.', reward: 290, spawn: 'vehicle_scene' },
  { cat: 'delivery_fiasco', title: 'Suit Garment Bag Wind Gust', headline: 'Tailor’s silk tuxedos billowing like sails down the block', dialogue: 'That’s the mayor’s gala suit! Grab the hanger!', resolution: 'Snagged the garment bag dust-free — tailor paid top dollar.', reward: 360, spawn: 'npc_scene' },
  { cat: 'delivery_fiasco', title: 'Overloaded Bike Basket', headline: 'Bagel courier balancing four stacked crates at a traffic light', dialogue: 'One pothole and it’s raining sesame seeds!', resolution: 'Helped strap the top crate secure — courier paid a thank-you.', reward: 150, spawn: 'npc_scene', time: 'day' },
  { cat: 'delivery_fiasco', title: 'Neon Sign Glass Delivery', headline: 'Signmaker carefully carrying a fragile glowing flamingo tube', dialogue: 'Easy... easy... somebody tell that skateboarder to slow down!', resolution: 'Ran blocker down the sidewalk — signmaker tipped well.', reward: 270, spawn: 'npc_scene' },
  { cat: 'delivery_fiasco', title: 'Pet Bakery Cupcake Drop', headline: 'Organic dog-treat van double-booked two park parties', dialogue: 'Wait—which golden retriever is Barnaby and which is Duke?!', resolution: 'Sorted the delivery slips — earned a sweet tip.', reward: 185, spawn: 'vehicle_scene' },
  { cat: 'delivery_fiasco', title: 'Dry Ice Fog Spill', headline: 'Catering van leaking theatrical white fog across the whole block', dialogue: 'Looks like a rock concert, I can’t see my own bumper!', resolution: 'Ventilated the latch safely — caterer paid for the assist.', reward: 225, spawn: 'vehicle_scene' },
  { cat: 'delivery_fiasco', title: 'Express Passport Courier', headline: 'Runner out of breath with an urgent airport envelope', dialogue: 'My scooter died—can you flag that cab at the corner?!', resolution: 'Haileda cab instantly — grateful traveler tipped hugely.', reward: 310, spawn: 'npc_scene' },

  // 11. ART AND MUSIC (16)
  { cat: 'art_and_music', title: 'Bucket Drummer Virtuoso', headline: 'Street percussionist playing polyrhythms on five paint buckets', dialogue: 'Give me a tempo San Nova—let’s take it up!', resolution: 'Dropped into the groove — crowd went wild and shared tips.', reward: 195, spawn: 'performer_scene' },
  { cat: 'art_and_music', title: 'Speed Spray-Paint Galaxy', headline: 'Wynwood artist creating a cosmic skyline in ninety seconds', dialogue: 'Watch the lid trick—instant ringed planet!', resolution: 'Bought the fresh canvas and flipped it to a gallery scout!', reward: 370, spawn: 'performer_scene' },
  { cat: 'art_and_music', title: 'Indie Music Video Extras', headline: 'Director shouting through a bullhorn on a neon corner', dialogue: 'We need someone looking effortlessly cool walking past camera two!', resolution: 'Nailed the walk-by in one take — production paid cash!', reward: 330, spawn: 'performer_scene' },
  { cat: 'art_and_music', title: 'Sidewalk Violin Virtuoso', headline: 'Electric violinist shredding a classical-hip-hop remix', dialogue: 'Vivaldi meets Vice City—turn up the amp!', resolution: 'Helped swap a fresh amp battery — musician split the hat.', reward: 240, spawn: 'performer_scene' },
  { cat: 'art_and_music', title: 'Chalk 3D Abyss Illusion', headline: 'Pedestrians leaping dramatically over a hyper-real chalk canyon', dialogue: 'Stand right on the X for the optical illusion!', resolution: 'Snapped a pro angle for tourists — artist shared the tips.', reward: 185, spawn: 'performer_scene', time: 'day' },
  { cat: 'art_and_music', title: 'Brass Band Flash Funeral-Jazz', headline: 'Five-piece horn section turning a dull Tuesday into Mardi Gras', dialogue: 'Second line starts right here, move your feet!', resolution: 'Kept the vibe rolling — band leader tossed a bonus.', reward: 215, spawn: 'performer_scene' },
  { cat: 'art_and_music', title: 'Modern Art Banana Debate', headline: 'Gallery patrons solemnly analyzing an accidentally dropped umbrella', dialogue: 'Notice the bold commentary on urban precipitation...', resolution: 'Kept a straight face and sold the "concept" for a tip.', reward: 290, spawn: 'npc_scene' },
  { cat: 'art_and_music', title: 'Freestyle Rap Cypher', headline: 'Corner MC rhyming off every passerby’s outfit in real time', dialogue: 'Look at the jacket, moving with traffic, San Nova classic!', resolution: 'Dropped a clean beatbox — crowd tossed cash into the ring.', reward: 255, spawn: 'performer_scene' },
  { cat: 'art_and_music', title: 'Living Bronze Statue Blink', headline: 'Metallic street statue trying desperately not to sneeze', dialogue: '...*holding breath*... ah—CHOO! Don’t tell the tourists!', resolution: 'Covered for the statue — earned a hush-money tip.', reward: 165, spawn: 'performer_scene', time: 'day' },
  { cat: 'art_and_music', title: 'Vinyl Crate Digging Find', headline: 'Sidewalk record seller unloading an unsearched estate box', dialogue: 'Five bucks a sleeve—whatever you pull is yours!', resolution: 'Pulled a rare 1978 funk promo pressing worth big cash!', reward: 460, spawn: 'cash_drop' },
  { cat: 'art_and_music', title: 'Acrobatic Parkour Showcase', headline: 'Freerunners vaulting planters cleanly to crowd applause', dialogue: 'Clear the landing pad—double cork incoming!', resolution: 'Spotted the landing zone — crew handed you a sponsor bill.', reward: 225, spawn: 'performer_scene' },
  { cat: 'art_and_music', title: 'Salsa Plaza Open Floor', headline: 'Portable speaker turning an intersection plaza into a dance hall', dialogue: 'Step in! Doesn’t matter if you know the turns!', resolution: 'Spun a smooth partner turn — crowd cheered and tipped.', reward: 205, spawn: 'performer_scene' },
  { cat: 'art_and_music', title: 'Neon Origami Sculptor', headline: 'Artist folding crisp luminous paper cranes on a folding table', dialogue: 'Each crane brings city luck—pick a color!', resolution: 'Helped anchor the display against a gust — got a cash gift.', reward: 160, spawn: 'performer_scene' },
  { cat: 'art_and_music', title: 'Pop-Up Fashion Runway', headline: 'Design students turning a zebra crosswalk into a catwalk at red lights', dialogue: 'Twenty seconds on the walk signal—STRUT!', resolution: 'Timed the crosswalk signal like a pro — designer paid you.', reward: 275, spawn: 'performer_scene' },
  { cat: 'art_and_music', title: 'Vintage Polaroid Hustler', headline: 'Street photographer running low on instant film packs', dialogue: 'Last shot of the roll—make it iconic!', resolution: 'Posed next to a palm sunset — print sold to a boutique!', reward: 250, spawn: 'npc_scene' },
  { cat: 'art_and_music', title: 'Acoustic Rooftop Serenade', headline: 'Guitarist singing from a balcony while neighbors clap along', dialogue: 'Play the classic one more time, Rafael!', resolution: 'Tossed up a chord request — neighbors cheered and tipped.', reward: 175, spawn: 'performer_scene', time: 'night' },

  // 12. SUBURBAN MAYHEM (16)
  { cat: 'suburban_mayhem', title: 'Runaway Riding Lawn Mower', headline: 'Self-propelled mower cruising leisurely down a cul-de-sac', dialogue: 'I hopped off to grab lemonade and it put itself in drive!', resolution: 'Hopped on and killed the ignition — homeowner rewarded you!', reward: 265, spawn: 'vehicle_scene', time: 'day' },
  { cat: 'suburban_mayhem', title: 'Sprinkler Ambush', headline: 'Malfunctioning lawn sprinklers firing sideways across the sidewalk', dialogue: 'Every ten seconds it snipes the mail carrier!', resolution: 'Turned the curb manifold dial — mail carrier thanked you.', reward: 170, spawn: 'npc_scene', time: 'day' },
  { cat: 'suburban_mayhem', title: 'BBQ Smoke Signal', headline: 'Backyard grillmaster sending a towering hickory cloud over the block', dialogue: 'It’s NOT burned, it’s low-and-slow bark! Taste a rib!', resolution: 'Declared the brisket elite — won the cookout raffle pot!', reward: 230, spawn: 'npc_scene' },
  { cat: 'suburban_mayhem', title: 'Garage Sale Hidden Gem', headline: 'Driveway table packed with dusty 90s electronics', dialogue: 'Everything on the blue tarp is ten bucks—make an offer!', resolution: 'Found a boxed mint retro console worth serious cash!', reward: 540, spawn: 'cash_drop', time: 'day' },
  { cat: 'suburban_mayhem', title: 'Runaway Trampoline Wind Gust', headline: 'Backyard trampoline rolling upright like a giant wheel', dialogue: 'NOT THE GREENHOUSE! Grab the springs!', resolution: 'Anchored the bouncing giant — relieved dad paid cash.', reward: 250, spawn: 'npc_scene' },
  { cat: 'suburban_mayhem', title: 'Lemonade Stand Monopoly', headline: 'Two rival kid entrepreneurs slashing prices to 25 cents', dialogue: 'Ours has fresh mint AND crushed ice—don’t trust across the street!', resolution: 'Bought from both stands — proud parents tipped your kindness.', reward: 145, spawn: 'npc_scene', time: 'day' },
  { cat: 'suburban_mayhem', title: 'Gas Station Pump Mixup', headline: 'Driver trying to stretch a gas hose around the wrong side of his SUV', dialogue: 'Why didn’t I just pull in the other way?!', resolution: 'Helped guide a clean U-turn — grateful driver tipped.', reward: 155, spawn: 'vehicle_scene' },
  { cat: 'suburban_mayhem', title: 'Suburban Raccoon Heist', headline: 'Trash bandit dragging an entire untouched pizza box up a driveway', dialogue: 'HEY! I haven’t even eaten a slice yet, drop it!', resolution: 'Rescued the pizza box — homeowner paid you generously.', reward: 185, spawn: 'npc_scene', time: 'night' },
  { cat: 'suburban_mayhem', title: 'Mailbox Baseball Detour', headline: 'Rowdy teens stopped dead when they see the neighborhood watch', dialogue: 'Uh—we were just checking if the flag works!', resolution: 'Kept the street peaceful — block captain paid a thank-you.', reward: 215, spawn: 'npc_scene', time: 'night' },
  { cat: 'suburban_mayhem', title: 'Pool Skimmer Rescue', headline: 'Homeowner fishing his car key fob out of the deep end', dialogue: 'It’s waterproof for thirty seconds—I’m on second twenty-eight!', resolution: 'Snagged the keys with the pole — huge relief reward!', reward: 240, spawn: 'npc_scene', time: 'day' },
  { cat: 'suburban_mayhem', title: 'Overzealous Leaf Blower Duel', headline: 'Two neighbors blowing the exact same pile of leaves back and forth', dialogue: 'Those came from YOUR oak tree, Gary!', resolution: 'Bagged the contested pile in ten seconds — both paid up.', reward: 180, spawn: 'npc_scene', time: 'day' },
  { cat: 'suburban_mayhem', title: 'Ice Cream Truck Sprint', headline: 'Full-grown adults jogging urgently behind the jingle melody', dialogue: 'WAIT! STOP THE TRUCK! I NEED A CHOCO-TACO!', resolution: 'Flagged down the driver — ecstatic neighbors tipped you.', reward: 165, spawn: 'vehicle_scene', time: 'day' },
  { cat: 'suburban_mayhem', title: 'DIY Paint Job Mistake', headline: 'Homeowner realizing he painted his fence neon flamingo pink', dialogue: 'The swatch said "Subtle Coral"! Why is it glowing?!', resolution: 'Convinced him it’s iconic San Nova Deco — he paid for the hype.', reward: 190, spawn: 'npc_scene', time: 'day' },
  { cat: 'suburban_mayhem', title: 'Car Wash Soap Flood', headline: 'Driveway foam cannon buried an entire sedan in bubbles', dialogue: 'I think I used the industrial concentrate instead of diluted...', resolution: 'Helped rinse the driveway clear — earned wash money.', reward: 175, spawn: 'vehicle_scene', time: 'day' },
  { cat: 'suburban_mayhem', title: 'Lost Parrot Imitating Sirens', headline: 'Escaped macaw perched on a fence making realistic cop noises', dialogue: '*WEE-WOO* Pull over! *squawk* Pretty bird!', resolution: 'Lured the prankster parrot down with peanuts — big reward!', reward: 360, spawn: 'npc_scene', time: 'day' },
  { cat: 'suburban_mayhem', title: 'Block Party DJ Power Trip', headline: 'Extension cord popped right during the electric slide', dialogue: 'Who plugged the bounce house into the subwoofer strip?!', resolution: 'Flipped the garage breaker — block party roared and tipped!', reward: 225, spawn: 'performer_scene' },
];

export const RANDOM_EVENTS: RandomEventDef[] = RAW_EVENTS.map((r, idx) => ({
  id: `evt_${String(idx + 1).padStart(3, '0')}_${r.cat}`,
  category: r.cat,
  title: r.title,
  headline: r.headline,
  dialogue: r.dialogue,
  resolutionText: r.resolution,
  rewardCash: r.reward,
  spawnKind: r.spawn,
  timeWindow: r.time || 'any',
}));

export interface ActiveWorldEvent {
  def: RandomEventDef;
  x: number;
  z: number;
  timeRemaining: number;
  resolved: boolean;
  interacted: boolean;
}

export interface RandomEventManager {
  active: ActiveWorldEvent | null;
  cooldown: number;
  seenIds: Set<string>;
  completedCount: number;
  seed: number;
}

export function createRandomEventManager(seed = 88421): RandomEventManager {
  return {
    active: null,
    cooldown: 14,
    seenIds: new Set(),
    completedCount: 0,
    seed: seed >>> 0,
  };
}

function nextRand(mgr: RandomEventManager): number {
  mgr.seed = (mgr.seed * 1664525 + 1013904223) >>> 0;
  return (mgr.seed & 0xffffff) / 0x1000000;
}

export function pickNextRandomEvent(mgr: RandomEventManager, hourOfDay: number): RandomEventDef {
  const isNight = hourOfDay < 6 || hourOfDay >= 19;
  const eligible = RANDOM_EVENTS.filter((e) => {
    if (e.timeWindow === 'day' && isNight) return false;
    if (e.timeWindow === 'night' && !isNight) return false;
    return !mgr.seenIds.has(e.id);
  });
  const pool = eligible.length > 0 ? eligible : RANDOM_EVENTS;
  if (eligible.length === 0) mgr.seenIds.clear();
  const chosen = pool[Math.floor(nextRand(mgr) * pool.length)];
  mgr.seenIds.add(chosen.id);
  return chosen;
}

export function spawnRandomEventNear(
  mgr: RandomEventManager,
  playerX: number,
  playerZ: number,
  hourOfDay: number
): ActiveWorldEvent {
  const def = pickNextRandomEvent(mgr, hourOfDay);
  const angle = nextRand(mgr) * Math.PI * 2;
  const dist = 34 + nextRand(mgr) * 44;
  const ev: ActiveWorldEvent = {
    def,
    x: playerX + Math.cos(angle) * dist,
    z: playerZ + Math.sin(angle) * dist,
    timeRemaining: 75,
    resolved: false,
    interacted: false,
  };
  mgr.active = ev;
  return ev;
}

export function resolveActiveRandomEvent(mgr: RandomEventManager): {
  resolved: boolean;
  rewardCash: number;
  title: string;
  resolutionText: string;
} | null {
  const ev = mgr.active;
  if (!ev || ev.resolved) return null;
  ev.resolved = true;
  ev.interacted = true;
  mgr.completedCount += 1;
  const result = {
    resolved: true,
    rewardCash: ev.def.rewardCash,
    title: ev.def.title,
    resolutionText: ev.def.resolutionText,
  };
  mgr.active = null;
  mgr.cooldown = 28 + nextRand(mgr) * 24;
  return result;
}
