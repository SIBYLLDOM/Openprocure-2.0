const fs = require('fs');

const filePath = 'Frontend/src/pages/Workdesk/Workspaces.jsx';
let content = fs.readFileSync(filePath, 'utf8');

// Find the exact string to replace by searching for the unique marker
const searchStr = '<Users size={12} /> Assigned IDs: {task.assigned_users.join(\', \')}';
const idx = content.indexOf(searchStr);

if (idx === -1) {
    console.log('Marker not found!');
    process.exit(1);
}

// Find the start of this block (3 lines before marker)
let blockStart = idx;
// Go back 3 newlines to find start of the block
for (let i = 0; i < 3; i++) {
    blockStart = content.lastIndexOf('\n', blockStart - 1);
}
blockStart++; // after the \n

// Find the end of block (2 lines after marker)
let blockEnd = idx;
for (let i = 0; i < 3; i++) {
    blockEnd = content.indexOf('\n', blockEnd + 1);
}
blockEnd++; // include the newline

const oldBlock = content.substring(blockStart, blockEnd);
console.log('Old block:');
console.log(JSON.stringify(oldBlock));

const leading = ' '.repeat(28); // count from debug: 28 spaces
const newBlock = `${leading}{task.assigned_users && typeof task.assigned_users === 'object' && task.assigned_users.length > 0 && (\r\n${leading}               <div style={{ display: 'flex', alignItems: 'center', gap: '0.35rem', flexWrap: 'wrap', marginTop: '0.5rem' }}>\r\n${leading}                 <Users size={12} style={{ color: '#6d28d9', flexShrink: 0 }} />\r\n${leading}                 <span style={{ fontSize: '0.75rem', color: '#374151', fontWeight: 600 }}>Assigned:</span>\r\n${leading}                 {task.assigned_users.map((uid) => {\r\n${leading}                   const user = deptUsers.find(u => u.id === uid);\r\n${leading}                   return (\r\n${leading}                     <span key={uid} style={{ background: '#ede9fe', color: '#6d28d9', padding: '0.1rem 0.45rem', borderRadius: '999px', fontSize: '0.7rem', fontWeight: 500 }}>\r\n${leading}                       {user ? user.name : \`User #\${uid}\`}\r\n${leading}                     </span>\r\n${leading}                   );\r\n${leading}                 })}\r\n${leading}               </div>\r\n${leading}            )}\r\n`;

const patched = content.substring(0, blockStart) + newBlock + content.substring(blockEnd);
fs.writeFileSync(filePath, patched, 'utf8');
console.log('Patched!');
