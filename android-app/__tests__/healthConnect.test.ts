import { readRecentDays } from '../src/services/healthConnect';

const mockHC = require('react-native-health-connect');

beforeEach(() => jest.clearAllMocks());

it('returns one payload per requested day with a local date', async () => {
  mockHC.initialize.mockResolvedValue(true);
  mockHC.readRecords.mockResolvedValue({ records: [] });
  const result = await readRecentDays(2);
  expect(result).toHaveLength(2);
  expect(result[0].date).toMatch(/^\d{4}-\d{2}-\d{2}$/);
  // oldest day first
  expect(result[0].date < result[1].date).toBe(true);
  expect(result[1].weight_kg).toBeUndefined();
  expect(result[1].steps).toBeUndefined();
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
  const [today] = await readRecentDays(1);
  expect(today.weight_kg).toBe(80.5);
});

it('sums steps within a single day from Steps records', async () => {
  mockHC.initialize.mockResolvedValue(true);
  mockHC.readRecords.mockImplementation((type: string) => {
    if (type === 'Steps') {
      return Promise.resolve({
        records: [{ count: 5000 }, { count: 3000 }],
      });
    }
    return Promise.resolve({ records: [] });
  });
  const [today] = await readRecentDays(1);
  expect(today.steps).toBe(8000);
});
