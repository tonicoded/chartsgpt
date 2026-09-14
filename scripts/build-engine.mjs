import { spawnSync } from 'node:child_process';
import { mkdirSync, readFileSync, existsSync, writeFileSync } from 'node:fs';
import { createHash } from 'node:crypto';
import { resolve } from 'node:path';

const source = resolve('native/engine');
const output = resolve('.engine');
mkdirSync(output, { recursive: true });
const files = ['Models.swift', 'MarketAnalysisEngine.swift', 'SetupEdgeModel.swift', 'MarketContextSignals.swift', 'SetupQualityScorer.swift', 'HigherTimeframeAlignment.swift', 'main.swift'];
const hash = createHash('sha256').update(files.map(f => readFileSync(`${source}/${f}`)).join('')).digest('hex');
if (existsSync(`${output}/chartsgpt-engine`) && existsSync(`${output}/hash`) && readFileSync(`${output}/hash`, 'utf8') === hash) process.exit(0);
console.log('Building the ChartsGPT iOS analysis engine…');
const result = spawnSync('swiftc', ['-O', '-module-cache-path', `${output}/module-cache`, '-o', `${output}/chartsgpt-engine`, ...files.map(f => `${source}/${f}`)], { stdio: 'inherit' });
if (result.error) console.error(result.error.message);
if (result.status !== 0) process.exit(result.status ?? 1);
writeFileSync(`${output}/hash`, hash);
