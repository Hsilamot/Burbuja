const { SlashCommandBuilder } = require('@discordjs/builders');

module.exports = {
	data: new SlashCommandBuilder()
		.setName('ping')
		.setDescription('Prueba que el bot este funcionando'),
	async execute(interaction) {
		await interaction.reply('yamete kudasai ರ_ರ');
	},
};