require('dotenv').config();
const { REST, Routes, SlashCommandBuilder, PermissionFlagsBits } = require('discord.js');

const commands = [
    new SlashCommandBuilder()
        .setName('assign')
        .setDescription('Assign a vehicle to a BeamMP player so they can spawn it')
        .addStringOption(opt => opt.setName('vehicle').setDescription('Vehicle model/JBeam name, e.g. etk800').setRequired(true))
        .addUserOption(opt => opt.setName('discord_user').setDescription('The Discord user (if already linked via #checkpoints)'))
        .addStringOption(opt => opt.setName('beam_username').setDescription('Raw BeamMP guest username, e.g. guest0324138'))
        .setDefaultMemberPermissions(PermissionFlagsBits.ManageGuild)
        .toJSON(),

    new SlashCommandBuilder()
        .setName('unassign')
        .setDescription('Remove a previously assigned vehicle from a BeamMP player')
        .addStringOption(opt => opt.setName('vehicle').setDescription('Vehicle model/JBeam name, e.g. etk800').setRequired(true))
        .addUserOption(opt => opt.setName('discord_user').setDescription('The Discord user (if already linked via #checkpoints)'))
        .addStringOption(opt => opt.setName('beam_username').setDescription('Raw BeamMP guest username, e.g. guest0324138'))
        .setDefaultMemberPermissions(PermissionFlagsBits.ManageGuild)
        .toJSON(),

    new SlashCommandBuilder()
        .setName('vehicles')
        .setDescription('List vehicles assigned to a BeamMP player')
        .addUserOption(opt => opt.setName('discord_user').setDescription('The Discord user (if already linked via #checkpoints)'))
        .addStringOption(opt => opt.setName('beam_username').setDescription('Raw BeamMP guest username, e.g. guest0324138'))
        .toJSON(),

    new SlashCommandBuilder()
        .setName('whois')
        .setDescription('Look up which Discord user a BeamMP guest name is linked to')
        .addStringOption(opt => opt.setName('beam_username').setDescription('Raw BeamMP guest username').setRequired(true))
        .toJSON(),

    new SlashCommandBuilder()
        .setName('link')
        .setDescription('Manually link a Discord user to a BeamMP guest username')
        .addUserOption(opt => opt.setName('discord_user').setDescription('The Discord user').setRequired(true))
        .addStringOption(opt => opt.setName('beam_username').setDescription('Raw BeamMP guest username').setRequired(true))
        .setDefaultMemberPermissions(PermissionFlagsBits.ManageGuild)
        .toJSON(),
];

const rest = new REST().setToken(process.env.DISCORD_TOKEN);

(async () => {
    try {
        console.log('Registering guild slash commands...');
        await rest.put(
            Routes.applicationGuildCommands(process.env.CLIENT_ID, process.env.GUILD_ID),
            { body: commands },
        );
        console.log('Done. Commands should appear in your server immediately.');
    } catch (err) {
        console.error(err);
    }
})();
