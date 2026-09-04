const fs = require('fs');
const path = require('path');

const DATA_FILE = path.join(__dirname, 'data.json');

function loadData() {
    if (!fs.existsSync(DATA_FILE)) {
        fs.writeFileSync(DATA_FILE, JSON.stringify({}, null, 2));
    }
    try {
        return JSON.parse(fs.readFileSync(DATA_FILE, 'utf8'));
    } catch (err) {
        console.error('[Store] Failed to read data.json, starting fresh:', err.message);
        return {};
    }
}

function saveData(data) {
    fs.writeFileSync(DATA_FILE, JSON.stringify(data, null, 2));
}

function normalizeBeamUsername(name) {
    return (name || '').trim().toLowerCase();
}

function getPlayer(beamUsername) {
    const data = loadData();
    const key = normalizeBeamUsername(beamUsername);
    return data[key] || null;
}

// Links a discord user to a beammp username (created via #checkpoints scan or /link)
function linkDiscord(beamUsername, discordId, discordUsername) {
    const data = loadData();
    const key = normalizeBeamUsername(beamUsername);
    if (!data[key]) {
        data[key] = { discord_id: null, discord_username: null, vehicles: [] };
    }
    data[key].discord_id = discordId || data[key].discord_id;
    data[key].discord_username = discordUsername || data[key].discord_username;
    saveData(data);
    return data[key];
}

// Finds the most recently linked beammp username for a given discord id.
// If a discord user reconnects under a new guest name, the newest link wins.
function findBeamUsernameByDiscordId(discordId) {
    const data = loadData();
    let found = null;
    for (const [beamUsername, entry] of Object.entries(data)) {
        if (entry.discord_id === discordId) {
            found = beamUsername; // last match in insertion order = most recent
        }
    }
    return found;
}

function assignVehicle(beamUsername, vehicle) {
    const data = loadData();
    const key = normalizeBeamUsername(beamUsername);
    const model = (vehicle || '').trim().toLowerCase();
    if (!data[key]) {
        data[key] = { discord_id: null, discord_username: null, vehicles: [] };
    }
    if (!data[key].vehicles.includes(model)) {
        data[key].vehicles.push(model);
    }
    saveData(data);
    return data[key];
}

function unassignVehicle(beamUsername, vehicle) {
    const data = loadData();
    const key = normalizeBeamUsername(beamUsername);
    const model = (vehicle || '').trim().toLowerCase();
    if (!data[key]) return null;
    data[key].vehicles = data[key].vehicles.filter(v => v !== model);
    saveData(data);
    return data[key];
}

module.exports = {
    normalizeBeamUsername,
    getPlayer,
    linkDiscord,
    findBeamUsernameByDiscordId,
    assignVehicle,
    unassignVehicle,
};
