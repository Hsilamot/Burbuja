const fs = require('fs');
const configjson = require('./config.json');
const environment = process.env.NODE_ENV || 'development';
const config = Object.assign(configjson['development'], configjson[environment]);
const util = require('util');
var crypto = require('crypto');
const Discord = require('discord.js');
const discordTTS = require('discord-tts');
const GoogleCloudTextToSpeech = require('@google-cloud/text-to-speech');
const { OpusEncoder } = require('@discordjs/opus');
const ObservableSlim = require('observable-slim');
const { getAudioDurationInSeconds } = require('get-audio-duration');
const client = new Discord.Client(config.DiscordClient);

const filterAdmins = (role) => {
	switch (role.id) {
		case '385651272331558914': return true;
		case '425098664915238923': return true;
		case '496439911117881365': return true;
		case '603787160755372032': return true;
		case '529088098999730206': return true;
	}
	return false;
}

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
	if (guild_voice[guild.id]!==null) {
		if (guild_voice[guild.id].channel.id!==channel.id) {
			await channel.join().then(async (voz) => {
				console.log('['+guild.name+'] SWITCHED --> '+channel.id+' ('+channel.name+')');
			}).catch( (error) => {
				console.log('['+guild.name+'] joinChannel ERROR',error);
				channel.leave();
			});
		}
	}
	if (guild_voice[guild.id]===null) {
		console.log('['+guild.name+'] JOIN --> '+channel.id+' ('+channel.name+')');
		await channel.join().then(async (voz) => {
			console.log('['+guild.name+'] '+channel.id+' ('+channel.name+') Binding...');
			voz.on('disconnect',disconnect => {
				console.log('['+guild.name+'] DISCONNECTED');
			});
			voz.on('newSession',newSession => {
				console.log('['+guild.name+'] newSession',newSession);
			});
			voz.on('reconnecting',reconnecting => {
				console.log('['+guild.name+'] MOVED TO '+voz.channel.id+' ('+voz.channel.name+')');
			});
			voz.on('warn',warn => {
				console.log('['+guild.name+'] warn',warn);
			});
			voz.on('failed',failed => {
				console.log('['+guild.name+'] failed',failed);
			});
			voz.on('authenticated',authenticated => {
				console.log('['+guild.name+'] authenticated',authenticated);
			});
			voz.on('error', error => {
				console.log('['+guild.name+'] error',error);
			});
			guild_voice[guild.id] = voz;
			guild_voice_status[guild.id] = false;
		}).catch( (error) => {
			console.log('['+guild.name+'] joinChannel ERROR',error);
			channel.leave();
		});
		console.log('['+guild.name+'] JOINED --> '+channel.id+' ('+channel.name+')');
	}
}

async function audioQueue(guild,queue) {
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
							reject('['+toPlay.guild.name+'] No object on voice!');
						}
					}, 750)
				}).catch( async (error) => {console.log(error); });
		guild_voice_queue_executing[guild.id] = false;
		audioQueue(guild,queue);
	}
}

async function playSound(guild,channel,sound) {
	var pendingPlay = {};
	pendingPlay.guild = guild;
	pendingPlay.channel = channel;
	pendingPlay.sound = sound;
	guild_voice_queue[guild.id].push(pendingPlay);
	audioQueue(guild,guild_voice_queue[guild.id]);
}

async function notifyChannel(guild,channel,member,joined) {
	/*
	if (
		guild_voice[guild.id]===null
		&&guild_voice_status[guild.id]==false
	) {
		guild_voice_status[guild.id] = true;
		await joinChannel(guild,channel);
	} else if (
		guild_voice[guild.id]!==null
		&&channel.id!==guild_voice[guild.id].channel.id
		&&guild_voice_status[guild.id]==false
	) {
		guild_voice_status[guild.id] = true;
		await joinChannel(guild,channel);
	}
	*/
	var nickname = member.nickname;
	if (nickname===null) {
		nickname = member.user.username;
	}
	if (joined) {
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
			const saludoFile = await GeneraVoz(saludo);
			playSound(guild,channel,saludoFile);
		}

		/*
		await new Promise((resolve,reject) => {
			setTimeout(() => {
				if (typeof guild_voice[guild.id]==='object'&&guild_voice[guild.id]!==null) {
					guild_voice[guild.id].play(sonido);
					playSound(guild,channel,sonido);
					console.log('Playing: '+sonido);
					setTimeout(() => {
						resolve('Played!');
					},1500);
				} else {
					reject('No object on voice!');
				}
			}, 750)
		}).catch( async (error) => {console.log(error); });
		*/
	} else {
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
			const saludoFile = await GeneraVoz(saludo);
			playSound(guild,channel,saludoFile);
		}
		/*
		await new Promise((resolve,reject) => {
			setTimeout(() => {
				if (typeof guild_voice[guild.id]==='object'&&guild_voice[guild.id]!==null) {
					guild_voice[guild.id].play(sonido);
					playSound(guild,channel,sonido);
					console.log('Playing: '+sonido);
					setTimeout(() => {
						resolve('Played!');
					},1500);
				} else {
					reject('No object on voice!');
				}
			}, 750)
		}).catch( async (error) => {console.log(error); });
		*/
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
					await notifyChannel(oldState.guild,channel,member,false);
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
				await notifyChannel(newState.guild,channel,member,true);
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
		case guilds[message.guild.id].prefix+'trabajo?':
			playSound(message.guild,voiceChannel,'./trabajo.ogg');
			break;
		case guilds[message.guild.id].prefix+'aracuan':
			playSound(message.guild,voiceChannel,'./sounds/aracuan.ogg');
			break;
		case guilds[message.guild.id].prefix+'hahaha':
			playSound(message.guild,voiceChannel,'./sounds/hahaha.ogg');
			break;
		case guilds[message.guild.id].prefix+'science':
			playSound(message.guild,voiceChannel,'./sounds/hahaha_science_is_hard.ogg');
			break;
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