const fs = require('node:fs');
const path = require('node:path');

class Store {
  constructor(directory) {
    this.directory = directory;
    this.file = path.join(directory, 'state.json');
    this.backup = path.join(directory, 'state.backup.json');
  }
  load() {
    let warning = '';
    for (const file of [this.file, this.backup]) {
      try {
        const data = JSON.parse(fs.readFileSync(file, 'utf8'));
        if (!data || typeof data !== 'object' || Array.isArray(data)) throw new Error('Invalid saved state');
        return { data, warning };
      } catch (error) {
        if (error.code === 'ENOENT') continue;
        warning = '上次的資料無法讀取，已嘗試恢復備份。';
        try { fs.copyFileSync(file, path.join(this.directory, `state.corrupt-${Date.now()}-${path.basename(file)}`)); } catch { /* Keep original file if preservation cannot be written. */ }
      }
    }
    return { data: {}, warning };
  }
  save(data) {
    fs.mkdirSync(this.directory, { recursive: true });
    const temporary = `${this.file}.tmp`;
    fs.writeFileSync(temporary, JSON.stringify(data, null, 2), 'utf8');
    if (fs.existsSync(this.file)) {
      let valid = false;
      try { const old = JSON.parse(fs.readFileSync(this.file, 'utf8')); valid = old && typeof old === 'object' && !Array.isArray(old); } catch { /* Never replace a healthy backup with corrupt content. */ }
      if (valid) fs.copyFileSync(this.file, this.backup);
    }
    fs.renameSync(temporary, this.file);
  }
}
module.exports = { Store };
