import { readYesterdayData } from '../src/services/healthConnect';

const mockHC = require('react-native-health-connect');

beforeEach(() => jest.clearAllMocks());

it('returns empty payload when no health data', async () => {
  mockHC.initialize.mockResolvedValue(true);
  mockHC.readRecords.mockResolvedValue({ records: [] });
  const result = await readYesterdayData();
  expect(result.date).toMatch(/^\d{4}-\d{2}-\d{2}$/);
  expect(result.weight_kg).toBeUndefined();
  expect(result.steps).toBeUndefined();
});

it('extracts weight from Weight records', async () => {
  mockHC.initialize.mockResolvedValue(true);
  mockHC.readRecords.mockImplementation((type: string) => {
    if (type === 'Weight') {
      return Promise.resolve({
        records: [{ weight: { inKilograms: 80.5 } }],
      });
    }
    return Promise.resolve({ records: [] });
  });
  const result = await readYesterdayData();
  expect(result.weight_kg).toBe(80.5);
});

it('sums steps from Steps records', async () => {
  mockHC.initialize.mockResolvedValue(true);
  mockHC.readRecords.mockImplementation((type: string) => {
    if (type === 'Steps') {
      return Promise.resolve({
        records: [{ count: 5000 }, { count: 3000 }],
      });
    }
    return Promise.resolve({ records: [] });
  });
  const result = await readYesterdayData();
  expect(result.steps).toBe(8000);
});
