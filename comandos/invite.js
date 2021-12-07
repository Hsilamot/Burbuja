const { SlashCommandBuilder } = require('@discordjs/builders');

module.exports = {
	data: new SlashCommandBuilder()
		.setName('invite')
		.setDescription('Invitame a tu servidor'),
	async execute(interaction) {
		await interaction.reply('Puedes invitarme a tu servidor con https://discord.com/api/oauth2/authorize?client_id='+client.user.id+'&permissions=0&scope=applications.commands%20bot');
	},
};