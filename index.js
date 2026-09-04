require('dotenv').config();
const express = require('express');
const {
    Client,
    GatewayIntentBits,
    PermissionFlagsBits,
} = require('discord.js');
const store = require('./store');

const DISCORD_TOKEN = process.env.DISCORD_TOKEN;
const CHECKPOINTS_CHANNEL_ID = process.env.CHECKPOINTS_CHANNEL_ID;
const API_PORT = process.env.API_PORT || 3000;

const client = new Client({
    intents: [
        GatewayIntentBits.Guilds,
        GatewayIntentBits.GuildMessages,
        GatewayIntentBits.MessageContent,
    ],
});

// ---------------------------------------------------------------------------
// #checkpoints parsing — this is how we figure out which Discord user is
// behind a given BeamMP guest name. We only LINK identities here now; vehicle
// access is entirely controlled by /assign and /unassign.
// ---------------------------------------------------------------------------
function parseLogMessage(content, messageMentions) {
    if (!content) return null;

    const regex = /([a-zA-Z0-9_]+)\s+connected\.\s+Discord Profile:\s*(.*)/i;
    const match = content.match(regex);
    if (!match) return null;

    const beamUsername = match[1];
    let discordRaw = match[2].trim().replace(/\.$/, '');
    let discordId = null;

    if (messageMentions && messageMentions.users && messageMentions.users.size > 0) {
        const mentionedUser = messageMentions.users.first();
        discordId = mentionedUser.id;
        discordRaw = mentionedUser.username;
    } else if (discordRaw.startsWith('@')) {
        discordRaw = discordRaw.substring(1);
    }

    return { beamUsername, discordRaw, discordId };
}

async function silentHistorySync() {
    try {
        const channel = await client.channels.fetch(CHECKPOINTS_CHANNEL_ID);
        if (!channel) {
            console.error('[Sync ERROR] Could not find #checkpoints channel!');
            return;
        }

        console.log('[Sync] Scanning #checkpoints history...');
        const messages = await channel.messages.fetch({ limit: 100 });
        let count = 0;

        for (const [, msg] of messages) {
            const parsed = parseLogMessage(msg.content, msg.mentions);
            if (parsed) {
                store.linkDiscord(parsed.beamUsername, parsed.discordId, parsed.discordRaw);
                count++;
            }
        }
        console.log(`[Sync] Initial scan complete. Linked ${count} player identities.`);
    } catch (err) {
        console.error('[Sync ERROR] History scan failed:', err.message);
    }
}

client.on('ready', () => {
    console.log(`[Bot Online] Logged in as ${client.user.tag}`);
    silentHistorySync();
    startApiServer();
});

client.on('messageCreate', (message) => {
    if (message.channelId !== CHECKPOINTS_CHANNEL_ID) return;
    const parsed = parseLogMessage(message.content, message.mentions);
    if (parsed) {
        store.linkDiscord(parsed.beamUsername, parsed.discordId, parsed.discordRaw);
        console.log(`[Sync] Linked ${parsed.beamUsername} -> ${parsed.discordRaw}`);
    }
});

// ---------------------------------------------------------------------------
// Slash commands
// ---------------------------------------------------------------------------

// Resolves a target beammp username from either a discord user option or a
// raw beammp_username string option (at least one must be provided).
function resolveBeamUsername(interaction) {
    const discordUser = interaction.options.getUser('discord_user');
    const rawUsername = interaction.options.getString('beam_username');

    if (rawUsername) {
        return store.normalizeBeamUsername(rawUsername);
    }
    if (discordUser) {
        return store.findBeamUsernameByDiscordId(discordUser.id);
    }
    return null;
}

client.on('interactionCreate', async (interaction) => {
    if (!interaction.isChatInputCommand()) return;

    try {
        if (interaction.commandName === 'assign' || interaction.commandName === 'unassign') {
            const vehicle = interaction.options.getString('vehicle', true);
            const beamUsername = resolveBeamUsername(interaction);

            if (!beamUsername) {
                await interaction.reply({
                    content: '❌ Could not resolve a BeamMP username. Provide `beam_username` directly, or `discord_user` for someone already linked via #checkpoints.',
                    ephemeral: true,
                });
                return;
            }

            if (interaction.commandName === 'assign') {
                store.assignVehicle(beamUsername, vehicle);
                await interaction.reply(`✅ Assigned **${vehicle}** to **${beamUsername}**.`);
            } else {
                store.unassignVehicle(beamUsername, vehicle);
                await interaction.reply(`🗑️ Unassigned **${vehicle}** from **${beamUsername}**.`);
            }
            return;
        }

        if (interaction.commandName === 'vehicles') {
            const beamUsername = resolveBeamUsername(interaction);
            if (!beamUsername) {
                await interaction.reply({ content: '❌ Could not resolve a BeamMP username.', ephemeral: true });
                return;
            }
            const player = store.getPlayer(beamUsername);
            const vehicles = player && player.vehicles.length ? player.vehicles.join(', ') : '(none assigned)';
            await interaction.reply(`🚗 **${beamUsername}**: ${vehicles}`);
            return;
        }

        if (interaction.commandName === 'whois') {
            const beamUsername = store.normalizeBeamUsername(interaction.options.getString('beam_username', true));
            const player = store.getPlayer(beamUsername);
            if (!player || !player.discord_id) {
                await interaction.reply(`❓ No linked Discord user found for **${beamUsername}**.`);
                return;
            }
            await interaction.reply(`🔗 **${beamUsername}** is linked to <@${player.discord_id}> (${player.discord_username}).`);
            return;
        }

        if (interaction.commandName === 'link') {
            const discordUser = interaction.options.getUser('discord_user', true);
            const beamUsername = interaction.options.getString('beam_username', true);
            store.linkDiscord(beamUsername, discordUser.id, discordUser.username);
            await interaction.reply(`🔗 Linked **${store.normalizeBeamUsername(beamUsername)}** to <@${discordUser.id}>.`);
            return;
        }
    } catch (err) {
        console.error('[Command ERROR]', err);
        if (interaction.isRepliable() && !interaction.replied) {
            await interaction.reply({ content: '⚠️ Something went wrong running that command.', ephemeral: true });
        }
    }
});

// ---------------------------------------------------------------------------
// Local HTTP API — polled by the BeamMP Lua plugin.
// ---------------------------------------------------------------------------
function startApiServer() {
    const app = express();

    app.get('/health', (req, res) => {
        res.status(200).send('OK');
    });

    app.get('/getUser', (req, res) => {
        const beamUsername = req.query.beammp_username;
        if (!beamUsername) {
            res.status(400).json({ error: 'missing beammp_username' });
            return;
        }
        const player = store.getPlayer(beamUsername);
        if (!player) {
            res.json({ discord_id: null, vehicles: [] });
            return;
        }
        res.json(player);
    });

    app.listen(API_PORT, '0.0.0.0', () => {
        console.log(`[API] Listening on 0.0.0.0:${API_PORT} (for the BeamMP plugin)`);
    });
}

client.login(DISCORD_TOKEN);
