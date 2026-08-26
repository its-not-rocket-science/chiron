import { scienceFixtures } from './science/scienceFixtures';
import { historyFixtures } from './history/historyFixtures';
import { injectionFixtures } from './injection/injectionFixtures';
import { pairedContrasts } from './pairedContrasts';

export * from './calibrationFixture';
export { pairedContrasts };

export const allFixtures = [...scienceFixtures, ...historyFixtures];
export { scienceFixtures, historyFixtures, injectionFixtures };
