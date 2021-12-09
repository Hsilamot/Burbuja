const fs = require('fs');
const configjson = require('./config.json');
const environment = process.env.NODE_ENV || 'development';
const config = Object.assign(configjson['development'], configjson[environment]);
const util = require('util');
var crypto = require('crypto');
const { Client, Collection, Intents } = require('discord.js');
const discordTTS = require('discord-tts');
const GoogleCloudTextToSpeech = require('@google-cloud/text-to-speech');
const ObservableSlim = require('observable-slim');
const { getAudioDurationInSeconds } = require('get-audio-duration');
var touch = require("touch");
const { REST } = require('@discordjs/rest');
const { Routes } = require('discord-api-types/v9');
const { joinVoiceChannel, createAudioPlayer, NoSubscriberBehavior, getVoiceConnection, VoiceConnectionStatus, createAudioResource } = require('@discordjs/voice');

const myIntents = new Intents();
myIntents.add(Intents.FLAGS.GUILDS);
myIntents.add(Intents.FLAGS.GUILD_MEMBERS);
myIntents.add(Intents.FLAGS.GUILD_BANS);
myIntents.add(Intents.FLAGS.GUILD_EMOJIS_AND_STICKERS);
myIntents.add(Intents.FLAGS.GUILD_INTEGRATIONS);
myIntents.add(Intents.FLAGS.GUILD_WEBHOOKS);
myIntents.add(Intents.FLAGS.GUILD_INVITES);
myIntents.add(Intents.FLAGS.GUILD_VOICE_STATES);
myIntents.add(Intents.FLAGS.GUILD_PRESENCES);
myIntents.add(Intents.FLAGS.GUILD_MESSAGES);
myIntents.add(Intents.FLAGS.GUILD_MESSAGE_REACTIONS);
myIntents.add(Intents.FLAGS.GUILD_MESSAGE_TYPING);
myIntents.add(Intents.FLAGS.GUILD_VOICE_STATES);
myIntents.add(Intents.FLAGS.DIRECT_MESSAGES);
myIntents.add(Intents.FLAGS.DIRECT_MESSAGE_REACTIONS);
myIntents.add(Intents.FLAGS.DIRECT_MESSAGE_TYPING);

config.DiscordClient.intents = myIntents;
console.log(config.DiscordClient);
const client = new Client(config.DiscordClient);

var guilds_data = {};
var guilds = ObservableSlim.create(guilds_data, true, function(changes) {
	changes.forEach((value,key) => {
		if (value.type=='add'||value.type=='update') {
			rompe = value.jsonPointer.split('/');
			if (rompe.length>2) {
				fs.writeFileSync('./guilds/'+rompe[1]+'.json', JSON.stringify(guilds[rompe[1]]), (err) => {
					if (err) {
						console.log('Error',err);
					}
				});
			}
		}
	})
});

const googleTTS = new GoogleCloudTextToSpeech.TextToSpeechClient(config.GoogleTTS);

const rest = new REST({ version: '9' }).setToken(config.Token);
client.commands = new Collection();
const comandos = [];
const comandosFiles = fs.readdirSync('./comandos').filter(file => file.endsWith('.js'));
for (const file of comandosFiles) {
	const comando = require(`./comandos/${file}`);
	comandos.push(comando.data.toJSON());
	client.commands.set(comando.data.name, comando);
}

async function GeneraVoz(textoaconvertir) {
	const request = Object.assign(config.GoogleTTS.templateObject,
						{
							"input": {
								"text": textoaconvertir
							}
						}
					);
	var hashSha512 = crypto.createHash('sha512');
	hashraw = hashSha512.update(textoaconvertir, 'utf-8');
	sha512hash = hashraw.digest('hex');
	try {
		if (fs.existsSync('voice_cache/'+sha512hash+'.ogg')) {
			touch('voice_cache/'+sha512hash+'.ogg');
			return 'voice_cache/'+sha512hash+'.ogg';
		} else {
			const [response] = await googleTTS.synthesizeSpeech(request);
			const writeFile = util.promisify(fs.writeFile);
			await writeFile('voice_cache/'+sha512hash+'.ogg', response.audioContent, 'binary');
			console.log('Generado archivo de cache para la frase "'+textoaconvertir+'" --> voice_cache/'+sha512hash+'.ogg');
			return 'voice_cache/'+sha512hash+'.ogg';
		}
	} catch(err) {
		console.log(err);
	}
}

function quickBotReply(message,text,...params) {
	var sendText = text;
	if (params.length>0) {
		var sendText = util.format(text,...params);
	}
	message.channel.send(sendText)
	.then(message => {
		message.delete({timeout:180000}).catch(console.error);
		//message.delete({timeout:10000}).catch(console.error);
	})
	.catch(console.error);
	message.delete().catch(console.error);
}

let voz = null;
let current = null;
var guild_voice = {};
var guild_voice_status = {};
let guild_voice_queue = {};
let guild_voice_queue_executing = {};

async function joinChannel(guild,channel) {
	if (!guilds[guild.id].enabled) { return false; }
	const current_connection = getVoiceConnection(guild.id);
	if (typeof current_connection==='undefined') {
		console.log('['+guild.name+'] JOIN --> '+channel.id+' ('+channel.name+')');
		const connection = await joinVoiceChannel({
			channelId: channel.id,
			guildId: guild.id,
			adapterCreator: guild.voiceAdapterCreator,
		});
		guild_voice[guild.id] = connection;
		guild_voice_status[guild.id] = false;
		console.log('['+guild.name+'] JOINED --> '+channel.id+' ('+channel.name+')');
	} else {
		if (current_connection.joinConfig.channelId!==channel.id) {
			console.log('['+guild.name+'] JOIN --> '+channel.id+' ('+channel.name+')');
			const connection = await joinVoiceChannel({
				channelId: channel.id,
				guildId: guild.id,
				adapterCreator: guild.voiceAdapterCreator,
			});
			guild_voice[guild.id] = connection;
			guild_voice_status[guild.id] = false;
			console.log('['+guild.name+'] JOINED --> '+channel.id+' ('+channel.name+')');
		}
	}
}

async function audioQueueChannel(guild,channelId) {
	let toPlay = guild_voice_queue[guild.id][channelId].shift();
	if (toPlay!==undefined) {
		pending = true;
		let audioLength = 0;
		await joinChannel(toPlay.guild,toPlay.channel);
		try {
			await getAudioDurationInSeconds(toPlay.sound).then(duration => audioLength = duration);
		} catch {
			console.log('Audio Cache was not found! '+toPlay.sound);
			return false;
		}
		await new Promise((resolve,reject) => {
					setTimeout(() => {
						if (typeof guild_voice[toPlay.guild.id]==='object'&&guild_voice[toPlay.guild.id]!==null) {
							const audioPlayer = createAudioPlayer({
								behaviors: {
									noSubscriber: NoSubscriberBehavior.Pause,
								},
							});
							const audioResource = createAudioResource(toPlay.sound);
							guild_voice[toPlay.guild.id].subscribe(audioPlayer);
							audioPlayer.play(audioResource);
							console.log('['+toPlay.guild.name+'] '+guild_voice[toPlay.guild.id].joinConfig.channelId+' Playing: '+toPlay.sound);
							setTimeout(() => {
								resolve('Played!');
							},((audioLength*1000)+500));
						} else {
							guild_voice_queue[guild.id][i].unshift(toPlay);
							reject('['+toPlay.guild.name+'] No object on voice!');
						}
					}, 150)
				}).catch( async (error) => {console.log(error); });
	}
}

async function audioQueue(guild) {
	if (!guilds[guild.id].enabled) { return false; }
	if (guild_voice_queue_executing[guild.id]===false) {
		guild_voice_queue_executing[guild.id] = true;
		var pending = false;
		for (i in guild_voice_queue[guild.id]) {
			while (typeof guild_voice_queue[guild.id][i]!=='undefined'&&guild_voice_queue[guild.id][i].length>0) {
				pending = true;
				await audioQueueChannel(guild,i);
			}
		}
		guild_voice_queue_executing[guild.id] = false;
		if (pending) {
			audioQueue(guild);
		}
	}
}

async function playSound(guild,channel,sound) {
	if (!guilds[guild.id].enabled) { return false; }
	var pendingPlay = {};
	pendingPlay.guild = guild;
	pendingPlay.channel = channel;
	pendingPlay.sound = sound;
	if (typeof guild_voice_queue[guild.id][channel.id] == 'undefined') {
		guild_voice_queue[guild.id][channel.id] = [];
	}
	guild_voice_queue[guild.id][channel.id].push(pendingPlay);
	audioQueue(guild);
}

async function notifyChannel(guild,channel,member,type) {
	var nickname = member.nickname;
	if (nickname===null||nickname===undefined) {
		nickname = member.user.username;
		if (nickname===null||nickname===undefined) {
			console.log('Undefined Nickname!',member);
		}
	}
	switch (type) {
		case 'join':
			console.log('['+guild.name+'] '+nickname+' JOINED '+channel.id+' ('+channel.name+')');
			var sonido = '';
			var saludo = '';
			switch (member.user.id) {
				case '436724739868721153': //Zeus
					sonido = './sounds/join_zeus.ogg'; break;
				case '538464306539528192': //NikoSan
					sonido = './sounds/join_niko.ogg'; break;
				case '358776832536870913': //Taquero
					sonido = './sounds/join_taquero.ogg'; break;
				case '468956439528996864': //Dayreff
					switch (Math.floor(Math.random() * Math.floor(2))) {
						case  0: sonido = './sounds/join_dayreff.ogg'; break;
						case  1: sonido = './sounds/join_dayreff2.ogg'; break;
					}
					break;
				case '285061921453899776': //Elma
					sonido = './sounds/join_elma.ogg'; break;
				case '402277903372517397': //Personalizado
					sonido = './sounds/join_402277903372517397_wahaha.ogg'; break;
				case '329392035658465281': //Draxen
					switch (Math.floor(Math.random() * Math.floor(2))) {
						case  0: sonido = './sounds/join_draxen.ogg'; break;
						case  1: sonido = './sounds/join_draxen2.ogg'; break;
					}
					break;
				case '279786562089254912': //Liontzuky
					switch (Math.floor(Math.random() * Math.floor(4))) {
						case  0: sonido = './sounds/join_liontzuky.ogg'; break;
						case  1: sonido = './sounds/join_liontzuky2.ogg'; break;
						case  2: sonido = './sounds/join_liontzuky3.ogg'; break;
						case  3: sonido = './sounds/join_liontzuky4.ogg'; break;
					}
					break;
				case '475796286067572766': //Crimson
					sonido = './sounds/join_liontzuky3.ogg'; break;
				default:
					sonido = './sounds/join_default.ogg';
					if (guilds[guild.id].sayNames) {
						saludo = nickname;
					}
			}
			playSound(guild,channel,sonido);
			if (saludo!=='') {
				var saludoFile = await GeneraVoz(saludo);
				playSound(guild,channel,saludoFile);
			}
			break;
		case 'leave':
			console.log('['+guild.name+'] '+nickname+' LEFT '+channel.id+' ('+channel.name+')');
			var sonido = '';
			var saludo = '';
			switch (member.user.id) {
				case '468956439528996864': //Dayreff
					sonido = './sounds/leave_dayreff.ogg'; break;
				case '436724739868721153': //Zeus
				case '538464306539528192': //NikoSan
				case '358776832536870913': //Taquero
				default:
					sonido = './sounds/leave_default.ogg';
					if (guilds[guild.id].sayNames) {
						saludo = nickname;
					}
			}
			playSound(guild,channel,sonido);
			if (saludo!=='') {
				var saludoFile = await GeneraVoz(saludo);
				playSound(guild,channel,saludoFile);
			}
			break;
		case 'serverdeaf':
			console.log('['+guild.name+'] '+nickname+' Server Deafened '+channel.id+' ('+channel.name+')');
			var saludoFile = await GeneraVoz('el servidor ha ensordecido a '+nickname);
			playSound(guild,channel,saludoFile);
			break;
		case 'serverundeaf':
			console.log('['+guild.name+'] '+nickname+' Server UnDeafened '+channel.id+' ('+channel.name+')');
			var saludoFile = await GeneraVoz('el servidor ahora permite que '+nickname+' escuche');
			playSound(guild,channel,saludoFile);
			break;
		case 'servermute':
			console.log('['+guild.name+'] '+nickname+' Server Muted '+channel.id+' ('+channel.name+')');
			var saludoFile = await GeneraVoz('el servidor ha quitado la palabra a '+nickname);
			playSound(guild,channel,saludoFile);
			break;
		case 'serverunmute':
			console.log('['+guild.name+'] '+nickname+' Server UnMuted '+channel.id+' ('+channel.name+')');
			var saludoFile = await GeneraVoz('el servidor ahora permite que '+nickname+' hable');
			playSound(guild,channel,saludoFile);
			break;
		case 'deaf':
			console.log('['+guild.name+'] '+nickname+' Deafened '+channel.id+' ('+channel.name+')');
			var saludoFile = await GeneraVoz(nickname+' ya no nos escucha');
			playSound(guild,channel,saludoFile);
			break;
		case 'undeaf':
			console.log('['+guild.name+'] '+nickname+' UnDeafened '+channel.id+' ('+channel.name+')');
			var saludoFile = await GeneraVoz(nickname+' nos escucha');
			playSound(guild,channel,saludoFile);
			break;
		case 'mute':
			console.log('['+guild.name+'] '+nickname+' Muted '+channel.id+' ('+channel.name+')');
			var saludoFile = await GeneraVoz(nickname+' se muteo');
			playSound(guild,channel,saludoFile);
			break;
		case 'unmute':
			console.log('['+guild.name+'] '+nickname+' UnMuted '+channel.id+' ('+channel.name+')');
			var saludoFile = await GeneraVoz(nickname+' encendió micrófono');
			playSound(guild,channel,saludoFile);
			break;
		case 'stream':
			console.log('['+guild.name+'] '+nickname+' Streaming '+channel.id+' ('+channel.name+')');
			var saludoFile = await GeneraVoz(nickname+' ha iniciado una transmisión');
			playSound(guild,channel,saludoFile);
			break;
		case 'endstream':
			console.log('['+guild.name+'] '+nickname+' Ending Stream '+channel.id+' ('+channel.name+')');
			var saludoFile = await GeneraVoz(nickname+' terminó la transmisión');
			playSound(guild,channel,saludoFile);
			break;
		default:
			console.log('['+guild.name+'] '+nickname+' Unknown '+channel.id+' ('+channel.name+')');
			var saludoFile = await GeneraVoz('notificacion desconocida o no reconocida de '+nickname);
			playSound(guild,channel,saludoFile);
			break;
	}
}

async function loadGuild(guild) {
	console.log(guild.id+' ['+guild.name+'] Loading...');
	if (fs.existsSync('./guilds/'+guild.id+'.json')) {
		guilds_data[guild.id] = Object.assign({}, require('./guilds/default.json'));
		guilds_data[guild.id] = Object.assign(guilds_data[guild.id], require('./guilds/'+guild.id+'.json'));
	} else {
		guilds_data[guild.id] = Object.assign({}, require('./guilds/default.json'));
		guilds[guild.id].joined = Math.floor(new Date().getTime() / 1000);
	}
	guild_voice[guild.id] = null;
	guild_voice_queue[guild.id] = [];
	guild_voice_queue_executing[guild.id] = false;
	guild_voice_status[guild.id] = false;
	/*
	client.api.applications(client.user.id).guilds(guild.id).commands.post({
		data: {
			name: 'ping',
			description: 'No me toques ahi ( •_•)σ'
		}
	}).then(()=>{console.log(guild.id+' ['+guild.name+'] Registered /ping')})
	.catch((error) => console.log(error));
	client.api.applications(client.user.id).guilds(guild.id).commands.post({
		data: {
			name: 'invite',
			description: 'obtener link de invitación para burbuja'
		}
	}).then(()=>{console.log(guild.id+' ['+guild.name+'] Registered /invite')})
	.catch((error) => console.log(error));
	client.api.applications(client.user.id).guilds(guild.id).commands.post({
		data: {
			name: 'config',
			description: 'Configuraciones',
			"options": [
				{
					"name": "enabled",
					"description": "Define si entraré o no a los canales para saludar",
					"type": 5,
					"required": false,
				}
				,{
					"name": "names",
					"description": "Define si anexaré o no el nombre de la persona que generó la notificación",
					"type": 5,
					"required": false,
				}
				,{
					"name": "states",
					"description": "Define si notificaré o no cambios de estado (Muteos, desmuteos, etc)",
					"type": 5,
					"required": false,
				}
			]
		}
	}).then(()=>{console.log(guild.id+' ['+guild.name+'] Registered /config')})
	.catch((error) => console.log(error));
	client.api.applications(client.user.id).guilds(guild.id).commands.post({
		data: {
			name: 'sound',
			description: 'Emite un efecto de audio',
			"options": [
				{
					"name": "efectos1",
					"description": "Escoje un sonido de la lista",
					"type": 3,
					"required": false,
					"choices": [
							{"name": "abathurscream (Extender Descripción)","value": "abathurscream"}
						,{"name": "ahvetealamierda (Extender Descripción)","value": "ahvetealamierda"}
						,{"name": "anotherfag (Extender Descripción)","value": "anotherfag"}
						,{"name": "aracuan (Extender Descripción)","value": "aracuan"}
						,{"name": "badumtss (Extender Descripción)","value": "badumtss"}
						,{"name": "bokusatchii (Extender Descripción)","value": "bokusatchii"}
						,{"name": "brokenglass (Extender Descripción)","value": "brokenglass"}
						,{"name": "bruh (Extender Descripción)","value": "bruh"}
						,{"name": "catscreaming (Extender Descripción)","value": "catscreaming"}
						,{"name": "clickclick (Extender Descripción)","value": "clickclick"}
						,{"name": "crybaby (Extender Descripción)","value": "crybaby"}
						,{"name": "cryofthehawk (Extender Descripción)","value": "cryofthehawk"}
						,{"name": "cuacuacua (Extender Descripción)","value": "cuacuacua"}
						,{"name": "dundundun (Extender Descripción)","value": "dundundun"}
						,{"name": "eslomasestupido (Extender Descripción)","value": "eslomasestupido"}
						,{"name": "facebookspam (Extender Descripción)","value": "facebookspam"}
						,{"name": "fightsounds (Extender Descripción)","value": "fightsounds"}
						,{"name": "fuckyou (Extender Descripción)","value": "fuckyou"}
						,{"name": "gotchabitch (Extender Descripción)","value": "gotchabitch"}
						,{"name": "gunshot (Extender Descripción)","value": "gunshot"}
						,{"name": "gyaaaaaaa (Extender Descripción)","value": "gyaaaaaaa"}
						,{"name": "hahaha (Extender Descripción)","value": "hahaha"}
						,{"name": "headshot (Extender Descripción)","value": "headshot"}
						,{"name": "helpme (Extender Descripción)","value": "helpme"}
						,{"name": "horrorscream (Extender Descripción)","value": "horrorscream"}
					]
				}
				,{
					"name": "efectos2",
					"description": "Escoje un sonido de la lista",
					"type": 3,
					"required": false,
					"choices": [
							{"name": "inception (Extender Descripción)","value": "inception"}
						,{"name": "jajaja (Extender Descripción)","value": "jajaja"}
						,{"name": "jejeje (Extender Descripción)","value": "jejeje"}
						,{"name": "jijiji (Extender Descripción)","value": "jijiji"}
						,{"name": "johncena (Extender Descripción)","value": "johncena"}
						,{"name": "letmeout (Extender Descripción)","value": "letmeout"}
						,{"name": "lol (Extender Descripción)","value": "lol"}
						,{"name": "madscream (Extender Descripción)","value": "madscream"}
						,{"name": "maniaclaugh (Extender Descripción)","value": "maniaclaugh"}
						,{"name": "mexicanfanfarrias (Extender Descripción)","value": "mexicanfanfarrias"}
						,{"name": "mexicanscanner (Extender Descripción)","value": "mexicanscanner"}
						,{"name": "mistery (Extender Descripción)","value": "mistery"}
						,{"name": "mynameisjeff (Extender Descripción)","value": "mynameisjeff"}
						,{"name": "nononohahaha (Extender Descripción)","value": "nononohahaha"}
						,{"name": "nonononononono (Extender Descripción)","value": "nonononononono"}
						,{"name": "ogh (Extender Descripción)","value": "ogh"}
						,{"name": "ohvetealamierda (Extender Descripción)","value": "ohvetealamierda"}
						,{"name": "pffthahaha (Extender Descripción)","value": "pffthahaha"}
						,{"name": "pizzapasta (Extender Descripción)","value": "pizzapasta"}
						,{"name": "recordscratch (Extender Descripción)","value": "recordscratch"}
						,{"name": "reloadgun (Extender Descripción)","value": "reloadgun"}
						,{"name": "run (Extender Descripción)","value": "run"}
						,{"name": "science (Extender Descripción)","value": "science"}
						,{"name": "shutup (Extender Descripción)","value": "shutup"}
						,{"name": "shutyourbitchassup (Extender Descripción)","value": "shutyourbitchassup"}
					]
				}
				,{
					"name": "efectos3",
					"description": "Escoje un sonido de la lista",
					"type": 3,
					"required": false,
					"choices": [
							{"name": "snoring (Extender Descripción)","value": "snoring"}
						,{"name": "spinningcrystal (Extender Descripción)","value": "spinningcrystal"}
						,{"name": "supermariocoin (Extender Descripción)","value": "supermariocoin"}
						,{"name": "surprisemotherfucker (Extender Descripción)","value": "surprisemotherfucker"}
						,{"name": "swish (Extender Descripción)","value": "swish"}
						,{"name": "swish2 (Extender Descripción)","value": "swish2"}
						,{"name": "tiefighter (Extender Descripción)","value": "tiefighter"}
						,{"name": "titanicbad (Extender Descripción)","value": "titanicbad"}
						,{"name": "trabajo (Extender Descripción)","value": "trabajo"}
						,{"name": "trompeta (Extender Descripción)","value": "trompeta"}
						,{"name": "trompetaalarma (Extender Descripción)","value": "trompetaalarma"}
						,{"name": "unowenwasher (Extender Descripción)","value": "unowenwasher"}
						,{"name": "veetealamierda (Extender Descripción)","value": "veetealamierda"}
						,{"name": "vetealamierda (Extender Descripción)","value": "vetealamierda"}
						,{"name": "werror (Extender Descripción)","value": "werror"}
						,{"name": "whatisthat (Extender Descripción)","value": "whatisthat"}
						,{"name": "whosthatpokemon (Extender Descripción)","value": "whosthatpokemon"}
						,{"name": "wrongbuzzer (Extender Descripción)","value": "wrongbuzzer"}
						,{"name": "wtf (Extender Descripción)","value": "wtf"}
						,{"name": "yourmom (Extender Descripción)","value": "yourmom"}
						,{"name": "zelda (Extender Descripción)","value": "zelda"}
					]
				}
			]
		}
	}).then(()=>{console.log(guild.id+' ['+guild.name+'] Registered /sound')})
	.catch((error) => console.log(error));
	client.api.applications(client.user.id).guilds(guild.id).commands.post({
		data: {
			name: 'di',
			description: 'Dice la frase enviada',
			type: 3,
			"options": [
				{
					"name": "frase",
					"description": "La frase a decir",
					"type": 3,
					"required": true,
				}
			]
		}
	}).then(()=>{console.log(guild.id+' ['+guild.name+'] Registered /di')})
	.catch((error) => console.log(error));
	if (guilds[guild.id].hasTTSuntil>Math.floor(new Date().getTime() / 1000)) {
		client.api.applications(client.user.id).guilds(guild.id).commands.post({
			data: {
				name: 'dipremium',
				description: 'Dice la frase enviada utilizando servicio premium',
				type: 3,
				"options": [
					{
						"name": "frase",
						"description": "La frase a decir",
						"type": 3,
						"required": true
					}
				]
			}
		}).then(()=>{console.log(guild.id+' ['+guild.name+'] Registered /dipremium')})
		.catch((error) => console.log(error));
	}
	*/
}

client.on('guildCreate', guild => {
	loadGuild(guild);
})
client.on('guildDelete', guild => {
	console.log('He abandonado ' + guild.name);
})
client.on('error', () => {console.error});
client.on('ready', async () => {
	console.log(`Logged in as ${client.user.tag}!`);
	console.log('Retrieving guilds...');
	client.guilds.cache.forEach((guild) => {
		loadGuild(guild);
	});
	try {
		console.log('Started refreshing application (/) commands.');
		await rest.put(
			Routes.applicationCommands(client.user.id),
			{ body: comandos },
		);
		console.log('Successfully reloaded application (/) commands.');
	} catch (error) {
		console.error(error);
	}
	
});
client.on('voiceStateUpdate', async (oldState, newState) => {
	//console.log('oldState',util.inspect(oldState, {showHidden: false, depth: 0}));
	//console.log('newState',util.inspect(newState, {showHidden: false, depth: 0}));
	if (!guilds[newState.guild.id].enabled) {
		//estamos apagados no hay que hacer nada
		return false;
	}
	if (oldState!==null) {
		oldState.guild.members.fetch(oldState.id).then(async (member) => {
			//Habia un estado previo
			if (oldState.id==client.user.id) { //el viejo estado involucra a este bot
				//No hacemos nada cuando somos nosotros
			} else {
				if (newState.channelId===null||
					oldState.channelId!==null&&oldState.channelId!==newState.channelId
				) {
					// User leaves a voice channel // user changes voice chanel
					await client.channels.fetch(oldState.channelId).then(async function (channel) {
						await notifyChannel(oldState.guild,channel,member,'leave');
					}).catch( async (error) => {console.error; });
				}
				if (
					newState!==null
					&&guilds[newState.guild.id].sayStatus
					&&oldState.channelId===newState.channelId
				) {
					await client.channels.fetch(newState.channelId).then(async function (channel) {
						if (newState.serverDeaf!==oldState.serverDeaf) {
							if (newState.serverDeaf) {
								await notifyChannel(newState.guild,channel,member,'serverdeaf');
							} else {
								await notifyChannel(newState.guild,channel,member,'serverundeaf');
							}
						}
						if (newState.serverMute!==oldState.serverMute) {
							if (newState.serverMute) {
								await notifyChannel(newState.guild,channel,member,'servermute');
							} else {
								await notifyChannel(newState.guild,channel,member,'serverunmute');
							}
						}
						if (newState.selfDeaf!==oldState.selfDeaf) {
							if (newState.selfDeaf) {
								await notifyChannel(newState.guild,channel,member,'deaf');
							} else {
								await notifyChannel(newState.guild,channel,member,'undeaf');
							}
						}
						if (newState.selfMute!==oldState.selfMute) {
							if (newState.selfMute) {
								await notifyChannel(newState.guild,channel,member,'mute');
							} else {
								await notifyChannel(newState.guild,channel,member,'unmute');
							}
						}
						if (newState.streaming!==oldState.streaming) {
							if (newState.streaming) {
								await notifyChannel(newState.guild,channel,member,'stream');
							} else {
								await notifyChannel(newState.guild,channel,member,'endstream');
							}
						}
					}).catch( async (error) => {console.error; });
				}
			}
		}).catch( async (error) => {console.error; });
	}
	if (newState!==null) { //posible usuario entrando a un canal
		newState.guild.members.fetch(newState.id).then(async (member) => {
			if (newState.id==client.user.id) { //el nuevo estado involucra a este Bot
				if (newState.channelId===null) { //El nuevo estado significa que estamos desconectados
					guild_voice[newState.guild.id] = null; //Ponemos como nulo nuestro handler
					guild_voice_status[newState.guild.id] = false; //status es falso
				}
			} else {
				if (oldState!==null) { //existia un estado previo
					if (oldState.channelId==newState.channelId) {
						//el usuario no cambio de canal, nos quedamos calladitos y no hacemos nada
						return false;
					}
				}
				await client.channels.fetch(newState.channelId).then(async function (channel) {
					await notifyChannel(newState.guild,channel,member,'join');
				}).catch( async (error) => {console.error; });
			}
		}).catch( async (error) => {console.error; });
	}
});
client.on('stateChange', (oldState, newState) => {
	console.log(`Connection transitioned from ${oldState.status} to ${newState.status}`);
});
client.on('interactionCreate', async interaction => {
	if (!interaction.isCommand()) return;
	const comando = client.commands.get(interaction.commandName);
	if (!comando) return;
	try {
		await comando.execute(interaction);
	} catch (error) {
		console.error(error);
		await interaction.reply({ content: 'Ocurrio un error al ejecutar el comando', ephemeral: true });
	}
});

client.ws.on('INTERACTION_CREATEX', async interaction => {
	answer = 'UNKNOWN ERROR!';
	guild = await client.guilds.resolve(interaction.guild_id);
	/* establecer variables de uso común */
	var member = await guild.members.fetch(interaction.member.user.id).catch( async (error) => {
		console.log(error)
	});
	if (member===false) {
		return false;
	}
	let voiceChannel = null;
	if (member.voice.channelId!==null) {
		await client.channels.fetch(member.voice.channelId).then(function (channel) {
			voiceChannel = channel;
		}).catch( error => console.error );
	}
	switch (interaction.data.name) {
		case 'ping':
			answer = 'yamete kudasai ರ_ರ';
			break;
		case 'invite':
			answer = 'Puedes invitarme a tu servidor con https://discord.com/api/oauth2/authorize?client_id='+client.user.id+'&permissions=0&scope=applications.commands%20bot';
			break;
		case 'config':
			if (member.hasPermission('ADMINISTRATOR')) {
				for (i in interaction.data.options) {
					if (interaction.data.options[i].name=='enabled') {
						if (interaction.data.options[i].value) {
							answer = 'Ok saludaré a todos';
							guilds[guild.id].enabled = true;
							break;
						} else {
							answer = '😢 ok dejaré de saludar a todos';
							if (guild_voice[guild.id]!==null&&guild_voice[guild.id]!==undefined) {
								guild_voice[guild.id].disconnect();
								guild_voice_status[guild.id] = false;
							}
							guilds[guild.id].enabled = false;
							break;
						}
					}
					if (interaction.data.options[i].name=='names') {
						if (interaction.data.options[i].value) {
							answer = 'Ok mencionaré los nombres';
							guilds[guild.id].sayNames = true;
							break;
						} else {
							answer = 'Ok ya no mencionaré los nombres';
							guilds[guild.id].sayNames = false;
							break;
						}
					}
					if (interaction.data.options[i].name=='states') {
						if (interaction.data.options[i].value) {
							answer = 'Ok mencionaré los estado';
							guilds[guild.id].sayStatus = true;
							break;
						} else {
							answer = 'Ok ya no mencionaré los estado';
							guilds[guild.id].sayStatus = false;
							break;
						}
					}
				}
			} else {
				answer = 'no tienes privilegios de administrador';
			}
			break;
		case 'sound':
			for (i in interaction.data.options) {
				sound = null;
				if (
					  interaction.data.options[i].name=='efectos1'
					||interaction.data.options[i].name=='efectos2'
					||interaction.data.options[i].name=='efectos3'
					) {
					sound = interaction.data.options[i].value;
				}
				playSound(guild,voiceChannel,'./sounds/'+sound+'.ogg');
				answer = 'Correcto ('+sound+')';
				break;
			}
			break;
		case 'di':
			frase = null;
			for (i in interaction.data.options) {
				if (interaction.data.options[i].name=='frase') {
					frase = interaction.data.options[i].value;
				}
			}
			if (frase===null) {
				answer = 'Es necesario definir una frase!';
				break;
			}
			const textohablado = discordTTS.getVoiceStream(frase,'es-US');
			answer = 'Ok ('+frase+')';
			playSound(guild,voiceChannel,textohablado);
			break;
		case 'dipremium':
			frase = null;
			for (i in interaction.data.options) {
				if (interaction.data.options[i].name=='frase') {
					frase = interaction.data.options[i].value;
				}
			}
			if (frase===null) {
				answer = 'Es necesario definir una frase!';
				break;
			}
			if (guilds[guild.id].hasTTSuntil<Math.floor(new Date().getTime() / 1000)) {
				answer = 'Es necesario tener el privilegio premium para este servidor';
				break;
			}
			const playFile = await GeneraVoz(frase);
			answer = 'Correcto! ('+frase+')';
			playSound(guild,voiceChannel,playFile);
			break;
		default:
			answer = 'UNKNOWN COMMAND!';
			break;
	}
	client.api.interactions(interaction.id, interaction.token).callback.post({
		data: {
			type: 4,
			data: {
				content: answer
			}
		}
	});
});
process.on('SIGINT',async () => {
	console.log('Caught interrupt signal');
	for (const [guildID, voz] of Object.entries(guild_voice)) {
		console.log('GuildID '+guildID);
		if (voz!==null) {
			console.log('voz.status before',voz.status);
			console.log('Requesting voice disconnect.');
			await voz.disconnect();
			console.log('voz.status after',voz.status);
		}
	};
	process.exit(0);
});

console.log('Start...'); 

client.login(config.Token).catch(error => {console.log(error); console.log('reconnect');});