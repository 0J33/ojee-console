/* Sample data, shaped like the real modules' /api/summary and views. Nothing here is live. */
window.DATA = {
  ntp: { source: 'NTP · time.cloudflare.com', offsetMs: 43, rateMs: 0, zone: 'Cairo · EET', lastSync: '2 min ago' },

  alerts: [
    { id: 'a1', module: 'fleet', sev: 'warn', title: 'terraria-api restarted twice in an hour', meta: 'disinteg · Fleet · held for 6 min', host: 'disinteg', service: 'terraria-api' },
  ],

  home: {
    ac: { name: 'Living room AC', on: true, set: 24, inside: 25.5, outside: 32.2, humidity: 48, mode: 'cool', fan: 'auto', since: '17:52' },
    presence: { here: true, since: '18:40', acc: 12, seen: '2 min ago', via: 'OwnTracks' },
    scenes: [
      { id: 'cool', name: 'Cool down', sub: 'AC 22°, fan high', icon: 'i-snow' },
      { id: 'sleep', name: 'Sleep', sub: 'AC 26°, quiet', icon: 'i-moon' },
      { id: 'away', name: 'Away', sub: 'Everything off', icon: 'i-pin' },
      { id: 'dry', name: 'Muggy', sub: 'Dry mode, 25°', icon: 'i-drop' },
    ],
    automations: [
      { id: 'leave', name: 'When I leave, turn the AC off', sub: 'Presence · ran yesterday 08:12', on: true },
      { id: 'arrive', name: 'When I arrive, cool to 24°', sub: 'Presence · ran today 18:40', on: true },
      { id: 'night', name: 'At 01:00, switch to Sleep', sub: 'Time · ran today 01:00', on: true },
      { id: 'hot', name: 'If inside goes over 29°, cool to 25°', sub: 'Reading · never ran', on: false },
    ],
  },

  desk: [
    { id: 'mouse', name: 'Attack Shark V5', kind: 'Mouse', icon: 'i-mouse', battery: 64, link: 'Dongle · 1000 Hz', detail: '1600 DPI · stage 2 of 4',
      settings: { dpi: [800, 1600, 3200, 6400], stage: 1, polling: [125, 500, 1000, 2000, 4000], poll: 1000, debounce: 4, motionSync: true, angleSnap: false } },
    { id: 'kbd', name: 'Attack Shark R86 HE', kind: 'Keyboard', icon: 'i-keyboard', battery: null, link: 'Cable · 8000 Hz', detail: 'Profile 1 · actuation 1.2 mm',
      settings: { actuation: 1.2, rapid: true, rapidSens: 0.15, lighting: 'Static warm', profile: 1 } },
    { id: 'cmf', name: 'CMF Headphone Pro', kind: 'Headphones', icon: 'i-headphones', battery: 80, link: 'Bluetooth · LDAC', detail: 'Noise cancelling high',
      settings: { anc: 'high', eq: 'Balanced', spatial: false, lowLatency: false } },
  ],

  hosts: [
    { id: 'loq', name: 'LOQ', role: 'Laptop · this device', obj: 'laptop', status: 'ok', cpu: 18, temp: 61, mem: 71, swap: 22, disk: 64, gpu: 'RTX 5060 · 3%', up: '2 d 4 h', battery: 88,
      net: '0.8 Mb/s', remote: true, spark: [12,14,22,18,16,30,24,19,17,15,18,21,18,16,18] },
    { id: 'hp', name: 'ojee-hp-zorin', role: 'Always-on box · runs the stack', obj: 'tower', status: 'ok', cpu: 34, temp: 58, mem: 62, swap: 9, disk: 48, gpu: 'none', up: '19 d 7 h', battery: null,
      net: '3.4 Mb/s', remote: true, spark: [28,31,35,30,33,41,38,36,34,32,30,35,37,33,34] },
    { id: 'disinteg', name: 'disinteg', role: 'Web server · *.ojee.net', obj: 'rack', status: 'warn', cpu: 47, temp: 66, mem: 81, swap: 31, disk: 91, gpu: 'none', up: '41 d 2 h', battery: null,
      net: '1.2 Mb/s', remote: false, spark: [40,44,52,61,48,45,50,47,55,49,46,47,52,48,47] },
  ],

  services: [
    { name: 'terraria-api', host: 'disinteg', kind: 'systemd', state: 'warn', note: 'restarted twice in an hour' },
    { name: 'rep-health', host: 'disinteg', kind: 'systemd', state: 'ok', note: 'up 3 d' },
    { name: 'nginx', host: 'disinteg', kind: 'systemd', state: 'ok', note: 'up 41 d' },
    { name: 'mtg-server', host: 'disinteg', kind: 'systemd', state: 'ok', note: 'up 6 d' },
    { name: 'dnd-server', host: 'disinteg', kind: 'systemd', state: 'off', note: 'stopped by you · muted' },
    { name: 'console', host: 'ojee-hp-zorin', kind: 'container', state: 'ok', note: 'up 4 d' },
    { name: 'agentmod', host: 'ojee-hp-zorin', kind: 'container', state: 'ok', note: 'up 4 d' },
    { name: 'home', host: 'ojee-hp-zorin', kind: 'container', state: 'ok', note: 'up 12 d' },
    { name: 'guacd', host: 'ojee-hp-zorin', kind: 'container', state: 'ok', note: 'up 19 d' },
    { name: 'caddy', host: 'ojee-hp-zorin', kind: 'container', state: 'ok', note: 'up 19 d' },
    { name: 'ojee-opencode', host: 'ojee-hp-zorin', kind: 'systemd', state: 'ok', note: 'up 2 d' },
    { name: 'discord-watchdog.timer', host: 'LOQ', kind: 'systemd', state: 'ok', note: 'next in 4 min' },
    { name: 'ram-reclaim.timer', host: 'LOQ', kind: 'systemd', state: 'ok', note: 'next in 11 min' },
  ],

  processes: [
    { name: 'node server/index.js', cpu: 12.4, mem: '412 MB' },
    { name: 'nginx: worker', cpu: 3.1, mem: '38 MB' },
    { name: 'terraria-api', cpu: 9.8, mem: '1.1 GB' },
    { name: 'mongod', cpu: 6.2, mem: '780 MB' },
    { name: 'sshd', cpu: 0.2, mem: '9 MB' },
  ],

  router: {
    model: 'Huawei 5G CPE 5s', net: '5G NSA', rsrp: -92, quality: 'good', sinr: 14, down: 2.1, up: 0.4, today: 3.2, month: 486.6, uptime: '6 d 3 h',
    carriers: [ { band: 'n78', what: '5G · 100 MHz', v: '−92 dBm' }, { band: 'B3', what: 'LTE anchor', v: '−88 dBm' }, { band: 'B1', what: 'LTE CA', v: '−97 dBm' } ],
    history: { '1h': [-93,-92,-94,-91,-92,-93,-95,-92,-90,-92,-93,-92], '6h': [-90,-91,-93,-96,-99,-97,-94,-92,-93,-91,-92,-92], '24h': [-89,-90,-90,-92,-95,-101,-104,-98,-94,-92,-91,-90,-92,-93,-95,-97,-93,-92,-91,-92,-93,-92,-92,-92], '48h': [-90,-91,-92,-95,-100,-96,-92,-91,-90,-93,-98,-104,-99,-93,-91,-90,-92,-94,-97,-95,-92,-91,-92,-92] },
    clients: [
      { name: 'LOQ', ip: '192.168.8.101', kind: 'i-laptop', band: '5 GHz' }, { name: 'ojee-hp-zorin', ip: '192.168.8.100', kind: 'i-machines', band: 'Ethernet' },
      { name: 'iPhone 13 Pro Max', ip: '192.168.8.120', kind: 'i-phone', band: '5 GHz' }, { name: 'Living room AC', ip: '192.168.1.36', kind: 'i-fan', band: '2.4 GHz · via Gamal' },
      { name: 'Pixel Watch', ip: '192.168.8.133', kind: 'i-clock', band: '2.4 GHz' }, { name: 'Unknown (a4:3b:…)', ip: '192.168.8.141', kind: 'i-wifi', band: '2.4 GHz' },
    ],
    sms: [ { from: 'WE', at: 'Yesterday', text: 'You have used 80% of your monthly quota. Renewal on 1 Dec.' }, { from: 'WE', at: '10 Nov', text: 'Your bundle has been renewed successfully.' } ],
    data: true,
  },

  agent: {
    usage: [ { acct: 'personal', week: 62, five: 18 }, { acct: 'work', week: 34, five: 0 } ],
    sessions: [
      { id: 's1', name: 'ojee-console redesign', dir: '~/Code/ojee-console', state: 'running', age: '23 min', acct: 'personal',
        log: ['Reading DESIGN.md and PRODUCT.md…', 'Built tokens.css and console.css', 'Writing the 3D objects in two tones'] },
      { id: 's2', name: 'rep. scale test', dir: '~/Code/ojee.net/health.ojee.net', state: 'waiting', age: '1 h 4 min', acct: 'personal',
        log: ['Ran tests: 214 passed, 1 failed', 'Waiting: the 07:10 weigh-in fixture moved, update it?'] },
      { id: 's3', name: 'Fleet alert hysteresis', dir: '~/Code/ojee-fleet', state: 'done', age: 'ended 2 h ago', acct: 'work',
        log: ['Raised hold to 90 s for brief disconnects', 'Tests pass, committed 4b6b648'] },
    ],
    workflows: [
      { id: 'w1', name: 'Trello card → laptop export', on: true, last: 'ok', when: '12 min ago' },
      { id: 'w2', name: 'Slack thread → laptop export', on: true, last: 'ok', when: '1 h ago' },
      { id: 'w3', name: 'Daily backup to NVME', on: true, last: 'fail', when: '03:00 today' },
      { id: 'w4', name: 'Router SMS → Discord', on: true, last: 'ok', when: 'yesterday' },
      { id: 'w5', name: 'Weekly OW rank snapshot', on: false, last: 'ok', when: '9 Nov' },
    ],
    runs: [ { wf: 'Trello card → laptop export', ok: true, when: '12 min ago', took: '2.1 s' }, { wf: 'Daily backup to NVME', ok: false, when: '03:00', took: 'timed out after 5 min' }, { wf: 'Slack thread → laptop export', ok: true, when: '1 h ago', took: '3.4 s' } ],
    odysseus: { version: '0.14.2', model: 'gemini-2.5-flash', state: 'ok', containers: ['odysseus', 'chromadb', 'searxng', 'redis'] },
    services: [ { name: 'n8n', state: 'ok', note: 'up 4 d' }, { name: 'Odysseus', state: 'ok', note: 'up 4 d' }, { name: 'ChromaDB', state: 'ok', note: 'up 4 d' },
      { name: 'SearXNG', state: 'ok', note: 'up 4 d' }, { name: 'ntfy', state: 'ok', note: 'up 12 d' }, { name: 'CouchDB', state: 'ok', note: 'up 12 d' } ],
  },

  music: { title: 'Midnight City', artist: 'M83', album: 'Hurry Up, We’re Dreaming', len: 243, at: 162, playing: true, shuffle: false, repeat: false, device: 'LOQ', volume: 64,
    devices: ['LOQ', 'iPhone 13 Pro Max', 'Living room speaker'],
    queue: [ { t: 'Wait', a: 'M83' }, { t: 'Outro', a: 'M83' }, { t: 'Kids', a: 'MGMT' } ] },

  notifications: [
    { id: 'n1', module: 'fleet', sev: 'warn', title: 'terraria-api restarted twice in an hour', when: '6 min ago' },
    { id: 'n2', module: 'agent', sev: 'warn', title: 'rep. scale test is waiting for you', when: '58 min ago' },
    { id: 'n3', module: 'agent', sev: 'err', title: 'Daily backup to NVME failed', when: '03:00' },
    { id: 'n4', module: 'home', sev: 'info', title: 'You arrived. AC cooling to 24°', when: '18:40' },
    { id: 'n5', module: 'net', sev: 'info', title: '80% of the monthly quota used', when: 'Yesterday' },
  ],

  routing: [
    { id: 'fleet.alert', label: 'A machine or service needs you', mod: 'fleet', app: true, discord: true },
    { id: 'agent.waiting', label: 'A Claude session is waiting', mod: 'agent', app: true, discord: true },
    { id: 'agent.failed', label: 'A workflow failed', mod: 'agent', app: true, discord: false },
    { id: 'home.presence', label: 'You arrive or leave', mod: 'home', app: true, discord: false },
    { id: 'net.quota', label: 'Data quota crosses 80%', mod: 'net', app: false, discord: true },
  ],

  trusted: [
    { id: 'd1', name: 'iPhone 13 Pro Max', where: 'Safari · this device', until: 'trusted until 15 Dec', icon: 'i-phone', current: true },
    { id: 'd2', name: 'LOQ', where: 'Chrome on Zorin', until: 'trusted until 2 Dec', icon: 'i-laptop' },
    { id: 'd3', name: 'ojee-hp-zorin', where: 'Firefox on Zorin', until: 'trusted until 20 Nov', icon: 'i-machines' },
  ],

  modules: [
    { id: 'home', name: 'Home', v: '2.3.0', state: 'ok' }, { id: 'router', name: 'Router', v: '1.4.1', state: 'ok' }, { id: 'fleet', name: 'Fleet', v: '1.9.0', state: 'ok' },
    { id: 'remote', name: 'Remote', v: '0.8.0', state: 'ok' }, { id: 'agent', name: 'Agent', v: '3.1.2', state: 'ok' }, { id: 'music', name: 'Music', v: '1.1.0', state: 'ok' },
    { id: 'peripherals', name: 'Peripherals', v: '0.6.3', state: 'ok' },
  ],

  activity: [
    { icon: 'i-warn', cls: 'warn', title: 'terraria-api restarted', sub: 'disinteg · twice since 19:31', when: '6 min' },
    { icon: 'i-chat', cls: 'agent', title: 'rep. scale test is waiting for you', sub: 'Claude · asks about a fixture', when: '58 min' },
    { icon: 'i-pin', cls: 'home', title: 'You arrived home', sub: 'AC cooling to 24°', when: '18:40' },
    { icon: 'i-flow', cls: 'err', title: 'Daily backup to NVME failed', sub: 'Timed out after 5 min', when: '03:00' },
  ],
};
