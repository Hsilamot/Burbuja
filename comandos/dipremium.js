const { SlashCommandBuilder } = require('@discordjs/builders');

module.exports = {
	data: new SlashCommandBuilder()
		.setName('dipremium')
		.setDescription('Dice la frase enviada utilizando el servicio premium')
		.addStringOption(option => option
			.setName('frase')
			.setDescription('La frase a decir')
			.setRequired(true)),
	async execute(interaction, { GeneraVoz, playSound, guilds }) {
		const guild = interaction.guild;
		const frase = interaction.options.getString('frase', true).trim();
		const voiceChannel = interaction.member?.voice?.channel;

		if (!guild || !guilds[guild.id]) {
			await interaction.reply({ content: 'No fue posible cargar la configuracion del servidor.', ephemeral: true });
			return;
		}
		if (!voiceChannel) {
			await interaction.reply({ content: 'Debes estar en un canal de voz para usar este comando.', ephemeral: true });
			return;
		}
		if (!frase) {
			await interaction.reply({ content: 'Es necesario definir una frase.', ephemeral: true });
			return;
		}
		const premiumUntil = Number(guilds[guild.id].hasTTSuntil) || 0;
		if (premiumUntil < Math.floor(Date.now() / 1000)) {
			await interaction.reply({ content: 'Es necesario tener el privilegio premium para este servidor.', ephemeral: true });
			return;
		}

		await interaction.deferReply();
		const playFile = await GeneraVoz(frase);
		if (!playFile) {
			await interaction.editReply('No fue posible generar la voz en este momento.');
			return;
		}

		await playSound(guild, voiceChannel, playFile);
		await interaction.editReply('Correcto! ('+frase+')');
	},
};
