/**
 * GTA 5-Style Smartphone Engine (Messages, Calls, SnapNova Social Feed, Banking)
 * 100% deterministic/contextual non-AI logic — zero external LLM APIs.
 */

export type PhoneAppId = 'home' | 'messages' | 'contacts' | 'camera' | 'snapnova' | 'bank' | 'missions' | 'quests' | 'settings';

export type CallActionType =
  | 'mechanic_deliver_car'
  | 'fixer_clear_wanted'
  | 'dispatch_911'
  | 'crew_backup'
  | 'friend_hangout';

export interface PhoneContact {
  id: string;
  name: string;
  role: string;
  avatarColor: string;
  initials: string;
  phoneNumber: string;
  callAction: CallActionType;
  callGreeting: string;
  quickTexts: string[];
}

export interface SmsMessage {
  id: number;
  sender: 'player' | 'contact';
  text: string;
  timestamp: string;
}

export interface SnapNovaComment {
  author: string;
  text: string;
}

export interface SnapNovaPost {
  id: number;
  author: string;
  handle: string;
  location: string;
  caption: string;
  filter: 'none' | 'vice' | 'noir' | 'golden' | 'chrome';
  imageDataUrl: string | null;
  accentGradient: string;
  likes: number;
  likedByPlayer: boolean;
  comments: SnapNovaComment[];
  timestamp: string;
}

export interface ActivePhoneCall {
  contactId: string;
  contactName: string;
  status: 'dialing' | 'connected' | 'ended';
  elapsedSec: number;
  transcript: string;
  actionDispatched: boolean;
  action: CallActionType;
}

export interface PhoneState {
  open: boolean;
  activeApp: PhoneAppId;
  contacts: PhoneContact[];
  threads: Record<string, SmsMessage[]>;
  unreadByContact: Record<string, number>;
  posts: SnapNovaPost[];
  activeCall: ActivePhoneCall | null;
  nextMsgId: number;
  nextPostId: number;
  selectedContactId: string;
}

export const DEFAULT_CONTACTS: PhoneContact[] = [
  {
    id: 'mechanic',
    name: 'Tito Customs',
    role: 'Exotic Mechanic',
    avatarColor: '#f59e0b',
    initials: 'TC',
    phoneNumber: '555-0192',
    callAction: 'mechanic_deliver_car',
    callGreeting: "Yo boss! Dropping a freshly tuned supercar right around your block—give me two seconds!",
    quickTexts: ['Deliver my ride', 'Need a fast car ASAP', 'Where is the best spot to drift?'],
  },
  {
    id: 'fixer',
    name: 'Vesper',
    role: 'Underworld Fixer',
    avatarColor: '#8b5cf6',
    initials: 'VS',
    phoneNumber: '555-0148',
    callAction: 'fixer_clear_wanted',
    callGreeting: "Already scrambling police dispatch frequencies. Keep your head down—heat is dropping now.",
    quickTexts: ['Clear my wanted level', 'Any bank vaults soft tonight?', 'Who runs Downtown?'],
  },
  {
    id: 'maya',
    name: 'Maya Vega',
    role: 'Crew & Street Racer',
    avatarColor: '#ec4899',
    initials: 'MV',
    phoneNumber: '555-0174',
    callAction: 'crew_backup',
    callGreeting: "Say less! Pulling up to your neighborhood—let's see what San Nova's got tonight.",
    quickTexts: ['Meet me downtown', 'Did you see my SnapNova post?', 'Bank heist ready?'],
  },
  {
    id: 'emergency',
    name: '911 Emergency',
    role: 'SNPD & EMS Dispatch',
    avatarColor: '#ef4444',
    initials: '911',
    phoneNumber: '911',
    callAction: 'dispatch_911',
    callGreeting: "San Nova 911 Dispatch—we have your GPS coordinates. Patrol unit & paramedics en route.",
    quickTexts: ['Request police backup', 'Need paramedics on my block'],
  },
  {
    id: 'marco',
    name: 'Marco Diaz',
    role: 'Ocean Beach Promoter',
    avatarColor: '#06b6d4',
    initials: 'MD',
    phoneNumber: '555-0133',
    callAction: 'friend_hangout',
    callGreeting: "Ayoo! Ocean Beach boardwalk is popping off right now, swing by and post a sunset snap!",
    quickTexts: ['What’s happening tonight?', 'Any wild events around town?'],
  },
];

const NPC_COMMENT_POOL: SnapNovaComment[] = [
  { author: '@ocean_breeze', text: 'San Nova lighting hitting different today!!' },
  { author: '@tito_customs', text: 'Clean shot! Swing by the garage later.' },
  { author: '@wynwood_ink', text: 'Wait I literally just walked past there lol' },
  { author: '@maya_drift', text: 'Save me a spot, pulling up in 5!!' },
  { author: '@nova_daily', text: 'Featured on San Nova Trending!' },
  { author: '@dj_cortado', text: 'Unreal vibe, drop the location tag!' },
  { author: '@sunset_runner', text: 'This city never sleeps fr' },
];

export function createPhoneState(): PhoneState {
  const threads: Record<string, SmsMessage[]> = {
    mechanic: [
      { id: 1, sender: 'contact', text: "Fresh turbo tuned up. Call me anytime if you need a ride delivered to your street.", timestamp: '09:14' },
    ],
    fixer: [
      { id: 2, sender: 'contact', text: "Word on the wire: NovaBank Downtown just stocked the vault. Call me if the cops get too close.", timestamp: '10:02' },
    ],
    maya: [
      { id: 3, sender: 'contact', text: "Just posted from Ocean Beach! Snap a pic and put it on SnapNova.", timestamp: '11:20' },
    ],
    emergency: [
      { id: 4, sender: 'contact', text: "San Nova 911 Text-to-Dispatch ready. Call for immediate unit response.", timestamp: '08:00' },
    ],
    marco: [
      { id: 5, sender: 'contact', text: "Wild stuff happening all over the city today—keep an eye on your radar!", timestamp: '11:45' },
    ],
  };

  const posts: SnapNovaPost[] = [
    {
      id: 1,
      author: 'Maya Vega',
      handle: '@maya_drift',
      location: 'OCEAN BEACH',
      caption: 'Golden hour on the palms. Zero traffic, full boost.',
      filter: 'golden',
      imageDataUrl: null,
      accentGradient: 'linear-gradient(135deg, #f97316 0%, #ec4899 55%, #3b0764 100%)',
      likes: 142,
      likedByPlayer: false,
      comments: [
        { author: '@tito_customs', text: 'Careful on those fresh rear tires!' },
        { author: '@marco_vip', text: 'See you at the boardwalk!' },
      ],
      timestamp: '12m ago',
    },
    {
      id: 2,
      author: 'San Nova Daily',
      handle: '@nova_daily',
      location: 'DOWNTOWN',
      caption: 'NovaBank Reserve just upgraded vault security after a string of high-speed chases.',
      filter: 'none',
      imageDataUrl: null,
      accentGradient: 'linear-gradient(135deg, #0f172a 0%, #1d4ed8 55%, #38bdf8 100%)',
      likes: 318,
      likedByPlayer: false,
      comments: [
        { author: '@vesper_ops', text: 'Security is always a state of mind.' },
      ],
      timestamp: '38m ago',
    },
  ];

  return {
    open: false,
    activeApp: 'home',
    contacts: DEFAULT_CONTACTS,
    threads,
    unreadByContact: { fixer: 1 },
    posts,
    activeCall: null,
    nextMsgId: 10,
    nextPostId: 10,
    selectedContactId: 'mechanic',
  };
}

export function generateContextualSmsReply(contactId: string, playerText: string): string {
  const lower = playerText.toLowerCase();

  if (contactId === 'mechanic') {
    if (lower.includes('car') || lower.includes('ride') || lower.includes('deliver')) {
      return "Hit the Call button in Contacts and I'll drop a fresh supercar right next to your curb!";
    }
    if (lower.includes('drift')) {
      return "Wide sweepers down by Ocean Beach and the industrial docks—smooth asphalt, tons of room.";
    }
    return "Garage is open 24/7. Call me whenever you need wheels delivered.";
  }

  if (contactId === 'fixer') {
    if (lower.includes('wanted') || lower.includes('cop') || lower.includes('heat') || lower.includes('clear')) {
      return "Ring me directly and I'll wipe your dispatch profile for $350—clean slate.";
    }
    if (lower.includes('bank') || lower.includes('vault') || lower.includes('heist')) {
      return "Walk into any green $ NovaBank branch or hit the teller terminal to start a vault breach. Watch the 4-star response.";
    }
    return "Stay smart out there. Cash in the bank stays safe even if you get busted.";
  }

  if (contactId === 'maya') {
    if (lower.includes('post') || lower.includes('snap') || lower.includes('photo')) {
      return "Just liked it!! That shot looks insane, San Nova looks unreal right now.";
    }
    if (lower.includes('heist') || lower.includes('bank')) {
      return "I'll keep the getaway route clear—just make sure you sprint 200m out once the vault bag is full!";
    }
    return "On my way down the boulevard—catch you in a bit!";
  }

  if (contactId === 'emergency') {
    return "Message logged by SNPD Dispatch. Place a voice call to dispatch nearest squad & EMS.";
  }

  if (lower.includes('event') || lower.includes('happening') || lower.includes('tonight')) {
    return "Check the pulsing gold '?' markers on your minimap—wild random events are popping off all over the city!";
  }
  return "Catch you on Ocean Drive later! Keep the SnapNova feed hot.";
}

export function sendSmsMessage(
  state: PhoneState,
  contactId: string,
  text: string,
  timeStr = '12:00'
): { playerMsg: SmsMessage; replyMsg: SmsMessage } {
  const clean = text.trim();
  if (!state.threads[contactId]) state.threads[contactId] = [];

  const playerMsg: SmsMessage = {
    id: state.nextMsgId++,
    sender: 'player',
    text: clean,
    timestamp: timeStr,
  };
  state.threads[contactId].push(playerMsg);

  const replyText = generateContextualSmsReply(contactId, clean);
  const replyMsg: SmsMessage = {
    id: state.nextMsgId++,
    sender: 'contact',
    text: replyText,
    timestamp: timeStr,
  };
  state.threads[contactId].push(replyMsg);
  state.unreadByContact[contactId] = 0;

  return { playerMsg, replyMsg };
}

export function startPhoneCall(state: PhoneState, contactId: string): ActivePhoneCall | null {
  const contact = state.contacts.find((c) => c.id === contactId);
  if (!contact) return null;

  const call: ActivePhoneCall = {
    contactId: contact.id,
    contactName: contact.name,
    status: 'connected',
    elapsedSec: 0,
    transcript: contact.callGreeting,
    actionDispatched: false,
    action: contact.callAction,
  };
  state.activeCall = call;
  return call;
}

export function endPhoneCall(state: PhoneState): void {
  state.activeCall = null;
}

export function publishSnapNovaPost(
  state: PhoneState,
  params: {
    caption: string;
    location: string;
    filter: SnapNovaPost['filter'];
    imageDataUrl: string | null;
    timeStr?: string;
  }
): SnapNovaPost {
  const seed = state.nextPostId;
  const c1 = NPC_COMMENT_POOL[seed % NPC_COMMENT_POOL.length];
  const c2 = NPC_COMMENT_POOL[(seed + 3) % NPC_COMMENT_POOL.length];
  const post: SnapNovaPost = {
    id: state.nextPostId++,
    author: 'You',
    handle: '@san_nova_player',
    location: params.location || 'SAN NOVA',
    caption: params.caption.trim() || 'Live from the streets of San Nova.',
    filter: params.filter,
    imageDataUrl: params.imageDataUrl,
    accentGradient: 'linear-gradient(135deg, #0ea5e9 0%, #6366f1 50%, #ec4899 100%)',
    likes: 14 + ((seed * 17) % 68),
    likedByPlayer: true,
    comments: [c1, c2],
    timestamp: params.timeStr || 'Just now',
  };
  state.posts.unshift(post);
  if (state.posts.length > 24) state.posts.pop();
  return post;
}

export function togglePostLike(state: PhoneState, postId: number): void {
  const post = state.posts.find((p) => p.id === postId);
  if (!post) return;
  post.likedByPlayer = !post.likedByPlayer;
  post.likes += post.likedByPlayer ? 1 : -1;
}
