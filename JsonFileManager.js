// @flow
const fs = require('mz/fs');
const AsyncLock = require('async-lock');


export type JsonFileManager = {
  load: () => Promise<Object>,
  save: (Object) => Promise<Object>,
};

const lock = new AsyncLock();

function jsonFileManager(name: string, defaultValue: Object) {
  this.path = `./${name}.json`;
  this.defaultValue = defaultValue;
}

jsonFileManager.prototype.load = async function load(): Object {
  return await lock.acquire(this.path, async () => {
    try {
      const body = await fs.readFile(this.path);
      return JSON.parse(body);
    } catch (err) {
      if (err.code !== 'ENOENT') {
        throw new Error(`Could not read file at ${this.path}: ${err.toString()}`);
      }
      console.log('Error reading file at ', this.path, err);
    }

    try {
      await fs.writeFile(this.path, JSON.stringify(this.defaultValue));
    } catch (err) {
      throw new Error(`Could not write default value to ${this.path}: ${err.toString()}`)
    }

    return this.defaultValue;
  });
};

jsonFileManager.prototype.save = async function save(value: Object): Object {
  return await lock.acquire(this.path, async () => {
    try {
      return await fs.writeFile(this.path, JSON.stringify(value));
    } catch (err) {
      throw new Error(`Could not save to ${this.path}: ${err.toString()}`)
    }
  });
};

exports.jsonFileManager = jsonFileManager;
