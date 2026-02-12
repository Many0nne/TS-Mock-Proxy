import * as intermock from 'intermock';
import * as fs from 'fs';
import { MockGenerationOptions } from '../types/config';

/**
 * Generates mock data from a TypeScript interface
 *
 * @param filePath - Path to the file containing the interface
 * @param interfaceName - Name of the interface to mock
 * @param options - Generation options
 * @returns Mocked JSON object
 */
export function generateMockFromInterface(
  filePath: string,
  interfaceName: string,
  _options: MockGenerationOptions = {}
): Record<string, unknown> {
  try {
    // Read the TypeScript file content
    const fileContent = fs.readFileSync(filePath, 'utf-8');

    // Use Intermock to generate the mock
    // Disable isFixedMode to have truly random data
    const output = intermock.mock({
      language: 'typescript',
      files: [[filePath, fileContent]],
      interfaces: [interfaceName],
      isFixedMode: false, // Always false to have variations
    });

    // Intermock returns an object with the interface name as key
    const mockData = output[interfaceName as keyof typeof output];

    if (!mockData) {
      throw new Error(`Interface "${interfaceName}" not found in file ${filePath}`);
    }

    return mockData as Record<string, unknown>;
  } catch (error) {
    throw new Error(
      `Failed to generate mock for ${interfaceName}: ${error instanceof Error ? error.message : String(error)}`
    );
  }
}

/**
 * Generates an array of mock data
 *
 * @param filePath - Path to the file containing the interface
 * @param interfaceName - Name of the interface to mock
 * @param options - Generation options
 * @returns Array of mocked JSON objects
 */
export function generateMockArray(
  filePath: string,
  interfaceName: string,
  options: MockGenerationOptions = {}
): Record<string, unknown>[] {
  const length = options.arrayLength ?? getRandomArrayLength();
  const items: Record<string, unknown>[] = [];

  for (let i = 0; i < length; i++) {
    // Generate each element independently
    // Each call to generateMockFromInterface produces different data
    const item = generateMockFromInterface(filePath, interfaceName, options);
    items.push(item);
  }

  return items;
}

/**
 * Generates a random length for an array (between 3 and 10)
 */
function getRandomArrayLength(): number {
  return Math.floor(Math.random() * 8) + 3; // 3 to 10
}
