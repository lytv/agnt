
import sqlite3 from 'sqlite3';
import path from 'path';

const dbPath = '/Users/mac/Library/Application Support/AGNT/Data/agnt.db';

const db = new sqlite3.Database(dbPath);

db.all("SELECT id, name, assignedSkills FROM agents", (err, rows) => {
    if (err) {
        console.error(err);
    } else {
        console.log('Agents in DB:');
        rows.forEach(row => {
            console.log(`ID: ${row.id}, Name: ${row.name}, Skills: ${row.assignedSkills}`);
        });
    }
    db.close();
});
