const fs = require('fs');
const util = require('util');
const Discord = require('discord.js');
const discordTTS = require('discord-tts');

const client = new Discord.Client({autoReconnect:true,retryLimit:Infinity});
const { OpusEncoder } = require('@discordjs/opus');
const ObservableSlim = require('observable-slim');

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

async function joinChannel(guildID,channelID) {
	if (guild_voice[guildID]!==null) {
		//console.log('There is a voice presence');
	}
	await client.channels.fetch(channelID).then(async function (channel) {
		//console.log('Requesting join to '+channel.id);
		await channel.join().then(async (voz) => {
			//console.log('joined '+voz.channel.id);
			if (guild_voice[guildID]===null) {
				voz.on('disconnect',connection => {
					guild_voice[guildID] = null;
					guild_voice_status[guildID] = false;
				});
				voz.on('error', () => {console.error});
			}
			guild_voice[guildID] = voz;
			guild_voice_status[guildID] = false;
			return true;
		}).catch(console.error);
	});
}

async function notifyChannel(guild,channel,member,joined) {
	if (
		guild_voice[newState.guild.id]===null
		&&newState.channelID!==null
		&&guild_voice_status[newState.guild.id]==false
	) {
		guild_voice_status[newState.guild.id] = true;
		await joinChannel(newState.guild.id,newState.channelID);
	} else if (
		guild_voice[newState.guild.id]!==null
		&&newState.channelID!==null
		&&newState.channelID!==guild_voice[newState.guild.id].channel.id
		&&guild_voice_status[newState.guild.id]==false
	) {
		guild_voice_status[newState.guild.id] = true;
		await joinChannel(newState.guild.id,newState.channelID);
	}
}

client.on('guildCreate', guild => {
	console.log('Me he unido a ' + guild.name);
	if (fs.existsSync('./guilds/'+guild.id+'.json')) {
		guilds_data[guild.id] = require('./guilds/'+guild.id+'.json');
	} else {
		guilds_data[guild.id] = require('./guilds/default.json');
	}
	guild_voice[guild.id] = null;
})
client.on('guildDelete', guild => {
	console.log('He abandonado ' + guild.name);
})
client.on('error', () => {console.error});
client.on('ready', () => {
	console.log(`Logged in as ${client.user.tag}!`);
	console.log('Retrieving guilds...');
	client.guilds.cache.forEach((guild) => {
		if (fs.existsSync('./guilds/'+guild.id+'.json')) {
			guilds_data[guild.id] = require('./guilds/'+guild.id+'.json');
		} else {
			guilds_data[guild.id] = require('./guilds/default.json');
		}
		guild_voice[guild.id] = null;
		guild_voice_status[guild.id] = false;
	});
});
client.on('voiceStateUpdate', async (oldState, newState) => {
	if (!guilds[newState.guild.id].enabled) {
		//estamos apagados no hay que hacer nada
		return false;
	}
	if (newState!==null) {
		if (newState.id==client.user.id) { //el nuevo estado involucra a este Bot
			if (newState.channelID===null) { //El nuevo estado significa que estamos desconectados
				guild_voice[newState.guild.id] = null; //Ponemos como nulo nuestro handler
				guild_voice_status[newState.guild.id] = false; //status es falso
			}
		} else {
			if (oldState!==null) {
				if (oldState.channelID==newState.channelID) {
					//el usuario no cambio de canal, nos quedamos calladitos y no hacemos nada
					return false;
				}
			}
			await client.channels.fetch(newState.channelID).then(async function (channel) {
				var member = await newState.guild.members.fetch(newState.id).catch( async (error) => {console.error; });
				notifyChannel(newState.guild,channel,member,true);
			});
			if (guild_voice[newState.guild.id]!==null&&newState.channelID==guild_voice[newState.guild.id].channel.id) {
				// User Joins a voice channel



				var nickname = newState.guild.members.cache.get(newState.id).nickname;
				if (nickname===null) {
					nickname = newState.guild.members.cache.get(newState.id).user.username;
				}
				console.log('['+newState.guild.name+']'+nickname+' se ha unido al canal... Diciendo "Hola!"...');
				var sonido = '';
				switch (newState.id) {
					case '436724739868721153': //Zeus
						sonido = './sounds/join_zeus.ogg'; break;
					case '538464306539528192': //NikoSan
						sonido = './sounds/join_niko.ogg'; break;
					case '358776832536870913': //Taquero
						sonido = './sounds/join_taquero.ogg'; break;
					case '468956439528996864': //Dayreff
						sonido = './sounds/join_dayreff.ogg'; break;
					case '329392035658465281': //Draxen
						switch (Math.floor(Math.random() * Math.floor(2))) {
							case  0: sonido = './sounds/join_draxen.ogg'; break;
							case  1: sonido = './sounds/join_draxen2.ogg'; break;
						}
						break;
					case '279786562089254912': //Liontzuky
						switch (Math.floor(Math.random() * Math.floor(2))) {
							case  0: sonido = './sounds/join_liontzuky.ogg'; break;
							case  1: sonido = './sounds/join_liontzuky2.ogg'; break;
						}
						break;
					default:
						sonido = './sounds/join_default.ogg';
				}
				setTimeout(() => guild_voice[newState.guild.id].play(sonido), 750);
			}
		}
	}
	if (oldState!==null) {
		//El anterior estado tiene que no ser nulo pues debería haber estado conectado a casual antes
		if (guild_voice[newState.guild.id]!==null&&oldState.channelID==guild_voice[newState.guild.id].channel.id) { //Es el canal en el que esta el bot
			if (newState===null||newState.channelID!=guild_voice[newState.guild.id].channel.id) {
				// User leaves a voice channel
				var nickname = oldState.guild.members.cache.get(oldState.id).nickname;
				if (nickname===null) {
					nickname = oldState.guild.members.cache.get(oldState.id).user.username;
				}
				console.log('['+newState.guild.name+']'+nickname+' ha abandonado el canal... Diciendo "Adiós!"...');
				var sonido = '';
				switch (newState.id) {
					case '468956439528996864': //Dayreff
						sonido = './sounds/leave_dayreff.ogg'; break;
					case '436724739868721153': //Zeus
					case '538464306539528192': //NikoSan
					case '358776832536870913': //Taquero
					default:
						sonido = './sounds/leave_default.ogg';
				}
				setTimeout(() => guild_voice[newState.guild.id].play(sonido), 750);
			}
		}
	}
});
client.on('message', message => {
	if (!message.guild) return;
	// command processing
	procesar = message.content.split(' ');
	command = procesar[0];
	procesar.shift();
	parameter = procesar.join(' ');
	if (command.length>0) {
		var member = message.channel.guild.members.cache.get(message.author.id);
	}
	switch (command.toLowerCase()) {
		case guilds[message.guild.id].prefix+'burbuja':
			quickBotReply(message,'Puedes invitarme a tu servidor con https://discord.com/oauth2/authorize?client_id=724218726190415902&scope=bot %s',parameter,'<@'+message.author.id+'>');
			break;
		case guilds[message.guild.id].prefix+'trabajo':
		case guilds[message.guild.id].prefix+'trabajo?':
			guild_voice[message.guild.id].play('./trabajo.ogg');
			break;
		case guilds[message.guild.id].prefix+'di':
			if (guild_voice[message.guild.id]!==null) {
				const textohablado = discordTTS.getVoiceStream(parameter,'es-US');
				quickBotReply(message,'Ok %s!','<@'+message.author.id+'>');
				guild_voice[message.guild.id].play(textohablado);
			} else {
				quickBotReply(message,'Necesito estar en un canal %s!','<@'+message.author.id+'>');
			}
			break;
	}
	if (message.member!==null&&message.member.hasPermission('ADMINISTRATOR')) {
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
		}
	}
});
process.on('SIGINT',async () => {
	console.log('Caught interrupt signal');
	for (const [guildID, voz] of Object.entries(guild_voice)) {
		console.log('GuildID '+guildID);
		if (voz!==null) {
			console.log('Requesting voice disconnect.');
			console.log(voz);
			await voz.disconnect();
		}
	};
	process.exit(0);
});

console.log('Start...'); 

client.login('NzI0MjE4NzI2MTkwNDE1OTAy.Xu8_WQ.4AyQKAbuG6TEGd_ku9527KjqCyY').catch(error => {console.error; console.log('reconnect'); connect(client)});