// Adds / removes a template room in the "create a room" menu.
//   cd <the server folder>
//   node add-baseroom.js <Name> <scene guid> [maxPlayers] [blobName]     e.g.  node add-baseroom.js OpenWorld 12345678-aaaa-bbbb-cccc-1234567890ab 20
//   node add-baseroom.js remove <Name>
//   node add-baseroom.js list
// The server picks the change up by itself (no restart). The scene guid is the room's "UnitySceneId": open that room in the
// game with the server running and look for  GET /rooms/<id>  in the log, or open roomdata/room/<id>.json and copy it from SubRooms.
const fs = require("fs"), path = require("path");
const F = path.join(process.cwd(), "data", "base-rooms.json");
let L = []; try { L = JSON.parse(fs.readFileSync(F, "utf8")); } catch {}
const [, , a, b, c, d] = process.argv;
const save = () => { fs.mkdirSync(path.dirname(F), { recursive: true }); fs.writeFileSync(F, JSON.stringify(L, null, 2)); };
if (!a || a === "list") { console.log(L.length ? L.map((x) => `${x.name}  ${x.scene}  max ${x.maxPlayers || 20}`).join("\n") : "No extra template rooms yet."); process.exit(0); }
if (a === "remove") { const n = L.length; L = L.filter((x) => String(x.name).toLowerCase() !== String(b).toLowerCase()); save(); console.log(n === L.length ? "No such template." : "Removed. It leaves the menu on the next open."); process.exit(0); }
if (!/^[A-Za-z0-9_]{1,32}$/.test(a) || !/^[0-9a-fA-F-]{36}$/.test(b || "")) { console.log("usage: node add-baseroom.js <Name (letters, numbers, _)> <scene guid> [maxPlayers] [blobName]"); process.exit(2); }
L = L.filter((x) => String(x.name).toLowerCase() !== a.toLowerCase());
L.push({ name: a, scene: b.toLowerCase(), replication: a, maxPlayers: Number(c) || 20, blob: d || "" }); save();
console.log(`Template "${a}" saved. Open the room-creation menu again to see it.`);