import { join } from 'node:path';
import { encrypt, decrypt } from '../crypto';
import { RuntimeStore } from './store';

let instance: RuntimeStore | undefined;
export function runtimeStore(): RuntimeStore {
	if (!instance) {
		instance = new RuntimeStore(join('data', 'runtime.sqlite'), { encrypt, decrypt });
		instance.recover();
	}
	return instance;
}
