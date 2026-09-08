const { test } = require('node:test');
const assert = require('node:assert/strict');
const fs = require('node:fs');
const vm = require('node:vm');

// Evaluar solo el flujo de voz, sin iniciar Discord ni los proveedores de TTS.
const source = fs.readFileSync(require.resolve('../app.js'), 'utf8');
const audioSource = source.slice(source.indexOf('function channelHasListeners('), source.indexOf('async function loadGuild('));
const eventSource = source.slice(source.indexOf('client.on(Events.VoiceStateUpdate, async'), source.indexOf("client.on('interactionCreate'"));
function setup(botChannelId = null) {
  const calls = [];
  const member = { nickname: 'Persona', user: { id: 'human', bot: false } };
  const channels = Object.fromEntries(['origin', 'destination', 'other'].map(id => [id, { id, members: [member] }]));
  const guild = { id: 'guild', members: { me: { voice: { channelId: botChannelId } }, fetch: async () => member } };
  const context = vm.createContext({
    console, guilds: { guild: { enabled: true, sayStatus: true, sayNames: false } },
    guild_voice_queue: { guild: {} }, guild_voice_queue_executing: { guild: true }, nextAudioSequence: 0,
    Events: { VoiceStateUpdate: 'voice' },
    client: { user: { id: 'bot' }, channels: { fetch: async id => channels[id] }, on: (_, handler) => { context.handler = handler; } },
    syncBotVoiceState: () => calls.push('sync'),
    GeneraVoz: async () => { calls.push('tts'); return 'speech.ogg'; },
  });
  vm.runInContext(audioSource + '\n' + eventSource, context);
  const state = channelId => ({ id: 'human', guild, channelId });
  return { context, guild, channels, calls, state };
}

for (const [location, expected] of [
  ['origin', ['leave:origin', 'join:destination']],
  ['destination', ['join:destination', 'leave:origin']],
  ['other', ['leave:origin', 'join:destination']],
  [null, ['leave:origin', 'join:destination']],
]) {
  test(`Cambio de canal con Burbuja en ${location}`, async () => {
    const { context, state, calls } = setup(location);
    context.notifyChannel = async (_, channel, member, type) => {
      await new Promise(resolve => setImmediate(resolve));
      calls.push(type + ':' + channel.id);
    };
    await context.handler(state('origin'), state('destination'));
    assert.deepEqual(calls, expected);
  });
}

test('Descarta salida sin humanos y conserva entrada', async () => {
  const { context, channels, state, calls } = setup('origin');
  channels.origin.members = [{ user: { bot: true } }];
  await context.handler(state('origin'), state('destination'));
  assert.equal(context.guild_voice_queue.guild.origin, undefined);
  assert.equal(context.guild_voice_queue.guild.destination.length, 1);
  assert.deepEqual(calls, []);
});

test('No genera TTS ni encola estados en canales vacios', async () => {
  const { context, channels, state, calls } = setup();
  channels.origin.members = [];
  await context.handler(state('origin'), { ...state('origin'), selfMute: true });
  assert.deepEqual(calls, []);
  assert.equal(Object.keys(context.guild_voice_queue.guild).length, 0);
});

test('Descarta audio si el canal se vacia en la cola o durante la conexion', async () => {
  for (const emptyBeforeJoin of [true, false]) {
    const { context, guild, channels } = setup();
    await context.playSound(guild, channels.origin, 'sound.ogg');
    let joins = 0;
    context.getReadyVoiceConnection = async () => { joins++; channels.origin.members = []; return {}; };
    context.createAudioPlayer = () => assert.fail('No debe crear reproductor');
    if (emptyBeforeJoin) channels.origin.members = [];
    await context.audioQueueChannel(guild, 'origin');
    assert.equal(joins, emptyBeforeJoin ? 0 : 1);
    assert.equal(context.guild_voice_queue.guild.origin.length, 0);
  }
});

test('La cola prioriza ubicacion actual y luego antiguedad, no orden de claves', async () => {
  for (const location of ['destination', 'other']) {
    const { context, guild, channels, calls } = setup(location);
    context.guild_voice_queue.guild.destination = [];
    await context.playSound(guild, channels.origin, 'leave.ogg');
    await context.playSound(guild, channels.destination, 'join.ogg');
    context.audioQueueChannel = async (_, id) => { context.guild_voice_queue.guild[id].shift(); calls.push(id); };
    context.guild_voice_queue_executing.guild = false;
    await context.audioQueue(guild);
    assert.deepEqual(calls, location === 'destination' ? ['destination', 'origin'] : ['origin', 'destination']);
    assert.equal(context.guild_voice_queue_executing.guild, false);
  }
});

test('Conserva entradas, salidas, estados y sincronizacion del bot', async () => {
  const { context, state, calls } = setup();
  context.notifyChannel = async (_, channel, member, type) => calls.push(type);
  await context.handler(state(null), state('destination'));
  await context.handler(state('origin'), state(null));
  await context.handler(state('origin'), { ...state('origin'), selfMute: true });
  context.guilds.guild.enabled = false;
  await context.handler(state('origin'), { ...state(null), id: 'bot' });
  assert.deepEqual(calls, ['join', 'leave', 'mute', 'sync']);
});
