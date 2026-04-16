import { MockAdapter } from '../src/adapters/mock';
import { runAdapterContract } from './adapter-contract';

runAdapterContract('MockAdapter', () => new MockAdapter());
