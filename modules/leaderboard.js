const Discord = require('discord.js');
const ow = require("../overwatchData");

const { Accounts, Leaderboards, Servers } = require("../dbObjects");
const Op = require('sequelize').Op;

module.exports.run = async (bot, message, args) => {
	if (args[0]) { //if the are an argument
		if (!message.member.hasPermission("ADMINISTRATOR")) return message.reply("you don't have permissions to do that.");
		if (args[0].toLowerCase() === 'enable') {  //and is 'enable'
			// and the summoner is an admin, sets the leaderboard data
			let canMultiple = false;
			if (args[1] && args[1] === 'multiple') {
				canMultiple = true;
			}

			const msg = await message.channel.send("Setting up leaderboard...");

			Servers.upsert({
				guild_id: message.guild.id,
				lbEnable: true,
				lbChannel: msg.channel.id,
				lbMsgId: msg.id,
				lbAllowMultiple: canMultiple
			});

			showLeaderboard(bot, message.guild.id);

			return await message.reply('The leaderboard has been set to this channel. '
				+ 'If you delete the first leaderboard message, you '
				+ 'will have yo set it up again. You can delete this one');
		} else if (args[0].toLowerCase() === 'disable') {	//and is 'disable'
			Servers.upsert({
				guild_id: message.guild.id,
				lbEnable: false
			});
			return await message.reply('The leaderboard has been disabled');
		} else return await message.reply('That does nothing');
	}

	const guild = await Servers.findByPk(message.guild.id);

	if (guild && guild.lbEnable == true) {
		message.delete();
		showLeaderboard(bot, guild.guild_id);
	} else {
		await message.reply('The leaderboard is not enabled');
	}
}

module.exports.update = async function () {
	const players = await Accounts.findAll();
	for (let i = 0; i < players.length; i++) {
		ow.fetchAPI(players[i].battleTag, players[i].platform, players[i].region).then((data) => {
			const ranks = ow.getRanks(data);
			Accounts.update({
				rankTANK: ranks.TANK,
				rankDAMAGE: ranks.DAMAGE,
				rankSUPPORT: ranks.SUPPORT },
				{ where: { battleTag: players[i].battleTag } });
			console.log("Updated", players[i].battleTag);
		}).catch((error) => {
			console.error(error);
			console.log("Cannot fetch " + players[i].battleTag);
		});
	}
};

module.exports.help = {
	name: "leaderboard",
	command: true,
	usage: "leaderboard	[enable/disable] [multiple]",
	description: "Enables or disables the leaderboard in the current channel. The leaderboard is updated every 20 minutes. With no arguments, just updates the leaderboard. 'multiple' allow one user to add more accounts"
}

function newPerson(username, rankTANK, rankDAMAGE, rankSUPPORT, btag) {
	const average = (rankTANK + rankDAMAGE + rankSUPPORT) / 3;
	return {
		username: username,
		ranks: {
			TANK: rankTANK,
			DAMAGE: rankDAMAGE,
			SUPPORT: rankSUPPORT
		},
		rankAverage: average,
		owusername: btag.replace('-', '#')
	};
}

async function showLeaderboard(bot, serverid) {
	let board = [];

	{
		const players = await Leaderboards.findAll({
			where: {
				guild_id: {
					[Op.eq]: serverid
				}
			},
			include: ['account']
		});
		for (let i = 0; i < players.length; i++) {
			const entry = newPerson(players[i].username,
				players[i].account.rankTANK,
				players[i].account.rankDAMAGE,
				players[i].account.rankSUPPORT,
				players[i].battleTag);
			
			if (entry.rankAverage != 0)
				board.push(entry);
		}
	}

	board.sort(function (a, b) { return a.rankAverage < b.rankAverage; });	//sort the leadeboard

	//console.log(board);

	let embed = new Discord.RichEmbed()	//create the embed and fill it
		.setAuthor(`${bot.guilds.get(serverid)} Overwatch Leaderboard`, 'https://vignette.wikia.nocookie.net/overwatch/images/c/cc/Competitive_Grandmaster_Icon.png/revision/latest?cb=20161122023845')
		.setColor('#F48642')
		.setTimestamp();

	let i, fieldName;
	for (i = 0; i < board.length; i++) {
		switch (i) {
			case 0:
				fieldName = '🥇';
				break;
			case 1:
				fieldName = '🥈';
				break;
			case 2:
				fieldName = '🥉';
				break;
			default:
				fieldName = `${i + 1}º`;
		}
		embed.addField(fieldName, ` 🛡${board[i].ranks.TANK || " - "}sr |  🔫${board[i].ranks.DAMAGE || " - "}sr | 💉${board[i].ranks.SUPPORT || " - "}sr |  **${board[i].owusername}** *(${board[i].username})*`);
	}
	embed.addBlankField();

	const guild = await Servers.findByPk(serverid);

	if (guild.lbMsgId) {	//if there is a message
		try {
			bot.guilds.get(serverid).channels.get(guild.lbChannel).fetchMessage(guild.lbMsgId).then(msg => msg.edit({ embed: embed })); //edit it
		} catch (error) {
			console.error(error);
			console.log('There was a problem finding the leaderboards message');
		}
	} else {
		console.log("ERROR: No leaderboard message");
	}

	console.log('Leaderboard updated succesfuly in server ' + serverid);
}

module.exports.showLeaderboard = showLeaderboard;
