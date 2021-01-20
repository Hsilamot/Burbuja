const fs = require('fs');
const configjson = require('./config.json');
const environment = process.env.NODE_ENV || 'development';
const config = Object.assign(configjson['development'], configjson[environment]);
const util = require('util');
var crypto = require('crypto');
const Discord = require('discord.js');
const discordTTS = require('discord-tts');
const GoogleCloudTextToSpeech = require('@google-cloud/text-to-speech');
const ObservableSlim = require('observable-slim');
const { getAudioDurationInSeconds } = require('get-audio-duration');
const client = new Discord.Client(config.DiscordClient);
var touch = require("touch")

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
	return new Promise(async (resolve,reject) => {
		if (guild_voice[guild.id]!==null) {
			if (guild_voice[guild.id].channel.id!==channel.id) {
				await channel.join().then(async (voz) => {
					console.log('['+guild.name+'] SWITCHED --> '+channel.id+' ('+channel.name+')');
					setTimeout(() => {
						resolve('Connected!');
					},500);
				}).catch( (error) => {
					console.log('['+guild.name+'] joinChannel ERROR ON SWITCH',error);
					channel.leave();
					setTimeout(() => {
						reject('Error on Join!');
					},200);
				});
			} else {
				resolve('Already Connected!');
			}
		}
		if (guild_voice[guild.id]===null) {
			console.log('['+guild.name+'] JOIN --> '+channel.id+' ('+channel.name+')');
			await channel.join().then(async (voz) => {
				console.log('['+guild.name+'] '+channel.id+' ('+channel.name+') Binding...');
				voz.on('disconnect',disconnect => {
					console.log('['+guild.name+'] voz.DISCONNECTED');
				});
				voz.on('newSession',newSession => {
					console.log('['+guild.name+'] voz.newSession',newSession);
				});
				voz.on('reconnecting',reconnecting => {
					console.log('['+guild.name+'] voz.MOVED TO '+voz.channel.id+' ('+voz.channel.name+')');
				});
				voz.on('warn',warn => {
					console.log('['+guild.name+'] voz.warn',warn);
				});
				voz.on('failed',failed => {
					console.log('['+guild.name+'] voz.failed',failed);
				});
				voz.on('authenticated',authenticated => {
					console.log('['+guild.name+'] voz.authenticated',authenticated);
				});
				voz.on('ready', error => {
					resolve('Voz Ready!');
				});
				voz.on('error', error => {
					console.log('['+guild.name+'] voz.error',error);
				});
				guild_voice[guild.id] = voz;
				guild_voice_status[guild.id] = false;
				setTimeout(() => {
					resolve('Connected!');
				},500);
			}).catch( (error) => {
				if (error=='Error [VOICE_JOIN_CHANNEL]: You do not have permission to join this voice channel.') {
					guilds[guild.id].enabled = false;
					console.log('['+guild.name+'] Channel Join Access Denied: Disabling bot!');
					guild_voice_queue[guild.id] = [];
				} else {
					console.log('['+guild.name+'] joinChannel Unknown Error: ',error);
				}
				channel.leave();
				setTimeout(() => {
					reject('Error on Join!');
				},200);
			});
			console.log('['+guild.name+'] JOINED --> '+channel.id+' ('+channel.name+')');
		}
	});
}

async function audioQueue(guild,queue) {
	if (!guilds[guild.id].enabled) { return false; }
	if (guild_voice_queue_executing[guild.id]===false) {
		guild_voice_queue_executing[guild.id] = true;
		let toPlay = queue.shift();
		if (toPlay===undefined) {
			guild_voice_queue_executing[guild.id] = false;
			return false;
		}
		let audioLength = 0;
		await joinChannel(toPlay.guild,toPlay.channel);
		await getAudioDurationInSeconds(toPlay.sound).then(duration => audioLength = duration);
		await new Promise((resolve,reject) => {
					setTimeout(() => {
						if (typeof guild_voice[toPlay.guild.id]==='object'&&guild_voice[toPlay.guild.id]!==null) {
							guild_voice[toPlay.guild.id].play(toPlay.sound);
							console.log('['+toPlay.guild.name+'] '+guild_voice[toPlay.guild.id].channel.id+' ('+guild_voice[toPlay.guild.id].channel.name+') Playing: '+toPlay.sound);
							setTimeout(() => {
								resolve('Played!');
							},(audioLength*1000));
						} else {
							queue.unshift(toPlay);
							reject('['+toPlay.guild.name+'] No object on voice!');
						}
					}, 150)
				}).catch( async (error) => {console.log(error); });
		guild_voice_queue_executing[guild.id] = false;
		audioQueue(guild,queue);
	}
}

async function playSound(guild,channel,sound) {
	if (!guilds[guild.id].enabled) { return false; }
	var pendingPlay = {};
	pendingPlay.guild = guild;
	pendingPlay.channel = channel;
	pendingPlay.sound = sound;
	guild_voice_queue[guild.id].push(pendingPlay);
	audioQueue(guild,guild_voice_queue[guild.id]);
}

async function notifyChannel(guild,channel,member,type) {
	var nickname = member.nickname;
	if (nickname===null) {
		nickname = member.user.username;
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

client.on('guildCreate', guild => {
	console.log('Me he unido a ' + guild.name);
	const defaultGuildConfig = require('./guilds/default.json');
	if (fs.existsSync('./guilds/'+guild.id+'.json')) {
		guilds_data[guild.id] = Object.assign({}, defaultGuildConfig);
		guilds_data[guild.id] = Object.assign(guilds_data[guild.id], require('./guilds/'+guild.id+'.json'));
	} else {
		guilds_data[guild.id] = require('./guilds/default.json');
	}
	guild_voice[guild.id] = null;
	guild_voice_queue[guild.id] = [];
	guild_voice_queue_executing[guild.id] = false;
	guild_voice_status[guild.id] = false;
})
client.on('guildDelete', guild => {
	console.log('He abandonado ' + guild.name);
})
client.on('error', () => {console.error});
client.on('ready', () => {
	console.log(`Logged in as ${client.user.tag}!`);
	console.log('Retrieving guilds...');
	const defaultGuildConfig = require('./guilds/default.json');
	client.guilds.cache.forEach((guild) => {
		console.log('Loading... ./guilds/'+guild.id+'.json ['+guild.name+']');
		if (fs.existsSync('./guilds/'+guild.id+'.json')) {
			guilds_data[guild.id] = Object.assign({}, defaultGuildConfig);
			guilds_data[guild.id] = Object.assign(guilds_data[guild.id], require('./guilds/'+guild.id+'.json'));
		} else {
			guilds_data[guild.id] = require('./guilds/default.json');
		}
		guild_voice[guild.id] = null;
		guild_voice_queue[guild.id] = [];
		guild_voice_queue_executing[guild.id] = false;
		guild_voice_status[guild.id] = false;
	});
});
client.on('voiceStateUpdate', async (oldState, newState) => {
	if (!guilds[newState.guild.id].enabled) {
		//estamos apagados no hay que hacer nada
		return false;
	}
	if (oldState!==null) {
		//Habia un estado previo
		if (oldState.id==client.user.id) { //el viejo estado involucra a este bot
			//No hacemos nada cuando somos nosotros
		} else {
			if (newState===null||oldState.channelID!=newState.channelID) {
				// User leaves a voice channel // user changes voice chanel
				await client.channels.fetch(oldState.channelID).then(async function (channel) {
					var member = await oldState.guild.members.fetch(oldState.id).catch( async (error) => {console.error; });
					await notifyChannel(oldState.guild,channel,member,'leave');
				}).catch( async (error) => {console.error; });
			}
			if (newState!==null&&guilds[newState.guild.id].sayStatus) {
				await client.channels.fetch(newState.channelID).then(async function (channel) {
					var member = await newState.guild.members.fetch(newState.id).catch( async (error) => {console.error; });
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
	}
	if (newState!==null) { //posible usuario entrando a un canal
		if (newState.id==client.user.id) { //el nuevo estado involucra a este Bot
			if (newState.channelID===null) { //El nuevo estado significa que estamos desconectados
				guild_voice[newState.guild.id] = null; //Ponemos como nulo nuestro handler
				guild_voice_status[newState.guild.id] = false; //status es falso
			}
		} else {
			if (oldState!==null) { //existia un estado previo
				if (oldState.channelID==newState.channelID) {
					//el usuario no cambio de canal, nos quedamos calladitos y no hacemos nada
					return false;
				}
			}
			await client.channels.fetch(newState.channelID).then(async function (channel) {
				var member = await newState.guild.members.fetch(newState.id).catch( async (error) => {console.error; });
				await notifyChannel(newState.guild,channel,member,'join');
			}).catch( async (error) => {console.error; });
		}
	}
});
client.on('message', async message => {
	if (!message.guild) return;
	/* establecer variables de uso común */
	var member = await message.channel.guild.members.fetch(message.author.id).catch( async (error) => {
		return false;
	});
	if (member===false) {
		return false;
	}
	let voiceChannel = null;
	if (member.voice.channelID!==null) {
		await client.channels.fetch(member.voice.channelID).then(function (channel) {
			voiceChannel = channel;
		}).catch( error => console.error );
	}

	// command processing
	procesar = message.content.split(' ');
	command = procesar[0];
	procesar.shift();
	parameter = procesar.join(' ');
	switch (command.toLowerCase()) {
		case guilds[message.guild.id].prefix+'burbuja':
			quickBotReply(message,'Puedes invitarme a tu servidor con https://discord.com/oauth2/authorize?client_id=724218726190415902&scope=bot %s',parameter,'<@'+message.author.id+'>');
			break;
		case guilds[message.guild.id].prefix+'trabajo':
		case guilds[message.guild.id].prefix+'trabajo?': playSound(message.guild,voiceChannel,'./trabajo.ogg'); break;
		case guilds[message.guild.id].prefix+'aracuan': playSound(message.guild,voiceChannel,'./sounds/aracuan.ogg'); break;
		case guilds[message.guild.id].prefix+'hahaha': playSound(message.guild,voiceChannel,'./sounds/hahaha.ogg'); break;
		case guilds[message.guild.id].prefix+'science': playSound(message.guild,voiceChannel,'./sounds/hahaha_science_is_hard.ogg'); break;
		case guilds[message.guild.id].prefix+'anotherfag': playSound(message.guild,voiceChannel,'./sounds/anotherfag.ogg'); break;
		case guilds[message.guild.id].prefix+'badumtss': playSound(message.guild,voiceChannel,'./sounds/badumtss.ogg'); break;
		case guilds[message.guild.id].prefix+'crybaby': playSound(message.guild,voiceChannel,'./sounds/crybaby.ogg'); break;
		case guilds[message.guild.id].prefix+'bokusatchii': playSound(message.guild,voiceChannel,'./sounds/bokusatchii.ogg'); break;
		case guilds[message.guild.id].prefix+'brokenglass': playSound(message.guild,voiceChannel,'./sounds/brokenglass.ogg'); break;
		case guilds[message.guild.id].prefix+'ogh': playSound(message.guild,voiceChannel,'./sounds/ogh.ogg'); break;
		case guilds[message.guild.id].prefix+'catscreaming': playSound(message.guild,voiceChannel,'./sounds/catscreaming.ogg'); break;
		case guilds[message.guild.id].prefix+'cryofthehawk': playSound(message.guild,voiceChannel,'./sounds/cryofthehawk.ogg'); break;
		case guilds[message.guild.id].prefix+'gunshot': playSound(message.guild,voiceChannel,'./sounds/gunshot.ogg'); break;
		case guilds[message.guild.id].prefix+'recordscratch': playSound(message.guild,voiceChannel,'./sounds/recordscratch.ogg'); break;
		case guilds[message.guild.id].prefix+'facebookspam': playSound(message.guild,voiceChannel,'./sounds/facebookspam.ogg'); break;
		case guilds[message.guild.id].prefix+'cuacuacua': playSound(message.guild,voiceChannel,'./sounds/cuacuacua.ogg'); break;
		case guilds[message.guild.id].prefix+'mexicanfanfarrias': playSound(message.guild,voiceChannel,'./sounds/mexicanfanfarrias.ogg'); break;
		case guilds[message.guild.id].prefix+'fuckyou': playSound(message.guild,voiceChannel,'./sounds/fuckyou.ogg'); break;
		case guilds[message.guild.id].prefix+'fightsounds': playSound(message.guild,voiceChannel,'./sounds/fightsounds.ogg'); break;
		case guilds[message.guild.id].prefix+'eslomasestupido': playSound(message.guild,voiceChannel,'./sounds/eslomasestupido.ogg'); break;
		case guilds[message.guild.id].prefix+'jajaja': playSound(message.guild,voiceChannel,'./sounds/jajaja.ogg'); break;
		case guilds[message.guild.id].prefix+'jejeje': playSound(message.guild,voiceChannel,'./sounds/jejeje.ogg'); break;
		case guilds[message.guild.id].prefix+'jijiji': playSound(message.guild,voiceChannel,'./sounds/jijiji.ogg'); break;
		case guilds[message.guild.id].prefix+'nononohahaha': playSound(message.guild,voiceChannel,'./sounds/nononohahaha.ogg'); break;
		case guilds[message.guild.id].prefix+'wrongbuzzer': playSound(message.guild,voiceChannel,'./sounds/wrongbuzzer.ogg'); break;
		case guilds[message.guild.id].prefix+'abathurscream': playSound(message.guild,voiceChannel,'./sounds/abathurscream.ogg'); break;
		case guilds[message.guild.id].prefix+'gotchabitch': playSound(message.guild,voiceChannel,'./sounds/gotchabitch.ogg'); break;
		case guilds[message.guild.id].prefix+'reloadgun': playSound(message.guild,voiceChannel,'./sounds/reloadgun.ogg'); break;
		case guilds[message.guild.id].prefix+'gyaaaaaaa': playSound(message.guild,voiceChannel,'./sounds/gyaaaaaaa.ogg'); break;
		case guilds[message.guild.id].prefix+'maniaclaugh': playSound(message.guild,voiceChannel,'./sounds/maniaclaugh.ogg'); break;
		case guilds[message.guild.id].prefix+'headshot': playSound(message.guild,voiceChannel,'./sounds/headshot.ogg'); break;
		case guilds[message.guild.id].prefix+'helpme': playSound(message.guild,voiceChannel,'./sounds/helpme.ogg'); break;
		case guilds[message.guild.id].prefix+'horrorscream': playSound(message.guild,voiceChannel,'./sounds/horrorscream.ogg'); break;
		case guilds[message.guild.id].prefix+'inception': playSound(message.guild,voiceChannel,'./sounds/inception.ogg'); break;
		case guilds[message.guild.id].prefix+'johncena': playSound(message.guild,voiceChannel,'./sounds/johncena.ogg'); break;
		case guilds[message.guild.id].prefix+'lol': playSound(message.guild,voiceChannel,'./sounds/lol.ogg'); break;
		case guilds[message.guild.id].prefix+'dundundun': playSound(message.guild,voiceChannel,'./sounds/dundundun.ogg'); break;
		case guilds[message.guild.id].prefix+'clickclick': playSound(message.guild,voiceChannel,'./sounds/clickclick.ogg'); break;
		case guilds[message.guild.id].prefix+'mynameisjeff': playSound(message.guild,voiceChannel,'./sounds/mynameisjeff.ogg'); break;
		case guilds[message.guild.id].prefix+'mistery': playSound(message.guild,voiceChannel,'./sounds/mistery.ogg'); break;
		case guilds[message.guild.id].prefix+'pizzapasta': playSound(message.guild,voiceChannel,'./sounds/pizzapasta.ogg'); break;
		case guilds[message.guild.id].prefix+'letmeout': playSound(message.guild,voiceChannel,'./sounds/letmeout.ogg'); break;
		case guilds[message.guild.id].prefix+'run': playSound(message.guild,voiceChannel,'./sounds/run.ogg'); break;
		case guilds[message.guild.id].prefix+'madscream': playSound(message.guild,voiceChannel,'./sounds/madscream.ogg'); break;
		case guilds[message.guild.id].prefix+'shutup': playSound(message.guild,voiceChannel,'./sounds/shutup.ogg'); break;
		case guilds[message.guild.id].prefix+'shutyourbitchassup': playSound(message.guild,voiceChannel,'./sounds/shutyourbitchassup.ogg'); break;
		case guilds[message.guild.id].prefix+'snoring': playSound(message.guild,voiceChannel,'./sounds/snoring.ogg'); break;
		case guilds[message.guild.id].prefix+'mexicanscanner': playSound(message.guild,voiceChannel,'./sounds/mexicanscanner.ogg'); break;
		case guilds[message.guild.id].prefix+'veetealamierda': playSound(message.guild,voiceChannel,'./sounds/veetealamierda.ogg'); break;
		case guilds[message.guild.id].prefix+'vetealamierda': playSound(message.guild,voiceChannel,'./sounds/vetealamierda.ogg'); break;
		case guilds[message.guild.id].prefix+'ahvetealamierda': playSound(message.guild,voiceChannel,'./sounds/ahvetealamierda.ogg'); break;
		case guilds[message.guild.id].prefix+'nonononononono': playSound(message.guild,voiceChannel,'./sounds/nonononononono.ogg'); break;
		case guilds[message.guild.id].prefix+'ohvetealamierda': playSound(message.guild,voiceChannel,'./sounds/ohvetealamierda.ogg'); break;
		case guilds[message.guild.id].prefix+'spinningcrystal': playSound(message.guild,voiceChannel,'./sounds/spinningcrystal.ogg'); break;
		case guilds[message.guild.id].prefix+'pffthahaha': playSound(message.guild,voiceChannel,'./sounds/pffthahaha.ogg'); break;
		case guilds[message.guild.id].prefix+'supermariocoin': playSound(message.guild,voiceChannel,'./sounds/supermariocoin.ogg'); break;
		case guilds[message.guild.id].prefix+'surprisemotherfucker': playSound(message.guild,voiceChannel,'./sounds/surprisemotherfucker.ogg'); break;
		case guilds[message.guild.id].prefix+'swish2': playSound(message.guild,voiceChannel,'./sounds/swish2.ogg'); break;
		case guilds[message.guild.id].prefix+'swish': playSound(message.guild,voiceChannel,'./sounds/swish.ogg'); break;
		case guilds[message.guild.id].prefix+'tiefighter': playSound(message.guild,voiceChannel,'./sounds/tiefighter.ogg'); break;
		case guilds[message.guild.id].prefix+'titanicbad': playSound(message.guild,voiceChannel,'./sounds/titanicbad.ogg'); break;
		case guilds[message.guild.id].prefix+'trompetaalarma': playSound(message.guild,voiceChannel,'./sounds/trompetaalarma.ogg'); break;
		case guilds[message.guild.id].prefix+'trompeta': playSound(message.guild,voiceChannel,'./sounds/trompeta.ogg'); break;
		case guilds[message.guild.id].prefix+'unowenwasher': playSound(message.guild,voiceChannel,'./sounds/unowenwasher.ogg'); break;
		case guilds[message.guild.id].prefix+'whatisthat': playSound(message.guild,voiceChannel,'./sounds/whatisthat.ogg'); break;
		case guilds[message.guild.id].prefix+'whosthatpokemon': playSound(message.guild,voiceChannel,'./sounds/whosthatpokemon.ogg'); break;
		case guilds[message.guild.id].prefix+'werror': playSound(message.guild,voiceChannel,'./sounds/werror.ogg'); break;
		case guilds[message.guild.id].prefix+'bruh': playSound(message.guild,voiceChannel,'./sounds/bruh.ogg'); break;
		case guilds[message.guild.id].prefix+'wtf': playSound(message.guild,voiceChannel,'./sounds/wtf.ogg'); break;
		case guilds[message.guild.id].prefix+'yourmom': playSound(message.guild,voiceChannel,'./sounds/yourmom.ogg'); break;
		case guilds[message.guild.id].prefix+'zelda': playSound(message.guild,voiceChannel,'./sounds/zelda.ogg'); break;
		case guilds[message.guild.id].prefix+'di':
			if (guild_voice[message.guild.id]!==null) {
				const textohablado = discordTTS.getVoiceStream(parameter,'es-US');
				quickBotReply(message,'Ok %s!','<@'+message.author.id+'>');
				playSound(message.guild,voiceChannel,textohablado);
			} else {
				quickBotReply(message,'Necesito estar en un canal %s!','<@'+message.author.id+'>');
			}
			break;
		case guilds[message.guild.id].prefix+'dipremium':
			if (guild_voice[message.guild.id]!==null) {
				if (guilds[message.guild.id].hasTTSuntil>Math.floor(new Date().getTime() / 1000)) {
					const playFile = await GeneraVoz(parameter);
					quickBotReply(message,'Ok %s!','<@'+message.author.id+'>');
					playSound(message.guild,voiceChannel,playFile);
				} else {
					quickBotReply(message,'Es necesario tener el privilegio premium para este servidor %s!','<@'+message.author.id+'>');
				}
			} else {
				quickBotReply(message,'Necesito estar en un canal %s!','<@'+message.author.id+'>');
			}
			break;
	}
	if (member.hasPermission('ADMINISTRATOR')) {
	//if (message.member!==null&&message.member.hasPermission('ADMINISTRATOR')) {
		switch (command.toLowerCase()) {
			case 'dumpcomnfig2020':
				quickBotReply(message,'Actualmente: '+JSON.stringify(guilds[message.guild.id]));
				break;
			case 'dumpvoicecurrent2020':
				quickBotReply(message,'VOZ CURRENT: TypeError: Converting circular structure to JSON');
				break;
			case 'rem':
				if (parameter.length>0) {
					quickBotReply(message,'SUCCESSFUL');
				}
				break;
			case guilds[message.guild.id].prefix+'audioQueue':
				console.log('['+toPlay.guild.name+'] Manual audioQueue()');
				audioQueue(guild,guild_voice_queue[guild.id]);
				break;
			case guilds[message.guild.id].prefix+'prefix':
				if (parameter.length>0) {
					quickBotReply(message,'He cambiado mi prefix a %s, %s',parameter,'<@'+message.author.id+'>');
					guilds[message.guild.id].prefix = parameter.toLowerCase();
				} else {
					quickBotReply(message,'El prefix tiene que ser de al menos 1 carácter %s','<@'+message.author.id+'>');
				}
				break;
			case guilds[message.guild.id].prefix+'encender':
				quickBotReply(message,'Ok saludaré a todos %s!','<@'+message.author.id+'>');
				guilds[message.guild.id].enabled = true;
				break;
			case guilds[message.guild.id].prefix+'apagar':
				quickBotReply(message,'😢 ok dejaré de saludar a todos %s!','<@'+message.author.id+'>');
				if (guild_voice[message.guild.id]!==null&&guild_voice[message.guild.id]!==undefined) {
					guild_voice[message.guild.id].disconnect();
					guild_voice_status[message.guild.id] = false;
				}
				guilds[message.guild.id].enabled = false;
				break;
			case guilds[message.guild.id].prefix+'connombre':
				quickBotReply(message,'Ok mencionaré los nombres %s!','<@'+message.author.id+'>');
				guilds[message.guild.id].sayNames = true;
				break;
			case guilds[message.guild.id].prefix+'sinnombre':
				quickBotReply(message,'Ok ya no mencionaré los nombres %s!','<@'+message.author.id+'>');
				guilds[message.guild.id].sayNames = false;
				break;
			case guilds[message.guild.id].prefix+'conestado':
				quickBotReply(message,'Ok mencionaré los estado %s!','<@'+message.author.id+'>');
				guilds[message.guild.id].sayStatus = true;
				break;
			case guilds[message.guild.id].prefix+'sinestado':
				quickBotReply(message,'Ok ya no mencionaré los estado %s!','<@'+message.author.id+'>');
				guilds[message.guild.id].sayStatus = false;
				break;
		}
	}
});
process.on('SIGINT',async () => {
	console.log('Caught interrupt signal');
	for (const [guildID, voz] of Object.entries(guild_voice)) {
		console.log('GuildID '+guildID);
		if (voz!==null) {
			console.log('Requesting voice disconnect.');
			await voz.disconnect();
		}
	};
	process.exit(0);
});

console.log('Start...'); 

client.login(config.Token).catch(error => {console.log(error); console.log('reconnect');});